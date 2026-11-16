/**
 * The four destinations, and the drawer's contents.
 *
 * Data, not JSX: the dock and the rail render from this list, so a destination is added in
 * one place and both breakpoints agree. A fifth tab would shrink every target, which is why
 * `Account` is the last one and there is no `More`.
 */

export type DestinationId = "chat" | "scan" | "tasks" | "account";

export interface Destination {
  readonly id: DestinationId;
  /** The accessible name and the dock label. */
  readonly label: string;
  /** A lucide icon name; the shell maps it. */
  readonly icon: "message-circle" | "scan-line" | "list-checks" | "user-circle";
  /** Scan opens a native surface rather than a route, so it never shows as selected. */
  readonly isAction?: boolean;
}

export const DESTINATIONS: readonly Destination[] = [
  { id: "chat", label: "Chat", icon: "message-circle" },
  { id: "scan", label: "Scan", icon: "scan-line", isAction: true },
  { id: "tasks", label: "Tasks", icon: "list-checks" },
  { id: "account", label: "Account", icon: "user-circle" }
] as const;

/** Drawer rows below the recents list, in order. `badge` marks the agentic inbox. */
export interface DrawerEntry {
  readonly id: "approvals" | "people" | "agents" | "plugins" | "settings" | "help";
  readonly label: string;
}

export const DRAWER_ENTRIES: readonly DrawerEntry[] = [
  { id: "approvals", label: "Approvals" },
  { id: "people", label: "People" },
  { id: "agents", label: "Agents" },
  { id: "plugins", label: "Plugins" },
  { id: "settings", label: "Settings" },
  { id: "help", label: "Help & feedback" }
] as const;
