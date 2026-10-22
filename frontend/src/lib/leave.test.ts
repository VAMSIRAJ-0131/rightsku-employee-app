import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  LEAVE_TYPES, applyForLeave, checkBalance, countWorkingDays, decideLeave, getLeaveBalances, getMyLeaveBalances, hasLeaveErrors,
  availableBalanceText, leaveTypeName, leaveTypeOption, totalAvailable, setLeaveBalance, toLeaveBalance, toLeaveRequest, validateLeave, type LeaveBalanceRecord,
  type LeaveFormValues,
} from './leave'
import type { CalendarDay } from './workCalendar'

const TOKEN = 'test-only-token'

function balance(type: 'CASUAL' | 'SICK' | 'EARNED', bal: number, pending = 0): LeaveBalanceRecord {
  const label = { CASUAL: 'Casual', SICK: 'Sick', EARNED: 'Earned' }[type]
  return { leaveType: type, label, balanceDays: bal, pendingDays: pending, availableDays: Math.max(0, bal - pending), updatedAt: null }
}

/** 19-25 Oct 2026: Mon-Thu working, Fri 23 holiday, Sat/Sun weekly off. */
const WEEK: CalendarDay[] = [
  ['2026-10-19', 'WORKING'], ['2026-10-20', 'WORKING'], ['2026-10-21', 'WORKING'], ['2026-10-22', 'WORKING'],
  ['2026-10-23', 'HOLIDAY'], ['2026-10-24', 'WEEKLY_OFF'], ['2026-10-25', 'WEEKLY_OFF'],
].map(([date, kind]) => ({ date, kind: kind as CalendarDay['kind'], weeklyOff: kind === 'WEEKLY_OFF', holidayName: kind === 'HOLIDAY' ? 'Test' : null, hoursPerDay: 9 }))

const FORM: LeaveFormValues = { leaveType: 'CASUAL', startDate: '2026-10-19', endDate: '2026-10-25', reason: 'Family function' }

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('Leave Type dropdown', () => {
  it('lists every supported type, in order, with its dropdown name', () => {
    expect(LEAVE_TYPES.map((t) => leaveTypeName(t.id))).toEqual(['Casual Leave', 'Sick Leave', 'Earned Leave', 'Comp-Off'])
  })

  it('shows the days available in each option when the balance is known', () => {
    const list = [balance('CASUAL', 5, 3), balance('SICK', 1)]
    expect(leaveTypeOption('CASUAL', list)).toBe('Casual Leave · 2 days available')
    expect(leaveTypeOption('SICK', list)).toBe('Sick Leave · 1 day available')
    expect(leaveTypeOption('COMP_OFF', list)).toBe('Comp-Off')
    expect(leaveTypeOption('EARNED', null)).toBe('Earned Leave')
  })

  it('totals the available days across every leave type', () => {
    expect(totalAvailable([balance('CASUAL', 5, 3), balance('SICK', 1), balance('EARNED', 0)])).toBe(3)
    expect(totalAvailable([])).toBe(0)
  })

  it('shows the selected type\'s available balance, and changes with the type', () => {
    const list = [balance('CASUAL', 1), balance('SICK', 0), balance('EARNED', 4, 1.5)]
    expect(availableBalanceText('CASUAL', list)).toBe('Available balance: 1 day')
    expect(availableBalanceText('SICK', list)).toBe('Available balance: 0 days')
    expect(availableBalanceText('EARNED', list)).toBe('Available balance: 2.5 days')
    expect(availableBalanceText('COMP_OFF', list)).toBe('Available balance: 0 days')
    expect(availableBalanceText('', list)).toBeNull()
    expect(availableBalanceText('CASUAL', null)).toBeNull()
  })

  it('asks for a leave type when none is chosen', () => {
    expect(validateLeave({ ...FORM, leaveType: '' }, [balance('CASUAL', 5)], 4).leaveType).toBe('Choose the leave type.')
  })
})

describe('leave form', () => {
  it('counts working days only (weekly offs and holidays left out)', () => {
    expect(countWorkingDays(WEEK, '2026-10-19', '2026-10-25')).toBe(4)
    expect(countWorkingDays(WEEK, '2026-10-23', '2026-10-25')).toBe(0)
  })

  it('accepts a request that fits the available balance', () => {
    expect(validateLeave(FORM, [balance('CASUAL', 5)], 4)).toEqual({})
  })

  it('refuses a request bigger than the available balance, with a clear message', () => {
    const errors = validateLeave(FORM, [balance('CASUAL', 5, 2)], 4)
    expect(errors.form).toBe('Not enough Casual leave: this request needs 4 days, and you have 3 available.')
    expect(hasLeaveErrors(errors)).toBe(true)
  })

  it('refuses dates with no working days, wrong order, missing type and reason', () => {
    expect(validateLeave({ ...FORM, startDate: '2026-10-24' }, [balance('CASUAL', 5)], 0).endDate).toContain('weekly offs or company holidays')
    expect(validateLeave({ ...FORM, endDate: '2026-10-18' }, [balance('CASUAL', 5)], null).endDate).toBe('The last day must be on or after the first day.')
    const empty = validateLeave({ leaveType: '', startDate: '', endDate: '', reason: ' ' }, [], null)
    expect(Object.keys(empty).sort()).toEqual(['endDate', 'leaveType', 'reason', 'startDate'])
  })

  it('maps server records for the existing lists and home card', () => {
    expect(toLeaveBalance(balance('SICK', 6, 1))).toEqual({ type: 'Sick', left: 5, total: 6 })
    expect(toLeaveRequest({
      id: 7, employeeId: 10, employeeCode: 'EMP010', employeeName: 'Ravi Kumar', leaveType: 'EARNED', label: 'Earned',
      startDate: '2026-10-19', endDate: '2026-10-21', days: '3.0', reason: 'Trip', status: 'REJECTED',
      submittedAt: null, reviewedAt: null, reviewNote: 'Release week',
    }, 'EMP010')).toEqual({
      id: '7', employeeId: 'EMP010', type: 'Earned', from: '2026-10-19', to: '2026-10-21', days: 3, reason: 'Trip',
      status: 'Rejected', remark: 'Release week',
    })
  })
})

describe('HR balance input', () => {
  it('allows 0 to 365 in half days only', () => {
    for (const ok of ['0', '7.5', '12', '365']) expect(checkBalance(ok), ok).toBeUndefined()
    for (const bad of ['-1', '-0.5', '365.5', '2.25', 'abc', '']) expect(checkBalance(bad), bad).toBeDefined()
  })
})

describe('leave API', () => {
  it('uses the employee and HR endpoints with the token', async () => {
    const fetchMock = vi.fn(async () => new Response('[]', { status: 200, headers: { 'Content-Type': 'application/json' } }))
    vi.stubGlobal('fetch', fetchMock)

    await getMyLeaveBalances(TOKEN)
    await applyForLeave(TOKEN, { ...FORM, reason: '  Family function  ' })
    await getLeaveBalances(TOKEN, 10)
    await setLeaveBalance(TOKEN, 10, 'CASUAL', '7.5')
    await decideLeave(TOKEN, 5, 'reject', ' Busy week ')

    const calls = fetchMock.mock.calls as unknown as [string, RequestInit][]
    expect(calls.map(([url, init]) => `${init.method ?? 'GET'} ${url}`)).toEqual([
      'GET /api/employee/leave/balances',
      'POST /api/employee/leave/requests',
      'GET /api/hr/employees/10/leave-balances',
      'PUT /api/hr/employees/10/leave-balances/CASUAL',
      'POST /api/hr/leave-requests/5/reject',
    ])
    expect(JSON.parse(calls[1][1].body as string)).toEqual({
      leaveType: 'CASUAL', startDate: '2026-10-19', endDate: '2026-10-25', reason: 'Family function',
    })
    expect(JSON.parse(calls[3][1].body as string)).toEqual({ balanceDays: 7.5 })
    expect(JSON.parse(calls[4][1].body as string)).toEqual({ note: 'Busy week' })
    expect(calls.every(([, init]) => (init.headers as Record<string, string>).Authorization === `Bearer ${TOKEN}`)).toBe(true)
  })
})
