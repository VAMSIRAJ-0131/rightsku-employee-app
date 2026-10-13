import { useState } from 'react'
import Login from './screens/Login'
import EmployeeApp from './screens/employee/EmployeeApp'
import HrApp from './screens/hr/HrApp'
import type { Session } from './data/sampleData'

export default function App() {
  const [session, setSession] = useState<Session | null>(null)

  if (!session) return <Login onLogin={setSession} />

  const logout = () => setSession(null)

  // The screen shown depends on the account's role, never on a user choice.
  return session.role === 'hr' ? (
    <HrApp user={session.employee} onLogout={logout} />
  ) : (
    <EmployeeApp user={session.employee} onLogout={logout} />
  )
}
