import { describe, expect, it } from 'vitest'
import type { Status, Timesheet } from '../data/types'
import { groupByWeek, statusBreakdown, toggleWeek, weekCount, weekSummaryLine } from './timesheetHistory'

let seq = 1
function entry(date: string, hours: number, status: Status = 'Pending', description = 'Work'): Timesheet {
  return { id: String(seq++), employeeId: 'EMP010', date, hours, description, status }
}

describe('weekly timesheet history', () => {
  it('shows nothing for an empty history', () => {
    expect(groupByWeek([])).toEqual([])
    expect(weekCount([])).toBe(0)
  })

  it('groups days into Monday-to-Sunday weeks, newest week first', () => {
    const weeks = groupByWeek([
      entry('2026-10-06', 9), entry('2026-10-12', 8), entry('2026-10-05', 9),
      entry('2026-10-11', 4), // Sunday belongs to the week of Monday 5 Oct
      entry('2026-10-18', 9), // Sunday 18 Oct belongs to the week of Monday 12 Oct
    ])
    expect(weeks.map((w) => [w.weekStart, w.weekEnd])).toEqual([
      ['2026-10-12', '2026-10-18'], ['2026-10-05', '2026-10-11'],
    ])
    expect(weeks[1].entries.map((e) => e.date)).toEqual(['2026-10-05', '2026-10-06', '2026-10-11'])
    expect(weeks[0].label).toBe('12 Oct – 18 Oct')
  })

  it('adds up the saved hours of each week', () => {
    const [week] = groupByWeek([entry('2026-10-12', 8), entry('2026-10-13', 9), entry('2026-10-14', 8.75),
      entry('2026-10-15', 9), entry('2026-10-16', 9.25 - 0.25)])
    expect(week.totalHours).toBe(43.75)
    expect(weekSummaryLine(week)).toBe('5 entries · 43.75 hours')
    expect(weekSummaryLine(groupByWeek([entry('2026-10-12', 1)])[0])).toBe('1 entry · 1 hour')
  })

  it('uses one status when every day has it', () => {
    expect(groupByWeek([entry('2026-10-05', 9, 'Approved'), entry('2026-10-06', 9, 'Approved')])[0].status).toBe('Approved')
    expect(groupByWeek([entry('2026-10-05', 9), entry('2026-10-06', 9)])[0].status).toBe('Pending')
    expect(groupByWeek([entry('2026-10-05', 9, 'Rejected')])[0].status).toBe('Rejected')
  })

  it('shows "Mixed" with a breakdown when days have different statuses', () => {
    const [week] = groupByWeek([
      entry('2026-10-05', 9, 'Approved'), entry('2026-10-06', 9, 'Approved'), entry('2026-10-07', 9, 'Approved'),
      entry('2026-10-08', 9, 'Pending'), entry('2026-10-09', 9, 'Pending'),
    ])
    expect(week.status).toBe('Mixed')
    expect(week.counts).toEqual({ Approved: 3, Pending: 2 })
    expect(statusBreakdown(week)).toBe('3 approved · 2 pending')
    expect(statusBreakdown(groupByWeek([entry('2026-10-05', 9)])[0])).toBe('')
  })

  it('includes days submitted with the older one-day submit and never changes the entries', () => {
    const saved = [entry('2026-10-12', 8, 'Pending', 'Earlier work'), entry('2026-10-13', 9, 'Pending', 'Weekly submit')]
    const copy = JSON.parse(JSON.stringify(saved))
    const [week] = groupByWeek(saved)
    expect(week.entries).toHaveLength(2)
    expect(week.totalHours).toBe(17)
    expect(saved).toEqual(copy) // grouping changes nothing
    expect(new Set(week.entries.map((e) => e.id)).size).toBe(2) // no duplicates
  })

  it('shows when the week was sent, from the latest day, if known', () => {
    const a = { ...entry('2026-10-12', 8), submittedAt: '2026-10-16T10:00:00' }
    const b = { ...entry('2026-10-13', 8), submittedAt: '2026-10-17T09:00:00' }
    expect(groupByWeek([a, b])[0].submittedOn).toBe('2026-10-17')
    expect(groupByWeek([entry('2026-10-12', 8)])[0].submittedOn).toBeNull()
  })

  it('counts weeks for the History heading', () => {
    expect(weekCount([entry('2026-10-05', 9), entry('2026-10-09', 9), entry('2026-10-12', 8)])).toBe(2)
  })

  it('weeks start closed; tapping opens and closes one week only', () => {
    const closed = new Set<string>()
    const one = toggleWeek(closed, '2026-10-12')
    expect([...one]).toEqual(['2026-10-12'])
    expect(closed.size).toBe(0) // the old state is not changed
    const two = toggleWeek(one, '2026-10-05')
    expect([...two].sort()).toEqual(['2026-10-05', '2026-10-12'])
    expect([...toggleWeek(two, '2026-10-12')]).toEqual(['2026-10-05'])
  })
})
