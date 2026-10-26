// The employee Home dashboard: month summary, weekly timesheet status, leave,
// payslips, holidays, key documents and request tracking. Every number and
// status comes from the employee's own records loaded by EmployeeApp; nothing
// here is sample data. The decorative drawings are inline SVG (no images).
import { useEffect, useRef, useState, type ReactNode, type Ref } from 'react'
import { Icon, type IconName } from '../../components/Icons'
import { AppHeader, AvatarButton, IconButton, type IconTileTone } from '../../components/ui'
import type { DocType, Employee, EmployeeDocument, LeaveBalance, Timesheet } from '../../data/types'
import { currentWorkWeek, formatDate, formatShortDate, greeting, monthLabel, plural, toIsoDate } from '../../lib/format'
import type { EmployeeSubScreen } from '../../lib/employeeNav'
import { canOpenWeek, monthWeeks, type MonthWeek } from '../../lib/timesheetHistory'
import { upcomingHolidays, type HolidayRecord } from '../../lib/workCalendar'
import { dayPart, festivalTheme, type DayPart } from '../../lib/festivals'
import FestivalArt, { festivalTint } from '../../components/FestivalArt'

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
  // The Payslips pages rise each time the card is scrolled into view going down.
  const payslipRise = useRiseOnScrollDown<HTMLButtonElement>()
  // The next holiday's festive drawing; after it passes, the one after it takes over.
  const holidayTheme = festivalTheme(nextHoliday?.name ?? '')

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

      {/* Greeting, with a soft sky drawing on the right. */}
      <div className="relative overflow-hidden px-5 pb-1 pt-2">
        <SkyArt part={dayPart(now.getHours())} />
        <p className="relative text-[15px] text-ink-muted">{greeting()},</p>
        <h1 className="relative pr-[76px] text-[28px] font-bold leading-tight tracking-tight text-ink [overflow-wrap:anywhere]">
          {user.displayName ?? user.name}
        </h1>
      </div>

      <section className="px-5 pt-4">
        <MonthSummaryCard
          month={monthLabel(now)}
          hours={monthHours}
          approval={approval}
          onStatus={() => onOpenRequests('timesheets')}
          onSubmit={() => onOpen('timesheet')}
        />
      </section>

      <section className="space-y-3.5 px-5 pt-4">
        <WeeklyTimesheetCard
          weekHours={weekHours}
          weeks={monthWeeks(myTimesheets, today)}
          today={today}
          onOpen={() => onOpen('timesheet')}
          onOpenWeek={onOpenWeek}
        />

        {/* Leave on the left (both rows), Payslips and Holidays stacked on the right.
            Very narrow phones get one column instead. */}
        <div className="grid grid-cols-2 gap-3.5 max-[339px]:grid-cols-1">
          <LeaveSummaryCard balances={leaveBalance} onOpen={() => onOpen('leave')} />
          <div className="grid gap-3.5">
            <TintCard
              tint="lavender"
              icon="receipt"
              title="Payslips"
              detail={latestPayslip ? `Latest: ${payslipMonth(latestPayslip.title)}` : 'None yet'}
              art={<DocumentsArt key={payslipRise.count} rise={payslipRise.count > 0} />}
              cardRef={payslipRise.ref}
              onClick={() => onOpen('payslips')}
            />
            <TintCard
              tint={festivalTint(holidayTheme)}
              icon="calendar"
              title="Holidays"
              label="Holiday calendar"
              detail={
                holidaysLoading
                  ? 'Loading…'
                  : nextHoliday
                    ? `${formatShortDate(nextHoliday.date)} · ${nextHoliday.name}`
                    : holidays.length
                      ? 'None coming up'
                      : 'None published yet'
              }
              art={<FestivalArt theme={holidayTheme} animate={!!nextHoliday} />}
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
  { type: 'Compensation Letter', label: 'Compensation / Hike letter', pending: 'Issued with your yearly hike' },
]

/** "Payslip - August 2026" → "August" (the title HR's upload gives each payslip). */
export function payslipMonth(title: string): string {
  return title.replace(/^Payslip\s*-\s*/i, '').replace(/\s+\d{4}$/, '')
}

/** The Home dashboard's square icon holder: pale tint, coloured line icon. */
function DashTile({ icon, tone = 'blue' }: { icon: IconName; tone?: IconTileTone }) {
  const tones: Partial<Record<IconTileTone, string>> = {
    blue: 'bg-royal-50 text-royal-700',
    lavender: 'bg-lavender-50 text-lavender-600',
    gold: 'bg-gold-50 text-gold-600',
  }
  return (
    <span className={`grid h-12 w-12 shrink-0 place-items-center rounded-2xl ${tones[tone] ?? tones.blue}`}>
      <Icon name={icon} className="h-6 w-6" />
    </span>
  )
}

/* ---------- Month summary ---------- */

type ApprovalState = { tone: 'approved' | 'pending' | 'rejected' | 'none'; text: string }

// The status row on the month card: a tinted bar with a solid round badge.
const APPROVAL_LOOK: Record<ApprovalState['tone'], { icon: IconName; row: string; badge: string }> = {
  approved: { icon: 'check', row: 'bg-approved-strong/15 ring-approved-strong/35', badge: 'bg-approved-strong text-navy-950' },
  pending: { icon: 'clock', row: 'bg-pending-strong/15 ring-pending-strong/35', badge: 'bg-pending-strong text-navy-950' },
  rejected: { icon: 'x', row: 'bg-rejected-strong/15 ring-rejected-strong/35', badge: 'bg-rejected-strong text-navy-950' },
  none: { icon: 'info', row: 'bg-white/[0.08] ring-white/15', badge: 'bg-white/20 text-white' },
}

export function MonthSummaryCard({
  month, hours, approval, onStatus, onSubmit,
}: { month: string; hours: number; approval: ApprovalState; onStatus: () => void; onSubmit: () => void }) {
  const look = APPROVAL_LOOK[approval.tone]
  return (
    <div className="hero-card relative overflow-hidden rounded-[24px] p-5 text-white">
      <div className="relative">
        <p className="flex items-center gap-2.5 text-[15px] text-mist-100">
          <Icon name="calendar" className="h-5 w-5 text-mist-200" />
          {month}
        </p>
        <div className="mt-3 flex items-end gap-3">
          <span className="tnum text-[48px] font-bold leading-[0.9] tracking-tight">{hours}</span>
          <span className="pb-0.5 text-[15px] leading-snug text-mist-200">
            hours
            <br />
            logged this month
          </span>
        </div>

        <button
          type="button"
          onClick={onStatus}
          className={`mt-5 flex w-full items-center gap-3 rounded-2xl px-3.5 py-3 text-left text-[15px] font-medium text-white ring-1 ring-inset hover:brightness-110 ${look.row}`}
        >
          <span className={`grid h-7 w-7 shrink-0 place-items-center rounded-full ${look.badge}`}>
            <Icon name={look.icon} className="h-4 w-4" />
          </span>
          <span className="min-w-0 flex-1">{approval.text}</span>
          <Icon name="chevronRight" className="h-5 w-5 shrink-0 text-mist-100" />
        </button>

        <button
          type="button"
          onClick={onSubmit}
          className="press hero-button mt-4 grid h-14 w-full grid-cols-[1.25rem_1fr_1.25rem] items-center rounded-2xl px-4 text-[16px] font-semibold transition-transform duration-150"
        >
          <span />
          <span className="flex items-center justify-center gap-2.5">
            <Icon name="clock" className="h-6 w-6" /> Submit timesheet
          </span>
          <Icon name="chevronRight" className="h-5 w-5" />
        </button>
      </div>
    </div>
  )
}

/* ---------- Weekly timesheet status ---------- */

// Each week is a pale tile with a solid round badge; the current week's tile is
// filled with its status colour (white badge). Not submitted: a dashed circle.
const WEEK_LOOK: Record<MonthWeek['status'], { tile: string; current: string; badge: string; currentBadge: string; icon: IconName | null }> = {
  Approved: {
    tile: 'bg-approved-soft', current: 'bg-approved-strong',
    badge: 'bg-approved-strong text-white', currentBadge: 'bg-white text-approved-strong', icon: 'check',
  },
  Pending: {
    tile: 'bg-pending-soft', current: 'bg-pending-strong',
    badge: 'bg-pending-strong text-white', currentBadge: 'bg-white text-pending-strong', icon: 'clock',
  },
  Rejected: {
    tile: 'bg-rejected-soft', current: 'bg-rejected-strong',
    badge: 'bg-rejected-strong text-white', currentBadge: 'bg-white text-rejected-strong', icon: 'x',
  },
  'Not submitted': {
    tile: 'bg-mist-50', current: 'bg-mist-50 ring-2 ring-inset ring-royal-100',
    badge: '', currentBadge: '', icon: null,
  },
}

export function WeeklyTimesheetCard({
  weekHours, weeks, today, onOpen, onOpenWeek,
}: { weekHours: number; weeks: MonthWeek[]; today: string; onOpen: () => void; onOpenWeek: (weekStart: string) => void }) {
  return (
    <div className="card-surface rounded-[24px] border border-line px-4 pb-4 pt-4">
      <button
        type="button"
        onClick={onOpen}
        aria-label="Timesheet, this week"
        className="press flex w-full items-center gap-4 text-left transition-transform duration-150"
      >
        <DashTile icon="clock" />
        <div className="min-w-0 flex-1">
          <p className="text-[18px] font-bold text-ink">Timesheet</p>
          <p className="tnum text-[14px] text-ink-muted">{weekHours} h this week</p>
        </div>
        <Icon name="chevronRight" className="h-5 w-5 text-ink-muted" />
      </button>

      {/* This month, week by week: each week's status comes from all of its saved
          days. Tapping a week opens it; weeks that haven't started can't be opened. */}
      <div className="mt-4 grid gap-2" style={{ gridTemplateColumns: `repeat(${weeks.length}, minmax(0, 1fr))` }}>
        {weeks.map((w) => {
          const look = WEEK_LOOK[w.status]
          const openable = canOpenWeek(w.weekStart, today)
          return (
            <button
              key={w.weekStart}
              type="button"
              disabled={!openable}
              onClick={() => onOpenWeek(w.weekStart)}
              aria-label={`${w.label} (${w.range}): ${w.status}. ${openable ? 'Open this week' : 'Opens when the week starts'}`}
              className="press flex min-w-0 flex-col items-center gap-2 rounded-xl transition-transform duration-150 disabled:cursor-default"
            >
              <span className={`grid h-12 w-full place-items-center rounded-xl ${w.current ? look.current : look.tile}`}>
                {look.icon ? (
                  <span className={`grid h-7 w-7 place-items-center rounded-full ${w.current ? look.currentBadge : look.badge}`}>
                    <Icon name={look.icon} className="h-4 w-4" />
                  </span>
                ) : (
                  <span className="h-6 w-6 rounded-full border-2 border-dashed border-mist-300" />
                )}
              </span>
              <span className={`whitespace-nowrap text-[12px] ${w.current ? 'font-bold text-ink' : 'text-ink-muted'}`}>{w.label}</span>
            </button>
          )
        })}
      </div>
      <div className="mt-4 flex flex-wrap justify-between gap-x-2 gap-y-1.5 text-[11.5px] text-ink-soft">
        <Legend className="bg-approved-strong" label="Approved" />
        <Legend className="bg-pending-strong" label="Pending" />
        <Legend className="bg-rejected-strong" label="Rejected" />
        <Legend className="bg-not-submitted" label="Not submitted" />
      </div>
    </div>
  )
}

function Legend({ className, label }: { className: string; label: string }) {
  return (
    <span className="flex items-center gap-1.5">
      <span className={`h-2.5 w-2.5 rounded-full ${className}`} />
      {label}
    </span>
  )
}

/* ---------- Leave, Payslips, Holidays ---------- */

/**
 * Leave: a beach scene with the total available, then each leave type's
 * available days of its current balance (as set by HR) on a white panel.
 */
export function LeaveSummaryCard({ balances, onOpen }: { balances: LeaveBalance[]; onOpen: () => void }) {
  const available = balances.reduce((s, b) => s + b.left, 0)
  return (
    <button
      type="button"
      onClick={onOpen}
      aria-label="Leave"
      className="press tint-blue relative flex min-h-full flex-col overflow-hidden rounded-[24px] border border-line text-left transition-transform duration-150"
    >
      <span className="relative block px-4 pb-6 pt-4">
        <BeachArt />
        <span className="relative block">
          <DashTile icon="calendar" />
        </span>
        <span className="relative mt-3 block text-[18px] font-bold text-ink">Leave</span>
        <span className="tnum relative block text-[14px] text-ink-muted">
          {balances.length ? `${plural(available, 'day')} available` : 'Balance not set up yet'}
        </span>
      </span>
      {balances.length > 0 && (
        <span className="relative -mt-2 block flex-1 space-y-3 rounded-t-[20px] bg-white px-4 pb-4 pt-4 shadow-[0_-4px_14px_-10px_rgb(15_30_56/0.2)]">
          {balances.map((b) => (
            <span key={b.type} className="block">
              <span className="tnum mb-1.5 flex justify-between gap-2 text-[13px] text-ink-soft">
                <span className="truncate">{b.type}</span>
                <span className="shrink-0">
                  {b.left}/{b.total}
                </span>
              </span>
              <span
                className="block h-2 w-full overflow-hidden rounded-full bg-royal-50"
                role="progressbar"
                aria-label={`${b.type}: ${b.left} of ${b.total} days available`}
                aria-valuenow={b.left}
                aria-valuemax={b.total}
              >
                <span
                  className="block h-full rounded-full bg-royal-600/70"
                  style={{ width: `${b.total > 0 ? Math.min(100, Math.round((b.left / b.total) * 100)) : 0}%` }}
                />
              </span>
            </span>
          ))}
        </span>
      )}
    </button>
  )
}

/** A small tappable card with a coloured tint and a drawing in its corner. */
export function TintCard({
  tint, icon, title, label, detail, art, cardRef, onClick,
}: {
  tint: 'lavender' | 'gold' | 'blue'
  icon: IconName
  title: string
  label?: string
  detail: string
  art: ReactNode
  cardRef?: Ref<HTMLButtonElement>
  onClick: () => void
}) {
  return (
    <button
      ref={cardRef}
      type="button"
      onClick={onClick}
      aria-label={label ?? title}
      className={`press tint-${tint} relative flex min-h-[148px] flex-col overflow-hidden rounded-[24px] border border-line p-4 text-left transition-transform duration-150`}
    >
      {art}
      <span className="relative flex items-start justify-between">
        <DashTile icon={icon} tone={tint === 'lavender' ? 'lavender' : 'blue'} />
        <Icon name="chevronRight" className="mt-3 h-5 w-5 text-ink-muted" />
      </span>
      <span className="relative mt-3 text-[18px] font-bold text-ink">{title}</span>
      <span className="relative line-clamp-2 pr-10 text-[14px] leading-snug text-ink-muted">{detail}</span>
    </button>
  )
}

/* ---------- Documents and requests ---------- */

function DashboardSection({ title, action, children }: { title: string; action?: ReactNode; children: ReactNode }) {
  return (
    <section className="px-5 pt-7">
      <div className="mb-3 flex items-center justify-between gap-3">
        <h2 className="text-[21px] font-bold tracking-tight text-ink">{title}</h2>
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
      className="-my-2 -mr-2 flex items-center gap-1 rounded-md px-2 py-2 text-[15px] font-semibold text-royal-600 hover:bg-royal-50"
    >
      View all <Icon name="chevronRight" className="h-4 w-4" />
    </button>
  )
}

/** One white card holding rows split by thin lines. */
function RowCard({ children }: { children: ReactNode }) {
  return <div className="card-surface divide-y divide-line overflow-hidden rounded-[24px] border border-line">{children}</div>
}

/**
 * A key document: tapping the row opens it in Documents; when HR has issued it
 * there is a download button, otherwise a "Not issued" pill.
 */
export function DocumentRow({
  title, subtitle, onOpen, onDownload,
}: { title: string; subtitle: string; onOpen: () => void; onDownload?: () => void }) {
  return (
    <div className="flex min-h-[76px] items-center hover:bg-mist-50/60">
      <button type="button" onClick={onOpen} className="flex min-h-[76px] min-w-0 flex-1 items-center gap-4 py-3 pl-4 pr-2 text-left active:bg-mist-50">
        <DashTile icon="file" />
        <span className="min-w-0 flex-1">
          <span className="block text-[16px] font-semibold leading-snug text-ink">{title}</span>
          <span className="mt-0.5 block text-[14px] leading-snug text-ink-muted">{subtitle}</span>
        </span>
      </button>
      <div className="flex shrink-0 items-center pr-4">
        {onDownload ? (
          <button
            type="button"
            onClick={onDownload}
            aria-label={`Download ${title}`}
            className="grid h-10 w-10 place-items-center rounded-full bg-royal-50 text-royal-700 hover:bg-royal-100"
          >
            <Icon name="download" className="h-[18px] w-[18px]" />
          </button>
        ) : (
          <span className="inline-flex items-center gap-2 whitespace-nowrap rounded-lg bg-royal-50/80 px-2.5 py-1.5 text-[13px] text-ink-soft">
            <span className="h-2 w-2 rounded-full bg-not-submitted" />
            Not issued
          </span>
        )}
      </div>
    </div>
  )
}

export function RequestRow({
  icon, tone, title, subtitle, onClick,
}: { icon: IconName; tone: IconTileTone; title: string; subtitle: string; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className="flex min-h-[76px] w-full items-center gap-4 px-4 py-3 text-left hover:bg-mist-50/60 active:bg-mist-50">
      <DashTile icon={icon} tone={tone} />
      <span className="min-w-0 flex-1">
        <span className="block text-[16px] font-semibold leading-snug text-ink">{title}</span>
        <span className="mt-0.5 block text-[14px] leading-snug text-ink-muted">{subtitle}</span>
      </span>
      <Icon name="chevronRight" className="h-5 w-5 shrink-0 text-ink-muted" />
    </button>
  )
}

/* ---------- Decorative drawings (hidden from screen readers) ---------- */

/** A sun behind a small cloud, beside the greeting. */
function SkyArt({ part }: { part: DayPart }) {
  const cloud = <path d="M100 58a10 10 0 0 1 9-12 13 13 0 0 1 24-2 9 9 0 0 1 12 9 7 7 0 0 1-2 14h-38a8 8 0 0 1-5-9z" fill="#cfe0fa" />
  const rays = (cx: number, cy: number, from: number, to: number, angles: number[]) =>
    angles.map((a) => {
      const r = (a * Math.PI) / 180
      return <line key={a} x1={cx + Math.cos(r) * from} y1={cy + Math.sin(r) * from} x2={cx + Math.cos(r) * to} y2={cy + Math.sin(r) * to} />
    })
  return (
    <svg viewBox="62 0 98 76" aria-hidden="true" className="pointer-events-none absolute right-1 top-0 h-[66px] w-[85px]" fill="none">
      {part === 'morning' && (
        // A sun rising over the horizon, in soft dawn colours.
        <>
          <ellipse cx="96" cy="52" rx="34" ry="16" fill="#ffd9a8" fillOpacity="0.45" />
          <g transform="translate(96 52)">
            <g className="fx fx-bob">
              <g stroke="#f8a94a" strokeWidth="3" strokeLinecap="round">{rays(0, 0, 17, 23, [180, 210, 240, 270, 300, 330, 360])}</g>
              <path d="M-12 0a12 12 0 0 1 24 0z" fill="#fbb454" />
            </g>
          </g>
          <path d="M66 53 H128" stroke="#f3c48d" strokeWidth="2" strokeLinecap="round" />
          <path d="M76 60 H118" stroke="#f3d3ad" strokeWidth="2" strokeLinecap="round" strokeOpacity="0.8" />
          <g transform="translate(18 -12)">{cloud}</g>
        </>
      )}
      {part === 'afternoon' && (
        // A high, bright sun with slowly turning rays, behind a cloud.
        <>
          <g transform="translate(88 30)">
            <g className="fx fx-spin-slow" stroke="#f6b73c" strokeWidth="3" strokeLinecap="round">
              {rays(0, 0, 17, 23, [0, 45, 90, 135, 180, 225, 270, 315])}
            </g>
          </g>
          <circle cx="88" cy="30" r="12" fill="#f9c74f" />
          {cloud}
        </>
      )}
      {part === 'evening' && (
        // A crescent moon with twinkling stars and a drifting cloud.
        <>
          <path d="M92 12a18 18 0 1 0 18 24 14 14 0 1 1-18-24z" fill="#f3d27a" />
          {[
            { x: 126, y: 14, s: 4, at: 0 },
            { x: 74, y: 22, s: 3, at: 0.9 },
            { x: 140, y: 34, s: 2.6, at: 1.6 },
          ].map((st) => (
            <g key={st.x} transform={`translate(${st.x} ${st.y})`}>
              <path
                className="fx fx-twinkle"
                style={{ animationDelay: `${st.at}s` }}
                d={`M0 ${-st.s} L${st.s * 0.3} ${-st.s * 0.3} L${st.s} 0 L${st.s * 0.3} ${st.s * 0.3} L0 ${st.s} L${-st.s * 0.3} ${st.s * 0.3} L${-st.s} 0 L${-st.s * 0.3} ${-st.s * 0.3}Z`}
                fill="#f3d27a"
              />
            </g>
          ))}
          <g transform="translate(4 4)">{cloud}</g>
        </>
      )}
    </svg>
  )
}

/** A palm tree on a little island, with a cloud, at the top right of the Leave card. */
function BeachArt() {
  // Moving gently, as if in a sea breeze: the palm sways from its base, its
  // fronds flutter, a cloud drifts and two birds glide.
  return (
    <svg viewBox="0 0 120 100" aria-hidden="true" className="pointer-events-none absolute -right-4 bottom-0 h-[84px] w-[100px] text-royal-600" fill="none">
      <path d="M0 100 C20 82 50 76 72 78 C95 80 110 88 120 92 V100 Z" fill="currentColor" fillOpacity="0.1" />
      <path d="M40 100 C55 84 80 80 112 88 V100 Z" fill="currentColor" fillOpacity="0.14" />
      <g className="fx fx-bottom fx-sway" style={{ animationDuration: '5s' }}>
        <path d="M86 84 C86 66 84 50 78 36" stroke="currentColor" strokeOpacity="0.4" strokeWidth="4" strokeLinecap="round" />
        <g className="fx fx-bottom fx-sway" style={{ animationDuration: '2.6s', animationDelay: '-1s' }}>
          <path d="M78 36 C68 26 56 28 50 36 C60 32 70 34 78 36Z" fill="currentColor" fillOpacity="0.35" />
          <path d="M78 36 C80 22 92 18 100 22 C90 24 84 30 78 36Z" fill="currentColor" fillOpacity="0.35" />
          <path d="M78 36 C92 32 104 38 106 48 C98 40 88 38 78 36Z" fill="currentColor" fillOpacity="0.3" />
          <path d="M78 36 C70 40 64 50 66 58 C70 48 74 42 78 36Z" fill="currentColor" fillOpacity="0.25" />
        </g>
      </g>
      <g className="fx-drift">
        <path d="M20 74a7 7 0 0 1 6-8 9 9 0 0 1 16-1 6 6 0 0 1 4 11H24a5 5 0 0 1-4-2z" fill="currentColor" fillOpacity="0.12" />
      </g>
      <g className="fx-glide">
        <path d="M30 22 q4 -4 8 0 q4 -4 8 0" stroke="currentColor" strokeOpacity="0.35" strokeWidth="1.6" strokeLinecap="round" />
      </g>
      <g className="fx-glide" style={{ animationDelay: '-2.5s', animationDuration: '7.5s' }}>
        <path d="M50 12 q3 -3 6 0 q3 -3 6 0" stroke="currentColor" strokeOpacity="0.28" strokeWidth="1.4" strokeLinecap="round" />
      </g>
    </svg>
  )
}

/** Two pages on a lavender wave at the bottom right of the Payslips card. */
function DocumentsArt({ rise }: { rise: boolean }) {
  // rise: the two pages move up into place (each time the card is scrolled into view going down).
  return (
    <svg viewBox="0 0 120 90" aria-hidden="true" className="pointer-events-none absolute bottom-0 right-0 h-[74px] w-[98px] text-lavender-600" fill="none">
      <path d="M0 90 C30 80 50 40 90 30 C105 26 115 28 120 30 V90 Z" fill="currentColor" fillOpacity="0.1" />
      <g className={rise ? 'doc-rise-a' : ''}>
        <rect x="64" y="20" width="44" height="54" rx="6" transform="rotate(6 86 47)" fill="#fff" fillOpacity="0.85" stroke="currentColor" strokeOpacity="0.2" />
        <path d="M74 36h24M74 44h24M74 52h16" stroke="currentColor" strokeOpacity="0.35" strokeWidth="3" strokeLinecap="round" />
      </g>
      <g className={rise ? 'doc-rise-b' : ''}>
        <rect x="44" y="50" width="40" height="40" rx="6" fill="#fff" fillOpacity="0.9" stroke="currentColor" strokeOpacity="0.2" />
        <path d="M52 64h22M52 72h16" stroke="currentColor" strokeOpacity="0.35" strokeWidth="3" strokeLinecap="round" />
      </g>
    </svg>
  )
}

/**
 * Counts each time the element comes into view while the page is scrolled
 * down (never when scrolling back up to it, or when it is already on screen).
 * Used as a key to replay a one-off animation.
 */
function useRiseOnScrollDown<T extends Element>() {
  const ref = useRef<T | null>(null)
  const [count, setCount] = useState(0)
  useEffect(() => {
    const el = ref.current
    if (!el || typeof IntersectionObserver === 'undefined') return
    let lastY = window.scrollY
    let goingDown = false
    const onScroll = () => {
      const y = window.scrollY
      if (y !== lastY) goingDown = y > lastY
      lastY = y
    }
    window.addEventListener('scroll', onScroll, { passive: true })
    // Low threshold: the card's top is in view, its pages (at the bottom) not yet.
    const observer = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting && goingDown) setCount((c) => c + 1)
    }, { threshold: 0.25 })
    observer.observe(el)
    return () => {
      observer.disconnect()
      window.removeEventListener('scroll', onScroll)
    }
  }, [])
  return { ref, count }
}

