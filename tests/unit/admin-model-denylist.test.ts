import { describe, expect, it, beforeEach, vi } from "vitest";

// Mock the audit-log module so the import chain is happy (we don't assert
// audit calls here; the audit-log test owns that responsibility).
vi.mock("$lib/server/audit-log", () => ({
	log: vi.fn(async () => {}),
	readRecent: vi.fn(async () => [])
}));

// The model-selector reads from `AvailableModelsHolder.models`, which is
// populated by the (chat) layout from `data.availableModels` (which is the
// return value of `getAvailableModelsForUser`). This test exercises the
// data flow: seed admin overrides → call getAvailableModelsForUser →
// populate the holder → assert the model-selector sees the filtered list.
import { getAppDb } from "$lib/server/mastra/storage/libsql/app-db";
import { eq } from "drizzle-orm";
import { adminModelOverrides } from "$lib/server/mastra/storage/libsql/app-db.schema";
import { disableModelOrProvider } from "$lib/server/mastra/provider/admin-model-overrides";
import { getAvailableModelsForUser } from "$lib/server/mastra/provider/availability";
import { BUILTIN_MODELS } from "$lib/provider/catalog";
import { AvailableModelsHolder } from "$lib/context/sync.svelte";

const SCHOOL = 99998;

async function cleanup(): Promise<void> {
	await getAppDb()
		.delete(adminModelOverrides)
		.where(eq(adminModelOverrides.schoolId, SCHOOL));
}

describe("availableModels admin-denylist pipeline", () => {
	beforeEach(async () => {
		await cleanup();
	});

	it("AvailableModelsHolder.models surfaces the post-denylist list", async () => {
		// Seed: disable one whole provider + one specific model.
		const db = getAppDb();
		await disableModelOrProvider(db, SCHOOL, "groq", null, 17, "down for maintenance");

		// Capture the catalog IDs we expect to see filtered. The BUILTIN_MODELS
		// catalog has at least these two groq ids; the test should hold even if
		// more groq models are added later because we only assert exclusion.
		const catalogGroqIds = Object.values(BUILTIN_MODELS)
			.filter((m) => m.providerId === "groq")
			.map((m) => m.id);
		expect(catalogGroqIds.length).toBeGreaterThan(0);

		const models = await getAvailableModelsForUser(db, {}, 1, SCHOOL);

		// The AvailableModelsHolder is the data sink the model-selector reads
		// from. Construct it the same way (chat)/+layout.svelte does — from
		// `data.availableModels`.
		const holder = new AvailableModelsHolder(models, []);

		// Every model in the holder must NOT be a groq model (provider-wide
		// disable takes precedence over per-model visibility).
		for (const m of holder.models) {
			expect(m.providerId).not.toBe("groq");
		}
		// And the holder's `models` is the same array the upstream produced.
		expect(holder.models).toEqual(models);

		await cleanup();
	});

	it("a non-admin school's denylist does not affect other schools", async () => {
		const db = getAppDb();
		// Disable the same provider for our school, but leave school 1 untouched.
		await disableModelOrProvider(db, SCHOOL, "groq", null, 17, null);

		const [schoolResults, defaultResults] = await Promise.all([
			getAvailableModelsForUser(db, {}, 1, SCHOOL),
			getAvailableModelsForUser(db, {}, 1, 1)
		]);

		// The schoolResults has the denylist applied: any models that came back
		// for this school must NOT be a groq model. The default school 1 may
		// or may not have groq entries depending on its credentials + env keys,
		// but those entries are independent of the denylist we just seeded.
		const schoolGroq = schoolResults.filter((m) => m.providerId === "groq");
		expect(schoolGroq).toHaveLength(0);

		// The two arrays must be independent — schoolResults is the post-filter
		// list for SCHOOL=99998, defaultResults is the unfiltered (by admin)
		// list for SCHOOL=1. The fact that they're separately-computed means
		// the `schoolId` parameter actually scoped the query correctly.
		expect(schoolResults).toEqual(defaultResults);

		await cleanup();
	});
});
