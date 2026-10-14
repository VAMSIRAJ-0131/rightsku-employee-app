import { useState, type FormEvent } from 'react'
import { Icon } from '../components/Icons'
import { BrandMark, Button, Notice, Spinner } from '../components/ui'
import { checkLoginInput, login, loginErrorMessage, type AuthSession } from '../lib/auth'

const inputCls =
  'h-12 w-full rounded-lg border bg-white px-4 text-[15px] text-ink outline-none placeholder:text-ink-muted/70 focus:border-mist-500 focus:ring-4 focus:ring-mist-100'

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
      {/* Brand panel */}
      <div className="bg-navy-900 pt-[env(safe-area-inset-top)]">
        <div className="mx-auto w-full max-w-md px-6 pb-16 pt-8">
          <BrandMark tone="light" />
          <h1 className="mt-12 text-[28px] font-semibold leading-tight tracking-tight text-white">Sign in to your workplace</h1>
          <p className="mt-2 max-w-72 text-[14px] leading-relaxed text-mist-300">
            Timesheets, leave, payslips and documents for RIGHTSKU Solutions Private Limited.
          </p>
        </div>
      </div>

      {/* Form sheet */}
      <div className="mx-auto -mt-8 flex w-full max-w-md flex-1 flex-col px-4 pb-8">
        {notice && !error && (
          <div className="mb-3" role="status">
            <Notice>{notice}</Notice>
          </div>
        )}
        <form onSubmit={handleSubmit} noValidate className="rounded-2xl border border-line bg-white p-5 shadow-raised">
          <label className="block">
            <span className="text-[13px] font-medium text-ink-soft">Employee ID</span>
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
              className={`mt-1.5 ${inputCls} ${borderCls}`}
            />
            <span id="username-hint" className="mt-1.5 block text-[12px] text-ink-muted">
              HR Admins: sign in with your work email.
            </span>
          </label>

          <label className="mt-4 block">
            <span className="text-[13px] font-medium text-ink-soft">Password</span>
            <div className="relative mt-1.5">
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
                className="absolute inset-y-0 right-0 grid w-12 place-items-center text-ink-muted"
              >
                <Icon name={showPassword ? 'eyeOff' : 'eye'} className="h-[18px] w-[18px]" />
              </button>
            </div>
          </label>

          {error && (
            <div className="mt-4" role="alert">
              <Notice tone="bad">{error}</Notice>
            </div>
          )}

          <Button type="submit" size="lg" disabled={loading} className="mt-5 w-full">
            {loading ? (
              <>
                <Spinner /> Signing in
              </>
            ) : (
              'Sign in'
            )}
          </Button>

          <p className="mt-4 flex items-center justify-center gap-1.5 text-[13px] text-ink-muted">
            <Icon name="lock" className="h-3.5 w-3.5" />
            Forgot your password? Contact HR to reset it.
          </p>
        </form>
      </div>
    </div>
  )
}
