// Which screen the employee app shows. Kept as a small pure function so the
// navigation rules can be tested without a browser.
//
// Every move remembers where it came from, so Back (the header arrow, or
// Android's back gesture) returns to the previous screen. With nothing to go
// back to, Back goes Home; on Home itself there is nowhere further back.

export type EmployeeTab = 'home' | 'requests' | 'documents' | 'profile'
export type EmployeeSubScreen = 'timesheet' | 'leave' | 'payslips' | 'notifications' | 'holidays' | 'password' | 'editProfile' | null

export interface EmployeeNavState {
  tab: EmployeeTab
  sub: EmployeeSubScreen
  /** Earlier screens, oldest first (kept short). */
  history?: { tab: EmployeeTab; sub: EmployeeSubScreen }[]
}

export type EmployeeNavAction =
  /** A footer (bottom navigation) tab. */
  | { type: 'tab'; tab: EmployeeTab }
  /** The profile shortcut in the header. Opens exactly the same screen as the footer's Profile tab. */
  | { type: 'header-profile' }
  | { type: 'open'; sub: Exclude<EmployeeSubScreen, null> }
  | { type: 'back' }

export const INITIAL_EMPLOYEE_NAV: EmployeeNavState = { tab: 'home', sub: null, history: [] }

/** Enough to go back through a normal visit; older steps are dropped. */
const MAX_HISTORY = 20

function moveTo(state: EmployeeNavState, next: { tab: EmployeeTab; sub: EmployeeSubScreen }): EmployeeNavState {
  if (state.tab === next.tab && state.sub === next.sub) return state
  const history = [...(state.history ?? []), { tab: state.tab, sub: state.sub }].slice(-MAX_HISTORY)
  return { ...next, history }
}

export function employeeNav(state: EmployeeNavState, action: EmployeeNavAction): EmployeeNavState {
  switch (action.type) {
    case 'tab':
      return moveTo(state, { tab: action.tab, sub: null })
    case 'header-profile':
      return employeeNav(state, { type: 'tab', tab: 'profile' })
    case 'open':
      return moveTo(state, { tab: state.tab, sub: action.sub })
    case 'back': {
      const history = state.history ?? []
      const previous = history[history.length - 1]
      if (previous) return { ...previous, history: history.slice(0, -1) }
      if (state.sub !== null) return { tab: state.tab, sub: null, history: [] }
      if (state.tab !== 'home') return { tab: 'home', sub: null, history: [] }
      return state
    }
  }
}

/** True when Back can move somewhere (false on Home with nothing behind it). */
export function canGoBack(state: EmployeeNavState): boolean {
  return (state.history?.length ?? 0) > 0 || state.sub !== null || state.tab !== 'home'
}
