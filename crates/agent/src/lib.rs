//! Thin, provider-neutral agent core.
//!
//! The host injects the HTTP transport, tool executor, approval handler and
//! event sink. The core carries no TLS stack, no TUI, no AWS/PDF/MCP runtime and
//! no multi-provider graph.

pub mod agui;
pub mod protocol;
pub mod provider;
pub mod runtime;

pub use agui::{AgUiBridge, AgUiEvent};
pub use protocol::{
    AgentConnectSettings, AgentError, AgentErrorCode, AgentEvent, AgentStatus, AgentTurnInput,
    ApprovalDecision, ApprovalRequest, CapabilityRisk, DynamicToolCall, DynamicToolContent,
    DynamicToolName, DynamicToolResult, DynamicToolSpec, ThreadStartResult, ToolCompletionStatus,
    TurnCompletionStatus, TurnStarted,
};
pub use provider::{
    parse_openai_sse_data, tool_spec_json, ChatMessage, ProviderChunk, ProviderClient,
    ProviderRequest, Role, ToolCall,
};
pub use runtime::{AgentHost, AgentHostOptions, ApprovalHandler, EventSink, ToolExecutor};
