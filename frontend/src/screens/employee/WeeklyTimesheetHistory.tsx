// Timesheet history as one short row per week. Every week starts closed;
// tapping a week shows its days with hours, description and status.
import { useMemo, useState } from 'react'
import { Icon } from '../../components/Icons'
import Spotlight from '../../components/Spotlight'
import { EmptyState, List, StatusBadge } from '../../components/ui'
import type { Timesheet } from '../../data/types'
import { formatShortDate } from '../../lib/format'
import { groupByWeek, statusBreakdown, toggleWeek, weekSummaryLine } from '../../lib/timesheetHistory'

/** The icon tile's colours for a week's status. */
export function statusTile(status: string): string {
  if (status === 'Approved') return 'bg-approved-soft text-approved-ink'
  if (status === 'Pending') return 'bg-pending-soft text-pending-ink'
  if (status === 'Rejected') return 'bg-rejected-soft text-rejected-ink'
  return 'bg-royal-50 text-royal-700'
}

export default function WeeklyTimesheetHistory({
  items, highlightWeek = null,
}: {
  items: Timesheet[]
  /** A week (its Monday) a tapped notification points at: shown open and outlined. */
  highlightWeek?: string | null
}) {
  const weeks = useMemo(() => groupByWeek(items), [items])
  const [open, setOpen] = useState<Set<string>>(() => new Set(highlightWeek ? [highlightWeek] : []))

  if (weeks.length === 0) {
    return <EmptyState icon="clock" title="No timesheets yet" message="Weeks you submit will appear here with their approval status." />
  }

  return (
    <List>
      {weeks.map((week) => {
        const isOpen = open.has(week.weekStart)
        const detailsId = `week-${week.weekStart}`
        const breakdown = statusBreakdown(week)
        return (
          <Spotlight key={week.weekStart} on={week.weekStart === highlightWeek}>
            <button
              type="button"
              onClick={() => setOpen((o) => toggleWeek(o, week.weekStart))}
              aria-expanded={isOpen}
              aria-controls={detailsId}
              className="flex min-h-[72px] w-full items-center gap-3.5 px-4 py-3 text-left hover:bg-mist-50/60 active:bg-mist-50"
            >
              <span className={`grid h-11 w-11 shrink-0 place-items-center rounded-2xl ${statusTile(week.status)}`}>
                <Icon name="clock" className="h-[22px] w-[22px]" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="tnum block truncate text-[15px] font-semibold text-ink">{week.label}</span>
                <span className="tnum mt-0.5 block truncate text-[13px] text-ink-muted">
                  {weekSummaryLine(week)}
                  {week.submittedOn && ` · sent ${formatShortDate(week.submittedOn)}`}
                </span>
                {breakdown && <span className="mt-0.5 block truncate text-[12px] text-ink-muted">{breakdown}</span>}
              </span>
              <StatusBadge status={week.status} />
              <Icon
                name="chevronRight"
                className={`h-[18px] w-[18px] shrink-0 text-ink-muted/70 transition-transform ${isOpen ? 'rotate-90' : ''}`}
              />
            </button>
            {isOpen && (
              <ul id={detailsId} className="border-t border-line bg-mist-50/50 px-4 py-1" aria-label={`Days of ${week.label}`}>
                {week.entries.map((t) => (
                  <li key={t.id} className="border-b border-line/70 py-2.5 last:border-b-0">
                    <div className="flex items-center justify-between gap-3">
                      <p className="tnum text-[14px] font-medium text-ink">
                        {dayName(t.date)} {formatShortDate(t.date)}
                        <span className="ml-2 font-normal text-ink-muted">{t.hours} h</span>
                      </p>
                      <StatusBadge status={t.status} />
                    </div>
                    <p className="mt-0.5 text-[13px] leading-snug text-ink-muted">{t.description}</p>
                    {t.status === 'Rejected' && t.remark && (
                      <div className="mt-2 rounded-md border-l-2 border-rejected bg-rejected-soft px-3 py-2 text-[12px] leading-relaxed text-rejected-ink">
                        <span className="font-semibold">HR note:</span> {t.remark}
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </Spotlight>
        )
      })}
    </List>
  )
}

function dayName(iso: string): string {
  return new Date(`${iso}T00:00:00`).toLocaleDateString('en-US', { weekday: 'short' })
}
