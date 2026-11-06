import { PortError } from "../errors";
import type { EmailBindingLike, EmailMessage, EmailSender } from "../ports";
import { renderEmail } from "./email-render";

export interface CloudflareEmailOptions {
  readonly binding: unknown;
  readonly from: string;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

export const isEmailBinding = (value: unknown): value is EmailBindingLike => {
  if (!isRecord(value)) return false;
  const send = value["send"];
  return typeof send === "function";
};

const messageIdOf = (result: unknown): string => {
  if (!isRecord(result)) return "";
  const messageId = result["messageId"];
  return typeof messageId === "string" ? messageId : "";
};

export class CloudflareEmailAdapter implements EmailSender {
  constructor(private readonly options: CloudflareEmailOptions) {}

  async send(message: EmailMessage): Promise<{ readonly messageId: string }> {
    if (!isEmailBinding(this.options.binding)) {
      throw new PortError("email", "Email binding is not configured", false);
    }

    const rendered = renderEmail(message);
    try {
      const result = await this.options.binding.send({
        from: this.options.from,
        to: message.to,
        subject: rendered.subject,
        text: rendered.text,
        html: rendered.html
      });
      return { messageId: messageIdOf(result) };
    } catch (error) {
      throw new PortError("email", "Email send failed", true, { cause: error });
    }
  }
}
