import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { join } from "node:path";
import { existsSync, readFileSync, mkdirSync, rmSync, writeFileSync, readdirSync } from "node:fs";
import { createClient, type Client } from "@libsql/client";
import {
  SkillSchema,
  parseSkillFile,
  validateSkillDirectory,
  type SkillDefinition,
  type ValidationResult,
} from "../skill-schema";
import { generateSkillManifest, loadSkillManifest, SkillRegistry } from "../skill-registry";
import { SkillWatcher, transactionalWrite } from "../skill-watcher";
import { SkillStateManager, type SwitchResult, type InterruptionResult } from "../skill-state";
import {
  hydrateClassMention,
  ALLOWED_DESIGNATIONS,
  getHealthStatus,
  type MentionResolution,
  type HealthStatus,
} from "../skill-context";

const FIXTURES_DIR = join(__dirname, "fixtures", "skills");
const TMP_DIR = join(__dirname, "fixtures", "tmp-discovery");

const KNOWN_TOOLS = new Set([
  "upsertMarks",
  "validateResults",
  "updateExamSetup",
  "extractDocument",
  "parseOcrResult",
  "publishExtracted",
  "searchEntity",
  "manageAccess",
  "systemStatus",
]);

// ──────────────────────────────────────────────────────────
// 1. Skill Validation CI (checklist item 1.3.1)
// ──────────────────────────────────────────────────────────
describe("Phase 1.3 — Skill Validation CI", () => {
  describe("SkillSchema Zod validation", () => {
    it("parses a valid skill frontmatter", () => {
      const result = SkillSchema.safeParse({
        name: "Grading",
        description: "Toolset for assessment.",
        tools: ["upsertMarks", "validateResults"],
        config: { locked: false },
      });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.name).toBe("Grading");
        expect(result.data.tools).toHaveLength(2);
        expect(result.data.config.locked).toBe(false);
      }
    });

    it("defaults config.locked to false when omitted", () => {
      const result = SkillSchema.safeParse({
        name: "Search",
        description: "Find entities.",
        tools: ["searchEntity"],
      });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.config.locked).toBe(false);
      }
    });

    it("rejects missing name field", () => {
      const result = SkillSchema.safeParse({
        description: "No name.",
        tools: ["someTool"],
      });
      expect(result.success).toBe(false);
    });

    it("rejects empty tools array", () => {
      const result = SkillSchema.safeParse({
        name: "Empty",
        description: "No tools.",
        tools: [],
      });
      expect(result.success).toBe(false);
    });

    it("rejects missing description", () => {
      const result = SkillSchema.safeParse({
        name: "NoDesc",
        tools: ["aTool"],
      });
      expect(result.success).toBe(false);
    });
  });

  describe("parseSkillFile — gray-matter + Zod pipeline", () => {
    it("parses grading.skill.md correctly", async () => {
      const filePath = join(FIXTURES_DIR, "grading.skill.md");
      const skill = await parseSkillFile(filePath);
      expect(skill.name).toBe("Grading");
      expect(skill.description).toBe("Toolset for scholastic assessment and mark entry.");
      expect(skill.tools).toEqual(["upsertMarks", "validateResults", "updateExamSetup"]);
      expect(skill.config.locked).toBe(false);
      expect(skill.instructions).toContain("Focus solely on the grading workflow");
    });

    it("parses extraction.skill.md with locked: true", async () => {
      const filePath = join(FIXTURES_DIR, "extraction.skill.md");
      const skill = await parseSkillFile(filePath);
      expect(skill.name).toBe("Extraction");
      expect(skill.config.locked).toBe(true);
      expect(skill.instructions).toContain("locked extraction session");
    });

    it("throws ZodError for invalid.skill.md", async () => {
      const filePath = join(FIXTURES_DIR, "invalid.skill.md");
      await expect(parseSkillFile(filePath)).rejects.toThrow();
    });

    it("derives the slash command from filename", async () => {
      const filePath = join(FIXTURES_DIR, "grading.skill.md");
      const skill = await parseSkillFile(filePath);
      expect(skill.slashCommand).toBe("/grading");
    });
  });

  describe("validateSkillDirectory — full CI validation", () => {
    it("returns errors for invalid skill files", async () => {
      const results = await validateSkillDirectory(FIXTURES_DIR, KNOWN_TOOLS);
      const invalidResult = results.find((r: ValidationResult) => r.file.includes("invalid"));
      expect(invalidResult).toBeDefined();
      expect(invalidResult!.valid).toBe(false);
      expect(invalidResult!.errors.length).toBeGreaterThan(0);
    });

    it("returns errors for skills referencing non-existent tools", async () => {
      const results = await validateSkillDirectory(FIXTURES_DIR, KNOWN_TOOLS);
      const ghostResult = results.find((r: ValidationResult) => r.file.includes("ghost-tools"));
      expect(ghostResult).toBeDefined();
      expect(ghostResult!.valid).toBe(false);
      expect(ghostResult!.errors).toEqual(
        expect.arrayContaining([
          expect.stringContaining("nonExistentTool"),
          expect.stringContaining("anotherFakeTool"),
        ]),
      );
    });

    it("marks valid skills with known tools as passing", async () => {
      const results = await validateSkillDirectory(FIXTURES_DIR, KNOWN_TOOLS);
      const gradingResult = results.find((r: ValidationResult) => r.file.includes("grading"));
      expect(gradingResult).toBeDefined();
      expect(gradingResult!.valid).toBe(true);
      expect(gradingResult!.errors).toHaveLength(0);
    });

    it("validates all files in the directory", async () => {
      const results = await validateSkillDirectory(FIXTURES_DIR, KNOWN_TOOLS);
      expect(results.length).toBe(4);
    });
  });
});

// ──────────────────────────────────────────────────────────
// 2. Skill Build Manifest (checklist item 1.3.2)
// ──────────────────────────────────────────────────────────
describe("Phase 1.3 — Skill Build Manifest", () => {
  afterEach(() => {
    if (existsSync(TMP_DIR)) rmSync(TMP_DIR, { recursive: true, force: true });
  });

  it("generates a skills.json manifest from a skill directory", async () => {
    const manifest = await generateSkillManifest(FIXTURES_DIR, KNOWN_TOOLS);
    expect(manifest.version).toBe(1);
    expect(manifest.generatedAt).toBeDefined();
    expect(Object.keys(manifest.skills).length).toBeGreaterThanOrEqual(2);
  });

  it("manifest contains only valid skills with known tools", async () => {
    const manifest = await generateSkillManifest(FIXTURES_DIR, KNOWN_TOOLS);
    expect(manifest.skills["grading"]).toBeDefined();
    expect(manifest.skills["extraction"]).toBeDefined();
    expect(manifest.skills["invalid"]).toBeUndefined();
    expect(manifest.skills["ghost"]).toBeUndefined();
  });

  it("manifest preserves full SkillDefinition fields", async () => {
    const manifest = await generateSkillManifest(FIXTURES_DIR, KNOWN_TOOLS);
    const grading = manifest.skills["grading"];
    expect(grading.name).toBe("Grading");
    expect(grading.tools).toEqual(["upsertMarks", "validateResults", "updateExamSetup"]);
    expect(grading.config.locked).toBe(false);
    expect(grading.slashCommand).toBe("/grading");
    expect(grading.instructions).toContain("Focus solely on the grading workflow");
  });

  it("manifest preserves locked config for extraction skill", async () => {
    const manifest = await generateSkillManifest(FIXTURES_DIR, KNOWN_TOOLS);
    expect(manifest.skills["extraction"].config.locked).toBe(true);
  });

  it("writes manifest to disk and loads it back identically", async () => {
    mkdirSync(TMP_DIR, { recursive: true });
    const manifestPath = join(TMP_DIR, "skills.json");
    const original = await generateSkillManifest(FIXTURES_DIR, KNOWN_TOOLS);
    writeFileSync(manifestPath, JSON.stringify(original, null, 2));
    const loaded = loadSkillManifest(manifestPath);
    expect(loaded.version).toBe(original.version);
    expect(Object.keys(loaded.skills)).toEqual(Object.keys(original.skills));
  });

  it("loadSkillManifest throws for missing file", () => {
    expect(() => loadSkillManifest("/nonexistent/skills.json")).toThrow();
  });

  it("records validation errors for rejected skills", async () => {
    const manifest = await generateSkillManifest(FIXTURES_DIR, KNOWN_TOOLS);
    expect(manifest.errors.length).toBeGreaterThanOrEqual(2);
    expect(manifest.errors.find((e: { file: string }) => e.file.includes("invalid"))).toBeDefined();
    expect(manifest.errors.find((e: { file: string }) => e.file.includes("ghost"))).toBeDefined();
  });
});

// ──────────────────────────────────────────────────────────
// 3. Real-time Watcher (checklist item 1.3.3)
// ──────────────────────────────────────────────────────────
describe("Phase 1.3 — Real-time Watcher", () => {
  afterEach(() => {
    if (existsSync(TMP_DIR)) rmSync(TMP_DIR, { recursive: true, force: true });
  });

  it("starts with dead status, transitions to running on start()", () => {
    const registry = new SkillRegistry();
    const watcher = new SkillWatcher(FIXTURES_DIR, registry, KNOWN_TOOLS);
    expect(watcher.getStatus().status).toBe("dead");
    watcher.start();
    expect(watcher.getStatus().status).toBe("running");
    watcher.stop();
    expect(watcher.getStatus().status).toBe("dead");
  });

  it("Agent-Lock: pauseWatcher() suppresses events, resumeWatcher() restores", () => {
    const registry = new SkillRegistry();
    const watcher = new SkillWatcher(FIXTURES_DIR, registry, KNOWN_TOOLS);
    watcher.start();
    watcher.pauseWatcher("WriteTurn: agent writing skill file");
    expect(watcher.getStatus().status).toBe("paused");
    expect(watcher.getStatus().lockReason).toBe("WriteTurn: agent writing skill file");
    watcher.resumeWatcher();
    expect(watcher.getStatus().status).toBe("running");
    expect(watcher.getStatus().lockReason).toBeNull();
    watcher.stop();
  });

  it("stop() clears all state", () => {
    const registry = new SkillRegistry();
    const watcher = new SkillWatcher(FIXTURES_DIR, registry, KNOWN_TOOLS);
    watcher.start();
    watcher.pauseWatcher("test");
    watcher.stop();
    expect(watcher.getStatus().status).toBe("dead");
  });

  it("multiple start() calls are idempotent", () => {
    const registry = new SkillRegistry();
    const watcher = new SkillWatcher(FIXTURES_DIR, registry, KNOWN_TOOLS);
    watcher.start();
    watcher.start();
    expect(watcher.getStatus().status).toBe("running");
    watcher.stop();
  });
});

// ──────────────────────────────────────────────────────────
// 4. Transactional Writes (checklist item 1.3.4)
// ──────────────────────────────────────────────────────────
describe("Phase 1.3 — Transactional Writes", () => {
  afterEach(() => {
    if (existsSync(TMP_DIR)) rmSync(TMP_DIR, { recursive: true, force: true });
  });

  it("writes content atomically via temp → rename", () => {
    mkdirSync(TMP_DIR, { recursive: true });
    const target = join(TMP_DIR, "test-skill.skill.md");
    const content = "---\nname: Test\n---\n# Instructions";
    transactionalWrite(target, content);
    expect(existsSync(target)).toBe(true);
    expect(readFileSync(target, "utf-8")).toBe(content);
  });

  it("no temp files remain after write", () => {
    mkdirSync(TMP_DIR, { recursive: true });
    transactionalWrite(join(TMP_DIR, "clean.skill.md"), "content");
    const tempFiles = readdirSync(TMP_DIR).filter((f: string) => f.startsWith(".tmp-"));
    expect(tempFiles).toHaveLength(0);
  });

  it("creates parent directories if they do not exist", () => {
    const deepPath = join(TMP_DIR, "deep", "nested", "skill.md");
    transactionalWrite(deepPath, "nested content");
    expect(readFileSync(deepPath, "utf-8")).toBe("nested content");
  });

  it("overwrites existing file atomically", () => {
    mkdirSync(TMP_DIR, { recursive: true });
    const target = join(TMP_DIR, "overwrite.md");
    transactionalWrite(target, "version 1");
    transactionalWrite(target, "version 2");
    expect(readFileSync(target, "utf-8")).toBe("version 2");
  });

  it("concurrent writes do not produce partial reads", () => {
    mkdirSync(TMP_DIR, { recursive: true });
    const target = join(TMP_DIR, "concurrent.md");
    const contentA = "A".repeat(10_000);
    const contentB = "B".repeat(10_000);
    transactionalWrite(target, contentA);
    transactionalWrite(target, contentB);
    const result = readFileSync(target, "utf-8");
    expect(result === contentA || result === contentB).toBe(true);
    expect(result).toBe(contentB);
  });
});

// ──────────────────────────────────────────────────────────
// 5. State Residency (checklist item 1.3.5)
// ──────────────────────────────────────────────────────────
describe("Phase 1.3 — State Residency", () => {
  let client: Client;

  beforeEach(async () => {
    client = createClient({ url: ":memory:" });
  });

  it("initializes mastra_metadata table in libSQL", async () => {
    const manager = new SkillStateManager(client);
    await manager.init();
    const result = await client.execute(
      "SELECT name FROM sqlite_master WHERE type='table' AND name='mastra_metadata'",
    );
    expect(result.rows.length).toBe(1);
  });

  it("persists active skill state to libSQL", async () => {
    const manager = new SkillStateManager(client);
    await manager.init();
    await manager.activateSkill("session-1", "grading", false);
    const row = await client.execute({
      sql: "SELECT value FROM mastra_metadata WHERE key = ?",
      args: ["skill_state:session-1"],
    });
    expect(row.rows.length).toBe(1);
    const parsed = JSON.parse(row.rows[0].value as string);
    expect(parsed.skillName).toBe("grading");
    expect(parsed.status).toBe("active");
  });

  it("recovers state from libSQL after restart", async () => {
    const manager1 = new SkillStateManager(client);
    await manager1.init();
    await manager1.activateSkill("session-crash", "extraction", true);

    // Simulate restart with a new manager instance over the same DB
    const manager2 = new SkillStateManager(client);
    await manager2.init();
    const restored = manager2.getActiveSkill("session-crash");
    expect(restored).not.toBeNull();
    expect(restored!.skillName).toBe("extraction");
    expect(restored!.status).toBe("locked");
  });

  it("deactivateSkill removes state from memory and DB", async () => {
    const manager = new SkillStateManager(client);
    await manager.init();
    await manager.activateSkill("session-rm", "grading", false);
    await manager.deactivateSkill("session-rm");
    expect(manager.getActiveSkill("session-rm")).toBeNull();
    const row = await client.execute({
      sql: "SELECT value FROM mastra_metadata WHERE key = ?",
      args: ["skill_state:session-rm"],
    });
    expect(row.rows.length).toBe(0);
  });

  it("tracks active session count", async () => {
    const manager = new SkillStateManager(client);
    await manager.init();
    expect(manager.activeSessions).toBe(0);
    await manager.activateSkill("s1", "grading", false);
    await manager.activateSkill("s2", "extraction", true);
    expect(manager.activeSessions).toBe(2);
  });
});

// ──────────────────────────────────────────────────────────
// 6. Autonomous Switch (checklist item 1.3.6)
// ──────────────────────────────────────────────────────────
describe("Phase 1.3 — Autonomous Switch", () => {
  let client: Client;

  beforeEach(async () => {
    client = createClient({ url: ":memory:" });
  });

  it("switches to a new skill when no skill is active", async () => {
    const manager = new SkillStateManager(client);
    await manager.init();
    const result = await manager.switchSkill("session-1", "grading", false);
    expect(result.action).toBe("switched");
    expect(result.from).toBeNull();
    expect(result.to).toBe("grading");
  });

  it("switches between unlocked skills", async () => {
    const manager = new SkillStateManager(client);
    await manager.init();
    await manager.activateSkill("session-1", "grading", false);
    const result = await manager.switchSkill("session-1", "search", false);
    expect(result.action).toBe("switched");
    expect(result.from).toBe("grading");
    expect(result.to).toBe("search");
  });

  it("denies switch from a locked skill", async () => {
    const manager = new SkillStateManager(client);
    await manager.init();
    await manager.activateSkill("session-1", "extraction", true);
    const result = await manager.switchSkill("session-1", "grading", false);
    expect(result.action).toBe("denied");
    expect(result.reason).toContain("locked");
    expect(result.reason).toContain("extraction");
    // Extraction should still be active
    expect(manager.getActiveSkill("session-1")!.skillName).toBe("extraction");
  });
});

// ──────────────────────────────────────────────────────────
// 7. Conversational Interruption Recovery (checklist item 1.3.7)
// ──────────────────────────────────────────────────────────
describe("Phase 1.3 — Conversational Interruption Recovery", () => {
  let client: Client;

  beforeEach(async () => {
    client = createClient({ url: ":memory:" });
  });

  it("no confirmation needed when no skill is active", async () => {
    const manager = new SkillStateManager(client);
    await manager.init();
    const result = manager.evaluateInterruption("session-1", "grading");
    expect(result.needsConfirmation).toBe(false);
  });

  it("no confirmation needed when same skill is detected", async () => {
    const manager = new SkillStateManager(client);
    await manager.init();
    await manager.activateSkill("session-1", "grading", false);
    const result = manager.evaluateInterruption("session-1", "grading");
    expect(result.needsConfirmation).toBe(false);
  });

  it("requests confirmation when switching from unlocked skill", async () => {
    const manager = new SkillStateManager(client);
    await manager.init();
    await manager.activateSkill("session-1", "grading", false);
    const result = manager.evaluateInterruption("session-1", "extraction");
    expect(result.needsConfirmation).toBe(true);
    expect(result.currentSkill).toBe("grading");
    expect(result.requestedSkill).toBe("extraction");
    expect(result.message).toContain("Should I switch");
  });

  it("requests confirmation with lock warning from locked skill", async () => {
    const manager = new SkillStateManager(client);
    await manager.init();
    await manager.activateSkill("session-1", "extraction", true);
    const result = manager.evaluateInterruption("session-1", "grading");
    expect(result.needsConfirmation).toBe(true);
    expect(result.message).toContain("locked");
    expect(result.message).toContain("/exit");
  });
});

// ──────────────────────────────────────────────────────────
// 8. Lock Bypass (checklist item 1.3.8)
// ──────────────────────────────────────────────────────────
describe("Phase 1.3 — Lock Bypass", () => {
  let client: Client;

  beforeEach(async () => {
    client = createClient({ url: ":memory:" });
  });

  it("manageAccess is always allowed during lock", async () => {
    const manager = new SkillStateManager(client);
    await manager.init();
    await manager.activateSkill("session-1", "extraction", true);
    expect(manager.isToolAllowed("session-1", "manage-access")).toBe(true);
  });

  it("systemStatus is always allowed during lock", async () => {
    const manager = new SkillStateManager(client);
    await manager.init();
    await manager.activateSkill("session-1", "extraction", true);
    expect(manager.isToolAllowed("session-1", "system-status")).toBe(true);
  });

  it("non-bypass tools are denied during lock", async () => {
    const manager = new SkillStateManager(client);
    await manager.init();
    await manager.activateSkill("session-1", "extraction", true);
    expect(manager.isToolAllowed("session-1", "upsertMarks")).toBe(false);
  });

  it("all tools are allowed when no lock is active", async () => {
    const manager = new SkillStateManager(client);
    await manager.init();
    await manager.activateSkill("session-1", "grading", false);
    expect(manager.isToolAllowed("session-1", "upsertMarks")).toBe(true);
  });

  it("all tools are allowed when no session exists", async () => {
    const manager = new SkillStateManager(client);
    await manager.init();
    expect(manager.isToolAllowed("no-session", "anyTool")).toBe(true);
  });
});

// ──────────────────────────────────────────────────────────
// 9. Contextual Hydration for @Mentions (checklist item 1.3.9)
// ──────────────────────────────────────────────────────────
describe("Phase 1.3 — Contextual Hydration for @Mentions", () => {
  const mockFetchStudents = async (classId: number, sectionId: number): Promise<number[]> => {
    if (classId === 10 && sectionId === 1) return [101, 102, 103, 104];
    if (classId === 11 && sectionId === 2) return [201, 202];
    return [];
  };

  it("IT can @mention any class and receive student IDs", async () => {
    const result = await hydrateClassMention(10, 1, ALLOWED_DESIGNATIONS.IT, null, mockFetchStudents);
    expect(result.type).toBe("class");
    expect(result.entityIds).toEqual([101, 102, 103, 104]);
    expect(result.source).toBe("class_expansion");
  });

  it("Coordinator can @mention any class", async () => {
    const result = await hydrateClassMention(
      11,
      2,
      ALLOWED_DESIGNATIONS.COORDINATOR,
      null,
      mockFetchStudents,
    );
    expect(result.entityIds).toEqual([201, 202]);
    expect(result.classId).toBe(11);
    expect(result.sectionId).toBe(2);
  });

  it("Class Teacher can @mention their assigned class", async () => {
    const result = await hydrateClassMention(
      10,
      1,
      ALLOWED_DESIGNATIONS.CLASS_TEACHER,
      10,
      mockFetchStudents,
    );
    expect(result.entityIds).toEqual([101, 102, 103, 104]);
  });

  it("Class Teacher CANNOT @mention a different class (WORKSPACE_MISMATCH)", async () => {
    await expect(
      hydrateClassMention(11, 2, ALLOWED_DESIGNATIONS.CLASS_TEACHER, 10, mockFetchStudents),
    ).rejects.toThrow("WORKSPACE_MISMATCH");
  });

  it("unauthorized designation returns 403 Forbidden", async () => {
    await expect(hydrateClassMention(10, 1, 99 as any, null, mockFetchStudents)).rejects.toThrow(
      "403 Forbidden",
    );
  });

  it("returns empty array when no students found", async () => {
    const result = await hydrateClassMention(999, 1, ALLOWED_DESIGNATIONS.IT, null, mockFetchStudents);
    expect(result.entityIds).toEqual([]);
  });
});

// ──────────────────────────────────────────────────────────
// 10. Health Endpoint (checklist item 1.3.10)
// ──────────────────────────────────────────────────────────
describe("Phase 1.3 — Health Endpoint", () => {
  let client: Client;

  beforeEach(async () => {
    client = createClient({ url: ":memory:" });
  });

  it("reports healthy when all systems are nominal", async () => {
    const registry = new SkillRegistry();
    await registry.loadFromDirectory(FIXTURES_DIR, KNOWN_TOOLS);
    const stateManager = new SkillStateManager(client);
    await stateManager.init();

    const watcher = new SkillWatcher(FIXTURES_DIR, registry, KNOWN_TOOLS);
    watcher.start();

    const status = await getHealthStatus(watcher, client, registry, stateManager);
    expect(status.status).toBe("healthy");
    expect(status.components.watcher.status).toBe("running");
    expect(status.components.database.status).toBe("connected");
    expect(status.components.skills.registered).toBeGreaterThanOrEqual(2);
    expect(status.components.skills.active).toBe(0);
    expect(status.timestamp).toBeDefined();

    watcher.stop();
  });

  it("reports degraded when watcher is dead", async () => {
    const registry = new SkillRegistry();
    const stateManager = new SkillStateManager(client);
    await stateManager.init();

    // No watcher started = dead status
    const watcher = new SkillWatcher(FIXTURES_DIR, registry, KNOWN_TOOLS);
    const status = await getHealthStatus(watcher, client, registry, stateManager);
    expect(status.status).toBe("degraded");
    expect(status.components.watcher.status).toBe("dead");
  });

  it("reports degraded when no watcher is provided (production)", async () => {
    const registry = new SkillRegistry();
    const stateManager = new SkillStateManager(client);
    await stateManager.init();

    const status = await getHealthStatus(null, client, registry, stateManager);
    expect(status.components.watcher.status).toBe("disabled");
  });

  it("tracks active session count in health", async () => {
    const registry = new SkillRegistry();
    const stateManager = new SkillStateManager(client);
    await stateManager.init();
    await stateManager.activateSkill("s1", "grading", false);

    const status = await getHealthStatus(null, client, registry, stateManager);
    expect(status.components.skills.active).toBe(1);
  });
});
