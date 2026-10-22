// Timesheet history, one summary per week (Monday to Sunday).
//
// Built only from saved timesheet entries (what the server returns from
// GET /api/employee/timesheets), so draft hours are never counted, and days
// submitted with the older one-day submit land in their week like any other.
// Nothing is changed or re-sent: this only groups what is already saved.
import type { Status, Timesheet } from '../data/types'
import { formatShortDate, toIsoDate } from './format'
import { weekStartOf } from './workCalendar'

/** A week's overall status: one status when every day has it, otherwise "Mixed". */
export type WeekHistoryStatus = Status | 'Mixed'

export interface WeekHistory {
  /** Monday, "YYYY-MM-DD". */
  weekStart: string
  /** Sunday, "YYYY-MM-DD". */
  weekEnd: string
  /** "12 Oct – 18 Oct" */
  label: string
  /** The saved day entries, Monday first. */
  entries: Timesheet[]
  /** Sum of the saved entries' hours. */
  totalHours: number
  status: WeekHistoryStatus
  /** When the week (its latest day) was sent for approval, "YYYY-MM-DD", if known. */
  submittedOn: string | null
  /** How many days have each status, e.g. { Approved: 3, Pending: 2 }. */
  counts: Partial<Record<Status, number>>
}

function addDays(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00`)
  d.setDate(d.getDate() + days)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/** Groups saved entries by week, newest week first. Entries are not changed. */
export function groupByWeek(entries: Timesheet[]): WeekHistory[] {
  const byWeek = new Map<string, Timesheet[]>()
  for (const entry of entries) {
    const monday = weekStartOf(entry.date)
    const list = byWeek.get(monday)
    if (list) list.push(entry)
    else byWeek.set(monday, [entry])
  }
  return [...byWeek.entries()]
    .sort(([a], [b]) => b.localeCompare(a))
    .map(([weekStart, list]) => {
      const days = [...list].sort((a, b) => a.date.localeCompare(b.date))
      const counts: Partial<Record<Status, number>> = {}
      let total = 0
      for (const e of days) {
        counts[e.status] = (counts[e.status] ?? 0) + 1
        total += Number(e.hours) || 0
      }
      const statuses = Object.keys(counts) as Status[]
      const sent = days.map((e) => e.submittedAt).filter((x): x is string => !!x).sort()
      const submittedOn = sent.length ? toIsoDate(new Date(sent[sent.length - 1])) : null
      const weekEnd = addDays(weekStart, 6)
      return {
        weekStart,
        weekEnd,
        label: `${formatShortDate(weekStart)} – ${formatShortDate(weekEnd)}`,
        entries: days,
        totalHours: Math.round(total * 100) / 100,
        status: statuses.length === 1 ? statuses[0] : 'Mixed',
        submittedOn,
        counts,
      }
    })
}

/** How many different weeks these entries cover. */
export function weekCount(entries: Timesheet[]): number {
  return new Set(entries.map((e) => weekStartOf(e.date))).size
}

/** "5 entries · 44 hours" */
export function weekSummaryLine(week: WeekHistory): string {
  const n = week.entries.length
  return `${n} ${n === 1 ? 'entry' : 'entries'} · ${week.totalHours} ${week.totalHours === 1 ? 'hour' : 'hours'}`
}

/** For a mixed week: "3 approved · 2 pending". Empty for a single-status week. */
export function statusBreakdown(week: WeekHistory): string {
  if (week.status !== 'Mixed') return ''
  return (['Approved', 'Pending', 'Rejected'] as Status[])
    .filter((s) => week.counts[s])
    .map((s) => `${week.counts[s]} ${s.toLowerCase()}`)
    .join(' · ')
}

/** Opens or closes one week; every week starts closed. */
export function toggleWeek(open: ReadonlySet<string>, weekStart: string): Set<string> {
  const next = new Set(open)
  if (next.has(weekStart)) next.delete(weekStart)
  else next.add(weekStart)
  return next
}
