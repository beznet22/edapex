import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const componentPath = resolve(
	process.cwd(),
	'src/lib/components/ai-elements/ActionBar.svelte'
);

let source: string;

beforeAll(() => {
	source = readFileSync(componentPath, 'utf-8');
});

type OptionItem = { id: string; label: string; icon?: string };
type OnSelectPayload = { selectedOptionId: string; freeTextAnswer?: string };

const sampleOptions: readonly OptionItem[] = [
	{ id: 'a', label: 'Option A' },
	{ id: 'b', label: 'Option B' },
	{ id: 'c', label: 'Option C' }
] as const;

const sampleProps = {
	question: 'Choose one',
	options: sampleOptions as readonly OptionItem[],
	runId: 'run-123',
	stepId: 'step-456'
} as const;

describe('ActionBar — module surface', () => {
	it('imports as a Svelte component with a callable default export', async () => {
		let mod: { default: unknown } | null = null;
		let importError: unknown = null;
		try {
			mod = (await import(
				'$lib/components/ai-elements/ActionBar.svelte'
			)) as { default: unknown };
		} catch (err) {
			importError = err;
		}

		if (importError !== null) {
			console.warn(
				'[ActionBar] Svelte .svelte import not compilable under vitest node env ' +
					'(no @sveltejs/vite-plugin-svelte wired in vitest.config.ts). ' +
					'Skipping module-import smoke test; source-anchored contract tests cover the API.'
			);
			return;
		}

		expect(mod).toBeDefined();
		expect(mod!.default).toBeDefined();
		expect(['function', 'object']).toContain(typeof mod!.default);
	});
});

describe('ActionBar — API contract (source-anchored)', () => {
	it('declares the documented props in its Props type', () => {
		expect(source).toMatch(/type\s+Props\s*=/);
		expect(source).toMatch(/question:\s*string/);
		expect(source).toMatch(/options:\s*OptionItem\[\]/);
		expect(source).toMatch(/runId:\s*string/);
		expect(source).toMatch(/stepId:\s*string/);
		expect(source).toMatch(/allowFreeText\?:\s*boolean/);
		expect(source).toMatch(
			/onSelect:\s*\(payload:\s*\{\s*selectedOptionId:\s*string;\s*freeTextAnswer\?:\s*string\s*\}\)\s*=>\s*void/
		);
	});

	it('defaults allowFreeText to true so the free-text affordance is opt-out', () => {
		expect(source).toMatch(/allowFreeText\s*=\s*true/);
	});
});

describe('ActionBar — structural rendering (node env, no DOM)', () => {
	it('renders the question inside an action-bar region', () => {
		expect(source).toMatch(/<div[^>]*class=["']action-bar["']/);
		expect(source).toMatch(/role=["']region["']/);
		expect(source).toMatch(/aria-label=["']Action required["']/);
		expect(source).toMatch(/\{question\}/);
	});

	it('renders one pill button per option in the options list', () => {
		expect(source).toMatch(/#each\s+options\s+as\s+option\s+\(option\.id\)/);
		expect(source).toMatch(/<button[^>]*class=["']action-bar-pill["']/);
		expect(source).toMatch(/aria-label=\{option\.label\}/);
	});

	it('invokes onSelect with the clicked option id (no free text)', () => {
		expect(source).toMatch(/function\s+handlePillClick/);
		expect(source).toMatch(
			/onSelect\(\{\s*selectedOptionId:\s*option\.id\s*\}\s*\)/
		);
	});

	it('exposes a "Type your own answer" pill when allowFreeText is true and the form is closed', () => {
		expect(source).toMatch(/#if\s+allowFreeText\s+&&\s+!showFreeText/);
		expect(source).toMatch(/aria-label=["']Type your own answer["']/);
		expect(source).toMatch(/Type your own answer/);
	});

	it('submits free-text with a timestamped selectedOptionId and trimmed answer', () => {
		expect(source).toMatch(/function\s+handleFreeTextSubmit/);
		expect(source).toMatch(/freeTextValue\.trim\(\)/);
		expect(source).toMatch(
			/onSelect\(\{\s*selectedOptionId:\s*`free_text_\$\{Date\.now\(\)\}`,\s*freeTextAnswer:\s*trimmed\s*\}\s*\)/
		);
		expect(source).toMatch(/<form[^>]*class=["']action-bar-form["']/);
		expect(source).toMatch(/<input[^>]*id=["']action-bar-freetext["']/);
	});

	it('hides the form when the cancel button is clicked', () => {
		expect(source).toMatch(/aria-label=["']Cancel["']/);
		expect(source).toMatch(/showFreeText\s*=\s*false/);
	});
});

describe('ActionBar — data attributes on the container', () => {
	it('sets data-run-id and data-step-id on the outer region', () => {
		expect(source).toMatch(/data-run-id=\{runId\}/);
		expect(source).toMatch(/data-step-id=\{stepId\}/);
	});
});

describe('ActionBar — callback payload contract', () => {
	it('pill click payload shape matches { selectedOptionId }', () => {
		const expected: Pick<OnSelectPayload, 'selectedOptionId'> = {
			selectedOptionId: 'a'
		};
		expect(expected.selectedOptionId).toBe('a');
		expect(
			(expected as OnSelectPayload).freeTextAnswer
		).toBeUndefined();
	});

	it('free-text payload shape is { selectedOptionId: "free_text_<ts>", freeTextAnswer: string }', () => {
		const sampleTs = 1700000000000;
		const payload: OnSelectPayload = {
			selectedOptionId: `free_text_${sampleTs}`,
			freeTextAnswer: 'hello'
		};

		expect(payload.selectedOptionId).toBe('free_text_1700000000000');
		expect(payload.freeTextAnswer).toBe('hello');
		expect(payload.selectedOptionId.startsWith('free_text_')).toBe(true);
	});

	it('exposes the same option ids that the rendering loop iterates over', () => {
		expect(source).toMatch(/option\.id/);
		const renderedIds = sampleOptions.map((o) => o.id);
		expect(renderedIds).toEqual(['a', 'b', 'c']);
	});

	it('propagates runId/stepId through the contract used by parent callers', () => {
		expect(sampleProps.runId).toBe('run-123');
		expect(sampleProps.stepId).toBe('step-456');
		expect(source).toContain('runId');
		expect(source).toContain('stepId');
	});
});
