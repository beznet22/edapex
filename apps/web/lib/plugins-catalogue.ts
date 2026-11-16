/**
 * Plugin catalogue for the browser.
 *
 * Mirrors `packages/connectors/src/catalogue.ts`, which is server-only: it carries the
 * implementation and the credential handling, and the dependency boundary test fails the
 * build if it reaches a client bundle.
 *
 * So this is a **presentation** copy, not a second source of truth. It is a deliberate
 * duplication with a guard: `apps/web/tests/plugins-catalogue.test.ts` asserts the ids
 * and names here match the server catalogue, so a rename on one side fails a test rather
 * than silently rendering a plugin that cannot be connected.
 *
 * `connected` and account state come from the API at runtime; nothing here claims to know
 * whether a person has connected anything.
 */

export type PluginCategory = "google" | "mcp";

export interface PluginEntry {
  readonly id: string;
  readonly name: string;
  readonly summary: string;
  /** What the plugin will be able to do, for informed consent before the OAuth screen. */
  readonly requests: readonly string[];
  readonly category: PluginCategory;
  /** True when each person connects their own account. */
  readonly perPerson: boolean;
  /**
   * Lucide icon name for the tile.
   *
   * The reference draws brand logos. We do not ship them: a Google mark implies an
   * integration depth we do not have, and it is a trademark to redraw. A neutral glyph on
   * a muted tile is honest and still scannable.
   */
  readonly icon: string;
}

export const PLUGINS: readonly PluginEntry[] = [
  {
    id: "google",
    name: "Google Workspace",
    summary: "Read mail, calendars and files as the connected person, and send on their behalf.",
    requests: ["Read mail and calendar", "Send mail on your behalf", "Create files you own"],
    category: "google",
    perPerson: true,
    icon: "mail"
  },
  {
    id: "mcp",
    name: "MCP server",
    summary: "A self-run Model Context Protocol server, dialled from the server side.",
    requests: ["Call the tools you explicitly allow"],
    category: "mcp",
    perPerson: false,
    icon: "server"
  }
];

/**
 * Category headings, in display order.
 *
 * **One group, not one per protocol.** With two plugins and two categories, every row of
 * a two-column grid held a single item — which reads as a broken grid rather than a
 * sparse one. The reference groups editorially ("Popular", "New & Noteworthy"), which is
 * about curation, not about how the integration is implemented.
 *
 * When the catalogue grows past one row per heading, split it.
 */
export interface PluginGroup {
  readonly id: string;
  readonly label: string;
  readonly pluginIds: readonly string[];
}

export const PLUGIN_GROUPS: readonly PluginGroup[] = [
  { id: "popular", label: "Popular", pluginIds: ["google", "mcp"] }
];

export function pluginById(id: string): PluginEntry | undefined {
  return PLUGINS.find((plugin) => plugin.id === id);
}
