import { useState, type FormEvent } from 'react'
import { Icon } from '../components/Icons'
import { Logo } from '../components/Logo'
import { Button, DevBanner, Notice, Spinner } from '../components/ui'
import { devLogin, type Session } from '../data/sampleData'

const inputCls =
  'h-12 w-full rounded-lg border bg-white px-4 text-[15px] text-ink outline-none placeholder:text-ink-muted/70 focus:border-mist-500 focus:ring-4 focus:ring-mist-100'

export default function Login({ onLogin }: { onLogin: (session: Session) => void }) {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError('')
    if (!username.trim() || !password) {
      setError('Enter your Employee ID and password to sign in.')
      return
    }
    setLoading(true)
    // Simulated wait. In Phase 4 this becomes a secure call to the backend.
    window.setTimeout(() => {
      const session = devLogin(username, password)
      setLoading(false)
      if (session) onLogin(session)
      else setError('That Employee ID and password don’t match. Check both and try again.')
    }, 600)
  }

  const borderCls = error ? 'border-bad/40' : 'border-line-strong'

  return (
    <div className="flex min-h-dvh flex-col bg-canvas">
      <DevBanner />

      {/* Brand panel: white, because the logo is designed for light surfaces.
          The thin stripe uses the logo's own slate-to-cyan colours. */}
      <div className="border-b border-line bg-white pt-[env(safe-area-inset-top)]">
        <div className="h-1 bg-gradient-to-r from-brand-slate to-brand-cyan" aria-hidden="true" />
        <div className="mx-auto w-full max-w-md px-6 pb-16 pt-9 sm:pt-12">
          <Logo className="h-14 sm:h-[72px]" />
          <h1 className="mt-10 text-[28px] font-semibold leading-tight tracking-tight text-navy-900">Sign in to your workplace</h1>
          <p className="mt-2 max-w-80 text-[14px] leading-relaxed text-ink-muted">
            Timesheets, leave, payslips and documents for RIGHTSKU Solutions Private Limited.
          </p>
        </div>
      </div>

      {/* Form sheet */}
      <div className="mx-auto -mt-8 flex w-full max-w-md flex-1 flex-col px-4 pb-8">
        <form onSubmit={handleSubmit} noValidate className="rounded-2xl border border-line bg-white p-5 shadow-raised">
          <label className="block">
            <span className="text-[13px] font-medium text-ink-soft">Employee ID or username</span>
            <input
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              autoComplete="username"
              autoCapitalize="characters"
              placeholder="EMP001"
              aria-invalid={!!error}
              className={`mt-1.5 ${inputCls} ${borderCls}`}
            />
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

        <div className="mt-auto pt-8">
          <div className="rounded-lg border border-dashed border-accent/50 bg-accent-soft/60 px-4 py-3 text-[13px] text-ink-soft">
            <p className="font-semibold text-ink">Demo accounts for development</p>
            <div className="tnum mt-1.5 grid grid-cols-[auto_1fr] gap-x-4 gap-y-0.5">
              <span className="text-ink-muted">Employee</span>
              <span>EMP001 / demo123</span>
              <span className="text-ink-muted">HR/Admin</span>
              <span>HR001 / demo123</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
