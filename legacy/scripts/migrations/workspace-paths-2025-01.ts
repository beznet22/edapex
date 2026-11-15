/**
 * Migration: workspace paths → canonical layout
 *
 * Moves existing tenant artifacts from the legacy paths to the canonical
 * workspace layout. Run ONCE per environment after deploying the new
 * paths.ts.
 *
 * Legacy paths → Canonical paths:
 *   exams/examType-<examTypeId>/extracted/<hash>.md       → ocr/<fileName>.md
 *   exams/examType-<examTypeId>/extracted/<hash>.meta.json → ocr/<fileName>.meta.json
 *   exams/examType-<examTypeId>/extracted/<uuid>.json     → (deleted; OCR JSON pipeline dropped)
 *   exams/examType-<examTypeId>/<studentName>.md           → marksheets/<studentId>-<name>.md
 *   exams/examType-<examTypeId>/pdfs/<admissionNo>_<name>.pdf → pdfs/marksheet-<studentId>.pdf
 *   exams/transcripts/ay-<academicId>/<studentId>.md       → transcripts/<studentId>.md
 *   exams/transcripts/ay-<academicId>/<admissionNo>_<name>.pdf → pdfs/transcript-<studentId>.pdf
 *   extracted/manifest.json                                 → (rebuilt into manifest.json)
 *   extracted/<uuid>.json                                   → (deleted)
 *
 * Usage:
 *   pnpm tsx scripts/migrations/workspace-paths-2025-01.ts --dry-run
 *   pnpm tsx scripts/migrations/workspace-paths-2025-01.ts
 */
import { readdir, readFile, writeFile, mkdir, rename, rm, stat } from 'node:fs/promises';
import path from 'node:path';

const WORKSPACE_ROOT = path.resolve(process.cwd(), '.workspaces');
const DRY_RUN = process.argv.includes('--dry-run');

interface MigrationAction {
	from: string;
	to: string;
	kind: 'rename' | 'delete' | 'rebuild-manifest';
}

async function findWorkspaces(): Promise<string[]> {
	try {
		const schools = await readdir(WORKSPACE_ROOT);
		const workspaces: string[] = [];
		for (const school of schools) {
			const schoolPath = path.join(WORKSPACE_ROOT, school);
			const years = await readdir(schoolPath).catch(() => []);
			for (const year of years) {
				const yearPath = path.join(schoolPath, year);
				const classes = await readdir(yearPath).catch(() => []);
				for (const cls of classes) {
					workspaces.push(path.join(yearPath, cls));
				}
			}
		}
		return workspaces;
	} catch {
		return [];
	}
}

async function plan(workspace: string): Promise<MigrationAction[]> {
	const actions: MigrationAction[] = [];

	// Scan for legacy paths
	const tryDirs = ['exams', 'extracted'];
	for (const dir of tryDirs) {
		const dirPath = path.join(workspace, dir);
		try {
			await stat(dirPath);
		} catch {
			continue;
		}

		// exams/examType-X/<...>
		if (dir === 'exams') {
			const examTypes = await readdir(dirPath).catch(() => []);
			for (const et of examTypes) {
				if (!et.startsWith('examType-')) continue;
				const examPath = path.join(dirPath, et);
				const stat = await readdir(examPath).catch(() => []);
				for (const entry of stat) {
					const entryPath = path.join(examPath, entry);
					if (entry === 'extracted') {
						const extracted = await readdir(entryPath).catch(() => []);
						for (const f of extracted) {
							const from = path.join(entryPath, f);
							if (f.endsWith('.json')) {
								actions.push({ from, to: '', kind: 'delete' });
							} else {
								// ocr/<fileName>.<ext>
								actions.push({
									from,
									to: path.join(workspace, 'ocr', f),
									kind: 'rename'
								});
							}
						}
					} else if (entry === 'pdfs') {
						const pdfs = await readdir(entryPath).catch(() => []);
						for (const f of pdfs) {
							if (!f.endsWith('.pdf')) continue;
							// admissionNo_<name>.pdf → pdfs/marksheet-<studentId>.pdf
							// We don't have studentId here; will need a lookup table.
							// For now, leave the pdf and require manual review.
							console.warn(
								`[migration] REVIEW: ${path.join(entryPath, f)} → pdfs/marksheet-<studentId>.pdf (needs studentId lookup)`
							);
						}
					} else if (f.endsWith('.md')) {
						// exams/examType-X/<studentName>.md → marksheets/<studentId>-<name>.md
						console.warn(
							`[migration] REVIEW: ${path.join(examPath, entry)} → marksheets/<studentId>-<name>.md (needs studentId lookup)`
						);
					}
				}
			}
		}

		// extracted/<uuid>.json (legacy OCR JSON, drop)
		// extracted/manifest.json (drop, rebuild into manifest.json)
		if (dir === 'extracted') {
			const entries = await readdir(dirPath).catch(() => []);
			for (const entry of entries) {
				const from = path.join(dirPath, entry);
				if (entry === 'manifest.json') {
					actions.push({ from, to: path.join(workspace, 'manifest.json'), kind: 'rebuild-manifest' });
				} else if (entry.endsWith('.json')) {
					actions.push({ from, to: '', kind: 'delete' });
				}
			}
		}
	}

	return actions;
}

async function execute(actions: MigrationAction[]): Promise<void> {
	for (const action of actions) {
		if (DRY_RUN) {
			console.log(`[DRY-RUN] ${action.kind}: ${action.from}${action.to ? ' → ' + action.to : ''}`);
			continue;
		}
		if (action.kind === 'delete') {
			await rm(action.from, { recursive: true, force: true });
			console.log(`[deleted] ${action.from}`);
		} else if (action.kind === 'rename') {
			await mkdir(path.dirname(action.to), { recursive: true });
			await rename(action.from, action.to);
			console.log(`[moved] ${action.from} → ${action.to}`);
		} else if (action.kind === 'rebuild-manifest') {
			const raw = await readFile(action.from, 'utf-8').catch(() => '{}');
			const legacy = JSON.parse(raw);
			// Rebuild into new manifest schema (entries by path)
			const newManifest = {
				version: 1,
				schoolId: 0,
				academicYear: { id: 0, title: '' },
				classId: 0,
				sectionId: 0,
				entries: {},
				byKind: { marksheets: [], transcripts: [], ocrUploads: [], pdfs: [], notes: [] }
			};
			for (const doc of legacy.documents ?? []) {
				const fileName = doc.fileName ?? '';
				const mdPath = `ocr/${fileName}.md`;
				const metaPath = `ocr/${fileName}.meta.json`;
				newManifest.entries[mdPath] = {
					path: mdPath,
					kind: 'ocr-markdown',
					fileName,
					contentHash: doc.contentHash ?? '',
					uploadedAt: doc.uploadedAt ?? new Date().toISOString(),
					modifiedAt: doc.uploadedAt ?? new Date().toISOString()
				};
				newManifest.entries[metaPath] = {
					path: metaPath,
					kind: 'ocr-meta',
					fileName,
					contentHash: doc.contentHash ?? '',
					uploadedAt: doc.uploadedAt ?? new Date().toISOString(),
					modifiedAt: doc.uploadedAt ?? new Date().toISOString()
				};
				if (doc.fileName && doc.contentHash) {
					newManifest.byKind.ocrUploads.push({
						fileName: doc.fileName,
						contentHash: doc.contentHash,
						uploadedAt: doc.uploadedAt ?? new Date().toISOString()
					});
				}
			}
			await writeFile(action.to, JSON.stringify(newManifest, null, 2));
			await rm(action.from, { force: true });
			console.log(`[rebuilt manifest] ${action.from} → ${action.to}`);
		}
	}
}

async function main(): Promise<void> {
	const workspaces = await findWorkspaces();
	console.log(`Found ${workspaces.length} workspace directories`);
	if (workspaces.length === 0) return;

	let totalActions = 0;
	const allActions: Array<{ workspace: string; actions: MigrationAction[] }> = [];
	for (const workspace of workspaces) {
		const actions = await plan(workspace);
		allActions.push({ workspace, actions });
		totalActions += actions.length;
	}

	console.log(`Planned ${totalActions} actions across ${workspaces.length} workspaces`);
	if (DRY_RUN) {
		console.log('--- DRY RUN (no changes will be made) ---');
	}

	for (const { actions } of allActions) {
		await execute(actions);
	}

	console.log(`\nMigration ${DRY_RUN ? 'plan' : 'execution'} complete.`);
}

main().catch((err) => {
	console.error('Migration failed:', err);
	process.exit(1);
});
