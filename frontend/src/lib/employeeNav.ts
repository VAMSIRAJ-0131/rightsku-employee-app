// Which screen the employee app shows. Kept as a small pure function so the
// navigation rules can be tested without a browser.

export type EmployeeTab = 'home' | 'requests' | 'documents' | 'profile'
export type EmployeeSubScreen = 'timesheet' | 'leave' | 'payslips' | 'notifications' | 'password' | null

export interface EmployeeNavState {
  tab: EmployeeTab
  sub: EmployeeSubScreen
}

export type EmployeeNavAction =
  /** A footer (bottom navigation) tab. */
  | { type: 'tab'; tab: EmployeeTab }
  /** The profile shortcut in the header. Opens exactly the same screen as the footer's Profile tab. */
  | { type: 'header-profile' }
  | { type: 'open'; sub: Exclude<EmployeeSubScreen, null> }
  | { type: 'back' }

export const INITIAL_EMPLOYEE_NAV: EmployeeNavState = { tab: 'home', sub: null }

export function employeeNav(state: EmployeeNavState, action: EmployeeNavAction): EmployeeNavState {
  switch (action.type) {
    case 'tab':
      return { tab: action.tab, sub: null }
    case 'header-profile':
      return employeeNav(state, { type: 'tab', tab: 'profile' })
    case 'open':
      return { ...state, sub: action.sub }
    case 'back':
      return { ...state, sub: null }
  }
}
