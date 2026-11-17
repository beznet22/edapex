use uuid::Uuid;

use super::{command_id, now_ms, PendingTurn, SessionRuntime};
use crate::driver::{storage_error, SessionCommandReceipt};
use crate::projection::ProjectionEvent;
use crate::protocol::{AgentError, AgentErrorCode, AgentEvent};
use crate::session_protocol::{
    SessionCommand, SessionMessage, SessionMessageRole, SessionMessageVersion, SessionQueueItem,
    SessionTruncation,
};
use crate::TurnCompletionStatus;

impl SessionRuntime {
    pub(super) async fn execute(
        &mut self,
        command: SessionCommand,
    ) -> Result<SessionCommandReceipt, AgentError> {
        let command_id = command_id(&command).to_string();
        let turn_id = match &command {
            SessionCommand::EnqueueText { command_id, .. }
            | SessionCommand::EditMessage { command_id, .. } => Some(command_id.clone()),
            _ => None,
        };

        match command {
            SessionCommand::AcquireLease { lease_ttl_ms, .. } => {
                self.ensure_started(lease_ttl_ms).await?;
            }
            SessionCommand::RenewLease { expected_fence, .. } => {
                self.lease = self
                    .options
                    .context
                    .lock()
                    .map_err(storage_error)?
                    .renew_agent_session(
                        self.root.as_str(),
                        &self.options.client_id,
                        expected_fence,
                        60_000,
                        now_ms(),
                    )
                    .map_err(|error| storage_error(error.into()))?;
            }
            SessionCommand::ReleaseLease { expected_fence, .. } => {
                if expected_fence != self.lease.fence {
                    return Err(AgentError::new(
                        AgentErrorCode::LeaseLost,
                        "The release fence is stale",
                        false,
                    ));
                }
                self.shutdown().await;
                self.options
                    .context
                    .lock()
                    .map_err(storage_error)?
                    .release_agent_session(
                        self.root.as_str(),
                        &self.options.client_id,
                        expected_fence,
                    )
                    .map_err(|error| storage_error(error.into()))?;
                self.lease.holder_id = None;
            }
            SessionCommand::EnqueueText {
                thread_id,
                dedup_id,
                text,
                ..
            } => {
                if thread_id.as_str() != self.root.as_str() {
                    return Err(AgentError::invalid_input(
                        "The command targets another root thread",
                    ));
                }
                if text.trim().is_empty() {
                    return Err(AgentError::invalid_input("A message cannot be empty"));
                }
                self.ensure_started(60_000).await?;
                let event_id = Uuid::new_v4().to_string();
                let message = SessionMessage {
                    event_id: event_id.clone(),
                    message_id: dedup_id.clone(),
                    dedup_id: Some(dedup_id.clone()),
                    role: SessionMessageRole::User,
                    text: text.clone(),
                    versions: Vec::new(),
                    reply_to: None,
                };
                let item = SessionQueueItem {
                    event_id: event_id.clone(),
                    command_id: command_id.clone(),
                    dedup_id: dedup_id.clone(),
                    text: text.clone(),
                    enqueued_at_ms: now_ms(),
                };
                let outcome = self.append(
                    ProjectionEvent::MessageQueued {
                        message: message.clone(),
                        item,
                    },
                    event_id,
                    Some(command_id.clone()),
                    Some(dedup_id.clone()),
                )?;
                let deduplicated = !matches!(
                    outcome,
                    edapex_store::session_events::SessionAppendOutcome::Appended(_)
                );
                if !deduplicated {
                    self.pending.push_back(PendingTurn {
                        command_id: command_id.clone(),
                        dedup_id,
                        text,
                        message,
                    });
                    self.drain_next().await?;
                }
                return Ok(SessionCommandReceipt {
                    command_id,
                    turn_id,
                    deduplicated,
                });
            }
            SessionCommand::EditMessage {
                event_id,
                replacement_message_id,
                replacement_dedup_id,
                text,
                ..
            } => {
                if text.trim().is_empty() {
                    return Err(AgentError::invalid_input(
                        "An edited message cannot be empty",
                    ));
                }
                self.ensure_started(60_000).await?;
                let queue_event_id = Uuid::new_v4().to_string();
                let original = self.projection.message(&event_id).cloned();
                let versions = original
                    .as_ref()
                    .map(|message| {
                        let mut versions = message.versions.clone();
                        versions.push(SessionMessageVersion {
                            event_id: message.event_id.clone(),
                            message_id: message.message_id.clone(),
                            text: message.text.clone(),
                            created_at_ms: now_ms(),
                        });
                        versions
                    })
                    .unwrap_or_default();
                let message = SessionMessage {
                    event_id: queue_event_id.clone(),
                    message_id: replacement_message_id,
                    dedup_id: Some(replacement_dedup_id.clone()),
                    role: SessionMessageRole::User,
                    text: text.clone(),
                    versions,
                    reply_to: Some(event_id),
                };
                let item = SessionQueueItem {
                    event_id: queue_event_id.clone(),
                    command_id: command_id.clone(),
                    dedup_id: replacement_dedup_id.clone(),
                    text: text.clone(),
                    enqueued_at_ms: now_ms(),
                };
                self.append(
                    ProjectionEvent::MessageQueued {
                        message: message.clone(),
                        item,
                    },
                    queue_event_id,
                    Some(command_id.clone()),
                    Some(replacement_dedup_id.clone()),
                )?;
                self.pending.push_back(PendingTurn {
                    command_id: command_id.clone(),
                    dedup_id: replacement_dedup_id,
                    text,
                    message,
                });
                self.drain_next().await?;
            }
            SessionCommand::CancelTurn {
                turn_id: requested, ..
            } => {
                if self
                    .active
                    .as_ref()
                    .is_some_and(|active| active.turn_id == requested)
                {
                    let active = self.active.take();
                    self.shutdown().await;
                    self.state
                        .set_thread_stopped(&self.root, true)
                        .map_err(storage_error)?;
                    if let Some(active) = active {
                        self.active_turns.end(self.root.as_str(), &active.turn_id);
                        self.options.events.emit(AgentEvent::Interrupted {
                            thread_id: self.root.to_string(),
                            turn_id: active.turn_id.clone(),
                            reason: "Stopped by the person".to_string(),
                        });
                        self.options.events.emit(AgentEvent::TurnCompleted {
                            thread_id: self.root.to_string(),
                            turn_id: active.turn_id,
                            status: TurnCompletionStatus::Stopped,
                        });
                    }
                }
            }
            SessionCommand::Truncate {
                truncation_id,
                from_event_id,
                ..
            } => {
                self.ensure_started(60_000).await?;
                self.append(
                    ProjectionEvent::Truncate {
                        truncation: SessionTruncation {
                            id: truncation_id,
                            from_event_id,
                            active: true,
                        },
                    },
                    Uuid::new_v4().to_string(),
                    None,
                    None,
                )?;
            }
            SessionCommand::Restore { truncation_id, .. } => {
                self.ensure_started(60_000).await?;
                self.append(
                    ProjectionEvent::Restore { truncation_id },
                    Uuid::new_v4().to_string(),
                    None,
                    None,
                )?;
            }
            SessionCommand::DeleteSession { .. } => {
                self.shutdown().await;
                self.options
                    .context
                    .lock()
                    .map_err(storage_error)?
                    .delete_agent_session(self.root.as_str(), now_ms())
                    .map_err(|error| storage_error(error.into()))?;
            }
        }
        Ok(SessionCommandReceipt {
            command_id,
            turn_id: turn_id.filter(|id| !id.is_empty()),
            deduplicated: false,
        })
    }
}
