use std::time::{SystemTime, UNIX_EPOCH};

use edapex_agent::{DurableAgentStores, StoreContext};
use edapex_store::{MasterKey, RusqliteDriver, SqlDriver, Store};
use infinity_agent_core::message::InfinityMessage;
use infinity_agent_core::system::UserChoice;
use infinity_agent_core::traits::{ConversationStore, SpawnContext, StateStore};
use infinity_provider_protocol::{Text, UserContent};
use rap_protocol::{ChoiceId, ThreadId, ToolCallId};

const WORKSPACE: &str = "workspace-1";

fn path(name: &str) -> String {
    let unique = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .expect("clock")
        .as_nanos();
    std::env::temp_dir()
        .join(format!(
            "edapex-durable-{name}-{}-{unique}.sqlite",
            std::process::id()
        ))
        .to_string_lossy()
        .into_owned()
}

fn stores(path: &str) -> DurableAgentStores {
    let context = StoreContext::open(path, WORKSPACE, MasterKey::from_bytes([11u8; 32]))
        .expect("open native store");
    DurableAgentStores::from_context(context)
}

fn text(value: &str) -> InfinityMessage {
    InfinityMessage::User {
        content: UserContent::Text(Text {
            text: value.to_string(),
        }),
    }
}

fn cleanup(path: &str) {
    let _ = std::fs::remove_file(path);
    let _ = std::fs::remove_file(format!("{path}-wal"));
    let _ = std::fs::remove_file(format!("{path}-shm"));
}

#[tokio::test]
async fn all_thread_and_execution_state_survives_a_fresh_open() {
    let path = path("resume");
    let root = ThreadId::from("root-session");
    let spawn_id = ToolCallId::from("spawn-1");

    let child = {
        let stores = stores(&path);
        stores.conversation.ensure_root_thread(&root).await.unwrap();
        stores
            .conversation
            .append_messages(&root, vec![(text("turn A"), "dedup-A".to_string())])
            .await
            .unwrap();
        stores
            .conversation
            .save_compaction_summary(&root, "older context summary", 0)
            .await
            .unwrap();
        let child = stores
            .conversation
            .spawn_thread(&root, &spawn_id, true, SpawnContext::Fresh)
            .await
            .unwrap();
        stores
            .conversation
            .append_messages(
                &child,
                vec![(text("child work"), "dedup-child".to_string())],
            )
            .await
            .unwrap();
        stores
            .state
            .add_processed_message_ids(&root, vec!["dedup-A".to_string()])
            .await
            .unwrap();
        stores
            .state
            .set_metadata(&root, serde_json::json!({"model":"test/model"}))
            .await
            .unwrap();
        stores
            .state
            .add_active_subscription(&root, &spawn_id)
            .await
            .unwrap();
        stores
            .state
            .add_pending_user_choice(
                &root,
                UserChoice {
                    id: ChoiceId::from("choice-1"),
                    prompt: "Continue?".to_string(),
                    choices: vec!["Yes".to_string(), "No".to_string()],
                    default: 0,
                    response_url: "https://example.invalid/choice".to_string(),
                },
            )
            .await
            .unwrap();
        stores.state.set_thread_stopped(&root, true).unwrap();
        child
    };

    {
        let stores = stores(&path);
        let root_history = stores
            .conversation
            .load_history_up_to(&root, None, None)
            .await
            .unwrap();
        assert_eq!(root_history.len(), 1);
        assert_eq!(
            root_history[0].clone().into_messages()[0],
            infinity_provider_protocol::Message::user("turn A")
        );
        let child_history = stores
            .conversation
            .load_history_with_ancestors(&child)
            .await
            .unwrap();
        assert_eq!(child_history.0.len(), 1);
        assert!(stores
            .conversation
            .is_subscription_event_thread(&child)
            .await
            .unwrap());
        assert!(stores
            .conversation
            .is_fresh_context_thread(&child)
            .await
            .unwrap());
        assert_eq!(
            stores
                .conversation
                .get_ancestor_chain(&child)
                .await
                .unwrap(),
            vec![(root.clone(), 0)]
        );
        assert_eq!(
            stores
                .conversation
                .load_latest_compaction_summary_up_to(&root, None)
                .await
                .unwrap(),
            Some(("older context summary".to_string(), 0))
        );
        assert!(stores
            .state
            .get_processed_ids(&root)
            .await
            .unwrap()
            .contains("dedup-A"));
        assert_eq!(
            stores.state.get_metadata(&root).await.unwrap(),
            Some(serde_json::json!({"model":"test/model"}))
        );
        assert_eq!(
            stores.state.get_active_subscriptions(&root).await.unwrap(),
            vec![spawn_id]
        );
        assert_eq!(
            stores
                .state
                .get_pending_user_choices(&root)
                .await
                .unwrap()
                .len(),
            1
        );
        assert!(stores.state.is_thread_stopped(&root).await.unwrap());
    }

    cleanup(&path);
}

#[tokio::test]
async fn a_persistence_failure_poisons_later_calls() {
    let mut native = Store::new(
        RusqliteDriver::in_memory().expect("memory sqlite"),
        MasterKey::from_bytes([11u8; 32]),
    );
    native.migrate().unwrap();
    native
        .driver_mut()
        .execute_batch("DROP TABLE agent_thread_snapshots")
        .unwrap();
    let stores = DurableAgentStores::from_store(native, WORKSPACE);
    let root = ThreadId::from("root-session");
    assert!(stores.state.set_thread_stopped(&root, true).is_err());
    assert!(stores.state.is_thread_stopped(&root).await.is_err());
}
