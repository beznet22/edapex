use std::collections::HashMap;
use std::future::Future;
use std::pin::Pin;
use std::sync::{Arc, Mutex};
use std::time::Duration;

use edapex_agent::{
    tool_spec_json, AgentConnectSettings, AgentError, AgentErrorCode, AgentEvent, AgentHost,
    AgentHostOptions, AgentStatus, AgentTurnInput, ApprovalDecision, ApprovalHandler,
    ApprovalRequest, ChatMessage, DynamicToolCall, DynamicToolName, DynamicToolResult, EventSink,
    ProviderChunk, ProviderClient, ProviderRequest, ThreadStartResult, ToolExecutor, TurnStarted,
};
use serde_json::{json, Value};
use tauri::ipc::Channel;
use tauri::{AppHandle, Manager, State};
use tokio::sync::{mpsc, oneshot};

use crate::state::{HostError, HostState};

/// Where model traffic goes. Never a provider: `model-router` holds the provider
/// credential and is the only process allowed to reach AI Gateway.
const MODEL_ROUTER_PATH: &str = "/api/v1/agent/model/v1/chat/completions";

#[derive(Clone)]
pub struct AgentSession {
    pub host: AgentHost,
    pub approvals: Arc<ApprovalRegistry>,
    pub sink: Arc<ChannelSink>,
}

#[derive(Default)]
pub struct ApprovalRegistry {
    pending: Mutex<HashMap<String, oneshot::Sender<ApprovalDecision>>>,
}

impl ApprovalHandler for ApprovalRegistry {
    fn request(
        &self,
        request: ApprovalRequest,
    ) -> Pin<Box<dyn Future<Output = ApprovalDecision> + Send>> {
        let (sender, receiver) = oneshot::channel();
        if let Ok(mut pending) = self.pending.lock() {
            pending.insert(request.approval_request_id, sender);
        }
        Box::pin(async move { receiver.await.unwrap_or(ApprovalDecision::Deny) })
    }
}

impl ApprovalRegistry {
    pub fn resolve(
        &self,
        approval_request_id: &str,
        decision: ApprovalDecision,
    ) -> Result<(), HostError> {
        let sender = self
            .pending
            .lock()
            .map_err(|_| HostError::new("internal_error", "Approval state is unavailable", true))?
            .remove(approval_request_id)
            .ok_or_else(|| {
                HostError::new(
                    "invalid_input",
                    "Approval request is no longer pending",
                    false,
                )
            })?;
        sender.send(decision).map_err(|_| {
            HostError::new(
                "internal_error",
                "Approval request was already resolved",
                false,
            )
        })
    }
}

/// Publishes every event to the ring and, when one is attached, to the channel.
///
/// The channel is replaceable because a WebView reload destroys it while the
/// turn keeps running. `agent_attach` installs a new one and replays from the
/// last sequence the client saw.
struct ChannelSink {
    hub: Arc<edapex_agent::EventHub>,
    channel: Mutex<Option<Channel<AgentEvent>>>,
}

impl EventSink for ChannelSink {
    fn emit(&self, event: AgentEvent) {
        // Record first: the ring is the durable record, the channel is best-effort.
        let _ = self.hub.push(event.clone());
        if let Ok(guard) = self.channel.lock() {
            if let Some(channel) = guard.as_ref() {
                let _ = channel.send(event);
            }
        }
    }
}

/// The model transport.
///
/// This holds an **EdApex session token**, never a provider key. Provider
/// credentials live in AI Gateway (BYOK) and are used only by
/// `services/model-router`, so a compromised desktop holds nothing worth
/// stealing beyond a revocable session.
struct ModelRouterProvider {
    session_token: String,
    client: reqwest::Client,
    base_url: String,
}

impl ModelRouterProvider {
    fn new(session_token: String) -> Self {
        let base_url = crate::auth::api_base();
        let client = reqwest::Client::builder()
            .timeout(Duration::from_secs(120))
            .build()
            .unwrap_or_default();
        Self {
            session_token,
            client,
            base_url,
        }
    }
}

impl ProviderClient for ModelRouterProvider {
    fn stream_chat(
        &self,
        request: ProviderRequest,
    ) -> Result<mpsc::Receiver<ProviderChunk>, AgentError> {
        let (sender, receiver) = mpsc::channel(64);
        let client = self.client.clone();
        let session_token = self.session_token.clone();
        let base_url = self.base_url.clone();
        tauri::async_runtime::spawn(async move {
            if let Err(error) =
                stream_model(&client, &base_url, &session_token, request, &sender).await
            {
                let _ = sender.send(ProviderChunk::Failed(error)).await;
            }
        });
        Ok(receiver)
    }
}

fn message_json(message: &ChatMessage) -> Value {
    let mut object = serde_json::Map::new();
    object.insert("role".to_string(), json!(message.role.as_str()));
    object.insert(
        "content".to_string(),
        message
            .content
            .as_ref()
            .map(|content| json!(content))
            .unwrap_or(Value::Null),
    );
    if !message.tool_calls.is_empty() {
        let tool_calls: Vec<Value> = message
            .tool_calls
            .iter()
            .map(|call| {
                json!({
                    "id": call.id,
                    "type": "function",
                    "function": {
                        "name": call.name,
                        "arguments": call.arguments,
                    }
                })
            })
            .collect();
        object.insert("tool_calls".to_string(), Value::Array(tool_calls));
    }
    if let Some(tool_call_id) = &message.tool_call_id {
        object.insert("tool_call_id".to_string(), json!(tool_call_id));
    }
    Value::Object(object)
}

async fn stream_model(
    client: &reqwest::Client,
    base_url: &str,
    session_token: &str,
    request: ProviderRequest,
    sender: &mpsc::Sender<ProviderChunk>,
) -> Result<(), AgentError> {
    let messages: Vec<Value> = request.messages.iter().map(message_json).collect();
    let tools: Vec<Value> = request
        .tools
        .iter()
        .map(|spec| tool_spec_json(spec))
        .collect();
    let mut body = json!({
        "model": request.model,
        "messages": messages,
        "tools": tools,
        "stream": true,
    });
    if let Some(temperature) = request.temperature {
        body["temperature"] = json!(temperature);
    }

    let response = client
        .post(format!("{base_url}{MODEL_ROUTER_PATH}"))
        .bearer_auth(session_token)
        .json(&body)
        .send()
        .await
        .map_err(|error| AgentError::provider(format!("Model request: {error}")))?;

    let status = response.status();
    if !status.is_success() {
        let text = response.text().await.unwrap_or_default();
        let message: String = text.chars().take(300).collect();
        return Err(AgentError::provider(format!(
            "The model router returned {status}: {message}"
        )));
    }

    let mut response = response;
    let mut buffer = String::new();
    let mut decoder = edapex_agent::Utf8StreamDecoder::new();
    loop {
        let chunk = response
            .chunk()
            .await
            .map_err(|error| AgentError::provider(format!("Model stream: {error}")))?;
        let Some(chunk) = chunk else {
            break;
        };
        buffer.push_str(&decoder.push(&chunk));
        while let Some(event) = edapex_agent::take_sse_event(&mut buffer) {
            if process_sse_event(&event, sender).await? {
                return Ok(());
            }
        }
    }
    buffer.push_str(&decoder.finish());
    if !buffer.trim().is_empty() {
        process_sse_event(&buffer, sender).await?;
    }
    let _ = sender
        .send(ProviderChunk::Done {
            finish_reason: None,
        })
        .await;
    Ok(())
}

async fn process_sse_event(
    event: &str,
    sender: &mpsc::Sender<ProviderChunk>,
) -> Result<bool, AgentError> {
    let Some(data) = edapex_agent::sse_data_line(event) else {
        return Ok(false);
    };
    for chunk in edapex_agent::parse_openai_sse_data(data)? {
        if sender.send(chunk).await.is_err() {
            return Ok(true);
        }
    }
    Ok(false)
}

struct HostTools {
    app: AppHandle,
}

impl ToolExecutor for HostTools {
    /// Every v1 dynamic tool reaches the network or a device capture, so each
    /// one asks first. Omitting this would silently inherit the trait default
    /// (`false`) and no approval would ever be requested.
    fn requires_approval(&self, _tool: DynamicToolName) -> bool {
        true
    }

    fn execute(
        &self,
        call: DynamicToolCall,
    ) -> Pin<Box<dyn Future<Output = DynamicToolResult> + Send>> {
        let app = self.app.clone();
        Box::pin(async move {
            match call.tool {
                DynamicToolName::WebSearch => {
                    web_tool("/api/v1/agent/web/search", call.arguments).await
                }
                DynamicToolName::WebFetch => {
                    web_tool("/api/v1/agent/web/fetch", call.arguments).await
                }
                DynamicToolName::OcrExtract => {
                    let capture_id = call
                        .arguments
                        .get("captureId")
                        .and_then(Value::as_str)
                        .unwrap_or_default();
                    if capture_id.is_empty() {
                        return DynamicToolResult::failure(AgentError::invalid_input(
                            "captureId is required",
                        ));
                    }
                    let path = match app.state::<HostState>().capture_path(capture_id) {
                        Ok(path) => path,
                        Err(error) => {
                            return DynamicToolResult::failure(host_to_agent_error(error));
                        }
                    };
                    match crate::ocr::extract_path(&app, path).await {
                        Ok(result) => match serde_json::to_string(&result) {
                            Ok(text) => DynamicToolResult::text(text),
                            Err(error) => DynamicToolResult::failure(AgentError::internal(format!(
                                "OCR result: {error}"
                            ))),
                        },
                        Err(error) => DynamicToolResult::failure(host_to_agent_error(error)),
                    }
                }
            }
        })
    }
}

async fn web_tool(path: &str, arguments: Value) -> DynamicToolResult {
    match crate::api::send(reqwest::Method::POST, path.to_string(), Some(arguments), None).await {
        Ok(value) => DynamicToolResult::text(value.to_string()),
        Err(error) => DynamicToolResult::failure(host_to_agent_error(error)),
    }
}

fn host_to_agent_error(error: HostError) -> AgentError {
    let code = match error.code.as_str() {
        "unsupported_capability" => AgentErrorCode::UnsupportedCapability,
        "permission_denied" => AgentErrorCode::PermissionDenied,
        "camera_unavailable" => AgentErrorCode::CameraUnavailable,
        "cancelled" => AgentErrorCode::Cancelled,
        "auth_required" => AgentErrorCode::AuthRequired,
        "model_missing" => AgentErrorCode::ModelMissing,
        "invalid_input" => AgentErrorCode::InvalidInput,
        "quota_exceeded" => AgentErrorCode::QuotaExceeded,
        "provider_unavailable" => AgentErrorCode::ProviderUnavailable,
        _ => AgentErrorCode::InternalError,
    };
    AgentError::new(code, error.message, error.retryable)
}

fn to_host_error(error: AgentError) -> HostError {
    HostError::new(error.code.as_str(), error.message, error.retryable)
}

#[tauri::command]
pub async fn agent_connect(
    app: AppHandle,
    state: State<'_, HostState>,
    settings: AgentConnectSettings,
    channel: Channel<AgentEvent>,
) -> Result<AgentStatus, HostError> {
    let session_token = crate::auth::session_token()?.ok_or_else(|| {
        HostError::new(
            "auth_required",
            "Sign in to EdApex first",
            false,
        )
    })?;
    if let Some(previous) = state.take_agent()? {
        previous.host.close();
    }
    let approvals = Arc::new(ApprovalRegistry::default());
    let sink = Arc::new(ChannelSink {
        hub: Arc::new(edapex_agent::EventHub::default()),
        channel: Mutex::new(Some(channel)),
    });
    let host = AgentHost::connect(AgentHostOptions {
        settings,
        provider: Arc::new(ModelRouterProvider::new(session_token)),
        tools: Arc::new(HostTools { app }),
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

    let replay = session.sink.hub.since(since_seq);
    let cursor = session.sink.hub.cursor();

    // Swap the channel first, then replay, so no event emitted during replay is
    // delivered to the dead channel and lost.
    if let Ok(mut guard) = session.sink.channel.lock() {
        *guard = Some(channel.clone());
    }
    for (_, event) in replay {
        let _ = channel.send(event);
    }

    Ok(cursor)
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
    session
        .approvals
        .resolve(&approval_request_id, decision)
}

#[tauri::command]
pub async fn agent_close(state: State<'_, HostState>) -> Result<(), HostError> {
    if let Some(session) = state.take_agent()? {
        session.host.close();
    }
    Ok(())
}
