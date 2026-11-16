use std::future::Future;
use std::pin::Pin;
use std::sync::Arc;

use edapex_agent::{
    AgentError, AgentErrorCode, DynamicToolCall, DynamicToolName, DynamicToolResult, ToolExecutor,
};
use serde_json::Value;

use super::HostEnv;
use crate::state::{CaptureStore, HostError};

/// The v1 dynamic tools, executed in process.
///
/// It holds the environment rather than an `AppHandle`: that is the whole point
/// of the seam, because a resumed turn runs in a worker with no Activity.
pub struct HostTools {
    pub env: Arc<HostEnv>,
    pub captures: Arc<CaptureStore>,
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
        let env = self.env.clone();
        let captures = self.captures.clone();
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
                    let path = match captures.path_of(capture_id) {
                        Ok(path) => path,
                        Err(error) => {
                            return DynamicToolResult::failure(host_to_agent_error(error));
                        }
                    };
                    match crate::ocr::extract_path(&env, path).await {
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

pub(crate) fn host_to_agent_error(error: HostError) -> AgentError {
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

pub(crate) fn to_host_error(error: AgentError) -> HostError {
    HostError::new(error.code.as_str(), error.message, error.retryable)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::path::PathBuf;

    /// The seam's whole purpose: a tool executor built with no `AppHandle` is
    /// what a WorkManager worker can construct after a reboot.
    #[test]
    fn the_tool_executor_needs_no_application() {
        let tools = HostTools {
            env: Arc::new(HostEnv::new(
                PathBuf::from("/cache"),
                PathBuf::from("/data"),
                PathBuf::from("/res"),
            )),
            captures: Arc::new(CaptureStore::default()),
        };
        assert!(tools.requires_approval(DynamicToolName::WebSearch));
        assert!(tools.requires_approval(DynamicToolName::OcrExtract));
    }
}
