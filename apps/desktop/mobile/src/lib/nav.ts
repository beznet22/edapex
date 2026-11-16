/**
 * The shell's navigation model.
 *
 * Data, not JSX: the top bar, the drawer and the attach panel all render from these lists,
 * so a destination is added in one place. There is no bottom dock any more — every
 * destination lives in the drawer, and the top bar carries only the two things you start
 * from, plus a menu.
 */

export type SurfaceId =
  | "chat"
  | "make"
  | "tasks"
  | "approvals"
  | "people"
  | "agents"
  | "plugins"
  | "library"
  | "settings"
  | "account";

export type IconName =
  | "bot"
  | "library"
  | "check"
  | "list"
  | "users"
  | "plug"
  | "settings"
  | "user"
  | "scan"
  | "camera"
  | "image"
  | "file"
  | "brain"
  | "pencil";

export interface NavEntry {
  readonly id: SurfaceId;
  readonly label: string;
  readonly icon: IconName;
  /** A count worth surfacing before the drawer is opened. */
  readonly badge?: number;
}

/**
 * The drawer's primary rows, in the order Frame 2 uses: the things an agentic school
 * workspace reaches for before its settings.
 */
export const PRIMARY_NAV: readonly NavEntry[] = [
  { id: "agents", label: "Agents", icon: "bot" },
  { id: "library", label: "Library", icon: "library" },
  { id: "approvals", label: "Approvals", icon: "check", badge: 3 },
  { id: "tasks", label: "Tasks", icon: "list" },
  { id: "people", label: "People", icon: "users" },
  { id: "plugins", label: "Plugins", icon: "plug" }
] as const;

export interface Thread {
  readonly id: string;
  readonly title: string;
}

export const PINNED_THREADS: readonly Thread[] = [
  { id: "p1", title: "Term 2 marksheet audit" },
  { id: "p2", title: "Year 9 report comments" }
] as const;

export const RECENT_THREADS: readonly Thread[] = [
  { id: "r1", title: "JSS 2 result sheet check" },
  { id: "r2", title: "Parent meeting notes" },
  { id: "r3", title: "Scheme of work — Physics" },
  { id: "r4", title: "Fee reminder draft" }
] as const;

export interface AttachAction {
  readonly id: "camera" | "photos" | "files" | "scan" | "plugins" | "deep";
  readonly label: string;
  readonly icon: IconName;
}

/** Frame 4, tailored: Scan replaces ChatGPT's "Think harder", because that is our input. */
export const ATTACH_ACTIONS: readonly AttachAction[] = [
  { id: "camera", label: "Camera", icon: "camera" },
  { id: "photos", label: "Photos", icon: "image" },
  { id: "files", label: "Files", icon: "file" },
  { id: "scan", label: "Scan a document", icon: "scan" },
  { id: "plugins", label: "Plugins", icon: "plug" },
  { id: "deep", label: "Deep work", icon: "brain" }
] as const;

export interface QuickAction {
  readonly id: "scan" | "agent";
  readonly label: string;
  readonly icon: IconName;
}

/** The two suggestions above the composer on an empty chat. */
export const QUICK_ACTIONS: readonly QuickAction[] = [
  { id: "scan", label: "Scan a marksheet", icon: "scan" },
  { id: "agent", label: "Create an agent", icon: "bot" }
] as const;

export interface SectionRow {
  readonly id: string;
  readonly label: string;
  readonly meta?: string;
}

export interface Section {
  readonly title: string;
  readonly description: string;
  readonly rows: readonly SectionRow[];
}

/**
 * Seeded content for the drawer destinations that Part IV replaces.
 *
 * Real lists, not empty states: a shell that renders blank pages cannot be judged, and an
 * empty state hides whether the row rhythm works. Every string here is fixture data and is
 * replaced surface by surface.
 */
export const SECTIONS: Readonly<Record<"tasks" | "approvals" | "people" | "agents" | "plugins" | "library" | "account", Section>> = {
  tasks: {
    title: "Tasks",
    description: "Work an agent has queued or finished.",
    rows: [
      { id: "t1", label: "Reconcile JSS 2 attendance", meta: "Running" },
      { id: "t2", label: "Draft Year 9 report comments", meta: "Needs approval" },
      { id: "t3", label: "Check term 2 marksheets", meta: "Done yesterday" },
      { id: "t4", label: "Build revision plan", meta: "Queued" }
    ]
  },
  approvals: {
    title: "Approvals",
    description: "Changes that need a person before they are saved.",
    rows: [
      { id: "a1", label: "Update 14 attendance records", meta: "JSS 2B" },
      { id: "a2", label: "Publish report comments", meta: "Year 9 Physics" },
      { id: "a3", label: "Archive last term's marksheets", meta: "Library" }
    ]
  },
  people: {
    title: "People",
    description: "Staff in this workspace and what they can reach.",
    rows: [
      { id: "p1", label: "Ada Nwosu", meta: "Admin" },
      { id: "p2", label: "Chidi Okafor", meta: "Teacher · Physics" },
      { id: "p3", label: "Fatima Bello", meta: "Teacher · Mathematics" }
    ]
  },
  agents: {
    title: "Agents",
    description: "Scheduled work, with a rule for every change it makes.",
    rows: [
      { id: "g1", label: "Attendance reconciler", meta: "Fridays, 16:00" },
      { id: "g2", label: "Report comment writer", meta: "On demand" },
      { id: "g3", label: "Marksheet auditor", meta: "End of term" }
    ]
  },
  plugins: {
    title: "Plugins",
    description: "Connections to the tools a school already runs on.",
    rows: [
      { id: "x1", label: "Google Classroom", meta: "Connected" },
      { id: "x2", label: "Google Drive", meta: "Connected" },
      { id: "x3", label: "SMS gateway", meta: "Not connected" }
    ]
  },
  library: {
    title: "Library",
    description: "Documents an agent can read.",
    rows: [
      { id: "l1", label: "Term 2 marksheet — JSS 2", meta: "PDF · scanned" },
      { id: "l2", label: "Year 9 scheme of work", meta: "Document" },
      { id: "l3", label: "Attendance register", meta: "Sheet" }
    ]
  },
  account: {
    title: "Account",
    description: "Your profile and this device.",
    rows: [
      { id: "u1", label: "Brown Onojeta", meta: "Admin" },
      { id: "u2", label: "Bronotek Academy", meta: "Workspace" },
      { id: "u3", label: "Notifications", meta: "Approvals only" },
      { id: "u4", label: "Sign out", meta: "This device" }
    ]
  }
};
