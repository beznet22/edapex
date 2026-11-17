"use client";

import { Mail, Phone } from "lucide-react";

import { Avatar, AvatarFallback, AvatarImage } from "@edapex/ui/components/avatar";
import { Badge } from "@edapex/ui/components/badge";
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

/**
 * A stable hue per person, so two people whose initials collide are still distinct.
 *
 * Derived from the name rather than stored: it must survive a re-render, and a colour column
 * on `users` for a cosmetic hint would be a schema change for nothing.
 *
 * The lightness is fixed and the chroma is low — this is a tint behind an initial, not a
 * signal, and a directory of saturated avatars competes with the status pills that do carry
 * meaning.
 */
function hueOf(name: string | null): number {
  const text = name ?? "?";
  let hash = 0;
  for (let index = 0; index < text.length; index += 1) {
    hash = (hash * 31 + text.charCodeAt(index)) % 360;
  }
  return hash;
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
        <AvatarFallback
          className="text-[11px] font-semibold text-foreground/80"
          style={{
            backgroundColor: `oklch(0.93 0.045 ${hueOf(name)})`
          }}
        >
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

/**
 * A status pill.
 *
 * A mapping from domain state to a Badge variant, nothing more. The colours and their
 * contrast live in `components/ui/badge.tsx` so six call sites cannot each invent their own
 * `bg-*` / `text-*` pair — which is exactly how "yellow on yellow" reaches production.
 */
export type PillTone = "claimed" | "unclaimed" | "flagged" | "neutral" | "active" | "inactive";

const TONE: Readonly<{
  [K in PillTone]: { readonly label: string; readonly variant: "success" | "warning" | "destructive" | "neutral" | "outline" };
}> = {
  claimed: { label: "Claimed", variant: "success" },
  unclaimed: { label: "Unclaimed", variant: "warning" },
  flagged: { label: "Flagged", variant: "destructive" },
  neutral: { label: "No account", variant: "neutral" },
  active: { label: "Active", variant: "success" },
  inactive: { label: "Inactive", variant: "neutral" }
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
    <Badge className={className} variant={style.variant}>
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
    <div className={cn("min-w-0 space-y-0.5", className)}>
      <div className="flex items-center gap-1.5">
        <Mail aria-hidden="true" className="size-3 shrink-0 text-muted-foreground/70" />
        <span className="truncate text-[13px] leading-5 text-foreground">{email ?? "—"}</span>
      </div>
      {phone === null || phone.length === 0 ? null : (
        <div className="flex items-center gap-1.5">
          <Phone aria-hidden="true" className="size-3 shrink-0 text-muted-foreground/70" />
          <span className="truncate text-[12px] leading-4 text-muted-foreground">{phone}</span>
        </div>
      )}
    </div>
  );
}
