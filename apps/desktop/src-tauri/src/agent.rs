use std::collections::HashMap;
use std::future::Future;
use std::pin::Pin;
use std::sync::{Arc, Mutex};
use std::time::Duration;

use edapex_agent::{
    parse_openai_sse_data, tool_spec_json, AgentConnectSettings, AgentError, AgentErrorCode,
    AgentEvent, AgentHost, AgentHostOptions, AgentStatus, AgentTurnInput, ApprovalDecision,
    ApprovalHandler, ApprovalRequest, ChatMessage, DynamicToolCall, DynamicToolName,
    DynamicToolResult, EventSink, ProviderChunk, ProviderClient, ProviderRequest, ThreadStartResult,
    TurnStarted,
};
use serde_json::{json, Value};
use tauri::ipc::Channel;
use tauri::{AppHandle, Manager, State};
use tokio::sync::{mpsc, oneshot};

use crate::state::{HostError, HostState};

const KEYRING_SERVICE: &str = "ng.llacademy.edapex";
const OPENROUTER_ACCOUNT: &str = "openrouter";
const DEFAULT_OPENROUTER_BASE: &str = "https://openrouter.ai/api/v1";

#[derive(Clone)]
pub struct AgentSession {
    pub host: AgentHost,
    pub approvals: Arc<ApprovalRegistry>,
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

struct ChannelSink {
    channel: Channel<AgentEvent>,
}

impl EventSink for ChannelSink {
    fn emit(&self, event: AgentEvent) {
        let _ = self.channel.send(event);
    }
}

struct OpenRouterProvider {
    api_key: String,
    client: reqwest::Client,
    base_url: String,
}

impl OpenRouterProvider {
    fn new(api_key: String) -> Self {
        let base_url = std::env::var("EDAPEX_OPENROUTER_BASE")
            .unwrap_or_else(|_| DEFAULT_OPENROUTER_BASE.to_string());
        let client = reqwest::Client::builder()
            .timeout(Duration::from_secs(120))
            .build()
            .unwrap_or_default();
        Self {
            api_key,
            client,
            base_url,
        }
    }
}

impl ProviderClient for OpenRouterProvider {
    fn stream_chat(
        &self,
        request: ProviderRequest,
    ) -> Result<mpsc::Receiver<ProviderChunk>, AgentError> {
        let (sender, receiver) = mpsc::channel(64);
        let client = self.client.clone();
        let api_key = self.api_key.clone();
        let base_url = self.base_url.clone();
        tauri::async_runtime::spawn(async move {
            if let Err(error) =
                stream_openrouter(&client, &base_url, &api_key, request, &sender).await
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

async fn stream_openrouter(
    client: &reqwest::Client,
    base_url: &str,
    api_key: &str,
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
        .post(format!("{base_url}/chat/completions"))
        .bearer_auth(api_key)
        .header("HTTP-Referer", "https://app.llacademy.ng")
        .header("X-Title", "EdApex Work")
        .json(&body)
        .send()
        .await
        .map_err(|error| AgentError::provider(format!("OpenRouter request: {error}")))?;

    let status = response.status();
    if !status.is_success() {
        let text = response.text().await.unwrap_or_default();
        let message: String = text.chars().take(300).collect();
        return Err(AgentError::provider(format!(
            "OpenRouter returned {status}: {message}"
        )));
    }

    let mut response = response;
    let mut buffer = String::new();
    loop {
        let chunk = response
            .chunk()
            .await
            .map_err(|error| AgentError::provider(format!("OpenRouter stream: {error}")))?;
        let Some(chunk) = chunk else {
            break;
        };
        let text = String::from_utf8_lossy(&chunk).replace("\r\n", "\n");
        buffer.push_str(&text);
        while let Some(index) = buffer.find("\n\n") {
            let event: String = buffer.drain(..index + 2).collect();
            if process_sse_event(&event, sender).await? {
                return Ok(());
            }
        }
    }
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
    for line in event.lines() {
        let Some(data) = line.strip_prefix("data:") else {
            continue;
        };
        let data = data.trim();
        if data.is_empty() {
            continue;
        }
        if data == " 
            if sender.send(chunk).await.is_err() {
                return Ok(true);
            }
        }
    }
    Ok(false)
}

struct HostTools {
    app: AppHandle,
}

impl ToolExecutor for HostTools {
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

fn keyring_entry() -> Result<keyring::Entry, HostError> {
    keyring::Entry::new(KEYRING_SERVICE, OPENROUTER_ACCOUNT).map_err(|error| {
        HostError::new(
            "internal_error",
            format!("Open the system keychain: {error}"),
            false,
        )
    })
}

fn load_openrouter_key() -> Result<Option<String>, HostError> {
    match keyring_entry()?.get_password() {
        Ok(key) if !key.trim().is_empty() => Ok(Some(key)),
        Ok(_) => Ok(None),
        Err(keyring::Error::NoEntry) => Ok(None),
        Err(error) => Err(HostError::new(
            "internal_error",
            format!("Read the OpenRouter key: {error}"),
            false,
        )),
    }
}

fn store_openrouter_key(key: &str) -> Result<(), HostError> {
    keyring_entry()?.set_password(key).map_err(|error| {
        HostError::new(
            "internal_error",
            format!("Store the OpenRouter key: {error}"),
            false,
        )
    })
}

fn clear_openrouter_key() -> Result<(), HostError> {
    match keyring_entry()?.delete_credential() {
        Ok(()) | Err(keyring::Error::NoEntry) => Ok(()),
        Err(error) => Err(HostError::new(
            "internal_error",
            format!("Clear the OpenRouter key: {error}"),
            false,
        )),
    }
}

#[tauri::command]
pub async fn agent_set_openrouter_key(api_key: String) -> Result<(), HostError> {
    let trimmed = api_key.trim();
    if trimmed.is_empty() {
        clear_openrouter_key()
    } else {
        store_openrouter_key(trimmed)
    }
}

#[tauri::command]
pub async fn agent_connect(
    app: AppHandle,
    state: State<'_, HostState>,
    settings: AgentConnectSettings,
    channel: Channel<AgentEvent>,
) -> Result<AgentStatus, HostError> {
    let key = load_openrouter_key()?.ok_or_else(|| {
        HostError::new(
            "auth_required",
            "Add an OpenRouter API key in Settings",
            false,
        )
    })?;
    if let Some(previous) = state.take_agent()? {
        previous.host.close();
    }
    let approvals = Arc::new(ApprovalRegistry::default());
    let host = AgentHost::connect(AgentHostOptions {
        settings,
        provider: Arc::new(OpenRouterProvider::new(key)),
        tools: Arc::new(HostTools { app }),
        approvals: approvals.clone(),
        events: Arc::new(ChannelSink { channel }),
    })
    .map_err(to_host_error)?;
    let status = host.status();
    state.set_agent(AgentSession { host, approvals })?;
    Ok(status)
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
