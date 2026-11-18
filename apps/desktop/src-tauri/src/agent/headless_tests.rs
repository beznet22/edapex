//! Lease and drain behaviour for the headless worker.
//!
//! Split out of `headless.rs` so that module stays under its size cap; these
//! exercise the store directly, because that is where the ownership rules live.

use super::super::pending::now_ms;
use super::*;
use edapex_agent::StoreContext;
use edapex_store::session_events::SessionEventInput;

use std::time::{SystemTime, UNIX_EPOCH};

use edapex_store::{RusqliteDriver, Store};

/// The driver's default lease; the tests advance past it to simulate a dead holder.
const LEASE_MS: u64 = 60_000;

fn scratch(name: &str) -> String {
    let unique = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .expect("clock")
        .as_nanos();
    std::env::temp_dir()
        .join(format!(
            "edapex-headless-{name}-{}-{unique}.sqlite",
            std::process::id()
        ))
        .to_string_lossy()
        .into_owned()
}

fn queued_session(path: &str, key: MasterKey) {
    let context = StoreContext::open(path, "ws-1", key).expect("open");
    let mut store = context.lock().expect("store");
    store
        .ensure_agent_session("root-1", "ws-1", "device-1", "test/model", false)
        .expect("session");
    store
        .claim_agent_session("root-1", "client-1", LEASE_MS, now_ms())
        .expect("lease");
    store
        .append_agent_session_event(SessionEventInput {
            session_id: "root-1".to_string(),
            event_id: "event-1".to_string(),
            workspace_id: "ws-1".to_string(),
            device_id: "device-1".to_string(),
            holder_id: "client-1".to_string(),
            expected_fence: 1,
            kind: "message_queued".to_string(),
            core_message_id: None,
            command_id: Some("command-1".to_string()),
            dedup_id: Some("dedup-1".to_string()),
            payload: b"{}".to_vec(),
            created_at_ms: now_ms(),
        })
        .expect("queue");
}

/// A committed queue must be visible to a worker with fresh handles, and the
/// worker must not pick it up while another live holder owns it.
#[test]
fn only_an_unowned_session_with_queued_work_is_offered() {
    let path = scratch("pending");
    let key = MasterKey::from_bytes([51u8; 32]);
    queued_session(&path, key.clone());

    let offered = {
        let mut store = Store::new(RusqliteDriver::open(&path).expect("open"), key.clone());
        store.migrate().expect("migrate");
        store
            .agent_sessions_pending(now_ms(), BATCH)
            .expect("query")
    };
    assert!(offered.is_empty(), "a live holder was offered to the worker");

    let offered_after_expiry = {
        let mut store = Store::new(RusqliteDriver::open(&path).expect("open"), key);
        store.migrate().expect("migrate");
        store
            .agent_sessions_pending(now_ms() + LEASE_MS + 1, BATCH)
            .expect("query")
    };
    assert_eq!(offered_after_expiry.len(), 1);
    assert_eq!(offered_after_expiry[0].session_id, "root-1");
    assert_eq!(offered_after_expiry[0].model, "test/model");

    let _ = std::fs::remove_file(&path);
}

#[test]
fn a_queued_message_stops_being_offered_once_it_is_sent() {
    use edapex_store::session_events::SessionAppendOutcome;

    let path = scratch("drain");
    let key = MasterKey::from_bytes([52u8; 32]);
    let context = StoreContext::open(&path, "ws-1", key.clone()).expect("open");
    {
        let mut store = context.lock().expect("store");
        store
            .ensure_agent_session("root-1", "ws-1", "device-1", "test/model", false)
            .expect("session");
        let lease = store
            .claim_agent_session("root-1", "client-1", LEASE_MS, now_ms())
            .expect("lease");
        let event = |id: &str, kind: &str| SessionEventInput {
            session_id: "root-1".to_string(),
            event_id: id.to_string(),
            workspace_id: "ws-1".to_string(),
            device_id: "device-1".to_string(),
            holder_id: "client-1".to_string(),
            expected_fence: lease.fence,
            kind: kind.to_string(),
            core_message_id: None,
            command_id: None,
            dedup_id: None,
            payload: b"{}".to_vec(),
            created_at_ms: now_ms(),
        };
        assert_eq!(
            store
                .append_agent_session_event(event("event-q", "message_queued"))
                .expect("queued"),
            SessionAppendOutcome::Appended(1)
        );
        store
            .append_agent_session_event(event("event-s", "message_sent"))
            .expect("sent");
    }

    let mut store = Store::new(RusqliteDriver::open(&path).expect("open"), key);
    store.migrate().expect("migrate");
    assert!(
        store
            .agent_sessions_pending(now_ms() + LEASE_MS + 1, BATCH)
            .expect("query")
            .is_empty(),
        "a drained session was offered again"
    );

    let _ = std::fs::remove_file(&path);
}
