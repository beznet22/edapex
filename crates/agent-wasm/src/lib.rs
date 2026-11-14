//! Browser surface for the thin agent core.
//!
//! The host injects transport. This crate performs no network call of its own;
//! when the core wants a provider stream it invokes a JavaScript callback with the
//! request as JSON, and the caller pushes chunks back through `push_chunk`. The
//! core therefore stays free of `fetch`, TLS and every browser API.
//!
//! Chunks cannot be drained eagerly: the JavaScript fetch does not start until
//! `stream_chat` has returned, so `ChunkQueue` is a rendezvous that waits for the
//! host to produce the next item rather than a buffer polled once.

#![cfg(target_arch = "wasm32")]

use std::collections::VecDeque;
use std::sync::{Arc, Mutex};

use edapex_agent::{
    parse_openai_sse_data, sse_data_line, take_sse_event, AgentConnectSettings, AgentError,
    AgentErrorCode, AgentEvent, AgentHost, AgentHostOptions, AgentTurnInput, ApprovalDecision,
    ApprovalHandler, ApprovalRequest, DynamicToolCall, DynamicToolName, DynamicToolResult,
    EventSink, HostFuture, ProviderChunk, ProviderClient, ProviderRequest, ToolExecutor,
    Utf8StreamDecoder,
};
use js_sys::Function;
use tokio::sync::{mpsc, oneshot};
use wasm_bindgen::prelude::*;

type QueueItem = Result<ProviderChunk, AgentError>;

/// Rendezvous between a running turn and the JavaScript transport.
#[derive(Default)]
struct ChunkQueue {
    state: Mutex<QueueState>,
}

#[derive(Default)]
struct QueueState {
    items: VecDeque<QueueItem>,
    closed: bool,
    waker: Option<oneshot::Sender<()>>,
}

impl ChunkQueue {
    fn push(&self, item: QueueItem) {
        let mut state = self.state.lock().expect("queue mutex");
        state.items.push_back(item);
        if let Some(waker) = state.waker.take() {
            let _ = waker.send(());
        }
    }

    fn close(&self) {
        let mut state = self.state.lock().expect("queue mutex");
        state.closed = true;
        if let Some(waker) = state.waker.take() {
            let _ = waker.send(());
        }
    }

    /// Wait for the next chunk, or `None` once the transport has ended.
    async fn recv(&self) -> Option<QueueItem> {
        loop {
            let waiter = {
                let mut state = self.state.lock().expect("queue mutex");
                if let Some(item) = state.items.pop_front() {
                    return Some(item);
                }
                if state.closed {
                    return None;
                }
                let (tx, rx) = oneshot::channel();
                state.waker = Some(tx);
                rx
            };
            // A replaced waker drops the sender, so re-check rather than trusting
            // the result of the await.
            let _ = waiter.await;
        }
    }
}

struct JsProvider {
    queue: Arc<ChunkQueue>,
    on_request: Function,
}

impl ProviderClient for JsProvider {
    fn stream_chat(
        &self,
        request: ProviderRequest,
    ) -> Result<mpsc::Receiver<ProviderChunk>, AgentError> {
        let encoded = serde_json::to_string(&ProviderRequestWire::from(&request))
            .map_err(|error| AgentError::provider(format!("Encode request: {error}")))?;

        // Hand the request to JavaScript. The fetch it starts calls back into
        // `push_chunk`, so this must return without waiting.
        self.on_request
            .call1(&JsValue::NULL, &JsValue::from_str(&encoded))
            .map_err(|_| AgentError::provider("The browser transport failed"))?;

        let queue = Arc::clone(&self.queue);
        let (tx, rx) = mpsc::channel::<ProviderChunk>(64);
        wasm_bindgen_futures::spawn_local(async move {
            while let Some(item) = queue.recv().await {
                match item {
                    Ok(chunk) => {
                        if tx.send(chunk).await.is_err() {
                            return;
                        }
                    }
                    Err(error) => {
                        let _ = tx.send(ProviderChunk::Failed(error)).await;
                        return;
                    }
                }
            }
        });
        Ok(rx)
    }
}

/// Wire shape sent to JavaScript, and forwarded verbatim to the provider.
///
/// This is OpenAI's schema, not a local envelope: `model-router` hands the body
/// straight to the upstream provider, so a camelCase field here would be dropped
/// as an unknown key and tool results would silently lose their correlation id.
#[derive(serde::Serialize)]
struct ProviderRequestWire {
    model: String,
    messages: Vec<MessageWire>,
    tools: Vec<serde_json::Value>,
    #[serde(skip_serializing_if = "Option::is_none")]
    temperature: Option<f32>,
    /// Always streamed. Without this the provider answers with one JSON document
    /// and the incremental reader never sees a `data:` frame.
    stream: bool,
}

#[derive(serde::Serialize)]
struct MessageWire {
    role: &'static str,
    content: Option<String>,
    #[serde(skip_serializing_if = "Vec::is_empty")]
    tool_calls: Vec<ToolCallWire>,
    #[serde(skip_serializing_if = "Option::is_none")]
    tool_call_id: Option<String>,
}

#[derive(serde::Serialize)]
struct ToolCallWire {
    id: String,
    #[serde(rename = "type")]
    kind: &'static str,
    function: ToolCallFunctionWire,
}

#[derive(serde::Serialize)]
struct ToolCallFunctionWire {
    name: String,
    arguments: String,
}

impl From<&ProviderRequest> for ProviderRequestWire {
    fn from(request: &ProviderRequest) -> Self {
        Self {
            model: request.model.clone(),
            messages: request
                .messages
                .iter()
                .map(|message| MessageWire {
                    role: message.role.as_str(),
                    content: message.content.as_ref().map(|text| text.to_string()),
                    tool_calls: message
                        .tool_calls
                        .iter()
                        .map(|call| ToolCallWire {
                            id: call.id.clone(),
                            kind: "function",
                            function: ToolCallFunctionWire {
                                name: call.name.clone(),
                                arguments: call.arguments.clone(),
                            },
                        })
                        .collect(),
                    tool_call_id: message.tool_call_id.clone(),
                })
                .collect(),
            tools: request
                .tools
                .iter()
                .map(edapex_agent::tool_spec_json)
                .collect(),
            temperature: request.temperature,
            stream: true,
        }
    }
}

/// Invoke a JavaScript callback and await its result.
///
/// Tools and approvals are asynchronous in a browser: both are network or human
/// round-trips, and neither can be answered synchronously. The callback may
/// return a string or a promise of one; both are accepted so a trivial handler
/// stays simple.
async fn call_js_value(callback: &Function, argument: &str) -> Option<String> {
    let value = callback
        .call1(&JsValue::NULL, &JsValue::from_str(argument))
        .ok()?;

    if let Some(text) = value.as_string() {
        return Some(text);
    }
    if !value.is_instance_of::<js_sys::Promise>() {
        return None;
    }
    let resolved = wasm_bindgen_futures::JsFuture::from(js_sys::Promise::from(value))
        .await
        .ok()?;
    resolved.as_string()
}

fn js_error(message: impl Into<String>) -> JsValue {
    JsValue::from_str(&message.into())
}

/// Events are forwarded to JavaScript, which owns every rendering decision.
struct JsEventSink {
    on_event: Function,
}

impl EventSink for JsEventSink {
    fn emit(&self, event: AgentEvent) {
        if let Ok(encoded) = serde_json::to_string(&event) {
            let _ = self
                .on_event
                .call1(&JsValue::NULL, &JsValue::from_str(&encoded));
        }
    }
}

/// Tools run in the host, which holds the EdApex session.
struct JsToolExecutor {
    on_tool: Function,
}

impl ToolExecutor for JsToolExecutor {
    fn requires_approval(&self, _tool: DynamicToolName) -> bool {
        true
    }

    fn execute(&self, call: DynamicToolCall) -> HostFuture<'_, DynamicToolResult> {
        Box::pin(async move {
            let Ok(encoded) = serde_json::to_string(&call) else {
                return DynamicToolResult::failure(AgentError::internal("Encode tool call"));
            };
            let Some(text) = call_js_value(&self.on_tool, &encoded).await else {
                return DynamicToolResult::failure(AgentError::internal("Tool executor failed"));
            };
            match serde_json::from_str(&text) {
                Ok(result) => result,
                Err(_) => DynamicToolResult::failure(AgentError::internal("Invalid tool result")),
            }
        })
    }
}

struct JsApprovalHandler {
    on_approval: Function,
}

impl ApprovalHandler for JsApprovalHandler {
    fn request(&self, request: ApprovalRequest) -> HostFuture<'_, ApprovalDecision> {
        Box::pin(async move {
            let Ok(encoded) = serde_json::to_string(&request) else {
                return ApprovalDecision::Deny;
            };
            let Some(text) = call_js_value(&self.on_approval, &encoded).await else {
                return ApprovalDecision::Deny;
            };
            match Some(text.as_str()) {
                Some("allow_once") => ApprovalDecision::AllowOnce,
                Some("allow_for_session") => ApprovalDecision::AllowForSession,
                Some("abort") => ApprovalDecision::Abort,
                // An unrecognised answer fails closed.
                _ => ApprovalDecision::Deny,
            }
        })
    }
}

/// A connected browser agent.
#[wasm_bindgen]
pub struct WasmAgent {
    host: AgentHost,
    queue: Arc<ChunkQueue>,
}

#[wasm_bindgen]
impl WasmAgent {
    /// Create a browser agent.
    ///
    /// `on_request` receives the provider request JSON and must drive the fetch,
    /// calling `push_chunk` per chunk and `end_stream` when finished. `on_event`
    /// receives each `AgentEvent` as JSON. `on_tool` resolves a `DynamicToolCall`
    /// to a `DynamicToolResult` JSON string. `on_approval` receives an
    /// `ApprovalRequest` and returns a decision string.
    #[wasm_bindgen(constructor)]
    pub fn new(
        settings: JsValue,
        on_request: Function,
        on_event: Function,
        on_tool: Function,
        on_approval: Function,
    ) -> Result<WasmAgent, JsValue> {
        let settings: AgentConnectSettings = serde_json::from_str(
            settings
                .as_string()
                .ok_or_else(|| js_error("settings must be a JSON string"))?
                .as_str(),
        )
        .map_err(|error| js_error(format!("Invalid settings: {error}")))?;

        let queue = Arc::new(ChunkQueue::default());
        let host = AgentHost::connect(AgentHostOptions {
            settings,
            provider: Arc::new(JsProvider {
                queue: Arc::clone(&queue),
                on_request,
            }),
            tools: Arc::new(JsToolExecutor { on_tool }),
            approvals: Arc::new(JsApprovalHandler { on_approval }),
            events: Arc::new(JsEventSink { on_event }),
        })
        .map_err(|error| js_error(error.message))?;

        Ok(Self { host, queue })
    }

    /// Queue one provider chunk (a serialized `ProviderChunk`).
    pub fn push_chunk(&self, chunk: &str) -> Result<(), JsValue> {
        let chunk: ProviderChunk = serde_json::from_str(chunk)
            .map_err(|error| js_error(format!("Invalid chunk: {error}")))?;
        self.queue.push(Ok(chunk));
        Ok(())
    }

    /// Queue a provider failure.
    pub fn push_error(&self, code: &str, message: &str) {
        self.queue.push(Err(AgentError::new(
            error_code_from_str(code),
            message.to_string(),
            true,
        )));
    }

    /// Signal that the provider stream has ended.
    pub fn end_stream(&self) {
        self.queue.close();
    }

    /// Start a thread and return its id.
    pub fn thread_start(&self) -> Result<String, JsValue> {
        self.host
            .thread_start(None)
            .map(|result| result.thread_id)
            .map_err(|error| js_error(error.message))
    }

    pub fn status(&self) -> Result<String, JsValue> {
        serde_json::to_string(&self.host.status())
            .map_err(|error| js_error(format!("Encode status: {error}")))
    }

    /// Start a turn. Resolves as soon as the turn is **accepted**; events arrive
    /// through the event sink while it runs, and completion is reported as a
    /// `turn_completed` event. Awaiting the whole turn here would leave the UI
    /// unable to show progress and Stop with nothing to cancel.
    pub async fn turn_start(&self, thread_id: &str, text: &str) -> Result<String, JsValue> {
        let started = self
            .host
            .turn_start(AgentTurnInput {
                thread_id: thread_id.to_string(),
                text: text.to_string(),
                attachment_capture_ids: Vec::new(),
            })
            .await
            .map_err(|error| js_error(error.message))?;
        Ok(started.turn_id)
    }

    pub fn interrupt(&self, thread_id: &str, turn_id: &str) -> Result<(), JsValue> {
        self.host
            .interrupt(thread_id, turn_id)
            .map_err(|error| js_error(error.message))
    }

    pub fn close(&self) {
        self.queue.close();
        self.host.close();
    }
}

fn error_code_from_str(value: &str) -> AgentErrorCode {
    match value {
        "unsupported_capability" => AgentErrorCode::UnsupportedCapability,
        "permission_denied" => AgentErrorCode::PermissionDenied,
        "camera_unavailable" => AgentErrorCode::CameraUnavailable,
        "cancelled" => AgentErrorCode::Cancelled,
        "auth_required" => AgentErrorCode::AuthRequired,
        "model_missing" => AgentErrorCode::ModelMissing,
        "invalid_input" => AgentErrorCode::InvalidInput,
        "quota_exceeded" => AgentErrorCode::QuotaExceeded,
        _ => AgentErrorCode::ProviderUnavailable,
    }
}

/// Decode one SSE `data:` payload into normalized chunks.
///
/// Exposed so the browser transport parses exactly what the native hosts parse.
#[wasm_bindgen(js_name = parseSseData)]
pub fn parse_sse_data(data: &str) -> Result<String, JsValue> {
    let chunks = parse_openai_sse_data(data).map_err(|error| js_error(error.message))?;
    serde_json::to_string(&chunks).map_err(|error| js_error(format!("Encode chunks: {error}")))
}

/// Streaming SSE framer used by the browser fetch loop.
#[wasm_bindgen]
pub struct SseFramer {
    buffer: String,
    decoder: Utf8StreamDecoder,
}

impl Default for SseFramer {
    fn default() -> Self {
        Self::new()
    }
}

#[wasm_bindgen]
impl SseFramer {
    #[wasm_bindgen(constructor)]
    pub fn new() -> SseFramer {
        Self {
            buffer: String::new(),
            decoder: Utf8StreamDecoder::new(),
        }
    }

    /// Append raw bytes and return every complete `data:` payload as a JSON array.
    pub fn push(&mut self, bytes: &[u8]) -> Result<String, JsValue> {
        self.buffer.push_str(&self.decoder.push(bytes));
        let mut events = Vec::new();
        while let Some(event) = take_sse_event(&mut self.buffer) {
            if let Some(data) = sse_data_line(&event) {
                events.push(data.to_string());
            }
        }
        serde_json::to_string(&events).map_err(|error| js_error(format!("Encode events: {error}")))
    }

    /// Flush a truncated trailing character and any final partial event.
    pub fn finish(&mut self) -> Result<String, JsValue> {
        self.buffer.push_str(&self.decoder.finish());
        let trailing = std::mem::take(&mut self.buffer);
        serde_json::to_string(&sse_data_line(&trailing))
            .map_err(|error| js_error(format!("Encode trailing event: {error}")))
    }
}

/// Constructor for hosts that cannot use `new`.
#[wasm_bindgen(js_name = createSseFramer)]
pub fn create_sse_framer() -> SseFramer {
    SseFramer::new()
}

/// Version of the wire contract this build speaks.
///
/// Mirrors `AGENT_CONTRACT_VERSION` in `packages/contracts/src/agent.ts`.
#[wasm_bindgen(js_name = contractVersion)]
pub fn contract_version() -> u32 {
    1
}
