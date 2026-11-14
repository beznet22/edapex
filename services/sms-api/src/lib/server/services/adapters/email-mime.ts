export interface RenderMimeOptions {
  readonly from: string;
  readonly to: string;
  readonly subject: string;
  readonly html: string;
  readonly text?: string | undefined;
  readonly displayName?: string | undefined;
}

const CRLF = "\r\n";
const BOUNDARY = "edapex-mail-boundary-v1";

const toBase64 = (value: string): string => {
  const bytes = new TextEncoder().encode(value);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
};

const toBase64Url = (value: string): string =>
  toBase64(value).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/u, "");

const wrap76 = (base64: string): string => {
  const lines: string[] = [];
  for (let index = 0; index < base64.length; index += 76) {
    lines.push(base64.slice(index, index + 76));
  }
  return lines.join(CRLF);
};

const encodeHeader = (value: string): string =>
  /^[\x20-\x7E]*$/u.test(value) ? value : `=?UTF-8?B?${toBase64(value)}?=`;

const quotedDisplayName = (value: string): string => {
  if (!/^[\x20-\x7E]*$/u.test(value)) return encodeHeader(value);
  return `"${value.replace(/([\\"])/gu, "\\$1")}"`;
};

const encodePart = (contentType: string, body: string): string =>
  [
    `Content-Type: ${contentType}; charset=utf-8`,
    "Content-Transfer-Encoding: base64",
    "",
    wrap76(toBase64(body))
  ].join(CRLF);

/** RFC 2822 multipart/alternative MIME for the Gmail raw-message API. */
export function renderMime(options: RenderMimeOptions): string {
  const headers = [
    `From: ${quotedDisplayName(options.displayName ?? "EdApex")} <${options.from}>`,
    `To: ${options.to}`,
    `Subject: ${encodeHeader(options.subject)}`,
    "MIME-Version: 1.0",
    `Content-Type: multipart/alternative; boundary=${BOUNDARY}`
  ];

  if (options.text === undefined) {
    return [
      headers.join(CRLF),
      "",
      encodePart("text/html", options.html),
      ""
    ].join(CRLF);
  }

  return [
    headers.join(CRLF),
    "",
    `--${BOUNDARY}`,
    encodePart("text/plain", options.text),
    `--${BOUNDARY}`,
    encodePart("text/html", options.html),
    `--${BOUNDARY}--`,
    ""
  ].join(CRLF);
}

export const toGmailRaw = (mime: string): string => toBase64Url(mime);
