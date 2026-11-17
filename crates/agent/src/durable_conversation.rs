use std::collections::HashSet;
use std::sync::{Arc, Mutex};

use async_trait::async_trait;
use edapex_store::thread_snapshots::ThreadSnapshotKind;
use edapex_store::StoreError;
use infinity_agent_core::message::InfinityMessage;
use infinity_agent_core::stores::{CompactionSummary, InMemoryConversationStore, ThreadInfo};
use infinity_agent_core::traits::{ConversationStore, SpawnContext};
use rap_protocol::{ThreadId, ToolCallId};
use serde::{Deserialize, Serialize};

use crate::durable_store::{DurableStoreError, StoreContext};

type Result<T> = std::result::Result<T, DurableStoreError>;

#[derive(Serialize, Deserialize)]
struct ConversationSnapshot {
    info: ThreadInfo,
    messages: Option<Vec<(InfinityMessage, String)>>,
    summaries: Vec<CompactionSummary>,
}

#[derive(Clone)]
pub struct DurableConversationStore {
    context: StoreContext,
    inner: InMemoryConversationStore,
    loaded: Arc<Mutex<HashSet<String>>>,
}

impl DurableConversationStore {
    pub fn new(context: StoreContext) -> Self {
        Self {
            context,
            inner: InMemoryConversationStore::new(),
            loaded: Arc::new(Mutex::new(HashSet::new())),
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
            .read_thread_snapshot(thread_id.as_str(), ThreadSnapshotKind::Conversation)?;
        if let Some(snapshot) = snapshot {
            let snapshot: ConversationSnapshot = serde_json::from_slice(&snapshot.payload)?;
            self.inner.set_thread_info(thread_id, snapshot.info);
            if let Some(messages) = snapshot.messages {
                self.inner.set_thread_messages(thread_id, messages);
            }
            self.inner
                .set_thread_compaction_summaries(thread_id, snapshot.summaries);
        }
        self.loaded
            .lock()
            .map_err(|_| DurableStoreError::Lock)?
            .insert(thread_id.to_string());
        Ok(())
    }

    fn persist(&self, thread_id: &ThreadId<str>) -> Result<()> {
        self.context.check()?;
        let info = self
            .inner
            .thread_info(thread_id)
            .ok_or(StoreError::NotFound)
            .map_err(DurableStoreError::Store)?;
        let root_thread_id = info.root_thread_id.clone();
        let snapshot = ConversationSnapshot {
            info,
            messages: self.inner.thread_messages(thread_id),
            summaries: self.inner.thread_compaction_summaries(thread_id),
        };
        self.context
            .register_thread_root(thread_id.as_str(), root_thread_id.as_str());
        let payload = serde_json::to_vec(&snapshot)?;
        self.context
            .lock()?
            .write_thread_snapshot(
                &self.context.workspace_id,
                thread_id.as_str(),
                root_thread_id.as_str(),
                ThreadSnapshotKind::Conversation,
                &payload,
            )
            .map_err(|error| {
                self.context
                    .poison::<()>(error.into())
                    .expect_err("poison returns Err")
            })?;
        Ok(())
    }
}

impl DurableConversationStore {
    pub fn latest_message_id(&self, thread_id: &ThreadId<str>) -> Option<String> {
        self.inner
            .thread_messages(thread_id)?
            .last()
            .map(|(_, dedup_id)| dedup_id.clone())
    }

    pub fn latest_tool_info(&self, thread_id: &ThreadId<str>) -> Option<(String, String)> {
        self.inner
            .thread_messages(thread_id)?
            .iter()
            .rev()
            .find_map(|(message, _)| match message {
                InfinityMessage::ToolCall { call, .. } => {
                    Some((call.id.clone(), call.function.name.clone()))
                }
                _ => None,
            })
    }

    pub fn latest_tool_call_id(&self, thread_id: &ThreadId<str>) -> Option<String> {
        self.latest_tool_info(thread_id).map(|(id, _)| id)
    }
}

#[async_trait]
impl ConversationStore for DurableConversationStore {
    type Error = DurableStoreError;

    async fn ensure_root_thread(&self, thread_id: &ThreadId<str>) -> Result<()> {
        self.load(thread_id)?;
        self.inner.ensure_root_thread(thread_id).await?;
        self.persist(thread_id)
    }

    async fn thread_exists(&self, thread_id: &ThreadId<str>) -> Result<bool> {
        self.load(thread_id)?;
        self.inner
            .thread_exists(thread_id)
            .await
            .map_err(Into::into)
    }

    async fn load_history_up_to(
        &self,
        session_id: &ThreadId<str>,
        start_from: Option<i64>,
        up_to: Option<i64>,
    ) -> Result<Vec<InfinityMessage>> {
        self.load(session_id)?;
        self.inner
            .load_history_up_to(session_id, start_from, up_to)
            .await
            .map_err(Into::into)
    }

    async fn append_messages(
        &self,
        session_id: &ThreadId<str>,
        messages: Vec<(InfinityMessage, String)>,
    ) -> Result<()> {
        self.load(session_id)?;
        self.inner.append_messages(session_id, messages).await?;
        self.persist(session_id)
    }

    async fn spawn_thread(
        &self,
        parent_thread_id: &ThreadId<str>,
        spawn_tool_call_id: &ToolCallId<str>,
        is_for_subscription_event: bool,
        context: SpawnContext,
    ) -> Result<ThreadId> {
        self.load(parent_thread_id)?;
        let child = self
            .inner
            .spawn_thread(
                parent_thread_id,
                spawn_tool_call_id,
                is_for_subscription_event,
                context,
            )
            .await?;
        self.persist(&child)?;
        Ok(child)
    }

    async fn is_thread_closed(&self, thread_id: &ThreadId<str>) -> Result<bool> {
        self.load(thread_id)?;
        self.inner
            .is_thread_closed(thread_id)
            .await
            .map_err(Into::into)
    }

    async fn close_thread(&self, thread_id: &ThreadId<str>) -> Result<()> {
        self.load(thread_id)?;
        self.inner.close_thread(thread_id).await?;
        self.persist(thread_id)
    }

    async fn is_subscription_event_thread(&self, thread_id: &ThreadId<str>) -> Result<bool> {
        self.load(thread_id)?;
        self.inner
            .is_subscription_event_thread(thread_id)
            .await
            .map_err(Into::into)
    }

    async fn is_fresh_context_thread(&self, thread_id: &ThreadId<str>) -> Result<bool> {
        self.load(thread_id)?;
        self.inner
            .is_fresh_context_thread(thread_id)
            .await
            .map_err(Into::into)
    }

    async fn get_thread_parent_info(
        &self,
        thread_id: &ThreadId<str>,
    ) -> Result<Option<(ThreadId, ToolCallId)>> {
        self.load(thread_id)?;
        self.inner
            .get_thread_parent_info(thread_id)
            .await
            .map_err(Into::into)
    }

    async fn get_ancestor_chain(&self, thread_id: &ThreadId<str>) -> Result<Vec<(ThreadId, i64)>> {
        self.load(thread_id)?;
        self.inner
            .get_ancestor_chain(thread_id)
            .await
            .map_err(Into::into)
    }

    async fn mark_thread_as_compaction(&self, thread_id: &ThreadId<str>) -> Result<()> {
        self.load(thread_id)?;
        self.inner.mark_thread_as_compaction(thread_id).await?;
        self.persist(thread_id)
    }

    async fn is_compaction_thread(&self, thread_id: &ThreadId<str>) -> Result<bool> {
        self.load(thread_id)?;
        self.inner
            .is_compaction_thread(thread_id)
            .await
            .map_err(Into::into)
    }

    async fn get_thread_spawn_order(&self, thread_id: &ThreadId<str>) -> Result<Option<i64>> {
        self.load(thread_id)?;
        self.inner
            .get_thread_spawn_order(thread_id)
            .await
            .map_err(Into::into)
    }

    async fn save_compaction_summary(
        &self,
        thread_id: &ThreadId<str>,
        summary: &str,
        up_to_order: i64,
    ) -> Result<()> {
        self.load(thread_id)?;
        self.inner
            .save_compaction_summary(thread_id, summary, up_to_order)
            .await?;
        self.persist(thread_id)
    }

    async fn load_latest_compaction_summary_up_to(
        &self,
        thread_id: &ThreadId<str>,
        up_to_order: Option<i64>,
    ) -> Result<Option<(String, i64)>> {
        self.load(thread_id)?;
        self.inner
            .load_latest_compaction_summary_up_to(thread_id, up_to_order)
            .await
            .map_err(Into::into)
    }
}
