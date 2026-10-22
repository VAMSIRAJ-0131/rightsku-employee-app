// HR: one employee's Comp-Off balance and the history of every change, with
// who made it and when. Approved Comp-Off requests appear in the history
// automatically. Changes are made in Leave balance → Change balance → Comp-Off
// (a reason is always required); version goes up after each change.
import { useEffect, useState } from 'react'
import { Button, Card, Notice, Section, Spinner, Tag } from '../../components/ui'
import type { ApiError } from '../../lib/api'
import { changeLabel, changedAtLabel, getCompOff, type CompOffRecord } from '../../lib/compOff'
import { days } from '../../lib/leave'

const SHOWN_AT_FIRST = 5

export default function CompOffSection({
  token, employeeId, version = 0, onError,
}: {
  token: string
  employeeId: number
  /** Goes up after a Comp-Off change elsewhere on the page, to reload. */
  version?: number
  onError: (error: ApiError) => ApiError
}) {
  const [record, setRecord] = useState<CompOffRecord | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [retry, setRetry] = useState(0)
  const [showAll, setShowAll] = useState(false)

  useEffect(() => {
    const controller = new AbortController()
    setLoadError(null)
    getCompOff(token, employeeId, controller.signal).then((result) => {
      if (controller.signal.aborted) return
      if (result.ok) setRecord(result.data)
      else setLoadError(onError(result.error).message)
    })
    return () => controller.abort()
  }, [token, employeeId, version, retry, onError])

  const history = record?.history ?? []
  const shown = showAll ? history : history.slice(0, SHOWN_AT_FIRST)

  return (
    <Section title="Comp-Off balance">
      {loadError ? (
        <div className="space-y-3" role="alert">
          <Notice tone="bad">{loadError}</Notice>
          <Button variant="secondary" size="sm" onClick={() => setRetry((r) => r + 1)}>
            Try again
          </Button>
        </div>
      ) : !record ? (
        <Card className="flex items-center justify-center gap-2 px-4 py-8 text-[14px] text-ink-muted">
          <Spinner /> Loading Comp-Off balance
        </Card>
      ) : (
        <Card className="divide-y divide-line">
          <div className="flex items-center gap-3 px-4 py-3">
            <div className="min-w-0 flex-1">
              <p className="tnum text-[15px] font-semibold text-ink">
                {days(record.balanceDays)} {days(record.balanceDays) === 1 ? 'day' : 'days'}
              </p>
              <p className="tnum text-[12px] text-ink-muted">
                Pending {days(record.pendingDays)} · Available {days(record.availableDays)}
              </p>
            </div>
          </div>

          <div className="px-4 py-3">
            <p className="text-[13px] font-medium text-ink-soft">History</p>
            {history.length === 0 ? (
              <p className="mt-1 text-[13px] text-ink-muted">No changes yet.</p>
            ) : (
              <ul className="mt-1 divide-y divide-line/70" aria-label="Comp-Off history">
                {shown.map((h) => {
                  const n = days(h.changeDays)
                  return (
                    <li key={h.id} className="py-2.5">
                      <div className="flex items-baseline justify-between gap-3">
                        <span className={`tnum text-[14px] font-semibold ${n > 0 ? 'text-ok' : 'text-bad'}`}>{changeLabel(h.changeDays)}</span>
                        <span className="tnum text-[12px] text-ink-muted">
                          {days(h.balanceBefore)} → {days(h.balanceAfter)}
                        </span>
                      </div>
                      <p className="mt-0.5 text-[13px] leading-snug text-ink">
                        {h.source === 'LEAVE_APPROVED' && <span className="mr-1.5 align-middle"><Tag>Leave</Tag></span>}
                        {h.reason}
                      </p>
                      <p className="mt-0.5 text-[12px] text-ink-muted">
                        {h.changedBy ? `By ${h.changedBy}` : 'By the system'}
                        {h.changedAt ? ` · ${changedAtLabel(h.changedAt)}` : ''}
                      </p>
                    </li>
                  )
                })}
              </ul>
            )}
            {history.length > SHOWN_AT_FIRST && (
              <Button variant="ghost" size="sm" className="mt-1 -ml-3" onClick={() => setShowAll((s) => !s)}>
                {showAll ? 'Show fewer' : `Show all ${history.length} changes`}
              </Button>
            )}
          </div>
        </Card>
      )}
    </Section>
  )
}
