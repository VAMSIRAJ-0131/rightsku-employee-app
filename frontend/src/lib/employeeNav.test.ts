import { describe, expect, it } from 'vitest'
import { INITIAL_EMPLOYEE_NAV, employeeNav, type EmployeeNavState } from './employeeNav'

describe('employee navigation', () => {
  it('opens the same profile screen from the header and from the footer', () => {
    const fromHeader = employeeNav(INITIAL_EMPLOYEE_NAV, { type: 'header-profile' })
    const fromFooter = employeeNav(INITIAL_EMPLOYEE_NAV, { type: 'tab', tab: 'profile' })

    expect(fromHeader).toEqual({ tab: 'profile', sub: null })
    expect(fromHeader).toEqual(fromFooter)
  })

  it('leaves any open sub-screen when the profile opens', () => {
    const inNotifications: EmployeeNavState = { tab: 'home', sub: 'notifications' }
    expect(employeeNav(inNotifications, { type: 'header-profile' })).toEqual({ tab: 'profile', sub: null })
    expect(employeeNav(inNotifications, { type: 'tab', tab: 'profile' })).toEqual({ tab: 'profile', sub: null })
  })

  it('opens and closes sub-screens without changing the tab', () => {
    const open = employeeNav(INITIAL_EMPLOYEE_NAV, { type: 'open', sub: 'timesheet' })
    expect(open).toEqual({ tab: 'home', sub: 'timesheet' })
    expect(employeeNav(open, { type: 'back' })).toEqual(INITIAL_EMPLOYEE_NAV)
  })
})
