import { describe, it, expect } from 'vitest';
import { groupThreadsByDate, type SidebarThread } from '$lib/components/sidebar-history/sidebar-threads';

function makeThread(id: string, createdAt: Date): SidebarThread {
	return { id, title: `Thread ${id}`, createdAt, resourceId: 'user-1' };
}

describe('groupThreadsByDate', () => {
	it('places a thread created today in the "today" group', () => {
		const now = new Date();
		const threads = [makeThread('1', now)];
		const groups = groupThreadsByDate(threads);

		expect(groups.today).toHaveLength(1);
		expect(groups.today[0].id).toBe('1');
		expect(groups.yesterday).toHaveLength(0);
		expect(groups.last7Days).toHaveLength(0);
		expect(groups.last30Days).toHaveLength(0);
		expect(groups.older).toHaveLength(0);
	});

	it('places a thread created yesterday in the "yesterday" group', () => {
		const yesterday = new Date();
		yesterday.setDate(yesterday.getDate() - 1);
		yesterday.setHours(12, 0, 0, 0); // midday yesterday
		const threads = [makeThread('1', yesterday)];
		const groups = groupThreadsByDate(threads);

		expect(groups.yesterday).toHaveLength(1);
		expect(groups.today).toHaveLength(0);
	});

	it('places a thread from 3 days ago in "last7Days"', () => {
		const threeDaysAgo = new Date();
		threeDaysAgo.setDate(threeDaysAgo.getDate() - 3);
		threeDaysAgo.setHours(12, 0, 0, 0);
		const threads = [makeThread('1', threeDaysAgo)];
		const groups = groupThreadsByDate(threads);

		expect(groups.last7Days).toHaveLength(1);
		expect(groups.today).toHaveLength(0);
		expect(groups.yesterday).toHaveLength(0);
	});

	it('places a thread from 15 days ago in "last30Days"', () => {
		const fifteenDaysAgo = new Date();
		fifteenDaysAgo.setDate(fifteenDaysAgo.getDate() - 15);
		fifteenDaysAgo.setHours(12, 0, 0, 0);
		const threads = [makeThread('1', fifteenDaysAgo)];
		const groups = groupThreadsByDate(threads);

		expect(groups.last30Days).toHaveLength(1);
	});

	it('places a thread from 60 days ago in "older"', () => {
		const sixtyDaysAgo = new Date();
		sixtyDaysAgo.setDate(sixtyDaysAgo.getDate() - 60);
		const threads = [makeThread('1', sixtyDaysAgo)];
		const groups = groupThreadsByDate(threads);

		expect(groups.older).toHaveLength(1);
	});

	it('each thread is in exactly one group and total equals input count', () => {
		const now = new Date();
		const threads: SidebarThread[] = [
			makeThread('today', now),
			makeThread('yesterday', new Date(now.getTime() - 1.5 * 24 * 60 * 60 * 1000)),
			makeThread('last-week', new Date(now.getTime() - 4 * 24 * 60 * 60 * 1000)),
			makeThread('last-month', new Date(now.getTime() - 20 * 24 * 60 * 60 * 1000)),
			makeThread('older', new Date(now.getTime() - 60 * 24 * 60 * 60 * 1000)),
		];

		const groups = groupThreadsByDate(threads);
		const totalCount =
			groups.today.length +
			groups.yesterday.length +
			groups.last7Days.length +
			groups.last30Days.length +
			groups.older.length;

		expect(totalCount).toBe(threads.length);
	});

	it('returns empty groups for empty input', () => {
		const groups = groupThreadsByDate([]);

		expect(groups.today).toHaveLength(0);
		expect(groups.yesterday).toHaveLength(0);
		expect(groups.last7Days).toHaveLength(0);
		expect(groups.last30Days).toHaveLength(0);
		expect(groups.older).toHaveLength(0);
	});

	it('handles string dates by converting them', () => {
		const now = new Date();
		const thread: SidebarThread = {
			id: '1',
			title: 'Test',
			createdAt: now.toISOString() as unknown as Date,
			resourceId: 'user-1',
		};
		const groups = groupThreadsByDate([thread]);
		const totalCount =
			groups.today.length +
			groups.yesterday.length +
			groups.last7Days.length +
			groups.last30Days.length +
			groups.older.length;

		expect(totalCount).toBe(1);
	});
});
