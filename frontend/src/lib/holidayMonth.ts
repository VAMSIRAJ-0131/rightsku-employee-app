// The Holiday calendar shows one month at a time ("Holidays This Month"),
// with arrows and swipe to move between the months HR's calendar covers.
import type { HolidayRecord } from './workCalendar'

/** "2026-10" for a date. */
export function monthKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`
}

/** The month before or after ("2026-12" + 1 = "2027-01"). */
export function addMonths(month: string, delta: number): string {
  const [y, m] = month.split('-').map(Number)
  return monthKey(new Date(y, m - 1 + delta, 1))
}

/** "October 2026". */
export function monthTitle(month: string): string {
  return new Date(`${month}-01T00:00:00`).toLocaleDateString('en-IN', { month: 'long', year: 'numeric' })
}

/** That month's holidays, in date order. */
export function holidaysInMonth(holidays: HolidayRecord[], month: string): HolidayRecord[] {
  return holidays.filter((h) => h.date.startsWith(`${month}-`)).sort((a, b) => a.date.localeCompare(b.date))
}

/** Months the calendar can show: January of this year to December of next year (the years loaded). */
export function monthRange(today: Date): { first: string; last: string } {
  const y = today.getFullYear()
  return { first: `${y}-01`, last: `${y + 1}-12` }
}

/** All holidays grouped by month ("2026-10"), months and days in date order. */
export function holidaysByMonth(holidays: HolidayRecord[]): { month: string; items: HolidayRecord[] }[] {
  const groups = new Map<string, HolidayRecord[]>()
  for (const h of [...holidays].sort((a, b) => a.date.localeCompare(b.date))) {
    const month = h.date.slice(0, 7)
    groups.set(month, [...(groups.get(month) ?? []), h])
  }
  return [...groups.entries()].map(([month, items]) => ({ month, items }))
}
