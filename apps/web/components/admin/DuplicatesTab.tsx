"use client";

import { useCallback, useEffect, useState } from "react";
import { AlertCircle, Download, Loader2, Merge, ShieldAlert, UserCheck } from "lucide-react";

import { Button } from "@/components/ui/button";
import { StatusPill } from "@/components/admin/PersonCell";
import { Modal } from "@/components/ui/modal";
import {
  duplicateExportUrl,
  flagAccount,
  loadDuplicates,
  mergeAccounts,
  reassignEmail,
  type DuplicateAccount,
  type DuplicateGroup
} from "@/lib/admin-api";

/**
 * Duplicate accounts: one email, several `users` rows.
 *
 * This is the only surface that shows `sessionCount`, `providers` and `lastLoginAt`, and they
 * are the reason it exists: when two accounts share an address, the one with live sessions and
 * a Google identity is almost always the real one, and deciding without that evidence means
 * guessing which history to keep.
 *
 * All three actions are irreversible in practice, so each states what it will do before it
 * does it.
 */
export function DuplicatesTab({ academicId }: { readonly academicId: number }) {
  const [groups, setGroups] = useState<readonly DuplicateGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [merging, setMerging] = useState<DuplicateGroup | null>(null);
  const [reassigning, setReassigning] = useState<DuplicateGroup | null>(null);

  const refresh = useCallback(async (): Promise<void> => {
    if (academicId === 0) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError("");
    try {
      setGroups(await loadDuplicates(academicId));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not load duplicates");
    } finally {
      setLoading(false);
    }
  }, [academicId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const flag = async (account: DuplicateAccount): Promise<void> => {
    setBusy(true);
    setError("");
    try {
      await flagAccount(academicId, account.userId);
      await refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not flag the account");
    } finally {
      setBusy(false);
    }
  };

  if (loading && groups.length === 0) {
    return (
      <div
        aria-busy="true"
        aria-label="Loading duplicates"
        className="space-y-2.5"
      >
        {[0, 1].map((index) => (
          <div className="rounded-[var(--radius-lg)] border border-border bg-card p-4" key={index}>
            <div className="skeleton-shimmer h-3 w-56 rounded" />
            <div className="skeleton-shimmer mt-3 h-3 w-full rounded" />
            <div className="skeleton-shimmer mt-2 h-3 w-2/3 rounded" />
          </div>
        ))}
      </div>
    );
  }

  if (groups.length === 0) {
    return (
      <div className="rounded-[var(--radius-lg)] border border-border bg-card px-4 py-14 text-center">
        <p className="text-[13px] font-medium">No duplicate emails</p>
        <p className="mx-auto mt-1 max-w-sm text-[13px] leading-6 text-muted-foreground">
          Every email address on record belongs to exactly one account.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-2.5">
      <div className="flex items-center justify-between">
        <p className="text-[13px] text-muted-foreground">
          {groups.length} address{groups.length === 1 ? "" : "es"} with more than one account
        </p>
        <Button asChild={false} size="sm" variant="outline">
          <a href={duplicateExportUrl(academicId)} rel="noreferrer" target="_blank">
            <Download aria-hidden="true" />
            Export CSV
          </a>
        </Button>
      </div>

      {error.length > 0 ? (
        <p className="flex items-center gap-2 rounded-[var(--radius-sm)] bg-destructive/10 px-3 py-2.5 text-[13px] text-[var(--destructive-ink)]">
          <AlertCircle aria-hidden="true" className="size-4 shrink-0" />
          {error}
        </p>
      ) : null}

      {groups.map((group) => (
        <section
          className="rounded-[var(--radius-lg)] border border-border bg-card p-4"
          key={group.email}
        >
          <header className="flex flex-wrap items-center justify-between gap-2">
            <div className="min-w-0">
              <h3 className="truncate text-[13px] font-medium">{group.email}</h3>
              <p className="mt-0.5 text-[12px] text-muted-foreground">
                {group.accounts.length} accounts
              </p>
            </div>
            <StatusPill
              label={group.resolution}
              tone={
                group.resolution === "resolved"
                  ? "claimed"
                  : group.resolution === "flagged"
                    ? "flagged"
                    : "unclaimed"
              }
            />
          </header>

          <ul className="mt-3 divide-y divide-border">
            {group.accounts.map((account) => (
              <li className="flex flex-wrap items-center gap-x-4 gap-y-1 py-2.5" key={account.userId}>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[13px] font-medium">
                    {account.fullName ?? "Unnamed"}
                  </div>
                  <div className="mt-0.5 flex flex-wrap items-center gap-x-3 text-[12px] text-muted-foreground">
                    <span>#{account.userId}</span>
                    <span>{account.persona}</span>
                    <span>
                      {account.sessionCount} session{account.sessionCount === 1 ? "" : "s"}
                    </span>
                    <span>
                      {account.providers.length === 0 ? "no providers" : account.providers.join(", ")}
                    </span>
                    <span>
                      {account.lastLoginAt === null ? "never signed in" : lastSeen(account.lastLoginAt)}
                    </span>
                  </div>
                </div>
                <StatusPill
                  label={account.claimStatus ?? "no account"}
                  tone={
                    account.claimStatus === "flagged"
                      ? "flagged"
                      : account.claimStatus === "claimed"
                        ? "claimed"
                        : "unclaimed"
                  }
                />
                <Button
                  disabled={busy || account.claimStatus === "flagged"}
                  onClick={() => void flag(account)}
                  size="sm"
                  type="button"
                  variant="ghost"
                >
                  <ShieldAlert aria-hidden="true" />
                  Flag
                </Button>
              </li>
            ))}
          </ul>

          <div className="mt-3 flex flex-wrap gap-2 border-t border-border pt-3">
            <Button onClick={() => setMerging(group)} size="sm" type="button" variant="outline">
              <Merge aria-hidden="true" />
              Merge accounts
            </Button>
            <Button onClick={() => setReassigning(group)} size="sm" type="button" variant="outline">
              <UserCheck aria-hidden="true" />
              Move email
            </Button>
          </div>
        </section>
      ))}

      <MergeModal
        academicId={academicId}
        group={merging}
        onClose={() => setMerging(null)}
        onDone={() => {
          setMerging(null);
          void refresh();
        }}
      />

      <ReassignModal
        academicId={academicId}
        group={reassigning}
        onClose={() => setReassigning(null)}
        onDone={() => {
          setReassigning(null);
          void refresh();
        }}
      />
    </div>
  );
}

/**
 * Merge.
 *
 * `keepUserId` is not a preference — the service deletes the others, so the choice must be
 * made explicitly. The account with the most sessions is preselected because it is almost
 * always the one with the history worth keeping.
 */
function MergeModal({
  group,
  academicId,
  onClose,
  onDone
}: {
  readonly group: DuplicateGroup | null;
  readonly academicId: number;
  readonly onClose: () => void;
  readonly onDone: () => void;
}) {
  const [keep, setKeep] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (group === null) return;
    const busiest = [...group.accounts].sort((a, b) => b.sessionCount - a.sessionCount)[0];
    setKeep(busiest?.userId ?? null);
    setError("");
  }, [group]);

  if (group === null) return null;

  const submit = async (): Promise<void> => {
    if (keep === null || saving) return;
    setSaving(true);
    setError("");
    try {
      await mergeAccounts(academicId, {
        email: group.email,
        keepUserId: keep,
        mergeUserIds: group.accounts.filter((a) => a.userId !== keep).map((a) => a.userId)
      });
      onDone();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not merge");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      description="The other accounts are removed and their links move to the one you keep. This cannot be undone."
      footer={
        <>
          <Button onClick={onClose} type="button" variant="ghost">
            Cancel
          </Button>
          <Button disabled={saving || keep === null} onClick={() => void submit()} type="button">
            {saving ? <Loader2 aria-hidden="true" className="animate-spin" /> : null}
            Merge
          </Button>
        </>
      }
      onClose={onClose}
      open
      title={`Merge ${group.email}`}
      widthClassName="max-w-lg"
    >
      <div className="space-y-3 py-1">
        <p className="text-[13px] leading-6 text-muted-foreground">Keep which account?</p>
        {group.accounts.map((account) => (
          <label
            className="flex cursor-pointer items-center gap-3 rounded-[var(--radius-md)] border border-border px-3 py-2.5 transition-colors hover:bg-muted/40"
            key={account.userId}
          >
            <input
              checked={keep === account.userId}
              className="size-4 accent-[var(--primary)]"
              name="keep"
              onChange={() => setKeep(account.userId)}
              type="radio"
            />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[13px] font-medium">
                {account.fullName ?? "Unnamed"} · #{account.userId}
              </span>
              <span className="block text-[12px] text-muted-foreground">
                {account.sessionCount} sessions · {account.providers.join(", ") || "no providers"}
              </span>
            </span>
          </label>
        ))}
        {error.length > 0 ? (
          <p className="rounded-[var(--radius-sm)] bg-destructive/10 px-3 py-2.5 text-[13px] text-[var(--destructive-ink)]">
            {error}
          </p>
        ) : null}
      </div>
    </Modal>
  );
}

/** Reassign: move the address to one account, leaving the others on their own email. */
function ReassignModal({
  group,
  academicId,
  onClose,
  onDone
}: {
  readonly group: DuplicateGroup | null;
  readonly academicId: number;
  readonly onClose: () => void;
  readonly onDone: () => void;
}) {
  const [target, setTarget] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (group === null) return;
    setTarget(group.accounts[0]?.userId ?? null);
    setError("");
  }, [group]);

  if (group === null) return null;

  const submit = async (): Promise<void> => {
    if (target === null || saving) return;
    setSaving(true);
    setError("");
    try {
      await reassignEmail(academicId, { email: group.email, targetUserId: target });
      onDone();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not reassign");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      description="The address moves to the account you choose. The others keep their own email and stay intact."
      footer={
        <>
          <Button onClick={onClose} type="button" variant="ghost">
            Cancel
          </Button>
          <Button disabled={saving || target === null} onClick={() => void submit()} type="button">
            {saving ? <Loader2 aria-hidden="true" className="animate-spin" /> : null}
            Move address
          </Button>
        </>
      }
      onClose={onClose}
      open
      title={`Move ${group.email}`}
      widthClassName="max-w-lg"
    >
      <div className="space-y-3 py-1">
        {group.accounts.map((account) => (
          <label
            className="flex cursor-pointer items-center gap-3 rounded-[var(--radius-md)] border border-border px-3 py-2.5 transition-colors hover:bg-muted/40"
            key={account.userId}
          >
            <input
              checked={target === account.userId}
              className="size-4 accent-[var(--primary)]"
              name="target"
              onChange={() => setTarget(account.userId)}
              type="radio"
            />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[13px] font-medium">
                {account.fullName ?? "Unnamed"} · #{account.userId}
              </span>
              <span className="block text-[12px] text-muted-foreground">
                {account.persona} · {account.sessionCount} sessions
              </span>
            </span>
          </label>
        ))}
        {error.length > 0 ? (
          <p className="rounded-[var(--radius-sm)] bg-destructive/10 px-3 py-2.5 text-[13px] text-[var(--destructive-ink)]">
            {error}
          </p>
        ) : null}
      </div>
    </Modal>
  );
}

function lastSeen(unix: number): string {
  const seconds = Math.max(0, Math.floor(Date.now() / 1000) - unix);
  if (seconds < 3600) return `${Math.max(1, Math.floor(seconds / 60))}m ago`;
  if (seconds < 86_400) return `${Math.floor(seconds / 3600)}h ago`;
  return `${Math.floor(seconds / 86_400)}d ago`;
}
