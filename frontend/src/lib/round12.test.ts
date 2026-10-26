import { beforeEach, describe, expect, it, vi } from 'vitest'

const native = vi.hoisted(() => ({
  isNative: true,
  schedule: vi.fn(),
  cancel: vi.fn(),
  register: vi.fn(),
}))

vi.mock('@capacitor/core', () => ({ Capacitor: { isNativePlatform: () => native.isNative } }))
vi.mock('@capacitor/local-notifications', () => ({
  Weekday: { Sunday: 1, Monday: 2 },
  LocalNotifications: {
    checkPermissions: async () => ({ display: 'granted' }),
    requestPermissions: async () => ({ display: 'granted' }),
    createChannel: async () => undefined,
    schedule: native.schedule,
    cancel: native.cancel,
    addListener: vi.fn(),
  },
}))
vi.mock('@capawesome-team/capacitor-file-opener', () => ({ FileOpener: { openFile: vi.fn() } }))
vi.mock('@capacitor/push-notifications', () => ({
  PushNotifications: { register: native.register, addListener: vi.fn(), removeAllListeners: vi.fn() },
}))

import { dragOffset, slideClass, swipeDirection } from '../components/useSwipe'
import { MONTH_NAMES, defaultPayslipChoice, findPayslip, payslipPeriod, payslipYears, periodLabel } from './payslips'
import { addMonths, holidaysByMonth, holidaysInMonth, monthRange, monthTitle } from './holidayMonth'
import { canOpenWeek, oldestOpenWeek } from './timesheetHistory'
import { notificationTarget } from './notifications'
import { PUSH_CONFIGURED, startPush } from './push'
import { cancelWeeklyReminders, scheduleWeeklyReminders } from './systemNotifications'

beforeEach(() => {
  native.isNative = true
  native.schedule.mockReset().mockResolvedValue({ notifications: [] })
  native.cancel.mockReset().mockResolvedValue(undefined)
  native.register.mockReset()
})

describe('swipe', () => {
  it('a mostly sideways move of 60 px or more is a swipe', () => {
    expect(swipeDirection(-80, 10, 200, 400)).toBe('left')
    expect(swipeDirection(90, -20, 200, 400)).toBe('right')
  })

  it('short, vertical, or edge (Android back gesture) moves are not', () => {
    expect(swipeDirection(-40, 0, 200, 400)).toBeNull()
    expect(swipeDirection(-80, 70, 200, 400)).toBeNull()
    expect(swipeDirection(120, 0, 10, 400)).toBeNull() // starts at the left edge
    expect(swipeDirection(-120, 0, 390, 400)).toBeNull()
  })
})

describe('timesheet weeks', () => {
  it('every past week of the last 60 days opens to be looked at; future weeks do not', () => {
    const today = '2026-10-28' // Wednesday
    expect(oldestOpenWeek(today)).toBe('2026-08-24')
    expect(canOpenWeek('2026-10-26', today)).toBe(true)
    expect(canOpenWeek('2026-10-12', today)).toBe(true)
    expect(canOpenWeek('2026-08-24', today)).toBe(true)
    expect(canOpenWeek('2026-08-17', today)).toBe(false)
    expect(canOpenWeek('2026-11-02', today)).toBe(false)
  })
})

describe('payslips by month and year', () => {
  const slips = [
    { title: 'Payslip - September 2026', period: '2026-09' },
    { title: 'Payslip - August 2026', period: null },
    { title: 'July 2026', period: '2026-07' },
  ]

  it('knows each payslip’s month from its period or its title', () => {
    expect(slips.map(payslipPeriod)).toEqual(['2026-09', '2026-08', '2026-07'])
    expect(payslipPeriod({ title: 'Bonus letter', period: null })).toBeNull()
    expect(periodLabel('2026-09')).toBe('September 2026')
    expect(MONTH_NAMES).toHaveLength(12)
  })

  it('finds only the payslip of the chosen month and year', () => {
    expect(findPayslip(slips, 2026, 8)?.title).toBe('Payslip - August 2026')
    expect(findPayslip(slips, 2026, 10)).toBeNull()
    expect(findPayslip(slips, 2025, 9)).toBeNull()
  })

  it('offers the years with payslips plus this year, and starts on the newest payslip', () => {
    expect(payslipYears([{ title: 'x', period: '2024-03' }, ...slips], new Date('2026-10-26'))).toEqual([2026, 2024])
    expect(defaultPayslipChoice(slips)).toEqual({ year: 2026, month: 9 })
    expect(defaultPayslipChoice([], new Date('2026-01-15T00:00:00'))).toEqual({ year: 2025, month: 12 })
  })
})

describe('holidays this month', () => {
  const holidays = [
    { id: 2, date: '2026-11-08', name: 'Diwali', weekday: 'SUNDAY' as const },
    { id: 1, date: '2026-10-20', name: 'Dasara', weekday: 'TUESDAY' as const },
    { id: 3, date: '2026-10-02', name: 'Gandhi Jayanti', weekday: 'FRIDAY' as const },
  ]

  it('lists one month’s holidays in date order', () => {
    expect(holidaysInMonth(holidays, '2026-10').map((h) => h.name)).toEqual(['Gandhi Jayanti', 'Dasara'])
    expect(holidaysInMonth(holidays, '2026-12')).toEqual([])
  })

  it('moves between months across the year end, within this and next year', () => {
    expect(addMonths('2026-12', 1)).toBe('2027-01')
    expect(addMonths('2026-01', -1)).toBe('2025-12')
    expect(monthRange(new Date('2026-10-26'))).toEqual({ first: '2026-01', last: '2027-12' })
    expect(monthTitle('2026-10')).toContain('October')
  })
})

describe('reminders and push', () => {
  it('a timesheet reminder opens the timesheet; a decision opens Requests', () => {
    expect(notificationTarget({ type: 'TIMESHEET_REMINDER', linkType: 'TIMESHEET_WEEK', linkKey: '2026-10-19' }))
      .toEqual({ screen: 'timesheet', key: '2026-10-19' })
    expect(notificationTarget({ type: 'TIMESHEET_APPROVED', linkType: 'TIMESHEET_WEEK', linkKey: '2026-10-19' }))
      .toEqual({ screen: 'requests', view: 'timesheets', key: '2026-10-19' })
  })

  it('without Firebase in the build, push stays off and never starts Firebase', async () => {
    expect(PUSH_CONFIGURED).toBe(false)
    expect(await startPush('t', () => {}, () => {})).toBe(false)
    expect(native.register).not.toHaveBeenCalled()
  })

  it('the phone’s own reminder is set for Mondays at 11:00 and 21:00, and can be removed', async () => {
    expect(await scheduleWeeklyReminders()).toBe(true)
    const { notifications } = native.schedule.mock.calls[0][0] as { notifications: { id: number; schedule: { on: { weekday: number; hour: number; minute: number } } }[] }
    expect(notifications.map((n) => n.schedule.on)).toEqual([
      { weekday: 2, hour: 11, minute: 0 },
      { weekday: 2, hour: 21, minute: 0 },
    ])
    // Fixed ids: scheduling again replaces them instead of adding more.
    expect(notifications.map((n) => n.id)).toEqual([710011, 710021])
    await cancelWeeklyReminders()
    expect(native.cancel).toHaveBeenCalledWith({ notifications: [{ id: 710011 }, { id: 710021 }] })
  })

  it('in a browser nothing is scheduled', async () => {
    native.isNative = false
    expect(await scheduleWeeklyReminders()).toBe(false)
    expect(native.schedule).not.toHaveBeenCalled()
  })
})

describe('swipe feel', () => {
  it('the page follows the finger 1:1, with a rubber band where there is no page', () => {
    expect(dragOffset(-100, true)).toBe(-100)
    expect(dragOffset(80, true)).toBe(80)
    // Rubber band: moves less the further it is pulled, never past about 60 px.
    expect(Math.abs(dragOffset(-100, false))).toBeLessThan(30)
    expect(Math.abs(dragOffset(-1000, false))).toBeLessThan(60)
  })

  it('a quick flick changes the page even when it is short', () => {
    expect(swipeDirection(-30, 2, 200, 400, 0.8)).toBe('left')
    expect(swipeDirection(-30, 2, 200, 400, 0.1)).toBeNull()
    expect(swipeDirection(-15, 0, 200, 400, 2)).toBeNull()
  })

  it('new content slides in from the side it came from (not on first view)', () => {
    expect(slideClass('next')).toBe('slide-from-next')
    expect(slideClass('prev')).toBe('slide-from-prev')
    expect(slideClass(null)).toBe('')
  })
})

describe('holiday list', () => {
  it('groups every holiday HR published by month, in date order', () => {
    const list = holidaysByMonth([
      { id: 3, date: '2027-01-14', name: 'Sankranti', weekday: 'THURSDAY' },
      { id: 1, date: '2026-10-20', name: 'Dasara', weekday: 'TUESDAY' },
      { id: 2, date: '2026-10-02', name: 'Gandhi Jayanti', weekday: 'FRIDAY' },
    ])
    expect(list.map((g) => g.month)).toEqual(['2026-10', '2027-01'])
    expect(list[0].items.map((h) => h.name)).toEqual(['Gandhi Jayanti', 'Dasara'])
  })
})

describe('swipe pager', () => {
  it('settles on the nearest page, never past the first or last', async () => {
    const { pageAt } = await import('../components/SwipePager')
    expect(pageAt(0, 360, 2)).toBe(0)
    expect(pageAt(170, 360, 2)).toBe(0)
    expect(pageAt(190, 360, 2)).toBe(1)
    expect(pageAt(900, 360, 2)).toBe(1)
    expect(pageAt(-20, 360, 2)).toBe(0)
    expect(pageAt(100, 0, 2)).toBe(0)
  })
})

describe('HR change notifications and hike letters', () => {
  it('each new notification opens the screen it is about', () => {
    expect(notificationTarget({ type: 'HOLIDAYS_UPDATED', linkType: null, linkKey: null })).toEqual({ screen: 'holidays' })
    expect(notificationTarget({ type: 'LEAVE_BALANCE_UPDATED', linkType: null, linkKey: null })).toEqual({ screen: 'leave' })
    expect(notificationTarget({ type: 'LEAVE_PENDING_REMINDER', linkType: 'LEAVE_REQUEST', linkKey: '41' }))
      .toEqual({ screen: 'requests', view: 'leaves', key: '41' })
    expect(notificationTarget({ type: 'COMP_OFF_PENDING_REMINDER', linkType: 'COMP_OFF_REQUEST', linkKey: '7' }))
      .toEqual({ screen: 'compoff', key: '7' })
  })

  it('a hike letter is chosen by calendar year, newest first', async () => {
    const { calendarYears, periodKind, validateUpload } = await import('./documents')
    expect(calendarYears(new Date('2026-10-26'), 3)).toEqual(['2026', '2025', '2024'])
    expect(periodKind('COMPENSATION_LETTER')).toBe('calendarYear')
    const base = { employeeId: '4', title: '', file: null }
    expect(validateUpload({ ...base, type: 'COMPENSATION_LETTER', period: '2026-01' } as never).period).toBe('Choose the year of the hike letter.')
    expect(validateUpload({ ...base, type: 'COMPENSATION_LETTER', period: '2026' } as never).period).toBeUndefined()
  })
})

describe('notification cards', () => {
  it('each kind of notification gets its own icon and colour', async () => {
    const { notificationLook } = await import('../screens/employee/NotificationList')
    expect(notificationLook('LEAVE_APPROVED')).toMatchObject({ icon: 'check' })
    expect(notificationLook('TIMESHEET_REJECTED')).toMatchObject({ icon: 'x' })
    expect(notificationLook('TIMESHEET_REMINDER')).toMatchObject({ icon: 'clock' })
    expect(notificationLook('LEAVE_PENDING_REMINDER')).toMatchObject({ icon: 'clock' })
    expect(notificationLook('PAYSLIP_PUBLISHED')).toMatchObject({ icon: 'receipt' })
    expect(notificationLook('DOCUMENT_PUBLISHED')).toMatchObject({ icon: 'file' })
    expect(notificationLook('HOLIDAYS_UPDATED')).toMatchObject({ icon: 'calendar' })
    expect(notificationLook('LEAVE_BALANCE_UPDATED')).toMatchObject({ icon: 'wallet' })
    expect(notificationLook('SOMETHING_NEW')).toMatchObject({ icon: 'bell' })
  })
})
