//! Durable browser transcript and command log in OPFS.
//!
//! The underlying schema and transaction rules are `edapex-store`'s, not a new
//! browser schema. Infinity's own model context remains in IndexedDB; this store
//! backs the UI projection and durable command queue sync can publish later.

use edapex_agent::projection::{ProjectionEvent, SessionProjection};
use edapex_agent::session_protocol::{SessionMessage, SessionQueueItem, SessionTruncation};
use edapex_agent::{AgentError, AgentErrorCode};
use edapex_store::session_events::{SessionAppendOutcome, SessionEventInput, SessionEventRecord};
use edapex_store::session_lease::SessionLease;
use edapex_store::{MasterKey, Store, StoreError};
use rap_protocol::ThreadId;
use uuid::Uuid;
use wasm_bindgen::prelude::*;

use crate::sql::JsSqlDriver;

#[wasm_bindgen]
pub struct BrowserSessionStore {
    store: Store<JsSqlDriver>,
    projection: SessionProjection,
    lease: SessionLease,
    root: ThreadId,
    device_id: String,
    client_id: String,
    workspace_id: String,
}

#[derive(serde::Deserialize)]
#[serde(rename_all = "camelCase")]
struct ConnectOptions {
    workspace_id: String,
    session_id: String,
    device_id: String,
    client_id: String,
    model: String,
}

#[wasm_bindgen]
impl BrowserSessionStore {
    /// The JavaScript OPFS driver has already been opened by the caller.
    #[wasm_bindgen(constructor)]
    pub fn new(driver: JsValue, master_key: &[u8], options: &str) -> Result<Self, JsValue> {
        let key: [u8; 32] = master_key
            .try_into()
            .map_err(|_| error(AgentError::invalid_input("The master key must be 32 bytes")))?;
        let options: ConnectOptions = serde_json::from_str(options)
            .map_err(|message| error(AgentError::invalid_input(message.to_string())))?;
        let mut store = Store::new(JsSqlDriver::new(driver), MasterKey::from_bytes(key));
        store.migrate().map_err(store_error)?;
        store
            .ensure_agent_session(
                &options.session_id,
                &options.workspace_id,
                &options.device_id,
                &options.model,
                false,
            )
            .map_err(store_error)?;
        let lease = store
            .claim_agent_session(&options.session_id, &options.client_id, 60_000, now_ms())
            .map_err(store_error)?;
        let held = lease.holder_id.as_deref() == Some(&options.client_id);
        let root = ThreadId::from(options.session_id);
        let mut projection =
            SessionProjection::new(root.as_str(), &options.device_id, &options.client_id);
        for record in store
            .agent_session_events(root.as_str(), 0, 5_000)
            .map_err(store_error)?
        {
            projection.replay_record(&record).map_err(|message| {
                error(AgentError::new(
                    AgentErrorCode::StorageCorrupted,
                    message.to_string(),
                    false,
                ))
            })?;
        }
        if !held {
            return Err(error(AgentError::new(
                AgentErrorCode::LeaseLost,
                "Another browser authority already owns this session",
                false,
            )));
        }
        Ok(Self {
            store,
            projection,
            lease,
            root,
            device_id: options.device_id,
            client_id: options.client_id,
            workspace_id: options.workspace_id,
        })
    }

    /// Queue durable input before it is offered to the Infinity driver.
    pub fn queue_message(
        &mut self,
        command_id: &str,
        dedup_id: &str,
        text: &str,
    ) -> Result<String, JsValue> {
        let event_id = Uuid::new_v4().to_string();
        let message = SessionMessage {
            event_id: event_id.clone(),
            message_id: dedup_id.to_string(),
            dedup_id: Some(dedup_id.to_string()),
            role: edapex_agent::SessionMessageRole::User,
            text: text.to_string(),
            versions: Vec::new(),
            reply_to: None,
        };
        let item = SessionQueueItem {
            event_id,
            command_id: command_id.to_string(),
            dedup_id: dedup_id.to_string(),
            text: text.to_string(),
            enqueued_at_ms: now_ms(),
        };
        self.append(
            ProjectionEvent::MessageQueued { message, item },
            Some(command_id.to_string()),
            Some(dedup_id.to_string()),
        )
    }

    pub fn mark_sent(&mut self, command_id: &str) -> Result<String, JsValue> {
        self.append(
            ProjectionEvent::MessageSent {
                command_id: command_id.to_string(),
            },
            None,
            None,
        )
    }

    pub fn assistant_message(
        &mut self,
        turn_id: &str,
        reply_to: &str,
        text: &str,
    ) -> Result<String, JsValue> {
        let event_id = format!("{turn_id}:assistant");
        let message = SessionMessage {
            event_id: event_id.clone(),
            message_id: event_id.clone(),
            dedup_id: Some(event_id),
            role: edapex_agent::SessionMessageRole::Assistant,
            text: text.to_string(),
            versions: Vec::new(),
            reply_to: Some(reply_to.to_string()),
        };
        self.append(ProjectionEvent::AssistantMessage { message }, None, None)
    }

    pub fn truncate(
        &mut self,
        from_event_id: &str,
        truncation_id: &str,
    ) -> Result<String, JsValue> {
        self.append(
            ProjectionEvent::Truncate {
                truncation: SessionTruncation {
                    id: truncation_id.to_string(),
                    from_event_id: from_event_id.to_string(),
                    active: true,
                },
            },
            None,
            None,
        )
    }

    pub fn restore_truncation(&mut self, truncation_id: &str) -> Result<String, JsValue> {
        self.append(
            ProjectionEvent::Restore {
                truncation_id: truncation_id.to_string(),
            },
            None,
            None,
        )
    }

    /// Applies a tombstone pulled from the relay.
    ///
    /// Deletes the local payloads and marks the session deleted, in one
    /// transaction, so a stale projection cannot resurrect it. Repeating it is a
    /// no-op, which is what makes a replayed deletion signal safe.
    pub fn apply_deletion(&mut self, deleted_at_ms: f64) -> Result<(), JsValue> {
        self.store
            .delete_agent_session(self.root.as_str(), deleted_at_ms as u64)
            .map_err(store_error)
    }

    /// Proves the Wasm engine has FTS5 and the derived table, without writing.
    pub fn fts_available(&mut self) -> Result<bool, JsValue> {
        self.store.fts_available().map_err(store_error)
    }

    pub fn view(&self) -> Result<String, JsValue> {
        let snapshot = self.projection.view(
            self.lease.holder_id.clone(),
            self.lease.fence,
            None,
        );
        crate::browser_trace::note_global(format!("view.queue={}", snapshot.queue.len()));
        serde_json::to_string(&snapshot)
            .map_err(|message| error(AgentError::internal(message.to_string())))
    }

    /// Closing the authority releases its lease. Records remain in OPFS.
    pub fn release(&mut self) -> Result<(), JsValue> {
        self.store
            .release_agent_session(self.root.as_str(), &self.client_id, self.lease.fence)
            .map_err(store_error)
    }

    fn append(
        &mut self,
        event: ProjectionEvent,
        command_id: Option<String>,
        dedup_id: Option<String>,
    ) -> Result<String, JsValue> {
        if self.lease.expires_at_ms < now_ms() {
            self.lease = self
                .store
                .claim_agent_session(self.root.as_str(), &self.client_id, 60_000, now_ms())
                .map_err(store_error)?;
            if self.lease.holder_id.as_deref() != Some(&self.client_id) {
                return Err(error(AgentError::new(
                    AgentErrorCode::LeaseLost,
                    "The browser lease was not renewed",
                    false,
                )));
            }
        }
        let event_id = Uuid::new_v4().to_string();
        let record = SessionEventRecord {
            session_id: self.root.to_string(),
            event_id: event_id.clone(),
            sequence: 0,
            kind: event.kind().to_string(),
            core_message_id: event.core_message_id(),
            dedup_id: dedup_id.clone(),
            payload: serde_json::to_vec(&event)
                .map_err(|exception| error(AgentError::invalid_input(exception.to_string())))?,
            created_at_ms: now_ms(),
            relay_position: None,
        };
        let outcome = self
            .store
            .append_agent_session_event(SessionEventInput {
                session_id: record.session_id.clone(),
                event_id,
                workspace_id: self.workspace_id.clone(),
                device_id: self.device_id.clone(),
                holder_id: self.client_id.clone(),
                expected_fence: self.lease.fence,
                kind: record.kind.clone(),
                core_message_id: record.core_message_id.clone(),
                command_id,
                dedup_id,
                payload: record.payload.clone(),
                created_at_ms: record.created_at_ms,
            })
            .map_err(store_error)?;
        crate::browser_trace::note_global(format!(
            "append.{}",
            match outcome {
                SessionAppendOutcome::Appended(_) => "appended",
                SessionAppendOutcome::Duplicate(_) => "duplicate",
            }
        ));
        if let SessionAppendOutcome::Appended(sequence) = outcome {
            self.projection
                .replay_record(&SessionEventRecord { sequence, ..record })
                .map_err(|exception| error(AgentError::internal(exception.to_string())))?;
        }
        self.view()
    }
}

fn store_error(exception: StoreError) -> JsValue {
    let (code, retryable) = match &exception {
        StoreError::LeaseLost => (AgentErrorCode::LeaseLost, false),
        StoreError::SessionDeleted => (AgentErrorCode::SessionDeleted, false),
        StoreError::Serialisation(_) | StoreError::Decrypt => {
            (AgentErrorCode::StorageCorrupted, false)
        }
        _ => (AgentErrorCode::StorageUnavailable, true),
    };
    error(AgentError::new(code, exception.to_string(), retryable))
}

fn error(error: AgentError) -> JsValue {
    JsValue::from_str(&serde_json::to_string(&error).unwrap_or_else(|_| error.message))
}

fn now_ms() -> u64 {
    js_sys::Date::now() as u64
}
