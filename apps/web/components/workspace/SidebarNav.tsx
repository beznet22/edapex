"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  ListChecks,
  MessageCircle,
  Palette,
  Plug,
  Settings,
  ShieldCheck,
  User,
  Users,
  WandSparkles
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

import {
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem
} from "@/components/ui/sidebar";
import type {
  NavItem,
  NavTree,
  SidebarEntry,
  WorkspaceSidebarData
} from "@/lib/nav-tree";
import { EMPTY_SIDEBAR_DATA } from "@/lib/nav-tree";
import { Button } from "@edapex/ui/components/button";
import { Input } from "@edapex/ui/components/input";
import { Modal } from "@/components/ui/modal";
import { SidebarRow, SidebarSectionHeader } from "@/components/workspace/SidebarRow";

/**
 * The sidebar's navigation region, which swaps content by context.
 *
 * # Why the tree animates and the rail does not
 *
 * Animating the rail's width would move the entire content column — on a 760px canvas
 * that is a reflow of everything being read. So the container stays fixed and only its
 * children cross-fade.
 *
 * # Why there is no overlap
 *
 * The outgoing tree is removed before the incoming one mounts. Two 10-item trees
 * cross-fading at this size reads as a blur, not a transition. Sequencing instead gives
 * the eye a clean before-and-after.
 *
 * Reduced motion collapses both phases to a flag flip: the content change is
 * information, the slide is decoration.
 */

const ICONS: Record<string, LucideIcon> = {
  "message-circle": MessageCircle,
  "list-checks": ListChecks,
  "wand-sparkles": WandSparkles,
  plug: Plug,
  user: User,
  palette: Palette,
  "shield-check": ShieldCheck,
  settings: Settings,
  users: Users
};

function prefersReducedMotion(): boolean {
  return (
    typeof window !== "undefined" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}

export interface SidebarNavProps {
  readonly tree: NavTree;
  readonly activeId: string | null;
  readonly waitingCount: number;
  /** Pinned, Projects and Recents. Empty today; the shape is what ships. */
  readonly data?: WorkspaceSidebarData;
}

export function SidebarNav({
  tree,
  activeId,
  waitingCount,
  data = EMPTY_SIDEBAR_DATA
}: SidebarNavProps) {
  // The tree actually rendered. It lags `tree` by one animation frame on a change so the
  // outgoing content can finish leaving before the new content arrives.
  const [rendered, setRendered] = useState(tree);
  const [phase, setPhase] = useState<"idle" | "leaving" | "entering">("idle");
  const previousContext = useRef(tree.context);

  useEffect(() => {
    if (tree.context === previousContext.current) {
      // Same tree, different active item: no animation. A highlight moving is not a
      // navigation event and should not flash the whole tree.
      setRendered(tree);
      return;
    }

    previousContext.current = tree.context;

    if (prefersReducedMotion()) {
      setRendered(tree);
      setPhase("idle");
      return;
    }

    setPhase("leaving");
    const leaveFor = window.setTimeout(() => {
      setRendered(tree);
      setPhase("entering");
    }, 160);

    return () => window.clearTimeout(leaveFor);
  }, [tree]);

  useEffect(() => {
    if (phase !== "entering") return;
    const settle = window.setTimeout(() => setPhase("idle"), 220);
    return () => window.clearTimeout(settle);
  }, [phase]);

  return (
    <div
      data-sidebar-nav="true"
      data-nav-phase={phase}
      data-nav-context={rendered.context}
      style={{
        // Duration values are duplicated in CSS below rather than read from a token:
        // inline styles cannot resolve custom properties for a transition shorthand, and
        // a wrong value here would silently drop the animation.
        transitionProperty: "opacity, transform",
        transitionTimingFunction:
          phase === "leaving" ? "cubic-bezier(0.3, 0, 0.8, 0.15)" : "cubic-bezier(0.05, 0.7, 0.1, 1)",
        transitionDuration: phase === "leaving" ? "160ms" : "220ms",
        opacity: phase === "leaving" ? 0 : 1,
        transform:
          phase === "leaving"
            ? "translateX(-8px)"
            : phase === "entering"
              ? "none"
              : "none"
      }}
    >
      {rendered.context === "settings" ? (
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton asChild tooltip="Back to app">
                  <Link href="/workspace">
                    <ArrowLeft aria-hidden="true" />
                    <span>Back to app</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      ) : null}

      {rendered.groups.map((group, index) => (
        <SidebarGroup key={group.id}>
          {group.label === undefined ? null : (
            <SidebarGroupLabel className={index === 0 ? undefined : "mt-4"}>
              {group.label}
            </SidebarGroupLabel>
          )}
          <SidebarGroupContent>
            <SidebarMenu>
              {group.items.map((item) => (
                <NavRow
                  active={item.id === activeId}
                  item={item}
                  key={item.id}
                  waitingCount={waitingCount}
                />
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      ))}

      {/*
        Hidden entirely when collapsed: the section labels already hide, and three groups
        of prose placeholders in a 50px rail would be unreadable stubs. The primary
        destinations are what the icon rail is for.
      */}
      {rendered.context === "workspace" ? (
        <div className="group-data-[collapsible=icon]:hidden">
          <HistorySections data={data} />
        </div>
      ) : null}
    </div>
  );
}

/**
 * Pinned, Projects and Recents.
 *
 * Text-only rows with no icon and no active fill, matching the reference: these are a
 * reading list, and an icon per conversation would be noise at this density.
 *
 * The data is empty today because history is not stored yet. The sections still render,
 * with their labels and their empty states — a layout change later is a failure mode this
 * avoids, and an invented row would be worse than an empty list because someone would
 * click it.
 */
function HistorySections({ data }: { readonly data: WorkspaceSidebarData }) {
  // Section collapse is local UI state, not persisted: a person who folds Pinned to see
  // Recents does not want that choice remembered across reloads.
  const [folded, setFolded] = useState<Record<string, boolean>>({});
  const [projectModal, setProjectModal] = useState(false);
  // Sort mode is a view preference, so it lives with the section and is not persisted —
  // a stored ordering would surprise someone who changed it once on another device.
  const [sortByProject, setSortByProject] = useState(false);

  const toggle = (id: string): void =>
    setFolded((current) => ({ ...current, [id]: current[id] !== true }));

  return (
    <>
      <SidebarGroup>
        <SidebarSectionHeader
          collapsed={folded.pinned === true}
          collapsible
          label="Pinned"
          onToggle={() => toggle("pinned")}
        />
        {folded.pinned === true ? null : (
          <SidebarGroupContent>
            {data.pinned.length === 0 ? (
              <p className="px-2 py-1 text-[13px] text-muted-foreground/70 group-data-[collapsible=icon]:hidden">
                Nothing pinned
              </p>
            ) : (
              <div className="space-y-0.5">
                {data.pinned.map((entry) => (
                  <SidebarRow
                    actions={{ onTogglePin: () => undefined, pinned: true }}
                    href={entry.href}
                    id={entry.id}
                    key={entry.id}
                    label={entry.label}
                  />
                ))}
              </div>
            )}
          </SidebarGroupContent>
        )}
      </SidebarGroup>

      <SidebarGroup>
        {/*
          Projects has no chevron: it is not a list to fold, it is a place to create one.
          The plus opens a modal, matching the reference.
        */}
        <SidebarSectionHeader
          label="Projects"
          onAdd={() => setProjectModal(true)}
          onFilter={() => undefined}
          onSortChange={setSortByProject}
          sortByProject={sortByProject}
        />
        <SidebarGroupContent>
          <p className="px-2 py-1 text-[13px] text-muted-foreground/70 group-data-[collapsible=icon]:hidden">
            No projects
          </p>
        </SidebarGroupContent>
      </SidebarGroup>

      <SidebarGroup>
        <SidebarSectionHeader
          collapsed={folded.recents === true}
          collapsible
          label="Recents"
          onToggle={() => toggle("recents")}
        />
        {folded.recents === true ? null : (
          <SidebarGroupContent>
            {data.recent.length === 0 ? (
              <p className="px-2 py-1 text-[13px] text-muted-foreground/70 group-data-[collapsible=icon]:hidden">
                Conversations appear here
              </p>
            ) : (
              <div className="space-y-0.5">
                {data.recent.map((entry) => (
                  <SidebarRow
                    actions={{ onTogglePin: () => undefined, pinned: false }}
                    href={entry.href}
                    id={entry.id}
                    key={entry.id}
                    label={entry.label}
                  />
                ))}
              </div>
            )}
          </SidebarGroupContent>
        )}
      </SidebarGroup>

      <Modal
        description="Projects group related conversations so a term's work does not scatter across Recents."
        footer={
          <Button disabled type="button">
            Create project
          </Button>
        }
        onClose={() => setProjectModal(false)}
        open={projectModal}
        title="New project"
      >
        {/*
          The form is present but disabled: there is no project table, so a working submit
          would write to nothing. Showing the shape is honest; a button that silently did
          nothing would not be.
        */}
        <div className="space-y-4 py-2">
          <label className="block">
            <span className="text-[13px] font-medium">Name</span>
            <Input className="mt-2" disabled placeholder="First term reports" />
          </label>
          <p className="text-[12px] leading-5 text-muted-foreground">
            Projects are not stored yet. This dialog will create one once the project model
            lands.
          </p>
        </div>
      </Modal>
    </>
  );
}

/** A history row: label only, truncated, no icon. */
function TextRow({ entry }: { readonly entry: SidebarEntry }) {
  return (
    <SidebarMenuItem>
      <SidebarMenuButton asChild className="h-8" tooltip={entry.label}>
        <Link href={entry.href}>
          <span className="truncate text-[13px]">{entry.label}</span>
        </Link>
      </SidebarMenuButton>
    </SidebarMenuItem>
  );
}

function NavRow({
  item,
  active,
  waitingCount
}: {
  readonly item: NavItem;
  readonly active: boolean;
  readonly waitingCount: number;
}) {
  const Icon = ICONS[item.icon] ?? MessageCircle;
  const badge = item.badge === "waiting" ? waitingCount : 0;

  return (
    <SidebarMenuItem>
      <SidebarMenuButton asChild isActive={active} tooltip={item.label}>
        <Link aria-current={active ? "page" : undefined} href={item.href ?? "#"}>
          <Icon aria-hidden="true" />
          <span>{item.label}</span>
        </Link>
      </SidebarMenuButton>
      {badge > 0 ? <SidebarMenuBadge>{badge}</SidebarMenuBadge> : null}
    </SidebarMenuItem>
  );
}
