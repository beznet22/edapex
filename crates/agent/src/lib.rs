//! Thin, provider-neutral agent core.
//!
//! The host injects the HTTP transport, tool executor, approval handler and
//! event sink. The core carries no TLS stack, no TUI, no AWS/PDF/MCP runtime and
//! no multi-provider graph.

pub mod agui;
#[cfg(not(target_arch = "wasm32"))]
pub mod driver;
#[cfg(not(target_arch = "wasm32"))]
pub mod durable_conversation;
#[cfg(not(target_arch = "wasm32"))]
pub mod durable_state;
#[cfg(not(target_arch = "wasm32"))]
pub mod durable_store;
pub mod event_hub;
#[cfg(not(target_arch = "wasm32"))]
pub mod infinity_provider;
pub mod interrupt;
#[cfg(not(target_arch = "wasm32"))]
pub mod projection;
pub mod protocol;
pub mod provider;
pub mod recorder;
pub mod runtime;
#[cfg(not(target_arch = "wasm32"))]
pub mod session;
pub mod session_protocol;
pub mod spawn;
pub mod stream;
pub mod tool_bridge;

pub use agui::{AgUiBridge, AgUiEvent};
#[cfg(not(target_arch = "wasm32"))]
pub use driver::{NativeAgentDriver, SessionCommandReceipt};
#[cfg(not(target_arch = "wasm32"))]
pub use durable_conversation::DurableConversationStore;
#[cfg(not(target_arch = "wasm32"))]
pub use durable_state::DurableStateStore;
#[cfg(not(target_arch = "wasm32"))]
pub use durable_store::{DurableAgentStores, DurableStoreError, StoreContext};
pub use event_hub::{EventHub, DEFAULT_CAPACITY};
#[cfg(not(target_arch = "wasm32"))]
pub use infinity_provider::{EdApexModelProvider, EdApexModelSource};
pub use interrupt::InterruptSignal;
pub use protocol::{
    AgentConnectSettings, AgentError, AgentErrorCode, AgentEvent, AgentStatus, AgentTurnInput,
    ApprovalDecision, ApprovalRequest, CapabilityRisk, DynamicToolCall, DynamicToolContent,
    DynamicToolName, DynamicToolResult, DynamicToolSpec, ThreadStartResult, ToolCompletionStatus,
    TurnCompletionStatus, TurnStarted,
};
pub use provider::{
    parse_openai_sse_data, tool_spec_json, ChatMessage, ProviderChunk, ProviderClient,
    ProviderRequest, ProviderToolSpec, Role, ToolCall,
};
pub use recorder::{RunStart, TurnRecorder};
pub use runtime::{
    initial_history, AgentHost, AgentHostOptions, ApprovalFailure, ApprovalHandler, EventSink,
    HostFuture, HostObject, ToolExecutor,
};
pub use session_protocol::{
    SessionCommand, SessionDeletion, SessionMessage, SessionMessageRole, SessionMessageVersion,
    SessionQueueItem, SessionSyncAcknowledgement, SessionSyncAcknowledgementStatus,
    SessionSyncEvent, SessionSyncEventKind, SessionSyncPullResult, SessionSyncPush,
    SessionSyncPushResult, SessionTruncation, SessionView,
};
pub use stream::{sse_data_line, take_sse_event, Utf8StreamDecoder};
pub use tool_bridge::{ActiveTurnRegistry, EdApexTool};
