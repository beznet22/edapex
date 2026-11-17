use std::sync::Arc;

use edapex_agent::{
    AgentConnectSettings, AgentEvent, AgentStatus, AgentTurnInput, ApprovalDecision,
    NativeAgentDriver, SessionCommand, StoreContext, ThreadStartResult, TurnStarted,
};
use edapex_store::MasterKey;
use tauri::ipc::Channel;
use tauri::{AppHandle, State};
use uuid::Uuid;

use super::approvals::ApprovalRegistry;
use super::env::HostEnv;
use super::provider::ModelRouterProvider;
use super::session::{AgentSession, ChannelSink};
use super::tools::{to_host_error, HostTools};
use crate::state::{HostError, HostState};

/// Connects the native Infinity driver for a workspace.
///
/// Reopening the app must not kill the run it was meant to show: an existing
/// session is reattached, and the driver keeps its own thread and durable
/// store. The session token stays inside the Rust host.
#[tauri::command]
pub async fn agent_connect(
    app: AppHandle,
    state: State<'_, HostState>,
    settings: AgentConnectSettings,
    channel: Channel<AgentEvent>,
) -> Result<AgentStatus, HostError> {
    if let Some(session) = state.agent()? {
        session.attach(0, channel);
        return Ok(session.status());
    }

    let session_token = crate::auth::session_token()?.ok_or_else(HostError::auth_required)?;
    let env = Arc::new(HostEnv::from_app(&app)?);
    let path = env
        .agent_db()
        .to_str()
        .map(str::to_string)
        .ok_or_else(|| {
            HostError::new("internal_error", "Agent database path is not UTF-8", false)
        })?;
    let master = super::journal::master_key()?;
    let context = StoreContext::open(
        &path,
        &settings.workspace_id,
        MasterKey::from_bytes(master),
    )
    .map_err(store_error)?;

    let approvals = Arc::new(ApprovalRegistry::default());
    let sink = Arc::new(ChannelSink::new(Some(channel)));
    let driver = NativeAgentDriver::connect(
        settings.clone(),
        context,
        Arc::new(ModelRouterProvider::new(session_token)),
        Arc::new(HostTools {
            env,
            captures: state.captures(),
        }),
        approvals.clone(),
        sink.clone(),
    )
    .map_err(to_host_error)?;

    let session = AgentSession {
        driver: Arc::new(driver),
        approvals,
        sink,
        settings,
    };
    let status = session.status();
    state.set_agent(session)?;
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

/// A new root conversation.
///
/// The id is caller-owned from here on: every later turn and every restart uses
/// this same `ThreadId`, which is what makes resume real rather than replayed.
#[tauri::command]
pub async fn agent_thread_start(
    state: State<'_, HostState>,
    _cwd: Option<String>,
) -> Result<ThreadStartResult, HostError> {
    state
        .agent()?
        .ok_or_else(|| HostError::new("auth_required", "Connect the agent first", false))?;
    Ok(ThreadStartResult {
        thread_id: Uuid::new_v4().to_string(),
    })
}

/// Accepts a turn.
///
/// The command id is the turn id: a retry with the same id is deduplicated by
/// the driver, and a cancellation names exactly one turn.
#[tauri::command]
pub async fn agent_turn_start(
    state: State<'_, HostState>,
    input: AgentTurnInput,
) -> Result<TurnStarted, HostError> {
    let session = state
        .agent()?
        .ok_or_else(|| HostError::new("auth_required", "Connect the agent first", false))?;
    let command_id = Uuid::new_v4().to_string();
    let receipt = session
        .driver
        .execute(SessionCommand::EnqueueText {
            command_id: command_id.clone(),
            session_id: input.thread_id.clone(),
            client_id: session.driver.client_id().to_string(),
            thread_id: input.thread_id,
            dedup_id: Uuid::new_v4().to_string(),
            text: input.text,
        })
        .await
        .map_err(to_host_error)?;
    Ok(TurnStarted {
        turn_id: receipt.turn_id.unwrap_or(receipt.command_id),
    })
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
        .driver
        .execute(SessionCommand::CancelTurn {
            command_id: Uuid::new_v4().to_string(),
            session_id: thread_id,
            client_id: session.driver.client_id().to_string(),
            turn_id,
        })
        .await
        .map_err(to_host_error)?;
    Ok(())
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

/// Closes the transport and settles every session it owned.
///
/// Dropping a UI handle is not a cancel; this is, and it releases each lease so
/// a later launch can resume rather than wait for an expiry.
#[tauri::command]
pub async fn agent_close(state: State<'_, HostState>) -> Result<(), HostError> {
    if let Some(session) = state.take_agent()? {
        session.driver.close().await.map_err(to_host_error)?;
    }
    Ok(())
}

pub(crate) fn store_error(error: edapex_store::StoreError) -> HostError {
    HostError::new("storage_unavailable", error.to_string(), true)
}
