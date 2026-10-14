import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  buildMonthGrid, buildWeek, checkDayHours, defaultHours, hasWeekErrors, monthRange, shiftMonth, submitTimesheet,
  toTimesheet, validateHoliday, validateSchedule, validateTimesheet, validateWeek, weekStartOf,
  type CalendarDay, type DayCell, type Weekday,
} from './workCalendar'
import type { Timesheet } from '../data/types'

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

  it('sends the entry as JSON and maps the server record', async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({
      id: 9, date: '2026-10-13', hours: 7.5, description: 'Payslip screen', status: 'PENDING', submittedAt: '2026-10-13T10:00:00Z',
    }), { status: 201, headers: { 'Content-Type': 'application/json' } }))
    vi.stubGlobal('fetch', fetchMock)

    const result = await submitTimesheet('test-only-token', { date: '2026-10-13', hours: '7.5', description: ' Payslip screen ' })

    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe('/api/employee/timesheets')
    expect(JSON.parse(init.body as string)).toEqual({ date: '2026-10-13', hours: 7.5, description: 'Payslip screen' })
    expect(result.ok).toBe(true)
    if (result.ok) expect(toTimesheet(result.data, 'EMP010')).toMatchObject({ id: '9', status: 'Pending', hours: 7.5 })
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

describe('weekly timesheet rows', () => {
  const october = serverMonth('2026-10', { holidays: { '2026-10-02': 'Gandhi Jayanti', '2026-10-03': 'Weekend holiday' } })
  const submitted: Timesheet[] = [{ id: '1', employeeId: 'EMP010', date: '2026-10-12', hours: 8, description: 'x', status: 'Pending' }]

  it('starts weeks on Monday', () => {
    expect(weekStartOf('2026-10-14')).toBe('2026-10-12')
    expect(weekStartOf('2026-10-12')).toBe('2026-10-12')
    expect(weekStartOf('2026-10-18')).toBe('2026-10-12')
  })

  it('shows seven labelled days; only open working days take hours', () => {
    const rows = buildWeek('2026-10-12', october, TODAY, submitted)
    expect(rows.map((r) => r.label)).toEqual([
      'Monday · Oct 12', 'Tuesday · Oct 13', 'Wednesday · Oct 14', 'Thursday · Oct 15',
      'Friday · Oct 16', 'Saturday · Oct 17', 'Sunday · Oct 18',
    ])
    expect(rows.map((r) => r.state)).toEqual(['submitted', 'available', 'available', 'future', 'future', 'weekly-off', 'weekly-off'])
    expect(rows.filter((r) => !r.disabled).map((r) => r.iso)).toEqual(['2026-10-13', '2026-10-14'])
    expect(rows[0].entry?.hours).toBe(8)
  })

  it('greys out holidays, including a holiday on a weekly off', () => {
    const rows = buildWeek('2026-09-28', [...serverMonth('2026-09'), ...october], TODAY, [])
    expect(rows[4]).toMatchObject({ iso: '2026-10-02', state: 'holiday', disabled: true, holidayName: 'Gandhi Jayanti' })
    expect(rows[5]).toMatchObject({ iso: '2026-10-03', state: 'holiday', disabled: true })
    expect(rows.filter((r) => !r.disabled)).toHaveLength(4)
  })

  it('defaults to five workdays with the company default schedule, and follows other schedules', () => {
    expect(buildWeek('2026-10-05', october, TODAY, []).filter((r) => r.state === 'available')).toHaveLength(5)
    const sixDays = serverMonth('2026-10', { offs: [0] })
    expect(buildWeek('2026-10-05', sixDays, TODAY, []).filter((r) => r.state === 'available')).toHaveLength(6)
  })

  it('pre-fills scheduled hours, never more than 9', () => {
    const longDays = serverMonth('2026-10').map((d) => ({ ...d, hoursPerDay: 10 }))
    const rows = buildWeek('2026-10-05', longDays, TODAY, [])
    expect(defaultHours(rows[0])).toBe('9')
    expect(defaultHours(buildWeek('2026-10-05', october, TODAY, [])[0])).toBe('8')
    expect(defaultHours(rows[5])).toBe('')
  })

  it('accepts 1 to 9 hours per day in quarter hours', () => {
    for (const ok of ['1', '1.25', '2.5', '8.75', '9']) expect(checkDayHours(ok), ok).toBeUndefined()
  })

  it('refuses hours below 1, above 9 or not in quarter hours, with a clear message', () => {
    for (const bad of ['0', '0.25', '0.5', '0.75', '0.99', '9.25', '10', '7.1', '1.2', '-1', 'x', ' ']) {
      expect(checkDayHours(bad), bad).toBe('Enter hours from 1 to 9, in steps of 0.25 (for example 7.5).')
    }
  })

  it('never pre-fills a value below 1 hour', () => {
    const shortDays = serverMonth('2026-10').map((d) => ({ ...d, hoursPerDay: 0.5 }))
    expect(defaultHours(buildWeek('2026-10-05', shortDays, TODAY, [])[0])).toBe('')
  })

  it('submits only filled open days, and checks hours and description', () => {
    const rows = buildWeek('2026-10-12', october, TODAY, submitted)
    // An empty box skips that day; greyed days are ignored.
    const ok = validateWeek(rows, { '2026-10-13': '9', '2026-10-14': '', '2026-10-17': '8' }, 'Payslip screen')
    expect(ok.entries).toEqual([{ date: '2026-10-13', hours: '9' }])
    expect(validateWeek(rows, { '2026-10-13': '1', '2026-10-14': '8.75' }, 'x').entries).toHaveLength(2)
    expect(hasWeekErrors(ok.errors)).toBe(false)

    const bad = validateWeek(rows, { '2026-10-13': '10', '2026-10-14': '0.5' }, ' ')
    expect(Object.keys(bad.errors.hours)).toEqual(['2026-10-13', '2026-10-14'])
    expect(bad.errors.description).toBeDefined()

    const empty = validateWeek(rows, {}, 'x')
    expect(empty.errors.form).toBe('Enter hours for at least one working day.')
  })
})
