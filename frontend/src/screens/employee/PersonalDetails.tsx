// The employee's personal details on Profile (contact, emergency contact,
// bank), and the screen to ask HR to update them. Nothing changes until HR
// approves; a waiting request can be cancelled. The bank account number is
// shown masked.
import { useEffect, useState, type FormEvent } from 'react'
import { Icon } from '../../components/Icons'
import ConfirmSheet from '../../components/ConfirmSheet'
import { Button, Card, DetailRow, Notice, Section, Spinner, StatusBadge, TopBar } from '../../components/ui'
import type { ApiError } from '../../lib/api'
import { statusLabel } from '../../lib/approvalView'
import { formatDate } from '../../lib/format'
import {
  PROFILE_FIELDS, cancelProfileChange, changeSummary, changedFields, formFrom, getMyPersonalDetails, listMyProfileChanges,
  requestProfileChange, validateProfileForm, type PersonalDetails, type ProfileChangeRecord, type ProfileForm,
  type ProfileFormErrors,
} from '../../lib/profileChanges'

/** Profile: the details, a waiting update (with Cancel) and "Request an update". */
export function PersonalDetailsSection({
  token, email, version, onEdit, onError, onToast,
}: {
  token: string
  email: string
  /** Goes up when a request was sent or decided, to load again. */
  version: number
  onEdit: () => void
  onError: (error: ApiError) => ApiError
  onToast: (message: string, tone?: 'success' | 'error') => void
}) {
  const [details, setDetails] = useState<PersonalDetails | null>(null)
  const [requests, setRequests] = useState<ProfileChangeRecord[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [reload, setReload] = useState(0)
  const [confirmCancel, setConfirmCancel] = useState(false)

  useEffect(() => {
    const controller = new AbortController()
    setError(null)
    Promise.all([getMyPersonalDetails(token, controller.signal), listMyProfileChanges(token, controller.signal)]).then(([d, r]) => {
      if (controller.signal.aborted) return
      if (!d.ok) return setError(onError(d.error).message)
      setDetails(d.data)
      if (r.ok) setRequests(r.data)
    })
    return () => controller.abort()
  }, [token, version, reload, onError])

  const pending = requests?.find((r) => r.status === 'PENDING') ?? null
  const latestDecided = requests?.find((r) => r.status === 'APPROVED' || r.status === 'REJECTED') ?? null

  async function cancelPending() {
    if (!pending) return
    setConfirmCancel(false)
    const result = await cancelProfileChange(token, pending.id)
    if (result.ok) {
      onToast('Profile update cancelled.', 'success')
      setReload((n) => n + 1)
    } else onToast(onError(result.error).message, 'error')
  }

  if (error) {
    return (
      <Section title="Contact">
        <div className="space-y-2" role="alert">
          <Notice tone="bad">{error}</Notice>
          <Button variant="secondary" size="sm" onClick={() => setReload((n) => n + 1)}>Try again</Button>
        </div>
      </Section>
    )
  }

  return (
    <>
      <Section title="Contact">
        <Card className="divide-y divide-line">
          <DetailRow icon="mail" label="Email" value={email} />
          <DetailRow icon="phone" label="Phone" value={details?.phone ?? ''} />
          <AddressRow value={details?.address ?? null} loading={!details} />
        </Card>
      </Section>
      <Section title="Emergency contact">
        <Card className="divide-y divide-line">
          <DetailRow icon="user" label="Name" value={details?.emergencyContactName ?? ''} />
          <DetailRow icon="phone" label="Phone" value={details?.emergencyContactPhone ?? ''} />
        </Card>
      </Section>
      <Section title="Bank details">
        <Card className="divide-y divide-line">
          <DetailRow icon="user" label="Account holder" value={details?.bankAccountName ?? ''} />
          <DetailRow icon="wallet" label="Account number" value={details?.bankAccountNumber ?? ''} />
          <DetailRow icon="briefcase" label="IFSC" value={details?.bankIfsc ?? ''} />
        </Card>
        <p className="mt-2 px-1 text-[12px] text-ink-muted">Used by HR for your salary. Shown only to you and HR.</p>
      </Section>

      <Section>
        {pending ? (
          <Card className="p-4">
            <div className="flex items-start gap-3">
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-pending-soft text-pending-ink">
                <Icon name="clock" className="h-5 w-5" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-[15px] font-semibold text-ink">Update waiting for HR</p>
                <p className="mt-0.5 text-[13px] text-ink-muted">{changeSummary(pending)} · sent {formatDate(pending.createdAt.slice(0, 10))}</p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setConfirmCancel(true)}
              className="press mt-3 h-11 w-full rounded-xl bg-white text-[14px] font-semibold text-bad ring-1 ring-inset ring-bad/30 transition-transform duration-150"
            >
              Cancel this request
            </button>
          </Card>
        ) : (
          <button
            type="button"
            onClick={onEdit}
            disabled={!details}
            className="press save-cta flex h-13 w-full items-center justify-center gap-2 rounded-2xl text-[15px] font-semibold text-white transition-transform duration-150 disabled:opacity-60"
          >
            <Icon name="user" className="h-5 w-5" /> Request an update
          </button>
        )}
        {!pending && latestDecided && (
          <p className="mt-2 flex flex-wrap items-center gap-2 px-1 text-[12px] text-ink-muted">
            Last update ({changeSummary(latestDecided)}): <StatusBadge status={statusLabel(latestDecided.status)} />
            {latestDecided.reviewNote && <span>HR note: {latestDecided.reviewNote}</span>}
          </p>
        )}
      </Section>

      {confirmCancel && (
        <ConfirmSheet
          title="Cancel this update?"
          message="HR won’t see it any more. You can send a new one later."
          confirmLabel="Cancel request"
          danger
          onCancel={() => setConfirmCancel(false)}
          onConfirm={() => void cancelPending()}
        />
      )}
    </>
  )
}

function AddressRow({ value, loading }: { value: string | null; loading: boolean }) {
  return (
    <div className="flex items-start gap-3 px-4 py-3">
      <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-royal-50 text-royal-700">
        <Icon name="pin" className="h-[18px] w-[18px]" />
      </span>
      <span className="pt-2 text-[14px] text-ink-muted">Address</span>
      <span className={`ml-auto max-w-[62%] pl-3 pt-2 text-right ${value ? 'text-[14px] font-medium text-ink' : 'text-[13px] text-ink-muted'}`}>
        {loading ? '' : value ?? 'Not on file yet'}
      </span>
    </div>
  )
}

/** The form: change any detail, then send it to HR. */
export function ProfileEditScreen({
  token, onBack, onSent, onError,
}: {
  token: string
  onBack: () => void
  onSent: () => void
  onError: (error: ApiError) => ApiError
}) {
  const [details, setDetails] = useState<PersonalDetails | null>(null)
  const [form, setForm] = useState<ProfileForm>(() => formFrom(null))
  const [errors, setErrors] = useState<ProfileFormErrors>({})
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    const controller = new AbortController()
    getMyPersonalDetails(token, controller.signal).then((r) => {
      if (controller.signal.aborted) return
      if (r.ok) {
        setDetails(r.data)
        setForm(formFrom(r.data))
      } else setErrors({ form: onError(r.error).message })
    })
    return () => controller.abort()
  }, [token, onError])

  function set(key: keyof ProfileForm, value: string) {
    setForm((f) => ({ ...f, [key]: value }))
    setErrors((e) => ({ ...e, [key]: undefined, form: undefined }))
  }

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (saving) return
    const found = validateProfileForm(details, form)
    setErrors(found)
    if (Object.values(found).some(Boolean)) return
    setSaving(true)
    const result = await requestProfileChange(token, changedFields(details, form))
    setSaving(false)
    if (result.ok) onSent()
    else {
      const error = onError(result.error)
      setErrors({ ...(error.fields as ProfileFormErrors), form: Object.keys(error.fields).length ? undefined : error.message })
    }
  }

  const groups: { id: 'contact' | 'emergency' | 'bank'; title: string }[] = [
    { id: 'contact', title: 'Contact' },
    { id: 'emergency', title: 'Emergency contact' },
    { id: 'bank', title: 'Bank details' },
  ]

  return (
    <>
      <TopBar title="Update my details" subtitle="HR approves before anything changes" onBack={onBack} />
      <form noValidate onSubmit={submit}>
        {!details && !errors.form ? (
          <Section>
            <Card className="flex items-center justify-center gap-2 px-4 py-8 text-[14px] text-ink-muted"><Spinner /> Loading</Card>
          </Section>
        ) : (
          groups.map((g) => (
            <Section key={g.id} title={g.title}>
              <Card className="space-y-4 p-4">
                {PROFILE_FIELDS.filter((f) => f.group === g.id).map((f) => {
                  const id = `pd-${f.key}`
                  const masked = f.key === 'bankAccountNumber' && details?.bankAccountNumber
                  const common = {
                    id,
                    value: form[f.key],
                    maxLength: f.max,
                    'aria-invalid': !!errors[f.key],
                    onChange: (e: { target: { value: string } }) => set(f.key, e.target.value),
                    className: `mt-2 w-full rounded-2xl border bg-white px-4 text-[16px] text-ink outline-none placeholder:text-ink-muted/60 focus:border-royal-600 focus:ring-4 focus:ring-royal-100 ${
                      errors[f.key] ? 'border-bad/50' : 'border-line-strong'
                    }`,
                  }
                  return (
                    <label key={f.key} className="block" htmlFor={id}>
                      <span className="text-[14px] font-semibold text-ink">{f.label}</span>
                      {f.multiline ? (
                        <textarea {...common} rows={3} className={`${common.className} py-3`} />
                      ) : (
                        <input
                          {...common}
                          type="text"
                          inputMode={f.inputMode}
                          autoComplete="off"
                          placeholder={masked ? `${details?.bankAccountNumber} (type to change)` : f.hint}
                          className={`${common.className} h-12 ${f.key === 'bankIfsc' ? 'uppercase' : ''}`}
                        />
                      )}
                      {errors[f.key] ? (
                        <span className="mt-1.5 block text-[12px] text-bad">{errors[f.key]}</span>
                      ) : masked ? (
                        <span className="mt-1.5 block text-[12px] text-ink-muted">Leave empty to keep your current account.</span>
                      ) : null}
                    </label>
                  )
                })}
              </Card>
            </Section>
          ))
        )}
        <Section>
          {errors.form && (
            <div className="mb-3" role="alert"><Notice tone="bad">{errors.form}</Notice></div>
          )}
          <p className="mb-3 px-1 text-[12px] text-ink-muted">Clear a box to remove that detail. HR checks and approves the change.</p>
          <button
            type="submit"
            disabled={saving || !details}
            className="press save-cta flex h-14 w-full items-center justify-center gap-2 rounded-2xl text-[16px] font-semibold text-white transition-transform duration-150 disabled:opacity-60"
          >
            {saving ? <><Spinner /> Sending</> : <><Icon name="check" className="h-5 w-5" /> Send to HR</>}
          </button>
        </Section>
      </form>
    </>
  )
}
