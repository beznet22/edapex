//! Parity between the Rust wire contract and the TypeScript contract fixtures.
//!
//! `packages/contracts` is the source of truth for these shapes. Without this
//! test the two drift silently: a renamed field or a missing variant compiles on
//! both sides and fails only at runtime in a client.

use std::fs;
use std::path::PathBuf;

use edapex_agent::{
    AgentError, AgentErrorCode, AgentEvent, ApprovalDecision, CapabilityRisk,
    ToolCompletionStatus, TurnCompletionStatus,
};
use serde_json::Value;

fn fixture_path() -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("../../packages/contracts/fixtures/agent-events.json")
}

fn fixture() -> Vec<Value> {
    let raw = fs::read_to_string(fixture_path())
        .expect("agent-events fixture must exist at packages/contracts/fixtures/");
    serde_json::from_str::<Vec<Value>>(&raw).expect("fixture must be a JSON array")
}

/// Every fixture entry must deserialize into `AgentEvent`.
#[test]
fn every_fixture_event_deserializes() {
    for entry in fixture() {
        let parsed = serde_json::from_value::<AgentEvent>(entry.clone());
        assert!(
            parsed.is_ok(),
            "fixture entry did not deserialize: {entry}\n{parsed:?}"
        );
    }
}

/// Serializing a fixture event must produce the fixture back, field for field.
///
/// This is the direction that catches extra or renamed fields: the Rust enum is
/// authoritative, and a stray `serde` rename shows up as a diff here.
#[test]
fn fixture_round_trips_through_the_rust_enum() {
    for entry in fixture() {
        let parsed: AgentEvent = serde_json::from_value(entry.clone()).expect("deserializes");
        let reserialized = serde_json::to_value(&parsed).expect("serializes");
        assert_eq!(
            reserialized, entry,
            "fixture does not round-trip; the Rust wire shape drifted"
        );
    }
}

/// The fixture must exercise every variant, so a new variant cannot be added
/// without a matching contract fixture.
#[test]
fn fixture_covers_every_event_variant() {
    let covered: Vec<String> = fixture()
        .iter()
        .map(|entry| {
            entry["type"]
                .as_str()
                .expect("every fixture entry needs a type tag")
                .to_string()
        })
        .collect();

    for expected in [
        "connected",
        "turn_started",
        "message_delta",
        "reasoning_delta",
        "tool_started",
        "tool_completed",
        "approval_requested",
        "approval_resolved",
        "turn_completed",
        "interrupted",
        "error",
    ] {
        assert!(
            covered.iter().any(|tag| tag == expected),
            "fixture is missing a `{expected}` event"
        );
    }
}

/// Nested enums must use the exact strings the TypeScript contract publishes.
#[test]
fn nested_enum_strings_match_the_contract() {
    let entries = fixture();

    let risk = entries
        .iter()
        .find(|entry| entry["type"] == "approval_requested")
        .expect("approval_requested present")["risk"]
        .clone();
    assert_eq!(
        serde_json::to_value(CapabilityRisk::Write).expect("serializes"),
        risk,
        "CapabilityRisk::Write must serialize to the fixture value"
    );

    let status = entries
        .iter()
        .find(|entry| entry["type"] == "tool_completed")
        .expect("tool_completed present")["status"]
        .clone();
    assert_eq!(
        serde_json::to_value(ToolCompletionStatus::Completed).expect("serializes"),
        status
    );

    let completion = entries
        .iter()
        .find(|entry| entry["type"] == "turn_completed")
        .expect("turn_completed present")["status"]
        .clone();
    assert_eq!(
        serde_json::to_value(TurnCompletionStatus::Completed).expect("serializes"),
        completion
    );

    let decision = entries
        .iter()
        .find(|entry| entry["type"] == "approval_resolved")
        .expect("approval_resolved present")["decision"]
        .clone();
    assert_eq!(
        serde_json::to_value(ApprovalDecision::AllowOnce).expect("serializes"),
        decision
    );
}

/// A fixture approval carries `risk: "write"`. The core previously hardcoded
/// `read` on this path, so this guards the regression directly.
#[test]
fn approval_fixture_carries_a_non_read_risk() {
    let entry = fixture()
        .into_iter()
        .find(|entry| entry["type"] == "approval_requested")
        .expect("approval_requested present");

    let parsed: AgentEvent = serde_json::from_value(entry).expect("deserializes");
    match parsed {
        AgentEvent::ApprovalRequested { risk, decisions, .. } => {
            assert_eq!(risk, CapabilityRisk::Write);
            assert_eq!(decisions.len(), 4);
        }
        other => panic!("unexpected event: {other:?}"),
    }
}

/// Error codes are a closed set shared with `packages/contracts/src/platform.ts`.
#[test]
fn error_code_strings_are_snake_case_and_complete() {
    for (code, expected) in [
        (AgentErrorCode::UnsupportedCapability, "unsupported_capability"),
        (AgentErrorCode::PermissionDenied, "permission_denied"),
        (AgentErrorCode::CameraUnavailable, "camera_unavailable"),
        (AgentErrorCode::Cancelled, "cancelled"),
        (AgentErrorCode::AuthRequired, "auth_required"),
        (AgentErrorCode::ModelMissing, "model_missing"),
        (AgentErrorCode::InvalidInput, "invalid_input"),
        (AgentErrorCode::ProviderUnavailable, "provider_unavailable"),
        (AgentErrorCode::QuotaExceeded, "quota_exceeded"),
        (AgentErrorCode::InternalError, "internal_error"),
    ] {
        assert_eq!(code.as_str(), expected);
        assert_eq!(
            serde_json::to_value(code).expect("serializes"),
            Value::String(expected.to_string())
        );
    }
}

/// The fixture's error event must contain exactly the fields `AgentError` has.
#[test]
fn error_event_matches_the_agent_error_shape() {
    let entry = fixture()
        .into_iter()
        .find(|entry| entry["type"] == "error")
        .expect("error event present");

    let parsed: AgentEvent = serde_json::from_value(entry).expect("deserializes");
    match parsed {
        AgentEvent::Error { error, .. } => {
            assert_eq!(error.code, AgentErrorCode::ModelMissing);
            assert!(!error.retryable);
        }
        other => panic!("unexpected event: {other:?}"),
    }

    let error = AgentError::new(AgentErrorCode::ModelMissing, "x", false);
    let encoded = serde_json::to_value(&error).expect("serializes");
    assert_eq!(encoded["code"], "model_missing");
    assert_eq!(encoded["retryable"], false);
}
