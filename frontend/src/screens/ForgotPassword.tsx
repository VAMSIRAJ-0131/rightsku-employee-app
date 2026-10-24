import { useEffect, useState, type FormEvent, type ReactNode } from 'react'
import { Icon } from '../components/Icons'
import { Button, Notice, Spinner } from '../components/ui'
import {
  RESET_NOT_SET_UP, checkResetForm, confirmReset, getResetStatus, requestResetCode, type FieldErrors,
} from '../lib/passwordReset'

const inputCls =
  'h-12 w-full rounded-xl border bg-mist-50/60 px-4 text-[15px] text-ink outline-none transition-colors placeholder:text-ink-muted/60 focus:border-mist-500 focus:bg-white focus:ring-4 focus:ring-mist-100 disabled:opacity-60'

type Step = 'checking' | 'unavailable' | 'request' | 'confirm'

/**
 * "Forgot password", shown in place of the sign-in form. The server emails a
 * one-time code to the account's registered address; this screen never says
 * whether an ID exists. If email is not set up on the server, it says so and
 * points to HR instead of pretending to send anything.
 */
export default function ForgotPassword({
  initialUsername,
  onBack,
  onDone,
}: {
  initialUsername: string
  onBack: () => void
  /** The password was reset: back to sign-in with this notice. */
  onDone: (notice: string) => void
}) {
  const [step, setStep] = useState<Step>('checking')
  const [username, setUsername] = useState(initialUsername)
  const [code, setCode] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [fields, setFields] = useState<FieldErrors>({})
  const [sentMessage, setSentMessage] = useState('')

  useEffect(() => {
    let active = true
    getResetStatus().then((result) => {
      if (!active) return
      if (result.ok) setStep(result.data?.emailDelivery ? 'request' : 'unavailable')
      else {
        setError(result.message)
        setStep('request')
      }
    })
    return () => {
      active = false
    }
  }, [])

  async function sendCode(e?: FormEvent) {
    e?.preventDefault()
    if (busy) return
    setError('')
    setFields({})
    if (!username.trim()) {
      setFields({ username: 'Enter your Employee ID (HR Admins: work email).' })
      return
    }
    setBusy(true)
    const result = await requestResetCode(username)
    setBusy(false)
    if (result.ok) {
      setSentMessage(result.data.message)
      setCode('')
      setStep('confirm')
    } else if (result.kind === 'unavailable') {
      setStep('unavailable')
    } else {
      setFields(result.fields)
      setError(result.message)
    }
  }

  async function reset(e: FormEvent) {
    e.preventDefault()
    if (busy) return
    setError('')
    const values = { username, code, newPassword, confirmPassword }
    const problems = checkResetForm(values)
    setFields(problems)
    if (Object.keys(problems).length) return
    setBusy(true)
    const result = await confirmReset(values)
    setBusy(false)
    if (result.ok) {
      setNewPassword('')
      setConfirmPassword('')
      onDone('Password changed. Sign in with your new password.')
      return
    }
    setFields(result.fields)
    setError(Object.keys(result.fields).length ? '' : result.message)
    if (result.fields.code) setCode('')
  }

  const header = (
    <div className="mb-5">
      <button type="button" onClick={onBack} className="-ml-2 flex items-center gap-1 rounded-md px-2 py-1.5 text-[13px] font-semibold text-navy-700 hover:bg-mist-50">
        <Icon name="arrowLeft" className="h-4 w-4" /> Back to sign in
      </button>
      <h2 className="mt-3 text-[20px] font-semibold tracking-tight text-ink">Reset your password</h2>
    </div>
  )

  if (step === 'checking') {
    return (
      <div className="rounded-3xl border border-line bg-white px-5 py-6 shadow-raised sm:px-7">
        {header}
        <p className="flex items-center gap-2 text-[14px] text-ink-muted">
          <Spinner /> Checking…
        </p>
      </div>
    )
  }

  if (step === 'unavailable') {
    return (
      <div className="rounded-3xl border border-line bg-white px-5 py-6 shadow-raised sm:px-7">
        {header}
        <Notice>{RESET_NOT_SET_UP}</Notice>
        <Button variant="secondary" size="lg" onClick={onBack} className="mt-5 w-full">
          Back to sign in
        </Button>
      </div>
    )
  }

  if (step === 'request') {
    return (
      <form onSubmit={sendCode} noValidate className="rounded-3xl border border-line bg-white px-5 py-6 shadow-raised sm:px-7">
        {header}
        <p className="text-[14px] leading-relaxed text-ink-muted">
          Enter your Employee ID. We’ll email a 6-digit code to the address HR has on file for you.
        </p>
        <Field label="Employee ID" error={fields.username} hint="HR Admins: enter your work email.">
          <input
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            autoComplete="username"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            maxLength={254}
            placeholder="EMP001"
            disabled={busy}
            aria-invalid={!!fields.username}
            className={`${inputCls} ${fields.username ? 'border-bad/40' : 'border-line-strong'}`}
          />
        </Field>
        {error && (
          <div className="mt-4" role="alert">
            <Notice tone="bad">{error}</Notice>
          </div>
        )}
        <Button type="submit" size="lg" disabled={busy} className="mt-6 w-full">
          {busy ? (
            <>
              <Spinner /> Sending code
            </>
          ) : (
            'Email me a code'
          )}
        </Button>
      </form>
    )
  }

  return (
    <form onSubmit={reset} noValidate className="rounded-3xl border border-line bg-white px-5 py-6 shadow-raised sm:px-7">
      {header}
      <div role="status">
        <Notice>{sentMessage}</Notice>
      </div>
      <Field label="6-digit code" error={fields.code}>
        <input
          value={code}
          onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
          inputMode="numeric"
          autoComplete="one-time-code"
          placeholder="123456"
          disabled={busy}
          aria-invalid={!!fields.code}
          className={`tnum tracking-[0.3em] ${inputCls} ${fields.code ? 'border-bad/40' : 'border-line-strong'}`}
        />
      </Field>
      <Field label="New password" error={fields.newPassword}>
        <div className="relative">
          <input
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            type={showPassword ? 'text' : 'password'}
            autoComplete="new-password"
            disabled={busy}
            aria-invalid={!!fields.newPassword}
            className={`${inputCls} pr-12 ${fields.newPassword ? 'border-bad/40' : 'border-line-strong'}`}
          />
          <button
            type="button"
            onClick={() => setShowPassword((s) => !s)}
            aria-label={showPassword ? 'Hide passwords' : 'Show passwords'}
            className="absolute inset-y-0 right-0 grid w-12 place-items-center rounded-r-xl text-ink-muted hover:text-ink"
          >
            <Icon name={showPassword ? 'eyeOff' : 'eye'} className="h-[18px] w-[18px]" />
          </button>
        </div>
      </Field>
      <Field label="New password again" error={fields.confirmPassword}>
        <input
          value={confirmPassword}
          onChange={(e) => setConfirmPassword(e.target.value)}
          type={showPassword ? 'text' : 'password'}
          autoComplete="new-password"
          disabled={busy}
          aria-invalid={!!fields.confirmPassword}
          className={`${inputCls} ${fields.confirmPassword ? 'border-bad/40' : 'border-line-strong'}`}
        />
      </Field>
      {error && (
        <div className="mt-4" role="alert">
          <Notice tone="bad">{error}</Notice>
        </div>
      )}
      <Button type="submit" size="lg" disabled={busy} className="mt-6 w-full">
        {busy ? (
          <>
            <Spinner /> Resetting
          </>
        ) : (
          'Reset password'
        )}
      </Button>
      <button
        type="button"
        onClick={() => sendCode()}
        disabled={busy}
        className="mt-3 w-full rounded-md py-2 text-[13px] font-semibold text-navy-700 hover:bg-mist-50 disabled:opacity-60"
      >
        Didn’t get it? Send a new code
      </button>
    </form>
  )
}

function Field({ label, error, hint, children }: { label: string; error?: string; hint?: string; children: ReactNode }) {
  return (
    <label className="mt-4 block">
      <span className="text-[13px] font-medium text-ink-soft">{label}</span>
      <span className="mt-1.5 block">{children}</span>
      {error ? (
        <span className="mt-1.5 block text-[12px] text-bad" role="alert">
          {error}
        </span>
      ) : (
        hint && <span className="mt-1.5 block text-[12px] text-ink-muted">{hint}</span>
      )}
    </label>
  )
}
