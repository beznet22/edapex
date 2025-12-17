import * as jose from "jose";
import { SignJWT, jwtVerify, decodeJwt, type JWTPayload, base64url } from "jose";
import { env } from "$env/dynamic/private";
import crypto from "crypto";

const SECRET = new TextEncoder().encode(env.JWT_SIGN_SECRET || "secret");
const JWE_SECRET = base64url.decode(env.JWE_ENC_SECRET! || "secret");
if (!SECRET.length) throw new Error("JWT_SIGN_SECRET required");
if (!SECRET.length || !JWE_SECRET.length) {
  throw new Error("Missing SIGN_SECRET/JWE_SECRET environment variables");
}

/** Token result with computed expiration timestamp for cookie sync */
export type TokenResult = { token: string; exp: number };
export type RTResult = TokenResult & { jti: string };

const now = () => Math.floor(Date.now() / 1000);

export const jwt = {
  /** Sign a payload, returns token + absolute exp timestamp */
  async sign(payload: JWTPayload, ttlSec: number, jti?: string, encrypt?: boolean): Promise<TokenResult> {
    const exp = now() + ttlSec;
    const builder = new SignJWT({ ...payload, exp }).setProtectedHeader({ alg: "HS256" }).setIssuedAt();
    if (jti) builder.setJti(jti);
    const token = await builder.sign(SECRET);
    if (encrypt) {
      const encrypted = await this.encrypt(token);
      return { token: `jwe:${encrypted}`, exp };
    }
    return { token, exp };
  },

  /** Sign refresh token with random jti */
  async signRT(payload: JWTPayload, ttlSec: number): Promise<RTResult> {
    const jti = crypto.randomUUID();
    const { token, exp } = await this.sign(payload, ttlSec, jti);
    return { token, exp, jti };
  },

  /** Verify token, returns payload or null */
  async verify(token?: string, maxAge?: number): Promise<JWTPayload | null> {
    if (!token) return null;
    try {
      if (token.startsWith("jwe:")) {
        token = await this.decrypt(token.slice(4));
      }
      const { payload } = await jwtVerify(token, SECRET, {
        algorithms: ["HS256"],
        maxTokenAge: maxAge ? `${maxAge}s` : undefined,
      });
      return payload;
    } catch {
      return null;
    }
  },

  async encrypt(signed: string): Promise<string> {
    const jwe = await new jose.CompactEncrypt(new TextEncoder().encode(signed))
      .setProtectedHeader({ alg: "dir", enc: "A256GCM", typ: "JWE" })
      .encrypt(JWE_SECRET);
    return jwe;
  },

  async decrypt(jwe: string): Promise<string> {
    const { plaintext } = await jose.compactDecrypt(jwe, JWE_SECRET);
    return new TextDecoder().decode(plaintext);
  },

  /** Decode without verification (for binding checks) */
  decode(token: string): JWTPayload | null {
    try {
      return decodeJwt(token);
    } catch {
      return null;
    }
  },

  /** Get exp timestamp from token, or 0 if invalid */
  getExp(token: string): number {
    return this.decode(token)?.exp ?? 0;
  },

  /** Check if token is expired */
  isExpired(token: string): boolean {
    const exp = this.getExp(token);
    return !exp || exp < now();
  },
};
