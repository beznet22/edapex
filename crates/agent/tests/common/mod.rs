#![allow(dead_code)]
//! Shared doubles for the native Infinity session tests.
//!
//! One scripted provider, one event collector and one tool executor, so the
//! approval suite and the lifecycle suite cannot drift in how they model a host.

use std::collections::VecDeque;
use std::future::Future;
use std::pin::Pin;
use std::sync::atomic::AtomicUsize;
use std::sync::{Arc, Mutex};
use std::time::{Duration, SystemTime, UNIX_EPOCH};

use edapex_agent::{
    AgentConnectSettings, AgentError, AgentEvent, ApprovalDecision, ApprovalHandler,
    ApprovalRequest, DynamicToolCall, DynamicToolResult, EventSink, NativeAgentDriver,
    ProviderChunk, ProviderClient, ProviderRequest, SessionCommand, StoreContext,
    ToolExecutor, TurnCompletionStatus,
};
use edapex_store::MasterKey;
use tokio::sync::mpsc;

#[derive(Default)]
pub struct Provider {
    script: Mutex<VecDeque<Vec<ProviderChunk>>>,
    requests: Mutex<Vec<ProviderRequest>>,
    /// Streams that were deliberately left open, so a cancellation test does not
    /// pass merely because the mock returned immediately.
    unfinished: Mutex<Vec<mpsc::Sender<ProviderChunk>>>,
}

impl Provider {
    pub fn scripted(script: Vec<Vec<ProviderChunk>>) -> Arc<Self> {
        Arc::new(Self {
            script: Mutex::new(script.into()),
            requests: Mutex::new(Vec::new()),
            unfinished: Mutex::new(Vec::new()),
        })
    }

    pub fn request_count(&self) -> usize {
        self.requests.lock().expect("requests").len()
    }

    pub fn request_contents(&self) -> Vec<String> {
        self.requests
            .lock()
            .expect("requests")
            .iter()
            .map(|request| {
                request
                    .messages
                    .iter()
                    .filter_map(|message| message.content.as_deref())
                    .map(str::to_string)
                    .collect::<Vec<_>>()
                    .join("\n")
            })
            .collect()
    }
}

impl ProviderClient for Provider {
    fn stream_chat(
        &self,
        request: ProviderRequest,
    ) -> Result<mpsc::Receiver<ProviderChunk>, AgentError> {
        self.requests.lock().expect("requests").push(request);
        let chunks = self
            .script
            .lock()
            .expect("script")
            .pop_front()
            .unwrap_or_default();
        if chunks.is_empty() {
            // An empty script is an open stream that never finishes: the honest
            // model of a provider that stalls or of a cancelled turn.
            let (sender, receiver) = mpsc::channel(1);
            self.unfinished.lock().expect("unfinished").push(sender);
            return Ok(receiver);
        }
        let (sender, receiver) = mpsc::channel(chunks.len().max(1));
        tokio::spawn(async move {
            for chunk in chunks {
                if sender.send(chunk).await.is_err() {
                    break;
                }
            }
        });
        Ok(receiver)
    }
}

#[derive(Default)]
pub struct Events(Mutex<Vec<AgentEvent>>);

impl EventSink for Events {
    fn emit(&self, event: AgentEvent) {
        self.0.lock().expect("events").push(event);
    }
}

impl Events {
    pub fn all(&self) -> Vec<AgentEvent> {
        self.0.lock().expect("events").clone()
    }

    pub async fn wait_for(&self, turn_id: &str, status: TurnCompletionStatus) {
        for _ in 0..3_000 {
            if self.all().iter().any(|event| {
                matches!(event, AgentEvent::TurnCompleted { turn_id: found, status: actual, .. }
                    if found == turn_id && actual == &status)
            }) {
                return;
            }
            tokio::time::sleep(Duration::from_millis(2)).await;
        }
        panic!("turn {turn_id} never reached {status:?}: {:?}", self.all());
    }

    pub async fn wait_for_started(&self, turn_id: &str) {
        for _ in 0..1_000 {
            if self.all().iter().any(
                |event| matches!(event, AgentEvent::TurnStarted { turn_id: found, .. } if found == turn_id),
            ) {
                return;
            }
            tokio::time::sleep(Duration::from_millis(1)).await;
        }
        panic!("turn {turn_id} never started");
    }
}

pub struct Tools {
    pub calls: AtomicUsize,
    pub approval_required: bool,
}

impl Tools {
    pub fn new(approval_required: bool) -> Arc<Self> {
        Arc::new(Self {
            calls: AtomicUsize::new(0),
            approval_required,
        })
    }
}

impl ToolExecutor for Tools {
    fn requires_approval(&self, _tool: edapex_agent::DynamicToolName) -> bool {
        self.approval_required
    }

    fn execute(
        &self,
        _call: DynamicToolCall,
    ) -> Pin<Box<dyn Future<Output = DynamicToolResult> + Send>> {
        self.calls
            .fetch_add(1, std::sync::atomic::Ordering::SeqCst);
        Box::pin(async { DynamicToolResult::text("secret tool result") })
    }
}

pub struct Decision(pub ApprovalDecision);

impl ApprovalHandler for Decision {
    fn request(
        &self,
        _request: ApprovalRequest,
    ) -> Pin<Box<dyn Future<Output = ApprovalDecision> + Send>> {
        let decision = self.0;
        Box::pin(async move { decision })
    }
}

pub fn path(name: &str) -> String {
    let unique = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .expect("clock")
        .as_nanos();
    std::env::temp_dir()
        .join(format!(
            "edapex-infinity-{name}-{}-{unique}.sqlite",
            std::process::id()
        ))
        .to_string_lossy()
        .into_owned()
}

pub fn driver(
    path: &str,
    provider: Arc<Provider>,
    tools: Arc<Tools>,
    decision: ApprovalDecision,
    events: Arc<Events>,
) -> NativeAgentDriver {
    NativeAgentDriver::connect(
        AgentConnectSettings {
            workspace_id: "workspace".to_string(),
            model: "test/model".to_string(),
            mobile_safe_tools: false,
        },
        StoreContext::open(path, "workspace", MasterKey::from_bytes([19u8; 32])).expect("store"),
        provider,
        tools,
        Arc::new(Decision(decision)),
        events,
    )
    .expect("driver connects")
}

pub fn command(driver: &NativeAgentDriver, root: &str, id: &str, text: &str) -> SessionCommand {
    SessionCommand::EnqueueText {
        command_id: id.to_string(),
        session_id: root.to_string(),
        client_id: driver.client_id().to_string(),
        thread_id: root.to_string(),
        dedup_id: format!("dedup-{id}"),
        text: text.to_string(),
    }
}

pub fn cleanup(path: &str) {
    let _ = std::fs::remove_file(path);
    let _ = std::fs::remove_file(format!("{path}-wal"));
    let _ = std::fs::remove_file(format!("{path}-shm"));
}
