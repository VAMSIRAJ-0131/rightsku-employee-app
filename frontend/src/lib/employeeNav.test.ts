import { describe, expect, it } from 'vitest'
import { INITIAL_EMPLOYEE_NAV, canGoBack, employeeNav, type EmployeeNavAction, type EmployeeNavState } from './employeeNav'

/** Where the app is (tab and sub-screen), without the history. */
const at = (s: EmployeeNavState) => ({ tab: s.tab, sub: s.sub })
const run = (start: EmployeeNavState, ...actions: EmployeeNavAction[]) => actions.reduce(employeeNav, start)

describe('employee navigation', () => {
  it('opens the same profile screen from the header and from the footer', () => {
    const fromHeader = employeeNav(INITIAL_EMPLOYEE_NAV, { type: 'header-profile' })
    const fromFooter = employeeNav(INITIAL_EMPLOYEE_NAV, { type: 'tab', tab: 'profile' })

    expect(at(fromHeader)).toEqual({ tab: 'profile', sub: null })
    expect(fromHeader).toEqual(fromFooter)
  })

  it('leaves any open sub-screen when the profile opens', () => {
    const inNotifications: EmployeeNavState = { tab: 'home', sub: 'notifications' }
    expect(at(employeeNav(inNotifications, { type: 'header-profile' }))).toEqual({ tab: 'profile', sub: null })
    expect(at(employeeNav(inNotifications, { type: 'tab', tab: 'profile' }))).toEqual({ tab: 'profile', sub: null })
  })

  it('opens and closes sub-screens without changing the tab', () => {
    const open = employeeNav(INITIAL_EMPLOYEE_NAV, { type: 'open', sub: 'timesheet' })
    expect(at(open)).toEqual({ tab: 'home', sub: 'timesheet' })
    expect(employeeNav(open, { type: 'back' })).toEqual(INITIAL_EMPLOYEE_NAV)
  })
})

describe('Back returns to the previous screen', () => {
  it('goes back through tabs and sub-screens in the order they were opened', () => {
    const s = run(INITIAL_EMPLOYEE_NAV,
      { type: 'tab', tab: 'requests' },
      { type: 'tab', tab: 'profile' },
      { type: 'open', sub: 'password' })
    expect(at(s)).toEqual({ tab: 'profile', sub: 'password' })

    const b1 = employeeNav(s, { type: 'back' })
    expect(at(b1)).toEqual({ tab: 'profile', sub: null })
    const b2 = employeeNav(b1, { type: 'back' })
    expect(at(b2)).toEqual({ tab: 'requests', sub: null })
    const b3 = employeeNav(b2, { type: 'back' })
    expect(at(b3)).toEqual({ tab: 'home', sub: null })
    expect(canGoBack(b3)).toBe(false)
  })

  it('falls back to Home when there is no previous screen', () => {
    expect(at(employeeNav({ tab: 'requests', sub: null }, { type: 'back' }))).toEqual({ tab: 'home', sub: null })
    expect(at(employeeNav({ tab: 'profile', sub: null, history: [] }, { type: 'back' }))).toEqual({ tab: 'home', sub: null })
  })

  it('on Home with nothing behind it there is nowhere to go back to', () => {
    expect(canGoBack(INITIAL_EMPLOYEE_NAV)).toBe(false)
    expect(employeeNav(INITIAL_EMPLOYEE_NAV, { type: 'back' })).toBe(INITIAL_EMPLOYEE_NAV)
  })

  it('tapping the tab you are already on adds no extra step', () => {
    const s = run(INITIAL_EMPLOYEE_NAV, { type: 'tab', tab: 'requests' }, { type: 'tab', tab: 'requests' })
    expect(s.history).toHaveLength(1)
  })

  it('keeps history short', () => {
    let s = INITIAL_EMPLOYEE_NAV
    for (let i = 0; i < 50; i++) s = employeeNav(s, { type: 'tab', tab: i % 2 ? 'requests' : 'documents' })
    expect(s.history!.length).toBeLessThanOrEqual(20)
  })
})
