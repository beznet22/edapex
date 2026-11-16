"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { FilePlus2, PanelLeft, Search } from "lucide-react";

import type { CapabilityManifest, WorkspaceRuntimeView } from "@edapex/contracts";
import type { CoreHealth } from "@/lib/tauri";

import { Button } from "@edapex/ui/components/button";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { Separator } from "@edapex/ui/components/separator";
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
import { BrandMark } from "@/components/workspace/BrandMark";
import { CommandPaletteTrigger } from "@/components/workspace/CommandPalette";
import { SidebarNav } from "@/components/workspace/SidebarNav";
import { SidebarUser } from "@/components/workspace/SidebarUser";
import { ThemeToggle } from "@/components/workspace/ThemeToggle";
import { TabBar, type WorkspaceTab } from "@/components/openduet/tab-bar";
import { cn } from "@/lib/utils";
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
  admin: "People",
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
  activeNavId
}: {
  readonly manifest: CapabilityManifest;
  readonly waitingCount: number;
  readonly userName: string;
  readonly userEmail: string | null;
  readonly onSignOut: (() => void) | undefined;
  readonly navTree: NavTree;
  readonly activeNavId: string | null;
}) {
  // `useSidebar` rather than a prop: the provider owns the state, and a prop would go
  // stale the moment the rail toggled itself.
  const { open, setOpen } = useSidebar();

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
        {/*
          Collapsed, the header is the toggle alone. The reference does exactly this: the
          wordmark and search disappear and the rail becomes a column of icons, with the
          toggle sitting above them as the one control that changes the shape back.
        */}
        {/*
          The wordmark *is* the toggle.

          Two controls in the top row (a brand link and a collapse button) competed for the
          same 240px and neither read clearly. Merging them: the label states identity at
          rest, and hovering reveals the rail icon with a horizontal double-arrow cursor —
          the same affordance a resizable pane uses, which is what this is.
        */}
        <div className="flex items-center justify-between gap-1 px-1">
          {/*
            Expanded: wordmark label, then search + toggle paired right.
            Collapsed: the brand *is* the toggle — the wordmark leaves the DOM entirely and
            the "E" tile swaps to the rail icon on hover.
          */}
          {open ? (
            <Link
              className="flex min-w-0 flex-1 items-center gap-2 rounded-[var(--radius-sm)] px-2 py-1 outline-none hover:bg-sidebar-accent focus-visible:ring-2 focus-visible:ring-sidebar-ring"
              href="/workspace"
            >
              <BrandMark size={24} />
              <span className="truncate text-[15px] font-semibold uppercase tracking-[0.08em]">
                EDAPEX
              </span>
            </Link>
          ) : (
            <button
              aria-label="Expand sidebar"
              className="group/logo flex size-9 shrink-0 items-center justify-center rounded-[var(--radius-sm)] outline-none cursor-ew-resize transition-colors hover:bg-sidebar-accent focus-visible:ring-2 focus-visible:ring-sidebar-ring"
              onClick={() => setOpen(true)}
              title="Expand sidebar"
              type="button"
            >
              {/*
                The real mark, not a letter tile. It sits on the rail's own background —
                the two files exist precisely so the right one shows on each ground, and
                putting it inside a coloured tile would defeat that.
              */}
              {/*
                Larger than the row icons: the mark is the app's identity, and at the
                same optical weight as a nav glyph it read as one more destination.
              */}
              <BrandMark className="group-hover/logo:hidden" size={28} />
              <PanelLeft
                aria-hidden="true"
                className="hidden size-4 text-muted-foreground group-hover/logo:block"
              />
            </button>
          )}

          <div className="flex shrink-0 items-center gap-0.5">
            {open ? (
              <>
                {/*
                  Opens the palette, not a route. `/workspace/search` exists but says the
                  index is unbuilt; the palette is the search that actually works.
                */}
                <SidebarMenuButton
                  aria-label="Search"
                  className="size-8 p-0"
                  onClick={() => {
                    document.dispatchEvent(
                      new KeyboardEvent("keydown", {
                        key: "k",
                        metaKey: true,
                        bubbles: true
                      })
                    );
                  }}
                  tooltip="Search"
                  type="button"
                >
                  <Search aria-hidden="true" />
                </SidebarMenuButton>
                <button
                  aria-label="Collapse sidebar"
                  className="flex size-8 items-center justify-center rounded-[var(--radius-sm)] text-muted-foreground outline-none transition-colors cursor-ew-resize hover:bg-sidebar-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-sidebar-ring"
                  onClick={() => setOpen(false)}
                  title="Collapse sidebar"
                  type="button"
                >
                  <PanelLeft aria-hidden="true" className="size-4" />
                </button>
              </>
            ) : null}
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
      <Titlebar title="EDAPEX Work" />
      <SidebarProvider onOpenChange={setSidebarOpen} open={sidebarOpen}>
        <DesktopRail
          activeNavId={activeNavId}
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
              {/*
                Below `md` only: the rail is a sheet there, so this is the control that
                opens it. From `md` up the rail is visible and owns its own toggle — two
                controls for one state was most of why this row looked busier than the
                reference.
              */}
              <SidebarTrigger
                aria-label="Toggle navigation"
                className="-ml-1 md:hidden"
              />
              <Separator
                className="mr-2 hidden data-[orientation=vertical]:h-4 md:block"
                orientation="vertical"
              />
              <Breadcrumb className="md:pl-2">
                <BreadcrumbList>
                  <BreadcrumbItem className="hidden md:block">
                    <BreadcrumbLink asChild>
                      <Link href="/workspace">EDAPEX</Link>
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
