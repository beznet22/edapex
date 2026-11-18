//! A durable browser Infinity session.
//!
//! One caller-owned root thread keeps its model context in Infinity's IndexedDB
//! stores. A single wake-driven drain task delivers accepted messages in FIFO
//! order; no page poll or duplicate turn loop participates in execution.

use std::cell::RefCell;
use std::rc::Rc;
use std::sync::Arc;

use edapex_agent::{AgentError, AgentEvent, ApprovalHandler, EventSink, ToolExecutor};
use infinity_agent_core::system::local::ChannelSender;
use infinity_agent_core::traits::{ConversationStore, InputSender, StateStore};
use infinity_wasm::conversation_store::IndexedDbConversationStore;
use infinity_wasm::state_store::IndexedDbStateStore;
use js_sys::Function;
use rap_protocol::ThreadId;
use tokio::sync::mpsc;
use wasm_bindgen::prelude::*;

use crate::browser_engine::{stopped_metadata, BrowserEngineParts};
use crate::browser_trace::Trace;
use crate::browser_provider::{self, BrowserModelSource, BrowserProvider};
use crate::session_lifecycle::BrowserTurnLifecycle;
use crate::{ChunkQueue, JsApprovalHandler, JsEventSink, JsToolExecutor, ProviderChunk};

#[wasm_bindgen]
pub struct WasmSession {
    trace: Trace,
    sender: Rc<RefCell<Option<ChannelSender>>>,
    wake_guard: Rc<RefCell<Option<mpsc::UnboundedSender<()>>>>,
    parts: Rc<BrowserEngineParts>,
    root: ThreadId,
    lifecycle: Rc<RefCell<BrowserTurnLifecycle>>,
    provider: BrowserProvider,
    events: JsEventSink,
}

#[wasm_bindgen]
impl WasmSession {
    /// Opens the root's existing stores or creates them on first use. Provider
    /// auth, tool execution and approval decisions stay in the caller's runtime.
    pub async fn connect(
        settings: &str,
        root_thread_id: &str,
        on_request: Function,
        on_event: Function,
        on_tool: Function,
        on_approval: Function,
    ) -> Result<WasmSession, JsValue> {
        let model = model_from_settings(settings)?;
        let root = ThreadId::from(root_thread_id.to_string());
        if root.as_str().is_empty() {
            return Err(js_error("A root thread id is required"));
        }
        let conversation = IndexedDbConversationStore::open()
            .await
            .map_err(|error| js_error(format!("Conversation store: {error}")))?;
        conversation
            .ensure_root_thread(&root)
            .await
            .map_err(|error| js_error(format!("Open root thread: {error}")))?;
        let state = IndexedDbStateStore::open()
            .await
            .map_err(|error| js_error(format!("State store: {error}")))?;
        let provider = BrowserProvider::new(
            browser_provider::register(on_request),
            Arc::new(ChunkQueue::default()),
        );
        let events = JsEventSink { on_event };
        let tool_events: Arc<dyn EventSink> = Arc::new(events.clone());
        let lifecycle = Rc::new(RefCell::new(BrowserTurnLifecycle::default()));
        // Every event carries the root thread id, and the contract rejects an
        // empty one, so this must be set before the first turn.
        lifecycle.borrow_mut().set_root(root.as_str());
        let trace = Trace::new();
        crate::browser_trace::install(&trace);
        trace.mark("session.connect.begin");
        trace.mark("stores.ready");
        let (wake, mut wake_receiver) = mpsc::unbounded_channel();
        let wake_guard = wake.clone();
        let parts = Rc::new(BrowserEngineParts {
            conversation,
            state,
            source: BrowserModelSource {
                provider: Arc::new(provider.clone()),
                model,
            },
            tools: Arc::new(JsToolExecutor { on_tool }) as Arc<dyn ToolExecutor>,
            approvals: Arc::new(JsApprovalHandler { on_approval }) as Arc<dyn ApprovalHandler>,
            events: events.clone(),
            tool_events,
            wake,
            trace: trace.clone(),
        });
        let sender_slot: Rc<RefCell<Option<ChannelSender>>> = Rc::new(RefCell::new(None));

        let drain_parts = parts.clone();
        let drain_root = root.clone();
        let drain_lifecycle = lifecycle.clone();
        let drain_sender = sender_slot.clone();
        let drain_events = events.clone();
        let drain_trace = trace.clone();
        wasm_bindgen_futures::spawn_local(async move {
            drain_trace.mark("drain.task_start");
            // Infinity's router and per-thread drivers are `!Send` tasks, so they
            // must be driven by a LocalSet — the way upstream's browser entry points
            // launch. A bare `spawn_local` future gives them no task context, which
            // is why the turn was accepted and then never reached the model.
            let local = tokio::task::LocalSet::new();
            local
                .run_until(async move {
            loop {
                if wake_receiver.recv().await.is_none() {
                    drain_trace.mark("drain.channel_closed");
                    return;
                }
                drain_trace.mark("drain.woken");
                loop {
                    let next = drain_lifecycle.borrow_mut().take_next();
                    let Some((_, dedup_id, text)) = next else {
                        break;
                    };
                    drain_trace.mark("drain.took_turn");
                    for event in drain_lifecycle.borrow_mut().take_history() {
                        drain_events.emit(event);
                    }
                    if drain_parts
                        .state
                        .set_metadata(&drain_root, stopped_metadata(false))
                        .await
                        .is_err()
                    {
                        drain_trace.mark("drain.metadata_failed");
                        continue;
                    }
                    drain_trace.mark("drain.metadata_set");
                    if drain_sender.borrow().is_none() {
                        // `launch` must run inside *this* LocalSet: the router and
                        // the event pump are `spawn_local`ed onto it, so a nested
                        // LocalSet would cancel both the moment its `run_until`
                        // returned.
                        let Some(fresh) =
                            drain_parts.launch(&drain_root, &drain_lifecycle).await
                        else {
                            continue;
                        };
                        drain_sender.borrow_mut().replace(fresh);
                    }
                    let sender = drain_sender.borrow().clone();
                    let Some(sender) = sender else {
                        drain_trace.mark("drain.no_sender");
                        break;
                    };
                    drain_trace.mark("drain.sending");
                    sender
                        .send_to_input_queue(
                            infinity_agent_core::message::InputMessage::user_text(
                                drain_root.clone(),
                                text,
                            ),
                            &dedup_id,
                        )
                        .await
                        .ok();
                    drain_trace.mark("drain.sent");
                }
            }
                })
                .await;
        });

        Ok(Self {
            sender: sender_slot,
            wake_guard: Rc::new(RefCell::new(Some(wake_guard))),
            parts,
            root,
            lifecycle,
            provider,
            events,
            trace,
        })
    }

    /// Every stage this session reached, with worker-side timestamps. Worker
    /// console output does not reach the page, so a stalled turn is otherwise
    /// silent.
    pub fn debug_trace(&self) -> String {
        self.trace.json()
    }

    /// Lets the worker record its own branches in the same trace, so a stall on
    /// the JavaScript side sits beside the Rust stages instead of being invisible.
    pub fn debug_note(&self, text: String) {
        self.trace.note(text);
    }

    pub fn root_thread_id(&self) -> String {
        self.root.to_string()
    }

    /// Accepts a message while the previous turn is still running. Identifiers
    /// are stable across redelivery, including a worker restart.
    pub fn enqueue_text(&self, command_id: &str, dedup_id: &str, text: &str) {
        crate::browser_trace::mark_global("session.enqueue_text");
        self.lifecycle.borrow_mut().enqueue(
            command_id.to_string(),
            dedup_id.to_string(),
            text.to_string(),
        );
        match self.parts.wake.send(()) {
            Ok(()) => crate::browser_trace::mark_global("session.wake_sent"),
            Err(_) => crate::browser_trace::mark_global("session.wake_closed"),
        }
    }

    /// The running driver flushes its current history before it is dropped.
    pub async fn interrupt(&self, turn_id: &str) -> Result<(), JsValue> {
        if self.lifecycle.borrow().active_turn_id().as_deref() != Some(turn_id) {
            return Err(js_error("The turn is no longer active"));
        }
        self.parts
            .state
            .set_metadata(&self.root, stopped_metadata(true))
            .await
            .map_err(|error| js_error(error.to_string()))?;
        self.provider.close_all();
        self.lifecycle
            .borrow_mut()
            .stop("Stopped by the person".to_string());
        for event in self.lifecycle.borrow_mut().take_history() {
            self.events.emit(event);
        }
        // Dropping the sender closes the router's input channel, which ends the
        // thread and lets the driver flush what it streamed before exiting.
        self.sender.borrow_mut().take();
        Ok(())
    }

    pub fn push_chunk(&self, stream_id: u32, chunk: &str) -> Result<(), JsValue> {
        let chunk: ProviderChunk = serde_json::from_str(chunk)
            .map_err(|error| js_error(format!("Invalid chunk: {error}")))?;
        self.provider
            .push(stream_id, Ok(chunk))
            .map_err(|error| js_error(error.message))
    }

    pub fn push_error(&self, stream_id: u32, code: &str, message: &str) {
        let error = AgentError::new(crate::error_code_from_str(code), message, true);
        if let Err(error) = self.provider.push(stream_id, Err(error)) {
            self.events.emit(AgentEvent::Error {
                thread_id: Some(self.root.to_string()),
                turn_id: Some(self.lifecycle.borrow().active_turn_id().unwrap_or_default()),
                error,
            });
        }
    }

    pub fn end_stream(&self, stream_id: u32) {
        self.provider.end_stream(stream_id);
    }

    pub async fn close(self) {
        self.provider.close_all();
        // Ending the wake channel ends the drain loop, which ends the LocalSet
        // scope, which drops the router and its driver.
        drop(self.wake_guard.take());
        // Same as `interrupt`: closing the input channel ends the router, and the
        // system is dropped by the pump task that owns it.
        self.sender.borrow_mut().take();
        browser_provider::release(self.provider.id());
    }
}

fn model_from_settings(settings: &str) -> Result<String, JsValue> {
    let value: serde_json::Value = serde_json::from_str(settings)
        .map_err(|error| js_error(format!("Invalid settings: {error}")))?;
    value
        .get("model")
        .and_then(|model| model.as_str())
        .filter(|model| !model.trim().is_empty())
        .map(|model| model.to_string())
        .ok_or_else(|| js_error("The settings need a model"))
}

fn js_error(message: impl Into<String>) -> JsValue {
    JsValue::from_str(&message.into())
}
