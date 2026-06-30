/**
 * In-test filesystem + SMTP capture helpers.
 *
 * Walks the tenant workspace after a workflow run, logs every artifact
 * that was created (or already existed), and asserts the expected
 * manifests.
 */
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { WORKSPACE_ROOT, classDir } from '$lib/server/mastra/storage/workspaces/paths';
import type { TenantContext } from '$lib/server/mastra/tenant-context';

export interface CapturedArtifact {
	relPath: string;
	absPath: string;
	sizeBytes: number;
	mtimeMs: number;
}

/**
 * Walk the tenant workspace tree under .workspaces/ and return every
 * regular file (relative path + absolute path + size).
 */
export async function captureWorkspace(tenant: TenantContext): Promise<CapturedArtifact[]> {
	const baseDir = classDir(tenant);
	const out: CapturedArtifact[] = [];

	async function walk(dir: string): Promise<void> {
		let entries;
		try {
			entries = await fs.readdir(dir, { withFileTypes: true });
		} catch {
			return;
		}
		for (const entry of entries) {
			const abs = path.join(dir, entry.name);
			if (entry.isDirectory()) {
				await walk(abs);
				continue;
			}
			if (!entry.isFile()) continue;
			const stat = await fs.stat(abs);
			const rel = path.relative(baseDir, abs);
			out.push({
				relPath: rel,
				absPath: abs,
				sizeBytes: stat.size,
				mtimeMs: stat.mtimeMs
			});
		}
	}

	await walk(baseDir);
	out.sort((a, b) => a.relPath.localeCompare(b.relPath));
	return out;
}

/**
 * Assert a workspace artifact exists. Returns the captured artifact.
 */
export async function expectArtifact(
	tenant: TenantContext,
	relPath: string
): Promise<CapturedArtifact> {
	const abs = path.join(classDir(tenant), relPath);
	const stat = await fs.stat(abs);
	const sizeBytes = stat.size;
	if (sizeBytes === 0) {
		throw new Error(`EXPECTED_NONEMPTY: ${relPath} is empty`);
	}
	return {
		relPath,
		absPath: abs,
		sizeBytes,
		mtimeMs: stat.mtimeMs
	};
}

export { WORKSPACE_ROOT };
