//! What a WorkManager worker runs with no Activity attached.
//!
//! The rules are the journal's, not the UI's: claim a lease, respect the attempt
//! cap, rebuild the request from what was sealed, finish or fail. At-least-once,
//! checkpointed at tool-round boundaries, and a run that has already failed
//! twice is not offered again.

use std::sync::Arc;

use edapex_agent::{
    AgentConnectSettings, AgentHost, AgentHostOptions, ApprovalHandler, ChatMessage, TurnRecorder,
};

use super::history;
use super::journal::RunJournal;
use super::provider::ModelRouterProvider;
use super::session::ChannelSink;
use super::tools::HostTools;
use super::HostEnv;
use crate::state::{CaptureStore, HostError};

/// Two attempts is the plan's number: a third failure is a person's problem.
const MAX_ATTEMPTS: i64 = 2;
/// Long enough for one turn's worth of work, short enough that a killed worker
/// does not park the run until the lease expires by accident.
const LEASE_SECONDS: i64 = 30;
const BATCH: usize = 4;

/// One run, decoded and ready to execute.
pub struct Resume {
    pub run_id: String,
    pub thread_id: String,
    pub settings: AgentConnectSettings,
    pub messages: Vec<ChatMessage>,
}

#[derive(serde::Deserialize)]
#[serde(rename_all = "camelCase")]
struct StoredSettings {
    model: String,
    workspace_id: String,
    #[serde(default)]
    mobile_safe_tools: bool,
}

/// Picks the runs this process should execute, and settles the ones it refuses.
pub fn plan(journal: &RunJournal, limit: usize) -> Result<Vec<Resume>, HostError> {
    let now = journal.now();
    let mut resumes = Vec::new();

    for run in journal.lock(|store| store.open_runs(limit))? {
        if run.attempt >= MAX_ATTEMPTS {
            journal.lock(|store| {
                store.settle_run(
                    &run.id,
                    "failed",
                    Some("Tried twice without finishing; open the app to try again."),
                    now,
                )
            })?;
            continue;
        }
        if !journal.lock(|store| store.claim_run(&run.id, now, now + LEASE_SECONDS))? {
            // Someone else holds a live lease. Doing nothing is the correct
            // response; retrying harder would run the turn twice.
            continue;
        }

        let Some(point) = journal.lock(|store| store.resume_point(&run.id))? else {
            journal.lock(|store| {
                store.settle_run(
                    &run.id,
                    "failed",
                    Some("This run has no local state to resume from."),
                    now,
                )
            })?;
            continue;
        };

        let stored: StoredSettings = serde_json::from_slice(&point.settings)
            .map_err(|error| corrupt(format!("Run settings: {error}")))?;
        let messages = if point.checkpoint == b"[]" {
            // Died before its first tool round: replay from the input, which is
            // where the person's message actually lives.
            edapex_agent::initial_history(String::from_utf8_lossy(&point.input).as_ref())
        } else {
            history::decode(&point.checkpoint).map_err(corrupt)?
        };

        journal.lock(|store| store.bump_run_attempt(&run.id))?;
        resumes.push(Resume {
            run_id: run.id,
            thread_id: run.thread_id,
            settings: AgentConnectSettings {
                workspace_id: stored.workspace_id,
                model: stored.model,
                mobile_safe_tools: stored.mobile_safe_tools,
            },
            messages,
        });
    }

    Ok(resumes)
}

/// Resumes everything this process may run. Returns how many turns finished.
pub async fn run_open_runs(
    env: &HostEnv,
    approvals: Arc<dyn ApprovalHandler>,
) -> Result<usize, HostError> {
    let session_token = crate::auth::session_token()?.ok_or_else(HostError::auth_required)?;
    let journal = Arc::new(RunJournal::open(env, "")?);
    let resumes = plan(&journal, BATCH)?;
    let mut finished = 0;

    for resume in resumes {
        let host = AgentHost::connect(AgentHostOptions {
            settings: resume.settings,
            provider: Arc::new(ModelRouterProvider::new(session_token.clone())),
            tools: Arc::new(HostTools {
                env: Arc::new(env.clone()),
                captures: Arc::new(CaptureStore::default()),
            }),
            approvals: approvals.clone(),
            // No WebView exists here. Events land in the journal through the
            // recorder, which is what a later `agent_attach` replays.
            events: Arc::new(ChannelSink::new(None)),
            recorder: Some(Arc::clone(&journal) as Arc<dyn TurnRecorder>),
        });
        let host = match host {
            Ok(host) => host,
            Err(error) => {
                settle(&journal, &resume.run_id, &error.message)?;
                continue;
            }
        };

        match host
            .resume_turn(&resume.thread_id, &resume.run_id, resume.messages)
            .await
        {
            Ok(_) => finished += 1,
            Err(error) => settle(&journal, &resume.run_id, &error.message)?,
        }
    }

    journal.flush();
    Ok(finished)
}

fn settle(journal: &RunJournal, run_id: &str, message: &str) -> Result<(), HostError> {
    let now = journal.now();
    journal.lock(|store| store.settle_run(run_id, "failed", Some(message), now))
}

fn corrupt(error: String) -> HostError {
    HostError::new("internal_error", format!("Run journal: {error}"), false)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn journal() -> RunJournal {
        RunJournal::in_memory("ws")
    }

    fn settings() -> Vec<u8> {
        br#"{"model":"test/model","workspaceId":"ws","mobileSafeTools":false}"#.to_vec()
    }

    #[test]
    fn a_checkpointed_run_is_planned_with_its_model_and_history() {
        let journal = journal();
        journal
            .lock(|store| store.begin_run("run-1", "thread-1", "ws", b"which marks?", &settings(), 1))
            .expect("begin");
        journal
            .lock(|store| {
                store.checkpoint_run(
                    "run-1",
                    br#"[{"role":"system","content":"you are EdApex"},{"role":"user","content":"which marks?"}]"#,
                    2,
                )
            })
            .expect("checkpoint");

        let planned = plan(&journal, 4).expect("plan");
        assert_eq!(planned.len(), 1);
        assert_eq!(planned[0].settings.model, "test/model");
        assert_eq!(planned[0].settings.workspace_id, "ws");
        assert_eq!(planned[0].messages.len(), 2);
        assert_eq!(planned[0].messages[1].content.as_deref(), Some("which marks?"));
        // Claiming counts the attempt: a run that kills its worker twice is not
        // offered a third time.
        let open = journal.lock(|store| store.open_runs(1)).expect("open");
        assert_eq!(open[0].attempt, 1);
    }

    #[test]
    fn a_run_that_never_reached_a_tool_round_replays_from_its_input() {
        let journal = journal();
        journal
            .lock(|store| store.begin_run("run-1", "thread-1", "ws", b"check JSS 2B", &settings(), 1))
            .expect("begin");

        let planned = plan(&journal, 4).expect("plan");
        assert_eq!(planned[0].messages.len(), 2);
        assert_eq!(planned[0].messages[1].content.as_deref(), Some("check JSS 2B"));
    }

    #[test]
    fn a_run_at_the_attempt_cap_is_failed_not_retried() {
        let journal = journal();
        journal
            .lock(|store| store.begin_run("run-1", "thread-1", "ws", b"x", &settings(), 1))
            .expect("begin");
        journal.lock(|store| store.bump_run_attempt("run-1")).expect("one");
        journal.lock(|store| store.bump_run_attempt("run-1")).expect("two");

        let planned = plan(&journal, 4).expect("plan");
        assert!(planned.is_empty(), "a third attempt was offered");
        let open = journal.lock(|store| store.open_runs(4)).expect("open");
        assert!(open.is_empty(), "the run was left open");
    }

    #[test]
    fn a_run_someone_else_holds_is_left_alone() {
        let journal = journal();
        journal
            .lock(|store| store.begin_run("run-1", "thread-1", "ws", b"x", &settings(), 1))
            .expect("begin");
        let now = journal.now();
        journal
            .lock(|store| store.claim_run("run-1", now, now + 3600))
            .expect("claim");

        assert!(plan(&journal, 4).expect("plan").is_empty());
        // It must still be open — skipped, not failed.
        assert_eq!(journal.lock(|store| store.open_runs(4)).expect("open").len(), 1);
    }
}
