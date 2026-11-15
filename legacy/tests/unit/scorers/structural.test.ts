import { describe, it, expect } from 'vitest';
import { scoreStructural } from '../../integration/helpers/scorers/structural';

describe('scoreStructural', () => {
	it('passes when a follow-up question is present', () => {
		const result = scoreStructural(
			'I have reset the marksheet. Would you like to validate it now?'
		);
		expect(result.pass).toBe(true);
		expect(result.matchedCue).toBe('Would you like to');
		expect(result.score).toBe(1);
	});

	it('passes when next-steps language is present', () => {
		const result = scoreStructural(
			'Next steps: open the marksheet in the editor and click Validate.'
		);
		expect(result.pass).toBe(true);
		expect(result.matchedCue).toBe('Next steps');
	});

	it('fails when no follow-up cue is present', () => {
		const result = scoreStructural('The marksheet was committed successfully.');
		expect(result.pass).toBe(false);
		expect(result.matchedCue).toBeNull();
		expect(result.score).toBe(0);
	});

	it('is case-insensitive', () => {
		const result = scoreStructural('WOULD YOU LIKE to continue?');
		expect(result.pass).toBe(true);
	});
});
