import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const appRoot = fileURLToPath(new URL("..", import.meta.url));

const read = (path: string): string => readFileSync(join(appRoot, path), "utf8");

describe("workspace architecture invariants", () => {
  it("keeps auth, runtime and shell ownership in the workspace layout", () => {
    const layout = read("app/workspace/layout.tsx");
    const client = read("components/workspace/WorkspaceLayoutClient.tsx");
    const shell = read("components/workspace/WorkspaceShell.tsx");

    expect(layout).toContain("WorkspaceLayoutClient");
    expect(client).toContain("useWorkspaceRuntime");
    expect(client).toContain("getSession");
    expect(client).toContain("loadCapabilities");
    expect(shell).toContain('data-workspace-shell="true"');
    expect(shell).toContain("data-surface={surface}");
  });

  it("does not let route pages own the shell or runtime", () => {
    const pages = [
      "app/workspace/page.tsx",
      "app/workspace/tasks/page.tsx",
      "app/workspace/make/page.tsx",
      "app/workspace/plugins/page.tsx",
      "app/workspace/search/page.tsx",
      "app/workspace/settings/page.tsx"
    ];

    for (const page of pages) {
      const source = read(page);
      expect(source, page).not.toContain("WorkspaceRoute");
      expect(source, page).not.toContain("LoginPanel");
      expect(source, page).not.toContain("getSession");
      expect(source, page).not.toContain("useWorkspaceRuntime");
    }
  });

  it("uses client links for internal workspace navigation", () => {
    for (const file of [
      "components/workspace/WorkspaceShell.tsx",
      "components/openduet/tab-bar.tsx"
    ]) {
      const source = read(file);
      expect(source, file).not.toMatch(/<a[^>]+href="\/workspace/);
      expect(source, file).not.toMatch(/<a[^>]+href="\/admin/);
      expect(source, file).toContain("Link");
    }
  });

  it("keeps the boot skeleton surface-specific", () => {
    const boot = read("components/workspace/WorkspaceBoot.tsx");
    expect(boot).toContain("ChatBoot");
    expect(boot).toContain("TasksBoot");
    expect(boot).toContain("MakeBoot");
    expect(boot).toContain("BOOT_LABEL[surface]");
    expect(boot).toContain("BootMobileNav");
  });

  it("does not leave a page-level workspace route implementation", () => {
    const files = readdirSync(join(appRoot, "components/workspace"));
    expect(files).not.toContain("WorkspaceRoute.tsx");
  });
});

describe("sidebar renders from a tree, not a list", () => {
  it("keeps navigation data out of the shell", () => {
    // The shell composes; `lib/nav-tree.ts` decides. A `<Link>` added directly in the
    // shell is how a rail drifts out of step with the route it is meant to describe.
    const shell = read("components/workspace/WorkspaceShell.tsx");
    expect(shell).toContain("SidebarNav");
    expect(shell).not.toContain("RAIL_ITEMS");
  });

  it("declares every workspace destination in the tree", () => {
    const tree = read("lib/nav-tree.ts");
    for (const href of [
      "/workspace",
      "/workspace/tasks",
      "/workspace/make",
      "/workspace/plugins"
    ]) {
      expect(tree, href).toContain(`href: "${href}"`);
    }
  });

  it("gives settings its own tree with a way back", () => {
    // The tree is selected in the layout client (it owns the route); the way back is
    // rendered by the nav. Asserting both on one file was asserting the wrong thing.
    expect(read("components/workspace/WorkspaceLayoutClient.tsx")).toContain("treeForPath");
    expect(read("lib/nav-tree.ts")).toContain("SETTINGS_TREE");
    expect(read("components/workspace/SidebarNav.tsx")).toContain("Back to app");
  });

  it("animates the tree but not the rail width", () => {
    // A width animation on the rail moves the content column, which reflows everything
    // being read. Only `opacity` and `transform` may transition on the nav region.
    const nav = read("components/workspace/SidebarNav.tsx");
    expect(nav).toContain("transitionProperty: \"opacity, transform\"");
    expect(nav).not.toContain("transitionProperty: \"width");
  });
});

describe("plugins mirror the server connectors", () => {
  it("keeps the server catalogue out of the bundle", () => {
    // `packages/connectors` is server-only; the client copy is guarded by
    // `tests/plugins-nav.test.ts`. Importing the server module here would be a build
    // failure at runtime and a credential risk at rest.
    const surface = read("components/workspace/PluginsSurface.tsx");
    expect(surface).not.toContain("@edapex/connectors");
    expect(surface).toContain("@/lib/plugins-catalogue");
  });
});
