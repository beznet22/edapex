use async_trait::async_trait;
#[cfg(not(target_arch = "wasm32"))]
use edapex_store::session_events::{SessionAppendOutcome, SessionEventInput};
use infinity_agent_core::system::{AgentEvent as InfinityEvent, ReplaySnapshot, ThreadObserver};
use rap_protocol::ThreadId;
use serde::{Deserialize, Serialize};
use tokio::sync::mpsc;

#[cfg(not(target_arch = "wasm32"))]
use crate::durable_store::{DurableStoreError, StoreContext};
use crate::session_protocol::{SessionMessage, SessionQueueItem, SessionTruncation, SessionView};

#[derive(Clone)]
pub struct SessionSubscription {
    pub events: mpsc::UnboundedSender<ObservedEvent>,
}

#[derive(Debug)]
pub enum ObservedEvent {
    Infinity {
        thread_id: String,
        event: InfinityEvent,
    },
    Replay(ReplaySnapshot),
}

pub struct SessionObserver {
    events: mpsc::UnboundedSender<ObservedEvent>,
}

impl SessionObserver {
    pub fn new(events: mpsc::UnboundedSender<ObservedEvent>) -> Self {
        Self { events }
    }
}

#[async_trait(?Send)]
impl ThreadObserver for SessionObserver {
    type SubscribeRequest = SessionSubscription;

    fn on_event(&self, thread_id: &ThreadId<str>, event: &InfinityEvent) {
        let _ = self.events.send(ObservedEvent::Infinity {
            thread_id: thread_id.to_string(),
            event: event.clone(),
        });
    }

    fn on_subscribe(
        &self,
        _thread_id: &ThreadId<str>,
        request: Self::SubscribeRequest,
        snapshot: ReplaySnapshot,
    ) {
        let _ = request.events.send(ObservedEvent::Replay(snapshot));
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(
    tag = "type",
    rename_all = "snake_case",
    rename_all_fields = "camelCase"
)]
pub enum ProjectionEvent {
    MessageQueued {
        message: SessionMessage,
        item: SessionQueueItem,
    },
    MessageSent {
        command_id: String,
    },
    AssistantMessage {
        message: SessionMessage,
    },
    Truncate {
        truncation: SessionTruncation,
    },
    Restore {
        truncation_id: String,
    },
}

impl ProjectionEvent {
    pub fn kind(&self) -> &'static str {
        match self {
            Self::MessageQueued { .. } => "message_queued",
            Self::MessageSent { .. } => "message_sent",
            Self::AssistantMessage { .. } => "assistant_message",
            Self::Truncate { .. } => "truncate",
            Self::Restore { .. } => "restore",
        }
    }

    pub fn core_message_id(&self) -> Option<String> {
        match self {
            Self::MessageQueued { message, .. } | Self::AssistantMessage { message } => {
                Some(message.message_id.clone())
            }
            Self::MessageSent { .. } | Self::Truncate { .. } | Self::Restore { .. } => None,
        }
    }
}

pub struct ProjectionAppend {
    pub event: ProjectionEvent,
    pub event_id: String,
    pub command_id: Option<String>,
    pub dedup_id: Option<String>,
    pub holder_id: String,
    pub fence: u64,
    pub created_at_ms: u64,
}

pub struct SessionProjection {
    session_id: String,
    device_id: String,
    client_id: String,
    history: Vec<SessionMessage>,
    queue: Vec<SessionQueueItem>,
    truncations: Vec<SessionTruncation>,
    last_seq: u64,
}

impl SessionProjection {
    pub fn new(session_id: &str, device_id: &str, client_id: &str) -> Self {
        Self {
            session_id: session_id.to_string(),
            device_id: device_id.to_string(),
            client_id: client_id.to_string(),
            history: Vec::new(),
            queue: Vec::new(),
            truncations: Vec::new(),
            last_seq: 0,
        }
    }

    #[cfg(not(target_arch = "wasm32"))]
    pub fn append(
        &mut self,
        context: &StoreContext,
        append: ProjectionAppend,
    ) -> Result<SessionAppendOutcome, DurableStoreError> {
        let ProjectionAppend {
            event,
            event_id,
            command_id,
            dedup_id,
            holder_id,
            fence,
            created_at_ms,
        } = append;
        let payload = serde_json::to_vec(&event)?;
        let outcome = context
            .lock()?
            .append_agent_session_event(SessionEventInput {
                session_id: self.session_id.clone(),
                event_id: event_id.clone(),
                workspace_id: context.workspace_id.to_string(),
                device_id: self.device_id.clone(),
                holder_id,
                expected_fence: fence,
                kind: event.kind().to_string(),
                core_message_id: event.core_message_id(),
                command_id,
                dedup_id,
                payload,
                created_at_ms,
            })?;
        if let SessionAppendOutcome::Appended(sequence) = outcome {
            self.last_seq = sequence;
            self.apply(event);
        }
        Ok(outcome)
    }

    #[cfg(not(target_arch = "wasm32"))]
    pub fn restore(&mut self, context: &StoreContext) -> Result<Option<String>, DurableStoreError> {
        let latest = context
            .lock()?
            .agent_session_latest_sequence(&self.session_id)?;
        let first = latest.saturating_sub(49);
        let records = context
            .lock()?
            .agent_session_events(&self.session_id, first, 50)?;
        let next_cursor = records
            .first()
            .filter(|record| record.sequence > 1)
            .map(|record| record.sequence.saturating_sub(1).to_string());
        for record in records {
            self.replay_record(&record)?;
        }
        Ok(next_cursor)
    }

    pub fn queued_turns(&self) -> Vec<(SessionQueueItem, SessionMessage)> {
        self.queue
            .iter()
            .filter_map(|item| {
                self.message(&item.event_id)
                    .cloned()
                    .map(|message| (item.clone(), message))
            })
            .collect()
    }

    pub fn message(&self, event_id: &str) -> Option<&SessionMessage> {
        self.history
            .iter()
            .find(|message| message.event_id == event_id)
    }

    pub fn view(
        &self,
        holder_id: Option<String>,
        fence: u64,
        next_cursor: Option<String>,
    ) -> SessionView {
        let active_from = self
            .truncations
            .iter()
            .rev()
            .find(|truncation| truncation.active)
            .map(|truncation| truncation.from_event_id.as_str());
        let messages = active_from
            .and_then(|from| {
                self.history
                    .iter()
                    .position(|message| message.event_id == from)
            })
            .map(|position| self.history[..position].to_vec())
            .unwrap_or_else(|| self.history.clone());
        SessionView {
            session_id: self.session_id.clone(),
            thread_id: self.session_id.clone(),
            device_id: self.device_id.clone(),
            client_id: self.client_id.clone(),
            read_only: holder_id.as_deref() != Some(&self.client_id),
            holder_id,
            fence,
            last_seq: self.last_seq,
            messages,
            queue: self.queue.clone(),
            truncations: self.truncations.clone(),
            next_cursor,
        }
    }

    /// Replays records already loaded by a host's own driver.
    pub fn replay_record(
        &mut self,
        record: &edapex_store::session_events::SessionEventRecord,
    ) -> Result<(), serde_json::Error> {
        let event = serde_json::from_slice::<ProjectionEvent>(&record.payload)?;
        self.last_seq = record.sequence;
        self.apply(event);
        Ok(())
    }

    fn apply(&mut self, event: ProjectionEvent) {
        match event {
            ProjectionEvent::MessageQueued { message, item } => {
                if !self
                    .history
                    .iter()
                    .any(|entry| entry.event_id == message.event_id)
                {
                    self.history.push(message);
                    self.queue.push(item);
                }
            }
            ProjectionEvent::MessageSent { command_id } => {
                self.queue.retain(|item| item.command_id != command_id);
            }
            ProjectionEvent::AssistantMessage { message } => {
                if !self
                    .history
                    .iter()
                    .any(|item| item.event_id == message.event_id)
                {
                    self.history.push(message);
                }
            }
            ProjectionEvent::Truncate { truncation } => {
                if !self
                    .truncations
                    .iter()
                    .any(|entry| entry.id == truncation.id)
                {
                    self.truncations.push(truncation);
                }
            }
            ProjectionEvent::Restore { truncation_id } => {
                self.truncations.retain(|item| item.id != truncation_id);
            }
        }
    }
}
