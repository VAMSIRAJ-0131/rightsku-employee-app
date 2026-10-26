// HR: upload a new document for an employee, or replace a document's file
// with a corrected one. The server checks everything again (file type from
// the content, size, duplicates, HR permission).
import { useEffect, useState, type FormEvent, type ReactNode } from 'react'
import { Icon } from '../../components/Icons'
import Dropdown from '../../components/Dropdown'
import { MONTH_NAMES } from '../../lib/payslips'
import { Avatar, Button, Card, List, ListRow, Notice, SearchField, Section, Spinner, Tag, TopBar } from '../../components/ui'
import type { ApiError } from '../../lib/api'
import {
  DOCUMENT_ACCEPT, DOCUMENT_TYPES, calendarYears, checkFile, financialYears, formatSize, periodKind, updateDocument, uploadDocument,
  validateUpload, type ApiDocumentType, type DocumentRecord, type UploadFormErrors, type UploadFormValues,
} from '../../lib/documents'
import { fullName, listEmployees, type EmployeeRecord } from '../../lib/employees'
import { toIsoDate } from '../../lib/format'

export interface PickedEmployee {
  id: number
  name: string
  code: string
}

type Props =
  | {
      mode: 'upload'
      token: string
      /** Fixed employee (from their details page). Without it, HR picks one first. */
      employee?: PickedEmployee
      initialType?: ApiDocumentType
      onCancel: () => void
      onSaved: (record: DocumentRecord) => void
      onError: (error: ApiError) => ApiError
    }
  | {
      mode: 'replace'
      token: string
      document: DocumentRecord
      onCancel: () => void
      onSaved: (record: DocumentRecord) => void
      onError: (error: ApiError) => ApiError
    }

function lastMonth(): string {
  const d = new Date()
  d.setDate(1)
  d.setMonth(d.getMonth() - 1)
  return toIsoDate(d).slice(0, 7)
}

export default function DocumentUploadForm(props: Props) {
  const { token, onCancel, onSaved, onError } = props
  const replacing = props.mode === 'replace'
  const [employee, setEmployee] = useState<PickedEmployee | null>(
    props.mode === 'upload' ? props.employee ?? null : null,
  )
  const initialType: ApiDocumentType | '' = props.mode === 'upload' ? props.initialType ?? '' : props.document.type
  const [values, setValues] = useState<UploadFormValues>({
    type: initialType,
    period: initialType === 'PAYSLIP' ? lastMonth() : initialType === 'FORM_16' ? financialYears()[1]
      : initialType === 'COMPENSATION_LETTER' ? calendarYears()[0] : '',
    title: '',
    file: null,
  })
  const [errors, setErrors] = useState<UploadFormErrors & { employee?: string }>({})
  const [formError, setFormError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  // Forms open at the top, even when the previous screen was scrolled down.
  useEffect(() => {
    window.scrollTo({ top: 0 })
  }, [])

  function chooseType(type: ApiDocumentType) {
    const kind = periodKind(type)
    setValues((v) => ({
      ...v, type,
      period: kind === 'month' ? lastMonth() : kind === 'year' ? financialYears()[1] : kind === 'calendarYear' ? calendarYears()[0] : '',
    }))
    setErrors((e) => ({ ...e, type: undefined, period: undefined }))
  }

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (saving) return
    setFormError(null)
    let found: UploadFormErrors & { employee?: string }
    if (replacing) {
      found = {}
      if (!values.file && !values.title.trim()) found.file = 'Choose the corrected file (or change the title).'
      else if (values.file) {
        const fileError = checkFile(values.file)
        if (fileError) found.file = fileError
      }
      if (values.title.trim().length > 150) found.title = 'Use at most 150 characters.'
    } else {
      found = validateUpload(values)
      if (!employee) found.employee = 'Choose the employee.'
    }
    setErrors(found)
    if (Object.keys(found).length) return

    setSaving(true)
    const result =
      props.mode === 'replace'
        ? await updateDocument(token, props.document.id, { title: values.title, file: values.file })
        : await uploadDocument(token, employee!.id, values)
    setSaving(false)
    if (result.ok) {
      onSaved(result.data)
      return
    }
    const error = onError(result.error)
    const fieldErrors: UploadFormErrors = {}
    for (const key of ['type', 'period', 'title', 'file'] as const) {
      if (error.fields[key]) fieldErrors[key] = error.fields[key]
    }
    setErrors(fieldErrors)
    setFormError(Object.keys(fieldErrors).length ? null : error.message)
  }

  const kind = values.type ? periodKind(values.type) : 'none'
  const title = replacing ? 'Replace document' : 'Upload document'
  const subtitle = replacing
    ? `${props.document.employeeName}, ${props.document.title}`
    : employee
      ? `${employee.name}, ${employee.code}`
      : 'Choose the employee and document'

  return (
    <>
      <TopBar title={title} subtitle={subtitle} onBack={onCancel} />
      <form noValidate onSubmit={submit}>
        {formError && (
          <Section>
            <div role="alert">
              <Notice tone="bad">{formError}</Notice>
            </div>
          </Section>
        )}

        {!replacing && (
          <Section title="Employee">
            {employee ? (
              <Card className="flex items-center gap-3 px-4 py-3">
                <Avatar name={employee.name} size="sm" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[15px] font-medium text-ink">{employee.name}</p>
                  <p className="tnum text-[13px] text-ink-muted">{employee.code}</p>
                </div>
                {props.mode === 'upload' && !props.employee && (
                  <Button size="sm" variant="ghost" onClick={() => setEmployee(null)}>
                    Change
                  </Button>
                )}
              </Card>
            ) : (
              <EmployeePicker token={token} onPick={setEmployee} onError={onError} error={errors.employee} />
            )}
          </Section>
        )}

        {replacing ? (
          <Section title="Current file">
            <Card className="flex items-center gap-3 px-4 py-3">
              <Icon name="file" className="h-5 w-5 text-mist-500" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-[14px] font-medium text-ink">{props.document.fileName}</p>
                <p className="tnum text-[12px] text-ink-muted">
                  {formatSize(props.document.sizeBytes)}, version {props.document.version}
                </p>
              </div>
              <Tag>{props.document.typeLabel}</Tag>
            </Card>
            <p className="mt-2 px-1 text-[12px] text-ink-muted">
              The employee will see the corrected file in place of this one. Type and period stay the same.
            </p>
          </Section>
        ) : (
          <Section title="Document">
            <Card className="space-y-4 p-4">
              <fieldset>
                <legend className="text-[13px] font-medium text-ink-soft">Type</legend>
                <div className="mt-1.5 grid grid-cols-2 gap-2">
                  {DOCUMENT_TYPES.map((t) => (
                    <button
                      key={t.type}
                      type="button"
                      aria-pressed={values.type === t.type}
                      onClick={() => chooseType(t.type)}
                      className={`press min-h-11 rounded-xl px-3 py-2 text-left text-[14px] font-medium transition-transform duration-150 ${
                        values.type === t.type ? 'gloss-navy text-white' : 'gloss-light border border-line-strong text-ink'
                      }`}
                    >
                      {t.label}
                    </button>
                  ))}
                </div>
                {errors.type && <FieldError>{errors.type}</FieldError>}
              </fieldset>

              {kind === 'month' && (
                <div id="doc-period">
                  <div className="grid grid-cols-2 gap-3">
                    <Dropdown
                      label="Payslip month"
                      value={Number(values.period.slice(5, 7)) || 1}
                      onChange={(m) => setValues((v) => ({ ...v, period: `${v.period.slice(0, 4)}-${String(m).padStart(2, '0')}` }))}
                      options={uploadMonths(Number(values.period.slice(0, 4))).map((m) => ({ value: m, label: MONTH_NAMES[m - 1] }))}
                    />
                    <Dropdown
                      label="Year"
                      value={Number(values.period.slice(0, 4)) || new Date().getFullYear()}
                      onChange={(y) => setValues((v) => ({ ...v, period: monthInYear(y, Number(v.period.slice(5, 7)) || 1) }))}
                      options={calendarYears().map((y) => ({ value: Number(y), label: y }))}
                    />
                  </div>
                  {errors.period && <FieldError>{errors.period}</FieldError>}
                </div>
              )}
              {kind === 'year' && (
                <div id="doc-period">
                  <Dropdown
                    label="Financial year"
                    value={values.period}
                    onChange={(period) => setValues((v) => ({ ...v, period }))}
                    options={financialYears().map((fy) => ({ value: fy, label: `FY ${fy}` }))}
                  />
                  {errors.period && <FieldError>{errors.period}</FieldError>}
                </div>
              )}
              {kind === 'calendarYear' && (
                <div id="doc-period">
                  <Dropdown
                    label="Year of the appraisal"
                    value={values.period}
                    onChange={(period) => setValues((v) => ({ ...v, period }))}
                    options={calendarYears().map((y) => ({ value: y, label: y }))}
                  />
                  {errors.period && <FieldError>{errors.period}</FieldError>}
                </div>
              )}
            </Card>
          </Section>
        )}

        <Section title={replacing ? 'Corrected file' : 'File'}>
          <Card className="space-y-4 p-4">
            <div>
              <input
                id="doc-file"
                type="file"
                accept={DOCUMENT_ACCEPT}
                className="sr-only"
                onChange={(e) => {
                  const file = e.target.files?.[0] ?? null
                  setValues((v) => ({ ...v, file }))
                  setErrors((er) => ({ ...er, file: file ? checkFile(file) : undefined }))
                }}
              />
              <label
                htmlFor="doc-file"
                className={`flex min-h-14 cursor-pointer items-center gap-3 rounded-xl border border-dashed px-4 py-3 hover:bg-mist-50 ${
                  errors.file ? 'border-bad/60' : 'border-line-strong'
                }`}
              >
                <Icon name="upload" className="h-5 w-5 shrink-0 text-navy-700" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[14px] font-medium text-ink">
                    {values.file ? values.file.name : 'Choose a file'}
                  </span>
                  <span className="block text-[12px] text-ink-muted">
                    {values.file ? formatSize(values.file.size) : 'PDF, PNG or JPG, up to 10 MB'}
                  </span>
                </span>
              </label>
              {errors.file && <FieldError>{errors.file}</FieldError>}
            </div>
            <Labeled label={replacing ? 'New title (optional)' : 'Title (optional)'} htmlFor="doc-title" error={errors.title}>
              <input
                id="doc-title"
                type="text"
                maxLength={150}
                value={values.title}
                placeholder={replacing ? props.document.title : 'Leave blank for a standard title'}
                onChange={(e) => setValues((v) => ({ ...v, title: e.target.value }))}
                className={inputClass(!!errors.title)}
              />
            </Labeled>
          </Card>
          <p className="mt-2 px-1 text-[12px] leading-relaxed text-ink-muted">
            Only this employee and HR can download it.
          </p>
        </Section>

        <Section>
          <div className="grid grid-cols-2 gap-2">
            <Button variant="secondary" onClick={onCancel} disabled={saving}>
              Cancel
            </Button>
            <Button type="submit" disabled={saving}>
              {saving ? (
                <>
                  <Spinner /> Uploading
                </>
              ) : replacing ? (
                'Replace'
              ) : (
                'Upload'
              )}
            </Button>
          </div>
        </Section>
      </form>
    </>
  )
}

function EmployeePicker({
  token, onPick, onError, error,
}: {
  token: string
  onPick: (e: PickedEmployee) => void
  onError: (error: ApiError) => ApiError
  error?: string
}) {
  const [search, setSearch] = useState('')
  const [items, setItems] = useState<EmployeeRecord[] | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)

  useEffect(() => {
    const controller = new AbortController()
    const timer = globalThis.setTimeout(() => {
      // Inactive employees are included: experience letters are issued on exit.
      listEmployees(token, { q: search, status: 'ALL', size: 8 }, controller.signal).then((result) => {
        if (controller.signal.aborted) return
        if (result.ok) {
          setItems(result.data.items)
          setLoadError(null)
        } else setLoadError(onError(result.error).message)
      })
    }, 250)
    return () => {
      globalThis.clearTimeout(timer)
      controller.abort()
    }
  }, [token, search, onError])

  return (
    <div className="space-y-2">
      <SearchField value={search} onChange={setSearch} placeholder="Search by name or Employee ID" />
      {loadError ? (
        <Notice tone="bad">{loadError}</Notice>
      ) : items === null ? (
        <Card className="flex items-center justify-center gap-2 px-4 py-6 text-[14px] text-ink-muted">
          <Spinner /> Loading employees
        </Card>
      ) : items.length === 0 ? (
        <Card className="px-4 py-6 text-center text-[14px] text-ink-muted">No matching employees.</Card>
      ) : (
        <List>
          {items.map((e) => (
            <ListRow
              key={e.id}
              leading={<Avatar name={fullName(e)} size="sm" />}
              title={fullName(e)}
              subtitle={<span className="tnum">{e.employeeCode}{e.status !== 'ACTIVE' ? ', inactive' : ''}</span>}
              onClick={() => onPick({ id: e.id, name: fullName(e), code: e.employeeCode })}
            />
          ))}
        </List>
      )}
      {error && <FieldError>{error}</FieldError>}
    </div>
  )
}

function inputClass(invalid: boolean) {
  return `mt-1.5 h-12 w-full rounded-xl border bg-white px-4 text-[15px] text-ink outline-none focus:border-mist-500 focus:ring-4 focus:ring-mist-100 ${
    invalid ? 'border-bad/50' : 'border-line-strong'
  }`
}

function Labeled({ label, htmlFor, error, children }: { label: string; htmlFor: string; error?: string; children: ReactNode }) {
  return (
    <div>
      <label htmlFor={htmlFor} className="text-[13px] font-medium text-ink-soft">
        {label}
      </label>
      {children}
      {error && <FieldError>{error}</FieldError>}
    </div>
  )
}

function FieldError({ children }: { children: ReactNode }) {
  return (
    <span className="mt-1.5 block text-[12px] text-bad" role="alert">
      {children}
    </span>
  )
}

/** Months that can be chosen for a payslip in a year: none after this month. */
function uploadMonths(year: number): number[] {
  const now = new Date()
  const last = year === now.getFullYear() ? now.getMonth() + 1 : 12
  return Array.from({ length: last }, (_, i) => i + 1)
}

/** "2026-03"; a month after this month (when the year changes) becomes this month. */
function monthInYear(year: number, month: number): string {
  const allowed = uploadMonths(year)
  const m = Math.min(month, allowed[allowed.length - 1])
  return `${year}-${String(m).padStart(2, '0')}`
}
