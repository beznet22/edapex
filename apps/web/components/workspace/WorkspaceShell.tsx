"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import {
  FilePlus2,
  KeyRound,
  ListChecks,
  MessageCircle,
  Settings2,
  WandSparkles
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

import type { CapabilityManifest, WorkspaceRuntimeView } from "@edapex/contracts";
import type { CoreHealth } from "@/lib/tauri";

import { RuntimeStatus } from "@/components/openduet/runtime-status";
import { TabBar, type WorkspaceTab } from "@/components/openduet/tab-bar";

interface WorkspaceShellProps {
  readonly manifest: CapabilityManifest;
  readonly userName: string;
  readonly surface: WorkspaceTab;
  readonly runtime: WorkspaceRuntimeView;
  readonly waitingCount?: number;
  readonly coreHealth?: CoreHealth | null;
  readonly devBypass?: boolean;
  readonly onOpenArtifact?: (() => void) | undefined;
  readonly onConnectRuntime?: (() => void) | undefined;
  readonly children: ReactNode;
}

const SURFACE_LABEL: Record<WorkspaceTab, string> = {
  chat: "Chat",
  tasks: "Tasks",
  make: "Make"
};

const RAIL_ITEMS: readonly {
  readonly id: WorkspaceTab;
  readonly href: string;
  readonly label: string;
  readonly icon: LucideIcon;
}[] = [
  { id: "chat", href: "/workspace", label: "Chat", icon: MessageCircle },
  { id: "tasks", href: "/workspace/tasks", label: "Tasks", icon: ListChecks },
  { id: "make", href: "/workspace/make", label: "Make", icon: WandSparkles }
];

function DesktopRail({
  manifest,
  surface,
  waitingCount
}: {
  readonly manifest: CapabilityManifest;
  readonly surface: WorkspaceTab;
  readonly waitingCount: number;
}) {
  return (
    <aside className="hidden w-[72px] shrink-0 flex-col items-center border-r border-border bg-card/25 py-4 lg:flex">
      <Link
        aria-label="EdApex workspace home"
        className="flex size-11 items-center justify-center rounded-xl bg-primary text-sm font-black text-primary-foreground"
        href="/workspace"
      >
        E
      </Link>
      <div className="my-4 h-px w-8 bg-border" />
      <nav aria-label="Primary" className="flex flex-1 flex-col items-center gap-2">
        {RAIL_ITEMS.map((item) => {
          const active = item.id === surface;
          const Icon = item.icon;
          const badge = item.id === "tasks" ? waitingCount : 0;
          return (
            <Link
              aria-current={active ? "page" : undefined}
              aria-label={badge > 0 ? `${item.label}, ${badge} waiting` : item.label}
              className={
                active
                  ? "relative flex size-11 items-center justify-center rounded-xl bg-primary/15 text-primary"
                  : "relative flex size-11 items-center justify-center rounded-xl text-muted-foreground hover:bg-muted hover:text-foreground"
              }
              href={item.href}
              key={item.id}
              title={item.label}
            >
              <Icon aria-hidden="true" className="size-5" strokeWidth={active ? 2.2 : 1.9} />
              {badge > 0 ? (
                <span
                  aria-hidden="true"
                  className="absolute right-1 top-1 grid h-4 min-w-4 place-items-center rounded-full bg-primary px-1 text-[9px] font-bold text-primary-foreground"
                >
                  {badge}
                </span>
              ) : null}
            </Link>
          );
        })}
      </nav>
      {manifest.role === "admin" ? (
        <Link
          aria-label="Open admin claim links"
          className="flex size-11 items-center justify-center rounded-xl text-muted-foreground hover:bg-muted hover:text-foreground"
          href="/admin/claim-links"
          title="Admin"
        >
          <Settings2 aria-hidden="true" className="size-5" />
        </Link>
      ) : null}
    </aside>
  );
}

export function WorkspaceShell({
  manifest,
  userName,
  surface,
  runtime,
  waitingCount = 0,
  coreHealth = null,
  devBypass = false,
  onOpenArtifact,
  onConnectRuntime,
  children
}: WorkspaceShellProps) {
  return (
    <div
      className="flex h-dvh w-full overflow-hidden bg-background text-foreground"
      data-surface={surface}
      data-workspace-shell="true"
    >
      <DesktopRail manifest={manifest} surface={surface} waitingCount={waitingCount} />
      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <header className="safe-top shrink-0 border-b border-border px-3 pb-2.5 lg:px-6 lg:pb-3 lg:pt-4">
          <div className="mx-auto flex w-full max-w-[430px] items-center justify-between gap-2 lg:max-w-none">
            <div className="flex min-w-0 items-center gap-2 lg:hidden">
              <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-primary text-sm font-black text-primary-foreground">
                E
              </span>
              <div className="min-w-0">
                <div className="truncate text-sm font-semibold tracking-tight">EdApex Work</div>
                <div className="truncate text-[11px] text-muted-foreground">
                  {userName} · {manifest.role}
                </div>
              </div>
            </div>
            <div className="hidden min-w-0 items-center gap-2 text-sm lg:flex">
              <span className="font-semibold tracking-tight">EdApex Work</span>
              <span className="text-muted-foreground">/</span>
              <span className="text-muted-foreground">{SURFACE_LABEL[surface]}</span>
              <span className="ml-2 truncate text-[11px] text-muted-foreground">
                {userName}
              </span>
            </div>
            <div className="flex items-center gap-1">
              {devBypass ? (
                <span
                  className="rounded-full border border-primary/30 bg-primary/10 px-2 py-1 text-[10px] font-semibold text-primary"
                  title="Development auth bypass"
                >
                  Dev
                </span>
              ) : null}
              {coreHealth !== null ? (
                <span
                  className="hidden rounded-full border border-border px-2 py-1 text-[10px] text-muted-foreground sm:inline"
                  title="Local Rust core"
                >
                  Core {coreHealth.core_version}
                </span>
              ) : null}
              <RuntimeStatus connected={runtime.connected} state={runtime.state} />
              {!runtime.connected && onConnectRuntime !== undefined ? (
                <button
                  aria-label="Connect xcodex runtime"
                  className="flex min-h-11 items-center gap-1.5 rounded-xl border border-primary/35 bg-primary/10 px-2.5 text-[11px] font-semibold text-primary hover:bg-primary/15"
                  onClick={onConnectRuntime}
                  type="button"
                >
                  <KeyRound aria-hidden="true" className="size-3.5" />
                  Connect
                </button>
              ) : null}
              {onOpenArtifact !== undefined ? (
                <button
                  aria-label="New document"
                  className="flex size-11 items-center justify-center rounded-xl text-muted-foreground hover:bg-muted hover:text-foreground"
                  onClick={onOpenArtifact}
                  type="button"
                >
                  <FilePlus2 aria-hidden="true" className="size-4" />
                </button>
              ) : null}
              {manifest.role === "admin" ? (
                <Link
                  aria-label="Open admin claim links"
                  className="flex size-11 items-center justify-center rounded-xl text-muted-foreground hover:bg-muted hover:text-foreground lg:hidden"
                  href="/admin/claim-links"
                >
                  <Settings2 aria-hidden="true" className="size-4" />
                </Link>
              ) : null}
            </div>
          </div>
        </header>

        <main className="relative flex min-h-0 flex-1 flex-col overflow-hidden pb-[92px] lg:pb-0">
          <div className="mx-auto flex min-h-0 w-full max-w-[430px] flex-1 flex-col lg:max-w-[880px]">
            {children}
          </div>
          <div className="lg:hidden">
            <TabBar current={surface} waitingCount={waitingCount} />
          </div>
        </main>
      </div>
    </div>
  );
}
