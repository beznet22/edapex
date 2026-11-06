export type EmailTemplate = "result" | "transcript";

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
