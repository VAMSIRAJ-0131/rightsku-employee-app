import { describe, expect, it } from 'vitest'
import { monthWeeks } from './timesheetHistory'
import { dashboardTarget } from './hrDashboard'
import { holidayLabel } from './timesheetWeek'
import { monthCalendarRows } from './workCalendar'
import type { Timesheet } from '../data/types'

function entry(date: string, status: Timesheet['status']): Timesheet {
  return { id: date, employeeId: 'EMP010', date, hours: 9, description: 'Work', status } as Timesheet
}

describe('home: this month, week by week', () => {
  // October 2026 starts on a Thursday: Week 1 is 28 Sep - 4 Oct ... Week 5 is 26 Oct - 1 Nov.
  const today = '2026-10-21'

  it('lists Week 1 to Week 5 for a month that needs five, with the dates inside the month', () => {
    const weeks = monthWeeks([], today)
    expect(weeks.map((w) => w.label)).toEqual(['Week 1', 'Week 2', 'Week 3', 'Week 4', 'Week 5'])
    expect(weeks[0].weekStart).toBe('2026-09-28')
    expect(weeks[0].range).toBe('1 – 4 Oct')
    expect(weeks[4].range).toBe('26 – 31 Oct')
    expect(weeks.filter((w) => w.current).map((w) => w.label)).toEqual(['Week 4'])
  })

  it('February 2027 needs only four weeks', () => {
    expect(monthWeeks([], '2027-02-10')).toHaveLength(4)
  })

  it('takes each week’s status from all of its days', () => {
    const weeks = monthWeeks([
      // Week 2: all approved
      entry('2026-10-05', 'Approved'), entry('2026-10-06', 'Approved'),
      // Week 3: one approved, one pending -> Pending (one approved day never makes the week approved)
      entry('2026-10-12', 'Approved'), entry('2026-10-13', 'Pending'),
      // Week 4: a rejected day -> Rejected
      entry('2026-10-19', 'Pending'), entry('2026-10-20', 'Rejected'),
    ], today)
    expect(weeks.map((w) => w.status)).toEqual(['Not submitted', 'Approved', 'Pending', 'Rejected', 'Not submitted'])
  })
})

describe('HR dashboard boxes', () => {
  it('open the list they count, already filtered', () => {
    expect(dashboardTarget({ kind: 'active' })).toEqual({ tab: 'employees', employeeFilter: 'ACTIVE' })
    expect(dashboardTarget({ kind: 'inactive' })).toEqual({ tab: 'employees', employeeFilter: 'INACTIVE' })
    expect(dashboardTarget({ kind: 'documents' })).toEqual({ tab: 'documents' })
    expect(dashboardTarget({ kind: 'queue', queue: 'leaves', status: 'REJECTED' }))
      .toEqual({ tab: 'approvals', view: 'leaves', status: 'REJECTED' })
    expect(dashboardTarget({ kind: 'queue', queue: 'compoff', status: 'PENDING' }))
      .toEqual({ tab: 'approvals', view: 'compoff', status: 'PENDING' })
  })
})

describe('weekly-off calendar', () => {
  it('lays out the whole month, Monday first, with every date and its weekday', () => {
    const rows = monthCalendarRows('2026-10')
    expect(rows).toHaveLength(5)
    expect(rows[0].slice(0, 3)).toEqual([null, null, null]) // 1 Oct 2026 is a Thursday
    expect(rows[0][3]).toEqual({ iso: '2026-10-01', weekday: 'THURSDAY' })
    expect(rows.flat().filter(Boolean)).toHaveLength(31)
    expect(rows[4][5]).toEqual({ iso: '2026-10-31', weekday: 'SATURDAY' })
    expect(rows.every((r) => r.length === 7)).toBe(true)
  })
})

describe('holiday label', () => {
  it('reads "Holiday - Name" with nothing else', () => {
    expect(holidayLabel({ holidayName: 'Dasara' })).toBe('Holiday - Dasara')
    expect(holidayLabel({ holidayName: null })).toBe('Holiday')
  })
})

describe('Applies From picker', () => {
  it('lets HR pick only Mondays on or after the earliest allowed Monday', async () => {
    const { isPickableMonday } = await import('../components/MondayPicker')
    expect(isPickableMonday('2026-10-19', '2026-10-12')).toBe(true) // a Monday after the earliest
    expect(isPickableMonday('2026-10-12', '2026-10-12')).toBe(true) // the earliest itself
    expect(isPickableMonday('2026-10-05', '2026-10-12')).toBe(false) // before the earliest
    expect(isPickableMonday('2026-10-20', '2026-10-12')).toBe(false) // a Tuesday
  })
})

describe('home: tapping a week opens that week', () => {
  const today = '2026-10-24' // a Saturday in Week 4 (19 - 25 Oct)

  it('each week bar opens the timesheet on its own Monday', async () => {
    const weeks = monthWeeks([], today)
    expect(weeks.map((w) => w.weekStart)).toEqual(['2026-09-28', '2026-10-05', '2026-10-12', '2026-10-19', '2026-10-26'])
  })

  it('weeks with no records still open (empty weeks use the normal submission rules)', async () => {
    const { canOpenWeek } = await import('./timesheetHistory')
    const weeks = monthWeeks([], today)
    expect(weeks.every((w) => w.status === 'Not submitted')).toBe(true)
    expect(weeks.slice(0, 4).map((w) => canOpenWeek(w.weekStart, today))).toEqual([true, true, true, true])
  })

  it('a week that has not started yet cannot be opened, like the timesheet arrows and the server', async () => {
    const { canOpenWeek } = await import('./timesheetHistory')
    expect(canOpenWeek('2026-10-26', today)).toBe(false) // Week 5: starts Monday
    expect(canOpenWeek('2026-10-26', '2026-10-27')).toBe(true) // once it has started
    expect(canOpenWeek('2026-08-17', today)).toBe(false) // older than 60 days
  })
})
