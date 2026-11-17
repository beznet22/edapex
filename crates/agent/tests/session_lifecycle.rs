//! Session lifecycle: cancellation, resume, stall detection and ownership.
//!
//! These are the behaviours a person notices. A stop that does not say so, a
//! resumed thread that silently reuses another session, or a hung provider that
//! leaves the composer spinning are all worse than a visible error.

mod common;

use std::sync::Arc;
use std::time::Duration;

use common::{cleanup, command, driver, path, Events, Provider, Tools};
use edapex_agent::{AgentErrorCode, AgentEvent, ApprovalDecision, ProviderChunk, SessionCommand,
    TurnCompletionStatus};

#[tokio::test(flavor = "multi_thread")]
async fn cancellation_emits_interrupted_and_plain_user_text_resumes() {
    let path = path("cancel-resume");
    let provider = Provider::scripted(vec![
        vec![],
        vec![
            ProviderChunk::Text("resumed".to_string()),
            ProviderChunk::Done {
                finish_reason: Some("stop".to_string()),
            },
        ],
    ]);
    let events = Arc::new(Events::default());
    let driver = driver(
        &path,
        provider.clone(),
        Tools::new(false),
        ApprovalDecision::AllowOnce,
        events.clone(),
    );
    driver.set_turn_timeout(Duration::from_secs(60));
    driver.create_session("root-cancel").await.unwrap();
    driver
        .execute(command(&driver, "root-cancel", "turn-cancel", "stop this"))
        .await
        .unwrap();
    events.wait_for_started("turn-cancel").await;

    driver
        .execute(SessionCommand::CancelTurn {
            command_id: "cancel-turn".to_string(),
            session_id: "root-cancel".to_string(),
            client_id: driver.client_id().to_string(),
            turn_id: "turn-cancel".to_string(),
        })
        .await
        .unwrap();
    events
        .wait_for("turn-cancel", TurnCompletionStatus::Stopped)
        .await;
    assert!(events.all().iter().any(
        |event| matches!(event, AgentEvent::Interrupted { turn_id, .. } if turn_id == "turn-cancel")
    ));

    driver
        .execute(command(&driver, "root-cancel", "turn-resumed", "continue"))
        .await
        .unwrap();
    events
        .wait_for("turn-resumed", TurnCompletionStatus::Completed)
        .await;
    assert_eq!(provider.request_count(), 2, "the resume never reached the model");
    driver.close().await.unwrap();
    cleanup(&path);
}

#[tokio::test(flavor = "multi_thread")]
async fn a_stalled_provider_fails_visibly_instead_of_hanging() {
    let path = path("timeout");
    let provider = Provider::scripted(vec![vec![]]);
    let events = Arc::new(Events::default());
    let driver = driver(
        &path,
        provider,
        Tools::new(false),
        ApprovalDecision::AllowOnce,
        events.clone(),
    );
    driver.set_turn_timeout(Duration::from_millis(20));
    driver.create_session("root-timeout").await.unwrap();
    driver
        .execute(command(
            &driver,
            "root-timeout",
            "turn-timeout",
            "wait for no final",
        ))
        .await
        .unwrap();
    events
        .wait_for("turn-timeout", TurnCompletionStatus::Error)
        .await;
    assert!(events.all().iter().any(|event| matches!(
        event,
        AgentEvent::Error {
            error,
            ..
        } if error.code == AgentErrorCode::ProviderUnavailable && error.retryable
    )));
    driver.close().await.unwrap();
    cleanup(&path);
}

#[tokio::test(flavor = "multi_thread")]
async fn a_second_live_client_cannot_claim_the_same_session() {
    let path = path("lease");
    let provider = Provider::scripted(vec![]);
    let first = driver(
        &path,
        provider.clone(),
        Tools::new(false),
        ApprovalDecision::AllowOnce,
        Arc::new(Events::default()),
    );
    first.create_session("root-lease").await.unwrap();

    let second = driver(
        &path,
        provider,
        Tools::new(false),
        ApprovalDecision::AllowOnce,
        Arc::new(Events::default()),
    );
    let error = second
        .create_session("root-lease")
        .await
        .expect_err("second owner refused");
    assert_eq!(error.code, AgentErrorCode::LeaseLost);
    second.close().await.unwrap();
    first.close().await.unwrap();
    cleanup(&path);
}
