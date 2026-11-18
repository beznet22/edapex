use std::collections::{HashMap, HashSet};
use std::sync::{Arc, Mutex};

use async_trait::async_trait;
use edapex_store::thread_snapshots::ThreadSnapshotKind;
use infinity_agent_core::stores::{InMemoryStateStore, ThreadState};
use infinity_agent_core::system::UserChoice;
use infinity_agent_core::traits::StateStore;
use rap_protocol::{ChoiceId, ThreadId, ToolCallId};
use serde::{Deserialize, Serialize};

use crate::durable_store::{DurableStoreError, StoreContext};

type Result<T> = std::result::Result<T, DurableStoreError>;

#[derive(Default, Serialize, Deserialize)]
struct StateSnapshot {
    state: ThreadState,
    stopped: bool,
}

pub struct DurableStateStore<D = edapex_store::RusqliteDriver>
where
    D: edapex_store::SqlDriver,
{
    context: StoreContext<D>,
    inner: InMemoryStateStore,
    loaded: Arc<Mutex<HashSet<String>>>,
    stopped: Arc<Mutex<HashMap<String, bool>>>,
}

impl<D> Clone for DurableStateStore<D>
where
    D: edapex_store::SqlDriver,
{
    fn clone(&self) -> Self {
        Self {
            context: self.context.clone(),
            inner: self.inner.clone(),
            loaded: Arc::clone(&self.loaded),
            stopped: Arc::clone(&self.stopped),
        }
    }
}

impl<D: edapex_store::SqlDriver> DurableStateStore<D> {
    pub fn new(context: StoreContext<D>) -> Self {
        Self {
            context,
            inner: InMemoryStateStore::new(),
            loaded: Arc::new(Mutex::new(HashSet::new())),
            stopped: Arc::new(Mutex::new(HashMap::new())),
        }
    }

    fn load(&self, thread_id: &ThreadId<str>) -> Result<()> {
        self.context.check()?;
        {
            let loaded = self.loaded.lock().map_err(|_| DurableStoreError::Lock)?;
            if loaded.contains(thread_id.as_str()) {
                return Ok(());
            }
        }
        let snapshot = self
            .context
            .lock()?
            .read_thread_snapshot(thread_id.as_str(), ThreadSnapshotKind::State)?;
        let stopped = snapshot
            .map(|snapshot| serde_json::from_slice::<StateSnapshot>(&snapshot.payload))
            .transpose()?
            .unwrap_or_default();
        self.inner.set_thread_state(thread_id, stopped.state);
        self.stopped
            .lock()
            .map_err(|_| DurableStoreError::Lock)?
            .insert(thread_id.to_string(), stopped.stopped);
        self.loaded
            .lock()
            .map_err(|_| DurableStoreError::Lock)?
            .insert(thread_id.to_string());
        Ok(())
    }

    fn persist_with_stopped(&self, thread_id: &ThreadId<str>, stopped: bool) -> Result<()> {
        self.context.check()?;
        let snapshot = StateSnapshot {
            state: self.inner.thread_state(thread_id),
            stopped,
        };
        let payload = serde_json::to_vec(&snapshot)?;
        self.context
            .lock()?
            .write_thread_snapshot(
                &self.context.workspace_id,
                thread_id.as_str(),
                &self.context.thread_root(thread_id.as_str()),
                ThreadSnapshotKind::State,
                &payload,
            )
            .map_err(|error| {
                self.context
                    .poison::<()>(error.into())
                    .expect_err("poison returns Err")
            })?;
        self.stopped
            .lock()
            .map_err(|_| DurableStoreError::Lock)?
            .insert(thread_id.to_string(), stopped);
        Ok(())
    }

    fn persist(&self, thread_id: &ThreadId<str>) -> Result<()> {
        let stopped = self
            .stopped
            .lock()
            .map_err(|_| DurableStoreError::Lock)?
            .get(thread_id.as_str())
            .copied()
            .unwrap_or(false);
        self.persist_with_stopped(thread_id, stopped)
    }

    pub fn set_thread_stopped(&self, thread_id: &ThreadId<str>, stopped: bool) -> Result<()> {
        self.load(thread_id)?;
        self.persist_with_stopped(thread_id, stopped)
    }
}

#[async_trait]
impl<D> StateStore for DurableStateStore<D>
where
    D: edapex_store::SqlDriver + Send + 'static,
{
    type Error = DurableStoreError;

    async fn get_processed_ids(&self, thread_id: &ThreadId<str>) -> Result<HashSet<String>> {
        self.load(thread_id)?;
        self.inner
            .get_processed_ids(thread_id)
            .await
            .map_err(Into::into)
    }

    async fn add_processed_message_ids(
        &self,
        thread_id: &ThreadId<str>,
        message_ids: Vec<String>,
    ) -> Result<()> {
        self.load(thread_id)?;
        self.inner
            .add_processed_message_ids(thread_id, message_ids)
            .await?;
        self.persist(thread_id)
    }

    async fn get_metadata(
        &self,
        root_thread_id: &ThreadId<str>,
    ) -> Result<Option<serde_json::Value>> {
        self.load(root_thread_id)?;
        self.inner
            .get_metadata(root_thread_id)
            .await
            .map_err(Into::into)
    }

    async fn set_metadata(
        &self,
        root_thread_id: &ThreadId<str>,
        metadata: serde_json::Value,
    ) -> Result<()> {
        self.load(root_thread_id)?;
        self.inner.set_metadata(root_thread_id, metadata).await?;
        self.persist(root_thread_id)
    }

    async fn get_active_subscriptions(&self, thread_id: &ThreadId<str>) -> Result<Vec<ToolCallId>> {
        self.load(thread_id)?;
        self.inner
            .get_active_subscriptions(thread_id)
            .await
            .map_err(Into::into)
    }

    async fn add_active_subscription(
        &self,
        thread_id: &ThreadId<str>,
        tool_call_id: &ToolCallId<str>,
    ) -> Result<()> {
        self.load(thread_id)?;
        self.inner
            .add_active_subscription(thread_id, tool_call_id)
            .await?;
        self.persist(thread_id)
    }

    async fn remove_active_subscription(
        &self,
        thread_id: &ThreadId<str>,
        tool_call_id: &ToolCallId<str>,
    ) -> Result<()> {
        self.load(thread_id)?;
        self.inner
            .remove_active_subscription(thread_id, tool_call_id)
            .await?;
        self.persist(thread_id)
    }

    async fn add_pending_user_choice(
        &self,
        thread_id: &ThreadId<str>,
        choice: UserChoice,
    ) -> Result<()> {
        self.load(thread_id)?;
        self.inner
            .add_pending_user_choice(thread_id, choice)
            .await?;
        self.persist(thread_id)
    }

    async fn remove_pending_user_choice(
        &self,
        thread_id: &ThreadId<str>,
        choice_id: &ChoiceId<str>,
    ) -> Result<()> {
        self.load(thread_id)?;
        self.inner
            .remove_pending_user_choice(thread_id, choice_id)
            .await?;
        self.persist(thread_id)
    }

    async fn get_pending_user_choices(&self, thread_id: &ThreadId<str>) -> Result<Vec<UserChoice>> {
        self.load(thread_id)?;
        self.inner
            .get_pending_user_choices(thread_id)
            .await
            .map_err(Into::into)
    }

    async fn is_thread_stopped(&self, thread_id: &ThreadId<str>) -> Result<bool> {
        self.load(thread_id)?;
        self.inner.is_thread_stopped(thread_id).await?;
        Ok(self
            .stopped
            .lock()
            .map_err(|_| DurableStoreError::Lock)?
            .get(thread_id.as_str())
            .copied()
            .unwrap_or(false))
    }
}
