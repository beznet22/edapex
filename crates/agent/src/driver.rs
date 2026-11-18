use std::collections::HashMap;
use std::sync::{Arc, Mutex};
use std::thread::JoinHandle;

use tokio::sync::{mpsc, oneshot};
use uuid::Uuid;

use crate::durable_store::StoreContext;
use crate::protocol::{AgentConnectSettings, AgentError, AgentErrorCode};
use crate::runtime::{ApprovalHandler, EventSink, ToolExecutor};
use crate::session::SessionRuntime;
use crate::session_protocol::SessionCommand;
use crate::ProviderClient;

#[derive(Debug, Clone, PartialEq)]
pub struct SessionCommandReceipt {
    pub command_id: String,
    pub turn_id: Option<String>,
    pub deduplicated: bool,
}

pub(crate) enum SessionSignal {
    Command {
        command: SessionCommand,
        response: oneshot::Sender<Result<SessionCommandReceipt, AgentError>>,
    },
    Close(oneshot::Sender<()>),
}

enum DriverRequest {
    Command {
        session_id: String,
        command: SessionCommand,
        response: oneshot::Sender<Result<SessionCommandReceipt, AgentError>>,
    },
    Close,
}

#[derive(Clone)]
pub(crate) struct SessionRuntimeOptions {
    pub settings: AgentConnectSettings,
    pub context: StoreContext,
    pub provider: Arc<dyn ProviderClient>,
    pub tools: Arc<dyn ToolExecutor>,
    pub approvals: Arc<dyn ApprovalHandler>,
    pub events: Arc<dyn EventSink>,
    pub client_id: Arc<str>,
    pub device_id: Arc<str>,
    pub turn_timeout_ms: Arc<std::sync::atomic::AtomicU64>,
}

pub struct NativeAgentDriver {
    requests: mpsc::UnboundedSender<DriverRequest>,
    client_id: Arc<str>,
    turn_timeout_ms: Arc<std::sync::atomic::AtomicU64>,
    thread: Mutex<Option<JoinHandle<()>>>,
}

impl NativeAgentDriver {
    pub fn connect(
        settings: AgentConnectSettings,
        context: StoreContext,
        provider: Arc<dyn ProviderClient>,
        tools: Arc<dyn ToolExecutor>,
        approvals: Arc<dyn ApprovalHandler>,
        events: Arc<dyn EventSink>,
    ) -> Result<Self, AgentError> {
        if settings.workspace_id.trim().is_empty() || settings.model.trim().is_empty() {
            return Err(AgentError::invalid_input(
                "A model and workspace are required",
            ));
        }
        let client_id: Arc<str> = Arc::from(edapex_store::identity::new_client_id());
        let driver_client_id = client_id.clone();
        let turn_timeout_ms = Arc::new(std::sync::atomic::AtomicU64::new(60_000));
        let driver_timeout_ms = turn_timeout_ms.clone();
        let device_id: Arc<str> = Arc::from(
            context
                .lock()
                .map_err(storage_error)?
                .agent_device_id(&settings.workspace_id)
                .map_err(|error| {
                    AgentError::new(AgentErrorCode::StorageUnavailable, error.to_string(), false)
                })?,
        );
        let (requests, mut receiver) = mpsc::unbounded_channel::<DriverRequest>();
        let thread = std::thread::Builder::new()
            .name("edapex-infinity-agent".to_string())
            .spawn(move || {
                let runtime = tokio::runtime::Builder::new_current_thread()
                    .enable_all()
                    .build();
                let Ok(runtime) = runtime else {
                    return;
                };
                runtime.block_on(async {
                    let local = tokio::task::LocalSet::new();
                    local
                        .run_until(async move {
                            let options = SessionRuntimeOptions {
                                settings,
                                context,
                                provider,
                                tools,
                                approvals,
                                events,
                                client_id: client_id.clone(),
                                device_id,
                                turn_timeout_ms,
                            };
                            let mut sessions =
                                HashMap::<String, mpsc::UnboundedSender<SessionSignal>>::new();
                            while let Some(request) = receiver.recv().await {
                                match request {
                                    DriverRequest::Command {
                                        session_id,
                                        command,
                                        response,
                                    } => {
                                        let sender = match sessions.entry(session_id.clone()) {
                                            std::collections::hash_map::Entry::Occupied(entry) => {
                                                entry.get().clone()
                                            }
                                            std::collections::hash_map::Entry::Vacant(entry) => {
                                                let (sender, receiver) = mpsc::unbounded_channel();
                                                let task_options = options.clone();
                                                let root = session_id.clone();
                                                tokio::task::spawn_local(async move {
                                                    let mut runtime = SessionRuntime::new(
                                                        root,
                                                        task_options,
                                                        receiver,
                                                    );
                                                    runtime.run().await;
                                                });
                                                entry.insert(sender).clone()
                                            }
                                        };
                                        if sender
                                            .send(SessionSignal::Command { command, response })
                                            .is_err()
                                        {
                                            sessions.remove(&session_id);
                                        }
                                    }
                                    DriverRequest::Close => {
                                        let mut closed = Vec::new();
                                        for (_, sender) in sessions.drain() {
                                            let (response, wait) = oneshot::channel();
                                            if sender.send(SessionSignal::Close(response)).is_ok() {
                                                closed.push(wait);
                                            }
                                        }
                                        for wait in closed {
                                            let _ = wait.await;
                                        }
                                        break;
                                    }
                                }
                            }
                            sessions.clear();
                        })
                        .await;
                });
            })
            .map_err(|error| {
                AgentError::new(AgentErrorCode::InternalError, error.to_string(), false)
            })?;
        Ok(Self {
            requests,
            client_id: driver_client_id,
            turn_timeout_ms: driver_timeout_ms,
            thread: Mutex::new(Some(thread)),
        })
    }

    pub fn client_id(&self) -> &str {
        &self.client_id
    }

    pub fn set_turn_timeout(&self, timeout: std::time::Duration) {
        let millis = timeout.as_millis().try_into().unwrap_or(u64::MAX);
        self.turn_timeout_ms
            .store(millis, std::sync::atomic::Ordering::Relaxed);
    }

    pub async fn create_session(
        &self,
        thread_id: &str,
    ) -> Result<SessionCommandReceipt, AgentError> {
        let command = SessionCommand::AcquireLease {
            command_id: Uuid::new_v4().to_string(),
            session_id: thread_id.to_string(),
            client_id: self.client_id.to_string(),
            lease_ttl_ms: 60_000,
        };
        self.execute(command).await
    }

    pub async fn execute(
        &self,
        command: SessionCommand,
    ) -> Result<SessionCommandReceipt, AgentError> {
        let session_id = session_id(&command)?.to_string();
        let (response, result) = oneshot::channel();
        self.requests
            .send(DriverRequest::Command {
                session_id,
                command,
                response,
            })
            .map_err(|_| {
                AgentError::new(
                    AgentErrorCode::Cancelled,
                    "The agent driver is closed",
                    false,
                )
            })?;
        result.await.map_err(|_| {
            AgentError::new(
                AgentErrorCode::Cancelled,
                "The session ended before accepting the command",
                false,
            )
        })?
    }

    pub async fn close(&self) -> Result<(), AgentError> {
        let _ = self.requests.send(DriverRequest::Close);
        let handle = self
            .thread
            .lock()
            .map_err(|_| AgentError::internal("The agent driver lock is unavailable"))?
            .take();
        if let Some(handle) = handle {
            tokio::task::spawn_blocking(move || handle.join())
                .await
                .map_err(|error| AgentError::internal(error.to_string()))?
                .map_err(|_| AgentError::internal("The agent driver thread panicked"))?;
        }
        Ok(())
    }
}

fn session_id(command: &SessionCommand) -> Result<&str, AgentError> {
    match command {
        SessionCommand::EnqueueText {
            session_id,
            client_id,
            thread_id,
            ..
        } => {
            if session_id != thread_id {
                return Err(AgentError::invalid_input(
                    "Session and model thread must have the same root identity",
                ));
            }
            if client_id.trim().is_empty() {
                return Err(AgentError::invalid_input("A client id is required"));
            }
            Ok(session_id)
        }
        SessionCommand::CancelTurn { session_id, .. }
        | SessionCommand::EditMessage { session_id, .. }
        | SessionCommand::Truncate { session_id, .. }
        | SessionCommand::Restore { session_id, .. }
        | SessionCommand::DeleteSession { session_id, .. }
        | SessionCommand::AcquireLease { session_id, .. }
        | SessionCommand::RenewLease { session_id, .. }
        | SessionCommand::ReleaseLease { session_id, .. } => Ok(session_id),
    }
}

pub(crate) fn storage_error(error: crate::DurableStoreError) -> AgentError {
    AgentError::new(error.agent_error_code(), error.to_string(), false)
}
