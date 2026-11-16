use std::sync::Arc;

use edapex_agent::{
    AgentConnectSettings, AgentEvent, AgentHost, AgentHostOptions, AgentStatus, AgentTurnInput,
    ApprovalDecision, ThreadStartResult, TurnStarted,
};
use tauri::ipc::Channel;
use tauri::{AppHandle, State};

use super::approvals::ApprovalRegistry;
use super::env::HostEnv;
use super::provider::ModelRouterProvider;
use super::session::{AgentSession, ChannelSink};
use super::tools::{to_host_error, HostTools};
use crate::state::{HostError, HostState};

#[tauri::command]
pub async fn agent_connect(
    app: AppHandle,
    state: State<'_, HostState>,
    settings: AgentConnectSettings,
    channel: Channel<AgentEvent>,
) -> Result<AgentStatus, HostError> {
    let session_token = crate::auth::session_token()?.ok_or_else(HostError::auth_required)?;
    if let Some(previous) = state.take_agent()? {
        previous.host.close();
    }
    let env = Arc::new(HostEnv::from_app(&app)?);
    let approvals = Arc::new(ApprovalRegistry::default());
    let sink = Arc::new(ChannelSink::new(Some(channel)));
    let tools = Arc::new(HostTools {
        env,
        captures: state.captures(),
    });
    let host = AgentHost::connect(AgentHostOptions {
        settings,
        provider: Arc::new(ModelRouterProvider::new(session_token)),
        tools,
        approvals: approvals.clone(),
        events: sink.clone(),
    })
    .map_err(to_host_error)?;
    let status = host.status();
    state.set_agent(AgentSession {
        host,
        approvals,
        sink,
    })?;
    Ok(status)
}

/// Re-attach a client after a WebView reload.
///
/// `since_seq` is the last sequence the client processed, so replay is exact.
/// Returns the cursor to resume from.
#[tauri::command]
pub async fn agent_attach(
    state: State<'_, HostState>,
    since_seq: u64,
    channel: Channel<AgentEvent>,
) -> Result<u64, HostError> {
    let session = state
        .agent()?
        .ok_or_else(|| HostError::new("invalid_input", "The agent is not connected", false))?;
    Ok(session.attach(since_seq, channel))
}

#[tauri::command]
pub async fn agent_thread_start(
    state: State<'_, HostState>,
    cwd: Option<String>,
) -> Result<ThreadStartResult, HostError> {
    let session = state
        .agent()?
        .ok_or_else(|| HostError::new("auth_required", "Connect the agent first", false))?;
    session.host.thread_start(cwd).map_err(to_host_error)
}

#[tauri::command]
pub async fn agent_turn_start(
    state: State<'_, HostState>,
    input: AgentTurnInput,
) -> Result<TurnStarted, HostError> {
    let session = state
        .agent()?
        .ok_or_else(|| HostError::new("auth_required", "Connect the agent first", false))?;
    session.host.turn_start(input).await.map_err(to_host_error)
}

#[tauri::command]
pub async fn agent_turn_interrupt(
    state: State<'_, HostState>,
    thread_id: String,
    turn_id: String,
) -> Result<(), HostError> {
    let session = state
        .agent()?
        .ok_or_else(|| HostError::new("auth_required", "Connect the agent first", false))?;
    session
        .host
        .interrupt(&thread_id, &turn_id)
        .map_err(to_host_error)
}

#[tauri::command]
pub async fn agent_approval_response(
    state: State<'_, HostState>,
    approval_request_id: String,
    decision: ApprovalDecision,
) -> Result<(), HostError> {
    let session = state
        .agent()?
        .ok_or_else(|| HostError::new("auth_required", "Connect the agent first", false))?;
    session.approvals.resolve(&approval_request_id, decision)
}

#[tauri::command]
pub async fn agent_close(state: State<'_, HostState>) -> Result<(), HostError> {
    if let Some(session) = state.take_agent()? {
        session.host.close();
    }
    Ok(())
}
