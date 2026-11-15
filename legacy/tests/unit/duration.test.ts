import { describe, it, expect } from 'vitest';
import { formatDuration } from '$lib/utils/duration';

describe('formatDuration', () => {
	describe('sub-minute durations', () => {
		it('returns "0 secs" for zero', () => {
			expect(formatDuration(0)).toBe('0 secs');
		});

		it('returns singular "1 sec" for one', () => {
			expect(formatDuration(1)).toBe('1 sec');
		});

		it('returns plural "2 secs" for two', () => {
			expect(formatDuration(2)).toBe('2 secs');
		});

		it('returns plural for arbitrary sub-minute values', () => {
			expect(formatDuration(45)).toBe('45 secs');
			expect(formatDuration(59)).toBe('59 secs');
		});
	});

	describe('minute-level durations', () => {
		it('returns "1 min 0 secs" at exactly 60 seconds', () => {
			expect(formatDuration(60)).toBe('1 min 0 secs');
		});

		it('returns singular "1 min 1 sec" at 61 seconds', () => {
			expect(formatDuration(61)).toBe('1 min 1 sec');
		});

		it('returns plural mins and secs for multi-minute values', () => {
			expect(formatDuration(125)).toBe('2 mins 5 secs');
		});

		it('handles large minute values', () => {
			expect(formatDuration(3600)).toBe('60 mins 0 secs');
			expect(formatDuration(3661)).toBe('61 mins 1 sec');
		});
	});

	describe('defensive inputs', () => {
		it('clamps negative input to "0 secs"', () => {
			expect(formatDuration(-5)).toBe('0 secs');
		});

		it('floors fractional input', () => {
			expect(formatDuration(1.7)).toBe('1 sec');
			expect(formatDuration(59.9)).toBe('59 secs');
		});

		it('treats non-finite input as zero', () => {
			expect(formatDuration(Number.NaN)).toBe('0 secs');
			expect(formatDuration(Number.POSITIVE_INFINITY)).toBe('0 secs');
		});
	});
});
