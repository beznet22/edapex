//! The parts needed to reopen a browser driver with its durable stores.

use std::cell::RefCell;
use std::rc::Rc;
use std::sync::Arc;

use edapex_agent::tool_bridge::edapex_tool_specs;
use edapex_agent::{ApprovalHandler, EdApexTool, EventSink, ToolExecutor};
use infinity_agent_core::system::local::{ChannelSender, ThreadHandle};
use infinity_agent_core::system::AgentSystemBuilder;
use infinity_wasm::conversation_store::IndexedDbConversationStore;
use infinity_wasm::state_store::IndexedDbStateStore;
use rap_protocol::ThreadId;
use tokio::sync::mpsc;

use crate::browser_provider::BrowserModelSource;
use crate::browser_trace::Trace;
use crate::session_lifecycle::BrowserTurnLifecycle;
use crate::JsEventSink;

pub struct BrowserEngineParts {
    pub conversation: IndexedDbConversationStore,
    pub state: IndexedDbStateStore,
    pub source: BrowserModelSource,
    pub tools: Arc<dyn ToolExecutor>,
    pub approvals: Arc<dyn ApprovalHandler>,
    pub events: JsEventSink,
    pub tool_events: Arc<dyn EventSink>,
    pub wake: mpsc::UnboundedSender<()>,
    pub trace: Trace,
}

impl BrowserEngineParts {
    /// Starts the local system and attaches a handle to the **caller-owned** root.
    ///
    /// `ThreadBuilder::launch()` mints a fresh UUID (`launch.rs:299`), which would
    /// discard the storage identity that OPFS projection, reload resume and the
    /// Web Lock all key on. `LaunchingSystem::thread_handle(&root)` attaches to a
    /// thread that already exists in the conversation store instead — which is why
    /// `connect` calls `ensure_root_thread` first.
    pub async fn launch(
        &self,
        root: &ThreadId,
        lifecycle: &Rc<RefCell<BrowserTurnLifecycle>>,
    ) -> Option<ChannelSender> {
        let trace = self.trace.clone();
        trace.mark("launch.begin");
        let active_turns = lifecycle.borrow().active_turns.clone();
        let tools = edapex_tool_specs()
            .into_iter()
            .map(|spec| {
                Box::new(EdApexTool::new(
                    spec,
                    self.tools.clone(),
                    self.approvals.clone(),
                    self.tool_events.clone(),
                    active_turns.clone(),
                )) as Box<dyn infinity_agent_core::tools::Tool<ChannelSender>>
            })
            .collect::<Vec<_>>();
        let system = AgentSystemBuilder::new_local(
            self.conversation.clone(),
            self.state.clone(),
            self.source.clone(),
        )
        .tools(tools)
        .start();
        trace.mark("system.started");
        trace.mark("thread_handle.begin");
        let attached = system.thread_handle(root).await;
        let mut thread: ThreadHandle = match attached {
            Ok(Some(handle)) => {
                trace.mark("thread_handle.attached");
                handle
            }
            Ok(None) => {
                trace.mark("thread_handle.missing");
                return None;
            }
            Err(_) => {
                trace.mark("thread_handle.store_error");
                return None;
            }
        };
        let sender = system.sender();
        let pump_lifecycle = lifecycle.clone();
        let pump_events = self.events.clone();
        trace.mark("pump.spawn");
        tokio::task::spawn_local(async move {
            // The session outlives this call, so the system moves into the pump:
            // dropping it would shut the router down mid-turn.
            let _system = system;
            while let Some(event) = thread.recv().await {
                trace.mark("core.event");
                let outgoing = {
                    let thread_id = thread.thread_id().clone();
                    pump_lifecycle.borrow_mut().observe(&thread_id, &event)
                };
                for event in outgoing {
                    pump_events.emit(event);
                }
            }
        });
        Some(sender)
    }
}

/// The actor store has no stopped-flag setter. This supplementary metadata keeps
/// the UI's stopped state across a reload; disposal of the driver performs the
/// cancellation and history flush. Plain user text clears it before resuming.
pub fn stopped_metadata(stopped: bool) -> serde_json::Value {
    serde_json::json!({ "edapex": { "stopped": stopped } })
}

