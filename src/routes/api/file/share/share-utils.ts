import { SignJWT, jwtVerify } from 'jose';
import { env } from '$env/dynamic/private';

const SEVEN_DAYS_SEC = 7 * 24 * 60 * 60; // 604800 seconds

function getShareSecret(): Uint8Array {
	const secret = env.FILE_SHARE_SECRET || env.JWT_SIGN_SECRET || 'file-share-fallback-secret';
	return new TextEncoder().encode(secret);
}

/**
 * Sign a share token containing the file key and workspace with 7-day expiration.
 */
export async function signShareToken(key: string, workspace: string): Promise<{ token: string; expiresAt: Date }> {
	const expiresAt = new Date(Date.now() + SEVEN_DAYS_SEC * 1000);
	const token = await new SignJWT({ key, workspace })
		.setProtectedHeader({ alg: 'HS256' })
		.setIssuedAt()
		.setExpirationTime(expiresAt)
		.sign(getShareSecret());

	return { token, expiresAt };
}

/**
 * Verify a share token and return the payload if valid.
 */
export async function verifyShareToken(token: string): Promise<{ key: string; workspace: string } | null> {
	try {
		const { payload } = await jwtVerify(token, getShareSecret(), { algorithms: ['HS256'] });
		if (typeof payload.key !== 'string' || typeof payload.workspace !== 'string') {
			return null;
		}
		return { key: payload.key, workspace: payload.workspace };
	} catch {
		return null;
	}
}
