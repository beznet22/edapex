use crate::{crypto, now, Result, SqlDriver, SqlValue, Store, StoreError};

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ThreadSnapshotKind {
    Conversation,
    State,
}

impl ThreadSnapshotKind {
    pub fn as_str(self) -> &'static str {
        match self {
            Self::Conversation => "conversation",
            Self::State => "state",
        }
    }
}

#[derive(Debug, Clone, PartialEq)]
pub struct ThreadSnapshot {
    pub revision: u64,
    pub payload: Vec<u8>,
}

impl<D: SqlDriver> Store<D> {
    pub fn write_thread_snapshot(
        &mut self,
        workspace_id: &str,
        thread_id: &str,
        root_thread_id: &str,
        kind: ThreadSnapshotKind,
        payload: &[u8],
    ) -> Result<u64> {
        self.agent_transaction(|store| {
            let rows = store.driver.query(
                "SELECT revision FROM agent_thread_snapshots WHERE thread_id = ? AND kind = ?",
                &[SqlValue::text(thread_id), SqlValue::text(kind.as_str())],
            )?;
            let revision = rows
                .first()
                .and_then(|row| row.first())
                .and_then(SqlValue::as_integer)
                .unwrap_or(0)
                + 1;
            let envelope = crypto::seal(
                &store.master,
                "agent_thread_snapshots",
                &format!("{thread_id}:{}", kind.as_str()),
                crypto::random_nonce(),
                payload,
            )?;
            store.driver.execute(
                "INSERT INTO agent_thread_snapshots \
                 (thread_id, root_thread_id, workspace_id, kind, revision, body, updated_at) \
                 VALUES (?, ?, ?, ?, ?, ?, ?) \
                 ON CONFLICT (thread_id, kind) DO UPDATE SET \
                 revision = excluded.revision, body = excluded.body, updated_at = excluded.updated_at",
                &[
                    SqlValue::text(thread_id),
                    SqlValue::text(root_thread_id),
                    SqlValue::text(workspace_id),
                    SqlValue::text(kind.as_str()),
                    SqlValue::integer(revision),
                    SqlValue::Blob(envelope),
                    SqlValue::integer(now()),
                ],
            )?;
            u64::try_from(revision).map_err(|error| StoreError::Serialisation(error.to_string()))
        })
    }

    pub fn read_thread_snapshot(
        &mut self,
        thread_id: &str,
        kind: ThreadSnapshotKind,
    ) -> Result<Option<ThreadSnapshot>> {
        let rows = self.driver.query(
            "SELECT revision, body FROM agent_thread_snapshots WHERE thread_id = ? AND kind = ?",
            &[SqlValue::text(thread_id), SqlValue::text(kind.as_str())],
        )?;
        let Some(row) = rows.first() else {
            return Ok(None);
        };
        let revision = row.first().and_then(SqlValue::as_integer).unwrap_or(0);
        let envelope = row
            .get(1)
            .and_then(SqlValue::as_blob)
            .ok_or(StoreError::Decrypt)?;
        let payload = crypto::open(
            &self.master,
            "agent_thread_snapshots",
            &format!("{thread_id}:{}", kind.as_str()),
            envelope,
        )?;
        Ok(Some(ThreadSnapshot {
            revision: u64::try_from(revision)
                .map_err(|error| StoreError::Serialisation(error.to_string()))?,
            payload,
        }))
    }

    pub fn delete_thread_snapshots(&mut self, thread_id: &str) -> Result<()> {
        self.driver.execute(
            "DELETE FROM agent_thread_snapshots WHERE thread_id = ?",
            &[SqlValue::text(thread_id)],
        )?;
        Ok(())
    }
}
