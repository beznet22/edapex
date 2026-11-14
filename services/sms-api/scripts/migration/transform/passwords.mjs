/**
 * `05 §4` password rule and `04 §5` email canonicalisation.
 *
 * Every legacy hash is replaced by the shared SHA-256 claim digest. The digest
 * is supplied by the caller; this module has no Node crypto import so the
 * Workers test pool can exercise it.
 */
import { normalizeEmail } from "./helpers.mjs";

export function applySharedDigest(users, digest) {
  if (!/^[0-9a-f]{64}$/i.test(String(digest))) {
    throw new Error("The shared claim digest must be 64 hexadecimal characters");
  }
  let replaced = 0;
  for (const user of users) {
    const email = normalizeEmail(user.email);
    user.email = email;
    if (user.password !== null && user.password !== undefined) replaced += 1;
    user.password = digest.toLowerCase();
    user.email_verified_at = null;
    user.claim_status = email === null ? null : "pending";
  }
  return { users, replaced };
}
