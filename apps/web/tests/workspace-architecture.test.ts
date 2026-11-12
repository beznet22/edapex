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
      "app/workspace/make/page.tsx"
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
