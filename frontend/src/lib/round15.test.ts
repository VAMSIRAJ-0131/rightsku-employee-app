import { describe, expect, it } from 'vitest'
import {
  changedFields, checkProfileField, formFrom, validateProfileForm, type PersonalDetails,
} from './profileChanges'
import { activityDay, activityTone, exportPath } from './activity'
import { notificationTarget } from './notifications'
import { toLeaveRequest } from './leave'
import { statusLabel } from './approvalView'

const details: PersonalDetails = {
  phone: '+91 98765 43210',
  address: null,
  emergencyContactName: null,
  emergencyContactPhone: null,
  bankAccountName: 'Vamsi A',
  bankAccountNumber: '•••• 9012',
  bankIfsc: 'SBIN0001234',
  pendingRequestId: null,
}

describe('profile update requests', () => {
  it('starts from the current details, with the masked account number left empty', () => {
    const form = formFrom(details)
    expect(form.phone).toBe('+91 98765 43210')
    expect(form.bankIfsc).toBe('SBIN0001234')
    expect(form.bankAccountNumber).toBe('')
  })

  it('sends only what changed; an empty account box keeps the account', () => {
    const form = { ...formFrom(details), address: '12 MG Road, Hyderabad' }
    expect(changedFields(details, form)).toEqual({ address: '12 MG Road, Hyderabad' })
    expect(changedFields(details, { ...form, bankAccountNumber: '1234567890' })).toMatchObject({ bankAccountNumber: '1234567890' })
    // Clearing a box removes that detail.
    expect(changedFields(details, { ...formFrom(details), phone: '' })).toEqual({ phone: '' })
  })

  it('checks values like the server does', () => {
    expect(checkProfileField('phone', '12345')).toMatch(/10 to 15 digits/)
    expect(checkProfileField('phone', '+91 98765 43210')).toBeUndefined()
    expect(checkProfileField('bankAccountNumber', '12AB')).toMatch(/9 to 18 digits/)
    expect(checkProfileField('bankIfsc', 'sbin0001234')).toBeUndefined()
    expect(checkProfileField('bankIfsc', 'SBIN1234')).toMatch(/IFSC/)
    expect(checkProfileField('address', '')).toBeUndefined()
    expect(validateProfileForm(details, formFrom(details)).form).toBe('Change at least one detail.')
    expect(validateProfileForm(details, { ...formFrom(details), bankIfsc: 'BAD' }).bankIfsc).toMatch(/IFSC/)
  })

  it('a profile notification opens Profile', () => {
    expect(notificationTarget({ type: 'PROFILE_CHANGE_APPROVED' })).toEqual({ screen: 'profile' })
    expect(notificationTarget({ type: 'PROFILE_CHANGE_REJECTED' })).toEqual({ screen: 'profile' })
  })
})

describe('cancelled requests', () => {
  it('show as Cancelled, not Pending', () => {
    expect(statusLabel('CANCELLED')).toBe('Cancelled')
    const leave = toLeaveRequest({
      id: 1, employeeId: 4, employeeCode: 'E', employeeName: 'x', leaveType: 'CASUAL', label: 'Casual', startDate: '2026-11-04',
      endDate: '2026-11-04', days: 1, reason: 'Trip', status: 'CANCELLED', submittedAt: null, reviewedAt: null, reviewNote: null,
    } as never, '4')
    expect(leave.status).toBe('Cancelled')
  })
})

describe('HR activity and exports', () => {
  it('colours approvals green and rejections and cancellations red', () => {
    expect(activityTone('LEAVE_APPROVED')).toBe('approved')
    expect(activityTone('COMP_OFF_CREDITED')).toBe('approved')
    expect(activityTone('TIMESHEET_REJECTED')).toBe('rejected')
    expect(activityTone('LEAVE_CANCELLED')).toBe('rejected')
    expect(activityTone('EMPLOYEE_UPDATED')).toBe('neutral')
  })

  it('groups by Today, Yesterday and the date', () => {
    const now = new Date('2026-10-26T15:00:00')
    expect(activityDay('2026-10-26T09:30:00', now)).toBe('Today')
    expect(activityDay('2026-10-25T23:00:00', now)).toBe('Yesterday')
    expect(activityDay('2026-10-19T10:00:00', now)).toMatch(/19 Oct/)
  })

  it('asks for the right export', () => {
    expect(exportPath('employees', '2026-10')).toBe('/api/hr/exports/employees')
    expect(exportPath('employees', '2026-10', true)).toBe('/api/hr/exports/employees?bank=true')
    expect(exportPath('leave', '2026-10')).toBe('/api/hr/exports/leave?month=2026-10')
    expect(exportPath('comp-off', '2026-09')).toBe('/api/hr/exports/comp-off?month=2026-09')
  })
})
