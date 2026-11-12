use std::collections::HashSet;

use serde::{Deserialize, Serialize};
use serde_json::{json, Value};

use crate::protocol::{
    AgentError, AgentErrorCode, AgentEvent, ApprovalDecision, CapabilityRisk, ToolCompletionStatus,
    TurnCompletionStatus,
};

/// AG-UI is the agent transport. It is intentionally separate from OpenUI,
/// which is a generated-surface payload carried inside a chat message part.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(
    tag = "type",
    rename_all = "SCREAMING_SNAKE_CASE",
    rename_all_fields = "camelCase"
)]
pub enum AgUiEvent {
    RunStarted {
        thread_id: String,
        run_id: String,
    },
    RunFinished {
        thread_id: String,
        run_id: String,
    },
    RunError {
        message: String,
        code: Option<String>,
    },
    StepStarted {
        step_name: String,
    },
    StepFinished {
        step_name: String,
    },
    TextMessageStart {
        message_id: String,
    },
    TextMessageContent {
        message_id: String,
        delta: String,
    },
    TextMessageEnd {
        message_id: String,
    },
    ToolCallStart {
        tool_call_id: String,
        tool_call_name: String,
    },
    ToolCallArgs {
        tool_call_id: String,
        delta: String,
    },
    ToolCallEnd {
        tool_call_id: String,
    },
    StateSnapshot {
        snapshot: Value,
    },
    StateDelta {
        delta: Vec<Value>,
    },
    MessagesSnapshot {
        messages: Vec<Value>,
    },
    Raw {
        event: Value,
    },
    Custom {
        name: String,
        value: Value,
    },
}

#[derive(Default)]
pub struct AgUiBridge {
    open_text: HashSet<String>,
    open_tools: HashSet<String>,
}

impl AgUiBridge {
    /// Map EdApex's internal event union to AG-UI transport events.
    pub fn from_agent_event(&mut self, event: &AgentEvent) -> Vec<AgUiEvent> {
        match event {
            AgentEvent::Connected { .. } => Vec::new(),
            AgentEvent::TurnStarted { thread_id, turn_id } => vec![AgUiEvent::RunStarted {
                thread_id: thread_id.clone(),
                run_id: turn_id.clone(),
            }],
            AgentEvent::MessageDelta { item_id, delta, .. } => {
                let mut events = Vec::new();
                if self.open_text.insert(item_id.clone()) {
                    events.push(AgUiEvent::TextMessageStart {
                        message_id: item_id.clone(),
                    });
                }
                events.push(AgUiEvent::TextMessageContent {
                    message_id: item_id.clone(),
                    delta: delta.clone(),
                });
                events
            }
            AgentEvent::ReasoningDelta { item_id, delta, .. } => vec![AgUiEvent::Custom {
                name: "edapex.reasoning_delta".to_string(),
                value: json!({ "itemId": item_id, "delta": delta }),
            }],
            AgentEvent::ToolStarted {
                tool_call_id,
                name,
                summary,
                ..
            } => {
                self.open_tools.insert(tool_call_id.clone());
                let mut events = vec![AgUiEvent::ToolCallStart {
                    tool_call_id: tool_call_id.clone(),
                    tool_call_name: name.clone(),
                }];
                if !summary.is_empty() {
                    events.push(AgUiEvent::Custom {
                        name: "edapex.tool_summary".to_string(),
                        value: json!({ "toolCallId": tool_call_id, "summary": summary }),
                    });
                }
                events
            }
            AgentEvent::ToolCompleted {
                tool_call_id,
                name,
                status,
                detail,
                ..
            } => {
                self.open_tools.remove(tool_call_id);
                vec![
                    AgUiEvent::ToolCallEnd {
                        tool_call_id: tool_call_id.clone(),
                    },
                    AgUiEvent::Custom {
                        name: "edapex.tool_result".to_string(),
                        value: json!({
                            "toolCallId": tool_call_id,
                            "name": name,
                            "status": status,
                            "detail": detail,
                        }),
                    },
                ]
            }
            AgentEvent::ApprovalRequested {
                approval_request_id,
                title,
                description,
                risk,
                decisions,
                ..
            } => vec![AgUiEvent::Custom {
                name: "edapex.approval_requested".to_string(),
                value: json!({
                    "approvalRequestId": approval_request_id,
                    "title": title,
                    "description": description,
                    "risk": risk,
                    "decisions": decisions,
                }),
            }],
            AgentEvent::ApprovalResolved {
                approval_request_id,
                decision,
                ..
            } => vec![AgUiEvent::Custom {
                name: "edapex.approval_resolved".to_string(),
                value: json!({
                    "approvalRequestId": approval_request_id,
                    "decision": decision,
                }),
            }],
            AgentEvent::TurnCompleted {
                thread_id,
                turn_id,
                status,
            } => {
                let mut events = self.close_open_items();
                match status {
                    TurnCompletionStatus::Completed | TurnCompletionStatus::Stopped => {
                        events.push(AgUiEvent::RunFinished {
                            thread_id: thread_id.clone(),
                            run_id: turn_id.clone(),
                        });
                    }
                    TurnCompletionStatus::Error => events.push(AgUiEvent::RunError {
                        message: "The turn failed".to_string(),
                        code: Some(AgentErrorCode::InternalError.as_str().to_string()),
                    }),
                }
                events
            }
            AgentEvent::Error { error, .. } => vec![AgUiEvent::RunError {
                message: error.message.clone(),
                code: Some(error.code.as_str().to_string()),
            }],
            AgentEvent::Interrupted {
                thread_id,
                turn_id,
                reason,
            } => {
                let mut events = self.close_open_items();
                events.push(AgUiEvent::Custom {
                    name: "edapex.interrupted".to_string(),
                    value: json!({ "reason": reason }),
                });
                events.push(AgUiEvent::RunFinished {
                    thread_id: thread_id.clone(),
                    run_id: turn_id.clone(),
                });
                events
            }
        }
    }

    /// Map AG-UI transport events back to the internal UI contract. Used when
    /// an external AG-UI agent is the runtime.
    pub fn from_agui_event(
        &mut self,
        event: &AgUiEvent,
        thread_id: &str,
        turn_id: &str,
    ) -> Vec<AgentEvent> {
        match event {
            AgUiEvent::RunStarted { .. } => vec![AgentEvent::TurnStarted {
                thread_id: thread_id.to_string(),
                turn_id: turn_id.to_string(),
            }],
            AgUiEvent::TextMessageContent { message_id, delta } => vec![AgentEvent::MessageDelta {
                thread_id: thread_id.to_string(),
                turn_id: turn_id.to_string(),
                item_id: message_id.clone(),
                delta: delta.clone(),
            }],
            AgUiEvent::ToolCallStart {
                tool_call_id,
                tool_call_name,
            } => vec![AgentEvent::ToolStarted {
                thread_id: thread_id.to_string(),
                turn_id: turn_id.to_string(),
                tool_call_id: tool_call_id.clone(),
                name: tool_call_name.clone(),
                summary: String::new(),
            }],
            AgUiEvent::RunFinished { .. } => vec![AgentEvent::TurnCompleted {
                thread_id: thread_id.to_string(),
                turn_id: turn_id.to_string(),
                status: TurnCompletionStatus::Completed,
            }],
            AgUiEvent::RunError { message, code } => {
                let error = AgentError::new(code_from_str(code.as_deref()), message.clone(), false);
                vec![
                    AgentEvent::Error {
                        thread_id: Some(thread_id.to_string()),
                        turn_id: Some(turn_id.to_string()),
                        error,
                    },
                    AgentEvent::TurnCompleted {
                        thread_id: thread_id.to_string(),
                        turn_id: turn_id.to_string(),
                        status: TurnCompletionStatus::Error,
                    },
                ]
            }
            AgUiEvent::Custom { name, value } => self.from_custom(name, value, thread_id, turn_id),
            AgUiEvent::StepStarted { .. }
            | AgUiEvent::StepFinished { .. }
            | AgUiEvent::TextMessageStart { .. }
            | AgUiEvent::TextMessageEnd { .. }
            | AgUiEvent::ToolCallArgs { .. }
            | AgUiEvent::ToolCallEnd { .. }
            | AgUiEvent::StateSnapshot { .. }
            | AgUiEvent::StateDelta { .. }
            | AgUiEvent::MessagesSnapshot { .. }
            | AgUiEvent::Raw { .. } => Vec::new(),
        }
    }

    fn from_custom(
        &mut self,
        name: &str,
        value: &Value,
        thread_id: &str,
        turn_id: &str,
    ) -> Vec<AgentEvent> {
        match name {
            "edapex.tool_result" => {
                let tool_call_id = value
                    .get("toolCallId")
                    .and_then(Value::as_str)
                    .unwrap_or_default()
                    .to_string();
                let tool_name = value
                    .get("name")
                    .and_then(Value::as_str)
                    .unwrap_or_default()
                    .to_string();
                let status = match value.get("status").and_then(Value::as_str) {
                    Some("completed") => ToolCompletionStatus::Completed,
                    Some("blocked") => ToolCompletionStatus::Blocked,
                    Some("declined") => ToolCompletionStatus::Declined,
                    Some("refused") => ToolCompletionStatus::Refused,
                    _ => ToolCompletionStatus::Failed,
                };
                let detail = value
                    .get("detail")
                    .and_then(Value::as_str)
                    .map(ToString::to_string);
                vec![AgentEvent::ToolCompleted {
                    thread_id: thread_id.to_string(),
                    turn_id: turn_id.to_string(),
                    tool_call_id,
                    name: tool_name,
                    status,
                    detail,
                }]
            }
            "edapex.approval_requested" => vec![AgentEvent::ApprovalRequested {
                thread_id: thread_id.to_string(),
                turn_id: turn_id.to_string(),
                approval_request_id: string_field(value, "approvalRequestId"),
                title: string_field(value, "title"),
                description: string_field(value, "description"),
                risk: CapabilityRisk::Read,
                decisions: vec![
                    ApprovalDecision::AllowOnce,
                    ApprovalDecision::AllowForSession,
                    ApprovalDecision::Deny,
                    ApprovalDecision::Abort,
                ],
            }],
            "edapex.approval_resolved" => vec![AgentEvent::ApprovalResolved {
                thread_id: thread_id.to_string(),
                turn_id: turn_id.to_string(),
                approval_request_id: string_field(value, "approvalRequestId"),
                decision: ApprovalDecision::AllowOnce,
            }],
            "edapex.interrupted" => vec![AgentEvent::Interrupted {
                thread_id: thread_id.to_string(),
                turn_id: turn_id.to_string(),
                reason: string_field(value, "reason"),
            }],
            _ => Vec::new(),
        }
    }

    fn close_open_items(&mut self) -> Vec<AgUiEvent> {
        let mut events = Vec::new();
        let mut text: Vec<String> = self.open_text.drain().collect();
        text.sort();
        for message_id in text {
            events.push(AgUiEvent::TextMessageEnd { message_id });
        }
        let mut tools: Vec<String> = self.open_tools.drain().collect();
        tools.sort();
        for tool_call_id in tools {
            events.push(AgUiEvent::ToolCallEnd { tool_call_id });
        }
        events
    }
}

fn string_field(value: &Value, key: &str) -> String {
    value
        .get(key)
        .and_then(Value::as_str)
        .unwrap_or_default()
        .to_string()
}

fn code_from_str(value: Option<&str>) -> AgentErrorCode {
    match value {
        Some("unsupported_capability") => AgentErrorCode::UnsupportedCapability,
        Some("permission_denied") => AgentErrorCode::PermissionDenied,
        Some("camera_unavailable") => AgentErrorCode::CameraUnavailable,
        Some("cancelled") => AgentErrorCode::Cancelled,
        Some("auth_required") => AgentErrorCode::AuthRequired,
        Some("model_missing") => AgentErrorCode::ModelMissing,
        Some("invalid_input") => AgentErrorCode::InvalidInput,
        Some("provider_unavailable") => AgentErrorCode::ProviderUnavailable,
        Some("quota_exceeded") => AgentErrorCode::QuotaExceeded,
        _ => AgentErrorCode::InternalError,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn agui_event_names_and_fields_are_wire_compatible() {
        let value = serde_json::to_value(AgUiEvent::RunStarted {
            thread_id: "thread".to_string(),
            run_id: "run".to_string(),
        })
        .expect("serializes");
        assert_eq!(value["type"], "RUN_STARTED");
        assert_eq!(value["threadId"], "thread");
        assert_eq!(value["runId"], "run");
    }

    #[test]
    fn maps_internal_text_lifecycle_to_agui() {
        let mut bridge = AgUiBridge::default();
        let started = bridge.from_agent_event(&AgentEvent::TurnStarted {
            thread_id: "t".to_string(),
            turn_id: "r".to_string(),
        });
        assert_eq!(started.len(), 1);

        let first = bridge.from_agent_event(&AgentEvent::MessageDelta {
            thread_id: "t".to_string(),
            turn_id: "r".to_string(),
            item_id: "m".to_string(),
            delta: "hello".to_string(),
        });
        assert_eq!(
            first,
            vec![
                AgUiEvent::TextMessageStart {
                    message_id: "m".to_string()
                },
                AgUiEvent::TextMessageContent {
                    message_id: "m".to_string(),
                    delta: "hello".to_string()
                }
            ]
        );

        let finished = bridge.from_agent_event(&AgentEvent::TurnCompleted {
            thread_id: "t".to_string(),
            turn_id: "r".to_string(),
            status: TurnCompletionStatus::Completed,
        });
        assert_eq!(
            finished,
            vec![
                AgUiEvent::TextMessageEnd {
                    message_id: "m".to_string()
                },
                AgUiEvent::RunFinished {
                    thread_id: "t".to_string(),
                    run_id: "r".to_string()
                }
            ]
        );
    }

    #[test]
    fn maps_agui_text_to_internal_event() {
        let mut bridge = AgUiBridge::default();
        let events = bridge.from_agui_event(
            &AgUiEvent::TextMessageContent {
                message_id: "m".to_string(),
                delta: "hello".to_string(),
            },
            "t",
            "r",
        );
        assert_eq!(
            events,
            vec![AgentEvent::MessageDelta {
                thread_id: "t".to_string(),
                turn_id: "r".to_string(),
                item_id: "m".to_string(),
                delta: "hello".to_string()
            }]
        );
    }
}
