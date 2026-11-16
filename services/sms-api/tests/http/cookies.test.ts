import { describe, expect, it } from "vitest";

import { sessionCookieNameFor } from "../../src/lib/server/http/cookies";

/**
 * Cookie naming, both branches.
 *
 * The `__Host-` prefix is not cosmetic: it is the one thing that stops a subdomain setting a
 * session cookie that the parent domain will then send. Dropping it locally is a deliberate,
 * narrow exception, and these tests are what keep it narrow.
 */
describe("session cookie name", () => {
  it("uses the __Host- prefix over HTTPS", () => {
    expect(sessionCookieNameFor("https://api.llacademy.ng/api/v1/me")).toBe(
      "__Host-edapex_session"
    );
  });

  it("uses the __Host- prefix for a plain-HTTP non-loopback host", () => {
    // A LAN address is not a secure context, but it is also not a development machine — the
    // exception must not spread to it.
    expect(sessionCookieNameFor("http://192.168.1.10:8787/api/v1/me")).toBe(
      "__Host-edapex_session"
    );
  });

  it("drops the prefix on plain-HTTP loopback", () => {
    // `__Host-` requires `Secure`, and the browser drops the cookie rather than storing it —
    // which is a successful sign-in that is immediately forgotten.
    expect(sessionCookieNameFor("http://localhost:8787/api/v1/me")).toBe("edapex_session");
    expect(sessionCookieNameFor("http://127.0.0.1:5181/api/v1/me")).toBe("edapex_session");
  });

  it("keeps the prefix on HTTPS loopback", () => {
    expect(sessionCookieNameFor("https://localhost:8787/api/v1/me")).toBe(
      "__Host-edapex_session"
    );
  });

  it("falls back to the strict name when the URL cannot be parsed", () => {
    expect(sessionCookieNameFor("not a url")).toBe("__Host-edapex_session");
  });
});
