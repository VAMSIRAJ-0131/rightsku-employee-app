// "Stay signed in on this phone?" The person chooses fingerprint (with a
// 4-digit PIN as backup) or a 4-digit PIN; nothing is remembered until they
// confirm a PIN. Shown after a password sign-in in the Android app (with
// "Not now"), and from Profile to change or turn off the app lock.
import { useState } from 'react'
import { Icon } from '../components/Icons'
import PinPad from '../components/PinPad'
import { LockBadge, LockSheet, RoundBack } from '../components/LockArt'
import { Notice, Spinner, useBackHandler } from '../components/ui'
import { verifyFingerprint, type LockMethod } from '../lib/appLock'

type Step = { kind: 'choose' } | { kind: 'create'; method: LockMethod } | { kind: 'confirm'; method: LockMethod; pin: string }

/** A PIN anyone would guess first: all the same digit, or straight up or down (1234, 9876). */
export function isEasyPin(pin: string): boolean {
  const d = pin.split('').map(Number)
  const same = d.every((x) => x === d[0])
  const up = d.every((x, i) => i === 0 || x === d[i - 1] + 1)
  const down = d.every((x, i) => i === 0 || x === d[i - 1] - 1)
  return same || up || down
}

export default function UnlockSetup({
  mode, current, fingerprintOk, onSave, onSkip, onTurnOff, onClose,
}: {
  /** first: right after signing in ("Not now" offered); manage: from Profile. */
  mode: 'first' | 'manage'
  /** The lock already set up (manage only). */
  current: LockMethod | null
  /** The phone has a fingerprint (or face) the app can use. */
  fingerprintOk: boolean
  /** Saves the lock; returns an error message when it could not be turned on. */
  onSave: (method: LockMethod, pin: string) => Promise<string | null>
  onSkip: () => void
  onTurnOff: () => void
  onClose: () => void
}) {
  const [step, setStep] = useState<Step>({ kind: 'choose' })
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [attempt, setAttempt] = useState(0)

  const back = () => {
    setError(null)
    if (step.kind === 'confirm') setStep({ kind: 'create', method: step.method })
    else if (step.kind === 'create') setStep({ kind: 'choose' })
    else if (mode === 'manage') onClose()
    else onSkip()
  }
  useBackHandler(busy ? () => {} : back)

  async function chooseFingerprint() {
    setError(null)
    setBusy(true)
    const ok = await verifyFingerprint('Confirm your fingerprint')
    setBusy(false)
    if (ok) setStep({ kind: 'create', method: 'fingerprint' })
    else setError('Fingerprint not confirmed. Try again, or use a 4-digit PIN.')
  }

  function created(pin: string) {
    if (step.kind !== 'create') return
    if (isEasyPin(pin)) {
      setError('That PIN is too easy to guess. Choose another.')
      setAttempt((a) => a + 1)
      return
    }
    setError(null)
    setStep({ kind: 'confirm', method: step.method, pin })
  }

  async function confirmed(pin: string) {
    if (step.kind !== 'confirm') return
    if (pin !== step.pin) {
      setError('The PINs didn’t match. Create your PIN again.')
      setStep({ kind: 'create', method: step.method })
      setAttempt((a) => a + 1)
      return
    }
    setBusy(true)
    const problem = await onSave(step.method, pin)
    setBusy(false)
    if (problem) {
      setError(problem)
      setStep({ kind: 'choose' })
    }
  }

  if (step.kind !== 'choose') {
    return (
      <LockSheet labelledBy="setup-title">
        <RoundBack kind="back" label="Go back" onClick={back} disabled={busy} />
        <div className="flex flex-1 flex-col items-center pt-3 text-center">
          <LockBadge />
          <h1 id="setup-title" className="mt-6 text-[28px] font-bold leading-tight tracking-tight text-navy-900">
            {step.kind === 'create' ? 'Create a 4-digit PIN' : 'Enter the PIN again'}
          </h1>
          <p className="mt-2 text-[15px] text-ink-muted">
            {step.kind === 'create'
              ? step.method === 'fingerprint'
                ? 'Used when your fingerprint isn’t read.'
                : 'You’ll use it to open RightCentral.'
              : 'To make sure it’s right.'}
          </p>
          <div className="mt-3 min-h-[52px] w-full text-left" role="alert">
            {error && <Notice tone="bad">{error}</Notice>}
          </div>
          <PinPad key={step.kind} resetKey={attempt} busy={busy} onComplete={step.kind === 'create' ? created : confirmed} />
        </div>
      </LockSheet>
    )
  }

  return (
    <LockSheet labelledBy="setup-title">
      <RoundBack kind="close" label={mode === 'manage' ? 'Close' : 'Not now'} onClick={back} disabled={busy} />

      <span className="mt-8 grid h-[68px] w-[68px] place-items-center rounded-[20px] bg-royal-50 text-royal-600 ring-1 ring-inset ring-royal-100">
        <Icon name="shield" className="h-9 w-9" />
      </span>
      <h1 id="setup-title" className="mt-6 text-[32px] font-bold leading-tight tracking-tight text-navy-900">
        {mode === 'first' ? 'Stay signed in?' : 'App lock'}
      </h1>
      <p className="mt-2 text-[15px] leading-relaxed text-ink-muted">
        {mode === 'first'
          ? 'Open RightCentral with your fingerprint or a 4-digit PIN instead of your password. Without it, you sign in with your password each time.'
          : current
            ? `Now: ${current === 'fingerprint' ? 'fingerprint, with a PIN as backup' : '4-digit PIN'}. Choose a new way to unlock, or turn the app lock off.`
            : 'Turn on the app lock to stay signed in on this phone.'}
      </p>

      {error && (
        <div className="mt-4" role="alert">
          <Notice tone="bad">{error}</Notice>
        </div>
      )}

      <div className="mt-7 space-y-4">
        {fingerprintOk && (
          <Option icon="fingerprint" tone="blue" title="Use fingerprint" detail="With a 4-digit PIN as backup" busy={busy} onClick={chooseFingerprint} />
        )}
        <Option
          icon="lock"
          tone="lavender"
          title="Use a 4-digit PIN"
          detail="Only for this app"
          busy={false}
          disabled={busy}
          onClick={() => {
            setError(null)
            setStep({ kind: 'create', method: 'pin' })
          }}
        />
      </div>
      {!fingerprintOk && (
        <p className="mt-3 px-1 text-[13px] text-ink-muted">To use fingerprint, add one in your phone’s settings first.</p>
      )}

      <div className="mt-auto pt-10">
        {mode === 'first' ? (
          <button
            type="button"
            onClick={onSkip}
            disabled={busy}
            className="press flex h-14 w-full items-center justify-center rounded-full bg-white/70 text-[16px] font-semibold text-ink-soft ring-1 ring-inset ring-line-strong transition-transform duration-150"
          >
            Not now
          </button>
        ) : current ? (
          <button
            type="button"
            onClick={onTurnOff}
            disabled={busy}
            className="press flex h-14 w-full items-center justify-center gap-2.5 rounded-full bg-rejected-soft/70 text-[16px] font-semibold text-bad ring-1 ring-inset ring-bad/40 transition-transform duration-150"
          >
            <Icon name="trash" className="h-5 w-5" /> Turn off app lock
          </button>
        ) : null}
      </div>
    </LockSheet>
  )
}

function Option({
  icon, tone, title, detail, busy, disabled, onClick,
}: {
  icon: 'fingerprint' | 'lock'
  tone: 'blue' | 'lavender'
  title: string
  detail: string
  busy: boolean
  disabled?: boolean
  onClick: () => void
}) {
  const tile = tone === 'blue' ? 'bg-royal-50 text-royal-600' : 'bg-lavender-50 text-lavender-600'
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={busy || disabled}
      className="press lock-card flex w-full items-center gap-4 rounded-[24px] px-4 py-4 text-left transition-transform duration-150 disabled:opacity-70"
    >
      <span className={`grid h-14 w-14 shrink-0 place-items-center rounded-[18px] ${tile}`}>
        {busy ? <Spinner className="h-6 w-6" /> : <Icon name={icon} className="h-7 w-7" />}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-[17px] font-bold text-ink">{title}</span>
        <span className="mt-0.5 block text-[14px] text-ink-muted">{detail}</span>
      </span>
      <Icon name="chevronRight" className="h-5 w-5 shrink-0 text-ink-soft" />
    </button>
  )
}
