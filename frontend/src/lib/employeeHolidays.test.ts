import { afterEach, describe, expect, it, vi } from 'vitest'
import { employeeNav, INITIAL_EMPLOYEE_NAV } from './employeeNav'
import { listMyHolidays, upcomingHolidays, type HolidayRecord } from './workCalendar'

afterEach(() => {
  vi.unstubAllGlobals()
})

const holidays: HolidayRecord[] = [
  { id: 3, date: '2026-12-25', name: 'Christmas', weekday: 'FRIDAY' },
  { id: 1, date: '2026-08-15', name: 'Independence Day', weekday: 'SATURDAY' },
  { id: 2, date: '2026-11-08', name: 'Diwali', weekday: 'SUNDAY' },
]

describe('employee holiday calendar', () => {
  it('reads the published list from the employee endpoint', async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify(holidays), { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)

    const result = await listMyHolidays('t', 2026)

    expect(result.ok && result.data).toHaveLength(3)
    expect((fetchMock.mock.calls[0] as unknown as [string])[0]).toBe('/api/employee/holidays?year=2026')
  })

  it('upcoming holidays start today, in date order', () => {
    expect(upcomingHolidays(holidays, '2026-10-23').map((h) => h.name)).toEqual(['Diwali', 'Christmas'])
    expect(upcomingHolidays(holidays, '2026-11-08')[0].name).toBe('Diwali')
    expect(upcomingHolidays(holidays, '2026-12-26')).toEqual([])
  })

  it('the Holidays card opens the holiday screen and Back returns home', () => {
    const open = employeeNav(INITIAL_EMPLOYEE_NAV, { type: 'open', sub: 'holidays' })
    expect(open).toMatchObject({ tab: 'home', sub: 'holidays' })
    expect(employeeNav(open, { type: 'back' })).toEqual(INITIAL_EMPLOYEE_NAV)
  })
})
