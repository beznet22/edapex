use std::time::{SystemTime, UNIX_EPOCH};

use edapex_store::session_events::{SessionAppendOutcome, SessionEventInput};
use edapex_store::thread_snapshots::ThreadSnapshotKind;
use edapex_store::{MasterKey, RusqliteDriver, SqlDriver, SqlValue, Store, StoreError};

const SESSION: &str = "session-1";
const WORKSPACE: &str = "workspace-1";
const DEVICE: &str = "device-1";
const CLIENT: &str = "client-1";

fn memory_store() -> Store<RusqliteDriver> {
    let mut store = Store::new(
        RusqliteDriver::in_memory().expect("in-memory sqlite"),
        MasterKey::from_bytes([7u8; 32]),
    );
    store.migrate().expect("migrations");
    store.agent_device_id(WORKSPACE).expect("installation id");
    store
}

fn file_store(path: &str) -> Store<RusqliteDriver> {
    let mut store = Store::new(
        RusqliteDriver::open(path).expect("file sqlite"),
        MasterKey::from_bytes([7u8; 32]),
    );
    store.migrate().expect("migrations");
    store
}

fn event(event_id: &str, command_id: &str, fence: u64) -> SessionEventInput {
    SessionEventInput {
        session_id: SESSION.to_string(),
        event_id: event_id.to_string(),
        workspace_id: WORKSPACE.to_string(),
        device_id: DEVICE.to_string(),
        holder_id: CLIENT.to_string(),
        expected_fence: fence,
        kind: "user_message".to_string(),
        core_message_id: Some("core-1".to_string()),
        command_id: Some(command_id.to_string()),
        dedup_id: Some("dedup-1".to_string()),
        payload: b"first question".to_vec(),
        created_at_ms: 1_100,
    }
}

#[test]
fn command_retry_does_not_duplicate_an_event_or_outbox_entry() {
    let mut store = memory_store();
    store
        .ensure_agent_session(SESSION, WORKSPACE, DEVICE)
        .unwrap();
    store
        .claim_agent_session(SESSION, CLIENT, 10_000, 1_000)
        .unwrap();

    assert_eq!(
        store
            .append_agent_session_event(event("event-1", "command-1", 1))
            .unwrap(),
        SessionAppendOutcome::Appended(1)
    );
    assert_eq!(
        store
            .append_agent_session_event(event("event-retry", "command-1", 1))
            .unwrap(),
        SessionAppendOutcome::Duplicate(1)
    );
    assert_eq!(store.agent_session_events(SESSION, 0, 50).unwrap().len(), 1);
    assert_eq!(store.pending_session_events(DEVICE, 50).unwrap().len(), 1);
}

#[test]
fn a_stale_writer_cannot_append_or_leave_a_partial_outbox_write() {
    let mut store = memory_store();
    store
        .ensure_agent_session(SESSION, WORKSPACE, DEVICE)
        .unwrap();
    store
        .claim_agent_session(SESSION, CLIENT, 10_000, 1_000)
        .unwrap();

    let result = store.append_agent_session_event(event("stale-event", "command-stale", 99));
    assert!(matches!(result, Err(StoreError::LeaseLost)));
    assert!(store
        .agent_session_events(SESSION, 0, 50)
        .unwrap()
        .is_empty());
    assert!(store.pending_session_events(DEVICE, 50).unwrap().is_empty());
}

#[test]
fn another_live_holder_is_not_superseded() {
    let mut store = memory_store();
    store
        .ensure_agent_session(SESSION, WORKSPACE, DEVICE)
        .unwrap();
    store
        .claim_agent_session(SESSION, CLIENT, 10_000, 1_000)
        .unwrap();

    let lease = store
        .claim_agent_session(SESSION, "client-2", 10_000, 1_100)
        .unwrap();
    assert_eq!(lease.holder_id.as_deref(), Some(CLIENT));
    assert_eq!(lease.fence, 1);

    let expired = store
        .claim_agent_session(SESSION, "client-2", 10_000, 12_000)
        .unwrap();
    assert_eq!(expired.holder_id.as_deref(), Some("client-2"));
    assert_eq!(expired.fence, 2);
    assert!(matches!(
        store.release_agent_session(SESSION, CLIENT, 1),
        Err(StoreError::LeaseLost)
    ));
}

#[test]
fn fresh_handles_restore_encrypted_thread_snapshots() {
    let unique = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .expect("clock")
        .as_nanos();
    let path = std::env::temp_dir().join(format!(
        "edapex-infinity-{}-{unique}.sqlite",
        std::process::id()
    ));
    let path = path.to_string_lossy().into_owned();

    {
        let mut store = file_store(&path);
        assert_eq!(
            store
                .write_thread_snapshot(
                    WORKSPACE,
                    SESSION,
                    SESSION,
                    ThreadSnapshotKind::Conversation,
                    b"turn A context"
                )
                .unwrap(),
            1
        );
        assert_eq!(
            store
                .write_thread_snapshot(
                    WORKSPACE,
                    SESSION,
                    SESSION,
                    ThreadSnapshotKind::Conversation,
                    b"turns A and B"
                )
                .unwrap(),
            2
        );
    }

    {
        let mut reopened = file_store(&path);
        let snapshot = reopened
            .read_thread_snapshot(SESSION, ThreadSnapshotKind::Conversation)
            .unwrap()
            .expect("persisted snapshot");
        assert_eq!(snapshot.revision, 2);
        assert_eq!(snapshot.payload, b"turns A and B");

        reopened
            .driver_mut()
            .execute(
                "UPDATE agent_thread_snapshots SET body = ? WHERE thread_id = ? AND kind = 'conversation'",
                &[SqlValue::Blob(vec![1, 2, 3]), SqlValue::text(SESSION)],
            )
            .unwrap();
        assert!(matches!(
            reopened.read_thread_snapshot(SESSION, ThreadSnapshotKind::Conversation),
            Err(StoreError::Decrypt)
        ));
    }

    let _ = std::fs::remove_file(&path);
    let _ = std::fs::remove_file(format!("{path}-wal"));
    let _ = std::fs::remove_file(format!("{path}-shm"));
}

#[test]
fn installation_identity_is_stable_and_client_ids_are_distinct() {
    let mut store = memory_store();
    let first = store.agent_device_id(WORKSPACE).unwrap();
    let second = store.agent_device_id(WORKSPACE).unwrap();
    assert_eq!(first, second);
    assert_ne!(
        edapex_store::identity::new_client_id(),
        edapex_store::identity::new_client_id()
    );
}

#[test]
fn acknowledgement_deduplicates_retry_and_delete_purges_local_history() {
    let mut store = memory_store();
    store
        .ensure_agent_session(SESSION, WORKSPACE, DEVICE)
        .unwrap();
    store
        .claim_agent_session(SESSION, CLIENT, 10_000, 1_000)
        .unwrap();
    store
        .append_agent_session_event(event("event-1", "command-1", 1))
        .unwrap();

    store
        .acknowledge_session_events(DEVICE, &[("event-1".to_string(), 42)])
        .unwrap();
    store
        .acknowledge_session_events(DEVICE, &[("event-1".to_string(), 42)])
        .unwrap();
    assert!(store.pending_session_events(DEVICE, 10).unwrap().is_empty());

    store.delete_agent_session(SESSION, 2_000).unwrap();
    assert!(store
        .agent_session_events(SESSION, 0, 50)
        .unwrap()
        .is_empty());
    assert!(matches!(
        store.append_agent_session_event(event("event-2", "command-2", 1)),
        Err(StoreError::SessionDeleted)
    ));
}
