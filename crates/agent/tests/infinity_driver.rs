use std::collections::VecDeque;
use std::future::Future;
use std::pin::Pin;
use std::sync::{Arc, Mutex};
use std::time::{SystemTime, UNIX_EPOCH};

use edapex_agent::{NativeAgentDriver, SessionCommand, StoreContext};
use edapex_store::MasterKey;
use tokio::sync::mpsc;

use edapex_agent::{
    AgentConnectSettings, AgentError, AgentEvent, ApprovalDecision, ApprovalHandler,
    ApprovalRequest, DynamicToolCall, DynamicToolResult, EventSink, ProviderChunk, ProviderClient,
    ProviderRequest, ToolExecutor, TurnCompletionStatus,
};

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

    fn requests(&self) -> Vec<ProviderRequest> {
        self.requests.lock().expect("requests").clone()
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

    async fn wait_for_turn(&self, turn_id: &str) {
        for _ in 0..3_000 {
            if self.snapshot().iter().any(|event| {
                matches!(
                    event,
                    AgentEvent::TurnCompleted {
                        turn_id: accepted,
                        status: TurnCompletionStatus::Completed,
                        ..
                    } if accepted == turn_id
                )
            }) {
                return;
            }
            if self.snapshot().iter().any(|event| {
                matches!(
                    event,
                    AgentEvent::TurnCompleted {
                        turn_id: accepted,
                        status: TurnCompletionStatus::Error,
                        ..
                    } if accepted == turn_id
                )
            }) {
                panic!("turn {turn_id} failed: {:?}", self.snapshot());
            }
            tokio::time::sleep(std::time::Duration::from_millis(2)).await;
        }
        panic!("turn {turn_id} did not complete: {:?}", self.snapshot());
    }
}

struct NoopTools;
impl ToolExecutor for NoopTools {
    fn execute(
        &self,
        _call: DynamicToolCall,
    ) -> Pin<Box<dyn Future<Output = DynamicToolResult> + Send>> {
        Box::pin(async { DynamicToolResult::text("unused") })
    }
}

struct AllowApprovals;
impl ApprovalHandler for AllowApprovals {
    fn request(
        &self,
        _request: ApprovalRequest,
    ) -> Pin<Box<dyn Future<Output = ApprovalDecision> + Send>> {
        Box::pin(async { ApprovalDecision::AllowOnce })
    }
}

fn path(name: &str) -> String {
    let unique = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .expect("clock")
        .as_nanos();
    std::env::temp_dir()
        .join(format!(
            "edapex-infinity-driver-{name}-{}-{unique}.sqlite",
            std::process::id()
        ))
        .to_string_lossy()
        .into_owned()
}

fn context(path: &str) -> StoreContext {
    StoreContext::open(path, "workspace", MasterKey::from_bytes([19u8; 32])).expect("native store")
}

fn driver(
    path: &str,
    provider: Arc<ScriptedProvider>,
    events: Arc<CollectedEvents>,
) -> NativeAgentDriver {
    NativeAgentDriver::connect(
        AgentConnectSettings {
            workspace_id: "workspace".to_string(),
            model: "test/model".to_string(),
            mobile_safe_tools: false,
        },
        context(path),
        provider,
        Arc::new(NoopTools),
        Arc::new(AllowApprovals),
        events,
    )
    .expect("driver connects")
}

fn command(driver: &NativeAgentDriver, root: &str, id: &str, text: &str) -> SessionCommand {
    SessionCommand::EnqueueText {
        command_id: id.to_string(),
        session_id: root.to_string(),
        client_id: driver.client_id().to_string(),
        thread_id: root.to_string(),
        dedup_id: format!("dedup-{id}"),
        text: text.to_string(),
    }
}

async fn turn(
    driver: &NativeAgentDriver,
    events: &CollectedEvents,
    root: &str,
    id: &str,
    text: &str,
) {
    driver
        .execute(command(driver, root, id, text))
        .await
        .expect("command accepted");
    events.wait_for_turn(id).await;
}

fn cleanup(path: &str) {
    let _ = std::fs::remove_file(path);
    let _ = std::fs::remove_file(format!("{path}-wal"));
    let _ = std::fs::remove_file(format!("{path}-shm"));
}

#[tokio::test(flavor = "multi_thread")]
async fn provider_context_survives_recreation_and_isolates_sessions() {
    let path = path("resume");
    {
        let provider = ScriptedProvider::new(vec![
            vec![
                ProviderChunk::Text("ANSWER-A".to_string()),
                ProviderChunk::Done {
                    finish_reason: Some("stop".to_string()),
                },
            ],
            vec![
                ProviderChunk::Text("OTHER-ANSWER".to_string()),
                ProviderChunk::Done {
                    finish_reason: Some("stop".to_string()),
                },
            ],
        ]);
        let events = Arc::new(CollectedEvents::default());
        let driver = driver(&path, provider, events.clone());
        driver.create_session("root-A").await.unwrap();
        turn(&driver, &events, "root-A", "turn-a1", "QUESTION-A").await;
        turn(
            &driver,
            &events,
            "root-other",
            "turn-other",
            "OTHER-SESSION",
        )
        .await;
        driver.close().await.unwrap();
    }

    let provider = ScriptedProvider::new(vec![vec![
        ProviderChunk::Text("ANSWER-B".to_string()),
        ProviderChunk::Done {
            finish_reason: Some("stop".to_string()),
        },
    ]]);
    let events = Arc::new(CollectedEvents::default());
    let driver = driver(&path, provider.clone(), events.clone());
    driver.create_session("root-A").await.unwrap();
    turn(&driver, &events, "root-A", "turn-b1", "QUESTION-B").await;

    let requests = provider.requests();
    assert_eq!(requests.len(), 1, "one model call for turn B");
    let text = requests[0]
        .messages
        .iter()
        .filter_map(|message| message.content.as_deref())
        .collect::<Vec<_>>()
        .join("\n");
    assert!(
        text.contains("QUESTION-A"),
        "second request lacks turn A: {text}"
    );
    assert!(
        text.contains("ANSWER-A"),
        "second request lacks first answer: {text}"
    );
    assert!(
        text.contains("QUESTION-B"),
        "second request lacks current input: {text}"
    );
    assert!(
        !text.contains("OTHER-SESSION"),
        "another session leaked into turn B: {text}"
    );
    assert_eq!(requests[0].model, "test/model");

    let before_retry = requests.len();
    let receipt = driver
        .execute(command(&driver, "root-A", "turn-b1", "QUESTION-B"))
        .await
        .unwrap();
    assert!(receipt.deduplicated);
    tokio::time::sleep(std::time::Duration::from_millis(50)).await;
    assert_eq!(provider.requests().len(), before_retry);
    assert!(events.snapshot().iter().any(|event| {
        matches!(event, AgentEvent::SessionSnapshot { view }
            if view.session_id == "root-A"
                && view.thread_id == view.session_id
                && view.messages.iter().any(|message| message.text == "ANSWER-A")
                && view.messages.iter().any(|message| message.text == "ANSWER-B"))
    }));

    driver.close().await.unwrap();
    cleanup(&path);
}

#[tokio::test(flavor = "multi_thread")]
async fn an_existing_queue_and_a_new_send_preserve_fifo() {
    let path = path("fifo");
    let provider = ScriptedProvider::new(vec![
        vec![
            ProviderChunk::Text("FIRST".to_string()),
            ProviderChunk::Done {
                finish_reason: Some("stop".to_string()),
            },
        ],
        vec![
            ProviderChunk::Text("SECOND".to_string()),
            ProviderChunk::Done {
                finish_reason: Some("stop".to_string()),
            },
        ],
        vec![
            ProviderChunk::Text("THIRD".to_string()),
            ProviderChunk::Done {
                finish_reason: Some("stop".to_string()),
            },
        ],
    ]);
    let events = Arc::new(CollectedEvents::default());
    let driver = driver(&path, provider.clone(), events.clone());

    turn(&driver, &events, "root-fifo", "turn-1", "first message").await;
    driver
        .execute(command(&driver, "root-fifo", "turn-2", "second message"))
        .await
        .unwrap();
    driver
        .execute(command(&driver, "root-fifo", "turn-3", "third message"))
        .await
        .unwrap();
    events.wait_for_turn("turn-2").await;
    events.wait_for_turn("turn-3").await;

    let texts = provider
        .requests()
        .iter()
        .map(|request| {
            request
                .messages
                .iter()
                .filter_map(|message| message.content.as_deref())
                .filter(|text| text.contains("second message") || text.contains("third message"))
                .collect::<Vec<_>>()
                .join("|")
        })
        .collect::<Vec<_>>();
    assert_eq!(texts.len(), 3);
    assert!(texts[1].contains("second message"));
    assert!(!texts[1].contains("third message"));
    assert!(texts[2].contains("second message"));
    assert!(texts[2].contains("third message"));

    driver.close().await.unwrap();
    cleanup(&path);
}
