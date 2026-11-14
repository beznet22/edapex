use serde::{Deserialize, Serialize};
use serde_json::Value;
use thiserror::Error;

/// Error codes are the closed set shared with `packages/contracts/src/platform.ts`.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum AgentErrorCode {
    UnsupportedCapability,
    PermissionDenied,
    CameraUnavailable,
    Cancelled,
    AuthRequired,
    ModelMissing,
    InvalidInput,
    ProviderUnavailable,
    QuotaExceeded,
    InternalError,
}

impl AgentErrorCode {
    pub fn as_str(self) -> &'static str {
        match self {
            Self::UnsupportedCapability => "unsupported_capability",
            Self::PermissionDenied => "permission_denied",
            Self::CameraUnavailable => "camera_unavailable",
            Self::Cancelled => "cancelled",
            Self::AuthRequired => "auth_required",
            Self::ModelMissing => "model_missing",
            Self::InvalidInput => "invalid_input",
            Self::ProviderUnavailable => "provider_unavailable",
            Self::QuotaExceeded => "quota_exceeded",
            Self::InternalError => "internal_error",
        }
    }
}

#[derive(Debug, Clone, Error, Serialize, Deserialize, PartialEq)]
#[error("{message}")]
pub struct AgentError {
    pub code: AgentErrorCode,
    pub message: String,
    pub retryable: bool,
}

impl AgentError {
    pub fn new(code: AgentErrorCode, message: impl Into<String>, retryable: bool) -> Self {
        Self {
            code,
            message: message.into(),
            retryable,
        }
    }

    pub fn unsupported(message: impl Into<String>) -> Self {
        Self::new(AgentErrorCode::UnsupportedCapability, message, false)
    }

    pub fn auth_required() -> Self {
        Self::new(
            AgentErrorCode::AuthRequired,
            "Sign in to EdApex first",
            false,
        )
    }

    pub fn invalid_input(message: impl Into<String>) -> Self {
        Self::new(AgentErrorCode::InvalidInput, message, false)
    }

    pub fn provider(message: impl Into<String>) -> Self {
        Self::new(AgentErrorCode::ProviderUnavailable, message, true)
    }

    pub fn cancelled() -> Self {
        Self::new(AgentErrorCode::Cancelled, "The turn was stopped", false)
    }

    pub fn internal(message: impl Into<String>) -> Self {
        Self::new(AgentErrorCode::InternalError, message, true)
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum CapabilityRisk {
    Read,
    Write,
    Destructive,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ApprovalDecision {
    AllowOnce,
    AllowForSession,
    Deny,
    Abort,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ToolCompletionStatus {
    Completed,
    Failed,
    Blocked,
    Declined,
    Refused,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum TurnCompletionStatus {
    Completed,
    Stopped,
    Error,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum DynamicToolName {
    WebSearch,
    WebFetch,
    OcrExtract,
}

impl DynamicToolName {
    pub fn as_str(self) -> &'static str {
        match self {
            Self::WebSearch => "web_search",
            Self::WebFetch => "web_fetch",
            Self::OcrExtract => "ocr_extract",
        }
    }

    pub fn parse(value: &str) -> Option<Self> {
        match value {
            "web_search" => Some(Self::WebSearch),
            "web_fetch" => Some(Self::WebFetch),
            "ocr_extract" => Some(Self::OcrExtract),
            _ => None,
        }
    }

    /// Every dynamic tool is a network or device read in v1. This is the single
    /// place the risk is declared, so adding a write-capable tool cannot inherit
    /// a read risk by omission.
    pub fn risk(self) -> CapabilityRisk {
        match self {
            Self::WebSearch | Self::WebFetch | Self::OcrExtract => CapabilityRisk::Read,
        }
    }

    /// The decisions the server offers for this tool.
    ///
    /// Destructive and write tools do not offer session approval until policy
    /// allows it, so `AllowForSession` must not be handed out unconditionally.
    pub fn approval_decisions(self) -> Vec<ApprovalDecision> {
        match self.risk() {
            CapabilityRisk::Read => vec![
                ApprovalDecision::AllowOnce,
                ApprovalDecision::AllowForSession,
                ApprovalDecision::Deny,
                ApprovalDecision::Abort,
            ],
            CapabilityRisk::Write => vec![
                ApprovalDecision::AllowOnce,
                ApprovalDecision::Deny,
                ApprovalDecision::Abort,
            ],
            CapabilityRisk::Destructive => vec![ApprovalDecision::Deny, ApprovalDecision::Abort],
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DynamicToolSpec {
    pub name: DynamicToolName,
    pub description: String,
    pub input_schema: Value,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DynamicToolCall {
    pub call_id: String,
    pub tool: DynamicToolName,
    pub arguments: Value,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum DynamicToolContent {
    Text { text: String },
    Image { image_url: String },
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DynamicToolResult {
    pub success: bool,
    pub content: Vec<DynamicToolContent>,
    pub error: Option<AgentError>,
}

impl DynamicToolResult {
    pub fn text(text: impl Into<String>) -> Self {
        Self {
            success: true,
            content: vec![DynamicToolContent::Text { text: text.into() }],
            error: None,
        }
    }

    pub fn failure(error: AgentError) -> Self {
        Self {
            success: false,
            content: Vec::new(),
            error: Some(error),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentStatus {
    pub connected: bool,
    pub thread_id: Option<String>,
    pub model: String,
    pub mobile_safe_tools: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentConnectSettings {
    pub workspace_id: String,
    pub model: String,
    pub mobile_safe_tools: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentTurnInput {
    pub thread_id: String,
    pub text: String,
    #[serde(default)]
    pub attachment_capture_ids: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ThreadStartResult {
    pub thread_id: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TurnStarted {
    pub turn_id: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ApprovalRequest {
    pub approval_request_id: String,
    pub title: String,
    pub description: String,
    pub risk: CapabilityRisk,
    pub decisions: Vec<ApprovalDecision>,
}

/// The exact wire union consumed by `packages/contracts/src/agent.ts`.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(
    tag = "type",
    rename_all = "snake_case",
    rename_all_fields = "camelCase"
)]
pub enum AgentEvent {
    Connected {
        thread_id: Option<String>,
    },
    TurnStarted {
        thread_id: String,
        turn_id: String,
    },
    MessageDelta {
        thread_id: String,
        turn_id: String,
        item_id: String,
        delta: String,
    },
    ReasoningDelta {
        thread_id: String,
        turn_id: String,
        item_id: String,
        delta: String,
    },
    ToolStarted {
        thread_id: String,
        turn_id: String,
        tool_call_id: String,
        name: String,
        summary: String,
    },
    ToolCompleted {
        thread_id: String,
        turn_id: String,
        tool_call_id: String,
        name: String,
        status: ToolCompletionStatus,
        detail: Option<String>,
    },
    ApprovalRequested {
        thread_id: String,
        turn_id: String,
        approval_request_id: String,
        title: String,
        description: String,
        risk: CapabilityRisk,
        decisions: Vec<ApprovalDecision>,
    },
    ApprovalResolved {
        thread_id: String,
        turn_id: String,
        approval_request_id: String,
        decision: ApprovalDecision,
    },
    TurnCompleted {
        thread_id: String,
        turn_id: String,
        status: TurnCompletionStatus,
    },
    Error {
        thread_id: Option<String>,
        turn_id: Option<String>,
        error: AgentError,
    },
    Interrupted {
        thread_id: String,
        turn_id: String,
        reason: String,
    },
}
