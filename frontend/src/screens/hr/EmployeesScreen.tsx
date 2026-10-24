// HR Admin: employee list, search and filter, add, view, edit, activate/deactivate.
// All data comes from the backend (/api/hr/employees); nothing is stored locally.
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { Icon } from '../../components/Icons'
import {
  Avatar, Button, Card, DetailRow, EmptyState, List, ListRow, Notice, SearchField, Section, Segmented,
  Spinner, StatusBadge, Tag, TopBar,
} from '../../components/ui'
import type { ApiError } from '../../lib/api'
import {
  EMPTY_EMPLOYEE_FORM, MIN_PASSWORD_LENGTH, createEmployee, formFromRecord, fullName, getEmployee,
  listEmployees, setEmployeeActive, updateEmployee, validateEmployeeForm,
  type EmployeeFormValues, type EmployeePage, type EmployeeRecord, type FormErrors, type StatusFilter,
} from '../../lib/employees'
import { formatDate } from '../../lib/format'
import type { DocumentRecord } from '../../lib/documents'
import type { ScheduleView } from '../../lib/workCalendar'
import DocumentUploadForm from './DocumentUploadForm'
import EmployeeDocumentsSection from './EmployeeDocumentsSection'
import LeaveBalanceSection from './LeaveBalanceSection'
import CompOffSection from './CompOffSection'
import { ScheduleForm, ScheduleSection } from './ScheduleSection'
import EmployeePhotoEditor from './EmployeePhotoEditor'
import ResetPasswordForm from './ResetPasswordForm'

type View =
  | { kind: 'list' }
  | { kind: 'create' }
  | { kind: 'details'; id: number; initial?: EmployeeRecord }
  | { kind: 'edit'; record: EmployeeRecord }
  | { kind: 'schedule'; record: EmployeeRecord; current: ScheduleView }
  | { kind: 'upload'; record: EmployeeRecord }
  | { kind: 'replace'; record: EmployeeRecord; document: DocumentRecord }
  | { kind: 'reset-password'; record: EmployeeRecord }

interface Props {
  token: string
  onToast: (text: string, tone?: 'info' | 'success' | 'error') => void
  onSessionExpired: () => void
  /** Called after any change, so other screens can refresh their counts. */
  onChanged: () => void
}

export default function EmployeesScreen({ token, onToast, onSessionExpired, onChanged }: Props) {
  const [view, setView] = useState<View>({ kind: 'list' })
  const [listVersion, setListVersion] = useState(0)
  /** Bumped after a schedule or document change, so the details page reloads them. */
  const [detailsVersion, setDetailsVersion] = useState(0)

  /** Shared handling for a failed request: sign out on 401, otherwise show the message. */
  const handleError = useCallback(
    (error: ApiError) => {
      if (error.kind === 'unauthorized') onSessionExpired()
      return error
    },
    [onSessionExpired],
  )

  const changed = () => {
    setListVersion((v) => v + 1)
    onChanged()
  }

  if (view.kind === 'create') {
    return (
      <EmployeeForm
        mode="create"
        initial={EMPTY_EMPLOYEE_FORM}
        onCancel={() => setView({ kind: 'list' })}
        onSubmit={(values) => createEmployee(token, values)}
        onError={handleError}
        onSaved={(record) => {
          changed()
          onToast(`${fullName(record)} added as ${record.employeeCode}.`, 'success')
          setView({ kind: 'details', id: record.id, initial: record })
        }}
      />
    )
  }
  if (view.kind === 'edit') {
    return (
      <EmployeeForm
        mode="edit"
        employeeCode={view.record.employeeCode}
        initial={formFromRecord(view.record)}
        onCancel={() => setView({ kind: 'details', id: view.record.id, initial: view.record })}
        onSubmit={(values) => updateEmployee(token, view.record.id, values)}
        onError={handleError}
        onSaved={(record) => {
          changed()
          onToast('Changes saved.', 'success')
          setView({ kind: 'details', id: record.id, initial: record })
        }}
      />
    )
  }
  if (view.kind === 'schedule') {
    const back = () => setView({ kind: 'details', id: view.record.id, initial: view.record })
    return (
      <ScheduleForm
        token={token}
        employeeId={view.record.id}
        employeeName={fullName(view.record)}
        current={view.current}
        onCancel={back}
        onError={handleError}
        onSaved={() => {
          setDetailsVersion((v) => v + 1)
          onToast('Work schedule saved.', 'success')
          back()
        }}
      />
    )
  }
  if (view.kind === 'upload' || view.kind === 'replace') {
    const back = () => setView({ kind: 'details', id: view.record.id, initial: view.record })
    const saved = (doc: DocumentRecord) => {
      setDetailsVersion((v) => v + 1)
      onToast(view.kind === 'upload' ? `${doc.title} uploaded.` : `${doc.title} replaced.`, 'success')
      back()
    }
    return view.kind === 'upload' ? (
      <DocumentUploadForm
        mode="upload"
        token={token}
        employee={{ id: view.record.id, name: fullName(view.record), code: view.record.employeeCode }}
        onCancel={back}
        onSaved={saved}
        onError={handleError}
      />
    ) : (
      <DocumentUploadForm
        mode="replace"
        token={token}
        document={view.document}
        onCancel={back}
        onSaved={saved}
        onError={handleError}
      />
    )
  }
  if (view.kind === 'reset-password') {
    const back = () => setView({ kind: 'details', id: view.record.id, initial: view.record })
    return (
      <ResetPasswordForm
        token={token}
        record={view.record}
        onCancel={back}
        onError={handleError}
        onDone={() => {
          onToast(`Password reset. ${view.record.firstName} must choose a new one at the next sign-in.`, 'success')
          back()
        }}
      />
    )
  }
  if (view.kind === 'details') {
    return (
      <EmployeeDetails
        key={view.id}
        token={token}
        id={view.id}
        initial={view.initial}
        version={detailsVersion}
        onBack={() => setView({ kind: 'list' })}
        onEdit={(record) => setView({ kind: 'edit', record })}
        onEditSchedule={(record, current) => setView({ kind: 'schedule', record, current })}
        onUpload={(record) => setView({ kind: 'upload', record })}
        onReplace={(record, document) => setView({ kind: 'replace', record, document })}
        onResetPassword={(record) => setView({ kind: 'reset-password', record })}
        onToast={onToast}
        onError={handleError}
        onStatusChanged={(record) => {
          changed()
          onToast(
            record.status === 'ACTIVE'
              ? `${fullName(record)} is active and can sign in again.`
              : `${fullName(record)} is deactivated and can no longer sign in.`,
            'success',
          )
        }}
      />
    )
  }
  return (
    <EmployeeList
      token={token}
      version={listVersion}
      onAdd={() => setView({ kind: 'create' })}
      onOpen={(record) => setView({ kind: 'details', id: record.id, initial: record })}
      onError={handleError}
    />
  )
}

/* ---------------------------------------------------------------- List */

function EmployeeList({
  token, version, onAdd, onOpen, onError,
}: {
  token: string
  version: number
  onAdd: () => void
  onOpen: (record: EmployeeRecord) => void
  onError: (error: ApiError) => ApiError
}) {
  const [search, setSearch] = useState('')
  const [query, setQuery] = useState('')
  const [status, setStatus] = useState<StatusFilter>('ALL')
  const [data, setData] = useState<EmployeePage | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [retry, setRetry] = useState(0)

  // Wait briefly after typing before searching.
  useEffect(() => {
    const timer = window.setTimeout(() => setQuery(search), 300)
    return () => window.clearTimeout(timer)
  }, [search])

  useEffect(() => {
    const controller = new AbortController()
    setLoading(true)
    setError(null)
    listEmployees(token, { q: query, status, page: 0 }, controller.signal).then((result) => {
      if (controller.signal.aborted) return
      setLoading(false)
      if (result.ok) setData(result.data)
      else setError(onError(result.error).message)
    })
    return () => controller.abort()
  }, [token, query, status, version, retry, onError])

  async function loadMore() {
    if (!data) return
    setLoadingMore(true)
    const result = await listEmployees(token, { q: query, status, page: data.page + 1 })
    setLoadingMore(false)
    if (result.ok) {
      setData({ ...result.data, items: [...data.items, ...result.data.items] })
    } else {
      setError(onError(result.error).message)
    }
  }

  const total = data ? data.activeCount + data.inactiveCount : 0
  const noEmployeesAtAll = data !== null && total === 0 && !query.trim()

  return (
    <>
      <TopBar
        title="Employees"
        subtitle={data ? `${data.activeCount} active, ${data.inactiveCount} inactive` : 'Loading…'}
        right={
          <Button size="sm" onClick={onAdd}>
            <Icon name="plus" className="h-4 w-4" /> Add
          </Button>
        }
      />
      <Section>
        <SearchField value={search} onChange={setSearch} placeholder="Search by name, ID, email or team" />
        <div className="mt-3">
          <Segmented
            options={[
              { id: 'ALL', label: 'All', count: data ? total : undefined },
              { id: 'ACTIVE', label: 'Active', count: data?.activeCount },
              { id: 'INACTIVE', label: 'Inactive', count: data?.inactiveCount },
            ]}
            value={status}
            onChange={setStatus}
          />
        </div>
      </Section>

      <Section
        title={data && !loading ? (query.trim() ? `Results (${data.totalItems})` : `${labelFor(status)} (${data.totalItems})`) : undefined}
        action={loading && data ? <Spinner className="h-4 w-4 text-ink-muted" /> : undefined}
      >
        {error ? (
          <div className="space-y-3" role="alert">
            <Notice tone="bad">{error}</Notice>
            <Button variant="secondary" onClick={() => setRetry((r) => r + 1)}>
              Try again
            </Button>
          </div>
        ) : loading && !data ? (
          <ListSkeleton />
        ) : noEmployeesAtAll ? (
          <div className="space-y-3">
            <EmptyState icon="users" title="No employees yet" message="Add your first employee to give them a sign-in." />
            <Button onClick={onAdd} className="w-full">
              <Icon name="plus" className="h-4 w-4" /> Add employee
            </Button>
          </div>
        ) : data && data.items.length === 0 ? (
          <EmptyState
            icon="search"
            title="No matching employees"
            message={query.trim() ? 'Check the spelling, or search by Employee ID instead.' : `No ${labelFor(status).toLowerCase()} right now.`}
          />
        ) : data ? (
          <>
            <List>
              {data.items.map((e) => (
                <ListRow
                  key={e.id}
                  leading={<Avatar name={fullName(e)} size="sm" />}
                  title={fullName(e)}
                  subtitle={<span className="tnum">{[e.employeeCode, e.jobTitle ?? e.department].filter(Boolean).join(', ')}</span>}
                  right={
                    <span className="flex items-center gap-1">
                      <StatusBadge status={e.status === 'ACTIVE' ? 'Active' : 'Inactive'} />
                      <Icon name="chevronRight" className="h-[18px] w-[18px] text-ink-muted/70" />
                    </span>
                  }
                  onClick={() => onOpen(e)}
                />
              ))}
            </List>
            {data.page + 1 < data.totalPages && (
              <Button variant="secondary" className="mt-3 w-full" onClick={loadMore} disabled={loadingMore}>
                {loadingMore ? (
                  <>
                    <Spinner /> Loading
                  </>
                ) : (
                  'Show more'
                )}
              </Button>
            )}
          </>
        ) : null}
      </Section>
    </>
  )
}

function labelFor(status: StatusFilter) {
  return status === 'ACTIVE' ? 'Active employees' : status === 'INACTIVE' ? 'Inactive employees' : 'All employees'
}

function ListSkeleton() {
  return (
    <div aria-busy="true" aria-label="Loading employees">
      <List>
        {[0, 1, 2].map((i) => (
          <div key={i} className="flex min-h-16 items-center gap-3 px-4 py-3">
            <span className="h-9 w-9 animate-pulse rounded-full bg-mist-100" />
            <span className="flex-1 space-y-2">
              <span className="block h-3 w-1/2 animate-pulse rounded bg-mist-100" />
              <span className="block h-3 w-1/3 animate-pulse rounded bg-mist-50" />
            </span>
          </div>
        ))}
      </List>
    </div>
  )
}

/* ---------------------------------------------------------------- Details */

function EmployeeDetails({
  token, id, initial, version, onBack, onEdit, onEditSchedule, onUpload, onReplace, onResetPassword, onToast, onError,
  onStatusChanged,
}: {
  token: string
  id: number
  initial?: EmployeeRecord
  version: number
  onBack: () => void
  onEdit: (record: EmployeeRecord) => void
  onEditSchedule: (record: EmployeeRecord, current: ScheduleView) => void
  onUpload: (record: EmployeeRecord) => void
  onResetPassword: (record: EmployeeRecord) => void
  onReplace: (record: EmployeeRecord, document: DocumentRecord) => void
  onToast: (text: string, tone?: 'info' | 'success' | 'error') => void
  onError: (error: ApiError) => ApiError
  onStatusChanged: (record: EmployeeRecord) => void
}) {
  const [record, setRecord] = useState<EmployeeRecord | null>(initial ?? null)
  const [loading, setLoading] = useState(!initial)
  const [error, setError] = useState<string | null>(null)
  const [confirming, setConfirming] = useState(false)
  const [saving, setSaving] = useState(false)
  const [actionError, setActionError] = useState<string | null>(null)
  const [retry, setRetry] = useState(0)
  // Goes up after a Comp-Off change in Leave balance, so the Comp-Off history reloads.
  const [compOffVersion, setCompOffVersion] = useState(0)

  // Always refresh from the server, so the screen shows the latest saved data.
  useEffect(() => {
    const controller = new AbortController()
    if (!initial) setLoading(true)
    setError(null)
    getEmployee(token, id, controller.signal).then((result) => {
      if (controller.signal.aborted) return
      setLoading(false)
      if (result.ok) setRecord(result.data)
      else setError(onError(result.error).message)
    })
    return () => controller.abort()
  }, [token, id, initial, onError, retry])

  async function changeStatus(active: boolean) {
    if (!record) return
    setSaving(true)
    setActionError(null)
    const result = await setEmployeeActive(token, record.id, active)
    setSaving(false)
    setConfirming(false)
    if (result.ok) {
      setRecord(result.data)
      onStatusChanged(result.data)
    } else {
      setActionError(onError(result.error).message)
    }
  }

  const title = record ? fullName(record) : 'Employee'
  const active = record?.status === 'ACTIVE'

  return (
    <>
      <TopBar title={title} subtitle={record?.employeeCode} onBack={onBack} />
      {loading && !record ? (
        <Section>
          <Card className="flex items-center justify-center gap-2 px-4 py-10 text-[14px] text-ink-muted" >
            <Spinner /> Loading employee
          </Card>
        </Section>
      ) : error && !record ? (
        <Section>
          <div className="space-y-3" role="alert">
            <Notice tone="bad">{error}</Notice>
            <Button variant="secondary" onClick={() => setRetry((r) => r + 1)}>
              Try again
            </Button>
          </div>
        </Section>
      ) : record ? (
        <>
          <Section>
            <Card className="flex items-center gap-4 px-4 py-5">
              <EmployeePhotoEditor token={token} employeeId={record.id} name={fullName(record)} onToast={onToast} onError={onError} />
              <div className="min-w-0">
                <p className="truncate text-[18px] font-semibold text-ink">{fullName(record)}</p>
                <p className="truncate text-[14px] text-ink-muted">{record.jobTitle ?? 'No job title yet'}</p>
                <p className="tnum mt-1.5 flex items-center gap-2">
                  <Tag>{record.employeeCode}</Tag>
                  <StatusBadge status={active ? 'Active' : 'Inactive'} />
                </p>
              </div>
            </Card>
          </Section>
          <Section title="Work">
            <Card className="divide-y divide-line">
              <DetailRow icon="briefcase" label="Department" value={record.department ?? ''} />
              <DetailRow icon="user" label="Job title" value={record.jobTitle ?? ''} />
              <DetailRow icon="calendar" label="Joined" value={record.joiningDate ? formatDate(record.joiningDate) : ''} />
            </Card>
          </Section>
          <Section title="Contact and sign-in">
            <Card className="divide-y divide-line">
              <DetailRow icon="mail" label="Email" value={record.email} />
              <DetailRow icon="phone" label="Phone" value={record.phone ?? ''} />
              <DetailRow icon="lock" label="Signs in with" value={record.employeeCode} />
            </Card>
            {active && (
              <div className="mt-3">
                <List>
                  <ListRow
                    icon="shield"
                    title="Reset forgotten password"
                    subtitle="Set a temporary password they must change"
                    onClick={() => onResetPassword(record)}
                  />
                </List>
              </div>
            )}
          </Section>

          <ScheduleSection
            token={token}
            employeeId={record.id}
            version={version}
            onEdit={(current) => onEditSchedule(record, current)}
            onError={onError}
          />

          <LeaveBalanceSection
            token={token}
            employeeId={record.id}
            onError={onError}
            onToast={onToast}
            onCompOffChanged={() => setCompOffVersion((v) => v + 1)}
          />

          <CompOffSection token={token} employeeId={record.id} version={compOffVersion} onError={onError} />

          <EmployeeDocumentsSection
            token={token}
            employeeId={record.id}
            version={version}
            onUpload={() => onUpload(record)}
            onReplace={(doc) => onReplace(record, doc)}
            onError={onError}
            onToast={onToast}
          />

          <Section>
            {actionError && (
              <div className="mb-3" role="alert">
                <Notice tone="bad">{actionError}</Notice>
              </div>
            )}
            {confirming ? (
              <Card className="p-4" >
                <p className="text-[15px] font-semibold text-ink">
                  {active ? `Deactivate ${fullName(record)}?` : `Activate ${fullName(record)}?`}
                </p>
                <p className="mt-1 text-[13px] leading-relaxed text-ink-muted">
                  {active
                    ? 'They will be signed out and can’t sign in until you activate them again. Their records are kept.'
                    : `They will be able to sign in again with ${record.employeeCode} and their existing password.`}
                </p>
                <div className="mt-4 grid grid-cols-2 gap-2">
                  <Button variant="secondary" size="sm" onClick={() => setConfirming(false)} disabled={saving}>
                    Cancel
                  </Button>
                  <Button variant={active ? 'danger' : 'primary'} size="sm" onClick={() => changeStatus(!active)} disabled={saving}>
                    {saving ? <Spinner /> : null}
                    {active ? 'Deactivate' : 'Activate'}
                  </Button>
                </div>
              </Card>
            ) : (
              <div className="grid grid-cols-2 gap-2">
                <Button variant="secondary" onClick={() => onEdit(record)}>
                  Edit details
                </Button>
                {active ? (
                  <Button variant="danger" onClick={() => setConfirming(true)}>
                    Deactivate
                  </Button>
                ) : (
                  <Button onClick={() => setConfirming(true)}>Activate</Button>
                )}
              </div>
            )}
          </Section>
        </>
      ) : null}
    </>
  )
}

/* ---------------------------------------------------------------- Form */

function EmployeeForm({
  mode, employeeCode, initial, onCancel, onSubmit, onError, onSaved,
}: {
  mode: 'create' | 'edit'
  employeeCode?: string
  initial: EmployeeFormValues
  onCancel: () => void
  onSubmit: (values: EmployeeFormValues) => ReturnType<typeof createEmployee>
  onError: (error: ApiError) => ApiError
  onSaved: (record: EmployeeRecord) => void
}) {
  const [values, setValues] = useState<EmployeeFormValues>(initial)
  const [errors, setErrors] = useState<FormErrors>({})
  const [formError, setFormError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [showPassword, setShowPassword] = useState(false)
  const topRef = useRef<HTMLDivElement | null>(null)

  const set = (field: keyof EmployeeFormValues) => (value: string) => {
    setValues((v) => ({ ...v, [field]: value }))
    if (errors[field]) setErrors((e) => ({ ...e, [field]: undefined }))
  }

  async function submit() {
    if (saving) return
    setFormError(null)
    const found = validateEmployeeForm(values, mode)
    setErrors(found)
    if (Object.keys(found).length > 0) {
      setFormError('Check the highlighted fields.')
      topRef.current?.scrollIntoView({ block: 'start' })
      return
    }
    setSaving(true)
    const result = await onSubmit(values)
    setSaving(false)
    if (result.ok) {
      onSaved(result.data)
      return
    }
    const error = onError(result.error)
    const fieldErrors: FormErrors = {}
    for (const [key, message] of Object.entries(error.fields)) {
      if (key in values) fieldErrors[key as keyof EmployeeFormValues] = message
    }
    setErrors(fieldErrors)
    setFormError(Object.keys(fieldErrors).length ? 'Check the highlighted fields.' : error.message)
    topRef.current?.scrollIntoView({ block: 'start' })
  }

  return (
    <>
      <div ref={topRef} />
      <TopBar
        title={mode === 'create' ? 'Add employee' : 'Edit employee'}
        subtitle={mode === 'edit' ? employeeCode : 'Creates their record and sign-in'}
        onBack={onCancel}
      />
      <form
        noValidate
        onSubmit={(e) => {
          e.preventDefault()
          submit()
        }}
      >
        {formError && (
          <Section>
            <div role="alert">
              <Notice tone="bad">{formError}</Notice>
            </div>
          </Section>
        )}

        <Section title="Employee ID">
          {mode === 'create' ? (
            <Field
              label="Employee ID (optional)"
              value={values.employeeCode}
              onChange={set('employeeCode')}
              error={errors.employeeCode}
              placeholder="Leave blank to create one"
              hint="Leave blank to get the next ID automatically (EMP001, EMP002…). It can’t be changed later."
              autoCapitalize="characters"
              maxLength={30}
            />
          ) : (
            <Card className="flex items-center justify-between px-4 py-3">
              <span className="text-[14px] text-ink-muted">Employee ID</span>
              <Tag>{employeeCode}</Tag>
            </Card>
          )}
        </Section>

        <Section title="Name">
          <Card className="space-y-4 p-4">
            <Field label="First name" value={values.firstName} onChange={set('firstName')} error={errors.firstName} autoComplete="off" maxLength={100} />
            <Field label="Last name" value={values.lastName} onChange={set('lastName')} error={errors.lastName} autoComplete="off" maxLength={100} />
          </Card>
        </Section>

        <Section title="Contact">
          <Card className="space-y-4 p-4">
            <Field label="Work email" type="email" inputMode="email" value={values.email} onChange={set('email')} error={errors.email} placeholder="name@rightsku.com" autoCapitalize="none" maxLength={254} />
            <Field label="Phone (optional)" type="tel" inputMode="tel" value={values.phone} onChange={set('phone')} error={errors.phone} placeholder="+91 90000 00000" maxLength={30} />
          </Card>
        </Section>

        <Section title="Work">
          <Card className="space-y-4 p-4">
            <Field label="Department (optional)" value={values.department} onChange={set('department')} error={errors.department} maxLength={100} />
            <Field label="Job title (optional)" value={values.jobTitle} onChange={set('jobTitle')} error={errors.jobTitle} maxLength={100} />
            <Field label="Joining date (optional)" type="date" value={values.joiningDate} onChange={set('joiningDate')} error={errors.joiningDate} />
          </Card>
        </Section>

        {mode === 'create' && (
          <Section title="Sign-in">
            <Card className="p-4">
              <Field
                label="Temporary password"
                type={showPassword ? 'text' : 'password'}
                value={values.initialPassword}
                onChange={set('initialPassword')}
                error={errors.initialPassword}
                autoComplete="new-password"
                hint={`At least ${MIN_PASSWORD_LENGTH} characters. Give it to the employee privately. It is stored only as a secure hash.`}
                trailing={
                  <button
                    type="button"
                    onClick={() => setShowPassword((s) => !s)}
                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                    className="absolute inset-y-0 right-0 grid w-12 place-items-center text-ink-muted"
                  >
                    <Icon name={showPassword ? 'eyeOff' : 'eye'} className="h-[18px] w-[18px]" />
                  </button>
                }
              />
            </Card>
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
                  <Spinner /> Saving
                </>
              ) : mode === 'create' ? (
                'Add employee'
              ) : (
                'Save changes'
              )}
            </Button>
          </div>
        </Section>
      </form>
    </>
  )
}

function Field({
  label, value, onChange, error, hint, trailing, type = 'text', ...rest
}: {
  label: string
  value: string
  onChange: (value: string) => void
  error?: string
  hint?: string
  trailing?: ReactNode
  type?: string
  placeholder?: string
  autoComplete?: string
  autoCapitalize?: string
  inputMode?: 'text' | 'email' | 'tel'
  maxLength?: number
}) {
  const id = `field-${label.replace(/\W+/g, '-').toLowerCase()}`
  return (
    <label className="block" htmlFor={id}>
      <span className="text-[13px] font-medium text-ink-soft">{label}</span>
      <div className="relative mt-1.5">
        <input
          id={id}
          type={type}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          aria-invalid={!!error}
          aria-describedby={error ? `${id}-error` : hint ? `${id}-hint` : undefined}
          className={`h-12 w-full rounded-xl border bg-white px-4 text-[15px] text-ink outline-none placeholder:text-ink-muted/70 focus:border-mist-500 focus:ring-4 focus:ring-mist-100 ${
            error ? 'border-bad/50' : 'border-line-strong'
          } ${trailing ? 'pr-12' : ''}`}
          {...rest}
        />
        {trailing}
      </div>
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
