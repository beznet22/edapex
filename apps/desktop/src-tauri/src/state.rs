use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::Mutex;

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

#[derive(Default)]
pub struct HostState {
    captures: Mutex<HashMap<String, CaptureRecord>>,
    pub pending_auth: Mutex<Option<PendingAuth>>,
    agent: Mutex<Option<AgentSession>>,
}

impl HostState {
    pub fn set_agent(&self, agent: AgentSession) -> Result<(), HostError> {
        let mut slot = self
            .agent
            .lock()
            .map_err(|_| HostError::new("internal_error", "Agent state is unavailable", true))?;
        *slot = Some(agent);
        Ok(())
    }

    pub fn has_agent(&self) -> bool {
        self.agent
            .lock()
            .map(|slot| slot.is_some())
            .unwrap_or(false)
    }

    pub fn insert_capture(&self, id: String, record: CaptureRecord) -> Result<(), HostError> {
        let mut captures = self
            .captures
            .lock()
            .map_err(|_| HostError::new("internal_error", "Capture store is unavailable", true))?;
        captures.insert(id, record);
        Ok(())
    }

    pub fn capture_path(&self, id: &str) -> Result<PathBuf, HostError> {
        let captures = self
            .captures
            .lock()
            .map_err(|_| HostError::new("internal_error", "Capture store is unavailable", true))?;
        captures
            .get(id)
            .map(|record| record.path.clone())
            .ok_or_else(|| HostError::new("invalid_input", "Capture not found", false))
    }

    pub fn remove_capture(&self, id: &str) -> Result<Option<CaptureRecord>, HostError> {
        let mut captures = self
            .captures
            .lock()
            .map_err(|_| HostError::new("internal_error", "Capture store is unavailable", true))?;
        Ok(captures.remove(id))
    }
}
