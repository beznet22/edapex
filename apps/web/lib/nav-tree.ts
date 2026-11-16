import type { CapabilityRole } from "@edapex/contracts";

/**
 * Sidebar navigation trees.
 *
 * One sidebar, three content trees. The rail's *width* never changes on context; only its
 * contents do — a width animation would move the whole content column, which on a 760px
 * canvas is a visible reflow of everything the person is reading.
 *
 * Data, not JSX: the tree is derived from the route so the server can render the correct
 * one on first paint, and so the same tree can be asserted in a test without a DOM.
 */

export type SidebarContextKind = "workspace" | "settings";

export interface NavItem {
  readonly id: string;
  /** Absolute path. `null` for a group heading that is not itself navigable. */
  readonly href: string | null;
  readonly label: string;
  readonly icon: string;
  readonly badge?: "waiting";
  /**
   * Roles that see this item. Omitted means every role.
   *
   * The tree is filtered by role rather than the items hiding themselves: a teacher must not
   * reach a destination that will only 403, and an item that renders and then fails is worse
   * than one that was never offered.
   */
  readonly roles?: readonly CapabilityRole[];
}

export interface NavGroup {
  readonly id: string;
  /** Rendered as the group label. Omitted for the first, unlabelled group. */
  readonly label?: string;
  readonly items: readonly NavItem[];
  /**
   * Placeholder shown when `items` is empty.
   *
   * The reference uses one for Projects ("No projects"). A labelled section that renders
   * nothing looks broken; a labelled section that states why is complete.
   */
  readonly emptyText?: string;
}

export interface NavTree {
  readonly context: SidebarContextKind;
  readonly groups: readonly NavGroup[];
}

export const WORKSPACE_TREE: NavTree = {
  context: "workspace",
  groups: [
    {
      id: "primary",
      items: [
        { id: "chat", href: "/workspace", label: "Chat", icon: "message-circle" },
        { id: "tasks", href: "/workspace/tasks", label: "Tasks", icon: "list-checks", badge: "waiting" },
        { id: "make", href: "/workspace/make", label: "Make", icon: "wand-sparkles" },
        { id: "plugins", href: "/workspace/plugins", label: "Plugins", icon: "plug" }
      ]
    },
    {
      id: "manage",
      items: [
        {
          id: "admin",
          href: "/workspace/admin",
          label: "People",
          icon: "users",
          // Both roles manage people; what differs is the dataset and the actions. A parent
          // or student has no business here at all.
          roles: ["admin", "teacher"]
        }
      ]
    }
  ]
};

/**
 * The settings tree.
 *
 * Only entries that exist. A tree listing "Notifications" and "Billing" that open empty
 * pages is worse than a shorter tree: the person learns that half the app is broken
 * rather than that half the app is unbuilt.
 */
export const SETTINGS_TREE: NavTree = {
  context: "settings",
  groups: [
    {
      id: "account",
      label: "Account",
      items: [
        { id: "profile", href: "/workspace/settings", label: "Profile", icon: "user" },
        { id: "appearance", href: "/workspace/settings/appearance", label: "Appearance", icon: "palette" },
        { id: "security", href: "/workspace/settings/security", label: "Security", icon: "shield-check" }
      ]
    },
    {
      id: "workspace",
      label: "Workspace",
      items: [
        { id: "general", href: "/workspace/settings/general", label: "General", icon: "settings" },
        { id: "members", href: "/workspace/settings/members", label: "Members", icon: "users" }
      ]
    }
  ]
};

/**
 * Which tree a path belongs to.
 *
 * Prefix-matched rather than exact, so every nested settings route keeps the settings
 * tree without registering each one. `/workspace/settingsfoo` would also match, which is
 * acceptable: no such route exists and the worst case is a settings sidebar on a 404.
 */
export function contextForPath(pathname: string): SidebarContextKind {
  const path = pathname.replace(/\/+$/, "") || "/";
  return path === "/workspace/settings" || path.startsWith("/workspace/settings/")
    ? "settings"
    : "workspace";
}

/** Drops items the given role may not see. `null` means "no role yet", which shows none. */
export function filterTreeForRole(
  tree: NavTree,
  role: CapabilityRole | null
): NavTree {
  const visibleGroups = tree.groups
    .map((group) => ({
      ...group,
      items: group.items.filter(
        (item) => item.roles === undefined || (role !== null && item.roles.includes(role))
      )
    }))
    .filter((group) => group.items.length > 0);
  return { context: tree.context, groups: visibleGroups };
}

export function treeForPath(pathname: string): NavTree {
  return contextForPath(pathname) === "settings" ? SETTINGS_TREE : WORKSPACE_TREE;
}

/** The item a path selects, for `aria-current`. Longest match wins so a nested route
 *  does not light up its own parent as well. */
/**
 * Text-only rows, matching the reference's Pinned and Recents sections.
 *
 * The reference gives these **no icon and no active fill**: they are a reading list, not
 * navigation chrome, and an icon per conversation would be noise at this density. Only
 * the primary destinations get icons.
 */
export interface SidebarEntry {
  readonly id: string;
  readonly label: string;
  readonly href: string;
}

export interface WorkspaceSidebarData {
  readonly pinned: readonly SidebarEntry[];
  readonly recent: readonly SidebarEntry[];
  /** Null while the workspace has no projects, which renders the reference's placeholder. */
  readonly projectCount: number | null;
}

/**
 * No history yet.
 *
 * Pinned, Projects and Recents render their labels and empty states rather than being
 * omitted, so filling them later is a data change rather than a layout change. They must
 * never render invented rows: a fake conversation is worse than an empty list, because
 * someone will click it.
 */
export const EMPTY_SIDEBAR_DATA: WorkspaceSidebarData = {
  pinned: [],
  recent: [],
  projectCount: null
};

/**
 * Whether the tree declares `path` as an item of its own.
 *
 * This is what makes the nested check safe: `/workspace` prefix-matches every
 * `/workspace/*` route, so a nested match only counts when some item *is* that path. On
 * `/workspace/unknown` nothing declares it, so Chat does not light up on a 404.
 */
function declaresPath(tree: NavTree, path: string): boolean {
  return tree.groups.some((group) => group.items.some((item) => item.href === path));
}

export function activeItemId(tree: NavTree, pathname: string): string | null {
  const path = pathname.replace(/\/+$/, "") || "/";
  let best: { id: string; length: number } | null = null;

  for (const group of tree.groups) {
    for (const item of group.items) {
      if (item.href === null) continue;
      const exact = item.href === path;
      // `/workspace` would otherwise prefix-match `/workspace/unknown`, lighting up Chat
      // on a 404. A nested route must be a known destination, so the match is on a
      // segment boundary that this tree actually declares.
      const nested = path.startsWith(`${item.href}/`) && declaresPath(tree, path);
      if (!exact && !nested) continue;
      if (best === null || item.href.length > best.length) {
        best = { id: item.id, length: item.href.length };
      }
    }
  }
  return best?.id ?? null;
}
