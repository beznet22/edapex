use std::collections::VecDeque;
use std::sync::Arc;
use std::time::{SystemTime, UNIX_EPOCH};

use edapex_store::session_events::SessionAppendOutcome;
use edapex_store::session_lease::SessionLease;
use infinity_agent_core::system::{local::RunningSystem, AgentSystemBuilder};
use infinity_agent_core::traits::ConversationStore;
use rap_protocol::ThreadId;
use uuid::Uuid;

use crate::driver::{storage_error, SessionRuntimeOptions, SessionSignal};
use crate::durable_conversation::DurableConversationStore;
use crate::durable_state::DurableStateStore;
use crate::infinity_provider::EdApexModelSource;
use crate::projection::{ProjectionEvent, SessionObserver, SessionSubscription};
use crate::protocol::{AgentError, AgentErrorCode, AgentEvent};
use crate::session_protocol::SessionMessage;
use crate::tool_bridge::ActiveTurnRegistry;
use crate::{EdApexTool, TurnCompletionStatus};

mod commands;
mod events;

pub use crate::projection::ObservedEvent;

struct PendingTurn {
    command_id: String,
    dedup_id: String,
    text: String,
    message: SessionMessage,
}

struct ActiveTurn {
    turn_id: String,
    text: String,
    reply_to: String,
    pending_tool_calls: usize,
}

pub(crate) struct SessionRuntime {
    root: ThreadId,
    options: SessionRuntimeOptions,
    receiver: tokio::sync::mpsc::UnboundedReceiver<SessionSignal>,
    observed: tokio::sync::mpsc::UnboundedReceiver<ObservedEvent>,
    observed_sender: tokio::sync::mpsc::UnboundedSender<ObservedEvent>,
    conversation: DurableConversationStore,
    state: DurableStateStore,
    running: Option<RunningSystem<SessionSubscription>>,
    pending: VecDeque<PendingTurn>,
    active: Option<ActiveTurn>,
    lease: SessionLease,
    projection: crate::projection::SessionProjection,
    next_cursor: Option<String>,
    active_turns: Arc<ActiveTurnRegistry>,
}

impl SessionRuntime {
    pub fn new(
        root: String,
        options: SessionRuntimeOptions,
        receiver: tokio::sync::mpsc::UnboundedReceiver<SessionSignal>,
    ) -> Self {
        let (observed_sender, observed) = tokio::sync::mpsc::unbounded_channel();
        let conversation = DurableConversationStore::new(options.context.clone());
        let state = DurableStateStore::new(options.context.clone());
        let projection = crate::projection::SessionProjection::new(
            &root,
            &options.device_id,
            &options.client_id,
        );
        Self {
            root: ThreadId::from(root),
            options,
            receiver,
            observed,
            observed_sender,
            conversation,
            state,
            running: None,
            pending: VecDeque::new(),
            active: None,
            lease: SessionLease {
                holder_id: None,
                fence: 0,
                expires_at_ms: 0,
            },
            projection,
            next_cursor: None,
            active_turns: Arc::new(ActiveTurnRegistry::default()),
        }
    }

    pub async fn run(&mut self) {
        loop {
            let idle = if self.active.is_some() {
                std::time::Duration::from_millis(
                    self.options
                        .turn_timeout_ms
                        .load(std::sync::atomic::Ordering::Relaxed),
                )
            } else {
                std::time::Duration::from_secs(365 * 24 * 60 * 60)
            };
            tokio::select! {
                biased;
                signal = self.receiver.recv() => {
                    match signal {
                        Some(SessionSignal::Command { command, response }) => {
                            let result = self.execute(command).await;
                            let _ = response.send(result);
                        }
                        Some(SessionSignal::Close(response)) => {
                            self.shutdown().await;
                            self.release_current_lease();
                            let _ = response.send(());
                            return;
                        }
                        None => {
                            self.shutdown().await;
                            self.release_current_lease();
                            return;
                        }
                    }
                }
                observed = self.observed.recv() => {
                    match observed {
                        Some(ObservedEvent::Infinity { event, .. }) => self.on_infinity(event).await,
                        Some(ObservedEvent::Replay(_)) => {}
                        None => self.running = None,
                    }
                }
                _ = tokio::time::sleep(idle) => {
                    self.fail(AgentError::new(
                        AgentErrorCode::ProviderUnavailable,
                        "The model stopped producing events before completing the turn",
                        true,
                    )).await;
                }
            }
        }
    }

    async fn ensure_started(&mut self, ttl_ms: u64) -> Result<(), AgentError> {
        if self.running.is_some() {
            return Ok(());
        }
        self.conversation
            .ensure_root_thread(&self.root)
            .await
            .map_err(storage_error)?;
        self.state
            .set_thread_stopped(&self.root, false)
            .map_err(storage_error)?;
        self.options
            .context
            .lock()
            .map_err(storage_error)?
            .ensure_agent_session(
                self.root.as_str(),
                &self.options.settings.workspace_id,
                &self.options.device_id,
            )
            .map_err(|error| storage_error(error.into()))?;
        self.next_cursor = self
            .projection
            .restore(&self.options.context)
            .map_err(storage_error)?;
        if self.pending.is_empty() {
            self.pending = self
                .projection
                .queued_turns()
                .into_iter()
                .map(|(item, message)| PendingTurn {
                    command_id: item.command_id,
                    dedup_id: item.dedup_id,
                    text: item.text,
                    message,
                })
                .collect();
        }
        let lease = self
            .options
            .context
            .lock()
            .map_err(storage_error)?
            .claim_agent_session(
                self.root.as_str(),
                &self.options.client_id,
                ttl_ms,
                now_ms(),
            )
            .map_err(|error| storage_error(error.into()))?;
        if lease.holder_id.as_deref() != Some(&self.options.client_id) {
            return Err(AgentError::new(
                AgentErrorCode::LeaseLost,
                "Another client owns this session",
                false,
            ));
        }
        self.lease = lease;

        let tools = crate::tool_bridge::edapex_tool_specs()
            .into_iter()
            .map(|spec| {
                Box::new(EdApexTool::new(
                    spec,
                    self.options.tools.clone(),
                    self.options.approvals.clone(),
                    self.options.events.clone(),
                    self.active_turns.clone(),
                )) as Box<dyn infinity_agent_core::tools::Tool<_>>
            })
            .collect::<Vec<_>>();
        let sender = self.observed_sender.clone();
        let active_turns = self.active_turns.clone();
        let root = self.root.to_string();
        let running = AgentSystemBuilder::new_local(
            self.conversation.clone(),
            self.state.clone(),
            EdApexModelSource::new(
                self.options.provider.clone(),
                self.options.settings.model.clone(),
            ),
        )
        .tools(tools)
        .with_tokio_sleep_tools()
        .start_with_observer(move |thread_id| {
            active_turns.alias(thread_id.as_str(), &root);
            SessionObserver::new(sender.clone())
        });
        running
            .subscribe(
                &self.root,
                SessionSubscription {
                    events: self.observed_sender.clone(),
                },
            )
            .await;
        self.running = Some(running);
        Ok(())
    }

    async fn drain_next(&mut self) -> Result<(), AgentError> {
        if self.active.is_some() {
            return Ok(());
        }
        let Some(pending) = self.pending.pop_front() else {
            return Ok(());
        };
        let turn_id = pending.command_id.clone();
        self.append(
            ProjectionEvent::MessageSent {
                command_id: pending.command_id.clone(),
            },
            Uuid::new_v4().to_string(),
            None,
            None,
        )?;
        self.active_turns.begin(self.root.as_str(), &turn_id);
        self.options.events.emit(AgentEvent::TurnStarted {
            thread_id: self.root.to_string(),
            turn_id: turn_id.clone(),
        });
        self.active = Some(ActiveTurn {
            turn_id: turn_id.clone(),
            text: String::new(),
            reply_to: pending.message.event_id,
            pending_tool_calls: 0,
        });
        let running = self
            .running
            .as_ref()
            .ok_or_else(|| AgentError::internal("The session engine is not running"))?;
        running
            .send(
                infinity_agent_core::message::InputMessage::user_text(
                    self.root.clone(),
                    pending.text,
                ),
                &pending.dedup_id,
            )
            .await;
        Ok(())
    }

    fn append(
        &mut self,
        event: ProjectionEvent,
        event_id: String,
        command_id: Option<String>,
        dedup_id: Option<String>,
    ) -> Result<SessionAppendOutcome, AgentError> {
        let outcome = self
            .projection
            .append(
                &self.options.context,
                crate::projection::ProjectionAppend {
                    event,
                    event_id,
                    command_id,
                    dedup_id,
                    holder_id: self.options.client_id.to_string(),
                    fence: self.lease.fence,
                    created_at_ms: now_ms(),
                },
            )
            .map_err(storage_error)?;
        self.options.events.emit(AgentEvent::SessionSnapshot {
            view: self.projection.view(
                self.lease.holder_id.clone(),
                self.lease.fence,
                self.next_cursor.clone(),
            ),
        });
        Ok(outcome)
    }

    async fn fail(&mut self, error: AgentError) {
        if let Some(active) = self.active.take() {
            self.active_turns.end(self.root.as_str(), &active.turn_id);
            self.options.events.emit(AgentEvent::Error {
                thread_id: Some(self.root.to_string()),
                turn_id: Some(active.turn_id.clone()),
                error: error.clone(),
            });
            self.options.events.emit(AgentEvent::TurnCompleted {
                thread_id: self.root.to_string(),
                turn_id: active.turn_id,
                status: TurnCompletionStatus::Error,
            });
        }
        self.shutdown().await;
    }

    fn release_current_lease(&mut self) {
        if self.lease.holder_id.is_none() {
            return;
        }
        let released = self
            .options
            .context
            .lock()
            .map_err(storage_error)
            .and_then(|mut store| {
                store
                    .release_agent_session(
                        self.root.as_str(),
                        &self.options.client_id,
                        self.lease.fence,
                    )
                    .map_err(|error| storage_error(error.into()))
            });
        if let Err(error) = released {
            self.options.events.emit(AgentEvent::Error {
                thread_id: Some(self.root.to_string()),
                turn_id: None,
                error,
            });
        }
        self.lease = SessionLease {
            holder_id: None,
            fence: 0,
            expires_at_ms: 0,
        };
    }

    async fn shutdown(&mut self) {
        if let Some(active) = self.active.take() {
            self.active_turns.end(self.root.as_str(), &active.turn_id);
        }
        if let Some(running) = self.running.take() {
            running.shutdown().await;
        }
    }
}

fn command_id(command: &crate::SessionCommand) -> &str {
    match command {
        crate::SessionCommand::EnqueueText { command_id, .. }
        | crate::SessionCommand::CancelTurn { command_id, .. }
        | crate::SessionCommand::EditMessage { command_id, .. }
        | crate::SessionCommand::Truncate { command_id, .. }
        | crate::SessionCommand::Restore { command_id, .. }
        | crate::SessionCommand::DeleteSession { command_id, .. }
        | crate::SessionCommand::AcquireLease { command_id, .. }
        | crate::SessionCommand::RenewLease { command_id, .. }
        | crate::SessionCommand::ReleaseLease { command_id, .. } => command_id,
    }
}

fn now_ms() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis()
        .try_into()
        .unwrap_or(u64::MAX)
}
