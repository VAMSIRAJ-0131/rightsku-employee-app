// Choosing a new password.
// - required: right after sign-in while the account still has HR's temporary
//   password. Nothing else in the app is reachable until a new password is
//   set (the server refuses every other request made with this session too).
// - voluntary: an employee changes their password later from Profile.
// Employees choose at least 8 characters (letters, numbers and symbols are
// all allowed); the new password is typed twice.
import { useState, type FormEvent } from 'react'
import { Icon } from '../../components/Icons'
import { Button, Card, Notice, Page, Section, Spinner, TopBar } from '../../components/ui'
import type { Role } from '../../data/types'
import {
  EMPLOYEE_MIN_LENGTH, MIN_PASSWORD_LENGTH, changePassword, validatePasswordChange,
  type PasswordFormErrors, type PasswordFormValues,
} from '../../lib/password'

const EMPTY: PasswordFormValues = { currentPassword: '', newPassword: '', confirmPassword: '' }

export default function ChangePasswordScreen({
  token,
  loginId,
  role,
  mode = 'required',
  onBack,
  onChanged,
  onLogout,
  onSessionExpired,
}: {
  token: string
  loginId: string | null
  role: Role
  /** required = first sign-in (no way around it); voluntary = from Profile, with a back button. */
  mode?: 'required' | 'voluntary'
  onBack?: () => void
  /** Called after the password was changed; the app then asks the user to sign in again. */
  onChanged: () => void
  onLogout: () => void
  onSessionExpired: () => void
}) {
  const [values, setValues] = useState<PasswordFormValues>(EMPTY)
  const [errors, setErrors] = useState<PasswordFormErrors>({})
  const [formError, setFormError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [show, setShow] = useState(false)

  const set = (field: keyof PasswordFormValues) => (value: string) => {
    setValues((v) => ({ ...v, [field]: value }))
    if (errors[field]) setErrors((e) => ({ ...e, [field]: undefined }))
  }

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (saving) return
    setFormError(null)
    const found = validatePasswordChange(values, role)
    setErrors(found)
    if (Object.keys(found).length > 0) return

    setSaving(true)
    const result = await changePassword(token, values)
    setSaving(false)
    if (result.ok) {
      setValues(EMPTY)
      onChanged()
      return
    }
    if (result.error.kind === 'unauthorized') {
      onSessionExpired()
      return
    }
    const fieldErrors: PasswordFormErrors = {}
    if (result.error.fields.currentPassword) fieldErrors.currentPassword = result.error.fields.currentPassword
    if (result.error.fields.newPassword) fieldErrors.newPassword = result.error.fields.newPassword
    if (result.error.fields.confirmPassword) fieldErrors.confirmPassword = result.error.fields.confirmPassword
    setErrors(fieldErrors)
    if (fieldErrors.currentPassword) setValues((v) => ({ ...v, currentPassword: '' }))
    setFormError(Object.keys(fieldErrors).length ? null : result.error.message)
  }

  const required = mode === 'required'
  const minLength = role === 'employee' ? EMPLOYEE_MIN_LENGTH : MIN_PASSWORD_LENGTH
  const newHint = `At least ${minLength} characters. Letters, numbers and symbols are allowed. Must be different from your current password.`

  const content = (
    <>
      <TopBar
        title={required ? 'Choose your password' : 'Change password'}
        subtitle={loginId ? `Signed in as ${loginId}` : undefined}
        onBack={required ? undefined : onBack}
      />
      <form noValidate onSubmit={submit}>
        <Section>
          <Notice>
            {required
              ? 'For your security, choose your own password before continuing. Enter the password you just signed in with (the one HR gave you), then your new password. You’ll then sign in again with the new password.'
              : 'Enter your current password, then your new password twice. After saving, you’ll be signed out everywhere and sign in again with the new password.'}
          </Notice>
        </Section>
        {formError && (
          <Section>
            <div role="alert">
              <Notice tone="bad">{formError}</Notice>
            </div>
          </Section>
        )}
        <Section>
          <Card className="space-y-4 p-4">
            <PasswordField
              label="Current password"
              value={values.currentPassword}
              onChange={set('currentPassword')}
              error={errors.currentPassword}
              autoComplete="current-password"
              show={show}
            />
            <PasswordField
              label="New password"
              value={values.newPassword}
              onChange={set('newPassword')}
              error={errors.newPassword}
              autoComplete="new-password"
              hint={newHint}
              show={show}
            />
            <PasswordField
              label="Confirm new password"
              value={values.confirmPassword}
              onChange={set('confirmPassword')}
              error={errors.confirmPassword}
              autoComplete="new-password"
              show={show}
            />
            <label className="flex items-center gap-2 text-[13px] text-ink-soft">
              <input type="checkbox" checked={show} onChange={(e) => setShow(e.target.checked)} className="h-4 w-4" />
              Show passwords
            </label>
          </Card>
        </Section>
        <Section>
          <Button type="submit" size="lg" disabled={saving} className="w-full">
            {saving ? (
              <>
                <Spinner /> Saving
              </>
            ) : (
              <>
                <Icon name="lock" className="h-[18px] w-[18px]" /> Save new password
              </>
            )}
          </Button>
          {required ? (
            <Button variant="ghost" onClick={onLogout} disabled={saving} className="mt-2 w-full">
              Log out
            </Button>
          ) : (
            <Button variant="ghost" onClick={onBack} disabled={saving} className="mt-2 w-full">
              Cancel
            </Button>
          )}
        </Section>
      </form>
    </>
  )

  // First sign-in: a page of its own, with no navigation to anywhere else.
  return required ? <Page withNav={false}>{content}</Page> : content
}

function PasswordField({
  label, value, onChange, error, hint, autoComplete, show,
}: {
  label: string
  value: string
  onChange: (value: string) => void
  error?: string
  hint?: string
  autoComplete: string
  show: boolean
}) {
  const id = `pw-${label.replace(/\W+/g, '-').toLowerCase()}`
  return (
    <label className="block" htmlFor={id}>
      <span className="text-[13px] font-medium text-ink-soft">{label}</span>
      <input
        id={id}
        type={show ? 'text' : 'password'}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        autoComplete={autoComplete}
        aria-invalid={!!error}
        aria-describedby={error ? `${id}-error` : hint ? `${id}-hint` : undefined}
        className={`mt-1.5 h-12 w-full rounded-lg border bg-white px-4 text-[15px] text-ink outline-none focus:border-mist-500 focus:ring-4 focus:ring-mist-100 ${
          error ? 'border-bad/50' : 'border-line-strong'
        }`}
      />
      {error ? (
        <span id={`${id}-error`} className="mt-1.5 block text-[12px] text-bad">
          {error}
        </span>
      ) : hint ? (
        <span id={`${id}-hint`} className="mt-1.5 block text-[12px] leading-relaxed text-ink-muted">
          {hint}
        </span>
      ) : null}
    </label>
  )
}
