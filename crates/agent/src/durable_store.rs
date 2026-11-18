use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex, MutexGuard};

use edapex_store::{MasterKey, Result as StoreResult, RusqliteDriver, Store, StoreError};
use infinity_agent_core::stores::InMemoryStoreError;

#[derive(Debug, thiserror::Error)]
pub enum DurableStoreError {
    #[error(transparent)]
    Store(#[from] StoreError),
    #[error(transparent)]
    Core(#[from] InMemoryStoreError),
    #[error("could not encode durable agent state: {0}")]
    Encode(#[from] serde_json::Error),
    #[error("the durable agent store is poisoned after a failed write")]
    Poisoned,
    #[error("the durable agent store lock is unavailable")]
    Lock,
}

impl DurableStoreError {
    pub fn agent_error_code(&self) -> crate::AgentErrorCode {
        match self {
            Self::Store(StoreError::Decrypt | StoreError::Serialisation(_)) | Self::Encode(_) => {
                crate::AgentErrorCode::StorageCorrupted
            }
            Self::Store(StoreError::LeaseLost) => crate::AgentErrorCode::LeaseLost,
            Self::Store(StoreError::SessionDeleted) => crate::AgentErrorCode::SessionDeleted,
            Self::Store(_) | Self::Core(_) | Self::Lock => {
                crate::AgentErrorCode::StorageUnavailable
            }
            Self::Poisoned => crate::AgentErrorCode::StorageUnavailable,
        }
    }
}

pub struct StoreContext<D = RusqliteDriver>
where
    D: edapex_store::SqlDriver,
{
    pub store: Arc<Mutex<Store<D>>>,
    pub workspace_id: Arc<str>,
    poisoned: Arc<AtomicBool>,
    thread_roots: Arc<Mutex<std::collections::HashMap<String, String>>>,
}

impl<D> Clone for StoreContext<D>
where
    D: edapex_store::SqlDriver,
{
    fn clone(&self) -> Self {
        Self {
            store: Arc::clone(&self.store),
            workspace_id: Arc::clone(&self.workspace_id),
            poisoned: Arc::clone(&self.poisoned),
            thread_roots: Arc::clone(&self.thread_roots),
        }
    }
}

pub struct DurableAgentStores<D = RusqliteDriver>
where
    D: edapex_store::SqlDriver,
{
    pub conversation: crate::durable_conversation::DurableConversationStore<D>,
    pub state: crate::durable_state::DurableStateStore<D>,
}

impl<D: edapex_store::SqlDriver> StoreContext<D> {
    pub fn new(store: Store<D>, workspace_id: &str) -> Self {
        Self {
            store: Arc::new(Mutex::new(store)),
            workspace_id: Arc::from(workspace_id),
            poisoned: Arc::new(AtomicBool::new(false)),
            thread_roots: Arc::new(Mutex::new(std::collections::HashMap::new())),
        }
    }

    pub fn check(&self) -> Result<(), DurableStoreError> {
        if self.poisoned.load(Ordering::Acquire) {
            return Err(DurableStoreError::Poisoned);
        }
        Ok(())
    }

    pub fn lock(&self) -> Result<MutexGuard<'_, Store<D>>, DurableStoreError> {
        self.check()?;
        self.store.lock().map_err(|_| DurableStoreError::Lock)
    }

    pub fn register_thread_root(&self, thread_id: &str, root_id: &str) {
        if let Ok(mut roots) = self.thread_roots.lock() {
            roots.insert(thread_id.to_string(), root_id.to_string());
        }
    }

    pub fn thread_root(&self, thread_id: &str) -> String {
        self.thread_roots
            .lock()
            .ok()
            .and_then(|roots| roots.get(thread_id).cloned())
            .unwrap_or_else(|| thread_id.to_string())
    }

    pub fn poison<T>(&self, error: DurableStoreError) -> Result<T, DurableStoreError> {
        self.poisoned.store(true, Ordering::Release);
        Err(error)
    }
}

impl StoreContext<RusqliteDriver> {
    /// Opens the native store, creating the application-data directory if needed.
    pub fn open(path: &str, workspace_id: &str, master: MasterKey) -> StoreResult<StoreContext> {
        if let Some(parent) = std::path::Path::new(path).parent() {
            if !parent.as_os_str().is_empty() {
                std::fs::create_dir_all(parent)
                    .map_err(|error| edapex_store::StoreError::Io(error.to_string()))?;
            }
        }
        let driver = RusqliteDriver::open(path)?;
        let mut store = Store::new(driver, master);
        store.migrate()?;
        Ok(StoreContext::new(store, workspace_id))
    }
}

impl<D: edapex_store::SqlDriver + 'static> DurableAgentStores<D> {
    pub fn from_store(store: Store<D>, workspace_id: &str) -> Self {
        let context = StoreContext::new(store, workspace_id);
        Self::from_context(context)
    }

    pub fn from_context(context: StoreContext<D>) -> Self {
        Self {
            conversation: crate::durable_conversation::DurableConversationStore::new(
                context.clone(),
            ),
            state: crate::durable_state::DurableStateStore::new(context),
        }
    }
}
