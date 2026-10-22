import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  buildMonthGrid, checkDayHours, listMyTimesheets, monthRange, shiftMonth,
  toTimesheet, validateHoliday, validateSchedule, validateTimesheet, weekStartOf,
  type CalendarDay, type DayCell, type Weekday,
} from './workCalendar'

const TODAY = '2026-10-14' // Wednesday

/** A month of server calendar days: Saturday and Sunday off unless told otherwise. */
function serverMonth(
  month: string,
  opts: { offs?: number[]; holidays?: Record<string, string>; changeFrom?: string; offsAfter?: number[] } = {},
): CalendarDay[] {
  const { from, to } = monthRange(month)
  const days: CalendarDay[] = []
  for (let d = new Date(`${from}T00:00:00`); ; d.setDate(d.getDate() + 1)) {
    const iso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
    if (iso > to) break
    const offs = opts.changeFrom && iso >= opts.changeFrom ? (opts.offsAfter ?? []) : (opts.offs ?? [6, 0])
    const weeklyOff = offs.includes(d.getDay())
    const holidayName = opts.holidays?.[iso] ?? null
    days.push({ date: iso, kind: holidayName ? 'HOLIDAY' : weeklyOff ? 'WEEKLY_OFF' : 'WORKING', weeklyOff, holidayName, hoursPerDay: 8 })
  }
  return days
}

function cell(grid: DayCell[][], iso: string): DayCell {
  const found = grid.flat().find((c) => c.iso === iso)
  if (!found) throw new Error(`no cell ${iso}`)
  return found
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('timesheet calendar', () => {
  const october = serverMonth('2026-10', { holidays: { '2026-10-02': 'Gandhi Jayanti', '2026-10-03': 'Weekend holiday' } })
  const grid = buildMonthGrid('2026-10', october, TODAY, new Set(['2026-10-12']))

  it('lays out the month in Monday-first weeks', () => {
    expect(grid).toHaveLength(5)
    expect(grid[0][0].iso).toBe('2026-09-28')
    expect(grid[0][0].state).toBe('outside')
    expect(grid.every((w) => w.length === 7)).toBe(true)
  })

  it('disables weekly offs, holidays, future dates and submitted days', () => {
    expect(cell(grid, '2026-10-13')).toMatchObject({ state: 'available', disabled: false })
    expect(cell(grid, '2026-10-10')).toMatchObject({ state: 'weekly-off', disabled: true })
    expect(cell(grid, '2026-10-02')).toMatchObject({ state: 'holiday', disabled: true, holidayName: 'Gandhi Jayanti' })
    expect(cell(grid, '2026-10-15')).toMatchObject({ state: 'future', disabled: true })
    expect(cell(grid, '2026-10-12')).toMatchObject({ state: 'submitted', disabled: true })
    expect(cell(grid, '2026-10-14')).toMatchObject({ state: 'available', isToday: true })
  })

  it('shows a holiday on a weekly off as the holiday', () => {
    expect(cell(grid, '2026-10-03')).toMatchObject({ state: 'holiday', disabled: true, holidayName: 'Weekend holiday' })
    expect(cell(grid, '2026-10-03').label).toContain('Weekend holiday')
  })

  it('follows each employee’s own schedule from the server', () => {
    // Friday and Saturday off: Sunday becomes a working day, Friday is off.
    const fridayOff = buildMonthGrid('2026-10', serverMonth('2026-10', { offs: [5, 6] }), TODAY, new Set())
    expect(cell(fridayOff, '2026-10-11').state).toBe('available')
    expect(cell(fridayOff, '2026-10-09').state).toBe('weekly-off')
  })

  it('reflects an HR schedule change from its start date', () => {
    // From 5 Oct only Sunday is off: 3 Oct (Saturday) is still off, 10 Oct is a working day.
    const changed = buildMonthGrid('2026-10', serverMonth('2026-10', { changeFrom: '2026-10-05', offsAfter: [0] }), TODAY, new Set())
    expect(cell(changed, '2026-10-03').state).toBe('weekly-off')
    expect(cell(changed, '2026-10-10').state).toBe('available')
    expect(cell(changed, '2026-10-11').state).toBe('weekly-off')
  })

  it('disables dates more than 60 days back or missing from the server calendar', () => {
    const august = buildMonthGrid('2026-08', serverMonth('2026-08'), TODAY, new Set())
    expect(cell(august, '2026-08-14').state).toBe('too-old')
    expect(cell(august, '2026-08-17').state).toBe('available')
    const notLoaded = buildMonthGrid('2026-10', [], TODAY, new Set())
    expect(cell(notLoaded, '2026-10-13').disabled).toBe(true)
  })

  it('moves between months', () => {
    expect(shiftMonth('2026-01', -1)).toBe('2025-12')
    expect(shiftMonth('2026-12', 1)).toBe('2027-01')
    expect(monthRange('2028-02')).toEqual({ from: '2028-02-01', to: '2028-02-29' })
  })
})

describe('timesheet form', () => {
  const pickable = new Set(['2026-10-13'])

  it('accepts a working day with quarter hours', () => {
    expect(validateTimesheet({ date: '2026-10-13', hours: '7.5', description: 'Payslip screen' }, pickable)).toEqual({})
  })

  it('refuses a date that is not pickable and bad hours', () => {
    const errors = validateTimesheet({ date: '2026-10-10', hours: '7.1', description: '' }, pickable)
    expect(Object.keys(errors).sort()).toEqual(['date', 'description', 'hours'])
    for (const bad of ['0', '-2', '0.5', '9.25', '10', '25', 'abc', '']) {
      expect(validateTimesheet({ date: '2026-10-13', hours: bad, description: 'x' }, pickable).hours, bad).toBeDefined()
    }
  })

  it("reads the employee's own entries and maps the server record", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify([{
      id: 9, date: '2026-10-13', hours: 7.5, description: 'Payslip screen', status: 'PENDING', submittedAt: '2026-10-13T10:00:00Z',
    }]), { status: 200, headers: { 'Content-Type': 'application/json' } }))
    vi.stubGlobal('fetch', fetchMock)

    const result = await listMyTimesheets('test-only-token', '2026-10-01', '2026-10-14')

    const [url] = fetchMock.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe('/api/employee/timesheets?from=2026-10-01&to=2026-10-14')
    expect(result.ok).toBe(true)
    if (result.ok) expect(toTimesheet(result.data[0], 'EMP010')).toMatchObject({ id: '9', status: 'Pending', hours: 7.5 })
  })
})

describe('HR schedule and holiday forms', () => {
  it('needs at least one working day, quarter hours and a start date', () => {
    const all: Weekday[] = ['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY', 'SUNDAY']
    expect(validateSchedule({ weeklyOffs: ['SUNDAY'], hoursPerDay: '8', effectiveFrom: '2026-10-20' }, TODAY)).toEqual({})
    expect(Object.keys(validateSchedule({ weeklyOffs: all, hoursPerDay: '7.2', effectiveFrom: '' }, TODAY)).sort())
      .toEqual(['effectiveFrom', 'hoursPerDay', 'weeklyOffs'])
    expect(validateSchedule({ weeklyOffs: [], hoursPerDay: '9.75', effectiveFrom: TODAY }, TODAY)).toEqual({})
  })

  it('refuses a start date in the past, like the server', () => {
    expect(validateSchedule({ weeklyOffs: ['SUNDAY'], hoursPerDay: '8', effectiveFrom: '2026-10-13' }, TODAY).effectiveFrom)
      .toBeDefined()
  })

  it('needs a holiday date and name', () => {
    expect(validateHoliday({ date: '2026-10-02', name: 'Gandhi Jayanti' })).toEqual({})
    expect(Object.keys(validateHoliday({ date: '', name: '  ' })).sort()).toEqual(['date', 'name'])
  })
})

describe('weeks and daily hours', () => {
  it('starts weeks on Monday', () => {
    expect(weekStartOf('2026-10-14')).toBe('2026-10-12')
    expect(weekStartOf('2026-10-12')).toBe('2026-10-12')
    expect(weekStartOf('2026-10-18')).toBe('2026-10-12')
  })

  it('accepts 1 to 9 hours per day in quarter hours', () => {
    for (const ok of ['1', '1.25', '2.5', '8.75', '9']) expect(checkDayHours(ok), ok).toBeUndefined()
  })

  it('refuses hours below 1, above 9 or not in quarter hours, with a clear message', () => {
    for (const bad of ['0', '0.25', '0.5', '0.75', '0.99', '9.25', '10', '7.1', '1.2', '-1', 'x', ' ']) {
      expect(checkDayHours(bad), bad).toBe('Enter hours from 1 to 9, in steps of 0.25 (for example 7.5).')
    }
  })
})
