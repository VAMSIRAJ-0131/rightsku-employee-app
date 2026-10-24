import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  EMPTY_EMPLOYEE_FORM, displayNameOf, formFromRecord, genderLabel, prefixLabel, toCreatePayload, toUpdatePayload,
  validateEmployeeForm, type EmployeeRecord,
} from './employees'
import { withProfileRecord } from './profile'
import { addressChoices, getMyIdCard, saveCompany, validateAddress, validateCompany } from './company'
import {
  clearAllNotifications, clearNotification, notificationTarget,
} from './notifications'

afterEach(() => {
  vi.unstubAllGlobals()
})

const record: EmployeeRecord = {
  id: 4, employeeCode: '10007', firstName: 'Vamsi', lastName: 'Ajjampudi', email: 'v@example.invalid', phone: null,
  department: null, jobTitle: null, joiningDate: '2026-06-01', status: 'ACTIVE', createdAt: '', updatedAt: '',
  gender: 'MALE', namePrefix: 'MR', displayName: 'Mr. Vamsi Ajjampudi', companyAddressId: 7,
}

describe('name prefix and gender', () => {
  it('shows the prefix with the full name, without doubling it', () => {
    expect(displayNameOf(record)).toBe('Mr. Vamsi Ajjampudi')
    expect(displayNameOf({ ...record, displayName: null })).toBe('Mr. Vamsi Ajjampudi')
    expect(displayNameOf({ ...record, displayName: null, firstName: 'Mr. Vamsi' })).toBe('Mr. Vamsi Ajjampudi')
    expect(displayNameOf({ ...record, displayName: null, namePrefix: null })).toBe('Vamsi Ajjampudi')
    expect(prefixLabel('MRS')).toBe('Mrs.')
    expect(genderLabel('FEMALE')).toBe('Female')
    expect(genderLabel(null)).toBe('')
  })

  it('the home screen gets the full name with prefix; initials keep the plain name', () => {
    const session = { id: '10007', name: '10007', department: '', designation: '', joiningDate: '', email: '', phone: '',
      location: '', manager: '', active: true, role: 'employee' as const }
    const user = withProfileRecord(session, record)
    expect(user.displayName).toBe('Mr. Vamsi Ajjampudi')
    expect(user.name).toBe('Vamsi Ajjampudi')
  })

  it('HR saves and reads back gender, prefix and office', () => {
    const form = formFromRecord(record)
    expect([form.gender, form.namePrefix, form.companyAddressId]).toEqual(['MALE', 'MR', '7'])
    expect(toUpdatePayload(form)).toMatchObject({ gender: 'MALE', namePrefix: 'MR', companyAddressId: 7 })
    expect(toCreatePayload({ ...EMPTY_EMPLOYEE_FORM, firstName: 'A', lastName: 'B', email: 'a@b.co', initialPassword: 'x'.repeat(12) }))
      .toMatchObject({ gender: null, namePrefix: null, companyAddressId: null })
    expect(validateEmployeeForm({ ...form, gender: 'OTHER' as never }, 'edit').gender).toBe('Choose Male or Female.')
    expect(validateEmployeeForm({ ...form, namePrefix: 'DR' as never }, 'edit').namePrefix).toBe('Choose Mr., Ms. or Mrs.')
  })
})

describe('company profile', () => {
  it('needs a name and a valid phone (optional)', () => {
    expect(validateCompany({ name: 'Test Company', phone: '+91 40 1234 5678' })).toEqual({})
    expect(validateCompany({ name: 'Test Company', phone: '' })).toEqual({})
    expect(validateCompany({ name: ' ', phone: '' }).name).toBeDefined()
    for (const bad of ['12345', 'call me', '+91 1234 5678 9012 3456']) expect(validateCompany({ name: 'X', phone: bad }).phone, bad).toBeDefined()
    expect(validateAddress({ label: '', address: '' })).toMatchObject({ label: expect.any(String), address: expect.any(String) })
  })

  it('offers active offices, plus the one an employee already has', () => {
    const offices = [
      { id: 1, label: 'Head office', address: 'A', active: true },
      { id: 2, label: 'Old office', address: 'B', active: false },
    ]
    expect(addressChoices(offices).map((a) => a.id)).toEqual([1])
    expect(addressChoices(offices, 2).map((a) => a.id)).toEqual([1, 2])
  })

  it('calls the HR and employee endpoints', async () => {
    const fetchMock = vi.fn(async () => new Response('{}', { status: 200, headers: { 'Content-Type': 'application/json' } }))
    vi.stubGlobal('fetch', fetchMock)
    await saveCompany('t', { name: ' Test Company ', phone: '' })
    await getMyIdCard('t')
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe('/api/hr/company')
    expect(init.method).toBe('PUT')
    expect(JSON.parse(String(init.body))).toEqual({ name: 'Test Company', phone: null })
    expect((fetchMock.mock.calls[1] as unknown as [string])[0]).toBe('/api/employee/profile/id-card')
  })
})

describe('notifications', () => {
  it('open the screen of the record they are about', () => {
    expect(notificationTarget({ type: 'LEAVE_APPROVED', linkType: 'LEAVE_REQUEST', linkKey: '41' }))
      .toEqual({ screen: 'requests', view: 'leaves', key: '41' })
    expect(notificationTarget({ type: 'TIMESHEET_REJECTED', linkType: 'TIMESHEET_WEEK', linkKey: '2026-10-12' }))
      .toEqual({ screen: 'requests', view: 'timesheets', key: '2026-10-12' })
    expect(notificationTarget({ type: 'PAYSLIP_PUBLISHED', linkType: 'DOCUMENT', linkKey: '9' })).toEqual({ screen: 'payslips', key: '9' })
    expect(notificationTarget({ type: 'DOCUMENT_PUBLISHED', linkType: 'DOCUMENT', linkKey: '10' })).toEqual({ screen: 'documents', key: '10' })
    expect(notificationTarget({ type: 'COMP_OFF_APPROVED', linkType: 'COMP_OFF_REQUEST', linkKey: '3' })).toEqual({ screen: 'compoff', key: '3' })
    expect(notificationTarget({ type: 'SCHEDULE_CHANGED', linkType: 'SCHEDULE', linkKey: '2026-10-19' }))
      .toEqual({ screen: 'schedule', key: '2026-10-19' })
  })

  it('older notifications without a link still open the right screen; unknown ones stay put', () => {
    expect(notificationTarget({ type: 'LEAVE_REJECTED' })).toEqual({ screen: 'requests', view: 'leaves', key: null })
    expect(notificationTarget({ type: 'PAYSLIP_PUBLISHED' })).toEqual({ screen: 'payslips', key: null })
    expect(notificationTarget({ type: 'SOMETHING_NEW' })).toEqual({ screen: 'notifications' })
  })

  it('clear one and clear all call only the notification endpoints', async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ unreadCount: 0, items: [] }), {
      status: 200, headers: { 'Content-Type': 'application/json' },
    }))
    vi.stubGlobal('fetch', fetchMock)
    await clearNotification('t', 7)
    await clearAllNotifications('t')
    expect(fetchMock.mock.calls.map((c) => [(c as unknown as [string, RequestInit])[0], (c as unknown as [string, RequestInit])[1].method]))
      .toEqual([['/api/employee/notifications/7/clear', 'POST'], ['/api/employee/notifications/clear-all', 'POST']])
  })
})
