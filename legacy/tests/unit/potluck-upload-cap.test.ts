import { describe, expect, it } from "vitest";
import {
	assertUploadSize,
	POTLUCK_MAX_UPLOAD_BYTES,
	PotluckUploadTooLargeError
} from "$lib/server/service/potluck.service";

describe("potluck CSV upload size cap", () => {
	it("POTLUCK_MAX_UPLOAD_BYTES is 5 MB", () => {
		expect(POTLUCK_MAX_UPLOAD_BYTES).toBe(5 * 1024 * 1024);
	});

	it("assertUploadSize accepts payloads exactly at the cap", () => {
		const csv = "x".repeat(POTLUCK_MAX_UPLOAD_BYTES);
		expect(() => assertUploadSize(csv)).not.toThrow();
	});

	it("assertUploadSize rejects payloads just above the cap", () => {
		const csv = "x".repeat(POTLUCK_MAX_UPLOAD_BYTES + 1);
		expect(() => assertUploadSize(csv)).toThrow(PotluckUploadTooLargeError);
	});

	it("assertUploadSize error carries size + max metadata", () => {
		const csv = "x".repeat(POTLUCK_MAX_UPLOAD_BYTES * 2);
		try {
			assertUploadSize(csv);
			throw new Error("expected throw");
		} catch (err) {
			expect(err).toBeInstanceOf(PotluckUploadTooLargeError);
			const e = err as PotluckUploadTooLargeError;
			expect(e.sizeBytes).toBe(POTLUCK_MAX_UPLOAD_BYTES * 2);
			expect(e.maxBytes).toBe(POTLUCK_MAX_UPLOAD_BYTES);
			expect(e.message).toContain(String(POTLUCK_MAX_UPLOAD_BYTES));
		}
	});

	it("assertUploadSize accepts an empty string (no payload yet)", () => {
		expect(() => assertUploadSize("")).not.toThrow();
	});

	it("assertUploadSize accepts realistic CSV-sized payloads (1 KB - 1 MB)", () => {
		for (const size of [1024, 100 * 1024, 1024 * 1024]) {
			expect(() => assertUploadSize("x".repeat(size))).not.toThrow();
		}
	});
});
