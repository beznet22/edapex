import type { LibSQLStore } from '@mastra/libsql';

/**
 * Sidebar thread data layer for fetching and grouping chat threads from Mastra storage.
 * Uses the Mastra Memory storage domain's listThreads API with resourceId filtering.
 *
 * Verified: Mastra provides native thread listing via MemoryStorage.listThreads()
 * with resourceId filter, orderBy, and pagination — no custom query layer needed.
 */

export interface SidebarThread {
	id: string;
	title: string;
	createdAt: Date;
	resourceId: string;
}

export interface GroupedThreads {
	today: SidebarThread[];
	yesterday: SidebarThread[];
	last7Days: SidebarThread[];
	last30Days: SidebarThread[];
	older: SidebarThread[];
}

/**
 * Fetches threads for the sidebar from Mastra storage, scoped to the given resourceId.
 * Returns threads grouped by relative date categories.
 *
 * @param storage - A LibSQLStore instance (from createMastraStorage())
 * @param resourceId - The user's resource ID (formatted as `user-{userId}`)
 * @returns Grouped threads partitioned into Today, Yesterday, Last 7 days, Last 30 days, Older
 */
export async function fetchSidebarThreads(
	storage: LibSQLStore,
	resourceId: string
): Promise<GroupedThreads> {
	const memory = await storage.getStore('memory');
	if (!memory) {
		return emptyGroups();
	}

	const result = await memory.listThreads({
		filter: { resourceId },
		perPage: 50,
		page: 0,
		orderBy: { field: 'createdAt', direction: 'DESC' },
	});

	const threads: SidebarThread[] = (result.threads ?? []).map((t) => ({
		id: t.id,
		title: t.title || 'New Chat',
		createdAt: t.createdAt instanceof Date ? t.createdAt : new Date(t.createdAt),
		resourceId: t.resourceId,
	}));

	return groupThreadsByDate(threads);
}

/**
 * Groups threads into relative date categories.
 * Each thread is placed in exactly one group based on its createdAt date.
 * The total count across all groups equals the input count.
 *
 * Categories:
 * - Today: created on the current calendar day
 * - Yesterday: created on the previous calendar day
 * - Last 7 days: created within the last 7 days (excluding today and yesterday)
 * - Last 30 days: created within the last 30 days (excluding the above)
 * - Older: everything else
 */
export function groupThreadsByDate(threads: SidebarThread[]): GroupedThreads {
	const now = new Date();
	const todayStart = startOfDay(now);
	const yesterdayStart = startOfDay(new Date(now.getTime() - 24 * 60 * 60 * 1000));
	const last7Start = startOfDay(new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000));
	const last30Start = startOfDay(new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000));

	const groups: GroupedThreads = emptyGroups();

	for (const thread of threads) {
		const createdAt = thread.createdAt instanceof Date ? thread.createdAt : new Date(thread.createdAt);

		if (createdAt >= todayStart) {
			groups.today.push(thread);
		} else if (createdAt >= yesterdayStart) {
			groups.yesterday.push(thread);
		} else if (createdAt >= last7Start) {
			groups.last7Days.push(thread);
		} else if (createdAt >= last30Start) {
			groups.last30Days.push(thread);
		} else {
			groups.older.push(thread);
		}
	}

	return groups;
}

/**
 * Returns an empty GroupedThreads structure.
 */
function emptyGroups(): GroupedThreads {
	return {
		today: [],
		yesterday: [],
		last7Days: [],
		last30Days: [],
		older: [],
	};
}

/**
 * Returns the start of the day (midnight) for a given date.
 */
function startOfDay(date: Date): Date {
	const d = new Date(date);
	d.setHours(0, 0, 0, 0);
	return d;
}
