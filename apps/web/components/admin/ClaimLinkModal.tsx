"use client";

import { useEffect, useState } from "react";
import { AlertCircle, Check, Copy, Link2, Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { createClaimLink, type CreatedClaimLink } from "@/lib/admin-api";

/**
 * Minting a claim link.
 *
 * The raw token exists in exactly one place — this response — and is never stored, listed or
 * logged. That is why the link is shown once with a copy button and an explicit "this cannot
 * be shown again" line, rather than being retrievable later: anyone who can re-read the token
 * can claim the account.
 *
 * The expiry counts down. A 72-hour TTL is abstract; "expires in 71h 58m" tells the person
 * whether they can hand it over tomorrow morning.
 */
/**
 * Anything a claim link can be issued against.
 *
 * A structural subset rather than `DirectoryItem`: staff rows come from `/admin/staff` and
 * carry `id` where the directory carries `subjectId`, and a claim link needs only four facts.
 * Taking the whole directory row would have forced the staff table to fake one.
 */
export interface ClaimSubject {
  readonly subjectType: "staff" | "parent";
  readonly subjectId: number;
  readonly fullName: string | null;
  readonly email: string | null;
  readonly persona: "staff" | "parent";
  readonly userId: number | null;
}

export function ClaimLinkModal({
  item,
  academicId,
  onClose
}: {
  readonly item: ClaimSubject | null;
  readonly academicId: number;
  readonly onClose: () => void;
}) {
  const [link, setLink] = useState<CreatedClaimLink | null>(null);
  const [creating, setCreating] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (item === null) return;
    setLink(null);
    setCopied(false);
    setError("");
  }, [item]);

  if (item === null) return null;

  const create = async (): Promise<void> => {
    if (creating) return;
    setCreating(true);
    setError("");
    try {
      setLink(
        await createClaimLink(academicId, {
          subjectType: item.subjectType,
          subjectId: item.subjectId
        })
      );
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not create the link");
    } finally {
      setCreating(false);
    }
  };

  const copy = async (url: string): Promise<void> => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      // Briefly, so the button can be pressed again if the clipboard was blocked.
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setError("Could not copy. Select the link and copy it manually.");
    }
  };

  return (
    <Modal
      description="They claim their account by opening this link once. It expires, and cannot be shown again."
      footer={
        link === null ? (
          <>
            <Button onClick={onClose} type="button" variant="ghost">
              Cancel
            </Button>
            <Button disabled={creating} onClick={() => void create()} type="button">
              {creating ? (
                <Loader2 aria-hidden="true" className="animate-spin" />
              ) : (
                <Link2 aria-hidden="true" />
              )}
              Create link
            </Button>
          </>
        ) : (
          <Button onClick={onClose} type="button">
            Done
          </Button>
        )
      }
      onClose={onClose}
      open
      title={`Claim link for ${item.fullName ?? "this person"}`}
      widthClassName="max-w-lg"
    >
      <div className="space-y-4 py-1">
        <div className="rounded-[var(--radius-md)] border border-border bg-muted/40 px-3 py-2.5">
          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-[13px]">
            <dt className="text-muted-foreground">Email</dt>
            <dd className="truncate">{item.email ?? "— none on record —"}</dd>
            <dt className="text-muted-foreground">Type</dt>
            <dd className="capitalize">{item.persona}</dd>
            <dt className="text-muted-foreground">Account</dt>
            <dd>{item.userId === null ? "Not yet provisioned" : "Provisioned"}</dd>
          </dl>
        </div>

        {item.email === null ? (
          <p className="flex items-start gap-2 rounded-[var(--radius-sm)] bg-[var(--warning)]/10 px-3 py-2.5 text-[13px] text-[var(--warning-ink)]">
            <AlertCircle aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
            This record has no email address. A claim link needs one — add an email first.
          </p>
        ) : null}

        {link === null ? (
          <p className="text-[13px] leading-6 text-muted-foreground">
            The link is valid for 72 hours and can be claimed by whoever opens it first. Send
            it directly to the person; it is not an announcement.
          </p>
        ) : (
          <>
            <div>
              <p className="text-[12px] font-medium uppercase tracking-[0.06em] text-muted-foreground">
                Copy this now
              </p>
              <code className="mt-1.5 block break-all rounded-[var(--radius-md)] border border-primary/30 bg-primary/5 px-3 py-2.5 font-mono text-[12px] leading-5">
                {link.url}
              </code>
            </div>
            <div className="flex items-center gap-2">
              <Button
                className="flex-1"
                onClick={() => void copy(link.url)}
                type="button"
                variant="outline"
              >
                {copied ? (
                  <Check aria-hidden="true" className="text-[var(--success-ink)]" />
                ) : (
                  <Copy aria-hidden="true" />
                )}
                {copied ? "Copied" : "Copy link"}
              </Button>
              <span className="text-[12px] text-muted-foreground">{expiryOf(link.expiresAt)}</span>
            </div>
            <p className="text-[12px] leading-5 text-muted-foreground">
              The raw token is not stored and cannot be shown again. If it is lost, revoke it
              and create a new one.
            </p>
          </>
        )}

        {error.length > 0 ? (
          <p className="flex items-center gap-2 rounded-[var(--radius-sm)] bg-destructive/10 px-3 py-2.5 text-[13px] text-[var(--destructive-ink)]">
            <AlertCircle aria-hidden="true" className="size-4 shrink-0" />
            {error}
          </p>
        ) : null}
      </div>
    </Modal>
  );
}

/** "expires in 71h 58m" — an absolute timestamp in the future is harder to judge. */
function expiryOf(expiresAt: number): string {
  const remaining = Math.max(0, expiresAt - Math.floor(Date.now() / 1000));
  const hours = Math.floor(remaining / 3600);
  const minutes = Math.floor((remaining % 3600) / 60);
  if (remaining <= 0) return "expired";
  return `expires in ${hours}h ${minutes}m`;
}
