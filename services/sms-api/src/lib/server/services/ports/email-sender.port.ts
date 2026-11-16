export type EmailTemplate = "result" | "transcript" | "magic_link";

export type EmailTemplateData = Readonly<
  Record<string, string | number | boolean | null>
>;

export interface EmailMessage {
  readonly template: EmailTemplate;
  readonly to: string;
  readonly data: EmailTemplateData;
}

export interface EmailSender {
  send(message: EmailMessage): Promise<{ readonly messageId: string }>;
  /**
   * True only for the local console transport.
   *
   * The API returns the sign-in URL in its response when this is set, so a developer can
   * click it without digging through a terminal. That must be impossible in production: a
   * token in a response body is an account-takeover primitive, and `202` exists precisely so
   * the endpoint never discloses whether an address is provisioned.
   *
   * Optional, so every existing adapter and test fake stays valid — a missing value is
   * "not the console transport", which fails closed.
   */
  readonly console?: boolean;
}

/** The subset of the Workers `send_email` binding this adapter uses. */
export interface EmailBindingLike {
  send(message: {
    readonly from: string;
    readonly to: string;
    readonly subject: string;
    readonly text: string;
    readonly html: string;
  }): Promise<unknown>;
}
