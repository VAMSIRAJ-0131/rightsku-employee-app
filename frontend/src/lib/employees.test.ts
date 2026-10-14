import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  EMPTY_EMPLOYEE_FORM, formFromRecord, listEmployees, setEmployeeActive, toCreatePayload, toUpdatePayload,
  validateEmployeeForm, type EmployeeFormValues, type EmployeeRecord,
} from './employees'

const valid: EmployeeFormValues = {
  ...EMPTY_EMPLOYEE_FORM,
  firstName: 'Ravi',
  lastName: 'Kumar',
  email: 'ravi@rightsku.com',
  initialPassword: 'Test-Only-Passw0rd!',
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('validateEmployeeForm', () => {
  it('accepts a complete form with a blank (auto-generated) Employee ID', () => {
    expect(validateEmployeeForm(valid, 'create')).toEqual({})
  })

  it('requires first name, last name, email and a temporary password', () => {
    const errors = validateEmployeeForm(EMPTY_EMPLOYEE_FORM, 'create')
    expect(Object.keys(errors).sort()).toEqual(['email', 'firstName', 'initialPassword', 'lastName'])
  })

  it('checks the Employee ID format like the backend', () => {
    for (const bad of ['EMP 001', 'emp@rightsku.com', '-EMP1', 'E'.repeat(31), 'EMP#1']) {
      expect(validateEmployeeForm({ ...valid, employeeCode: bad }, 'create').employeeCode).toBeDefined()
    }
    for (const good of ['EMP001', 'emp.01', 'A', 'E'.repeat(30)]) {
      expect(validateEmployeeForm({ ...valid, employeeCode: good }, 'create').employeeCode).toBeUndefined()
    }
  })

  it('rejects invalid emails and phone numbers', () => {
    const errors = validateEmployeeForm({ ...valid, email: 'ravi@', phone: 'call me' }, 'create')
    expect(errors.email).toBeDefined()
    expect(errors.phone).toBeDefined()
  })

  it('enforces the temporary password rules', () => {
    expect(validateEmployeeForm({ ...valid, initialPassword: 'short1!' }, 'create').initialPassword).toBeDefined()
    expect(validateEmployeeForm({ ...valid, initialPassword: ' leading-space-pass' }, 'create').initialPassword).toBeDefined()
    expect(validateEmployeeForm({ ...valid, initialPassword: 'é'.repeat(40) }, 'create').initialPassword).toBeDefined()
  })

  it('does not ask for a password or Employee ID when editing', () => {
    const errors = validateEmployeeForm({ ...valid, initialPassword: '', employeeCode: 'not valid!' }, 'edit')
    expect(errors).toEqual({})
  })
})

describe('request payloads', () => {
  it('sends null for a blank Employee ID so the server generates one', () => {
    const payload = toCreatePayload({ ...valid, employeeCode: '   ', department: '  Engineering ', phone: '' })
    expect(payload.employeeCode).toBeNull()
    expect(payload.department).toBe('Engineering')
    expect(payload.phone).toBeNull()
    expect(payload.joiningDate).toBeNull()
  })

  it('never sends the Employee ID or a password when editing', () => {
    const payload = toUpdatePayload({ ...valid, employeeCode: 'EMP001' }) as Record<string, unknown>
    expect(payload.employeeCode).toBeUndefined()
    expect(payload.initialPassword).toBeUndefined()
  })

  it('fills the edit form from a record without any password', () => {
    const record: EmployeeRecord = {
      id: 5, employeeCode: 'EMP005', firstName: 'Priya', lastName: 'Sharma', email: 'priya@rightsku.com',
      phone: null, department: 'QA', jobTitle: null, joiningDate: '2024-01-08', status: 'ACTIVE',
      createdAt: '2026-10-14T09:00:00Z', updatedAt: '2026-10-14T09:00:00Z',
    }
    const form = formFromRecord(record)
    expect(form.phone).toBe('')
    expect(form.department).toBe('QA')
    expect(form.initialPassword).toBe('')
  })
})

describe('employee API calls', () => {
  it('builds the search URL with filters', async () => {
    const fetchMock = vi.fn(async () => new Response('{"items":[]}', { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)

    await listEmployees('test-only-token', { q: '  ravi kumar ', status: 'INACTIVE', page: 2 })

    const [url] = fetchMock.mock.calls[0] as unknown as [string]
    expect(url).toBe('/api/hr/employees?q=ravi+kumar&status=INACTIVE&page=2&size=20')
  })

  it('uses the activate and deactivate endpoints', async () => {
    const fetchMock = vi.fn(async () => new Response('{}', { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)

    await setEmployeeActive('test-only-token', 7, false)
    await setEmployeeActive('test-only-token', 7, true)

    const urls = fetchMock.mock.calls.map((call) => (call as unknown as [string])[0])
    expect(urls).toEqual(['/api/hr/employees/7/deactivate', '/api/hr/employees/7/activate'])
  })
})
