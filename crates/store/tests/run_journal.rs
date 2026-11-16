//! The journal's contract: a worker can find unfinished work, open exactly one
//! checkpoint, and nothing readable about the conversation is on disk.

use edapex_store::{MasterKey, RusqliteDriver, SqlDriver, SqlValue, Store};

fn store() -> Store<RusqliteDriver> {
    let mut store = Store::new(RusqliteDriver::in_memory().unwrap(), MasterKey::from_bytes([7u8; 32]));
    store.migrate().unwrap();
    store
}

fn contains(haystack: &[u8], needle: &[u8]) -> bool {
    haystack.windows(needle.len()).any(|window| window == needle)
}

#[test]
fn a_checkpoint_survives_as_the_exact_messages() {
    let mut store = store();
    store.begin_run("run-1", "thread-1", "ws", b"{}", b"{\"model\":\"m\"}", 100).unwrap();

    let messages = br#"[{"role":"assistant","content":"two marks are missing"}]"#;
    store.checkpoint_run("run-1", messages, 120).unwrap();

    let point = store.resume_point("run-1").unwrap().expect("no resume point");
    assert_eq!(point.checkpoint, messages);
    assert_eq!(point.input, b"{}");
    assert_eq!(point.settings, br#"{"model":"m"}"#);
    assert_eq!(point.run.thread_id, "thread-1");
    assert_eq!(point.run.status, "running");
    assert_eq!(point.run.attempt, 0);
}

#[test]
fn the_checkpoint_on_disk_is_not_readable() {
    let mut store = store();
    store.begin_run("run-1", "thread-1", "ws", b"{}", b"{\"model\":\"m\"}", 100).unwrap();
    store
        .checkpoint_run("run-1", b"Confidential Term 2 marksheet", 120)
        .unwrap();

    let rows = store
        .driver_mut()
        .query("SELECT body FROM runs WHERE id = ?", &[SqlValue::text("run-1")])
        .unwrap();
    let blob = rows[0][0].as_blob().expect("body is a blob");
    assert!(
        !contains(blob, b"Confidential"),
        "the checkpoint was stored in the clear"
    );
}

#[test]
fn events_keep_their_order_and_open_with_their_bodies() {
    let mut store = store();
    store.begin_run("run-1", "thread-1", "ws", b"{}", b"{\"model\":\"m\"}", 100).unwrap();

    store
        .append_run_events(
            "run-1",
            &[("tool_started", b"web_search"), ("tool_completed", b"ok")],
            110,
        )
        .unwrap();
    store
        .append_run_events("run-1", &[("message_delta", b"Term")], 120)
        .unwrap();

    let events = store.run_events("run-1").unwrap();
    assert_eq!(
        events,
        vec![
            (1, "tool_started".to_string(), b"web_search".to_vec()),
            (2, "tool_completed".to_string(), b"ok".to_vec()),
            (3, "message_delta".to_string(), b"Term".to_vec()),
        ]
    );
}

#[test]
fn an_event_body_is_not_readable_on_disk() {
    let mut store = store();
    store.begin_run("run-1", "thread-1", "ws", b"{}", b"{\"model\":\"m\"}", 100).unwrap();
    store
        .append_run_events("run-1", &[("message_delta", b"Chidi scored 82")], 110)
        .unwrap();

    let rows = store
        .driver_mut()
        .query("SELECT body FROM run_events WHERE run_id = ?", &[SqlValue::text("run-1")])
        .unwrap();
    let blob = rows[0][0].as_blob().unwrap();
    assert!(!contains(blob, b"Chidi"), "an event body was stored in the clear");
}

#[test]
fn a_settled_run_is_not_offered_to_a_worker() {
    let mut store = store();
    store.begin_run("run-1", "thread-1", "ws", b"{}", b"{\"model\":\"m\"}", 100).unwrap();
    store.begin_run("run-2", "thread-2", "ws", b"{}", b"{\"model\":\"m\"}", 101).unwrap();

    store.settle_run("run-1", "done", None, 130).unwrap();

    let open = store.open_runs(10).unwrap();
    assert_eq!(open.len(), 1);
    assert_eq!(open[0].id, "run-2");
}

#[test]
fn a_second_worker_cannot_take_a_live_lease() {
    let mut store = store();
    store.begin_run("run-1", "thread-1", "ws", b"{}", b"{\"model\":\"m\"}", 100).unwrap();

    assert!(store.claim_run("run-1", 100, 130).unwrap());
    assert!(
        !store.claim_run("run-1", 120, 150).unwrap(),
        "a live lease was taken twice"
    );
    assert!(
        store.claim_run("run-1", 131, 161).unwrap(),
        "an expired lease stayed held"
    );
}

#[test]
fn attempts_count_up_so_a_worker_can_stop_retrying() {
    let mut store = store();
    store.begin_run("run-1", "thread-1", "ws", b"{}", b"{\"model\":\"m\"}", 100).unwrap();

    assert_eq!(store.bump_run_attempt("run-1").unwrap(), 1);
    assert_eq!(store.bump_run_attempt("run-1").unwrap(), 2);
    assert_eq!(store.open_runs(1).unwrap()[0].attempt, 2);
}

#[test]
fn beginning_the_same_run_twice_keeps_the_first_row() {
    let mut store = store();
    store.begin_run("run-1", "thread-1", "ws", b"first", b"settings", 100).unwrap();
    store.begin_run("run-1", "thread-1", "ws", b"second", b"settings", 101).unwrap();

    let point = store.resume_point("run-1").unwrap().unwrap();
    assert_eq!(point.input, b"first");
    // The checkpoint starts empty: a run that died before its first tool round
    // replays from the input, not from a half-written transcript.
    assert_eq!(point.checkpoint, b"[]");
    assert_eq!(store.open_runs(10).unwrap().len(), 1);
}
