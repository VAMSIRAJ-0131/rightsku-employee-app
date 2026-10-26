// HR: employees' requests to update their personal details. Each card shows
// every asked-for detail, old value → new value; Approve saves them (the
// server checks them again), Reject needs a short reason for the employee.
import { useEffect, useState } from 'react'
import { Icon } from '../../components/Icons'
import { Button, Card, EmptyState, Notice, Section, Spinner, TopBar } from '../../components/ui'
import type { ApiError } from '../../lib/api'
import { REVIEW_STATUSES, statusLabel, type Decision, type ReviewStatus } from '../../lib/approvalView'
import { formatShortDate } from '../../lib/format'
import { decideProfileChange, listProfileChanges, type ProfileChangeRecord } from '../../lib/profileChanges'
import { CardHeader, DecidedLine, DecisionButtons, DecisionSheet } from './ApprovalsScreen'

export default function ProfileChangesScreen({
  token, onBack, onChanged, onError, onToast,
}: {
  token: string
  onBack: () => void
  /** A decision was saved (HR home reloads its count). */
  onChanged: () => void
  onError: (error: ApiError) => ApiError
  onToast: (message: string, tone?: 'success' | 'error') => void
}) {
  const [status, setStatus] = useState<ReviewStatus>('PENDING')
  const [rows, setRows] = useState<ProfileChangeRecord[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [version, setVersion] = useState(0)
  const [pending, setPending] = useState<{ request: ProfileChangeRecord; decision: Decision } | null>(null)
  const [saving, setSaving] = useState(false)
  const [sheetError, setSheetError] = useState<string | null>(null)

  useEffect(() => {
    const controller = new AbortController()
    setRows(null)
    setError(null)
    listProfileChanges(token, status, controller.signal).then((r) => {
      if (controller.signal.aborted) return
      if (r.ok) setRows(r.data)
      else setError(onError(r.error).message)
    })
    return () => controller.abort()
  }, [token, status, version, onError])

  async function confirm(reason: string) {
    if (!pending || saving) return
    setSaving(true)
    setSheetError(null)
    const result = await decideProfileChange(token, pending.request.id, pending.decision, reason)
    setSaving(false)
    if (result.ok) {
      onToast(`${pending.request.employeeName ?? 'Request'}: ${pending.decision === 'approve' ? 'approved and saved' : 'rejected'}.`, 'success')
      setPending(null)
      setVersion((v) => v + 1)
      onChanged()
    } else {
      const e = onError(result.error)
      setSheetError(e.message)
      if (e.kind === 'conflict') setVersion((v) => v + 1)
    }
  }

  return (
    <>
      <TopBar title="Profile update requests" subtitle="Contact, emergency contact and bank details" onBack={onBack} />
      <Section>
        <div className="flex w-full rounded-xl border border-line bg-white p-0.5" role="group" aria-label="Status">
          {REVIEW_STATUSES.map((s) => (
            <button
              key={s}
              type="button"
              aria-pressed={status === s}
              onClick={() => setStatus(s)}
              className={`press h-9 flex-1 rounded-lg px-2.5 text-[13px] font-medium transition-transform duration-150 ${
                status === s ? 'gloss-navy text-white' : 'text-ink-soft hover:bg-mist-50'
              }`}
            >
              {statusLabel(s)}
            </button>
          ))}
        </div>
      </Section>

      <Section>
        {error ? (
          <div role="alert" className="space-y-3">
            <Notice tone="bad">{error}</Notice>
            <Button variant="secondary" size="sm" onClick={() => setVersion((v) => v + 1)}>Try again</Button>
          </div>
        ) : rows === null ? (
          <Card className="flex items-center justify-center gap-2 px-4 py-8 text-[14px] text-ink-muted"><Spinner /> Loading</Card>
        ) : rows.length === 0 ? (
          status === 'PENDING'
            ? <EmptyState icon="checkCircle" title="Nothing to review" message="When an employee asks to update their details, it appears here." />
            : <EmptyState icon="list" title={`No ${statusLabel(status).toLowerCase()} requests`} message="Decided requests appear here." />
        ) : (
          <div className="space-y-2.5">
            {rows.map((r) => (
              <Card key={r.id} className="p-4">
                <CardHeader name={r.employeeName} code={r.employeeCode} status={r.status} />
                <p className="mt-2 text-[12px] text-ink-muted">Asked on {formatShortDate(r.createdAt.slice(0, 10))}</p>
                <ul className="mt-2 divide-y divide-line rounded-xl bg-mist-50/70 ring-1 ring-inset ring-mist-100">
                  {r.items.map((i) => (
                    <li key={i.key} className="px-3 py-2.5">
                      <p className="text-[12px] font-semibold uppercase tracking-wide text-ink-muted">{i.label}</p>
                      <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[14px]">
                        <span className={`text-ink-muted [overflow-wrap:anywhere] ${i.previous ? 'line-through decoration-ink-muted/50' : 'italic'}`}>{i.previous || 'Not set'}</span>
                        <Icon name="chevronRight" className="h-4 w-4 shrink-0 text-ink-muted" />
                        <span className="font-semibold text-ink [overflow-wrap:anywhere]">{i.requested || 'Removed'}</span>
                      </p>
                    </li>
                  ))}
                </ul>
                {r.status === 'PENDING' ? (
                  <DecisionButtons label={`${r.employeeName ?? ''} profile update`} onDecide={(decision) => {
                    setSheetError(null)
                    setPending({ request: r, decision })
                  }} />
                ) : (
                  <DecidedLine status={r.status} at={r.reviewedAt} note={r.reviewNote} />
                )}
              </Card>
            ))}
          </div>
        )}
      </Section>

      {pending && (
        <DecisionSheet
          decision={pending.decision}
          question={`${pending.decision === 'approve' ? 'Approve and save' : 'Reject'} ${pending.request.employeeName ?? 'this employee'}’s update (${pending.request.items.map((i) => i.label).join(', ')})?`}
          saving={saving}
          error={sheetError}
          onCancel={() => !saving && setPending(null)}
          onConfirm={confirm}
        />
      )}
    </>
  )
}
