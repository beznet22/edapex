//! Per-record authenticated encryption.
//!
//! One scheme for every host: plain SQLite with each record sealed by
//! XChaCha20-Poly1305. SQLCipher is deliberately not used — it would mean a
//! separate native binary per ABI and a second crypto stack that the browser
//! cannot share.
//!
//! Every record gets its own key derived from the workspace master key. That is
//! stricter than a shared key with per-record nonces: a compromised record key
//! exposes exactly one record, and the key derivation binds the record's
//! coordinates, so ciphertext cannot be moved between rows.

use blake3::Hasher;
use chacha20poly1305::aead::{Aead, Payload};
use chacha20poly1305::{KeyInit, XChaCha20Poly1305, XNonce};

use crate::error::{Result, StoreError};

/// Envelope version. Stored in the clear so a future scheme can be introduced
/// without guessing at older bytes.
const VERSION: u8 = 1;
const NONCE_LEN: usize = 24;
const HEADER_LEN: usize = 1 + NONCE_LEN;
const KEY_CONTEXT: &str = "edapex-store record key v1";

/// A 32-byte workspace master key.
///
/// Held by the host (OS keychain natively, WebCrypto-wrapped on the web) and
/// never written into the store.
#[derive(Clone)]
pub struct MasterKey([u8; 32]);

impl MasterKey {
    pub fn from_bytes(bytes: [u8; 32]) -> Self {
        MasterKey(bytes)
    }

    /// Test and import helper. Debug is derived rather than printed, because a
    /// panic that prints the key would leak it into a crash reporter.
    pub fn expose_for_host(&self) -> &[u8; 32] {
        &self.0
    }
}

impl std::fmt::Debug for MasterKey {
    fn fmt(&self, formatter: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        formatter.write_str("MasterKey(<redacted>)")
    }
}

/// Derives the key for one record from its coordinates.
///
/// Binding the table and row id here means a ciphertext moved to a different row
/// decrypts under a different key and fails, before the AEAD's associated data is
/// even considered.
pub fn record_key(master: &MasterKey, table: &str, record_id: &str) -> [u8; 32] {
    let mut hasher = Hasher::new_derive_key(KEY_CONTEXT);
    hasher.update(&master.0);
    hasher.update(&[0]);
    hasher.update(table.as_bytes());
    hasher.update(&[0]);
    hasher.update(record_id.as_bytes());
    *hasher.finalize().as_bytes()
}

/// Additional authenticated data for a record.
///
/// Authenticated but not encrypted: it is metadata the server also needs in
/// order to store and route the row.
pub fn record_aad(table: &str, record_id: &str) -> Vec<u8> {
    let mut aad = Vec::with_capacity(table.len() + record_id.len() + 2);
    aad.extend_from_slice(table.as_bytes());
    aad.push(0);
    aad.extend_from_slice(record_id.as_bytes());
    aad
}

pub fn random_nonce() -> [u8; NONCE_LEN] {
    let mut nonce = [0u8; NONCE_LEN];
    getrandom::getrandom(&mut nonce).expect("the operating system did not provide randomness");
    nonce
}

/// Seals a record. Output is `version || nonce || ciphertext || tag`.
pub fn seal(
    master: &MasterKey,
    table: &str,
    record_id: &str,
    nonce: [u8; NONCE_LEN],
    plaintext: &[u8],
) -> Result<Vec<u8>> {
    let key = record_key(master, table, record_id);
    seal_with_key(&key, table, record_id, nonce, plaintext)
}

/// Seals with an already-derived key, for callers writing many records that
/// share coordinates (for example a batched outbox flush).
pub fn seal_with_key(
    key: &[u8; 32],
    table: &str,
    record_id: &str,
    nonce: [u8; NONCE_LEN],
    plaintext: &[u8],
) -> Result<Vec<u8>> {
    let cipher = XChaCha20Poly1305::new(key.into());
    let aad = record_aad(table, record_id);

    let ciphertext = cipher
        .encrypt(
            XNonce::from_slice(&nonce),
            Payload {
                msg: plaintext,
                aad: &aad,
            },
        )
        .map_err(|_| StoreError::Encrypt)?;

    let mut envelope = Vec::with_capacity(HEADER_LEN + ciphertext.len());
    envelope.push(VERSION);
    envelope.extend_from_slice(&nonce);
    envelope.extend_from_slice(&ciphertext);
    Ok(envelope)
}

pub fn open(
    master: &MasterKey,
    table: &str,
    record_id: &str,
    envelope: &[u8],
) -> Result<Vec<u8>> {
    let key = record_key(master, table, record_id);
    open_with_key(&key, table, record_id, envelope)
}

pub fn open_with_key(
    key: &[u8; 32],
    table: &str,
    record_id: &str,
    envelope: &[u8],
) -> Result<Vec<u8>> {
    if envelope.len() <= HEADER_LEN || envelope[0] != VERSION {
        return Err(StoreError::Decrypt);
    }
    let nonce = &envelope[1..HEADER_LEN];
    let ciphertext = &envelope[HEADER_LEN..];
    let cipher = XChaCha20Poly1305::new(key.into());
    let aad = record_aad(table, record_id);

    cipher
        .decrypt(
            XNonce::from_slice(nonce),
            Payload {
                msg: ciphertext,
                aad: &aad,
            },
        )
        .map_err(|_| StoreError::Decrypt)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn master() -> MasterKey {
        MasterKey::from_bytes([7u8; 32])
    }

    #[test]
    fn round_trips_a_record() {
        let sealed = seal(&master(), "messages", "m1", [1u8; 24], b"hello").unwrap();
        assert_eq!(open(&master(), "messages", "m1", &sealed).unwrap(), b"hello");
    }

    #[test]
    fn ciphertext_is_bound_to_its_row() {
        let sealed = seal(&master(), "messages", "m1", [1u8; 24], b"hello").unwrap();
        // Same master key, same table, different row: the derived key differs.
        assert!(open(&master(), "messages", "m2", &sealed).is_err());
        // Same row id under a different table must fail too.
        assert!(open(&master(), "students", "m1", &sealed).is_err());
    }

    #[test]
    fn a_different_master_key_cannot_open() {
        let sealed = seal(&master(), "messages", "m1", [1u8; 24], b"hello").unwrap();
        let other = MasterKey::from_bytes([9u8; 32]);
        assert!(open(&other, "messages", "m1", &sealed).is_err());
    }

    #[test]
    fn tampering_is_detected() {
        let mut sealed = seal(&master(), "messages", "m1", [1u8; 24], b"hello").unwrap();
        let last = sealed.len() - 1;
        sealed[last] ^= 0b0000_0001;
        assert!(open(&master(), "messages", "m1", &sealed).is_err());
    }

    #[test]
    fn each_record_key_is_distinct() {
        let master = master();
        assert_ne!(
            record_key(&master, "messages", "m1"),
            record_key(&master, "messages", "m2")
        );
        assert_ne!(
            record_key(&master, "messages", "m1"),
            record_key(&master, "students", "m1")
        );
    }

    #[test]
    fn unknown_version_is_rejected() {
        let mut sealed = seal(&master(), "messages", "m1", [1u8; 24], b"hello").unwrap();
        sealed[0] = 0xFF;
        assert!(open(&master(), "messages", "m1", &sealed).is_err());
    }

    #[test]
    fn debug_never_prints_the_key() {
        let rendered = format!("{:?}", master());
        assert!(!rendered.contains("7, 7, 7"), "{rendered}");
    }
}
