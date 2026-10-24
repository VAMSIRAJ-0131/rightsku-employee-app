// HR approvals: Timesheets and Leave tabs, a status filter, employee search,
// compact cards, and a confirmation sheet for every decision (a reason is
// required to reject). Everything comes from the server; after each
// decision the list and all counts are loaded again.
import { useEffect, useMemo, useRef, useState } from 'react'
import { Icon } from '../../components/Icons'
import { Avatar, Button, Card, EmptyState, Notice, Section, Segmented, Spinner, StatusBadge, TopBar, useBackHandler } from '../../components/ui'
import type { ApiError } from '../../lib/api'
import { formatShortDate, plural } from '../../lib/format'
import {
  listTimesheetWeeks, reviewTimesheetWeek, weekKey, type ApprovalSummary, type HrTimesheetWeek,
} from '../../lib/approvals'
import {
  days as dayCount, decideLeave, getLeaveBalances, listLeaveRequests, type LeaveBalanceRecord, type LeaveRequestRecord,
} from '../../lib/leave'
import {
  REVIEW_STATUSES, decisionQuestion, matchesSearch, rangeLabel, rejectReasonProblem, statusLabel,
  type Decision, type ReviewStatus,
} from '../../lib/approvalView'

export type ApprovalView = 'timesheets' | 'leaves'

/** What the confirmation sheet is about to decide. */
type Pending =
  | { kind: 'week'; week: HrTimesheetWeek; decision: Decision }
  | { kind: 'leave'; request: LeaveRequestRecord; decision: Decision }

export default function ApprovalsScreen({
  token, view, onViewChange, summary, onChanged, onError, onToast,
}: {
  token: string
  view: ApprovalView
  onViewChange: (view: ApprovalView) => void
  /** Counts from the server (owned by HrApp, reloaded through onChanged). */
  summary: ApprovalSummary
  /** A decision was saved: reload counts (and the home screen lists). */
  onChanged: () => void
  onError: (error: ApiError) => ApiError
  onToast: (message: string, tone?: 'success' | 'error') => void
}) {
  const [status, setStatus] = useState<ReviewStatus>('PENDING')
  const [search, setSearch] = useState('')
  const [weeks, setWeeks] = useState<HrTimesheetWeek[] | null>(null)
  const [leaves, setLeaves] = useState<LeaveRequestRecord[] | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [version, setVersion] = useState(0)
  const [balances, setBalances] = useState<Record<number, LeaveBalanceRecord[]>>({})
  const [pending, setPending] = useState<Pending | null>(null)
  const [saving, setSaving] = useState(false)
  const [sheetError, setSheetError] = useState<string | null>(null)

  const isTs = view === 'timesheets'
  const counts = isTs ? summary.timesheets : summary.leave
  const pendingTotal = summary.timesheets.pending + summary.leave.pending

  // The list for the open tab and status, from the server.
  useEffect(() => {
    const controller = new AbortController()
    setLoadError(null)
    if (isTs) {
      setWeeks(null)
      listTimesheetWeeks(token, status, controller.signal).then((r) => {
        if (controller.signal.aborted) return
        if (r.ok) setWeeks(r.data)
        else setLoadError(onError(r.error).message)
      })
    } else {
      setLeaves(null)
      listLeaveRequests(token, status, controller.signal).then((r) => {
        if (controller.signal.aborted) return
        if (r.ok) setLeaves(r.data)
        else setLoadError(onError(r.error).message)
      })
    }
    return () => controller.abort()
  }, [token, isTs, status, version, onError])

  // Available balance for the employees with pending leave (one request per employee).
  useEffect(() => {
    if (isTs || status !== 'PENDING' || !leaves) return
    const controller = new AbortController()
    const ids = [...new Set(leaves.map((l) => l.employeeId))]
    for (const id of ids) {
      getLeaveBalances(token, id, controller.signal).then((r) => {
        if (!controller.signal.aborted && r.ok) setBalances((b) => ({ ...b, [id]: r.data }))
      })
    }
    return () => controller.abort()
  }, [token, isTs, status, leaves])

  const shownWeeks = useMemo(() => (weeks ?? []).filter((w) => matchesSearch(search, w.employeeName, w.employeeCode)), [weeks, search])
  const shownLeaves = useMemo(() => (leaves ?? []).filter((l) => matchesSearch(search, l.employeeName, l.employeeCode)), [leaves, search])
  const loading = isTs ? weeks === null : leaves === null
  const shownCount = isTs ? shownWeeks.length : shownLeaves.length
  const loadedCount = isTs ? (weeks ?? []).length : (leaves ?? []).length

  function reload() {
    setVersion((v) => v + 1)
    onChanged()
  }

  async function confirm(reason: string) {
    if (!pending || saving) return
    setSaving(true)
    setSheetError(null)
    const result = pending.kind === 'week'
      ? await reviewTimesheetWeek(token, pending.week, pending.decision === 'approve' ? 'APPROVE' : 'REJECT', reason)
      : await decideLeave(token, pending.request.id, pending.decision, reason)
    setSaving(false)
    if (result.ok) {
      const who = pending.kind === 'week' ? pending.week.employeeName : pending.request.employeeName
      onToast(`${who ?? 'Request'}: ${pending.decision === 'approve' ? 'approved' : 'rejected'}.`, 'success')
      setPending(null)
      reload()
    } else {
      const error = onError(result.error)
      setSheetError(error.message)
      // Someone else decided it meanwhile: show the latest lists and counts.
      if (error.kind === 'conflict') reload()
    }
  }

  return (
    <>
      <TopBar title="Approvals" subtitle={pendingTotal ? `${pendingTotal} waiting for review` : 'Nothing waiting'} />

      <Section>
        <Segmented
          options={[
            { id: 'timesheets', label: 'Timesheets', count: summary.timesheets.pending },
            { id: 'leaves', label: 'Leave', count: summary.leave.pending },
          ]}
          value={view}
          onChange={(v) => {
            onViewChange(v)
            setSearch('')
          }}
        />
        <div className="mt-3 flex flex-col gap-2">
          <div className="flex w-full rounded-xl border border-line bg-white p-0.5" role="group" aria-label="Status">
            {REVIEW_STATUSES.map((s) => (
              <button
                key={s}
                type="button"
                aria-pressed={status === s}
                onClick={() => setStatus(s)}
                className={`press tnum h-9 flex-1 rounded-lg px-2.5 text-[13px] font-medium transition-transform duration-150 ${
                  status === s ? 'gloss-navy text-white' : 'text-ink-soft hover:bg-mist-50'
                }`}
              >
                {statusLabel(s)}
                <span className={`ml-1 text-[12px] ${status === s ? 'text-mist-200' : 'text-ink-muted'}`}>
                  {s === 'PENDING' ? counts.pending : s === 'APPROVED' ? counts.approved : counts.rejected}
                </span>
              </button>
            ))}
          </div>
          <label className="relative w-full min-w-0">
            <span className="sr-only">Search by employee name or ID</span>
            <Icon name="search" className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-muted" />
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Name or ID"
              className="h-10 w-full rounded-xl border border-line-strong bg-white pl-8 pr-2 text-[14px] text-ink outline-none placeholder:text-ink-muted focus:border-mist-500 focus:ring-4 focus:ring-mist-100"
            />
          </label>
        </div>
      </Section>

      <Section
        title={`${statusLabel(status)} ${isTs ? 'timesheets' : 'leave requests'} (${search ? `${shownCount} of ${loadedCount}` : shownCount})`}
      >
        {loadError ? (
          <div role="alert" className="space-y-3">
            <Notice tone="bad">{loadError}</Notice>
            <Button variant="secondary" size="sm" onClick={reload}>
              Try again
            </Button>
          </div>
        ) : loading ? (
          <Card className="flex items-center justify-center gap-2 px-4 py-8 text-[14px] text-ink-muted">
            <Spinner /> Loading
          </Card>
        ) : shownCount === 0 ? (
          search ? (
            <EmptyState icon="search" title="No matches" message={`Nobody matching “${search.trim()}” in this list.`} />
          ) : status === 'PENDING' ? (
            <EmptyState icon="checkCircle" title="Nothing to review" message="New requests will appear here as employees submit them." />
          ) : (
            <EmptyState icon="list" title={`No ${statusLabel(status).toLowerCase()} requests`} message="Decided requests from recent weeks appear here." />
          )
        ) : (
          <div className="space-y-2.5">
            {isTs
              ? shownWeeks.map((w) => (
                  <WeekCard key={weekKey(w)} week={w} onDecide={(decision) => {
                    setSheetError(null)
                    setPending({ kind: 'week', week: w, decision })
                  }} />
                ))
              : shownLeaves.map((l) => (
                  <LeaveCard key={l.id} request={l} balance={balances[l.employeeId]?.find((b) => b.leaveType === l.leaveType)}
                    onDecide={(decision) => {
                      setSheetError(null)
                      setPending({ kind: 'leave', request: l, decision })
                    }} />
                ))}
          </div>
        )}
      </Section>

      {pending && (
        <DecisionSheet
          decision={pending.decision}
          question={pending.kind === 'week'
            ? decisionQuestion(pending.decision, pending.week.employeeName, 'timesheet', rangeLabel(pending.week.weekStart, pending.week.weekEnd))
            : decisionQuestion(pending.decision, pending.request.employeeName, `${pending.request.label} leave`, rangeLabel(pending.request.startDate, pending.request.endDate))}
          saving={saving}
          error={sheetError}
          onCancel={() => !saving && setPending(null)}
          onConfirm={confirm}
        />
      )}
    </>
  )
}

/* ---------- Cards ---------- */

function CardHeader({ name, code, status }: { name: string | null; code: string | null; status: string }) {
  return (
    <div className="flex items-center gap-3">
      <Avatar name={name ?? '?'} size="sm" />
      <div className="min-w-0 flex-1">
        <p className="truncate text-[15px] font-semibold leading-tight text-ink">{name ?? 'Unknown employee'}</p>
        <p className="tnum text-[12px] text-ink-muted">{code ?? '–'}</p>
      </div>
      <StatusBadge status={statusLabel(status)} />
    </div>
  )
}

function DecisionButtons({ onDecide, label }: { onDecide: (d: Decision) => void; label: string }) {
  return (
    <div className="mt-3 grid grid-cols-2 gap-2">
      <Button variant="danger" onClick={() => onDecide('reject')} className="w-full" >
        <Icon name="x" className="h-4 w-4" /> <span>Reject<span className="sr-only"> {label}</span></span>
      </Button>
      <Button onClick={() => onDecide('approve')} className="w-full">
        <Icon name="check" className="h-4 w-4" /> <span>Approve<span className="sr-only"> {label}</span></span>
      </Button>
    </div>
  )
}

function DecidedLine({ status, at, note }: { status: string; at: string | null; note: string | null }) {
  return (
    <p className="mt-2.5 border-t border-line pt-2.5 text-[12px] leading-relaxed text-ink-muted">
      {statusLabel(status)}{at ? ` on ${formatShortDate(at.slice(0, 10))}` : ''}
      {note && <span className="block text-ink-soft">HR note: {note}</span>}
    </p>
  )
}

function WeekCard({ week, onDecide }: { week: HrTimesheetWeek; onDecide: (d: Decision) => void }) {
  const [open, setOpen] = useState(false)
  const id = `days-${weekKey(week).replace('/', '-')}`
  const range = rangeLabel(week.weekStart, week.weekEnd)
  return (
    <Card className="p-3.5">
      <CardHeader name={week.employeeName} code={week.employeeCode} status={week.status} />
      <p className="tnum mt-2.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[13px] text-ink-soft">
        <span className="font-medium text-ink">{range}</span>
        <span aria-hidden="true">·</span>
        <span className="font-semibold text-ink">{Number(week.totalHours)} h</span>
        <span aria-hidden="true">·</span>
        <span>{plural(week.days.length, 'day')}</span>
        {week.submittedAt && (
          <>
            <span aria-hidden="true">·</span>
            <span className="text-ink-muted">Sent {formatShortDate(week.submittedAt.slice(0, 10))}</span>
          </>
        )}
      </p>
      {(week.zeroHourDays?.length ?? 0) > 0 && (
        // Shown before deciding: approving the week makes these days LOP.
        <p className="mt-2 flex gap-1.5 rounded-lg bg-rejected-soft px-2.5 py-2 text-[12px] leading-snug text-rejected-ink">
          <Icon name="alert" className="mt-[1px] h-3.5 w-3.5 shrink-0" />
          <span>
            <span className="font-semibold">LOP: </span>
            {week.zeroHourDays!.map((d) => `${new Date(`${d}T00:00:00`).toLocaleDateString('en-US', { weekday: 'short' })} ${formatShortDate(d)}`).join(', ')}
            {' '}left at 0 hours (no paid leave left).{week.status === 'PENDING' ? ' Approving this week makes them Loss of Pay.' : ''}
          </span>
        </p>
      )}
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-controls={id}
        className="-mx-1 mt-1.5 flex h-9 items-center gap-1 rounded-md px-1 text-[13px] font-semibold text-navy-700 hover:bg-mist-50"
      >
        <Icon name="chevronRight" className={`h-4 w-4 transition-transform ${open ? 'rotate-90' : ''}`} />
        {open ? 'Hide days' : 'Show days'}
      </button>
      {open && (
        <ul id={id} className="mt-1 divide-y divide-line rounded-xl border border-line bg-mist-50/40">
          {week.days.map((d) => (
            <li key={d.id} className="px-3 py-2">
              <div className="tnum flex items-baseline justify-between gap-2 text-[13px]">
                <span className="font-medium text-ink">
                  {new Date(`${d.date}T00:00:00`).toLocaleDateString('en-US', { weekday: 'short' })} {formatShortDate(d.date)}
                </span>
                <span className="font-semibold text-ink">{Number(d.hours)} h</span>
              </div>
              <p className="mt-0.5 text-[12px] leading-snug text-ink-muted">{d.description}</p>
            </li>
          ))}
        </ul>
      )}
      {week.status === 'PENDING'
        ? <DecisionButtons onDecide={onDecide} label={`timesheet of ${week.employeeName ?? ''} for ${range}`} />
        : <DecidedLine status={week.status} at={week.reviewedAt} note={week.reviewNote} />}
    </Card>
  )
}

function LeaveCard({
  request, balance, onDecide,
}: {
  request: LeaveRequestRecord
  balance?: LeaveBalanceRecord
  onDecide: (d: Decision) => void
}) {
  const range = rangeLabel(request.startDate, request.endDate)
  const n = dayCount(request.days)
  return (
    <Card className="p-3.5">
      <CardHeader name={request.employeeName} code={request.employeeCode} status={request.status} />
      <p className="tnum mt-2.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[13px] text-ink-soft">
        <span className="font-semibold text-ink">{request.label} leave</span>
        <span aria-hidden="true">·</span>
        <span className="font-medium text-ink">{range}</span>
        <span aria-hidden="true">·</span>
        <span>{plural(n, 'working day')}</span>
      </p>
      <p className="mt-1.5 text-[13px] leading-snug text-ink-soft">{request.reason}</p>
      {request.status === 'PENDING' && balance && (
        <p className={`tnum mt-2 rounded-md px-2.5 py-1.5 text-[12px] ${
          dayCount(balance.balanceDays) < n ? 'bg-bad-soft text-bad' : 'bg-mist-50 text-ink-soft'
        }`}>
          {balance.label} balance {dayCount(balance.balanceDays)} · this request {n} · after approval {Math.max(0, dayCount(balance.balanceDays) - n)}
          {dayCount(balance.balanceDays) < n && ' (not enough: update the balance or reject)'}
        </p>
      )}
      {request.status === 'PENDING'
        ? <DecisionButtons onDecide={onDecide} label={`${request.label} leave of ${request.employeeName ?? ''} for ${range}`} />
        : <DecidedLine status={request.status} at={request.reviewedAt} note={request.reviewNote} />}
    </Card>
  )
}

/* ---------- Confirmation sheet ---------- */

function DecisionSheet({
  decision, question, saving, error, onCancel, onConfirm,
}: {
  decision: Decision
  question: string
  saving: boolean
  error: string | null
  onCancel: () => void
  onConfirm: (reason: string) => void
}) {
  const [reason, setReason] = useState('')
  const [reasonError, setReasonError] = useState<string | null>(null)
  const first = useRef<HTMLTextAreaElement | HTMLButtonElement | null>(null)
  const reject = decision === 'reject'

  useBackHandler(onCancel)
  useEffect(() => {
    first.current?.focus()
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCancel()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onCancel])

  function submit() {
    if (reject) {
      const problem = rejectReasonProblem(reason)
      if (problem) {
        setReasonError(problem)
        return
      }
    }
    onConfirm(reason.trim())
  }

  return (
    <div className="backdrop-enter fixed inset-0 z-50 grid place-items-end bg-navy-950/45 p-4 backdrop-blur-[2px] sm:place-items-center">
      <div role="alertdialog" aria-modal="true" aria-labelledby="decision-title" className="sheet sheet-enter w-full max-w-sm p-5">
        <p id="decision-title" className="text-[16px] font-semibold leading-snug text-ink">{question}</p>
        {reject ? (
          <label className="mt-3 block" htmlFor="decision-reason">
            <span className="text-[13px] font-medium text-ink-soft">Reason (the employee will see it)</span>
            <textarea
              id="decision-reason"
              ref={(el) => { first.current = el }}
              rows={3}
              maxLength={500}
              value={reason}
              onChange={(e) => {
                setReason(e.target.value)
                setReasonError(null)
              }}
              aria-invalid={!!reasonError}
              className={`mt-1.5 w-full rounded-xl border bg-white px-3 py-2 text-[14px] text-ink outline-none focus:border-mist-500 focus:ring-4 focus:ring-mist-100 ${reasonError ? 'border-bad/50' : 'border-line-strong'}`}
            />
            {reasonError && <span className="mt-1 block text-[12px] text-bad" role="alert">{reasonError}</span>}
          </label>
        ) : (
          <p className="mt-1.5 text-[13px] text-ink-muted">The employee will see it as Approved.</p>
        )}
        {error && (
          <div className="mt-3" role="alert">
            <Notice tone="bad">{error}</Notice>
          </div>
        )}
        <div className="mt-5 grid grid-cols-2 gap-2">
          <button
            ref={reject ? undefined : (el) => { first.current = el }}
            type="button"
            onClick={onCancel}
            disabled={saving}
            className="h-12 rounded-lg bg-white text-[15px] font-semibold text-navy-900 ring-1 ring-inset ring-line-strong hover:bg-mist-50 disabled:opacity-60"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={submit}
            disabled={saving}
            className={`press inline-flex h-12 items-center justify-center gap-2 rounded-xl text-[15px] font-semibold text-white transition-transform duration-150 disabled:opacity-60 ${
              reject ? 'gloss-red' : 'gloss-navy'
            }`}
          >
            {saving && <Spinner />} {reject ? 'Reject' : 'Approve'}
          </button>
        </div>
      </div>
    </div>
  )
}
