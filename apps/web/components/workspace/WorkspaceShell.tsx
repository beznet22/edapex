"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { FilePlus2, PanelLeft, Search } from "lucide-react";

import type { CapabilityManifest, WorkspaceRuntimeView } from "@edapex/contracts";
import type { CoreHealth } from "@/lib/tauri";

import { Button } from "@/components/ui/button";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { Separator } from "@/components/ui/separator";
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
import { SidebarNav } from "@/components/workspace/SidebarNav";
import { SidebarUser } from "@/components/workspace/SidebarUser";
import { ThemeToggle } from "@/components/workspace/ThemeToggle";
import { TabBar, type WorkspaceTab } from "@/components/openduet/tab-bar";
import type { NavTree } from "@/lib/nav-tree";

interface WorkspaceShellProps {
  readonly manifest: CapabilityManifest;
  readonly userName: string;
  readonly userEmail?: string | null;
  readonly onSignOut?: (() => void) | undefined;
  readonly surface: WorkspaceTab;
  readonly runtime: WorkspaceRuntimeView;
  /** True while a connection attempt is in flight. Not on the view: it is controller state. */
  readonly connecting?: boolean;
  readonly waitingCount?: number;
  readonly coreHealth?: CoreHealth | null;
  readonly devBypass?: boolean;
  readonly onOpenArtifact?: (() => void) | undefined;
  readonly onConnectRuntime?: (() => void) | undefined;
  /** Server-resolved so the rail is the right width on first paint. */
  readonly sidebarOpen: boolean;
  readonly setSidebarOpen: (open: boolean) => void;
  /** The navigation tree for the current route. Derived server-side, so first paint is right. */
  readonly navTree: NavTree;
  readonly activeNavId: string | null;
  readonly children: ReactNode;
}

const SURFACE_LABEL: Record<WorkspaceTab, string> = {
  chat: "Chat",
  tasks: "Tasks",
  make: "Make",
  plugins: "Plugins",
  settings: "Settings",
  search: "Search"
};

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
  waitingCount,
  userName,
  userEmail,
  onSignOut,
  navTree,
  activeNavId,
  sidebarOpen,
  setSidebarOpen
}: {
  readonly manifest: CapabilityManifest;
  readonly sidebarOpen: boolean;
  readonly setSidebarOpen: (open: boolean) => void;
  readonly waitingCount: number;
  readonly userName: string;
  readonly userEmail: string | null;
  readonly onSignOut: (() => void) | undefined;
  readonly navTree: NavTree;
  readonly activeNavId: string | null;
}) {
  return (
    <Sidebar collapsible="icon" variant="inset">
      <SidebarHeader>
        {/*
          Wordmark row, matching the reference: the product name leads, and the two
          icon actions sit to its right. The previous header was a link tile, which read
          as a nav item rather than as the app's identity — and it duplicated the role
          that already shows in the footer account block.

          Collapse lives here because this is where the rail's own state belongs; the
          header trigger in the content bar stays for the case where the rail is hidden.
        */}
        <div className="flex items-center justify-between gap-2 px-1">
          <Link
            className="truncate rounded-[var(--radius-sm)] px-2 py-1.5 text-[15px] font-semibold tracking-tight outline-none hover:bg-sidebar-accent focus-visible:ring-2 focus-visible:ring-sidebar-ring"
            href="/workspace"
          >
            EdApex
          </Link>
          <div className="flex items-center gap-0.5">
            <SidebarMenuButton
              asChild
              className="size-8 p-0"
              tooltip="Search"
            >
              <Link aria-label="Search" href="/workspace/search">
                <Search aria-hidden="true" />
              </Link>
            </SidebarMenuButton>
            {/*
              Hidden below `md`: at that width the rail is a sheet, and the content
              header's `SidebarTrigger` is what opens it. Two controls for one state was
              the reason this row looked busier than the reference.
            */}
            <SidebarMenuButton
              aria-label="Toggle sidebar"
              className="hidden size-8 p-0 md:flex"
              onClick={() => setSidebarOpen(!sidebarOpen)}
              tooltip="Toggle sidebar"
              type="button"
            >
              <PanelLeft aria-hidden="true" />
            </SidebarMenuButton>
          </div>
        </div>
      </SidebarHeader>

      <SidebarContent>
        <SidebarNav activeId={activeNavId} tree={navTree} waitingCount={waitingCount} />
      </SidebarContent>

      <SidebarFooter>
        <SidebarMenu>
          {/*
            Theme lives here, not in the header: it is a preference, not state, and it is
            set roughly once. Labeled rather than icon-only because a cycling control has
            no fixed meaning — the icon shows the *current* mode, so without a word beside
            it a person has to click to learn what it does.
          */}
          <SidebarMenuItem>
            <ThemeToggle />
          </SidebarMenuItem>
        </SidebarMenu>
        {/*
          No Admin or Settings entries: both are already reachable from the composer, and
          a menu that repeats them adds a click to something already on screen.
        */}
        <SidebarUser
          email={userEmail}
          name={userName}
          onAdmin={undefined}
          onSettings={undefined}
          onSignOut={onSignOut}
          role={manifest.role}
        />
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  );
}

export function WorkspaceShell({
  manifest,
  userName,
  userEmail = null,
  onSignOut,
  surface,
  runtime,
  connecting = false,
  waitingCount = 0,
  coreHealth = null,
  devBypass = false,
  onOpenArtifact,
  onConnectRuntime,
  sidebarOpen,
  setSidebarOpen,
  navTree,
  activeNavId,
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
      <SidebarProvider onOpenChange={setSidebarOpen} open={sidebarOpen}>
        <DesktopRail
          activeNavId={activeNavId}
          setSidebarOpen={setSidebarOpen}
          sidebarOpen={sidebarOpen}
          manifest={manifest}
          navTree={navTree}
          onSignOut={onSignOut}
          userEmail={userEmail}
          userName={userName}
          waitingCount={waitingCount}
        />
        <SidebarInset className="min-h-0 overflow-hidden">
          {/*
            Official shadcn header geometry: a fixed 64px bar with the trigger, a vertical
            separator and a breadcrumb, then the content in its own padded column. The
            previous version had a custom 430px-max row that reflowed at every breakpoint
            and pushed the surface name into the same line as the status pills.
          */}
          {/*
            Official geometry: 64px, shrinking to 48px when the rail collapses, so the
            header tracks the rail's own height change instead of staying fixed and
            leaving a gap.
          */}
          <header className="safe-top flex h-16 shrink-0 items-center justify-between gap-2 transition-[width,height] ease-linear group-has-data-[collapsible=icon]/sidebar-wrapper:h-12">
            <div className="flex min-w-0 items-center gap-2 px-4">
              <SidebarTrigger aria-label="Toggle navigation" className="-ml-1" />
              <Separator
                className="mr-2 data-[orientation=vertical]:h-4"
                orientation="vertical"
              />
              <Breadcrumb>
                <BreadcrumbList>
                  <BreadcrumbItem className="hidden md:block">
                    <BreadcrumbLink asChild>
                      <Link href="/workspace">EdApex</Link>
                    </BreadcrumbLink>
                  </BreadcrumbItem>
                  <BreadcrumbSeparator className="hidden md:block" />
                  <BreadcrumbItem>
                    <BreadcrumbPage>{SURFACE_LABEL[surface]}</BreadcrumbPage>
                  </BreadcrumbItem>
                </BreadcrumbList>
              </Breadcrumb>
            </div>

            <div className="flex shrink-0 items-center gap-1 pr-4">
              {/*
                Three elements, ranked by how often they change.

                `Dev` and `Core 0.1.0` are build metadata: they never change, and they
                were sitting at the same visual weight as the one thing here that is live
                state. A badge that never changes state is decoration pretending to be a
                signal. The bypass is already stated where it matters — the empty states
                say there is no local database.

                The admin link was duplicated: it is in the sidebar footer. The header
                copy was `lg:hidden`, so it was a fallback for a nav item the mobile sheet
                already provides.
              */}
              <RuntimeStatus
                connected={runtime.connected}
                connecting={connecting}
                onConnect={onConnectRuntime}
                state={runtime.state}
              />
            </div>
          </header>

          {/*
            Content column. `max-w-[430px]` centres the chat on a phone and the composer
            with it; on desktop the surface owns the full inset width.
          */}
          <div className="flex min-h-0 flex-1 flex-col overflow-hidden pb-[92px] lg:pb-0">
            <div className="mx-auto flex min-h-0 w-full max-w-[430px] flex-1 flex-col lg:max-w-none">
              {children}
            </div>
            <div className="lg:hidden">
              <TabBar current={surface} waitingCount={waitingCount} />
            </div>
          </div>
        </SidebarInset>
      </SidebarProvider>
    </div>
  );
}
