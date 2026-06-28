import nodemailer from "nodemailer";

export type SMTPResult = { success: boolean; message: string; messageId?: string };
type SMTPAuth = { user: string; pass: string };
type Recipient = string | string[];

/**
 * Build a nodemailer transporter from raw host/port/secure/auth values.
 *
 * Single source of truth for the SMTP transport configuration — both
 * `SMTPClient.testConnection` and `SMTPClient.send` route through this
 * helper so any future change (TLS options, pool size, debug logging)
 * is applied uniformly.
 */
function createTransporter(
  host: string,
  port: number,
  secure: boolean,
  auth: SMTPAuth | undefined,
): nodemailer.Transporter {
  return nodemailer.createTransport({
    host,
    port,
    secure: port === 465 || secure,
    auth: auth
      ? {
          user: auth.user,
          pass: auth.pass,
        }
      : undefined,
  });
}

export type SMTPMessage = {
  from: string;
  to: Recipient;
  cc?: Recipient;
  bcc?: Recipient;
  subject: string;
  text: string;
  html: string;
};

export type SMTPOptions = {
  host?: string;
  port?: number;
  secure?: boolean;
  auth: SMTPAuth;
};

class SMTPError extends Error {
  constructor(message: string, public code?: string) {
    super(message);
    this.name = "SMTPError";
  }
}

export class SMTPClient {
  #host: string = "localhost";
  #port: number = 25;
  #secure: boolean = false;
  #auth?: SMTPAuth;
  #from: string = "";
  #to: Recipient = [];
  #cc?: Recipient;
  #bcc?: Recipient;
  #subject: string = "";
  #text: string = "";
  #html: string = "";

  constructor(options?: SMTPOptions) {
    if (options) {
      this.host(options.host || "localhost");
      this.port(options.port || 25);
      this.secure(options.secure || options.port === 465); // Set secure based on port if not explicitly set
      this.auth(options.auth);
    }
  }

  async testConnection(): Promise<SMTPResult> {
    try {
      const transporter = createTransporter(this.#host, this.#port, this.#secure, this.#auth);
      await transporter.verify();
      return { success: true, message: "Connection successful" };
    } catch (error) {
      return { success: false, message: (error as Error).message };
    }
  }

  host(host: string): this {
    this.#host = host;
    return this;
  }

  port(port: number): this {
    this.#port = port;
    return this;
  }

  secure(secure = true): this {
    this.#secure = secure;
    return this;
  }

  auth(auth: SMTPAuth): this {
    this.#auth = auth;
    return this;
  }

  from(email: string): this {
    this.#from = email;
    return this;
  }

  to(email: Recipient): this {
    this.#to = email;
    return this;
  }

  cc(email: Recipient): this {
    this.#cc = email;
    return this;
  }

  bcc(email: Recipient): this {
    this.#bcc = email;
    return this;
  }

  subject(subject: string): this {
    this.#subject = subject;
    return this;
  }

  text(text: string): this {
    this.#text = text;
    return this;
  }

  html(html: string): this {
    this.#html = html;
    return this;
  }

  async send(): Promise<SMTPResult> {
    try {
      if (!this.#from) throw new SMTPError("Missing sender address");
      if (!this.#to || (Array.isArray(this.#to) && this.#to.length === 0))
        throw new SMTPError("No recipients specified");

      const transporter = createTransporter(this.#host, this.#port, this.#secure, this.#auth);

      // Prepare mail options
      const mailOptions: any = {
        from: this.#from,
        to: this.#to,
        subject: this.#subject,
        text: this.#text,
        html: this.#html,
      };

      // Add cc and bcc if present
      if (this.#cc) mailOptions.cc = this.#cc;
      if (this.#bcc) mailOptions.bcc = this.#bcc;

      // Send the email
      const info = await transporter.sendMail(mailOptions);

      return {
        success: true,
        message: "Email sent successfully",
        messageId: info.messageId,
      };
    } catch (error) {
      return { success: false, message: (error as Error).message };
    }
  }

  async sendMessage(message: SMTPMessage): Promise<SMTPResult> {
    this.from(message.from).to(message.to).subject(message.subject).text(message.text).html(message.html);
    if (message.cc) this.cc(message.cc);
    if (message.bcc) this.bcc(message.bcc);
    return await this.send();
  }
}
