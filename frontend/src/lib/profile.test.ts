import { afterEach, describe, expect, it, vi } from 'vitest'
import { profileFromAuth } from './auth'
import type { EmployeeRecord } from './employees'
import { getMyProfile, withProfileRecord } from './profile'

afterEach(() => {
  vi.unstubAllGlobals()
})

const record: EmployeeRecord = {
  id: 2,
  employeeCode: '10002',
  firstName: 'Ravi',
  lastName: 'Kumar',
  email: 'ravi@rightsku.com',
  phone: '+91 98450 00000',
  department: 'Engineering',
  jobTitle: 'Software Engineer',
  joiningDate: '2026-10-01',
  status: 'ACTIVE',
  createdAt: '2026-10-01T09:00:00Z',
  updatedAt: '2026-10-01T09:00:00Z',
}

describe('starting profile from the login response', () => {
  it('uses the Employee ID as the name for employees, never the email', () => {
    const p = profileFromAuth(2, '10002', 'ravi@rightsku.com', 'employee')
    expect(p.name).toBe('10002')
    expect(p.email).toBe('ravi@rightsku.com')
  })

  it('keeps the email as the name for HR Admins, who have no employee record', () => {
    expect(profileFromAuth(1, null, 'hr@rightsku.com', 'hr').name).toBe('hr@rightsku.com')
  })
})

describe('withProfileRecord', () => {
  const start = profileFromAuth(2, '10002', 'ravi@rightsku.com', 'employee')

  it('fills in the real name and work details from the server', () => {
    const p = withProfileRecord(start, record)
    expect(p.name).toBe('Ravi Kumar')
    expect(p.department).toBe('Engineering')
    expect(p.designation).toBe('Software Engineer')
    expect(p.joiningDate).toBe('2026-10-01')
    expect(p.phone).toBe('+91 98450 00000')
    expect(p.active).toBe(true)
    expect(p.id).toBe('10002')
  })

  it('leaves missing details empty instead of inventing them', () => {
    const p = withProfileRecord(start, { ...record, phone: null, department: null, jobTitle: null, joiningDate: null })
    expect(p.department).toBe('')
    expect(p.designation).toBe('')
    expect(p.joiningDate).toBe('')
    expect(p.phone).toBe('')
    expect(p.manager).toBe('')
    expect(p.location).toBe('')
  })

  it('keeps the Employee ID as the name if the server sends a blank name', () => {
    expect(withProfileRecord(start, { ...record, firstName: '', lastName: '' }).name).toBe('10002')
  })
})

describe('getMyProfile', () => {
  it('calls GET /api/employee/profile with the token', async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify(record), { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)

    const result = await getMyProfile('test-token')

    expect(result.ok && result.data.firstName).toBe('Ravi')
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe('/api/employee/profile')
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer test-token')
  })
})
