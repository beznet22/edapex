/**
 * Thread bucketing for the sidebar history view.
 *
 * The sidebar groups chat threads by age so users can quickly find recent
 * conversations. Buckets are computed in CALENDAR DAYS (not absolute
 * millisecond windows) so that a thread created at 23:59 today stays in
 * "today" even if it's grouped at 00:00:01 tomorrow.
 *
 * The expected module surface is:
 *   - `SidebarThread` — the input shape (id, title, createdAt, optional resourceId)
 *   - `groupThreadsByDate(threads)` — pure function returning 5 buckets
 */

export interface SidebarThread {
	id: string;
	title: string;
	createdAt: Date | string;
	resourceId?: string;
}

export interface GroupedThreads {
	today: SidebarThread[];
	yesterday: SidebarThread[];
	last7Days: SidebarThread[];
	last30Days: SidebarThread[];
	older: SidebarThread[];
}

const MS_PER_DAY = 1000 * 60 * 60 * 24;

function startOfDay(date: Date): Date {
	return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function toDate(value: Date | string): Date {
	return value instanceof Date ? value : new Date(value);
}

export function groupThreadsByDate(threads: SidebarThread[]): GroupedThreads {
	const result: GroupedThreads = {
		today: [],
		yesterday: [],
		last7Days: [],
		last30Days: [],
		older: []
	};

	const startOfToday = startOfDay(new Date());

	for (const thread of threads) {
		const startOfCreated = startOfDay(toDate(thread.createdAt));
		const daysAgo = Math.floor(
			(startOfToday.getTime() - startOfCreated.getTime()) / MS_PER_DAY
		);

		if (daysAgo <= 0) {
			result.today.push(thread);
		} else if (daysAgo === 1) {
			result.yesterday.push(thread);
		} else if (daysAgo <= 7) {
			result.last7Days.push(thread);
		} else if (daysAgo <= 30) {
			result.last30Days.push(thread);
		} else {
			result.older.push(thread);
		}
	}

	return result;
}
