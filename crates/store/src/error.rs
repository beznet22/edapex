use thiserror::Error;

#[derive(Debug, Error)]
pub enum StoreError {
    #[error("sqlite: {0}")]
    Sqlite(String),

    #[error("serialisation: {0}")]
    Serialisation(String),

    #[error("encryption failed")]
    Encrypt,

    #[error("decryption failed: wrong key, wrong record, or tampered ciphertext")]
    Decrypt,

    #[error("journal: {0}")]
    Journal(String),

    #[error("a record may only be written for data classes the store is allowed to hold")]
    DataClassRejected,

    #[error("device sequence {0} is not greater than the last written sequence {1}")]
    SequenceOutOfOrder(u64, u64),
}

#[cfg(not(target_arch = "wasm32"))]
impl From<rusqlite::Error> for StoreError {
    fn from(error: rusqlite::Error) -> Self {
        StoreError::Sqlite(error.to_string())
    }
}

pub type Result<T> = std::result::Result<T, StoreError>;
