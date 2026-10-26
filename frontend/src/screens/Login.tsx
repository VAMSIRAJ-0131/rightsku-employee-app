import { useState, type FormEvent } from 'react'
import { Icon } from '../components/Icons'
import { Logo } from '../components/Logo'
import { Button, Notice, Spinner } from '../components/ui'
import { checkLoginInput, login, loginErrorMessage, type AuthSession } from '../lib/auth'
import ForgotPassword from './ForgotPassword'

// Leading icon on the left (pl-12); the password field also has the show/hide button on the right.
// Large, easy-to-read fields: 17 px text in a 56 px tall box.
const inputCls =
  'h-14 w-full rounded-2xl border bg-mist-50/60 pl-12 text-[17px] text-ink outline-none transition-colors placeholder:text-ink-muted/60 focus:border-royal-600 focus:bg-white focus:ring-4 focus:ring-royal-100 disabled:opacity-60'

export default function Login({
  onLogin,
  notice,
}: {
  onLogin: (session: AuthSession) => void
  /** Shown above the form, e.g. after a session ends. */
  notice?: string | null
}) {
  // Employee ID for employees; HR Admins type their work email here instead.
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  // "Forgot password" replaces the sign-in form; afterwards its message shows here.
  const [forgot, setForgot] = useState(false)
  const [resetNotice, setResetNotice] = useState<string | null>(null)
  const shownNotice = resetNotice ?? notice

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (loading) return
    setError('')
    const checked = checkLoginInput(username, password)
    if (!checked.ok) {
      setError(checked.message)
      return
    }
    const id = checked.username

    setLoading(true)
    // Real sign-in: POST /api/auth/login. No demo fallback.
    const result = await login(id, password)
    setLoading(false)

    if (result.ok) {
      setPassword('')
      onLogin(result.session)
      return
    }
    if (result.reason === 'invalid-credentials') setPassword('')
    setError(loginErrorMessage(result.reason, result.retryAfterSeconds))
  }

  const borderCls = error ? 'border-bad/40' : 'border-line-strong'

  return (
    <div className="flex min-h-dvh flex-col bg-canvas">
      {/* Brand panel. The logo file has a transparent background (no white
          box), so it sits straight on the navy, centered on the whole page. */}
      <div className="relative overflow-hidden bg-navy-900 pt-[env(safe-area-inset-top)]">
        <div aria-hidden className="pointer-events-none absolute -right-24 -top-24 h-64 w-64 rounded-full bg-navy-700/40" />
        <div aria-hidden className="pointer-events-none absolute -left-16 bottom-0 h-40 w-40 rounded-full bg-navy-800/60" />
        <div className="relative mx-auto flex w-full max-w-md flex-col items-center px-5 pb-20 pt-11 text-center min-[380px]:px-6 sm:pt-16">
          {/* The logo is the brand here (no separate name below it), so it is
              the largest element, with generous space around it. */}
          <Logo className="h-12 min-[380px]:h-[54px] sm:h-[60px]" />
          <span aria-hidden className="mt-7 h-[3px] w-10 rounded-full bg-accent" />
          <h1 className="mt-5 max-w-[20rem] text-balance text-[22px] font-semibold leading-snug tracking-tight text-white min-[380px]:text-[24px] sm:text-[26px]">
            Welcome to your digital workplace
          </h1>
          <p className="mt-2 max-w-xs text-pretty text-[14px] leading-relaxed text-mist-200">
            Timesheets, leave, payslips and documents in one place.
          </p>
        </div>
      </div>

      {/* Form sheet */}
      <div className="relative mx-auto -mt-12 flex w-full max-w-md flex-1 flex-col px-4 pb-[calc(1.5rem+env(safe-area-inset-bottom))]">
        {shownNotice && !error && !forgot && (
          <div className="mb-3" role="status">
            <Notice>{shownNotice}</Notice>
          </div>
        )}
        {forgot ? (
          <ForgotPassword
            initialUsername={username}
            onBack={() => setForgot(false)}
            onDone={(message) => {
              setPassword('')
              setError('')
              setResetNotice(message)
              setForgot(false)
            }}
          />
        ) : (
        <form onSubmit={handleSubmit} noValidate className="rounded-3xl border border-line bg-white px-5 pb-6 pt-6 shadow-raised sm:px-7">
          <label className="block">
            <span className="text-[15px] font-semibold text-ink">Employee ID</span>
            <span className="relative mt-2 block">
              <Icon name="user" className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-royal-600" />
              <input
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                type="text"
                name="username"
                autoComplete="username"
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
                maxLength={254}
                placeholder="EMP001"
                aria-describedby="username-hint"
                disabled={loading}
                aria-invalid={!!error}
                className={`${inputCls} ${borderCls} pr-4`}
              />
            </span>
            <span id="username-hint" className="mt-1.5 block text-[13px] text-ink-muted">
              HR Admins: sign in with your work email.
            </span>
          </label>

          <label className="mt-5 block">
            <span className="text-[15px] font-semibold text-ink">Password</span>
            <div className="relative mt-2">
              <Icon name="lock" className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-royal-600" />
              <input
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                type={showPassword ? 'text' : 'password'}
                autoComplete="current-password"
                placeholder="Your password"
                disabled={loading}
                aria-invalid={!!error}
                className={`${inputCls} ${borderCls} pr-12`}
              />
              <button
                type="button"
                onClick={() => setShowPassword((s) => !s)}
                aria-label={showPassword ? 'Hide password' : 'Show password'}
                className="absolute inset-y-0 right-0 grid w-14 place-items-center rounded-r-2xl text-ink-muted hover:text-ink"
              >
                <Icon name={showPassword ? 'eyeOff' : 'eye'} className="h-5 w-5" />
              </button>
            </div>
          </label>

          {error && (
            <div className="mt-4" role="alert">
              <Notice tone="bad">{error}</Notice>
            </div>
          )}

          <Button type="submit" size="lg" disabled={loading} className="mt-7 h-14 w-full rounded-2xl text-[17px]">
            {loading ? (
              <>
                <Spinner /> Signing in
              </>
            ) : (
              'Sign in'
            )}
          </Button>

          <div className="mt-5 border-t border-line pt-3 text-center">
            <button
              type="button"
              onClick={() => {
                setError('')
                setResetNotice(null)
                setForgot(true)
              }}
              disabled={loading}
              className="inline-flex items-center gap-1.5 rounded-md px-3 py-2 text-[13px] font-semibold text-navy-700 hover:bg-mist-50 disabled:opacity-60"
            >
              <Icon name="shield" className="h-3.5 w-3.5 text-mist-500" />
              Forgot password?
            </button>
          </div>
        </form>
        )}
        <p className="mt-auto pt-6 text-center text-[12px] text-ink-muted">RIGHTSKU Solutions Private Limited</p>
      </div>
    </div>
  )
}
