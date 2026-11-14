//! Size-gate fixture. It runs a real turn (tool call, approval, continuation)
//! and maps the resulting events through AG-UI, so the release profile measures
//! the real core rather than a dead-code-eliminated stub.

use std::future::Future;
use std::pin::Pin;
use std::sync::atomic::{AtomicUsize, Ordering};
use std::sync::{Arc, Mutex};

use edapex_agent::{
    AgUiBridge, AgentConnectSettings, AgentError, AgentEvent, AgentHost, AgentHostOptions,
    AgentTurnInput, ApprovalDecision, ApprovalHandler, ApprovalRequest, DynamicToolCall,
    DynamicToolName, DynamicToolResult, EventSink, ProviderChunk, ProviderClient, ProviderRequest,
    ToolExecutor,
};
use tokio::sync::mpsc;

struct ScriptedProvider {
    round: AtomicUsize,
}

impl ProviderClient for ScriptedProvider {
    fn stream_chat(
        &self,
        _request: ProviderRequest,
    ) -> Result<mpsc::Receiver<ProviderChunk>, AgentError> {
        let round = self.round.fetch_add(1, Ordering::SeqCst);
        let (sender, receiver) = mpsc::channel(8);
        if round == 0 {
            sender
                .try_send(ProviderChunk::ToolCallDelta {
                    index: 0,
                    id: Some("call_1".to_string()),
                    name: Some("web_search".to_string()),
                    arguments: "{\"query\":\"size\"}".to_string(),
                })
                .expect("tool delta");
            sender
                .try_send(ProviderChunk::Done {
                    finish_reason: Some("tool_calls".to_string()),
                })
                .expect("done");
        } else {
            sender
                .try_send(ProviderChunk::Text("done".to_string()))
                .expect("text");
            sender
                .try_send(ProviderChunk::Done {
                    finish_reason: Some("stop".to_string()),
                })
                .expect("done");
        }
        Ok(receiver)
    }
}

struct FixtureTools;

impl ToolExecutor for FixtureTools {
    fn requires_approval(&self, _tool: DynamicToolName) -> bool {
        true
    }

    fn execute(
        &self,
        _call: DynamicToolCall,
    ) -> Pin<Box<dyn Future<Output = DynamicToolResult> + Send>> {
        Box::pin(async { DynamicToolResult::text("ok") })
    }
}

struct FixtureApprovals;

impl ApprovalHandler for FixtureApprovals {
    fn request(
        &self,
        _request: ApprovalRequest,
    ) -> Pin<Box<dyn Future<Output = ApprovalDecision> + Send>> {
        Box::pin(async { ApprovalDecision::AllowOnce })
    }
}

struct CollectSink(Mutex<Vec<AgentEvent>>);

impl EventSink for CollectSink {
    fn emit(&self, event: AgentEvent) {
        self.0.lock().expect("events").push(event);
    }
}

fn main() {
    let events = Arc::new(CollectSink(Mutex::new(Vec::new())));
    let host = AgentHost::connect(AgentHostOptions {
        settings: AgentConnectSettings {
            workspace_id: "size-gate".to_string(),
            model: "openai/gpt-4.1-mini".to_string(),
            mobile_safe_tools: true,
        },
        provider: Arc::new(ScriptedProvider {
            round: AtomicUsize::new(0),
        }),
        tools: Arc::new(FixtureTools),
        approvals: Arc::new(FixtureApprovals),
        events: events.clone(),
    })
    .expect("size fixture host");

    let thread = host.thread_start(None).expect("thread");
    let runtime = tokio::runtime::Builder::new_current_thread()
        .enable_all()
        .build()
        .expect("runtime");
    runtime
        .block_on(host.turn_start(AgentTurnInput {
            thread_id: thread.thread_id,
            text: "size".to_string(),
            attachment_capture_ids: Vec::new(),
        }))
        .expect("turn");

    let collected = events.0.lock().expect("events").clone();
    let mut bridge = AgUiBridge::default();
    let mut agui = Vec::new();
    for event in collected {
        agui.extend(bridge.from_agent_event(&event));
    }
    std::hint::black_box(agui);
}
