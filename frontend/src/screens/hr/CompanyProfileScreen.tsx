// HR: the company profile, the company name and phone, and the office
// addresses employees' ID cards show. Nothing is filled in by the app: HR
// enters every value. An address is never deleted, only marked "not in use",
// so ID cards that already show it keep working.
import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { Icon } from '../../components/Icons'
import { Button, Card, EmptyState, Notice, Section, Spinner, Tag, TopBar } from '../../components/ui'
import type { ApiError } from '../../lib/api'
import {
  addAddress, changeAddress, getCompany, saveCompany, validateAddress, validateCompany,
  type AddressFormValues, type CompanyAddressRecord, type CompanyFormValues, type CompanyProfileRecord,
} from '../../lib/company'

type Editing = { kind: 'none' } | { kind: 'add' } | { kind: 'edit'; address: CompanyAddressRecord }

const inputClass = (error: boolean) =>
  `mt-1.5 h-12 w-full rounded-xl border bg-white px-4 text-[15px] text-ink outline-none placeholder:text-ink-muted/70 focus:border-mist-500 focus:ring-4 focus:ring-mist-100 ${
    error ? 'border-bad/50' : 'border-line-strong'
  }`

export default function CompanyProfileScreen({
  token, onBack, onToast, onError,
}: {
  token: string
  onBack: () => void
  onToast: (text: string, tone?: 'info' | 'success' | 'error') => void
  onError: (error: ApiError) => ApiError
}) {
  const [profile, setProfile] = useState<CompanyProfileRecord | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [version, setVersion] = useState(0)
  const [form, setForm] = useState<CompanyFormValues>({ name: '', phone: '' })
  const [errors, setErrors] = useState<Partial<Record<keyof CompanyFormValues, string>>>({})
  const [saving, setSaving] = useState(false)
  const [editing, setEditing] = useState<Editing>({ kind: 'none' })

  const loaded = useCallback((data: CompanyProfileRecord) => {
    setProfile(data)
    setForm({ name: data.name ?? '', phone: data.phone ?? '' })
  }, [])

  useEffect(() => {
    const controller = new AbortController()
    setLoadError(null)
    getCompany(token, controller.signal).then((r) => {
      if (controller.signal.aborted) return
      if (r.ok) loaded(r.data)
      else setLoadError(onError(r.error).message)
    })
    return () => controller.abort()
  }, [token, version, onError, loaded])

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (saving) return
    const found = validateCompany(form)
    setErrors(found)
    if (Object.keys(found).length) return
    setSaving(true)
    const r = await saveCompany(token, form)
    setSaving(false)
    if (r.ok) {
      loaded(r.data)
      onToast('Company profile saved.', 'success')
    } else {
      const error = onError(r.error)
      setErrors({ name: error.fields.name, phone: error.fields.phone })
      if (!error.fields.name && !error.fields.phone) onToast(error.message, 'error')
    }
  }

  if (editing.kind !== 'none') {
    return (
      <AddressForm
        token={token}
        editing={editing}
        onCancel={() => setEditing({ kind: 'none' })}
        onSaved={(data, message) => {
          loaded(data)
          setEditing({ kind: 'none' })
          onToast(message, 'success')
        }}
        onError={onError}
      />
    )
  }

  return (
    <>
      <TopBar title="Company profile" subtitle="Shown on employee ID cards" onBack={onBack} />
      {loadError ? (
        <Section>
          <div className="space-y-3" role="alert">
            <Notice tone="bad">{loadError}</Notice>
            <Button variant="secondary" size="sm" onClick={() => setVersion((v) => v + 1)}>
              Try again
            </Button>
          </div>
        </Section>
      ) : !profile ? (
        <Section>
          <Card className="flex items-center justify-center gap-2 px-4 py-8 text-[14px] text-ink-muted">
            <Spinner /> Loading company profile
          </Card>
        </Section>
      ) : (
        <>
          <Section title="Company">
            <form noValidate onSubmit={submit}>
              <Card className="space-y-4 p-4">
                <label className="block" htmlFor="co-name">
                  <span className="text-[13px] font-medium text-ink-soft">Company name</span>
                  <input id="co-name" value={form.name} maxLength={150} aria-invalid={!!errors.name}
                    onChange={(e) => { setForm((f) => ({ ...f, name: e.target.value })); setErrors((x) => ({ ...x, name: undefined })) }}
                    className={inputClass(!!errors.name)} />
                  {errors.name && <span className="mt-1.5 block text-[12px] text-bad">{errors.name}</span>}
                </label>
                <label className="block" htmlFor="co-phone">
                  <span className="text-[13px] font-medium text-ink-soft">Phone (optional)</span>
                  <input id="co-phone" type="tel" inputMode="tel" value={form.phone} maxLength={30} aria-invalid={!!errors.phone}
                    placeholder="+91 40 0000 0000"
                    onChange={(e) => { setForm((f) => ({ ...f, phone: e.target.value })); setErrors((x) => ({ ...x, phone: undefined })) }}
                    className={inputClass(!!errors.phone)} />
                  {errors.phone && <span className="mt-1.5 block text-[12px] text-bad">{errors.phone}</span>}
                </label>
              </Card>
              <Button type="submit" size="lg" disabled={saving} className="mt-3 w-full">
                {saving ? <><Spinner /> Saving</> : 'Save company profile'}
              </Button>
            </form>
          </Section>

          <Section
            title={`Office addresses (${profile.addresses.length})`}
            action={
              <button type="button" onClick={() => setEditing({ kind: 'add' })}
                className="inline-flex items-center gap-1 text-[14px] font-semibold text-navy-700">
                <Icon name="plus" className="h-4 w-4" /> Add
              </button>
            }
          >
            {profile.addresses.length === 0 ? (
              <EmptyState icon="pin" title="No office addresses yet" message="Add the offices here, then choose one for each employee in their profile." />
            ) : (
              <Card className="divide-y divide-line">
                {profile.addresses.map((a) => (
                  <button key={a.id} type="button" onClick={() => setEditing({ kind: 'edit', address: a })}
                    className="flex w-full items-start gap-3 px-4 py-3.5 text-left hover:bg-mist-50/60">
                    <Icon name="pin" className="mt-0.5 h-[18px] w-[18px] shrink-0 text-navy-700" />
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-2">
                        <span className="text-[15px] font-semibold text-ink">{a.label}</span>
                        {!a.active && <Tag>Not in use</Tag>}
                      </span>
                      <span className="mt-0.5 block whitespace-pre-line text-[13px] leading-snug text-ink-muted">{a.address}</span>
                    </span>
                    <Icon name="chevronRight" className="mt-1 h-4 w-4 shrink-0 text-ink-muted" />
                  </button>
                ))}
              </Card>
            )}
          </Section>
        </>
      )}
    </>
  )
}

function AddressForm({
  token, editing, onCancel, onSaved, onError,
}: {
  token: string
  editing: Exclude<Editing, { kind: 'none' }>
  onCancel: () => void
  onSaved: (data: CompanyProfileRecord, message: string) => void
  onError: (error: ApiError) => ApiError
}) {
  const current = editing.kind === 'edit' ? editing.address : null
  const [values, setValues] = useState<AddressFormValues>({ label: current?.label ?? '', address: current?.address ?? '' })
  const [active, setActive] = useState(current?.active ?? true)
  const [errors, setErrors] = useState<Partial<Record<keyof AddressFormValues, string>>>({})
  const [formError, setFormError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (saving) return
    const found = validateAddress(values)
    setErrors(found)
    if (Object.keys(found).length) return
    setSaving(true)
    setFormError(null)
    const r = current ? await changeAddress(token, current.id, { ...values, active }) : await addAddress(token, values)
    setSaving(false)
    if (r.ok) onSaved(r.data, current ? 'Address saved.' : 'Address added.')
    else {
      const error = onError(r.error)
      setErrors({ label: error.fields.label, address: error.fields.address })
      if (!error.fields.label && !error.fields.address) setFormError(error.message)
    }
  }

  return (
    <>
      <TopBar title={current ? 'Edit office address' : 'Add office address'} onBack={onCancel} />
      <form noValidate onSubmit={submit}>
        {formError && (
          <Section>
            <div role="alert"><Notice tone="bad">{formError}</Notice></div>
          </Section>
        )}
        <Section>
          <Card className="space-y-4 p-4">
            <label className="block" htmlFor="addr-label">
              <span className="text-[13px] font-medium text-ink-soft">Office name</span>
              <input id="addr-label" value={values.label} maxLength={60} placeholder="For example: Head office" aria-invalid={!!errors.label}
                onChange={(e) => { setValues((v) => ({ ...v, label: e.target.value })); setErrors((x) => ({ ...x, label: undefined })) }}
                className={inputClass(!!errors.label)} />
              {errors.label && <span className="mt-1.5 block text-[12px] text-bad">{errors.label}</span>}
            </label>
            <label className="block" htmlFor="addr-text">
              <span className="text-[13px] font-medium text-ink-soft">Address</span>
              <textarea id="addr-text" rows={4} maxLength={300} value={values.address} aria-invalid={!!errors.address}
                onChange={(e) => { setValues((v) => ({ ...v, address: e.target.value })); setErrors((x) => ({ ...x, address: undefined })) }}
                className={`mt-1.5 w-full rounded-xl border bg-white px-4 py-3 text-[15px] text-ink outline-none focus:border-mist-500 focus:ring-4 focus:ring-mist-100 ${errors.address ? 'border-bad/50' : 'border-line-strong'}`} />
              {errors.address && <span className="mt-1.5 block text-[12px] text-bad">{errors.address}</span>}
            </label>
            {current && (
              <label className="flex items-center justify-between gap-3" htmlFor="addr-active">
                <span>
                  <span className="block text-[14px] font-medium text-ink">In use</span>
                  <span className="block text-[12px] text-ink-muted">Turn off to stop offering it. ID cards that show it keep it.</span>
                </span>
                <input id="addr-active" type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)}
                  className="h-6 w-6 shrink-0 accent-navy-700" />
              </label>
            )}
          </Card>
        </Section>
        <Section>
          <div className="grid grid-cols-2 gap-2">
            <Button variant="secondary" onClick={onCancel} disabled={saving}>Cancel</Button>
            <Button type="submit" disabled={saving}>{saving ? <><Spinner /> Saving</> : current ? 'Save' : 'Add address'}</Button>
          </div>
        </Section>
      </form>
    </>
  )
}
