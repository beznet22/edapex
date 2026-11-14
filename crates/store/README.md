# `edapex-store`

The local agent store: plain SQLite, per-record encryption, an append-only journal
and a sync outbox.

**Not** SQLCipher. Per-record XChaCha20-Poly1305 is the only scheme, and the same
one runs on desktop, mobile and the web. SQLCipher would add a native binary per
ABI and a second crypto stack the browser cannot share, for little gain when every
record already has its own key.

## The invariant

> A local write and the change that carries it to the cloud are committed
> together, or not at all.

A write that committed without its `sync_outbox` row would be invisible to sync
forever; no later reconciliation could find it. `write_record` therefore inserts
the entity and the outbox row inside one transaction, and a failure rolls back
both. `tests/store.rs` asserts this by forcing an insert to fail on a NOT NULL
column and checking that no outbox row survives.

## Layout

| File | Contents |
|---|---|
| `src/lib.rs` | `SqlDriver` trait, `Store`, outbox and cursor operations |
| `src/crypto.rs` | Per-record key derivation and the sealed envelope |
| `src/journal.rs` | Append-only JSONL, `PersistVectorMode`, snapshot rotation |
| `src/migrations.rs` | Core schema |

## Encryption

Each record gets its own key, derived with BLAKE3 `derive_key` from the workspace
master key plus the record's `(table, id)`. Binding the coordinates into the key
means a ciphertext moved to another row fails to decrypt before the AEAD's
associated data is even consulted.

Envelope layout: `version (1) || nonce (24) || ciphertext || tag`.

- The master key never enters the store. It lives in the OS keychain natively and
  is WebCrypto-wrapped on the web.
- The `data_class` column is `CHECK (data_class = 'workspace')`. `edapex` (school
  records) and `edapex-ephemeral` have no representation, so a bug cannot persist
  them here even if it tries.
- Table names reaching SQL are checked against a whitelist.

## Journal

Every change is appended to `journal.jsonl` before it is acknowledged. Replay is
snapshot plus later lines, so a crash between a write and the next snapshot does
not lose records. At 512 KB the journal is compacted: the snapshot is written to a
temporary file and renamed, and only then is the log truncated.

`PersistVectorMode::Rebuild` is the default and drops vectors on write. An
embedding index is device-specific and rebuildable, so syncing it would ship one
machine's vectors to another for no benefit.

## Search

`messages_fts` is FTS5 over decrypted text. It is derived, unencrypted,
rebuildable and **never synced**. `rebuild_search_index` repopulates it from the
sealed records; a record that will not open is skipped rather than aborting the
rebuild.

## Drivers

| Host | Driver |
|---|---|
| Desktop / mobile | `RusqliteDriver` (`rusqlite`, WAL) |
| Browser | `JsSqlDriver` in `crates/agent-wasm`, over OPFS SQLite WASM |

The browser driver is not in this crate because it necessarily crosses into
JavaScript; the logical model, the per-record keys and the outbox stay here, so a
rule enforced natively is enforced on the web without a second implementation.

The calls are synchronous in both directions. `sqlite3.oo1` is a blocking API, so
no executor or promise queue is needed between Rust and the engine.

Without OPFS the engine falls back to an in-memory database and reports
`persistent: false`. That is "offline storage unavailable", not silent data loss —
the caller can say so rather than discovering it after a reload.

## Verification

```bash
cargo test -p edapex-store
```
