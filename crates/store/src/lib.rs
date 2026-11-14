//! Local agent store.
//!
//! Plain SQLite with WAL, per-record XChaCha20-Poly1305, an append-only journal
//! and a sync outbox. One logical model for every host: the difference between
//! desktop, mobile and the browser is only which [`SqlDriver`] is bound.
//!
//! The invariant this crate exists to hold is: **a local write and the change
//! that carries it to the cloud are committed together, or not at all.** A write
//! that committed without its outbox row would be invisible to sync forever, and
//! no later reconciliation could find it.

pub mod crypto;
pub mod error;
pub mod journal;
pub mod migrations;

pub use error::{Result, StoreError};
pub use journal::{Journal, JournalRecord, PersistVectorMode};

pub use crypto::MasterKey;
use migrations::{MIGRATIONS, LATEST_VERSION};

/// A bindable SQL value. Deliberately not `rusqlite::types::Value`, so the crate
/// does not leak its native driver into the browser build.
#[derive(Debug, Clone, PartialEq)]
pub enum SqlValue {
    Null,
    Integer(i64),
    Text(String),
    Blob(Vec<u8>),
}

impl SqlValue {
    pub fn text(value: impl Into<String>) -> Self {
        SqlValue::Text(value.into())
    }

    pub fn integer(value: i64) -> Self {
        SqlValue::Integer(value)
    }

    pub fn as_text(&self) -> Option<&str> {
        match self {
            SqlValue::Text(value) => Some(value),
            _ => None,
        }
    }

    pub fn as_integer(&self) -> Option<i64> {
        match self {
            SqlValue::Integer(value) => Some(*value),
            _ => None,
        }
    }

    pub fn as_blob(&self) -> Option<&[u8]> {
        match self {
            SqlValue::Blob(value) => Some(value),
            _ => None,
        }
    }
}

/// The storage backend. Implemented by `rusqlite` natively and by a JS-backed
/// driver in the browser (OPFS SQLite WASM, IndexedDB fallback).
pub trait SqlDriver {
    fn execute_batch(&mut self, sql: &str) -> Result<()>;
    fn execute(&mut self, sql: &str, params: &[SqlValue]) -> Result<usize>;
    fn query(&mut self, sql: &str, params: &[SqlValue]) -> Result<Vec<Vec<SqlValue>>>;
    fn begin(&mut self) -> Result<()>;
    fn commit(&mut self) -> Result<()>;
    fn rollback(&mut self) -> Result<()>;
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Operation {
    Create,
    Update,
    Delete,
    Tombstone,
}

impl Operation {
    pub fn as_str(self) -> &'static str {
        match self {
            Operation::Create => "create",
            Operation::Update => "update",
            Operation::Delete => "delete",
            Operation::Tombstone => "tombstone",
        }
    }
}

/// One pending change, as handed to the sync worker.
#[derive(Debug, Clone, PartialEq)]
pub struct OutboxEntry {
    pub id: String,
    pub workspace_id: String,
    pub entity_type: String,
    pub entity_id: String,
    pub operation: Operation,
    pub payload_json: String,
    pub device_id: String,
    pub device_seq: u64,
    pub created_at: i64,
}

/// One event as it goes over the wire.
///
/// Serialised camelCase because this is exactly the JSON body the sync service
/// accepts; there is no second translation layer to drift out of step.
#[derive(Debug, Clone, PartialEq, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PushItem {
    pub id: String,
    pub entity_type: String,
    pub entity_id: String,
    pub operation: String,
    /// Base64 of the sealed envelope.
    pub ciphertext: String,
    /// Lowercase hex SHA-256 of the raw envelope bytes.
    pub checksum: String,
    pub device_seq: u64,
    pub created_at: i64,
}

/// Tables whose sealed body can be read for a push. A whitelist rather than a
/// caller-supplied name, because the table name reaches SQL directly.
const BODY_TABLES: &[&str] = &[
    "threads",
    "messages",
    "message_parts",
    "runs",
    "tool_calls",
    "approval_requests",
    "approval_rules",
    "tasks",
    "artifacts",
    "artifact_versions",
    "memory_facts",
];

pub struct Store<D: SqlDriver> {
    driver: D,
    master: MasterKey,
}

impl<D: SqlDriver> Store<D> {
    pub fn new(driver: D, master: MasterKey) -> Self {
        Store { driver, master }
    }

    pub fn driver(&self) -> &D {
        &self.driver
    }

    pub fn driver_mut(&mut self) -> &mut D {
        &mut self.driver
    }

    /// Applies any migrations the store has not seen. Idempotent.
    pub fn migrate(&mut self) -> Result<()> {
        self.driver
            .execute_batch("CREATE TABLE IF NOT EXISTS schema_migrations (version INTEGER PRIMARY KEY, name TEXT NOT NULL, applied_at INTEGER NOT NULL);")?;

        let applied = self.applied_versions()?;
        for migration in MIGRATIONS {
            if applied.contains(&migration.version) {
                continue;
            }
            self.driver.begin()?;
            match self.driver.execute_batch(migration.sql) {
                Ok(()) => {
                    self.driver.execute(
                        "INSERT INTO schema_migrations (version, name, applied_at) VALUES (?, ?, ?)",
                        &[
                            SqlValue::integer(i64::from(migration.version)),
                            SqlValue::text(migration.name),
                            SqlValue::integer(now()),
                        ],
                    )?;
                    self.driver.commit()?;
                }
                Err(error) => {
                    let _ = self.driver.rollback();
                    return Err(error);
                }
            }
        }
        Ok(())
    }

    fn applied_versions(&mut self) -> Result<Vec<u32>> {
        let rows = self
            .driver
            .query("SELECT version FROM schema_migrations ORDER BY version", &[])?;
        Ok(rows
            .iter()
            .filter_map(|row| row.first().and_then(SqlValue::as_integer))
            .map(|value| value as u32)
            .collect())
    }

    pub fn version(&mut self) -> Result<u32> {
        Ok(self.applied_versions()?.into_iter().last().unwrap_or(0))
    }

    pub fn latest_supported_version(&self) -> u32 {
        LATEST_VERSION
    }

    /// Monotonic per-device sequence. Reading it from the outbox rather than a
    /// counter column means it cannot drift from the rows that were actually
    /// written, including after a crash.
    pub fn next_device_seq(&mut self, device_id: &str) -> Result<u64> {
        let rows = self.driver.query(
            "SELECT COALESCE(MAX(device_seq), 0) FROM sync_outbox WHERE device_id = ?",
            &[SqlValue::text(device_id)],
        )?;
        let current = rows
            .first()
            .and_then(|row| row.first())
            .and_then(SqlValue::as_integer)
            .unwrap_or(0);
        Ok(current as u64 + 1)
    }

    /// Writes a sealed record and its outbox entry in one transaction.
    ///
    /// `extra` supplies the columns that differ per table (`thread_id`, `role`,
    /// `status`, …). The common columns are fixed so every table is written the
    /// same way and the outbox cannot be forgotten.
    ///
    /// `search_text` is the plaintext used to maintain the derived FTS index. It
    /// is written unencrypted on purpose: the index is rebuilt from the sealed
    /// records whenever it is in doubt, and it is never synced.
    #[allow(clippy::too_many_arguments)]
    pub fn write_record(
        &mut self,
        entity_type: &str,
        entity_id: &str,
        workspace_id: &str,
        operation: Operation,
        extra: &[(&str, SqlValue)],
        plaintext: &[u8],
        search_text: Option<&str>,
        device_id: &str,
        created_at: i64,
    ) -> Result<OutboxEntry> {
        if !BODY_TABLES.contains(&entity_type) {
            return Err(StoreError::DataClassRejected);
        }

        let seq = self.next_device_seq(device_id)?;
        let envelope = crypto::seal(
            &self.master,
            entity_type,
            entity_id,
            crypto::random_nonce(),
            plaintext,
        )?;

        // Metadata only. The body travels as ciphertext; nothing readable about
        // the record is stored in the outbox.
        let payload_json = serde_json::json!({
            "entityType": entity_type,
            "entityId": entity_id,
            "operation": operation.as_str(),
        })
        .to_string();

        let mut columns = String::from("id, workspace_id, body, data_class, created_at");
        let mut placeholders = String::from("?, ?, ?, 'workspace', ?");
        let mut params = vec![
            SqlValue::text(entity_id),
            SqlValue::text(workspace_id),
            SqlValue::Blob(envelope),
            SqlValue::integer(created_at),
        ];
        for (name, value) in extra {
            columns.push_str(", ");
            columns.push_str(name);
            placeholders.push_str(", ?");
            params.push(value.clone());
        }

        let entity_sql = format!(
            "INSERT OR REPLACE INTO {entity_type} ({columns}) VALUES ({placeholders})"
        );

        self.driver.begin()?;
        let result = (|| -> Result<()> {
            self.driver.execute(&entity_sql, &params)?;

            if let Some(text) = search_text {
                self.driver.execute(
                    "INSERT INTO messages_fts (message_id, body) VALUES (?, ?)",
                    &[SqlValue::text(entity_id), SqlValue::text(text)],
                )?;
            }

            self.driver.execute(
                "INSERT INTO sync_outbox \
                 (id, workspace_id, entity_type, entity_id, operation, payload_json, device_id, device_seq, created_at) \
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
                &[
                    SqlValue::text(format!("{device_id}:{seq}")),
                    SqlValue::text(workspace_id),
                    SqlValue::text(entity_type),
                    SqlValue::text(entity_id),
                    SqlValue::text(operation.as_str()),
                    SqlValue::text(payload_json.clone()),
                    SqlValue::text(device_id),
                    SqlValue::integer(seq as i64),
                    SqlValue::integer(created_at),
                ],
            )?;
            Ok(())
        })();

        match result {
            Ok(()) => {
                self.driver.commit()?;
                Ok(OutboxEntry {
                    id: format!("{device_id}:{seq}"),
                    workspace_id: workspace_id.to_string(),
                    entity_type: entity_type.to_string(),
                    entity_id: entity_id.to_string(),
                    operation,
                    payload_json,
                    device_id: device_id.to_string(),
                    device_seq: seq,
                    created_at,
                })
            }
            Err(error) => {
                // Rollback failure is intentionally ignored: reporting the
                // original error is more useful than a secondary one.
                let _ = self.driver.rollback();
                Err(error)
            }
        }
    }

    /// Reads a sealed record back. Used by the push path and by tests.
    pub fn read_record(&mut self, entity_type: &str, entity_id: &str) -> Result<Vec<u8>> {
        if !BODY_TABLES.contains(&entity_type) {
            return Err(StoreError::DataClassRejected);
        }
        let rows = self.driver.query(
            &format!("SELECT body FROM {entity_type} WHERE id = ?"),
            &[SqlValue::text(entity_id)],
        )?;
        let envelope = rows
            .first()
            .and_then(|row| row.first())
            .and_then(SqlValue::as_blob)
            .ok_or(StoreError::Decrypt)?;
        crypto::open(&self.master, entity_type, entity_id, envelope)
    }

    pub fn pending_outbox(&mut self, device_id: &str, limit: usize) -> Result<Vec<OutboxEntry>> {
        let rows = self.driver.query(
            "SELECT id, workspace_id, entity_type, entity_id, operation, payload_json, device_seq, created_at \
             FROM sync_outbox WHERE device_id = ? ORDER BY device_seq ASC LIMIT ?",
            &[SqlValue::text(device_id), SqlValue::integer(limit as i64)],
        )?;

        Ok(rows
            .iter()
            .map(|row| OutboxEntry {
                id: text_at(row, 0),
                workspace_id: text_at(row, 1),
                entity_type: text_at(row, 2),
                entity_id: text_at(row, 3),
                operation: parse_operation(&text_at(row, 4)),
                payload_json: text_at(row, 5),
                device_id: device_id.to_string(),
                device_seq: row.get(6).and_then(SqlValue::as_integer).unwrap_or(0) as u64,
                created_at: row.get(7).and_then(SqlValue::as_integer).unwrap_or(0),
            })
            .collect())
    }

    /// The sealed body as it will travel to the cloud.
    pub fn outbox_ciphertext(&mut self, entry: &OutboxEntry) -> Result<Vec<u8>> {
        if !BODY_TABLES.contains(&entry.entity_type.as_str()) {
            return Err(StoreError::DataClassRejected);
        }
        let rows = self.driver.query(
            &format!("SELECT body FROM {} WHERE id = ?", entry.entity_type),
            &[SqlValue::text(&entry.entity_id)],
        )?;
        rows.first()
            .and_then(|row| row.first())
            .and_then(SqlValue::as_blob)
            .map(|blob| blob.to_vec())
            .ok_or(StoreError::Decrypt)
    }

    /// Builds the exact payload the sync service accepts.
    ///
    /// The ciphertext is base64 and the checksum is SHA-256 over the raw bytes,
    /// because that is what `services/cowork-api` verifies before writing. Doing
    /// the encoding here means every host produces byte-identical requests and
    /// the checksum cannot be computed from the wrong representation.
    pub fn push_batch(&mut self, device_id: &str, limit: usize) -> Result<Vec<PushItem>> {
        use base64::Engine as _;
        use sha2::{Digest as _, Sha256};

        let entries = self.pending_outbox(device_id, limit)?;
        let mut items = Vec::with_capacity(entries.len());

        for entry in entries {
            let ciphertext = self.outbox_ciphertext(&entry)?;
            let checksum = Sha256::digest(&ciphertext);
            items.push(PushItem {
                id: entry.id.clone(),
                entity_type: entry.entity_type.clone(),
                entity_id: entry.entity_id.clone(),
                operation: entry.operation.as_str().to_string(),
                ciphertext: base64::engine::general_purpose::STANDARD.encode(&ciphertext),
                checksum: checksum.iter().map(|byte| format!("{byte:02x}")).collect(),
                device_seq: entry.device_seq,
                created_at: entry.created_at,
            });
        }

        Ok(items)
    }

    /// Removes acknowledged entries and advances the cursor, in one transaction.
    ///
    /// Doing these separately is how a device loses data: rows deleted without a
    /// cursor advance cause a re-push of everything, and a cursor advanced
    /// without deletion leaks the outbox until it is compacted.
    pub fn acknowledge(
        &mut self,
        device_id: &str,
        workspace_id: &str,
        scope: &str,
        through_seq: u64,
    ) -> Result<()> {
        self.driver.begin()?;
        let result = (|| -> Result<()> {
            self.driver.execute(
                "DELETE FROM sync_outbox WHERE device_id = ? AND device_seq <= ?",
                &[
                    SqlValue::text(device_id),
                    SqlValue::integer(through_seq as i64),
                ],
            )?;
            self.driver.execute(
                "INSERT INTO sync_cursors (device_id, workspace_id, scope, last_seq, updated_at) \
                 VALUES (?, ?, ?, ?, ?) \
                 ON CONFLICT (device_id, workspace_id, scope) DO UPDATE SET last_seq = excluded.last_seq, updated_at = excluded.updated_at",
                &[
                    SqlValue::text(device_id),
                    SqlValue::text(workspace_id),
                    SqlValue::text(scope),
                    SqlValue::integer(through_seq as i64),
                    SqlValue::integer(now()),
                ],
            )?;
            Ok(())
        })();

        match result {
            Ok(()) => self.driver.commit(),
            Err(error) => {
                let _ = self.driver.rollback();
                Err(error)
            }
        }
    }

    pub fn cursor(&mut self, device_id: &str, workspace_id: &str, scope: &str) -> Result<u64> {
        let rows = self.driver.query(
            "SELECT last_seq FROM sync_cursors WHERE device_id = ? AND workspace_id = ? AND scope = ?",
            &[
                SqlValue::text(device_id),
                SqlValue::text(workspace_id),
                SqlValue::text(scope),
            ],
        )?;
        Ok(rows
            .first()
            .and_then(|row| row.first())
            .and_then(SqlValue::as_integer)
            .unwrap_or(0) as u64)
    }

    /// Rebuilds the derived search index from the sealed records.
    ///
    /// The index is never synced and never trusted: this is the recovery path
    /// after a schema change or a partial wipe.
    pub fn rebuild_search_index(&mut self) -> Result<usize> {
        let rows = self
            .driver
            .query("SELECT id, body FROM messages", &[])?;
        let mut count = 0;

        self.driver.begin()?;
        let result = (|| -> Result<()> {
            self.driver.execute("DELETE FROM messages_fts", &[])?;
            for row in &rows {
                let Some(id) = row.first().and_then(SqlValue::as_text) else {
                    continue;
                };
                let Some(envelope) = row.get(1).and_then(SqlValue::as_blob) else {
                    continue;
                };
                // A record that will not open is skipped rather than aborting the
                // rebuild: one corrupt row must not make search unavailable.
                let Ok(plaintext) = crypto::open(&self.master, "messages", id, envelope) else {
                    continue;
                };
                let text = String::from_utf8_lossy(&plaintext);
                self.driver.execute(
                    "INSERT INTO messages_fts (message_id, body) VALUES (?, ?)",
                    &[SqlValue::text(id), SqlValue::text(text.as_ref())],
                )?;
                count += 1;
            }
            Ok(())
        })();

        match result {
            Ok(()) => {
                self.driver.commit()?;
                Ok(count)
            }
            Err(error) => {
                let _ = self.driver.rollback();
                Err(error)
            }
        }
    }

    pub fn search(&mut self, query: &str, limit: usize) -> Result<Vec<String>> {
        let rows = self.driver.query(
            "SELECT message_id FROM messages_fts WHERE messages_fts MATCH ? LIMIT ?",
            &[SqlValue::text(query), SqlValue::integer(limit as i64)],
        )?;
        Ok(rows
            .iter()
            .map(|row| text_at(row, 0))
            .filter(|id| !id.is_empty())
            .collect())
    }
}

fn text_at(row: &[SqlValue], index: usize) -> String {
    row.get(index)
        .and_then(SqlValue::as_text)
        .unwrap_or_default()
        .to_string()
}

fn parse_operation(value: &str) -> Operation {
    match value {
        "create" => Operation::Create,
        "delete" => Operation::Delete,
        "tombstone" => Operation::Tombstone,
        _ => Operation::Update,
    }
}

/// Seconds since the epoch.
///
/// `wasm32-unknown-unknown` has no clock, and `SystemTime::now()` panics there
/// rather than returning an error. None of the timestamps this produces are
/// load-bearing: records carry a `created_at` supplied by the host, and the only
/// two internal uses are the informational `schema_migrations.applied_at` and
/// `sync_cursors.updated_at`. Cursor correctness depends on `last_seq` alone, so
/// a zero here loses provenance, not data.
///
/// Bringing `js-sys` into this crate to read `Date.now()` would hand the storage
/// layer a browser dependency that desktop does not have.
#[cfg(target_arch = "wasm32")]
fn now() -> i64 {
    0
}

#[cfg(not(target_arch = "wasm32"))]
fn now() -> i64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|duration| duration.as_secs() as i64)
        .unwrap_or(0)
}

#[cfg(not(target_arch = "wasm32"))]
mod native {
    use super::{Result, SqlDriver, SqlValue, StoreError};
    use rusqlite::types::Value as RusqliteValue;
    use rusqlite::{params_from_iter, Connection};

    /// `rusqlite`-backed driver, used by desktop and mobile.
    pub struct RusqliteDriver {
        connection: Connection,
    }

    impl RusqliteDriver {
        pub fn open(path: &str) -> Result<Self> {
            let connection = Connection::open(path)?;
            // WAL is what makes a read during a write possible, which the UI
            // depends on: the transcript keeps rendering while a turn persists.
            connection.pragma_update(None, "journal_mode", "WAL")?;
            connection.pragma_update(None, "synchronous", "NORMAL")?;
            connection.pragma_update(None, "foreign_keys", "ON")?;
            Ok(RusqliteDriver { connection })
        }

        pub fn in_memory() -> Result<Self> {
            let connection = Connection::open_in_memory()?;
            connection.pragma_update(None, "foreign_keys", "ON")?;
            Ok(RusqliteDriver { connection })
        }

        fn bound(params: &[SqlValue]) -> Vec<RusqliteValue> {
            params
                .iter()
                .map(|value| match value {
                    SqlValue::Null => RusqliteValue::Null,
                    SqlValue::Integer(inner) => RusqliteValue::Integer(*inner),
                    SqlValue::Text(inner) => RusqliteValue::Text(inner.clone()),
                    SqlValue::Blob(inner) => RusqliteValue::Blob(inner.clone()),
                })
                .collect()
        }
    }

    impl SqlDriver for RusqliteDriver {
        fn execute_batch(&mut self, sql: &str) -> Result<()> {
            self.connection.execute_batch(sql)?;
            Ok(())
        }

        fn execute(&mut self, sql: &str, params: &[SqlValue]) -> Result<usize> {
            let bound = Self::bound(params);
            let changed = self
                .connection
                .execute(sql, params_from_iter(bound.iter()))?;
            Ok(changed)
        }

        fn query(&mut self, sql: &str, params: &[SqlValue]) -> Result<Vec<Vec<SqlValue>>> {
            let bound = Self::bound(params);
            let mut statement = self.connection.prepare(sql)?;
            let column_count = statement.column_count();
            let mut rows = statement.query(params_from_iter(bound.iter()))?;

            let mut out = Vec::new();
            while let Some(row) = rows.next()? {
                let mut values = Vec::with_capacity(column_count);
                for index in 0..column_count {
                    values.push(match row.get_ref(index)? {
                        rusqlite::types::ValueRef::Null => SqlValue::Null,
                        rusqlite::types::ValueRef::Integer(inner) => SqlValue::Integer(inner),
                        rusqlite::types::ValueRef::Real(inner) => {
                            SqlValue::Text(inner.to_string())
                        }
                        rusqlite::types::ValueRef::Text(inner) => {
                            SqlValue::Text(String::from_utf8_lossy(inner).into_owned())
                        }
                        rusqlite::types::ValueRef::Blob(inner) => SqlValue::Blob(inner.to_vec()),
                    });
                }
                out.push(values);
            }
            Ok(out)
        }

        fn begin(&mut self) -> Result<()> {
            self.connection
                .execute_batch("BEGIN IMMEDIATE")
                .map_err(StoreError::from)
        }

        fn commit(&mut self) -> Result<()> {
            self.connection.execute_batch("COMMIT").map_err(StoreError::from)
        }

        fn rollback(&mut self) -> Result<()> {
            self.connection
                .execute_batch("ROLLBACK")
                .map_err(StoreError::from)
        }
    }
}

#[cfg(not(target_arch = "wasm32"))]
pub use native::RusqliteDriver;
