use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex, MutexGuard};

use edapex_store::{MasterKey, Result as StoreResult, RusqliteDriver, Store, StoreError};
use infinity_agent_core::stores::InMemoryStoreError;

pub type SharedNativeStore = Arc<Mutex<Store<RusqliteDriver>>>;

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

#[derive(Clone)]
pub struct StoreContext {
    pub store: SharedNativeStore,
    pub workspace_id: Arc<str>,
    poisoned: Arc<AtomicBool>,
    thread_roots: Arc<Mutex<std::collections::HashMap<String, String>>>,
}

pub struct DurableAgentStores {
    pub conversation: crate::durable_conversation::DurableConversationStore,
    pub state: crate::durable_state::DurableStateStore,
}

impl StoreContext {
    pub fn new(store: Store<RusqliteDriver>, workspace_id: &str) -> Self {
        Self {
            store: Arc::new(Mutex::new(store)),
            workspace_id: Arc::from(workspace_id),
            poisoned: Arc::new(AtomicBool::new(false)),
            thread_roots: Arc::new(Mutex::new(std::collections::HashMap::new())),
        }
    }

    pub fn open(path: &str, workspace_id: &str, master: MasterKey) -> StoreResult<Self> {
        let driver = RusqliteDriver::open(path)?;
        let mut store = Store::new(driver, master);
        store.migrate()?;
        Ok(Self::new(store, workspace_id))
    }

    pub fn check(&self) -> Result<(), DurableStoreError> {
        if self.poisoned.load(Ordering::Acquire) {
            return Err(DurableStoreError::Poisoned);
        }
        Ok(())
    }

    pub fn lock(&self) -> Result<MutexGuard<'_, Store<RusqliteDriver>>, DurableStoreError> {
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

impl DurableAgentStores {
    pub fn from_store(store: Store<RusqliteDriver>, workspace_id: &str) -> Self {
        let context = StoreContext::new(store, workspace_id);
        Self::from_context(context)
    }

    pub fn from_context(context: StoreContext) -> Self {
        Self {
            conversation: crate::durable_conversation::DurableConversationStore::new(
                context.clone(),
            ),
            state: crate::durable_state::DurableStateStore::new(context),
        }
    }
}
