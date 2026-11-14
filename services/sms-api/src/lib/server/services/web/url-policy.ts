import { ValidationError } from "../errors";

/**
 * `as const` rather than a module-scope `Set`: the service rule engine forbids a
 * module-scope Map/Set, because a mutable collection shared across a request is a
 * place state can leak between tenants. A frozen tuple has no such surface and
 * the list is small enough that `includes` is not a cost worth optimizing.
 */
const BLOCKED_HOSTNAMES: readonly string[] = [
  "localhost",
  "localhost.localdomain",
  "metadata",
  "metadata.google.internal",
  "instance-data",
  "169.254.169.254"
];

const isPrivateIpv4 = (hostname: string): boolean => {
  const parts = hostname.split(".");
  if (parts.length !== 4) return false;
  const octets = parts.map((part) => Number(part));
  if (octets.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) {
    return false;
  }
  const [first, second] = octets;
  if (first === undefined || second === undefined) return false;
  return (
    first === 0 ||
    first === 10 ||
    (first === 100 && second >= 64 && second <= 127) ||
    first === 127 ||
    (first === 169 && second === 254) ||
    (first === 172 && second >= 16 && second <= 31) ||
    (first === 192 && second === 168) ||
    (first === 198 && (second === 18 || second === 19)) ||
    first >= 224
  );
};

const isPrivateIpv6 = (hostname: string): boolean => {
  const value = hostname.replace(/^\[|\]$/g, "").toLowerCase();
  return (
    value === "::1" ||
    value === "::" ||
    value.startsWith("fc") ||
    value.startsWith("fd") ||
    value.startsWith("fe8") ||
    value.startsWith("fe9") ||
    value.startsWith("fea") ||
    value.startsWith("feb") ||
    value.startsWith("ff") ||
    value.startsWith("::ffff:127.") ||
    value.startsWith("::ffff:10.") ||
    value.startsWith("::ffff:192.168.")
  );
};

export function assertPublicHttpUrl(value: string): string {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new ValidationError("A valid URL is required", "url");
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new ValidationError("Only HTTP(S) URLs are allowed", "url");
  }
  if (url.username.length > 0 || url.password.length > 0) {
    throw new ValidationError("Credentials in URLs are not allowed", "url");
  }
  const hostname = url.hostname.toLowerCase();
  if (
    BLOCKED_HOSTNAMES.includes(hostname) ||
    hostname.endsWith(".localhost") ||
    hostname.endsWith(".local") ||
    hostname.endsWith(".internal") ||
    isPrivateIpv4(hostname) ||
    isPrivateIpv6(hostname)
  ) {
    throw new ValidationError("Private or local URLs are not allowed", "url");
  }
  return url.toString();
}
