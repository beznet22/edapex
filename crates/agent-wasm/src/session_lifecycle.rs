//! Browser turn lifecycle and the EdApex event contract.
//!
//! The native session maps these same Infinity events while it writes its SQL
//! projection. This state machine is the browser side of that mapping, without
//! the projection: it exists to keep one completion from ending a tool turn early.
//! The core can emit completion more than once while tool results are still being
//! processed, so an active turn counts outstanding calls.

use std::collections::VecDeque;
use std::sync::Arc;

use edapex_agent::{
    ActiveTurnRegistry, AgentError, AgentErrorCode, AgentEvent, TurnCompletionStatus,
};
use infinity_agent_core::system::AgentEvent as InfinityEvent;
use rap_protocol::ThreadId;

#[derive(Default)]
pub struct BrowserTurnLifecycle {
    active: Option<ActiveBrowserTurn>,
    stopped: bool,
    queued: VecDeque<PendingBrowserTurn>,
    history: Vec<AgentEvent>,
    root: String,
    pub active_turns: Arc<ActiveTurnRegistry>,
}

#[derive(Default)]
struct ActiveBrowserTurn {
    turn_id: String,
    pending_tool_calls: usize,
    serial: usize,
    tools: VecDeque<PendingTool>,
}

struct PendingBrowserTurn {
    turn_id: String,
    dedup_id: String,
    text: String,
}

struct PendingTool {
    id: String,
    name: String,
}

impl BrowserTurnLifecycle {
    pub fn set_root(&mut self, root: &str) {
        self.root = root.to_string();
    }

    pub fn enqueue(&mut self, turn_id: String, dedup_id: String, text: String) {
        if self
            .active
            .as_ref()
            .is_some_and(|turn| turn.turn_id == turn_id)
            || self.queued.iter().any(|turn| turn.turn_id == turn_id)
        {
            return;
        }
        self.stopped = false;
        self.queued.push_back(PendingBrowserTurn {
            turn_id,
            dedup_id,
            text,
        });
    }

    /// The oldest accepted message that has not been sent to Infinity yet.
    pub fn take_next(&mut self) -> Option<(String, String, String)> {
        if self.active.is_some() || self.stopped {
            return None;
        }
        let pending = self.queued.pop_front()?;
        self.active_turns.begin(&self.root, &pending.turn_id);
        self.active = Some(ActiveBrowserTurn {
            turn_id: pending.turn_id.clone(),
            ..ActiveBrowserTurn::default()
        });
        self.history.push(AgentEvent::TurnStarted {
            thread_id: self.root.clone(),
            turn_id: pending.turn_id.clone(),
        });
        Some((pending.turn_id, pending.dedup_id, pending.text))
    }

    /// Tests and embedders read the same stream the browser emitted.
    pub fn take_history(&mut self) -> Vec<AgentEvent> {
        std::mem::take(&mut self.history)
    }

    pub fn active_turn_id(&self) -> Option<String> {
        self.active.as_ref().map(|turn| turn.turn_id.clone())
    }

    pub fn stop(&mut self, reason: String) {
        let Some(turn_id) = self.active.take().map(|turn| turn.turn_id) else {
            return;
        };
        self.stopped = true;
        self.active_turns.end(&self.root, &turn_id);
        self.history.push(AgentEvent::Interrupted {
            thread_id: self.root.clone(),
            turn_id: turn_id.clone(),
            reason,
        });
        self.history.push(AgentEvent::TurnCompleted {
            thread_id: self.root.clone(),
            turn_id: turn_id.clone(),
            status: TurnCompletionStatus::Stopped,
        });
    }

    pub(crate) fn observe(&mut self, thread_id: &ThreadId<str>, event: &InfinityEvent) -> Vec<AgentEvent> {
        let mut events = Vec::new();
        self.active_turns.alias(thread_id.as_str(), &self.root);
        match event {
            InfinityEvent::TextChunk { text } => {
                let Some(turn) = self.active.as_ref() else {
                    return Vec::new();
                };
                events.push(AgentEvent::MessageDelta {
                    thread_id: self.root.clone(),
                    turn_id: turn.turn_id.clone(),
                    item_id: format!("{}:assistant", turn.turn_id),
                    delta: text.clone(),
                });
            }
            InfinityEvent::ThinkingChunk { text } => {
                let Some(turn) = self.active.as_ref() else {
                    return Vec::new();
                };
                events.push(AgentEvent::ReasoningDelta {
                    thread_id: self.root.clone(),
                    turn_id: turn.turn_id.clone(),
                    item_id: format!("{}:reasoning", turn.turn_id),
                    delta: text.clone(),
                });
            }
            InfinityEvent::ToolCall {
                name,
                args,
                display_as,
            } => {
                let Some(turn) = self.active.as_mut() else {
                    return Vec::new();
                };
                turn.pending_tool_calls += 1;
                if !is_external_tool(name) {
                    turn.serial += 1;
                    let id = format!("{}:tool:{}", turn.turn_id, turn.serial);
                    turn.tools.push_back(PendingTool {
                        id: id.clone(),
                        name: name.clone(),
                    });
                    events.push(AgentEvent::ToolStarted {
                        thread_id: self.root.clone(),
                        turn_id: turn.turn_id.clone(),
                        tool_call_id: id,
                        name: name.clone(),
                        summary: display_as.clone().unwrap_or_else(|| args.to_string()),
                    });
                }
            }
            InfinityEvent::ToolResult { segments } => {
                let Some(turn) = self.active.as_mut() else {
                    return Vec::new();
                };
                turn.pending_tool_calls = turn.pending_tool_calls.saturating_sub(1);
                let Some(tool) = turn.tools.pop_front() else {
                    return Vec::new();
                };
                let detail = segments.iter().find_map(|segment| match segment {
                    rap_protocol::DisplaySegment::Text(text) => Some(text.clone()),
                    _ => None,
                });
                let status = if detail
                    .as_deref()
                    .is_some_and(|text| text.starts_with("Error:"))
                {
                    edapex_agent::ToolCompletionStatus::Failed
                } else {
                    edapex_agent::ToolCompletionStatus::Completed
                };
                events.push(AgentEvent::ToolCompleted {
                    thread_id: self.root.clone(),
                    turn_id: turn.turn_id.clone(),
                    tool_call_id: tool.id,
                    name: tool.name,
                    status,
                    detail,
                });
            }
            InfinityEvent::CompletionFinished { .. } => {
                let Some(turn) = self.active.as_ref() else {
                    return Vec::new();
                };
                if turn.pending_tool_calls > 0 {
                    return Vec::new();
                }
                let turn_id = turn.turn_id.clone();
                self.active = None;
                self.active_turns.end(&self.root, &turn_id);
                events.push(AgentEvent::TurnCompleted {
                    thread_id: self.root.clone(),
                    turn_id,
                    status: TurnCompletionStatus::Completed,
                });
            }
            InfinityEvent::Info { text } if text.starts_with("Error:") => {
                let Some(turn) = self.active.take() else {
                    return Vec::new();
                };
                self.active_turns.end(&self.root, &turn.turn_id);
                events.push(AgentEvent::Error {
                    thread_id: Some(self.root.clone()),
                    turn_id: Some(turn.turn_id.clone()),
                    error: AgentError::new(AgentErrorCode::ProviderUnavailable, text, true),
                });
                events.push(AgentEvent::TurnCompleted {
                    thread_id: self.root.clone(),
                    turn_id: turn.turn_id,
                    status: TurnCompletionStatus::Error,
                });
            }
            _ => {}
        }
        events.append(&mut self.history);
        events
    }
}

fn is_external_tool(name: &str) -> bool {
    matches!(name, "web_search" | "web_fetch" | "ocr_extract")
}
