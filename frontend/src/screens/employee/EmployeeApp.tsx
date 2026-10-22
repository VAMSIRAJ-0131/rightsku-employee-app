import { useCallback, useEffect, useReducer, useState, type ReactNode } from 'react'
import { Icon } from '../../components/Icons'
import {
  AppHeader, Avatar, AvatarButton, BottomNav, Button, Card, CardButton, DetailRow, EmptyState,
  FilterChips, IconButton, IconTile, List, ListRow, Notice, Page, ProgressBar, Section,
  Segmented, Spinner, StatusBadge, Tag, TopBar, useToast,
} from '../../components/ui'
import type {
  DashboardData, DocType, Employee, EmployeeDocument, LeaveBalance, LeaveRequest, Timesheet,
} from '../../data/types'
import {
  currentWorkWeek, firstName, formatDate, formatShortDate, greeting, monthLabel, plural, toIsoDate,
} from '../../lib/format'
import { saveFile, type ApiError } from '../../lib/api'
import { downloadMyDocument, listMyDocuments, toEmployeeDocument } from '../../lib/documents'
import { INITIAL_EMPLOYEE_NAV, employeeNav, type EmployeeSubScreen, type EmployeeTab } from '../../lib/employeeNav'
import { MAX_DAYS_BACK, listMyTimesheets, toTimesheet } from '../../lib/workCalendar'
import TimesheetScreen from './TimesheetScreen'
import LeaveScreen from './LeaveScreen'
import { getMyLeaveBalances, getMyLeaveRequests, toLeaveBalance, toLeaveRequest, type LeaveBalanceRecord } from '../../lib/leave'
import WeeklyTimesheetHistory from './WeeklyTimesheetHistory'
import { weekCount } from '../../lib/timesheetHistory'
import ChangePasswordScreen from '../shared/ChangePasswordScreen'

type Tab = EmployeeTab
type SubScreen = EmployeeSubScreen
type DocFilter = 'All' | DocType

/** Loaded from the server: loading, failed (with a message) or ready. */
type Loaded<T> = { status: 'loading' } | { status: 'error'; message: string } | { status: 'ready'; items: T[] }

export default function EmployeeApp({
  user,
  data,
  token,
  onLogout,
  onSessionExpired,
  onPasswordChanged,
}: {
  user: Employee
  data: DashboardData
  /** JWT for API calls. Memory only. */
  token: string
  onLogout: () => void
  onSessionExpired: () => void
  /** The password was changed: every session has ended, so the app returns to sign-in. */
  onPasswordChanged: () => void
}) {
  const { notifications } = data
  const [nav, dispatch] = useReducer(employeeNav, INITIAL_EMPLOYEE_NAV)
  const { tab, sub } = nav
  const [requestsView, setRequestsView] = useState<'timesheets' | 'leaves'>('timesheets')
  const [docFilter, setDocFilter] = useState<DocFilter>('All')
  const { show, toast } = useToast()
  const [timesheetState, setTimesheetState] = useState<Loaded<Timesheet>>({ status: 'loading' })
  const [docState, setDocState] = useState<Loaded<EmployeeDocument>>({ status: 'loading' })
  const [version, setVersion] = useState(0)
  const [leaveState, setLeaveState] = useState<Loaded<LeaveRequest>>({ status: 'loading' })
  const [balanceRecords, setBalanceRecords] = useState<LeaveBalanceRecord[] | null>(null)
  const [balanceError, setBalanceError] = useState<string | null>(null)

  /** Shared handling for a failed request: sign out on 401, otherwise keep the message. */
  const handleError = useCallback(
    (error: ApiError) => {
      if (error.kind === 'unauthorized') onSessionExpired()
      return error
    },
    [onSessionExpired],
  )

  // The employee's own timesheets (the server only ever returns theirs).
  useEffect(() => {
    const controller = new AbortController()
    const today = new Date()
    const from = new Date(today)
    from.setDate(today.getDate() - MAX_DAYS_BACK)
    listMyTimesheets(token, toIsoDate(from), toIsoDate(today), controller.signal).then((result) => {
      if (controller.signal.aborted) return
      if (result.ok) setTimesheetState({ status: 'ready', items: result.data.map((r) => toTimesheet(r, user.id)) })
      else setTimesheetState({ status: 'error', message: handleError(result.error).message })
    })
    return () => controller.abort()
  }, [token, user.id, version, handleError])

  // The employee's own documents.
  useEffect(() => {
    const controller = new AbortController()
    listMyDocuments(token, controller.signal).then((result) => {
      if (controller.signal.aborted) return
      if (result.ok) setDocState({ status: 'ready', items: result.data.map((r) => toEmployeeDocument(r, user.id)) })
      else setDocState({ status: 'error', message: handleError(result.error).message })
    })
    return () => controller.abort()
  }, [token, user.id, version, handleError])

  // The employee's own leave balance (set by HR) and leave requests.
  useEffect(() => {
    const controller = new AbortController()
    getMyLeaveBalances(token, controller.signal).then((result) => {
      if (controller.signal.aborted) return
      if (result.ok) {
        setBalanceRecords(result.data)
        setBalanceError(null)
      } else setBalanceError(handleError(result.error).message)
    })
    getMyLeaveRequests(token, controller.signal).then((result) => {
      if (controller.signal.aborted) return
      if (result.ok) setLeaveState({ status: 'ready', items: result.data.map((r) => toLeaveRequest(r, user.id)) })
      else setLeaveState({ status: 'error', message: handleError(result.error).message })
    })
    return () => controller.abort()
  }, [token, user.id, version, handleError])

  const myTimesheets = timesheetState.status === 'ready' ? timesheetState.items : []
  const myLeaves = leaveState.status === 'ready' ? leaveState.items : []
  const leaveBalance: LeaveBalance[] = balanceRecords ? balanceRecords.map(toLeaveBalance) : []
  const myDocs = docState.status === 'ready' ? docState.items : []
  const unread = notifications.filter((n) => !n.read).length
  const pendingTs = myTimesheets.filter((t) => t.status === 'Pending')
  // Requests waiting for HR: timesheets count per week (one weekly submission), leave per request.
  const pendingTsWeeks = weekCount(pendingTs)
  const pendingLeaves = myLeaves.filter((l) => l.status === 'Pending')
  const payslips = myDocs.filter((d) => d.type === 'Payslip')

  const goTab = (next: Tab) => dispatch({ type: 'tab', tab: next })
  const setSub = (next: SubScreen) => (next ? dispatch({ type: 'open', sub: next }) : dispatch({ type: 'back' }))
  function openDocs(filter: DocFilter) {
    setDocFilter(filter)
    goTab('documents')
  }
  function openRequests(view: 'timesheets' | 'leaves') {
    setRequestsView(view)
    goTab('requests')
  }

  async function download(doc: EmployeeDocument) {
    show('Downloading…')
    const result = await downloadMyDocument(token, doc.id, `${doc.title}.pdf`)
    if (result.ok) {
      saveFile(result.data)
      show(`${doc.title} downloaded.`, 'success')
    } else {
      show(handleError(result.error).message, 'error')
    }
  }

  const leaveHistory =
    leaveState.status === 'error' ? (
      <LoadError message={leaveState.message} onRetry={() => setVersion((v) => v + 1)} />
    ) : leaveState.status === 'loading' ? (
      <LoadingCard label="Loading leave requests" />
    ) : (
      <LeaveList items={myLeaves} />
    )

  const timesheetHistory =
    timesheetState.status === 'error' ? (
      <LoadError message={timesheetState.message} onRetry={() => setVersion((v) => v + 1)} />
    ) : timesheetState.status === 'loading' ? (
      <LoadingCard label="Loading timesheets" />
    ) : (
      <WeeklyTimesheetHistory items={myTimesheets} />
    )

  let screen: ReactNode
  if (sub === 'password') {
    screen = (
      <ChangePasswordScreen
        token={token}
        loginId={user.id}
        role="employee"
        mode="voluntary"
        onBack={() => setSub(null)}
        onChanged={onPasswordChanged}
        onLogout={onLogout}
        onSessionExpired={onSessionExpired}
      />
    )
  } else if (sub === 'timesheet') {
    // The screen shows its own success message; after a submission the history reloads.
    screen = (
      <TimesheetScreen
        token={token}
        historyWeeks={weekCount(myTimesheets)}
        history={timesheetHistory}
        onBack={() => setSub(null)}
        onError={handleError}
        onSubmitted={() => setVersion((v) => v + 1)}
      />
    )
  } else if (sub === 'leave') {
    screen = (
      <LeaveScreen
        token={token}
        balances={balanceRecords}
        balanceError={balanceError}
        history={leaveHistory}
        onBack={() => setSub(null)}
        onError={handleError}
        onRetry={() => setVersion((v) => v + 1)}
        onSubmitted={() => setVersion((v) => v + 1)}
      />
    )
  } else if (sub === 'payslips') {
    const [latest, ...older] = payslips
    screen = (
      <>
        <TopBar title="Payslips" subtitle={plural(payslips.length, 'payslip') + ' available'} onBack={() => setSub(null)} />
        {latest ? (
          <>
            <Section title="Latest">
              <Card className="overflow-hidden">
                <div className="flex items-center gap-3 border-l-[3px] border-navy-900 px-4 py-4">
                  <IconTile icon="receipt" tone="navy" />
                  <div className="min-w-0 flex-1">
                    <p className="text-[16px] font-semibold text-ink">{latest.title.replace('Payslip - ', '')}</p>
                    <p className="text-[13px] text-ink-muted">Issued {formatDate(latest.issuedOn)}</p>
                  </div>
                  <Button size="sm" variant="secondary" onClick={() => download(latest)}>
                    <Icon name="download" className="h-4 w-4" /> Download
                  </Button>
                </div>
              </Card>
            </Section>
            {older.length > 0 && (
              <Section title="Earlier">
                <DocList items={older} onDownload={download} />
              </Section>
            )}
          </>
        ) : (
          <Section>
            <EmptyState icon="receipt" title="No payslips yet" message="Your monthly payslips appear here as soon as HR publishes them." />
          </Section>
        )}
      </>
    )
  } else if (sub === 'notifications') {
    screen = (
      <>
        <TopBar title="Notifications" subtitle={unread ? `${unread} unread` : 'All read'} onBack={() => setSub(null)} />
        <Section>
          {notifications.length === 0 ? (
            <EmptyState icon="bell" title="No notifications" message="Approvals and new documents will show up here." />
          ) : (
            <List>
              {notifications.map((n) => (
                <div key={n.id} className="flex gap-3 px-4 py-3.5">
                  <span className={`mt-[7px] h-2 w-2 shrink-0 rounded-full ${n.read ? 'bg-line-strong' : 'bg-accent'}`} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline justify-between gap-3">
                      <p className={`text-[15px] text-ink ${n.read ? 'font-medium' : 'font-semibold'}`}>{n.title}</p>
                      <p className="tnum shrink-0 text-[12px] text-ink-muted">{n.time}</p>
                    </div>
                    <p className="mt-0.5 text-[13px] leading-relaxed text-ink-muted">{n.message}</p>
                  </div>
                </div>
              ))}
            </List>
          )}
        </Section>
      </>
    )
  } else if (tab === 'home') {
    screen = (
      <HomeScreen
        user={user}
        unread={unread}
        myTimesheets={myTimesheets}
        myDocs={myDocs}
        pendingTsCount={pendingTsWeeks}
        pendingLeaveCount={pendingLeaves.length}
        payslips={payslips}
        leaveBalance={leaveBalance}
        onOpen={setSub}
        onOpenDocs={openDocs}
        onOpenRequests={openRequests}
        onOpenProfile={() => dispatch({ type: 'header-profile' })}
        onDownload={download}
      />
    )
  } else if (tab === 'requests') {
    screen = (
      <>
        <TopBar title="Requests" subtitle="Track approval status" />
        <Section>
          <Segmented
            options={[
              { id: 'timesheets', label: 'Timesheets', count: pendingTsWeeks },
              { id: 'leaves', label: 'Leave', count: pendingLeaves.length },
            ]}
            value={requestsView}
            onChange={setRequestsView}
          />
          <p className="mt-2 px-1 text-[12px] text-ink-muted">Counts show requests waiting for HR.</p>
        </Section>
        <Section title={requestsView === 'timesheets' ? 'Timesheets' : 'Leave applications'}>
          {requestsView === 'timesheets' ? timesheetHistory : leaveHistory}
        </Section>
      </>
    )
  } else if (tab === 'documents') {
    const filters: DocFilter[] = ['All', 'Offer Letter', 'Experience Letter', 'Payslip', 'Form 16']
    const shown = docFilter === 'All' ? myDocs : myDocs.filter((d) => d.type === docFilter)
    screen = (
      <>
        <TopBar title="Documents" subtitle="Visible only to you and HR" />
        <Section>
          <FilterChips options={filters} value={docFilter} onChange={setDocFilter} />
        </Section>
        <Section title={docFilter === 'All' ? `All documents (${shown.length})` : docFilter}>
          {docState.status === 'error' ? (
            <LoadError message={docState.message} onRetry={() => setVersion((v) => v + 1)} />
          ) : docState.status === 'loading' ? (
            <LoadingCard label="Loading documents" />
          ) : shown.length === 0 ? (
            <EmptyState icon="file" title="Not issued yet" message="HR uploads this document when it is ready. You’ll get a notification." />
          ) : (
            <DocList items={shown} onDownload={download} />
          )}
        </Section>
      </>
    )
  } else {
    screen = (
      <>
        <TopBar title="Profile" />
        <Section>
          <Card className="flex items-center gap-4 px-4 py-5">
            <Avatar name={user.name} size="lg" />
            <div className="min-w-0">
              <p className="truncate text-[18px] font-semibold text-ink">{user.name}</p>
              <p className="truncate text-[14px] text-ink-muted">{user.designation}</p>
              <p className="tnum mt-1.5">
                <Tag>{user.id}</Tag>
              </p>
            </div>
          </Card>
        </Section>
        <Section title="Work">
          <Card className="divide-y divide-line">
            <DetailRow icon="briefcase" label="Department" value={user.department} />
            <DetailRow icon="calendar" label="Joined" value={formatDate(user.joiningDate)} />
            <DetailRow icon="user" label="Reports to" value={user.manager} />
            <DetailRow icon="pin" label="Location" value={user.location} />
          </Card>
        </Section>
        <Section title="Contact">
          <Card className="divide-y divide-line">
            <DetailRow icon="mail" label="Email" value={user.email} />
            <DetailRow icon="phone" label="Phone" value={user.phone} />
          </Card>
          <p className="mt-2 px-1 text-[12px] text-ink-muted">To correct any detail, contact HR.</p>
        </Section>
        <Section title="Security">
          <List>
            <ListRow icon="lock" title="Change password" subtitle="At least 8 characters" onClick={() => setSub('password')} />
          </List>
        </Section>
        <Section>
          <Button variant="danger" onClick={onLogout} className="w-full">
            <Icon name="logout" className="h-[18px] w-[18px]" /> Log out
          </Button>
        </Section>
      </>
    )
  }

  return (
    <Page>
      {screen}
      <BottomNav
        items={[
          { id: 'home', label: 'Home', icon: 'home' },
          { id: 'requests', label: 'Requests', icon: 'list', badge: pendingTsWeeks + pendingLeaves.length },
          { id: 'documents', label: 'Documents', icon: 'folder' },
          { id: 'profile', label: 'Profile', icon: 'user' },
        ]}
        active={tab}
        onChange={goTab}
      />
      {toast}
    </Page>
  )
}

/* ---------- Home dashboard ---------- */

function HomeScreen({
  user, unread, myTimesheets, myDocs, pendingTsCount, pendingLeaveCount, payslips, leaveBalance,
  onOpen, onOpenDocs, onOpenRequests, onOpenProfile, onDownload,
}: {
  user: Employee
  unread: number
  myTimesheets: Timesheet[]
  myDocs: EmployeeDocument[]
  pendingTsCount: number
  pendingLeaveCount: number
  payslips: EmployeeDocument[]
  leaveBalance: LeaveBalance[]
  onOpen: (s: SubScreen) => void
  onOpenDocs: (f: DocFilter) => void
  onOpenRequests: (v: 'timesheets' | 'leaves') => void
  /** The header shortcut: opens the same Profile screen as the footer tab. */
  onOpenProfile: () => void
  onDownload: (doc: EmployeeDocument) => void
}) {
  const now = new Date()
  const month = toIsoDate(now).slice(0, 7)
  const monthEntries = myTimesheets.filter((t) => t.date.startsWith(month) && t.status !== 'Rejected')
  const monthHours = monthEntries.reduce((s, t) => s + t.hours, 0)
  const week = currentWorkWeek(now)
  const weekHours = week.reduce((s, d) => s + (myTimesheets.find((t) => t.date === d.iso)?.hours ?? 0), 0)
  const totalLeft = leaveBalance.reduce((s, b) => s + b.left, 0)
  const latestPayslip = payslips[0]
  const rejectedTs = myTimesheets.filter((t) => t.status === 'Rejected').length

  const statusLine =
    rejectedTs > 0
      ? `${plural(rejectedTs, 'timesheet')} rejected, needs changes`
      : pendingTsCount > 0
        ? `${plural(pendingTsCount, 'timesheet')} awaiting approval`
        : myTimesheets.length === 0
          ? 'No timesheets submitted yet'
          : 'All timesheets approved'

  // "pending" explains when HR issues each document if it isn't uploaded yet.
  const keyDocs: { type: DocType; label: string; pending: string }[] = [
    { type: 'Offer Letter', label: 'Offer letter', pending: 'Not uploaded yet' },
    { type: 'Experience Letter', label: 'Experience letter', pending: 'Issued when you leave' },
    { type: 'Form 16', label: 'Form 16', pending: 'Issued after each financial year' },
  ]

  return (
    <>
      <AppHeader
        start={
          <>
            <AvatarButton name={user.name} label="Open your profile" onClick={onOpenProfile} />
            <IconButton icon="bell" label={`Notifications, ${unread} unread`} dot={unread > 0} onClick={() => onOpen('notifications')} />
          </>
        }
      />

      <div className="px-5 pt-3">
        <p className="text-[14px] text-ink-muted">{greeting()},</p>
        <h1 className="text-[26px] font-semibold leading-tight tracking-tight text-ink">{firstName(user.name)}</h1>
      </div>

      {/* Summary panel */}
      <section className="px-5 pt-5">
        <div className="rounded-2xl bg-navy-900 p-5 text-white shadow-raised">
          <div className="flex items-center justify-between">
            <p className="text-[13px] font-medium text-mist-300">{monthLabel(now)}</p>
            <p className="text-[12px] text-mist-300">{user.department}</p>
          </div>
          <div className="mt-4 flex items-end gap-2">
            <span className="tnum text-[40px] font-semibold leading-none tracking-tight">{monthHours}</span>
            <span className="pb-1 text-[14px] text-mist-200">hours logged this month</span>
          </div>
          <button
            onClick={() => onOpenRequests('timesheets')}
            className="mt-4 flex w-full items-center gap-2 rounded-lg bg-white/[0.07] px-3 py-2.5 text-left text-[13px] text-mist-100 ring-1 ring-inset ring-white/10 hover:bg-white/10"
          >
            <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-accent" />
            <span className="flex-1">{statusLine}</span>
            <Icon name="chevronRight" className="h-4 w-4 text-mist-300" />
          </button>
          <Button variant="onDark" size="lg" onClick={() => onOpen('timesheet')} className="mt-4 w-full">
            <Icon name="clock" className="h-[18px] w-[18px]" /> Submit timesheet
          </Button>
        </div>
      </section>

      {/* Summary cards: wide timesheet card, then leave beside payslips and documents */}
      <section className="space-y-3 px-5 pt-3">
        <CardButton onClick={() => onOpen('timesheet')} className="block w-full p-4" label="Timesheet, this week">
          <div className="flex items-center gap-3">
            <IconTile icon="clock" />
            <div className="flex-1">
              <p className="text-[15px] font-semibold text-ink">Timesheet</p>
              <p className="tnum text-[13px] text-ink-muted">{weekHours} h this week</p>
            </div>
            <Icon name="chevronRight" className="h-[18px] w-[18px] text-ink-muted/70" />
          </div>
          <div className="mt-4 grid grid-cols-5 gap-2">
            {week.map((d) => {
              const entry = myTimesheets.find((t) => t.date === d.iso)
              const fill = entry ? Math.max(18, Math.min(100, (entry.hours / 9) * 100)) : 0
              const bar = entry?.status === 'Approved' ? 'bg-navy-700' : entry?.status === 'Rejected' ? 'bg-bad/70' : 'bg-mist-300'
              return (
                <div key={d.iso} className="flex flex-col items-center gap-1.5">
                  <div className="flex h-10 w-full items-end overflow-hidden rounded-md bg-mist-50">
                    {entry && <div className={`w-full rounded-md ${bar}`} style={{ height: `${fill}%` }} />}
                  </div>
                  <span className={`text-[11px] ${d.isToday ? 'font-semibold text-navy-900' : 'text-ink-muted'}`}>{d.label}</span>
                </div>
              )
            })}
          </div>
          <div className="mt-3 flex gap-4 text-[11px] text-ink-muted">
            <Legend className="bg-navy-700" label="Approved" />
            <Legend className="bg-mist-300" label="Pending" />
            <Legend className="bg-bad/70" label="Rejected" />
          </div>
        </CardButton>

        <div className="grid grid-cols-[1.15fr_1fr] gap-3">
          <CardButton onClick={() => onOpen('leave')} className="flex flex-col p-4" label="Leave">
            <IconTile icon="calendar" />
            <p className="mt-3 text-[15px] font-semibold text-ink">Leave</p>
            <p className="tnum text-[13px] text-ink-muted">
              {leaveBalance.length ? `${totalLeft} days available` : 'Balance not set up yet'}
            </p>
            <div className="mt-auto space-y-2 pt-4">
              {leaveBalance.map((b) => (
                <div key={b.type}>
                  <div className="tnum mb-1 flex justify-between text-[11px] text-ink-muted">
                    <span>{b.type}</span>
                    <span>{b.left}/{b.total}</span>
                  </div>
                  <ProgressBar value={b.left} max={b.total} />
                </div>
              ))}
            </div>
          </CardButton>

          <div className="grid gap-3">
            <CardButton onClick={() => onOpen('payslips')} className="p-4" label="Payslips">
              <IconTile icon="receipt" />
              <p className="mt-3 text-[15px] font-semibold text-ink">Payslips</p>
              <p className="truncate text-[13px] text-ink-muted">
                {latestPayslip ? `Latest: ${latestPayslip.title.replace('Payslip - ', '').replace(' 2026', '')}` : 'None yet'}
              </p>
            </CardButton>
            <CardButton onClick={() => onOpenDocs('All')} className="p-4" label="Documents">
              <IconTile icon="folder" />
              <p className="mt-3 text-[15px] font-semibold text-ink">Documents</p>
              <p className="tnum text-[13px] text-ink-muted">{plural(myDocs.length, 'file')}</p>
            </CardButton>
          </div>
        </div>
      </section>

      {/* Key documents */}
      <Section title="Your documents" action={<TextLink onClick={() => onOpenDocs('All')}>View all</TextLink>}>
        <List>
          {keyDocs.map(({ type, label, pending }) => {
            const doc = myDocs.find((d) => d.type === type)
            return (
              <ListRow
                key={type}
                icon="file"
                title={label}
                subtitle={doc ? `Issued ${formatDate(doc.issuedOn)}` : pending}
                onClick={() => onOpenDocs(type)}
                right={
                  doc ? (
                    <button
                      onClick={() => onDownload(doc)}
                      aria-label={`Download ${label}`}
                      className="grid h-11 w-11 shrink-0 place-items-center rounded-full text-navy-700 hover:bg-mist-50"
                    >
                      <Icon name="download" className="h-[18px] w-[18px]" />
                    </button>
                  ) : (
                    <StatusBadge status="Not issued" />
                  )
                }
              />
            )
          })}
        </List>
      </Section>

      {/* Request tracking */}
      <Section title="Track requests">
        <List>
          <ListRow
            icon="list"
            title="Timesheet approvals"
            subtitle={pendingTsCount ? `${pendingTsCount} pending` : 'Nothing pending'}
            onClick={() => onOpenRequests('timesheets')}
          />
          <ListRow
            icon="calendar"
            title="Leave applications"
            subtitle={pendingLeaveCount ? `${pendingLeaveCount} pending` : 'Nothing pending'}
            onClick={() => onOpenRequests('leaves')}
          />
        </List>
      </Section>
    </>
  )
}

/* ---------- Small pieces used above ---------- */

function LoadError({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="space-y-3" role="alert">
      <Notice tone="bad">{message}</Notice>
      <Button variant="secondary" onClick={onRetry}>
        Try again
      </Button>
    </div>
  )
}

function LoadingCard({ label }: { label: string }) {
  return (
    <Card className="flex items-center justify-center gap-2 px-4 py-8 text-[14px] text-ink-muted">
      <Spinner /> {label}
    </Card>
  )
}

function Legend({ className, label }: { className: string; label: string }) {
  return (
    <span className="flex items-center gap-1.5">
      <span className={`h-2 w-2 rounded-sm ${className}`} />
      {label}
    </span>
  )
}

function TextLink({ children, onClick }: { children: ReactNode; onClick: () => void }) {
  return (
    <button onClick={onClick} className="-my-2 -mr-2 rounded-md px-2 py-2 text-[13px] font-semibold text-navy-700 hover:bg-mist-50">
      {children}
    </button>
  )
}

function LeaveList({ items }: { items: LeaveRequest[] }) {
  if (items.length === 0)
    return <EmptyState icon="calendar" title="No leave applications" message="Applications you submit will appear here with their status." />
  return (
    <List>
      {items.map((l) => (
        <div key={l.id} className="px-4 py-3.5">
          <div className="flex items-center justify-between gap-3">
            <p className="text-[15px] font-medium text-ink">
              {l.type} leave
              <span className="tnum ml-2 font-normal text-ink-muted">{plural(l.days, 'day')}</span>
            </p>
            <StatusBadge status={l.status} />
          </div>
          <p className="tnum mt-1 text-[13px] text-ink-muted">
            {formatShortDate(l.from)}
            {l.from !== l.to ? ` to ${formatShortDate(l.to)}` : ''}, {l.reason}
          </p>
          {l.status === 'Rejected' && l.remark && (
            <div className="mt-2.5 rounded-md border-l-2 border-bad bg-bad-soft px-3 py-2 text-[12px] leading-relaxed text-bad">
              <span className="font-semibold">HR note:</span> {l.remark}
            </div>
          )}
        </div>
      ))}
    </List>
  )
}

function DocList({ items, onDownload }: { items: EmployeeDocument[]; onDownload: (doc: EmployeeDocument) => void }) {
  return (
    <List>
      {items.map((d) => (
        <ListRow
          key={d.id}
          icon={d.type === 'Payslip' ? 'receipt' : 'file'}
          title={d.title}
          subtitle={<span className="tnum">Issued {formatDate(d.issuedOn)}</span>}
          right={
            <button
              onClick={() => onDownload(d)}
              aria-label={`Download ${d.title}`}
              className="grid h-11 w-11 shrink-0 place-items-center rounded-full text-navy-700 hover:bg-mist-50"
            >
              <Icon name="download" className="h-[18px] w-[18px]" />
            </button>
          }
        />
      ))}
    </List>
  )
}
