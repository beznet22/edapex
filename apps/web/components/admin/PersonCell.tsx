"use client";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

/**
 * One person, as a row in a table and as a card on a phone.
 *
 * The initials are rendered instead of a photo when there is none, and the photo is loaded
 * through `AvatarImage` which already falls back on error — a broken image URL should not
 * leave a hole where a name's anchor belongs.
 */
export function initialsOf(name: string | null): string {
  if (name === null) return "?";
  const parts = name.trim().split(/\s+/).filter((part) => part.length > 0);
  if (parts.length === 0) return "?";
  const first = parts[0]?.[0] ?? "";
  const last = parts.length > 1 ? (parts.at(-1)?.[0] ?? "") : "";
  return `${first}${last}`.toUpperCase();
}

export function PersonCell({
  name,
  secondary,
  photo,
  className
}: {
  readonly name: string | null;
  readonly secondary: string | null;
  readonly photo?: string | null;
  readonly className?: string;
}) {
  return (
    <div className={cn("flex min-w-0 items-center gap-2.5", className)}>
      <Avatar className="size-8 shrink-0">
        {photo === null || photo === undefined ? null : (
          <AvatarImage alt="" src={photo} />
        )}
        <AvatarFallback className="text-[11px] font-semibold">
          {initialsOf(name)}
        </AvatarFallback>
      </Avatar>
      <div className="min-w-0">
        <div className="truncate text-[13px] font-medium leading-5">{name ?? "Unnamed"}</div>
        {secondary === null ? null : (
          <div className="truncate text-[12px] leading-4 text-muted-foreground">{secondary}</div>
        )}
      </div>
    </div>
  );
}

export type PillTone = "claimed" | "unclaimed" | "flagged" | "neutral" | "active" | "inactive";

/**
 * Status pills.
 *
 * The ink tokens (`--warning-ink`, `--destructive-ink`) exist because `--warning` and
 * `--destructive` used as 12px text on their own 10% tint measure 4.35:1 and 4.22:1 — below
 * the 4.5:1 AA floor. These land at 4.91:1 and 5.13:1 against the same tint with the hue
 * unchanged.
 */
const TONE: Readonly<Record<PillTone, { readonly label: string; readonly className: string }>> = {
  claimed: {
    label: "Claimed",
    className: "border-[color-mix(in_oklch,var(--success)_30%,transparent)] bg-[color-mix(in_oklch,var(--success)_10%,transparent)] text-[var(--success-ink)]"
  },
  unclaimed: {
    label: "Unclaimed",
    className: "border-[color-mix(in_oklch,var(--warning)_30%,transparent)] bg-[color-mix(in_oklch,var(--warning)_10%,transparent)] text-[var(--warning-ink)]"
  },
  flagged: {
    label: "Flagged",
    className: "border-[color-mix(in_oklch,var(--destructive)_30%,transparent)] bg-[color-mix(in_oklch,var(--destructive)_10%,transparent)] text-[var(--destructive-ink)]"
  },
  neutral: { label: "No account", className: "border-border bg-muted text-muted-foreground" },
  active: {
    label: "Active",
    className: "border-[color-mix(in_oklch,var(--success)_30%,transparent)] bg-[color-mix(in_oklch,var(--success)_10%,transparent)] text-[var(--success-ink)]"
  },
  inactive: { label: "Inactive", className: "border-border bg-muted text-muted-foreground" }
};

export function StatusPill({
  tone,
  label,
  className
}: {
  readonly tone: PillTone;
  readonly label?: string;
  readonly className?: string;
}) {
  const style = TONE[tone];
  return (
    <Badge
      className={cn(
        "rounded-full border px-2 py-0.5 text-[11px] font-medium leading-4",
        style.className,
        className
      )}
      variant="outline"
    >
      {label ?? style.label}
    </Badge>
  );
}

/**
 * The contact line under a name.
 *
 * Email is the useful identifier; the phone number only appears where there is room for two
 * lines, which is why it is a separate element rather than part of a string.
 */
export function ContactCell({
  email,
  phone,
  className
}: {
  readonly email: string | null;
  readonly phone: string | null;
  readonly className?: string;
}) {
  return (
    <div className={cn("min-w-0", className)}>
      <div className="truncate text-[13px] leading-5 text-foreground">{email ?? "—"}</div>
      {phone === null || phone.length === 0 ? null : (
        <div className="truncate text-[12px] leading-4 text-muted-foreground">{phone}</div>
      )}
    </div>
  );
}
