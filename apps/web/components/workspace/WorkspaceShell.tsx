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

import { Button } from "@/components/ui/button";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarRail,
  SidebarTrigger,
  useSidebar
} from "@/components/ui/sidebar";
import { Titlebar } from "@/components/desktop/Titlebar";
import { RuntimeStatus } from "@/components/openduet/runtime-status";
import { ThemeToggle } from "@/components/workspace/ThemeToggle";
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
  /** Server-resolved so the rail is the right width on first paint. */
  readonly sidebarOpen: boolean;
  readonly setSidebarOpen: (open: boolean) => void;
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

/**
 * The rail.
 *
 * shadcn's `collapsible="icon"` rather than a hand-rolled 76px column: the primitives
 * give a tooltip on collapse, a keyboard-reachable trigger, and a sheet drawer below the
 * breakpoint — three things the previous rail did not have. Icons + labels when expanded,
 * icons + tooltips when collapsed, and the state persists in a cookie so it is right on
 * first paint.
 */
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
    <Sidebar collapsible="icon">
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton asChild size="lg" tooltip="EdApex workspace">
              <Link href="/workspace">
                <span className="flex size-8 shrink-0 items-center justify-center rounded-[var(--radius-sm)] bg-primary text-sm font-black text-primary-foreground">
                  E
                </span>
                <span className="grid min-w-0 text-left leading-tight">
                  <span className="truncate text-sm font-semibold tracking-tight">EdApex</span>
                  <span className="truncate text-[11px] text-muted-foreground">
                    {manifest.role}
                  </span>
                </span>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Workspace</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {RAIL_ITEMS.map((item) => {
                const active = item.id === surface;
                const Icon = item.icon;
                const badge = item.id === "tasks" ? waitingCount : 0;
                return (
                  <SidebarMenuItem key={item.id}>
                    <SidebarMenuButton
                      asChild
                      isActive={active}
                      tooltip={item.label}
                    >
                      <Link
                        aria-current={active ? "page" : undefined}
                        href={item.href}
                      >
                        <Icon aria-hidden="true" />
                        <span>{item.label}</span>
                      </Link>
                    </SidebarMenuButton>
                    {badge > 0 ? (
                      <SidebarMenuBadge>{badge}</SidebarMenuBadge>
                    ) : null}
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter>
        <SidebarMenu>
          {manifest.role === "admin" ? (
            <SidebarMenuItem>
              <SidebarMenuButton asChild tooltip="Admin">
                <Link href="/admin/claim-links">
                  <Settings2 aria-hidden="true" />
                  <span>Admin</span>
                </Link>
              </SidebarMenuButton>
            </SidebarMenuItem>
          ) : null}
        </SidebarMenu>
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
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
  sidebarOpen,
  setSidebarOpen,
  children
}: WorkspaceShellProps) {
  return (
    <div
      className="flex h-dvh w-full flex-col overflow-hidden bg-background text-foreground"
      data-surface={surface}
      data-workspace-shell="true"
    >
      {/* Renders null in a browser tab: the browser draws its own chrome. */}
      <Titlebar title="EdApex Work" />
      <SidebarProvider
        // `open`, not `defaultOpen`. The provider treats `open` as controlled and
        // `defaultOpen` as a one-time initial value, so passing only the latter made the
        // rail ignore every toggle: the cookie changed while the UI did not.
        onOpenChange={setSidebarOpen}
        open={sidebarOpen}
        // The provider hardcodes its width constants, so ours are re-stated here rather
        // than winning through the theme layer.
        style={
          {
            "--sidebar-width": "15rem",
            "--sidebar-width-icon": "4.5rem",
            minHeight: 0
          } as React.CSSProperties
        }
      >
        <DesktopRail manifest={manifest} surface={surface} waitingCount={waitingCount} />
        <SidebarInset className="min-h-0 overflow-hidden">
          <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <header className="safe-top shrink-0 px-3 pb-2.5 shadow-[0_1px_0_var(--border)] lg:px-6 lg:pb-3 lg:pt-4">
          <div className="mx-auto flex w-full max-w-[430px] items-center justify-between gap-2 lg:max-w-none">
            <div className="flex min-w-0 items-center gap-2 lg:hidden">
              <SidebarTrigger aria-label="Open navigation" className="-ml-1 shrink-0" />
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
            {/*
              No brand repeat on desktop: the rail already shows it, and the two
              together read as the title twice. Only the surface name and the person
              belong here.
            */}
            <div className="hidden min-w-0 items-center gap-2 text-sm lg:flex">
              <SidebarTrigger aria-label="Toggle navigation" className="-ml-1 shrink-0" />
              <span className="font-semibold tracking-tight">{SURFACE_LABEL[surface]}</span>
              <span className="ml-1 truncate text-[11px] text-muted-foreground">{userName}</span>
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
              <ThemeToggle className="hidden sm:flex" />
              <RuntimeStatus connected={runtime.connected} state={runtime.state} />
              {!runtime.connected && onConnectRuntime !== undefined ? (
                <Button
                  aria-label="Open model setup"
                  className="h-9 border-primary/35 bg-primary/10 px-2.5 text-[11px] font-semibold text-primary hover:bg-primary/15"
                  onClick={onConnectRuntime}
                  size="sm"
                  type="button"
                  variant="outline"
                >
                  <KeyRound aria-hidden="true" className="size-3.5" />
                  Set up
                </Button>
              ) : null}
              {onOpenArtifact !== undefined ? (
                <Button
                  aria-label="New document"
                  className="text-muted-foreground hover:bg-muted hover:text-foreground"
                  onClick={onOpenArtifact}
                  size="icon-sm"
                  type="button"
                  variant="ghost"
                >
                  <FilePlus2 aria-hidden="true" className="size-4" />
                </Button>
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
          <div className="mx-auto flex min-h-0 w-full max-w-[430px] flex-1 flex-col lg:max-w-none">
            {children}
          </div>
          <div className="lg:hidden">
            <TabBar current={surface} waitingCount={waitingCount} />
          </div>
        </main>
          </div>
        </SidebarInset>
      </SidebarProvider>
    </div>
  );
}
