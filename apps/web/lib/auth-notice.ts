/**
 * What the sign-in screen is telling the person.
 *
 * A discriminated union rather than two strings (`authMessage` + `error`), because the
 * previous screen rendered both simultaneously: "session check failed" sat above "check your
 * inbox", and nothing on the page said which was current. One value means one state.
 *
 * The `link-expired` and Google failure kinds exist because those states used to have no
 * representation at all — the API answered an HTML navigation with a JSON error envelope, so
 * a person who clicked an expired link got `{"error":"UNAUTHENTICATED",...}` rendered as a
 * blank page.
 */
export type LoginNotice =
  | { readonly kind: "idle" }
  | { readonly kind: "sent"; readonly email: string }
  | { readonly kind: "link-expired" }
  | { readonly kind: "cancelled" }
  | { readonly kind: "mismatch" }
  | { readonly kind: "ambiguous" }
  | { readonly kind: "unconfigured" }
  | { readonly kind: "rate-limited"; readonly retryAfter: number }
  | { readonly kind: "failed"; readonly message: string };

export const IDLE: LoginNotice = { kind: "idle" };

/**
 * Maps `?auth_error=` onto a notice.
 *
 * The server redirects with a short code rather than a message, so the copy lives in one
 * place and can be changed without a deploy of the API. An unknown code is `idle` on
 * purpose: a stale bookmark carrying `?auth_error=whatever` should show a clean sign-in
 * screen, not an error about a failure that did not happen.
 */
export function noticeFromQuery(search: string): LoginNotice {
  const params = new URLSearchParams(search);
  const code = params.get("auth_error");
  if (code === null) return IDLE;

  switch (code) {
    case "expired":
      return { kind: "link-expired" };
    case "cancelled":
      return { kind: "cancelled" };
    case "mismatch":
      return { kind: "mismatch" };
    case "ambiguous":
      return { kind: "ambiguous" };
    case "unconfigured":
      return { kind: "unconfigured" };
    default:
      return IDLE;
  }
}

/** Maps an API failure onto a notice, keeping the rate-limit case distinct. */
export function noticeFromError(message: string, status?: number): LoginNotice {
  if (status === 429) {
    const match = /(\d+)\s*second/i.exec(message);
    return { kind: "rate-limited", retryAfter: match === null ? 60 : Number(match[1]) };
  }
  return { kind: "failed", message };
}

/** The human copy for a notice, or null when there is nothing to say. */
export function noticeMessage(notice: LoginNotice): string | null {
  switch (notice.kind) {
    case "idle":
    case "sent":
      return null;
    case "link-expired":
      return "That sign-in link has expired or was already used. Request a new one below.";
    case "cancelled":
      return "Google sign-in was cancelled.";
    case "mismatch":
      return "That Google account does not match the one on your school record.";
    case "ambiguous":
      return "More than one account uses that email. Ask an administrator to resolve it.";
    case "unconfigured":
      return "Google sign-in is not configured for this school. Use an email link instead.";
    case "rate-limited":
      return `Too many attempts. Try again in ${notice.retryAfter} seconds.`;
    case "failed":
      return notice.message;
  }
}
