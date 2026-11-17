use std::collections::HashMap;
use std::sync::{Arc, Mutex};

use async_trait::async_trait;
use infinity_agent_core::system::local::ChannelSender;
use infinity_agent_core::tools::{Tool, ToolContext};
use infinity_provider_protocol::{Image, ImageSource, Text, ToolResult, ToolResultContent};
use rap_protocol::{ProviderCallId, ToolCallId};
use serde_json::{json, Value};
use uuid::Uuid;

use crate::protocol::{
    AgentEvent, ApprovalDecision, ApprovalRequest, DynamicToolCall, DynamicToolResult,
    DynamicToolSpec, ToolCompletionStatus,
};
use crate::runtime::{ApprovalHandler, EventSink, ToolExecutor};

#[derive(Default)]
pub struct ActiveTurnRegistry {
    turns: Mutex<HashMap<String, String>>,
    aliases: Mutex<HashMap<String, String>>,
}

impl ActiveTurnRegistry {
    pub fn begin(&self, thread_id: &str, turn_id: &str) {
        if let Ok(mut turns) = self.turns.lock() {
            turns.insert(thread_id.to_string(), turn_id.to_string());
        }
        self.alias(thread_id, thread_id);
    }

    pub fn alias(&self, thread_id: &str, root_thread_id: &str) {
        if let Ok(mut aliases) = self.aliases.lock() {
            aliases.insert(thread_id.to_string(), root_thread_id.to_string());
        }
    }

    pub fn end(&self, thread_id: &str, turn_id: &str) {
        if self.get(thread_id).as_deref() == Some(turn_id) {
            if let Ok(mut turns) = self.turns.lock() {
                turns.remove(thread_id);
            }
            if let Ok(mut aliases) = self.aliases.lock() {
                aliases.retain(|child, root| child != thread_id && root != thread_id);
            }
        }
    }

    fn get(&self, thread_id: &str) -> Option<String> {
        let root = self
            .aliases
            .lock()
            .ok()?
            .get(thread_id)
            .cloned()
            .unwrap_or_else(|| thread_id.to_string());
        self.turns.lock().ok()?.get(&root).cloned()
    }
}

pub struct EdApexTool {
    spec: DynamicToolSpec,
    executor: Arc<dyn ToolExecutor>,
    approvals: Arc<dyn ApprovalHandler>,
    events: Arc<dyn EventSink>,
    active_turns: Arc<ActiveTurnRegistry>,
}

impl EdApexTool {
    pub fn new(
        spec: DynamicToolSpec,
        executor: Arc<dyn ToolExecutor>,
        approvals: Arc<dyn ApprovalHandler>,
        events: Arc<dyn EventSink>,
        active_turns: Arc<ActiveTurnRegistry>,
    ) -> Self {
        Self {
            spec,
            executor,
            approvals,
            events,
            active_turns,
        }
    }
}

#[cfg_attr(not(target_arch = "wasm32"), async_trait)]
#[cfg_attr(target_arch = "wasm32", async_trait(?Send))]
impl Tool<ChannelSender> for EdApexTool {
    fn name(&self) -> &str {
        self.spec.name.as_str()
    }

    fn description(&self) -> &str {
        &self.spec.description
    }

    fn parameters(&self) -> Value {
        self.spec.input_schema.clone()
    }

    async fn execute(
        &self,
        _args: Value,
        _id: ToolCallId,
        _call_id: Option<ProviderCallId>,
        _context: &ToolContext<ChannelSender>,
    ) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
        Err(std::io::Error::new(
            std::io::ErrorKind::Unsupported,
            "EdApex external tools execute through their synchronous approval boundary",
        )
        .into())
    }

    fn supports_sync(&self) -> bool {
        true
    }

    async fn execute_synchronous(
        &self,
        args: &Value,
        id: &ToolCallId<str>,
        call_id: Option<&ProviderCallId<str>>,
        context: &ToolContext<ChannelSender>,
    ) -> Option<ToolResult> {
        let thread_id = context.group_id.to_string();
        let Some(turn_id) = self.active_turns.get(&thread_id) else {
            return Some(error_result(
                id,
                call_id,
                "The active turn ended before tool execution",
            ));
        };

        self.events.emit(AgentEvent::ToolStarted {
            thread_id: thread_id.clone(),
            turn_id: turn_id.clone(),
            tool_call_id: id.to_string(),
            name: self.spec.name.as_str().to_string(),
            summary: args.to_string(),
        });

        if self.executor.requires_approval(self.spec.name) {
            let approval_request_id = Uuid::new_v4().to_string();
            let request = ApprovalRequest {
                approval_request_id: approval_request_id.clone(),
                title: format!("Approve {}", self.spec.name.as_str()),
                description: format!(
                    "Allow {} with these arguments: {args}",
                    self.spec.name.as_str()
                ),
                risk: self.spec.name.risk(),
                decisions: self.spec.name.approval_decisions(),
            };
            self.events.emit(AgentEvent::ApprovalRequested {
                thread_id: thread_id.clone(),
                turn_id: turn_id.clone(),
                approval_request_id: request.approval_request_id.clone(),
                title: request.title.clone(),
                description: request.description.clone(),
                risk: request.risk,
                decisions: request.decisions.clone(),
            });
            let decision = self.approvals.request(request).await;
            self.events.emit(AgentEvent::ApprovalResolved {
                thread_id: thread_id.clone(),
                turn_id: turn_id.clone(),
                approval_request_id,
                decision,
            });
            if !matches!(
                decision,
                ApprovalDecision::AllowOnce | ApprovalDecision::AllowForSession
            ) {
                self.events.emit(AgentEvent::ToolCompleted {
                    thread_id,
                    turn_id,
                    tool_call_id: id.to_string(),
                    name: self.spec.name.as_str().to_string(),
                    status: if decision == ApprovalDecision::Deny {
                        ToolCompletionStatus::Declined
                    } else {
                        ToolCompletionStatus::Refused
                    },
                    detail: Some("The tool was not allowed".to_string()),
                });
                return Some(error_result(id, call_id, "Tool execution was not allowed"));
            }
        }

        let result = self
            .executor
            .execute(DynamicToolCall {
                call_id: id.to_string(),
                tool: self.spec.name,
                arguments: args.clone(),
            })
            .await;
        let status = if result.success {
            ToolCompletionStatus::Completed
        } else {
            ToolCompletionStatus::Failed
        };
        let detail = result.error.as_ref().map(|error| error.message.clone());
        self.events.emit(AgentEvent::ToolCompleted {
            thread_id,
            turn_id,
            tool_call_id: id.to_string(),
            name: self.spec.name.as_str().to_string(),
            status,
            detail,
        });
        Some(dynamic_result(id, call_id, result))
    }
}

fn dynamic_result(
    id: &ToolCallId<str>,
    call_id: Option<&ProviderCallId<str>>,
    result: DynamicToolResult,
) -> ToolResult {
    let mut content = result
        .content
        .into_iter()
        .map(|part| match part {
            crate::DynamicToolContent::Text { text } => ToolResultContent::Text(Text { text }),
            crate::DynamicToolContent::Image { image_url } => ToolResultContent::Image(Image {
                data: ImageSource::Url(image_url),
                media_type: None,
            }),
        })
        .collect::<Vec<_>>();
    if !result.success {
        content.push(ToolResultContent::Text(Text {
            text: format!(
                "Error: {}",
                result
                    .error
                    .map(|error| error.message)
                    .unwrap_or_else(|| "Tool execution failed".to_string())
            ),
        }));
    }
    ToolResult {
        id: id.to_string(),
        call_id: call_id.map(|value| value.as_str().to_string()),
        content,
    }
}

fn error_result(
    id: &ToolCallId<str>,
    call_id: Option<&ProviderCallId<str>>,
    message: &str,
) -> ToolResult {
    ToolResult {
        id: id.to_string(),
        call_id: call_id.map(|value| value.as_str().to_string()),
        content: vec![ToolResultContent::Text(Text {
            text: format!("Error: {message}"),
        })],
    }
}

pub fn edapex_tool_specs() -> Vec<DynamicToolSpec> {
    vec![
        DynamicToolSpec {
            name: crate::DynamicToolName::WebSearch,
            description: "Search the web through the EdApex API. Staff only.".to_string(),
            input_schema: json!({
                "type": "object",
                "required": ["query"],
                "properties": {
                    "query": {"type": "string", "minLength": 1},
                    "domains": {"type": "array", "items": {"type": "string"}},
                    "recency": {"type": "string"},
                    "maxResults": {"type": "integer", "minimum": 1, "maximum": 10}
                },
                "additionalProperties": false
            }),
        },
        DynamicToolSpec {
            name: crate::DynamicToolName::WebFetch,
            description: "Fetch one public HTTP(S) URL through the EdApex API. Staff only."
                .to_string(),
            input_schema: json!({
                "type": "object",
                "required": ["url"],
                "properties": {"url": {"type": "string", "format": "uri"}},
                "additionalProperties": false
            }),
        },
        DynamicToolSpec {
            name: crate::DynamicToolName::OcrExtract,
            description: "Run local RustO OCR on a capture created by the person.".to_string(),
            input_schema: json!({
                "type": "object",
                "required": ["captureId"],
                "properties": {"captureId": {"type": "string", "minLength": 1}},
                "additionalProperties": false
            }),
        },
    ]
}
