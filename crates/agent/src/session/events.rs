use super::SessionRuntime;
use crate::projection::ProjectionEvent;
use crate::protocol::{AgentError, AgentEvent};
use crate::session_protocol::{SessionMessage, SessionMessageRole};
use crate::TurnCompletionStatus;
use infinity_agent_core::system::AgentEvent as InfinityEvent;

impl SessionRuntime {
    pub(super) async fn on_infinity(&mut self, event: InfinityEvent) {
        match event {
            InfinityEvent::TextChunk { text } => {
                let Some(turn) = self.active.as_mut() else {
                    return;
                };
                turn.text.push_str(&text);
                self.options.events.emit(AgentEvent::MessageDelta {
                    thread_id: self.root.to_string(),
                    turn_id: turn.turn_id.clone(),
                    item_id: format!("{}:assistant", turn.turn_id),
                    delta: text,
                });
            }
            InfinityEvent::ThinkingChunk { text } => {
                let Some(turn) = self.active.as_ref() else {
                    return;
                };
                self.options.events.emit(AgentEvent::ReasoningDelta {
                    thread_id: self.root.to_string(),
                    turn_id: turn.turn_id.clone(),
                    item_id: format!("{}:reasoning", turn.turn_id),
                    delta: text,
                });
            }
            InfinityEvent::ToolCall {
                name,
                args,
                display_as,
            } => {
                let Some(turn) = self.active.as_mut() else {
                    return;
                };
                turn.pending_tool_calls += 1;
                if !is_external_tool(&name) {
                    let id = self
                        .conversation
                        .latest_tool_call_id(&self.root)
                        .unwrap_or_else(|| format!("{}:tool", turn.turn_id));
                    self.options.events.emit(AgentEvent::ToolStarted {
                        thread_id: self.root.to_string(),
                        turn_id: turn.turn_id.clone(),
                        tool_call_id: id,
                        name,
                        summary: display_as.unwrap_or_else(|| args.to_string()),
                    });
                }
            }
            InfinityEvent::ToolResult { segments } => {
                let Some(turn) = self.active.as_mut() else {
                    return;
                };
                turn.pending_tool_calls = turn.pending_tool_calls.saturating_sub(1);
                let Some((id, name)) = self.conversation.latest_tool_info(&self.root) else {
                    return;
                };
                if is_external_tool(&name) {
                    return;
                }
                let detail = segments.into_iter().find_map(|segment| match segment {
                    rap_protocol::DisplaySegment::Text(text) => Some(text),
                    _ => None,
                });
                let failed = detail
                    .as_deref()
                    .is_some_and(|text| text.starts_with("Error:"));
                self.options.events.emit(AgentEvent::ToolCompleted {
                    thread_id: self.root.to_string(),
                    turn_id: turn.turn_id.clone(),
                    tool_call_id: id,
                    name,
                    status: if failed {
                        crate::ToolCompletionStatus::Failed
                    } else {
                        crate::ToolCompletionStatus::Completed
                    },
                    detail,
                });
            }
            InfinityEvent::CompletionFinished { .. } => {
                let Some(turn) = self.active.as_mut() else {
                    return;
                };
                if turn.pending_tool_calls > 0 {
                    return;
                }
                let turn_id = turn.turn_id.clone();
                let reply_to = turn.reply_to.clone();
                let text = turn.text.clone();
                let core_id = self
                    .conversation
                    .latest_message_id(&self.root)
                    .unwrap_or_else(|| turn.turn_id.clone());
                let message = SessionMessage {
                    event_id: format!("{turn_id}:assistant"),
                    message_id: core_id.clone(),
                    dedup_id: Some(core_id),
                    role: SessionMessageRole::Assistant,
                    text,
                    versions: Vec::new(),
                    reply_to: Some(reply_to),
                };
                if let Err(error) = self.append(
                    ProjectionEvent::AssistantMessage { message },
                    format!("{turn_id}:assistant"),
                    None,
                    None,
                ) {
                    self.fail(error).await;
                    return;
                }
                self.active = None;
                self.active_turns.end(self.root.as_str(), &turn_id);
                self.options.events.emit(AgentEvent::TurnCompleted {
                    thread_id: self.root.to_string(),
                    turn_id,
                    status: TurnCompletionStatus::Completed,
                });
                if let Err(error) = self.drain_next().await {
                    self.fail(error).await;
                }
            }
            InfinityEvent::Info { text } if text.starts_with("Error:") => {
                self.fail(AgentError::provider(text)).await;
            }
            _ => {}
        }
    }
}

fn is_external_tool(name: &str) -> bool {
    matches!(name, "web_search" | "web_fetch" | "ocr_extract")
}
