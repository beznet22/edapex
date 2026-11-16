/**
 * AES-256-CBC encryption helpers for credential storage.
 */
import { createHash, createCipheriv, createDecipheriv, randomBytes } from 'crypto';
import { DecryptionError } from '$lib/provider/errors';

const ALGORITHM = 'aes-256-cbc';

function getKeyBuffer(encryptionKey: string): Buffer {
	return createHash('sha256').update(encryptionKey).digest();
}

const ENCRYPTION_KEY_FALLBACK = 'edapex-default-encryption-key-32ch';

/**
 * Resolve the encryption key from env, falling back to the well-known
 * default ONLY in non-production environments. In production the fallback
 * is refused so that a missing TOKEN_ENCRYPTION_KEY / ENCRYPTION_KEY is a
 * hard failure rather than a silent security downgrade.
 */
export function getEncryptionKey(env: Record<string, string | undefined>): string {
	const explicit = env.TOKEN_ENCRYPTION_KEY || env.ENCRYPTION_KEY;
	if (explicit) return explicit;
	const isProduction = env.NODE_ENV === 'production' || process.env.NODE_ENV === 'production';
	if (isProduction) {
		throw new Error('Encryption key required in production: set TOKEN_ENCRYPTION_KEY or ENCRYPTION_KEY');
	}
	return ENCRYPTION_KEY_FALLBACK;
}

export function encrypt(text: string, encryptionKey: string): string {
	const iv = randomBytes(16);
	const cipher = createCipheriv(ALGORITHM, getKeyBuffer(encryptionKey), iv);
	let encrypted = cipher.update(text, 'utf8', 'hex');
	encrypted += cipher.final('hex');
	return iv.toString('hex') + ':' + encrypted;
}

/**
 * Decrypt a blob produced by {@link encrypt}. Throws {@link DecryptionError}
 * for malformed input (missing IV separator, invalid hex, wrong length),
 * wrong-key decryption (final() auth failure), and any other crypto error.
 *
 * Callers MUST handle the thrown error. Returning an empty string on
 * failure was unsafe — downstream code interpreted it as "no key" and
 * would happily serve requests with a blank credential. Throwing forces
 * every consumer to make an explicit decision.
 */
export function decrypt(encryptedText: string, encryptionKey: string): string {
	const parts = encryptedText.split(':');
	if (parts.length !== 2) {
		throw new DecryptionError(
			`Malformed ciphertext: expected '<ivHex>:<encrypted>' but received ${parts.length} segment(s)`
		);
	}
	const [ivHex, encrypted] = parts as [string, string];
	if (!ivHex || !encrypted) {
		throw new DecryptionError('Malformed ciphertext: empty IV or body segment');
	}
	if (!/^[0-9a-f]+$/i.test(ivHex) || ivHex.length % 2 !== 0) {
		throw new DecryptionError('Malformed ciphertext: IV is not valid hex');
	}
	const iv = Buffer.from(ivHex, 'hex');
	if (iv.length !== 16) {
		throw new DecryptionError(
			`Malformed ciphertext: expected 16-byte IV but received ${iv.length} bytes`
		);
	}
	const decipher = createDecipheriv(ALGORITHM, getKeyBuffer(encryptionKey), iv);
	try {
		let decrypted = decipher.update(encrypted, 'hex', 'utf8');
		decrypted += decipher.final('utf8');
		return decrypted;
	} catch (cause) {
		throw new DecryptionError(
			'Decryption failed (wrong key or tampered ciphertext)',
			undefined,
			cause
		);
	}
}

export function maskKey(key: string): string {
	if (!key) return '';
	if (key.length <= 8) return '********';
	return `${key.slice(0, 4)}...${key.slice(-4)}`;
}
