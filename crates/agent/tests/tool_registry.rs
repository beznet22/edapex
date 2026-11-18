//! The external-tool approval boundary.
//!
//! A denial must reach the model as a tool result, must never execute the tool,
//! and must still settle the turn. That last part is the regression: the pinned
//! core coalesces completion events across tool rounds, so a turn that reported
//! "a tool ran" instead of "no tool is outstanding" never finished.

mod common;

use std::sync::atomic::Ordering;
use std::sync::Arc;

use common::{cleanup, command, driver, path, Events, Provider, Tools};
use edapex_agent::{
    AgentEvent, ApprovalDecision, ProviderChunk, ToolCompletionStatus, TurnCompletionStatus,
};

#[tokio::test(flavor = "multi_thread")]
async fn denied_approval_never_executes_and_returns_a_tool_failure_to_the_model() {
    let path = path("denied");
    let provider = Provider::scripted(vec![
        vec![
            ProviderChunk::ToolCallDelta {
                index: 0,
                id: Some("tool-1".to_string()),
                name: Some("web_search".to_string()),
                arguments: "{\"query\":\"marks\"}".to_string(),
            },
            ProviderChunk::Done {
                finish_reason: Some("tool_calls".to_string()),
            },
        ],
        vec![
            ProviderChunk::Text("follow-up".to_string()),
            ProviderChunk::Done {
                finish_reason: Some("stop".to_string()),
            },
        ],
    ]);
    let tools = Tools::new(true);
    let events = Arc::new(Events::default());
    let driver = driver(
        &path,
        provider.clone(),
        tools.clone(),
        ApprovalDecision::Deny,
        events.clone(),
    );

    driver.create_session("root-tools").await.unwrap();
    driver
        .execute(command(&driver, "root-tools", "turn-tools", "search"))
        .await
        .unwrap();
    events
        .wait_for("turn-tools", TurnCompletionStatus::Completed)
        .await;

    assert_eq!(tools.calls.load(Ordering::SeqCst), 0, "a denied tool ran");
    let all = events.all();
    assert!(
        all.iter().any(
            |event| matches!(event, AgentEvent::ToolStarted { name, .. } if name == "web_search")
        ),
        "tool events were: {all:?}"
    );
    assert!(all.iter().any(|event| matches!(
        event,
        AgentEvent::ToolCompleted {
            status: ToolCompletionStatus::Declined,
            ..
        }
    )));
    assert!(all.iter().any(|event| matches!(
        event,
        AgentEvent::ApprovalResolved {
            decision: ApprovalDecision::Deny,
            ..
        }
    )));
    assert_eq!(
        provider.request_count(),
        2,
        "the model never saw the denial"
    );
    {
        let requests = provider.request_contents();
        assert!(
            requests[1].contains("not allowed"),
            "the denial did not reach the model: {}",
            requests[1]
        );
    }
    driver.close().await.unwrap();
    cleanup(&path);
}
