import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  adjustCompOff, balanceAfter, changeLabel, getCompOff, hasAdjustmentErrors, newRequestKey, signedChange,
  validateAdjustment, type AdjustmentForm,
} from './compOff'
import { LEAVE_TYPES, isSetDirectly, validateLeave, type LeaveBalanceRecord } from './leave'

const TOKEN = 'test-only-token'
const ADD: AdjustmentForm = { direction: 'add', days: '1.5', reason: 'Worked on Sunday 18 Oct' }

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('Comp-Off as a leave type', () => {
  it('is offered to employees after the existing types, which are unchanged', () => {
    expect(LEAVE_TYPES.map((t) => t.id)).toEqual(['CASUAL', 'SICK', 'EARNED', 'COMP_OFF'])
    expect(LEAVE_TYPES[3].label).toBe('Comp-Off')
  })

  it('is the only balance HR cannot set directly', () => {
    expect(LEAVE_TYPES.filter((t) => isSetDirectly(t.id)).map((t) => t.id)).toEqual(['CASUAL', 'SICK', 'EARNED'])
  })

  it('uses the normal leave checks, including the available balance', () => {
    const compOff: LeaveBalanceRecord = { leaveType: 'COMP_OFF', label: 'Comp-Off', balanceDays: 1, pendingDays: 0, availableDays: 1, updatedAt: null }
    const form = { leaveType: 'COMP_OFF' as const, startDate: '2026-10-19', endDate: '2026-10-20', reason: 'Day off' }
    expect(validateLeave(form, [compOff], 2).form).toBe('Not enough Comp-Off leave: this request needs 2 days, and you have 1 available.')
    expect(validateLeave({ ...form, endDate: '2026-10-19' }, [compOff], 1)).toEqual({})
    expect(validateLeave({ ...form, reason: '  ' }, [compOff], 1).reason).toBe('Give a reason.')
  })
})

describe('HR Comp-Off adjustment form', () => {
  it('accepts whole and half days with a reason, and shows the new balance', () => {
    expect(validateAdjustment(ADD, 0)).toEqual({})
    expect(balanceAfter(ADD, 2)).toBe(3.5)
    expect(signedChange(ADD)).toBe(1.5)
    expect(signedChange({ ...ADD, direction: 'deduct', days: '0.5' })).toBe(-0.5)
    expect(balanceAfter({ ...ADD, direction: 'deduct', days: '0.5' }, 2)).toBe(1.5)
    expect(balanceAfter({ ...ADD, days: '' }, 2)).toBeNull()
  })

  it('requires a reason of 3 to 500 characters', () => {
    expect(validateAdjustment({ ...ADD, reason: '' }, 0).reason).toBe('Give a reason (at least 3 characters).')
    expect(validateAdjustment({ ...ADD, reason: ' ok ' }, 0).reason).toBe('Give a reason (at least 3 characters).')
    expect(validateAdjustment({ ...ADD, reason: 'x'.repeat(501) }, 0).reason).toBe('Use at most 500 characters.')
  })

  it('refuses 0, negative, non-half-day and out-of-range changes', () => {
    for (const bad of ['', '0', '-1', 'abc', '0.3', '1.25']) {
      expect(hasAdjustmentErrors(validateAdjustment({ ...ADD, days: bad }, 5))).toBe(true)
    }
    expect(validateAdjustment({ ...ADD, direction: 'deduct', days: '3' }, 2).days)
      .toBe('You can deduct at most 2 days: the Comp-Off balance is 2.')
    expect(validateAdjustment({ ...ADD, days: '2' }, 364).days).toBe('The Comp-Off balance can be at most 365 days.')
    expect(validateAdjustment({ ...ADD, direction: 'deduct', days: '2' }, 2)).toEqual({})
  })

  it('labels changes with a sign', () => {
    expect(changeLabel(1.5)).toBe('+1.5 days')
    expect(changeLabel('-1.0')).toBe('−1 day')
  })

  it('makes a different key for every change', () => {
    const a = newRequestKey()
    expect(a).toMatch(/^[A-Za-z0-9-]{8,64}$/)
    expect(newRequestKey()).not.toBe(a)
  })
})

describe('Comp-Off API', () => {
  function respond(status: number, body: unknown) {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } }))
    vi.stubGlobal('fetch', fetchMock)
    return fetchMock
  }

  it('loads one employee’s balance and history', async () => {
    const fetchMock = respond(200, { employeeId: 10, balanceDays: 1.5, pendingDays: 0, availableDays: 1.5, history: [] })
    const result = await getCompOff(TOKEN, 10)
    expect(result.ok).toBe(true)
    expect((fetchMock.mock.calls[0] as unknown as [string])[0]).toBe('/api/hr/employees/10/comp-off')
  })

  it('sends a deduction as a negative number, with the trimmed reason and the change key', async () => {
    const fetchMock = respond(200, { employeeId: 10, balanceDays: 1, pendingDays: 0, availableDays: 1, history: [] })
    await adjustCompOff(TOKEN, 10, { direction: 'deduct', days: '0.5', reason: '  Entered twice  ' }, 'key-test-0001')
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe('/api/hr/employees/10/comp-off/adjustments')
    expect(init.method).toBe('POST')
    expect(JSON.parse(String(init.body))).toEqual({ changeDays: -0.5, reason: 'Entered twice', requestKey: 'key-test-0001' })
  })

  it('passes the server’s refusal and field message through', async () => {
    respond(400, { status: 400, error: 'Invalid request', fields: { changeDays: 'You can deduct at most 1 day: the Comp-Off balance is 1.' } })
    const result = await adjustCompOff(TOKEN, 10, { direction: 'deduct', days: '2', reason: 'Fix' }, 'key-test-0002')
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error.fields.changeDays).toBe('You can deduct at most 1 day: the Comp-Off balance is 1.')
  })
})
