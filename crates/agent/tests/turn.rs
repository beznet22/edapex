use std::collections::VecDeque;
use std::future::Future;
use std::pin::Pin;
use std::sync::atomic::{AtomicUsize, Ordering};
use std::sync::{Arc, Mutex};
use std::time::Duration;

use edapex_agent::{
    AgentConnectSettings, AgentError, AgentEvent, AgentHost, AgentHostOptions, AgentTurnInput,
    ApprovalDecision, ApprovalHandler, ApprovalRequest, ChatMessage, DynamicToolCall,
    DynamicToolResult, EventSink, ProviderChunk, ProviderClient, ProviderRequest, ToolExecutor,
    TurnCompletionStatus,
};
use tokio::sync::mpsc;

#[derive(Default)]
struct ScriptedProvider {
    script: Mutex<VecDeque<Vec<ProviderChunk>>>,
    requests: Mutex<Vec<ProviderRequest>>,
}

impl ScriptedProvider {
    fn new(script: Vec<Vec<ProviderChunk>>) -> Arc<Self> {
        Arc::new(Self {
            script: Mutex::new(script.into()),
            requests: Mutex::new(Vec::new()),
        })
    }
}

impl ProviderClient for ScriptedProvider {
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
struct CollectedEvents(Mutex<Vec<AgentEvent>>);

impl EventSink for CollectedEvents {
    fn emit(&self, event: AgentEvent) {
        self.0.lock().expect("events").push(event);
    }
}

impl CollectedEvents {
    fn snapshot(&self) -> Vec<AgentEvent> {
        self.0.lock().expect("events").clone()
    }

    /// Wait until the detached turn reports completion.
    ///
    /// `turn_start` returns as soon as the turn is accepted, so a test that reads
    /// events immediately would race the turn loop.
    async fn wait_for_completion(&self) {
        for _ in 0..500 {
            let done = self
                .snapshot()
                .iter()
                .any(|event| matches!(event, AgentEvent::TurnCompleted { .. }));
            if done {
                return;
            }
            tokio::time::sleep(std::time::Duration::from_millis(2)).await;
        }
        panic!("the turn did not complete");
    }
}

struct FakeTools {
    calls: AtomicUsize,
    require_approval: bool,
}

impl FakeTools {
    fn new(require_approval: bool) -> Arc<Self> {
        Arc::new(Self {
            calls: AtomicUsize::new(0),
            require_approval,
        })
    }
}

impl ToolExecutor for FakeTools {
    fn requires_approval(&self, _tool: edapex_agent::DynamicToolName) -> bool {
        self.require_approval
    }

    fn execute(
        &self,
        call: DynamicToolCall,
    ) -> Pin<Box<dyn Future<Output = DynamicToolResult> + Send>> {
        self.calls.fetch_add(1, Ordering::SeqCst);
        Box::pin(
            async move { DynamicToolResult::text(format!("result for {}", call.tool.as_str())) },
        )
    }
}

struct FixedApproval(ApprovalDecision);

impl ApprovalHandler for FixedApproval {
    fn request(
        &self,
        _request: ApprovalRequest,
    ) -> Pin<Box<dyn Future<Output = ApprovalDecision> + Send>> {
        let decision = self.0;
        Box::pin(async move { decision })
    }
}

fn host(
    provider: Arc<ScriptedProvider>,
    tools: Arc<FakeTools>,
    approvals: Arc<FixedApproval>,
) -> (AgentHost, Arc<CollectedEvents>) {
    let events = Arc::new(CollectedEvents::default());
    let host = AgentHost::connect(AgentHostOptions {
        settings: AgentConnectSettings {
            workspace_id: "workspace".to_string(),
            model: "test/model".to_string(),
            mobile_safe_tools: false,
        },
        provider,
        tools,
        approvals,
        events: events.clone(),
    })
    .expect("host connects");
    (host, events)
}

#[test]
fn serializes_events_with_contract_field_names() {
    let value = serde_json::to_value(AgentEvent::TurnStarted {
        thread_id: "thread".to_string(),
        turn_id: "turn".to_string(),
    })
    .expect("serializes");
    assert_eq!(value["type"], "turn_started");
    assert_eq!(value["threadId"], "thread");
    assert_eq!(value["turnId"], "turn");
}

#[tokio::test]
async fn streams_text_and_completes() {
    let provider = ScriptedProvider::new(vec![vec![
        ProviderChunk::Text("hello".to_string()),
        ProviderChunk::Text(" world".to_string()),
        ProviderChunk::Done {
            finish_reason: Some("stop".to_string()),
        },
    ]]);
    let tools = FakeTools::new(false);
    let (host, events) = host(
        provider.clone(),
        tools,
        Arc::new(FixedApproval(ApprovalDecision::AllowOnce)),
    );
    let thread = host.thread_start(None).expect("thread");
    let turn = host
        .turn_start(AgentTurnInput {
            thread_id: thread.thread_id,
            text: "hi".to_string(),
            attachment_capture_ids: Vec::new(),
        })
        .await
        .expect("turn");

    assert!(!turn.turn_id.is_empty());
    events.wait_for_completion().await;
    let events = events.snapshot();
    assert!(matches!(events[0], AgentEvent::Connected { .. }));
    assert!(events.iter().any(|event| matches!(
        event,
        AgentEvent::MessageDelta { delta, .. } if delta == "hello"
    )));
    assert!(events.iter().any(|event| matches!(
        event,
        AgentEvent::TurnCompleted {
            status: TurnCompletionStatus::Completed,
            ..
        }
    )));
    let requests = provider.requests.lock().expect("requests");
    assert_eq!(requests.len(), 1);
    assert!(matches!(
        requests[0].messages[1].role,
        edapex_agent::Role::User
    ));
}

#[tokio::test]
async fn executes_tool_calls_and_round_trips_results() {
    let provider = ScriptedProvider::new(vec![
        vec![
            ProviderChunk::ToolCallDelta {
                index: 0,
                id: Some("call_1".to_string()),
                name: Some("web_search".to_string()),
                arguments: "{\"query\":\"school\"}".to_string(),
            },
            ProviderChunk::Done {
                finish_reason: Some("tool_calls".to_string()),
            },
        ],
        vec![
            ProviderChunk::Text("done".to_string()),
            ProviderChunk::Done {
                finish_reason: Some("stop".to_string()),
            },
        ],
    ]);
    let tools = FakeTools::new(false);
    let (host, events) = host(
        provider.clone(),
        tools.clone(),
        Arc::new(FixedApproval(ApprovalDecision::AllowOnce)),
    );
    let thread = host.thread_start(None).expect("thread");
    host.turn_start(AgentTurnInput {
        thread_id: thread.thread_id,
        text: "search".to_string(),
        attachment_capture_ids: Vec::new(),
    })
    .await
    .expect("turn");

    events.wait_for_completion().await;
    assert_eq!(tools.calls.load(Ordering::SeqCst), 1);
    let events = events.snapshot();
    assert!(events.iter().any(|event| matches!(
        event,
        AgentEvent::ToolStarted { name, .. } if name == "web_search"
    )));
    assert!(events.iter().any(|event| matches!(
        event,
        AgentEvent::ToolCompleted {
            status: edapex_agent::ToolCompletionStatus::Completed,
            ..
        }
    )));
    let requests = provider.requests.lock().expect("requests");
    assert_eq!(requests.len(), 2);
    assert!(requests[1].messages.iter().any(|message| matches!(
        message,
        ChatMessage {
            role: edapex_agent::Role::Tool,
            tool_call_id: Some(id),
            ..
        } if id == "call_1"
    )));
}

#[tokio::test]
async fn declines_approval_without_executing() {
    let provider = ScriptedProvider::new(vec![
        vec![
            ProviderChunk::ToolCallDelta {
                index: 0,
                id: Some("call_1".to_string()),
                name: Some("web_search".to_string()),
                arguments: "{}".to_string(),
            },
            ProviderChunk::Done {
                finish_reason: Some("tool_calls".to_string()),
            },
        ],
        vec![
            ProviderChunk::Text("stopped".to_string()),
            ProviderChunk::Done {
                finish_reason: Some("stop".to_string()),
            },
        ],
    ]);
    let tools = FakeTools::new(true);
    let (host, events) = host(
        provider,
        tools.clone(),
        Arc::new(FixedApproval(ApprovalDecision::Deny)),
    );
    let thread = host.thread_start(None).expect("thread");
    host.turn_start(AgentTurnInput {
        thread_id: thread.thread_id,
        text: "search".to_string(),
        attachment_capture_ids: Vec::new(),
    })
    .await
    .expect("turn");

    events.wait_for_completion().await;
    assert_eq!(tools.calls.load(Ordering::SeqCst), 0);
    let events = events.snapshot();
    assert!(events.iter().any(|event| matches!(
        event,
        AgentEvent::ToolCompleted {
            status: edapex_agent::ToolCompletionStatus::Declined,
            ..
        }
    )));
}

#[tokio::test]
async fn interrupts_a_running_turn() {
    struct SlowProvider;
    impl ProviderClient for SlowProvider {
        fn stream_chat(
            &self,
            _request: ProviderRequest,
        ) -> Result<mpsc::Receiver<ProviderChunk>, AgentError> {
            let (sender, receiver) = mpsc::channel(4);
            tokio::spawn(async move {
                let _ = sender
                    .send(ProviderChunk::Text("partial".to_string()))
                    .await;
                tokio::time::sleep(Duration::from_secs(5)).await;
            });
            Ok(receiver)
        }
    }

    let events = Arc::new(CollectedEvents::default());
    let host = AgentHost::connect(AgentHostOptions {
        settings: AgentConnectSettings {
            workspace_id: "workspace".to_string(),
            model: "test/model".to_string(),
            mobile_safe_tools: false,
        },
        provider: Arc::new(SlowProvider),
        tools: FakeTools::new(false),
        approvals: Arc::new(FixedApproval(ApprovalDecision::AllowOnce)),
        events: events.clone(),
    })
    .expect("host");
    let thread = host.thread_start(None).expect("thread");
    let thread_id = thread.thread_id.clone();
    let handle = {
        let host = host.clone();
        tokio::spawn(async move {
            host.turn_start(AgentTurnInput {
                thread_id,
                text: "long".to_string(),
                attachment_capture_ids: Vec::new(),
            })
            .await
        })
    };

    tokio::time::sleep(Duration::from_millis(100)).await;
    let turn_id = events
        .snapshot()
        .iter()
        .find_map(|event| match event {
            AgentEvent::TurnStarted { turn_id, .. } => Some(turn_id.clone()),
            _ => None,
        })
        .expect("turn started");
    host.interrupt(&thread.thread_id, &turn_id)
        .expect("interrupt");
    handle.await.expect("task").expect("turn");
    events.wait_for_completion().await;

    let events = events.snapshot();
    assert!(events
        .iter()
        .any(|event| matches!(event, AgentEvent::Interrupted { .. })));
    assert!(events.iter().any(|event| matches!(
        event,
        AgentEvent::TurnCompleted {
            status: TurnCompletionStatus::Stopped,
            ..
        }
    )));
}
