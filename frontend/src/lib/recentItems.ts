// Requests shows only the newest few timesheet weeks and leave applications.

/** How many the Requests lists show. */
export const RECENT_LIMIT = 5

/**
 * The first `limit` items (the list is already newest first), plus any older
 * item `keep` picks (e.g. the one a tapped notification points at), so it is
 * never hidden.
 */
export function recentItems<T>(items: T[], limit: number, keep: (item: T) => boolean = () => false): T[] {
  return items.filter((item, i) => i < limit || keep(item))
}

/** Leave applications newest first (by first day; the original order breaks ties). */
export function newestLeaveFirst<T extends { from: string }>(items: T[]): T[] {
  return [...items].sort((a, b) => b.from.localeCompare(a.from))
}
