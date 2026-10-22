import { describe, expect, it } from 'vitest'
import { REVIEW_STATUSES, decisionQuestion, matchesSearch, rangeLabel, rejectReasonProblem, statusLabel } from './approvalView'

describe('approvals screen helpers', () => {
  it('offers Pending, Approved and Rejected filters with readable labels', () => {
    expect(REVIEW_STATUSES.map(statusLabel)).toEqual(['Pending', 'Approved', 'Rejected'])
    expect(statusLabel('SOMETHING')).toBe('Pending')
  })

  it('searches by employee name or ID, ignoring case and spaces', () => {
    expect(matchesSearch('', 'Ravi Kumar', 'EMP010')).toBe(true)
    expect(matchesSearch(' ravi ', 'Ravi Kumar', 'EMP010')).toBe(true)
    expect(matchesSearch('emp010', 'Ravi Kumar', 'EMP010')).toBe(true)
    expect(matchesSearch('kum', 'Ravi Kumar', 'EMP010')).toBe(true)
    expect(matchesSearch('priya', 'Ravi Kumar', 'EMP010')).toBe(false)
    expect(matchesSearch('x', null, null)).toBe(false)
  })

  it('writes ranges and the confirmation question', () => {
    expect(rangeLabel('2026-10-12', '2026-10-18')).toBe('12 Oct – 18 Oct')
    expect(rangeLabel('2026-10-20', '2026-10-20')).toBe('20 Oct')
    expect(decisionQuestion('approve', 'Ravi Kumar', 'timesheet', '12 Oct – 18 Oct')).toBe('Approve Ravi Kumar’s timesheet for 12 Oct – 18 Oct?')
    expect(decisionQuestion('reject', null, 'Casual leave', '20 Oct')).toBe('Reject this Casual leave for 20 Oct?')
  })

  it('needs a short reason to reject', () => {
    expect(rejectReasonProblem('')).toBeDefined()
    expect(rejectReasonProblem('  ok ')).toBeDefined()
    expect(rejectReasonProblem('Wrong project code')).toBeUndefined()
    expect(rejectReasonProblem('x'.repeat(501))).toBe('Use at most 500 characters.')
  })
})
