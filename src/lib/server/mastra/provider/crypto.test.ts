import { describe, it, expect } from 'vitest';
import { encrypt, decrypt } from './crypto';
import { DecryptionError, ProviderError } from '$lib/provider/errors';

const KEY = 'a-very-secret-key-for-tests-only';

describe('crypto — encrypt/decrypt', () => {
	it('round-trips plaintext through encrypt → decrypt', () => {
		const ciphertext = encrypt('sk-test-1234567890', KEY);
		expect(decrypt(ciphertext, KEY)).toBe('sk-test-1234567890');
	});

	it('produces different ciphertexts for the same plaintext (random IV)', () => {
		const a = encrypt('sk-test', KEY);
		const b = encrypt('sk-test', KEY);
		expect(a).not.toBe(b);
		expect(decrypt(a, KEY)).toBe('sk-test');
		expect(decrypt(b, KEY)).toBe('sk-test');
	});

	it('does NOT silently return empty string on any failure path', () => {
		// Spec guarantee: malformed input throws DecryptionError. We assert
		// every common failure mode here so a regression to silent ''
		// return would surface as a test failure rather than a security
		// incident in production.
		const failureInputs: Array<[string, string]> = [
			['no colon separator', 'deadbeefcafebabe'],
			['empty string', ''],
			['only colon', ':'],
			['empty IV', ':abcdef'],
			['empty body', 'abcdef:'],
			['non-hex IV', 'zz:notvalidhex'],
			['odd-length IV', 'abc:deadbeef'],
			['wrong-length IV (8 bytes)', '0011223344556677:deadbeef'],
			['wrong key on valid ciphertext', encrypt('sk-test', 'other-key-32-bytes-of-padding!')],
			['fully tampered body', `${'0'.repeat(32)}:ffffffffffffffffffffffffffffffff`]
		];

		for (const [label, input] of failureInputs) {
			expect(() => decrypt(input, KEY), label).toThrow(DecryptionError);
		}
	});

	it('throws DecryptionError for malformed ciphertext', () => {
		// The single failing case explicitly named in the step description.
		let caught: unknown;
		try {
			decrypt('not-a-valid-ciphertext', KEY);
		} catch (err) {
			caught = err;
		}
		expect(caught).toBeInstanceOf(DecryptionError);
		expect(caught).toBeInstanceOf(ProviderError);
	});

	it('DecryptionError carries the underlying crypto error as cause for wrong-key cases', () => {
		const ciphertext = encrypt('sk-real', KEY);
		try {
			decrypt(ciphertext, 'completely-different-key-padding!');
			expect.fail('expected decrypt to throw');
		} catch (err) {
			expect(err).toBeInstanceOf(DecryptionError);
			// wrong-key lands in the decipher.final() catch — verify the
			// underlying cause is preserved so callers can introspect.
			expect((err as DecryptionError).cause).toBeDefined();
		}
	});
});
