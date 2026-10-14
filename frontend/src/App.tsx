import { useCallback, useState } from 'react'
import Login from './screens/Login'
import EmployeeApp from './screens/employee/EmployeeApp'
import HrApp from './screens/hr/HrApp'
import type { AuthSession } from './lib/auth'
import { EMPTY_DASHBOARD_DATA } from './data/types'

export default function App() {
  // The session (including the JWT) lives only in memory. Reloading the page
  // or logging out clears it, and the user signs in again.
  const [session, setSession] = useState<AuthSession | null>(null)
  const [signInNotice, setSignInNotice] = useState<string | null>(null)

  // Stable callback: the backend rejected the token (expired, deactivated or role changed).
  const sessionExpired = useCallback(() => {
    setSession(null)
    setSignInNotice('Your session has ended. Sign in again.')
  }, [])

  if (!session) {
    return (
      <Login
        notice={signInNotice}
        onLogin={(s) => {
          setSignInNotice(null)
          setSession(s)
        }}
      />
    )
  }

  const logout = () => setSession(null)

  // Real sessions never see sample data. Until each module's backend API
  // exists, the dashboards receive empty data and show empty states.
  const data = EMPTY_DASHBOARD_DATA

  // The dashboard depends on the role the backend returned, never on a user choice.
  return session.role === 'hr' ? (
    <HrApp
      user={session.profile}
      data={data}
      token={session.token}
      onLogout={logout}
      onSessionExpired={sessionExpired}
    />
  ) : (
    <EmployeeApp user={session.profile} data={data} onLogout={logout} />
  )
}
