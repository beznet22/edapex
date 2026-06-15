/**
 * AES-256-CBC encryption helpers for credential storage — V2 copy.
 *
 * Verbatim port of V1's `crypto.ts`. Kept as a separate file so the
 * V2 module is self-contained and the V1 directory can be deleted
 * without leaving dangling imports.
 */
import { createHash, createCipheriv, createDecipheriv, randomBytes } from 'crypto';

const ALGORITHM = 'aes-256-cbc';

function getKeyBuffer(encryptionKey: string): Buffer {
	return createHash('sha256').update(encryptionKey).digest();
}

export function encrypt(text: string, encryptionKey: string): string {
	const iv = randomBytes(16);
	const cipher = createCipheriv(ALGORITHM, getKeyBuffer(encryptionKey), iv);
	let encrypted = cipher.update(text, 'utf8', 'hex');
	encrypted += cipher.final('hex');
	return iv.toString('hex') + ':' + encrypted;
}

export function decrypt(encryptedText: string, encryptionKey: string): string {
	try {
		const [ivHex, encrypted] = encryptedText.split(':');
		if (!ivHex || !encrypted) return '';
		const iv = Buffer.from(ivHex, 'hex');
		const decipher = createDecipheriv(ALGORITHM, getKeyBuffer(encryptionKey), iv);
		let decrypted = decipher.update(encrypted, 'hex', 'utf8');
		decrypted += decipher.final('utf8');
		return decrypted;
	} catch (e) {
		console.error('Failed to decrypt provider key:', e);
		return '';
	}
}

export function maskKey(key: string): string {
	if (!key) return '';
	if (key.length <= 8) return '********';
	return `${key.slice(0, 4)}...${key.slice(-4)}`;
}
