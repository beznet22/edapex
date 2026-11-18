//! The desktop host's durable seam.
//!
//! A Tauri window cannot exist in this runner, so the properties that actually
//! keep a turn alive are tested directly: one canonical database path shared by
//! the window and a headless worker, state that survives a fresh handle, and a
//! key that is genuinely required to read it.

use std::path::PathBuf;
use std::time::{SystemTime, UNIX_EPOCH};

use edapex_agent::StoreContext;
use edapex_store::thread_snapshots::ThreadSnapshotKind;
use edapex_store::MasterKey;

const WORKSPACE: &str = "workspace-1";
const SESSION: &str = "session-root-1";

fn scratch(name: &str) -> PathBuf {
    let unique = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .expect("clock")
        .as_nanos();
    std::env::temp_dir().join(format!(
        "edapex-desktop-{name}-{}-{unique}",
        std::process::id()
    ))
}

fn cleanup(path: &PathBuf) {
    let _ = std::fs::remove_file(path);
    let _ = std::fs::remove_file(format!("{}-wal", path.display()));
    let _ = std::fs::remove_file(format!("{}-shm", path.display()));
}

#[test]
fn the_window_and_a_headless_worker_open_one_database() {
    let data = scratch("data");
    let window = edapex_desktop_lib::agent::HostEnv::new(
        data.join("cache"),
        data.clone(),
        data.join("resources"),
    );
    let worker = edapex_desktop_lib::agent::HostEnv::new(
        data.join("worker-cache"),
        data.clone(),
        data.join("worker-resources"),
    );

    assert_eq!(window.agent_db(), worker.agent_db());
    assert_eq!(window.agent_db(), data.join("agent.db"));
}

#[test]
fn a_session_snapshot_reopens_under_a_fresh_handle_and_needs_its_key() {
    let data = scratch("store");
    let database = data.join("agent.db");
    let path = database.to_string_lossy().into_owned();
    let key = MasterKey::from_bytes([41u8; 32]);

    {
        let context = StoreContext::open(&path, WORKSPACE, key.clone()).expect("open");
        context
            .lock()
            .expect("store")
            .write_thread_snapshot(
                WORKSPACE,
                SESSION,
                SESSION,
                ThreadSnapshotKind::Conversation,
                b"turn A context",
            )
            .expect("write");
    }

    {
        let reopened = StoreContext::open(&path, WORKSPACE, key).expect("reopen");
        let snapshot = reopened
            .lock()
            .expect("store")
            .read_thread_snapshot(SESSION, ThreadSnapshotKind::Conversation)
            .expect("read")
            .expect("present");
        assert_eq!(snapshot.payload, b"turn A context");
    }

    {
        let wrong = StoreContext::open(&path, WORKSPACE, MasterKey::from_bytes([42u8; 32]))
            .expect("open with another key");
        assert!(
            wrong
                .lock()
                .expect("store")
                .read_thread_snapshot(SESSION, ThreadSnapshotKind::Conversation)
                .is_err(),
            "a different key must not read the session"
        );
    }

    cleanup(&database);
}
