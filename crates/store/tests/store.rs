use edapex_store::crypto::MasterKey;
use edapex_store::{Operation, RusqliteDriver, SqlDriver, SqlValue, Store, StoreError};

fn store() -> Store<RusqliteDriver> {
    let mut store = Store::new(
        RusqliteDriver::in_memory().unwrap(),
        MasterKey::from_bytes([3u8; 32]),
    );
    store.migrate().unwrap();
    store
}

fn thread(store: &mut Store<RusqliteDriver>, id: &str) {
    store
        .write_record(
            "threads",
            id,
            "ws-1",
            Operation::Create,
            &[("updated_at", SqlValue::integer(100))],
            b"{\"title\":\"Marks\"}",
            None,
            "device-a",
            100,
        )
        .unwrap();
}

fn message(store: &mut Store<RusqliteDriver>, id: &str, text: &str) {
    store
        .write_record(
            "messages",
            id,
            "ws-1",
            Operation::Create,
            &[
                ("thread_id", SqlValue::text("t-1")),
                ("role", SqlValue::text("user")),
                ("device_seq", SqlValue::integer(1)),
            ],
            text.as_bytes(),
            Some(text),
            "device-a",
            100,
        )
        .unwrap();
}

#[test]
fn migrations_are_idempotent() {
    let mut store = store();
    let first = store.version().unwrap();
    store.migrate().unwrap();
    assert_eq!(store.version().unwrap(), first);
    assert_eq!(first, store.latest_supported_version());
}

#[test]
fn a_write_creates_exactly_one_outbox_entry() {
    let mut store = store();
    thread(&mut store, "t-1");

    let pending = store.pending_outbox("device-a", 10).unwrap();
    assert_eq!(pending.len(), 1);
    assert_eq!(pending[0].entity_type, "threads");
    assert_eq!(pending[0].entity_id, "t-1");
    assert_eq!(pending[0].operation, Operation::Create);
    assert_eq!(pending[0].device_seq, 1);
}

#[test]
fn records_are_encrypted_at_rest() {
    let mut store = store();
    thread(&mut store, "t-1");
    message(&mut store, "m-1", "secret transcript text");

    // The plaintext must not appear in the stored bytes.
    let rows = store
        .driver_mut()
        .query("SELECT body FROM messages WHERE id = ?", &[SqlValue::text("m-1")])
        .unwrap();
    let blob = rows[0][0].as_blob().unwrap();
    assert!(
        !blob
            .windows(b"secret transcript".len())
            .any(|window| window == b"secret transcript"),
        "plaintext was stored"
    );

    assert_eq!(
        store.read_record("messages", "m-1").unwrap(),
        b"secret transcript text"
    );
}

#[test]
fn the_outbox_holds_no_plaintext() {
    let mut store = store();
    thread(&mut store, "t-1");
    message(&mut store, "m-1", "secret transcript text");

    let pending = store.pending_outbox("device-a", 10).unwrap();
    let entry = pending
        .iter()
        .find(|entry| entry.entity_type == "messages")
        .unwrap();
    assert!(!entry.payload_json.contains("secret transcript"));
    assert!(entry.payload_json.contains("entityId"));
}

#[test]
fn a_failed_write_leaves_no_outbox_entry() {
    let mut store = store();
    thread(&mut store, "t-1");
    let before = store.pending_outbox("device-a", 100).unwrap().len();

    // `messages.thread_id` is NOT NULL, so this insert fails inside the
    // transaction. The outbox row must not survive without its entity.
    let result = store.write_record(
        "messages",
        "m-bad",
        "ws-1",
        Operation::Create,
        &[("role", SqlValue::text("user"))],
        b"orphan",
        None,
        "device-a",
        100,
    );
    assert!(result.is_err());

    let after = store.pending_outbox("device-a", 100).unwrap().len();
    assert_eq!(after, before, "a failed write left an outbox entry behind");
}

#[test]
fn school_tables_cannot_be_written() {
    let mut store = store();
    for table in ["students", "marks", "parents", "attendance", "sessions"] {
        let result = store.write_record(
            table,
            "x",
            "ws-1",
            Operation::Create,
            &[],
            b"{}",
            None,
            "device-a",
            100,
        );
        assert!(
            matches!(result, Err(StoreError::DataClassRejected)),
            "{table} was accepted"
        );
    }
}

#[test]
fn device_sequence_is_monotonic() {
    let mut store = store();
    thread(&mut store, "t-1");
    message(&mut store, "m-1", "one");
    message(&mut store, "m-2", "two");

    let pending = store.pending_outbox("device-a", 10).unwrap();
    let sequences: Vec<u64> = pending.iter().map(|entry| entry.device_seq).collect();
    assert_eq!(sequences, vec![1, 2, 3]);
}

#[test]
fn also_records_sync_events_for_other_devices() {
    let mut store = store();
    thread(&mut store, "t-1");

    // A second device has its own sequence space rather than colliding.
    message(&mut store, "m-1", "hello");
    let other = store.next_device_seq("device-b").unwrap();
    assert_eq!(other, 1);
}

#[test]
fn acknowledge_clears_the_outbox_and_advances_the_cursor() {
    let mut store = store();
    thread(&mut store, "t-1");
    message(&mut store, "m-1", "one");
    message(&mut store, "m-2", "two");

    store.acknowledge("device-a", "ws-1", "default", 2).unwrap();

    let pending = store.pending_outbox("device-a", 10).unwrap();
    assert_eq!(pending.len(), 1, "only the unacknowledged row should remain");
    assert_eq!(pending[0].device_seq, 3);
    assert_eq!(store.cursor("device-a", "ws-1", "default").unwrap(), 2);
}

#[test]
fn acknowledging_twice_is_idempotent() {
    let mut store = store();
    thread(&mut store, "t-1");
    store.acknowledge("device-a", "ws-1", "default", 1).unwrap();
    store.acknowledge("device-a", "ws-1", "default", 1).unwrap();

    assert_eq!(store.cursor("device-a", "ws-1", "default").unwrap(), 1);
    assert!(store.pending_outbox("device-a", 10).unwrap().is_empty());
}

#[test]
fn search_index_finds_and_rebuilds() {
    let mut store = store();
    thread(&mut store, "t-1");
    message(&mut store, "m-1", "marks for AY4 are in");

    let found = store.search("AY4", 10).unwrap();
    assert_eq!(found, vec!["m-1"]);

    // Wipe the derived index; it must rebuild from the sealed records.
    store.driver_mut().execute("DELETE FROM messages_fts", &[]).unwrap();
    assert!(store.search("AY4", 10).unwrap().is_empty());

    let rebuilt = store.rebuild_search_index().unwrap();
    assert_eq!(rebuilt, 1);
    assert_eq!(store.search("AY4", 10).unwrap(), vec!["m-1"]);
}

#[test]
fn outbox_ciphertext_matches_the_stored_envelope() {
    let mut store = store();
    thread(&mut store, "t-1");
    let entry = store
        .write_record(
            "messages",
            "m-1",
            "ws-1",
            Operation::Create,
            &[
                ("thread_id", SqlValue::text("t-1")),
                ("role", SqlValue::text("user")),
                ("device_seq", SqlValue::integer(1)),
            ],
            b"body",
            None,
            "device-a",
            100,
        )
        .unwrap();

    let ciphertext = store.outbox_ciphertext(&entry).unwrap();
    // Version byte, 24-byte nonce, then ciphertext+tag.
    assert_eq!(ciphertext[0], 1);
    assert!(ciphertext.len() > 25);
    assert_ne!(&ciphertext[25..], b"body");
}
