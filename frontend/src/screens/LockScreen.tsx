// The unlock screen of the Android app, for people who set up an app lock:
// shown when the app opens, and when it comes back after a while in the
// background. Fingerprint (when chosen) opens straight away, with the app PIN
// below it; "Forgot PIN?" goes back to the password sign-in.
import { useEffect, useRef } from 'react'
import { App as CapacitorApp } from '@capacitor/app'
import { Logo } from '../components/Logo'
import PinPad from '../components/PinPad'
import { LockBadge, LockSheet } from '../components/LockArt'
import { Notice, useBackHandler } from '../components/ui'
import type { LockMethod } from '../lib/appLock'

export default function LockScreen({
  method, busy, error, resetKey, onPin, onFingerprint, onUsePassword,
}: {
  method: LockMethod
  /** Checking the PIN or renewing the sign-in. */
  busy: boolean
  error: string | null
  /** Changes after a wrong PIN, to clear the dots. */
  resetKey: number
  onPin: (pin: string) => void
  onFingerprint: () => void
  onUsePassword: () => void
}) {
  // Fingerprint users get the sensor prompt once, straight away.
  const asked = useRef(false)
  useEffect(() => {
    if (asked.current || method !== 'fingerprint') return
    asked.current = true
    onFingerprint()
  }, [method, onFingerprint])

  // Android Back leaves the app (as on the Home screen) instead of reaching the screen behind.
  useBackHandler(() => {
    void CapacitorApp.minimizeApp().catch(() => {})
  })

  return (
    <LockSheet labelledBy="lock-title">
      <div className="flex justify-center pt-2">
        <Logo className="h-8" />
      </div>
      <div className="flex flex-1 flex-col items-center pt-6 text-center">
        <LockBadge />
        <h1 id="lock-title" className="mt-6 text-[28px] font-bold leading-tight tracking-tight text-navy-900">
          Enter your PIN
        </h1>
        <p className="mt-2 text-[15px] text-ink-muted">
          {method === 'fingerprint' ? 'Or tap the fingerprint to use your finger.' : 'Your 4-digit RightCentral PIN.'}
        </p>
        <div className="mt-3 min-h-[52px] w-full text-left" role="alert">
          {error && <Notice tone="bad">{error}</Notice>}
        </div>
        <PinPad
          onComplete={onPin}
          busy={busy}
          resetKey={resetKey}
          extraKey={method === 'fingerprint' ? { label: 'Use fingerprint', icon: 'fingerprint', onPress: onFingerprint } : undefined}
        />
      </div>
      <button
        type="button"
        onClick={onUsePassword}
        disabled={busy}
        className="mx-auto mt-6 rounded-full px-4 py-2 text-[14px] font-semibold text-royal-600 hover:bg-royal-50 disabled:opacity-60"
      >
        Forgot PIN? Sign in with password
      </button>
    </LockSheet>
  )
}
