import type { EmailMessage, EmailSender } from "../ports/email-sender.port";

/**
 * Email transport for local development.
 *
 * `wrangler dev` provides no `send_email` binding, so the Cloudflare adapter throws
 * `PortError("email", "Email binding is not configured")` and **magic-link sign-in cannot
 * work locally at all**. That is why the dev auth bypass existed: it did not bypass
 * permissions, it bypassed a missing transport.
 *
 * This closes the real gap. The message is written to the console, and for a magic link
 * the verification URL is written prominently, because the whole point is that a developer
 * can copy it.
 *
 * # Why this is safe to ship in the bundle
 *
 * It is selected only when `LOCAL_EMAIL_LOG === "true"`, which is set in `wrangler dev`
 * variables and nowhere else. A deployed Worker that somehow had the flag on would print
 * magic links to its logs rather than email them — a loud, obvious failure, not a silent
 * one. The alternative, a `NODE_ENV !== "production"` check, is the pattern that
 * accidentally reached production twice in this project's history.
 */
export interface LocalEmail {
  readonly to: string;
  readonly subject: string;
  readonly text: string;
  /** Present for magic links so a developer can click rather than reconstruct. */
  readonly verifyUrl: string | null;
}

export class LoggingEmailAdapter implements EmailSender {
  constructor(
    private readonly options: {
      /** Sink, defaulting to `console.info`. Injected so tests can assert. */
      readonly log?: (message: LocalEmail) => void;
    } = {}
  ) {}

  async send(message: EmailMessage): Promise<{ readonly messageId: string }> {
    const rendered = render(message);
    const emit = this.options.log ?? defaultLog;
    emit(rendered);
    // A stable, obviously-synthetic id: nothing downstream should treat a logged message
    // as delivered, and a real-looking id invites exactly that.
    return { messageId: `local-${Date.now().toString(36)}` };
  }
}

function defaultLog(message: LocalEmail): void {
  const lines = [
    "",
    "─────────────────────────────── local email ───────────────────────────────",
    `  to:      ${message.to}`,
    `  subject: ${message.subject}`,
    message.verifyUrl === null ? "" : `  link:    ${message.verifyUrl}`,
    "───────────────────────────────────────────────────────────────────────────",
    "",
    message.verifyUrl === null ? message.text : "",
    ""
  ].filter((line) => line !== "");
  console.info(lines.join("\n"));
}

/** The same shapes the Cloudflare adapter renders, kept minimal on purpose. */
function render(message: EmailMessage): LocalEmail {
  if (message.template === "magic_link") {
    const url = stringOf(message.data["url"]);
    return {
      to: message.to,
      subject: "Your EdApex sign-in link",
      text: `Sign in to EdApex: ${url}\n\nThis link expires in 15 minutes and works once.`,
      verifyUrl: url.length > 0 ? url : null
    };
  }

  if (message.template === "result") {
    return {
      to: message.to,
      subject: "Your result is ready",
      text: `${stringOf(message.data["studentName"])} — ${stringOf(message.data["title"])}`,
      verifyUrl: null
    };
  }

  return {
    to: message.to,
    subject: "Your transcript is ready",
    text: stringOf(message.data["studentName"]),
    verifyUrl: null
  };
}

function stringOf(value: string | number | boolean | null | undefined): string {
  return value === null || value === undefined ? "" : String(value);
}
