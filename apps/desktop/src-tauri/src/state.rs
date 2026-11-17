use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::{Arc, Mutex};

use serde::Serialize;

use crate::agent::AgentSession;
use crate::capture::CaptureRecord;

#[derive(Debug, Clone, Serialize)]
pub struct HostError {
    pub code: String,
    pub message: String,
    pub retryable: bool,
}

impl HostError {
    pub fn new(code: &str, message: impl Into<String>, retryable: bool) -> Self {
        Self {
            code: code.to_string(),
            message: message.into(),
            retryable,
        }
    }

    #[allow(dead_code)]
    pub fn unsupported(message: impl Into<String>) -> Self {
        Self::new("unsupported_capability", message, false)
    }

    pub fn auth_required() -> Self {
        Self::new("auth_required", "Sign in to EdApex first", false)
    }
}

#[derive(Debug)]
pub struct PendingAuth {
    pub verifier: String,
}

/// The captures taken in this process, keyed by the id a tool call names.
///
/// An `Arc` rather than a field, so the agent's tool executor can resolve a
/// capture id without holding the Tauri state it happens to arrive through.
#[derive(Default)]
pub struct CaptureStore {
    records: Mutex<HashMap<String, CaptureRecord>>,
}

impl CaptureStore {
    pub fn insert(&self, id: String, record: CaptureRecord) -> Result<(), HostError> {
        let mut records = self
            .records
            .lock()
            .map_err(|_| HostError::new("internal_error", "Capture store is unavailable", true))?;
        records.insert(id, record);
        Ok(())
    }

    pub fn path_of(&self, id: &str) -> Result<PathBuf, HostError> {
        let records = self
            .records
            .lock()
            .map_err(|_| HostError::new("internal_error", "Capture store is unavailable", true))?;
        records
            .get(id)
            .map(|record| record.path.clone())
            .ok_or_else(|| HostError::new("invalid_input", "Capture not found", false))
    }

    pub fn remove(&self, id: &str) -> Result<Option<CaptureRecord>, HostError> {
        let mut records = self
            .records
            .lock()
            .map_err(|_| HostError::new("internal_error", "Capture store is unavailable", true))?;
        Ok(records.remove(id))
    }
}

pub struct HostState {
    captures: Arc<CaptureStore>,
    pub pending_auth: Mutex<Option<PendingAuth>>,
    agent: Mutex<Option<AgentSession>>,
}

impl Default for HostState {
    fn default() -> Self {
        HostState {
            captures: Arc::new(CaptureStore::default()),
            pending_auth: Mutex::new(None),
            agent: Mutex::new(None),
        }
    }
}

impl HostState {
    pub fn captures(&self) -> Arc<CaptureStore> {
        self.captures.clone()
    }

    pub fn set_agent(&self, agent: AgentSession) -> Result<(), HostError> {
        let mut slot = self
            .agent
            .lock()
            .map_err(|_| HostError::new("internal_error", "Agent state is unavailable", true))?;
        *slot = Some(agent);
        Ok(())
    }

    pub fn agent(&self) -> Result<Option<AgentSession>, HostError> {
        self.agent
            .lock()
            .map(|slot| slot.clone())
            .map_err(|_| HostError::new("internal_error", "Agent state is unavailable", true))
    }

    pub fn take_agent(&self) -> Result<Option<AgentSession>, HostError> {
        self.agent
            .lock()
            .map(|mut slot| slot.take())
            .map_err(|_| HostError::new("internal_error", "Agent state is unavailable", true))
    }

    pub fn has_agent(&self) -> bool {
        self.agent
            .lock()
            .map(|slot| slot.is_some())
            .unwrap_or(false)
    }

    pub fn insert_capture(&self, id: String, record: CaptureRecord) -> Result<(), HostError> {
        self.captures.insert(id, record)
    }

    pub fn capture_path(&self, id: &str) -> Result<PathBuf, HostError> {
        self.captures.path_of(id)
    }

    pub fn remove_capture(&self, id: &str) -> Result<Option<CaptureRecord>, HostError> {
        self.captures.remove(id)
    }
}
