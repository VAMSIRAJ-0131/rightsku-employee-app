// HR Admin: reset a forgotten employee password to a temporary one.
// The server stores only a hash, ends the employee's sessions and makes them
// choose their own password at the next sign-in. The password is never sent
// back or kept after this screen closes.
import { useState, type FormEvent } from 'react'
import { Icon } from '../../components/Icons'
import { Button, Card, Notice, Section, Spinner, TopBar } from '../../components/ui'
import type { ApiError } from '../../lib/api'
import {
  MIN_PASSWORD_LENGTH, fullName, generateTemporaryPassword, resetEmployeePassword, validateResetPassword,
  type EmployeeRecord, type ResetPasswordValues,
} from '../../lib/employees'

const inputCls =
  'h-12 w-full rounded-xl border bg-white px-4 pr-12 text-[15px] text-ink outline-none placeholder:text-ink-muted/70 focus:border-mist-500 focus:ring-4 focus:ring-mist-100'

export default function ResetPasswordForm({
  token, record, onCancel, onDone, onError,
}: {
  token: string
  record: EmployeeRecord
  onCancel: () => void
  onDone: () => void
  onError: (error: ApiError) => ApiError
}) {
  const [values, setValues] = useState<ResetPasswordValues>({ temporaryPassword: '', confirmPassword: '' })
  const [errors, setErrors] = useState<Partial<Record<keyof ResetPasswordValues, string>>>({})
  const [show, setShow] = useState(false)
  const [saving, setSaving] = useState(false)
  const [failure, setFailure] = useState<string | null>(null)

  const set = (key: keyof ResetPasswordValues) => (value: string) => setValues((v) => ({ ...v, [key]: value }))

  function generate() {
    const pw = generateTemporaryPassword()
    setValues({ temporaryPassword: pw, confirmPassword: pw })
    setErrors({})
    setShow(true) // HR needs to read it out or write it down for the employee
  }

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (saving) return
    setFailure(null)
    const problems = validateResetPassword(values)
    setErrors(problems)
    if (Object.keys(problems).length) return
    setSaving(true)
    const result = await resetEmployeePassword(token, record.id, values)
    setSaving(false)
    if (result.ok) {
      setValues({ temporaryPassword: '', confirmPassword: '' })
      onDone()
      return
    }
    const error = onError(result.error)
    setErrors(error.fields)
    if (!Object.keys(error.fields).length) setFailure(error.message)
  }

  return (
    <>
      <TopBar title="Reset password" subtitle={`${fullName(record)} · ${record.employeeCode}`} onBack={onCancel} />
      <form onSubmit={submit} noValidate>
        <Section>
          <Notice>
            Use this when {record.firstName} has forgotten their password. They sign in with this temporary password and
            must choose their own straight away. Their other sessions end. It is stored only as a secure hash and is never
            shown again.
          </Notice>
        </Section>
        <Section title="Temporary password">
          <Card className="space-y-4 p-4">
            <PasswordInput
              label="Temporary password"
              value={values.temporaryPassword}
              onChange={set('temporaryPassword')}
              error={errors.temporaryPassword}
              show={show}
              onToggle={() => setShow((s) => !s)}
              hint={`At least ${MIN_PASSWORD_LENGTH} characters. Give it to ${record.firstName} privately, in person or by phone.`}
            />
            <PasswordInput
              label="Temporary password again"
              value={values.confirmPassword}
              onChange={set('confirmPassword')}
              error={errors.confirmPassword}
              show={show}
            />
            <Button variant="secondary" onClick={generate} disabled={saving} className="w-full">
              <Icon name="shield" className="h-4 w-4" /> Suggest a strong password
            </Button>
          </Card>
        </Section>
        {failure && (
          <Section>
            <div role="alert">
              <Notice tone="bad">{failure}</Notice>
            </div>
          </Section>
        )}
        <Section>
          <div className="grid grid-cols-2 gap-2">
            <Button variant="secondary" onClick={onCancel} disabled={saving}>
              Cancel
            </Button>
            <Button type="submit" disabled={saving}>
              {saving ? (
                <>
                  <Spinner /> Resetting
                </>
              ) : (
                'Reset password'
              )}
            </Button>
          </div>
        </Section>
      </form>
    </>
  )
}

function PasswordInput({
  label, value, onChange, error, hint, show, onToggle,
}: {
  label: string
  value: string
  onChange: (value: string) => void
  error?: string
  hint?: string
  show: boolean
  onToggle?: () => void
}) {
  const id = `reset-${label.replace(/\W+/g, '-').toLowerCase()}`
  return (
    <label className="block" htmlFor={id}>
      <span className="text-[13px] font-medium text-ink-soft">{label}</span>
      <div className="relative mt-1.5">
        <input
          id={id}
          type={show ? 'text' : 'password'}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          autoComplete="new-password"
          autoCapitalize="none"
          spellCheck={false}
          aria-invalid={!!error}
          className={`${inputCls} ${error ? 'border-bad/50' : 'border-line-strong'}`}
        />
        {onToggle && (
          <button
            type="button"
            onClick={onToggle}
            aria-label={show ? 'Hide passwords' : 'Show passwords'}
            className="absolute inset-y-0 right-0 grid w-12 place-items-center text-ink-muted hover:text-ink"
          >
            <Icon name={show ? 'eyeOff' : 'eye'} className="h-[18px] w-[18px]" />
          </button>
        )}
      </div>
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
