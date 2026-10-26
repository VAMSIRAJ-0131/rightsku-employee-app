import { useCallback, useEffect, useRef, useState } from 'react'
import { App as CapacitorApp } from '@capacitor/app'
import { canNotify, onNotificationTap } from './lib/systemNotifications'
import { listenForAndroidBack } from './lib/androidBack'
import { setStatusBarTheme } from './lib/statusBar'
import Login from './screens/Login'
import LockScreen from './screens/LockScreen'
import UnlockSetup from './screens/UnlockSetup'
import EmployeeApp from './screens/employee/EmployeeApp'
import HrApp from './screens/hr/HrApp'
import ChangePasswordScreen from './screens/shared/ChangePasswordScreen'
import { Logo } from './components/Logo'
import type { AuthSession } from './lib/auth'
import {
  RELOCK_AFTER_MS, canRememberLogin, forgetRefreshToken, loadRefreshToken, refreshSession, rememberThisPhone,
  revokeOnServer, saveRefreshToken,
} from './lib/rememberedLogin'
import {
  MAX_PIN_ATTEMPTS, clearLockSettings, fingerprintAvailable, loadLockSettings, lockLabel, pinMatches,
  saveLockSettings, setSetupDeclined, settingsFor, verifyFingerprint, wasSetupDeclined, type AppLockSettings,
  type LockMethod,
} from './lib/appLock'
import { EMPTY_DASHBOARD_DATA } from './data/types'

const CANT_CONNECT = 'Can’t connect to RIGHTSKU. Check your internet connection and try again.'

type Lock = { refreshToken: string; busy: boolean; error: string | null; resetKey: number }

export default function App() {
  // The session (including the JWT) lives only in memory. In a browser,
  // reloading the page or logging out clears it and the user signs in again.
  // In the Android app the person may choose to stay signed in: after they set
  // up an app lock (4-digit PIN, or fingerprint with that PIN as backup), a
  // refresh token kept encrypted on the phone lets the app open after unlocking.
  const [session, setSession] = useState<AuthSession | null>(null)
  const [signInNotice, setSignInNotice] = useState<string | null>(null)
  // Android app: looking for a remembered sign-in before showing anything.
  const [starting, setStarting] = useState(canRememberLogin)
  const [lockSettings, setLockSettings] = useState<AppLockSettings | null>(null)
  // The unlock screen: on top of the app (after time away) or instead of it (app start).
  const [lock, setLock] = useState<Lock | null>(null)
  // "Stay signed in on this phone?": after a password sign-in, or from Profile.
  const [setup, setSetup] = useState<{ mode: 'first' | 'manage'; fingerprintOk: boolean } | null>(null)

  const sessionRef = useRef(session)
  sessionRef.current = session
  const settingsRef = useRef(lockSettings)
  settingsRef.current = lockSettings

  // Taps on phone notifications (open a downloaded file, or the inbox).
  useEffect(() => onNotificationTap(), [])

  // Android back gesture and button: close the top pop-up, or go back a screen.
  useEffect(() => listenForAndroidBack(), [])

  // Sign-in and HR are always light: dark status bar icons. The employee app sets its own.
  useEffect(() => setStatusBarTheme('light'), [])

  // First launch of the app: ask to allow notifications (Android 13+ shows the
  // system question once; afterwards this only checks the answer).
  useEffect(() => {
    void canNotify()
  }, [])

  // App start: a remembered sign-in with an app lock opens the unlock screen.
  useEffect(() => {
    if (!canRememberLogin()) return
    Promise.all([loadRefreshToken(), loadLockSettings()]).then(([refreshToken, settings]) => {
      if (refreshToken && settings) {
        setLockSettings(settings)
        setLock({ refreshToken, busy: false, error: null, resetKey: 0 })
      } else {
        // Half set up (or from an older version without the lock): start clean.
        if (refreshToken) void revokeOnServer(refreshToken)
        void forgetRefreshToken()
        void clearLockSettings()
      }
      setStarting(false)
    })
  }, [])

  // Back after RELOCK_AFTER_MS or more in the background: unlock again.
  useEffect(() => {
    if (!canRememberLogin()) return
    let leftAt: number | null = null
    const pause = CapacitorApp.addListener('pause', () => {
      leftAt = Date.now()
    }).catch(() => null)
    const resume = CapacitorApp.addListener('resume', () => {
      const away = leftAt === null ? 0 : Date.now() - leftAt
      leftAt = null
      const refreshToken = sessionRef.current?.refreshToken
      if (refreshToken && settingsRef.current && away >= RELOCK_AFTER_MS) {
        setLock((current) => current ?? { refreshToken, busy: false, error: null, resetKey: 0 })
      }
    }).catch(() => null)
    return () => {
      pause.then((h) => h?.remove()).catch(() => {})
      resume.then((h) => h?.remove()).catch(() => {})
    }
  }, [])

  /** Signed out for good on this phone: the remembered sign-in and its lock are deleted. */
  const endRemembered = useCallback((notice: string) => {
    void forgetRefreshToken()
    void clearLockSettings()
    setLockSettings(null)
    setLock(null)
    setSetup(null)
    setSession(null)
    setSignInNotice(notice)
  }, [])

  /** Unlocked: back to the app, or (at app start) swap the remembered sign-in for a fresh one. */
  const unlocked = useCallback(async (current: Lock) => {
    if (sessionRef.current) {
      setLock(null)
      return
    }
    setLock({ ...current, busy: true, error: null })
    const renewed = await refreshSession(current.refreshToken)
    if (renewed.ok) {
      setSession(renewed.session)
      setSignInNotice(null)
      setLock(null)
    } else if (renewed.reason === 'ended') {
      endRemembered('Your session has ended. Sign in again.')
    } else {
      setLock({ ...current, busy: false, error: CANT_CONNECT })
    }
  }, [endRemembered])

  const enterPin = useCallback(async (pin: string) => {
    const settings = settingsRef.current
    if (!lock || lock.busy || !settings) return
    setLock({ ...lock, busy: true, error: null })
    if (await pinMatches(settings, pin)) {
      if (settings.failedAttempts) {
        const reset = { ...settings, failedAttempts: 0 }
        setLockSettings(reset)
        void saveLockSettings(reset)
      }
      await unlocked(lock)
      return
    }
    const failed = settings.failedAttempts + 1
    if (failed >= MAX_PIN_ATTEMPTS) {
      void revokeOnServer(lock.refreshToken)
      endRemembered('Too many wrong PINs. Sign in with your password.')
      return
    }
    const next = { ...settings, failedAttempts: failed }
    setLockSettings(next)
    void saveLockSettings(next)
    const left = MAX_PIN_ATTEMPTS - failed
    setLock({ ...lock, busy: false, resetKey: lock.resetKey + 1, error: `Wrong PIN. ${left} ${left === 1 ? 'try' : 'tries'} left.` })
  }, [lock, unlocked, endRemembered])

  const tryFingerprint = useCallback(async () => {
    if (!lock || lock.busy) return
    if (await verifyFingerprint()) await unlocked(lock)
  }, [lock, unlocked])

  // One renewal at a time, however many requests found the token expired.
  const renewing = useRef<Promise<void> | null>(null)

  // Stable callback: the backend rejected the token (expired, deactivated or role changed).
  // A remembered phone first tries to renew it quietly; otherwise back to sign-in.
  const sessionExpired = useCallback(() => {
    const refreshToken = sessionRef.current?.refreshToken
    if (!refreshToken) {
      setSession(null)
      setSignInNotice('Your session has ended. Sign in again.')
      return
    }
    if (renewing.current) return
    renewing.current = refreshSession(refreshToken).then((renewed) => {
      renewing.current = null
      if (renewed.ok) setSession(renewed.session)
      else if (renewed.reason === 'ended') endRemembered('Your session has ended. Sign in again.')
      else {
        // Offline: keep the remembered sign-in and try again from the unlock screen.
        setSession(null)
        setLock({ refreshToken, busy: false, error: CANT_CONNECT, resetKey: 0 })
      }
    })
  }, [endRemembered])

  /** Opens the app-lock setup, checking first whether the phone has a fingerprint. */
  const openSetup = useCallback(async (mode: 'first' | 'manage') => {
    setSetup({ mode, fingerprintOk: await fingerprintAvailable() })
  }, [])

  /** The person confirmed a PIN: remember this phone (once) and save the lock. */
  async function saveLock(method: LockMethod, pin: string): Promise<string | null> {
    const current = sessionRef.current
    if (!current) return 'Sign in again to turn on the app lock.'
    const refreshToken = current.refreshToken ?? (await rememberThisPhone(current.token))
    if (!refreshToken) return 'Couldn’t turn on the app lock. Check your internet connection and try again.'
    const settings = await settingsFor(method, pin)
    if (!(await saveLockSettings(settings)) || !(await saveRefreshToken(refreshToken))) {
      if (!current.refreshToken) void revokeOnServer(refreshToken)
      return 'Couldn’t save the app lock on this phone. Try again.'
    }
    void setSetupDeclined(false)
    setLockSettings(settings)
    setSession({ ...current, refreshToken })
    setSetup(null)
    return null
  }

  /** Profile → App lock → Turn off: this phone stops remembering the sign-in. */
  function turnOffLock() {
    const current = sessionRef.current
    if (current?.refreshToken) void revokeOnServer(current.refreshToken)
    void forgetRefreshToken()
    void clearLockSettings()
    setLockSettings(null)
    if (current) setSession({ ...current, refreshToken: null })
    setSetup(null)
  }

  if (starting) {
    return (
      <main className="grid min-h-dvh place-items-center bg-canvas">
        <Logo className="h-10" />
      </main>
    )
  }

  const lockScreen = lock && lockSettings && (
    <LockScreen
      method={lockSettings.method}
      busy={lock.busy}
      error={lock.error}
      resetKey={lock.resetKey}
      onPin={enterPin}
      onFingerprint={tryFingerprint}
      onUsePassword={() => {
        void revokeOnServer(lock.refreshToken)
        endRemembered('Sign in with your Employee ID (HR: work email) and password.')
      }}
    />
  )

  if (!session) {
    if (lockScreen) return lockScreen
    return (
      <Login
        notice={signInNotice}
        onLogin={(s) => {
          setSignInNotice(null)
          setSession(s)
          // Phone app: offer to stay signed in, unless the person said "Not now" before.
          if (canRememberLogin() && !s.mustChangePassword) {
            void wasSetupDeclined().then((declined) => {
              if (!declined) void openSetup('first')
            })
          }
        }}
      />
    )
  }

  // Log out: the session is dropped from memory, and on the phone the
  // remembered sign-in is revoked on the server and deleted with its lock.
  const logout = () => {
    if (session.refreshToken) {
      void revokeOnServer(session.refreshToken)
      void forgetRefreshToken()
      void clearLockSettings()
      setLockSettings(null)
    }
    setSession(null)
    setSignInNotice('You’ve signed out.')
  }

  // A changed password ends every session, the remembered one included.
  const passwordChanged = () => endRemembered('Password changed. Sign in with your new password.')

  // Temporary password from HR: the only thing this session may do is set a
  // new password. Afterwards the session has ended and the user signs in again.
  if (session.mustChangePassword) {
    return (
      <ChangePasswordScreen
        token={session.token}
        loginId={session.loginId}
        role={session.role}
        onChanged={passwordChanged}
        onLogout={logout}
        onSessionExpired={sessionExpired}
      />
    )
  }

  // Profile → App lock (Android app only).
  const appLock = canRememberLogin()
    ? { label: lockLabel(lockSettings?.method ?? null), onOpen: () => void openSetup('manage') }
    : undefined

  // Real sessions never see sample data. Until each module's backend API
  // exists, the dashboards receive empty data and show empty states.
  const data = EMPTY_DASHBOARD_DATA

  // The dashboard depends on the role the backend returned, never on a user choice.
  return (
    <>
      {session.role === 'hr' ? (
        <HrApp
          user={session.profile}
          data={data}
          token={session.token}
          appLock={appLock}
          onLogout={logout}
          onSessionExpired={sessionExpired}
        />
      ) : (
        <EmployeeApp
          user={session.profile}
          data={data}
          token={session.token}
          appLock={appLock}
          onLogout={logout}
          onSessionExpired={sessionExpired}
          onPasswordChanged={passwordChanged}
        />
      )}
      {setup && (
        <UnlockSetup
          mode={setup.mode}
          current={lockSettings?.method ?? null}
          fingerprintOk={setup.fingerprintOk}
          onSave={saveLock}
          onSkip={() => {
            void setSetupDeclined(true)
            setSetup(null)
          }}
          onTurnOff={turnOffLock}
          onClose={() => setSetup(null)}
        />
      )}
      {lockScreen}
    </>
  )
}
