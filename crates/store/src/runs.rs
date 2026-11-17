//! Durable run journal: the rows a worker reads to decide what to resume.
//!
//! Two bodies are sealed here — the run's checkpoint and each event — because
//! both carry the conversation. Only scheduling metadata (`status`, `attempt`,
//! `lease_until`) is readable, and it has to be: a worker must find resumable
//! work without holding the key to open it.
//!
//! Events are **local only**. Unlike `messages`, nothing here enters
//! `sync_outbox`: an event is resume state for this device's worker, and
//! shipping it to the cloud would move one machine's in-flight turn for no
//! benefit. `runs` itself is syncable and is written through [`Store::write_record`]
//! when a run settles.

use crate::crypto;
use crate::{now, Result, SqlDriver, SqlValue, Store, StoreError};

/// Statuses a worker must pick up. Anything else is settled or abandoned.
const OPEN_STATUSES: [&str; 3] = ["queued", "running", "waiting_approval"];

#[derive(Debug, Clone, PartialEq)]
pub struct RunRecord {
    pub id: String,
    pub thread_id: String,
    pub status: String,
    pub attempt: i64,
    pub lease_until: i64,
}

/// A run that can be resumed, with everything it needs opened.
#[derive(Debug, Clone, PartialEq)]
pub struct ResumePoint {
    pub run: RunRecord,
    /// The messages array as the runtime last wrote it. Empty when a run died
    /// before its first tool round — which is a legitimate state, not an error.
    pub checkpoint: Vec<u8>,
    /// The person's message, verbatim: what a run with no checkpoint replays.
    pub input: Vec<u8>,
    /// `{ model, workspaceId, mobileSafeTools }`. Without it a worker has a
    /// transcript and no model to send it to.
    pub settings: Vec<u8>,
}

impl<D: SqlDriver> Store<D> {
    /// Records a run as started. Idempotent: a retried start keeps the first
    /// row rather than failing, because the caller may have died between the
    /// write and its own acknowledgement.
    #[allow(clippy::too_many_arguments)]
    pub fn begin_run(
        &mut self,
        run_id: &str,
        thread_id: &str,
        workspace_id: &str,
        input: &[u8],
        settings: &[u8],
        created_at: i64,
    ) -> Result<()> {
        // Each column is sealed under its own entity id, so a row edited by hand
        // cannot move settings into the checkpoint or the input into either.
        let checkpoint = crypto::seal(&self.master, "runs", run_id, crypto::random_nonce(), b"[]")?;
        let input = crypto::seal(
            &self.master,
            "runs",
            &format!("{run_id}:input"),
            crypto::random_nonce(),
            input,
        )?;
        let settings = crypto::seal(
            &self.master,
            "runs",
            &format!("{run_id}:settings"),
            crypto::random_nonce(),
            settings,
        )?;
        self.driver.execute(
            "INSERT INTO runs \
             (id, thread_id, workspace_id, status, body, input, settings, data_class, created_at, updated_at, attempt, lease_until) \
             VALUES (?, ?, ?, 'running', ?, ?, ?, 'workspace', ?, ?, 0, 0) \
             ON CONFLICT(id) DO NOTHING",
            &[
                SqlValue::text(run_id),
                SqlValue::text(thread_id),
                SqlValue::text(workspace_id),
                SqlValue::Blob(checkpoint),
                SqlValue::Blob(input),
                SqlValue::Blob(settings),
                SqlValue::integer(created_at),
                SqlValue::integer(created_at),
            ],
        )?;
        Ok(())
    }

    /// Replaces the checkpoint. Called at a tool-round boundary, never per token.
    pub fn checkpoint_run(&mut self, run_id: &str, messages: &[u8], at: i64) -> Result<()> {
        let body = crypto::seal(
            &self.master,
            "runs",
            run_id,
            crypto::random_nonce(),
            messages,
        )?;
        let changed = self.driver.execute(
            "UPDATE runs SET body = ?, updated_at = ? WHERE id = ?",
            &[
                SqlValue::Blob(body),
                SqlValue::integer(at),
                SqlValue::text(run_id),
            ],
        )?;
        if changed == 0 {
            return Err(StoreError::DataClassRejected);
        }
        Ok(())
    }

    /// Appends a batch of events, allocating sequence numbers in one transaction.
    ///
    /// One transaction per flush, not per event: a turn that wrote per token
    /// would turn into thousands of fsyncs.
    pub fn append_run_events(
        &mut self,
        run_id: &str,
        events: &[(&str, &[u8])],
        at: i64,
    ) -> Result<usize> {
        if events.is_empty() {
            return Ok(0);
        }
        let mut seq = self.next_run_seq(run_id)?;

        self.driver.begin()?;
        let result = (|| -> Result<()> {
            for (kind, payload) in events {
                let entity_id = format!("{run_id}:{seq}");
                let body = crypto::seal(
                    &self.master,
                    "run_events",
                    &entity_id,
                    crypto::random_nonce(),
                    payload,
                )?;
                self.driver.execute(
                    "INSERT INTO run_events (run_id, seq, kind, body, data_class, created_at) \
                     VALUES (?, ?, ?, ?, 'workspace', ?)",
                    &[
                        SqlValue::text(run_id),
                        SqlValue::integer(seq),
                        SqlValue::text(*kind),
                        SqlValue::Blob(body),
                        SqlValue::integer(at),
                    ],
                )?;
                seq += 1;
            }
            Ok(())
        })();
        match result {
            Ok(()) => {
                self.driver.commit()?;
                Ok(events.len())
            }
            Err(error) => {
                let _ = self.driver.rollback();
                Err(error)
            }
        }
    }

    fn next_run_seq(&mut self, run_id: &str) -> Result<i64> {
        let rows = self.driver.query(
            "SELECT COALESCE(MAX(seq), 0) FROM run_events WHERE run_id = ?",
            &[SqlValue::text(run_id)],
        )?;
        Ok(rows
            .first()
            .and_then(|row| row.first())
            .and_then(SqlValue::as_integer)
            .unwrap_or(0)
            + 1)
    }

    /// Every event for a run, in order, with its body opened.
    pub fn run_events(&mut self, run_id: &str) -> Result<Vec<(i64, String, Vec<u8>)>> {
        let rows = self.driver.query(
            "SELECT seq, kind, body FROM run_events WHERE run_id = ? ORDER BY seq ASC",
            &[SqlValue::text(run_id)],
        )?;
        let mut events = Vec::with_capacity(rows.len());
        for row in &rows {
            let seq = row.first().and_then(SqlValue::as_integer).unwrap_or(0);
            let kind = row
                .get(1)
                .and_then(SqlValue::as_text)
                .unwrap_or_default()
                .to_string();
            let envelope = row
                .get(2)
                .and_then(SqlValue::as_blob)
                .ok_or(StoreError::Decrypt)?;
            let payload = crypto::open(
                &self.master,
                "run_events",
                &format!("{run_id}:{seq}"),
                envelope,
            )?;
            events.push((seq, kind, payload));
        }
        Ok(events)
    }

    /// Runs a worker should pick up, oldest first.
    pub fn open_runs(&mut self, limit: usize) -> Result<Vec<RunRecord>> {
        let placeholders = OPEN_STATUSES
            .iter()
            .map(|_| "?")
            .collect::<Vec<_>>()
            .join(", ");
        let mut params: Vec<SqlValue> = OPEN_STATUSES
            .iter()
            .map(|status| SqlValue::text(*status))
            .collect();
        params.push(SqlValue::integer(limit as i64));

        let rows = self.driver.query(
            &format!(
                "SELECT id, thread_id, status, attempt, lease_until FROM runs \
                 WHERE status IN ({placeholders}) ORDER BY created_at ASC LIMIT ?"
            ),
            &params,
        )?;
        Ok(rows
            .iter()
            .map(|row| RunRecord {
                id: text_at(row, 0),
                thread_id: text_at(row, 1),
                status: text_at(row, 2),
                attempt: row.get(3).and_then(SqlValue::as_integer).unwrap_or(0),
                lease_until: row.get(4).and_then(SqlValue::as_integer).unwrap_or(0),
            })
            .collect())
    }

    /// Takes the lease on a run if nobody else holds a live one.
    ///
    /// Returns `false` when another worker claimed it first — the caller must
    /// then do nothing, not retry harder.
    pub fn claim_run(&mut self, run_id: &str, at: i64, lease_until: i64) -> Result<bool> {
        let changed = self.driver.execute(
            "UPDATE runs SET lease_until = ?, updated_at = ? \
             WHERE id = ? AND lease_until <= ?",
            &[
                SqlValue::integer(lease_until),
                SqlValue::integer(at),
                SqlValue::text(run_id),
                SqlValue::integer(at),
            ],
        )?;
        Ok(changed == 1)
    }

    /// Writes the terminal status and clears the lease.
    pub fn settle_run(
        &mut self,
        run_id: &str,
        status: &str,
        error: Option<&str>,
        at: i64,
    ) -> Result<()> {
        self.driver.execute(
            "UPDATE runs SET status = ?, error = ?, lease_until = 0, updated_at = ? WHERE id = ?",
            &[
                SqlValue::text(status),
                error.map(SqlValue::text).unwrap_or(SqlValue::Null),
                SqlValue::integer(at),
                SqlValue::text(run_id),
            ],
        )?;
        Ok(())
    }

    /// Counts an attempt. The caller stops resuming once this reaches its cap.
    pub fn bump_run_attempt(&mut self, run_id: &str) -> Result<i64> {
        self.driver.execute(
            "UPDATE runs SET attempt = attempt + 1 WHERE id = ?",
            &[SqlValue::text(run_id)],
        )?;
        let rows = self.driver.query(
            "SELECT attempt FROM runs WHERE id = ?",
            &[SqlValue::text(run_id)],
        )?;
        Ok(rows
            .first()
            .and_then(|row| row.first())
            .and_then(SqlValue::as_integer)
            .unwrap_or(0))
    }

    /// The checkpoint for a run, opened, or `None` when it has no row.
    pub fn resume_point(&mut self, run_id: &str) -> Result<Option<ResumePoint>> {
        let rows = self.driver.query(
            "SELECT id, thread_id, status, attempt, lease_until, body, input, settings \
             FROM runs WHERE id = ?",
            &[SqlValue::text(run_id)],
        )?;
        let Some(row) = rows.first() else {
            return Ok(None);
        };
        // A row written by the sync path has no local state; it is not resumable.
        let (Some(checkpoint), Some(input), Some(settings)) = (
            row.get(5).and_then(SqlValue::as_blob),
            row.get(6).and_then(SqlValue::as_blob),
            row.get(7).and_then(SqlValue::as_blob),
        ) else {
            return Ok(None);
        };
        let checkpoint = crypto::open(&self.master, "runs", run_id, checkpoint)?;
        let input = crypto::open(&self.master, "runs", &format!("{run_id}:input"), input)?;
        let settings = crypto::open(&self.master, "runs", &format!("{run_id}:settings"), settings)?;
        Ok(Some(ResumePoint {
            run: RunRecord {
                id: text_at(row, 0),
                thread_id: text_at(row, 1),
                status: text_at(row, 2),
                attempt: row.get(3).and_then(SqlValue::as_integer).unwrap_or(0),
                lease_until: row.get(4).and_then(SqlValue::as_integer).unwrap_or(0),
            },
            checkpoint,
            input,
            settings,
        }))
    }

    /// Timestamps for the caller when it has no clock of its own.
    pub fn now(&self) -> i64 {
        now()
    }
}

fn text_at(row: &[SqlValue], index: usize) -> String {
    row.get(index)
        .and_then(SqlValue::as_text)
        .unwrap_or_default()
        .to_string()
}
