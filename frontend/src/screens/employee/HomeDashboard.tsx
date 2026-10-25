// The employee Home dashboard: month summary, weekly timesheet status, leave,
// payslips, holidays, key documents and request tracking. Every number and
// status comes from the employee's own records loaded by EmployeeApp; nothing
// here is sample data. The decorative drawings are inline SVG (no images).
import type { ReactNode } from 'react'
import { Icon, type IconName } from '../../components/Icons'
import { AppHeader, AvatarButton, IconButton, IconTile, StatusBadge, type IconTileTone } from '../../components/ui'
import type { DocType, Employee, EmployeeDocument, LeaveBalance, Timesheet } from '../../data/types'
import { currentWorkWeek, formatDate, formatShortDate, greeting, monthLabel, plural, toIsoDate } from '../../lib/format'
import type { EmployeeSubScreen } from '../../lib/employeeNav'
import { canOpenWeek, monthWeeks, type MonthWeek } from '../../lib/timesheetHistory'
import { upcomingHolidays, type HolidayRecord } from '../../lib/workCalendar'

type DocFilter = 'All' | DocType

export default function HomeScreen({
  user, photoUrl, unread, holidays, holidaysLoading, myTimesheets, myDocs, pendingTsCount, pendingLeaveCount, payslips,
  leaveBalance, weeklyOffs, onOpen, onOpenWeek, onOpenDocs, onOpenRequests, onOpenProfile, onDownload,
}: {
  user: Employee
  /** The employee's weekly offs this week (from their HR schedule), or null while loading. */
  weeklyOffs: string[] | null
  photoUrl: string | null
  unread: number
  holidays: HolidayRecord[]
  holidaysLoading: boolean
  myTimesheets: Timesheet[]
  myDocs: EmployeeDocument[]
  pendingTsCount: number
  pendingLeaveCount: number
  payslips: EmployeeDocument[]
  leaveBalance: LeaveBalance[]
  onOpen: (s: EmployeeSubScreen) => void
  /** Opens the timesheet on the week starting this Monday. */
  onOpenWeek: (weekStart: string) => void
  onOpenDocs: (f: DocFilter) => void
  onOpenRequests: (v: 'timesheets' | 'leaves') => void
  /** The header shortcut: opens the same Profile screen as the footer tab. */
  onOpenProfile: () => void
  onDownload: (doc: EmployeeDocument) => void
}) {
  const now = new Date()
  const today = toIsoDate(now)
  const month = today.slice(0, 7)
  const monthHours = myTimesheets
    .filter((t) => t.date.startsWith(month) && t.status !== 'Rejected')
    .reduce((s, t) => s + t.hours, 0)
  const week = currentWorkWeek(now, weeklyOffs)
  const weekHours = week.reduce((s, d) => s + (myTimesheets.find((t) => t.date === d.iso)?.hours ?? 0), 0)
  const rejectedTs = myTimesheets.filter((t) => t.status === 'Rejected').length
  const nextHoliday = upcomingHolidays(holidays, today)[0]
  const latestPayslip = payslips[0]

  const approval: ApprovalState =
    rejectedTs > 0
      ? { tone: 'rejected', text: `${plural(rejectedTs, 'timesheet')} rejected, needs changes` }
      : pendingTsCount > 0
        ? { tone: 'pending', text: `${plural(pendingTsCount, 'timesheet')} awaiting approval` }
        : myTimesheets.length === 0
          ? { tone: 'none', text: 'No timesheets submitted yet' }
          : { tone: 'approved', text: 'All timesheets approved' }

  return (
    <>
      <AppHeader
        start={
          <>
            <AvatarButton name={user.name} label="Open your profile" onClick={onOpenProfile} photoUrl={photoUrl} />
            <IconButton icon="bell" label={`Notifications, ${unread} unread`} count={unread} onClick={() => onOpen('notifications')} />
          </>
        }
      />

      <div className="px-5 pt-2">
        <p className="text-[14px] text-ink-muted">{greeting()},</p>
        <h1 className="truncate text-[26px] font-bold leading-tight tracking-tight text-navy-900">{user.displayName ?? user.name}</h1>
      </div>

      <section className="px-5 pt-5">
        <MonthSummaryCard
          month={monthLabel(now)}
          hours={monthHours}
          approval={approval}
          onStatus={() => onOpenRequests('timesheets')}
          onSubmit={() => onOpen('timesheet')}
        />
      </section>

      <section className="space-y-3 px-5 pt-4">
        <WeeklyTimesheetCard
          weekHours={weekHours}
          weeks={monthWeeks(myTimesheets, today)}
          today={today}
          onOpen={() => onOpen('timesheet')}
          onOpenWeek={onOpenWeek}
        />

        {/* Leave on the left (both rows), Payslips and Holidays stacked on the right.
            Very narrow phones get one column instead. */}
        <div className="grid grid-cols-[1.12fr_1fr] gap-3 max-[339px]:grid-cols-1">
          <LeaveSummaryCard balances={leaveBalance} onOpen={() => onOpen('leave')} />
          <div className="grid gap-3">
            <TintCard
              tint="lavender"
              icon="receipt"
              title="Payslips"
              detail={latestPayslip ? `Latest: ${payslipMonth(latestPayslip.title)}` : 'None yet'}
              art={<DocumentsArt />}
              onClick={() => onOpen('payslips')}
            />
            <TintCard
              tint="gold"
              icon="calendar"
              title="Holidays"
              label="Holiday calendar"
              detail={
                holidaysLoading
                  ? 'Loading…'
                  : nextHoliday
                    ? `${formatShortDate(nextHoliday.date)} · ${nextHoliday.name}`
                    : holidays.length
                      ? 'No more this year'
                      : 'None published yet'
              }
              art={<DiyaArt />}
              onClick={() => onOpen('holidays')}
            />
          </div>
        </div>
      </section>

      <DashboardSection title="Your documents" action={<ViewAllLink onClick={() => onOpenDocs('All')} />}>
        <RowCard>
          {KEY_DOCS.map(({ type, label, pending }) => {
            const doc = myDocs.find((d) => d.type === type)
            return (
              <DocumentRow
                key={type}
                title={label}
                subtitle={doc ? `Issued ${formatDate(doc.issuedOn)}` : pending}
                onOpen={() => onOpenDocs(type)}
                onDownload={doc ? () => onDownload(doc) : undefined}
              />
            )
          })}
        </RowCard>
      </DashboardSection>

      <DashboardSection title="Track requests">
        <RowCard>
          <RequestRow
            icon="list"
            tone="blue"
            title="Timesheet approvals"
            subtitle={pendingTsCount ? `${plural(pendingTsCount, 'week')} pending` : 'Nothing pending'}
            onClick={() => onOpenRequests('timesheets')}
          />
          <RequestRow
            icon="calendar"
            tone="lavender"
            title="Leave applications"
            subtitle={pendingLeaveCount ? `${plural(pendingLeaveCount, 'request')} pending` : 'Nothing pending'}
            onClick={() => onOpenRequests('leaves')}
          />
        </RowCard>
      </DashboardSection>
    </>
  )
}

// "pending" explains when HR issues each document if it isn't uploaded yet.
const KEY_DOCS: { type: DocType; label: string; pending: string }[] = [
  { type: 'Offer Letter', label: 'Offer letter', pending: 'Not uploaded yet' },
  { type: 'Experience Letter', label: 'Experience letter', pending: 'Issued when you leave' },
  { type: 'Form 16', label: 'Form 16', pending: 'Issued after each financial year' },
]

/** "Payslip - August 2026" → "August" (the title HR's upload gives each payslip). */
export function payslipMonth(title: string): string {
  return title.replace(/^Payslip\s*-\s*/i, '').replace(/\s+\d{4}$/, '')
}

/* ---------- Month summary ---------- */

type ApprovalState = { tone: 'approved' | 'pending' | 'rejected' | 'none'; text: string }

const APPROVAL_ICON: Record<ApprovalState['tone'], { icon: IconName; className: string }> = {
  approved: { icon: 'checkCircle', className: 'bg-approved text-navy-950' },
  pending: { icon: 'clock', className: 'bg-pending text-navy-950' },
  rejected: { icon: 'alert', className: 'bg-rejected text-navy-950' },
  none: { icon: 'info', className: 'bg-white/15 text-white' },
}

export function MonthSummaryCard({
  month, hours, approval, onStatus, onSubmit,
}: { month: string; hours: number; approval: ApprovalState; onStatus: () => void; onSubmit: () => void }) {
  const icon = APPROVAL_ICON[approval.tone]
  return (
    <div className="hero-card relative overflow-hidden rounded-[22px] p-5 text-white">
      <ClockArt />
      <div className="relative">
        <p className="text-[14px] font-medium text-mist-200">{month}</p>
        <p className="tnum mt-3 text-[52px] font-bold leading-none tracking-tight">{hours}</p>
        <p className="mt-1.5 text-[14px] text-mist-200">hours logged this month</p>

        <button
          type="button"
          onClick={onStatus}
          className="mt-4 flex w-full items-center gap-2.5 rounded-xl bg-white/[0.08] px-3 py-2.5 text-left text-[13.5px] font-medium text-white ring-1 ring-inset ring-white/12 hover:bg-white/12"
        >
          <span className={`grid h-6 w-6 shrink-0 place-items-center rounded-full ${icon.className}`}>
            <Icon name={icon.icon} className="h-4 w-4" />
          </span>
          <span className="min-w-0 flex-1">{approval.text}</span>
          <Icon name="chevronRight" className="h-4 w-4 shrink-0 text-mist-300" />
        </button>

        <button
          type="button"
          onClick={onSubmit}
          className="press hero-button mt-4 flex h-13 w-full items-center justify-center gap-2 rounded-2xl text-[15.5px] font-semibold transition-transform duration-150"
        >
          <Icon name="clock" className="h-5 w-5" /> Submit timesheet
        </button>
      </div>
    </div>
  )
}

/* ---------- Weekly timesheet status ---------- */

const WEEK_TILE: Record<MonthWeek['status'], { tile: string; icon: IconName | null }> = {
  Approved: { tile: 'bg-approved text-approved-ink', icon: 'check' },
  Pending: { tile: 'bg-pending text-pending-ink', icon: 'clock' },
  Rejected: { tile: 'bg-rejected text-rejected-ink', icon: 'x' },
  'Not submitted': { tile: 'bg-mist-50 text-mist-300 ring-1 ring-inset ring-line', icon: null },
}

export function WeeklyTimesheetCard({
  weekHours, weeks, today, onOpen, onOpenWeek,
}: { weekHours: number; weeks: MonthWeek[]; today: string; onOpen: () => void; onOpenWeek: (weekStart: string) => void }) {
  return (
    <div className="card-surface rounded-[20px] border border-line p-4">
      <button
        type="button"
        onClick={onOpen}
        aria-label="Timesheet, this week"
        className="press flex w-full items-center gap-3 text-left transition-transform duration-150"
      >
        <IconTile icon="clock" tone="blue" size="lg" />
        <div className="min-w-0 flex-1">
          <p className="text-[16px] font-semibold text-ink">Timesheet</p>
          <p className="tnum text-[13px] text-ink-muted">{weekHours} h this week</p>
        </div>
        <Icon name="chevronRight" className="h-[18px] w-[18px] text-ink-muted/70" />
      </button>

      {/* This month, week by week: each week's status comes from all of its saved
          days. Tapping a week opens it; weeks that haven't started can't be opened. */}
      <div className="mt-4 grid gap-2" style={{ gridTemplateColumns: `repeat(${weeks.length}, minmax(0, 1fr))` }}>
        {weeks.map((w) => {
          const look = WEEK_TILE[w.status]
          const openable = canOpenWeek(w.weekStart, today)
          return (
            <button
              key={w.weekStart}
              type="button"
              disabled={!openable}
              onClick={() => onOpenWeek(w.weekStart)}
              aria-label={`${w.label} (${w.range}): ${w.status}. ${openable ? 'Open this week' : 'Opens when the week starts'}`}
              className="press flex min-w-0 flex-col items-center gap-1.5 rounded-xl transition-transform duration-150 disabled:cursor-default"
            >
              <span className={`grid h-11 w-full place-items-center rounded-xl ${look.tile} ${w.current ? 'outline-2 outline-offset-2 outline-royal-600/40' : ''}`}>
                {look.icon && <Icon name={look.icon} className="h-[18px] w-[18px]" />}
              </span>
              <span className={`whitespace-nowrap text-[11px] ${w.current ? 'font-semibold text-navy-900' : 'text-ink-muted'}`}>{w.label}</span>
            </button>
          )
        })}
      </div>
      <div className="mt-3.5 flex flex-wrap gap-x-4 gap-y-1 border-t border-line pt-3 text-[11px] text-ink-muted">
        <Legend className="bg-approved" label="Approved" />
        <Legend className="bg-pending" label="Pending" />
        <Legend className="bg-rejected" label="Rejected" />
        <Legend className="bg-mist-50 ring-1 ring-inset ring-line-strong" label="Not submitted" />
      </div>
    </div>
  )
}

function Legend({ className, label }: { className: string; label: string }) {
  return (
    <span className="flex items-center gap-1.5">
      <span className={`h-2.5 w-2.5 rounded-[3px] ${className}`} />
      {label}
    </span>
  )
}

/* ---------- Leave, Payslips, Holidays ---------- */

export function LeaveSummaryCard({ balances, onOpen }: { balances: LeaveBalance[]; onOpen: () => void }) {
  const available = balances.reduce((s, b) => s + b.left, 0)
  return (
    <button
      type="button"
      onClick={onOpen}
      aria-label="Leave"
      className="press tint-blue relative flex min-h-full flex-col overflow-hidden rounded-[20px] border border-line p-4 text-left transition-transform duration-150"
    >
      <IconTile icon="calendar" tone="blue" size="lg" />
      <p className="mt-3 text-[16px] font-semibold text-ink">Leave</p>
      <p className="tnum text-[13px] text-ink-muted">
        {balances.length ? `${plural(available, 'day')} available` : 'Balance not set up yet'}
      </p>
      {/* Available of the current balance, per leave type (as set by HR). */}
      <div className="relative mt-4 space-y-2.5 pb-14">
        {balances.map((b) => (
          <div key={b.type}>
            <div className="tnum mb-1 flex justify-between gap-2 text-[11.5px]">
              <span className="truncate text-ink-soft">{b.type}</span>
              <span className="shrink-0 font-medium text-ink">
                {b.left}/{b.total}
              </span>
            </div>
            <div
              className="h-1.5 w-full overflow-hidden rounded-full bg-royal-50"
              role="progressbar"
              aria-label={`${b.type}: ${b.left} of ${b.total} days available`}
              aria-valuenow={b.left}
              aria-valuemax={b.total}
            >
              <div
                className="h-full rounded-full bg-royal-600/75"
                style={{ width: `${b.total > 0 ? Math.min(100, Math.round((b.left / b.total) * 100)) : 0}%` }}
              />
            </div>
          </div>
        ))}
      </div>
      <LandscapeArt />
    </button>
  )
}

/** A small tappable card with a coloured tint and a drawing in its corner. */
export function TintCard({
  tint, icon, title, label, detail, art, onClick,
}: { tint: 'lavender' | 'gold'; icon: IconName; title: string; label?: string; detail: string; art: ReactNode; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label ?? title}
      className={`press tint-${tint} relative flex min-h-[132px] flex-col overflow-hidden rounded-[20px] border border-line p-4 text-left transition-transform duration-150`}
    >
      {art}
      <span className="relative flex items-start justify-between">
        <IconTile icon={icon} tone={tint} size="lg" />
        <Icon name="chevronRight" className="mt-2.5 h-[18px] w-[18px] text-ink-muted/70" />
      </span>
      <span className="relative mt-3 text-[16px] font-semibold text-ink">{title}</span>
      <span className="relative line-clamp-2 pr-8 text-[13px] leading-snug text-ink-muted">{detail}</span>
    </button>
  )
}

/* ---------- Documents and requests ---------- */

function DashboardSection({ title, action, children }: { title: string; action?: ReactNode; children: ReactNode }) {
  return (
    <section className="px-5 pt-7">
      <div className="mb-3 flex items-center justify-between gap-3">
        <h2 className="text-[17px] font-semibold tracking-tight text-navy-900">{title}</h2>
        {action}
      </div>
      {children}
    </section>
  )
}

function ViewAllLink({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="-my-2 -mr-2 flex items-center gap-0.5 rounded-md px-2 py-2 text-[13.5px] font-semibold text-royal-600 hover:bg-royal-50"
    >
      View all <Icon name="chevronRight" className="h-4 w-4" />
    </button>
  )
}

/** One white card holding rows split by thin lines. */
function RowCard({ children }: { children: ReactNode }) {
  return <div className="card-surface divide-y divide-line overflow-hidden rounded-[20px] border border-line">{children}</div>
}

/**
 * A key document: tapping the row opens it in Documents; when HR has issued it
 * there is a download button, otherwise a "Not issued" pill.
 */
export function DocumentRow({
  title, subtitle, onOpen, onDownload,
}: { title: string; subtitle: string; onOpen: () => void; onDownload?: () => void }) {
  return (
    <div className="flex min-h-[68px] items-center hover:bg-mist-50/60">
      <button type="button" onClick={onOpen} className="flex min-h-[68px] min-w-0 flex-1 items-center gap-3 py-3 pl-4 pr-2 text-left active:bg-mist-50">
        <IconTile icon="file" tone="blue" size="lg" />
        <span className="min-w-0 flex-1">
          <span className="block text-[15px] font-semibold leading-snug text-ink">{title}</span>
          <span className="mt-0.5 block text-[13px] leading-snug text-ink-muted">{subtitle}</span>
        </span>
      </button>
      <div className="flex shrink-0 items-center pr-4">
        {onDownload ? (
          <button
            type="button"
            onClick={onDownload}
            aria-label={`Download ${title}`}
            className="grid h-10 w-10 place-items-center rounded-full bg-royal-50 text-royal-600 ring-1 ring-inset ring-royal-100 hover:bg-royal-100"
          >
            <Icon name="download" className="h-[18px] w-[18px]" />
          </button>
        ) : (
          <StatusBadge status="Not issued" />
        )}
      </div>
    </div>
  )
}

export function RequestRow({
  icon, tone, title, subtitle, onClick,
}: { icon: IconName; tone: IconTileTone; title: string; subtitle: string; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className="flex min-h-[68px] w-full items-center gap-3 px-4 py-3 text-left hover:bg-mist-50/60 active:bg-mist-50">
      <IconTile icon={icon} tone={tone} size="lg" />
      <span className="min-w-0 flex-1">
        <span className="block text-[15px] font-semibold leading-snug text-ink">{title}</span>
        <span className="mt-0.5 block text-[13px] leading-snug text-ink-muted">{subtitle}</span>
      </span>
      <Icon name="chevronRight" className="h-[18px] w-[18px] shrink-0 text-ink-muted/70" />
    </button>
  )
}

/* ---------- Decorative drawings (hidden from screen readers) ---------- */

/** A large, faint clock face in the corner of the month card. */
function ClockArt() {
  const ticks = Array.from({ length: 12 }, (_, i) => {
    const a = (i * Math.PI) / 6
    const r1 = i % 3 === 0 ? 50 : 54
    return { x1: 70 + Math.sin(a) * r1, y1: 70 - Math.cos(a) * r1, x2: 70 + Math.sin(a) * 60, y2: 70 - Math.cos(a) * 60 }
  })
  return (
    <svg viewBox="0 0 140 140" aria-hidden="true" className="pointer-events-none absolute -right-7 -top-6 h-44 w-44 text-white" fill="none">
      <circle cx="70" cy="70" r="68" stroke="currentColor" strokeOpacity="0.07" strokeWidth="10" />
      <circle cx="70" cy="70" r="62" stroke="currentColor" strokeOpacity="0.22" strokeWidth="1.5" />
      <circle cx="70" cy="70" r="62" fill="currentColor" fillOpacity="0.04" />
      {ticks.map((t, i) => (
        <line key={i} {...t} stroke="currentColor" strokeOpacity={i % 3 === 0 ? 0.45 : 0.22} strokeWidth={i % 3 === 0 ? 2.5 : 1.5} strokeLinecap="round" />
      ))}
      <path d="M70 70V36M70 70l22 14" stroke="currentColor" strokeOpacity="0.5" strokeWidth="3" strokeLinecap="round" />
      <circle cx="70" cy="70" r="4" fill="currentColor" fillOpacity="0.6" />
    </svg>
  )
}

/** Soft blue hills and a sun along the bottom of the Leave card. */
function LandscapeArt() {
  return (
    <svg viewBox="0 0 200 64" preserveAspectRatio="none" aria-hidden="true" className="pointer-events-none absolute inset-x-0 bottom-0 h-16 w-full text-royal-600">
      <circle cx="150" cy="22" r="9" fill="currentColor" fillOpacity="0.12" />
      <path d="M0 40 C30 22 55 26 80 38 S130 52 160 36 S190 24 200 30 V64 H0Z" fill="currentColor" fillOpacity="0.08" />
      <path d="M0 52 C35 38 70 44 100 50 S160 58 200 44 V64 H0Z" fill="currentColor" fillOpacity="0.12" />
    </svg>
  )
}

/** Two stacked pages in the corner of the Payslips card. */
function DocumentsArt() {
  return (
    <svg viewBox="0 0 64 64" aria-hidden="true" className="pointer-events-none absolute -bottom-3 -right-2 h-[70px] w-[70px] text-lavender-600" fill="none">
      <rect x="20" y="10" width="34" height="44" rx="5" transform="rotate(10 37 32)" fill="currentColor" fillOpacity="0.08" stroke="currentColor" strokeOpacity="0.18" />
      <rect x="10" y="14" width="34" height="44" rx="5" fill="currentColor" fillOpacity="0.1" stroke="currentColor" strokeOpacity="0.25" />
      <path d="M17 26h20M17 33h20M17 40h13" stroke="currentColor" strokeOpacity="0.3" strokeWidth="2.5" strokeLinecap="round" />
    </svg>
  )
}

/** A small oil lamp (diya) in the corner of the Holidays card. */
function DiyaArt() {
  return (
    <svg viewBox="0 0 64 64" aria-hidden="true" className="pointer-events-none absolute -bottom-1 -right-1 h-[62px] w-[62px] text-gold-600" fill="none">
      <path d="M32 14c-4 6-5 10-5 13a5 5 0 0 0 10 0c0-3-1-7-5-13z" fill="currentColor" fillOpacity="0.28" />
      <path d="M32 21c-1.6 2.6-2 4.3-2 5.6a2 2 0 0 0 4 0c0-1.3-.4-3-2-5.6z" fill="currentColor" fillOpacity="0.45" />
      <path d="M8 36h48c-2 10-11 16-24 16S10 46 8 36z" fill="currentColor" fillOpacity="0.2" stroke="currentColor" strokeOpacity="0.3" />
      <path d="M22 52h20l-3 5H25z" fill="currentColor" fillOpacity="0.16" />
    </svg>
  )
}
