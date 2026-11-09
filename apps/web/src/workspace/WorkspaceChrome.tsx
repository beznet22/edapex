import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface WorkspaceSkeletonProps {
  readonly compact?: boolean;
}

export function WorkspaceSkeleton({ compact = false }: WorkspaceSkeletonProps) {
  return (
    <div aria-label="Loading workspace" className="flex h-full flex-col" role="status">
      <div className="flex-1 space-y-5 px-4 py-6">
        <div className="h-7 w-48 animate-pulse rounded-md bg-slate-700/50 motion-reduce:animate-none" />
        <div className="h-20 w-[86%] animate-pulse rounded-[20px] bg-slate-700/35 motion-reduce:animate-none" />
        <div className="ml-auto h-14 w-[62%] animate-pulse rounded-[20px] bg-primary/15 motion-reduce:animate-none" />
        {!compact ? (
          <>
            <div className="h-16 w-[82%] animate-pulse rounded-[20px] bg-slate-700/35 motion-reduce:animate-none" />
            <div className="h-28 w-full animate-pulse rounded-xl bg-slate-700/30 motion-reduce:animate-none" />
          </>
        ) : null}
      </div>
      <div className="border-t border-border p-3">
        <div className="h-12 w-full animate-pulse rounded-xl bg-slate-700/35 motion-reduce:animate-none" />
      </div>
    </div>
  );
}

interface WorkspaceErrorProps {
  readonly message: string;
  readonly onRetry: () => void;
}

export function WorkspaceError({ message, onRetry }: WorkspaceErrorProps) {
  return (
    <div className="flex h-full items-center justify-center px-6">
      <section className="w-full rounded-xl border border-destructive/30 bg-destructive/10 p-5">
        <h2 className="text-base font-semibold">Workspace unavailable</h2>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">{message}</p>
        <Button className="mt-4 min-h-11" onClick={onRetry} type="button">
          Try again
        </Button>
      </section>
    </div>
  );
}

interface WorkspaceGateProps {
  readonly role: string;
  readonly toolCount: number;
  readonly onContinue: () => void;
  readonly disabled?: boolean;
}

export function WorkspaceGate({
  role,
  toolCount,
  onContinue,
  disabled = false
}: WorkspaceGateProps) {
  return (
    <div className="flex h-full items-center justify-center px-6">
      <section className="w-full rounded-xl border border-border bg-card p-6">
        <div className="text-xs font-bold uppercase tracking-[0.16em] text-primary">
          Workspace manifest
        </div>
        <h2 className="mt-2 text-2xl font-semibold tracking-tight">Your tools are ready</h2>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">
          This session is scoped to <strong className="text-foreground">{role}</strong> and{" "}
          {toolCount} tool {toolCount === 1 ? "pack" : "packs"}. The local agent runtime is not
          connected in this build.
        </p>
        <div className="mt-5 grid grid-cols-2 gap-2">
          <div className="rounded-lg border border-border bg-background p-3">
            <div className="text-xs text-muted-foreground">Tools</div>
            <div className="mt-1 text-xl font-semibold">{toolCount}</div>
          </div>
          <div className="rounded-lg border border-border bg-background p-3">
            <div className="text-xs text-muted-foreground">Runtime</div>
            <div className="mt-1 text-sm font-medium text-primary">Preview</div>
          </div>
        </div>
        <Button className="mt-5 min-h-11 w-full" disabled={disabled} onClick={onContinue} type="button">
          Open workspace
        </Button>
        <a
          className="mt-3 block min-h-11 text-center text-sm leading-[2.75rem] text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
          href="/admin/claim-links"
        >
          Open admin claim links
        </a>
      </section>
    </div>
  );
}

export function WorkspaceStatus({
  connected,
  label
}: {
  readonly connected: boolean;
  readonly label: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.12em]",
        connected
          ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-300"
          : "border-border bg-muted/60 text-muted-foreground"
      )}
    >
      <span
        className={cn(
          "size-1.5 rounded-full",
          connected ? "bg-emerald-400" : "bg-muted-foreground"
        )}
      />
      {label}
    </span>
  );
}
