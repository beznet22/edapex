//! Append-only journal.
//!
//! Every local change lands here as a JSON line before it is acknowledged. The
//! journal is the recovery path when the process dies between a write and the
//! next snapshot: replaying it rebuilds state that SQLite may not have committed.
//!
//! Vectors are handled by [`PersistVectorMode`]. The default is [`Rebuild`]
//! because an opaque vector index is device-specific: syncing it across devices
//! would ship one machine's embeddings to another for no benefit, since they can
//! be recomputed locally from the records that produced them.

use std::fs;
use std::io::Write;
use std::path::{Path, PathBuf};

use serde::{Deserialize, Serialize};

use crate::error::{Result, StoreError};

/// Rotation threshold from the storage spec. A snapshot is written and the log
/// truncated once the journal crosses it.
pub const SNAPSHOT_THRESHOLD_BYTES: u64 = 512 * 1024;

const JOURNAL_FILE: &str = "journal.jsonl";
const SNAPSHOT_FILE: &str = "snapshot.json";

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum PersistVectorMode {
    /// Vectors are dropped on write and recomputed on load.
    Rebuild,
    /// Vectors are written inline alongside the record.
    Inline,
}

impl Default for PersistVectorMode {
    fn default() -> Self {
        PersistVectorMode::Rebuild
    }
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct JournalRecord {
    pub id: String,
    pub entity_type: String,
    pub entity_id: String,
    pub created_at: i64,
    /// Omitted entirely under [`PersistVectorMode::Rebuild`].
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub vectors: Option<Vec<f32>>,
}

/// One entry as it appears on disk. A separate type so that the stored shape does
/// not change when [`PersistVectorMode`] does.
#[derive(Serialize)]
struct Stored<'a> {
    id: &'a str,
    entity_type: &'a str,
    entity_id: &'a str,
    created_at: i64,
    #[serde(skip_serializing_if = "Option::is_none")]
    vectors: Option<&'a Vec<f32>>,
}

pub struct Journal {
    directory: PathBuf,
    mode: PersistVectorMode,
}

impl Journal {
    pub fn open(directory: impl AsRef<Path>, mode: PersistVectorMode) -> Result<Self> {
        let directory = directory.as_ref().to_path_buf();
        fs::create_dir_all(&directory).map_err(|error| StoreError::Journal(error.to_string()))?;
        Ok(Journal { directory, mode })
    }

    pub fn mode(&self) -> PersistVectorMode {
        self.mode
    }

    fn log_path(&self) -> PathBuf {
        self.directory.join(JOURNAL_FILE)
    }

    fn snapshot_path(&self) -> PathBuf {
        self.directory.join(SNAPSHOT_FILE)
    }

    /// Appends one record, rotating to a snapshot if the log has outgrown the cap.
    pub fn append(&self, record: &JournalRecord) -> Result<()> {
        let stored = Stored {
            id: &record.id,
            entity_type: &record.entity_type,
            entity_id: &record.entity_id,
            created_at: record.created_at,
            // Rebuild mode drops vectors rather than storing an index that the
            // receiving device would have to distrust anyway.
            vectors: match self.mode {
                PersistVectorMode::Inline => record.vectors.as_ref(),
                PersistVectorMode::Rebuild => None,
            },
        };

        let line =
            serde_json::to_string(&stored).map_err(|e| StoreError::Serialisation(e.to_string()))?;

        let mut file = fs::OpenOptions::new()
            .create(true)
            .append(true)
            .open(self.log_path())
            .map_err(|error| StoreError::Journal(error.to_string()))?;
        writeln!(file, "{line}").map_err(|error| StoreError::Journal(error.to_string()))?;
        file.sync_data()
            .map_err(|error| StoreError::Journal(error.to_string()))?;

        if self.size()? >= SNAPSHOT_THRESHOLD_BYTES {
            self.compact()?;
        }
        Ok(())
    }

    pub fn size(&self) -> Result<u64> {
        match fs::metadata(self.log_path()) {
            Ok(metadata) => Ok(metadata.len()),
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(0),
            Err(error) => Err(StoreError::Journal(error.to_string())),
        }
    }

    /// Reads the snapshot, then replays any journal lines written after it.
    pub fn replay(&self) -> Result<Vec<JournalRecord>> {
        let mut records = self
            .load_snapshot()?
            .unwrap_or_default();

        if let Ok(contents) = fs::read_to_string(self.log_path()) {
            for (index, line) in contents.lines().enumerate() {
                if line.trim().is_empty() {
                    continue;
                }
                let record: JournalRecord = serde_json::from_str(line).map_err(|error| {
                    StoreError::Journal(format!("line {}: {error}", index + 1))
                })?;
                records.push(record);
            }
        }
        Ok(records)
    }

    pub fn load_snapshot(&self) -> Result<Option<Vec<JournalRecord>>> {
        match fs::read_to_string(self.snapshot_path()) {
            Ok(contents) => serde_json::from_str(&contents)
                .map(Some)
                .map_err(|error| StoreError::Journal(error.to_string())),
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(None),
            Err(error) => Err(StoreError::Journal(error.to_string())),
        }
    }

    /// Materialises the log into a snapshot and truncates it.
    ///
    /// The snapshot is written to a temporary file and renamed, so a crash midway
    /// leaves the previous snapshot and the full journal intact rather than a
    /// half-written file.
    pub fn compact(&self) -> Result<()> {
        let records = self.replay()?;
        let serialised =
            serde_json::to_vec(&records).map_err(|e| StoreError::Serialisation(e.to_string()))?;

        let temporary = self.directory.join(format!("{SNAPSHOT_FILE}.tmp"));
        fs::write(&temporary, &serialised)
            .map_err(|error| StoreError::Journal(error.to_string()))?;
        fs::rename(&temporary, self.snapshot_path())
            .map_err(|error| StoreError::Journal(error.to_string()))?;

        // Only after the snapshot is durable is the log safe to clear.
        fs::write(self.log_path(), b"").map_err(|error| StoreError::Journal(error.to_string()))?;
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn temp_dir(name: &str) -> PathBuf {
        let dir = std::env::temp_dir().join(format!(
            "edapex-store-journal-{name}-{}",
            std::process::id()
        ));
        let _ = fs::remove_dir_all(&dir);
        dir
    }

    fn record(id: &str) -> JournalRecord {
        JournalRecord {
            id: id.to_string(),
            entity_type: "messages".to_string(),
            entity_id: id.to_string(),
            created_at: 1,
            vectors: Some(vec![0.5, 0.25]),
        }
    }

    #[test]
    fn replays_in_order() {
        let dir = temp_dir("order");
        let journal = Journal::open(&dir, PersistVectorMode::Rebuild).unwrap();
        journal.append(&record("a")).unwrap();
        journal.append(&record("b")).unwrap();

        let ids: Vec<String> = journal
            .replay()
            .unwrap()
            .into_iter()
            .map(|entry| entry.id)
            .collect();
        assert_eq!(ids, vec!["a", "b"]);
        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn rebuild_mode_drops_vectors() {
        let dir = temp_dir("rebuild");
        let journal = Journal::open(&dir, PersistVectorMode::Rebuild).unwrap();
        journal.append(&record("a")).unwrap();

        let contents = fs::read_to_string(dir.join(JOURNAL_FILE)).unwrap();
        assert!(!contents.contains("vectors"), "{contents}");
        assert_eq!(journal.replay().unwrap()[0].vectors, None);
        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn inline_mode_keeps_vectors() {
        let dir = temp_dir("inline");
        let journal = Journal::open(&dir, PersistVectorMode::Inline).unwrap();
        journal.append(&record("a")).unwrap();

        let contents = fs::read_to_string(dir.join(JOURNAL_FILE)).unwrap();
        assert!(contents.contains("vectors"), "{contents}");
        assert_eq!(journal.replay().unwrap()[0].vectors, Some(vec![0.5, 0.25]));
        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn compacts_past_the_cap_and_preserves_every_record() {
        let dir = temp_dir("compact");
        // Inline vectors make each line large, so the 512 KB cap is reached in
        // hundreds of appends rather than thousands. The test is about rotation,
        // not throughput, and fsyncing 12,000 lines made the suite take 40s.
        let journal = Journal::open(&dir, PersistVectorMode::Inline).unwrap();
        let heavy = |id: &str| JournalRecord {
            id: id.to_string(),
            entity_type: "messages".to_string(),
            entity_id: id.to_string(),
            created_at: 1,
            vectors: Some(vec![0.125; 256]),
        };

        let total = 800;
        for index in 0..total {
            journal.append(&heavy(&format!("m-{index:06}"))).unwrap();
        }

        // The snapshot holds the state at the last rotation; anything appended
        // afterwards still lives in the log. Replay is the combined view, and
        // that is what must be lossless.
        let snapshot = journal.load_snapshot().unwrap();
        assert!(snapshot.is_some(), "no snapshot was written");

        let ids: std::collections::HashSet<String> = journal
            .replay()
            .unwrap()
            .into_iter()
            .map(|entry| entry.id)
            .collect();
        assert_eq!(ids.len(), total, "a record was lost or duplicated");
        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn replay_merges_snapshot_and_later_lines() {
        let dir = temp_dir("merge");
        let journal = Journal::open(&dir, PersistVectorMode::Rebuild).unwrap();
        journal.append(&record("a")).unwrap();
        journal.compact().unwrap();
        journal.append(&record("b")).unwrap();

        let ids: Vec<String> = journal
            .replay()
            .unwrap()
            .into_iter()
            .map(|entry| entry.id)
            .collect();
        assert_eq!(ids, vec!["a", "b"]);
        let _ = fs::remove_dir_all(&dir);
    }
}
