import { describe, expect, it } from "vitest";
import { isTabVisible } from "$lib/components/settings/_helpers.svelte";

// Mirrors the role derivation in src/routes/+layout.server.ts:
//   isAdministrator === true → "admin"
//   designation === "it"     → "it"
//   else                      → designation (or null for anonymous)
//
// The Platform tab in src/lib/components/settings/index.svelte gates on
// allowedRoles = ["admin", "it"], so this test exercises both the
// pass-cases (admin/it) and the deny-cases (everyone else).
describe("settings tab visibility (Platform tab role gating)", () => {
	const PLATFORM_ALLOWED = ["admin", "it"] as const;

	describe("anonymous / logged-out users", () => {
		it("hides the Platform tab when role is null", () => {
			expect(isTabVisible(PLATFORM_ALLOWED, null)).toBe(false);
		});
	});

	describe("authorized roles", () => {
		it("shows the Platform tab to admins", () => {
			expect(isTabVisible(PLATFORM_ALLOWED, "admin")).toBe(true);
		});

		it("shows the Platform tab to IT staff", () => {
			expect(isTabVisible(PLATFORM_ALLOWED, "it")).toBe(true);
		});
	});

	describe("unauthorized roles (the manual-verification deny cases)", () => {
		it("hides the Platform tab from class teachers", () => {
			expect(isTabVisible(PLATFORM_ALLOWED, "class_teacher")).toBe(false);
		});

		it("hides the Platform tab from principals", () => {
			expect(isTabVisible(PLATFORM_ALLOWED, "principal")).toBe(false);
		});

		it("hides the Platform tab from generic students", () => {
			expect(isTabVisible(PLATFORM_ALLOWED, "student")).toBe(false);
		});

		it("hides the Platform tab from any unrecognized role string", () => {
			expect(isTabVisible(PLATFORM_ALLOWED, "guest")).toBe(false);
			expect(isTabVisible(PLATFORM_ALLOWED, "")).toBe(false);
			expect(isTabVisible(PLATFORM_ALLOWED, "ADMIN")).toBe(false);
		});
	});

	describe("ungated tabs (the existing General/Appearance/Providers/Models)", () => {
		it("shows an ungated tab to every role, including null", () => {
			expect(isTabVisible(undefined, null)).toBe(true);
			expect(isTabVisible(undefined, "class_teacher")).toBe(true);
			expect(isTabVisible(undefined, "admin")).toBe(true);
		});

		it("shows a tab with an empty allowedRoles list to every role", () => {
			expect(isTabVisible([], null)).toBe(true);
			expect(isTabVisible([], "class_teacher")).toBe(true);
			expect(isTabVisible([], "admin")).toBe(true);
		});
	});

	describe("subset semantics", () => {
		it("treats allowedRoles as a whitelist, not a blacklist", () => {
			expect(isTabVisible(["admin"], "admin")).toBe(true);
			expect(isTabVisible(["admin"], "it")).toBe(false);
		});

		it("treats case as significant (matches the literal values used in +layout.server.ts)", () => {
			expect(isTabVisible(PLATFORM_ALLOWED, "Admin")).toBe(false);
			expect(isTabVisible(PLATFORM_ALLOWED, "IT")).toBe(false);
		});
	});
});
