import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { backStack } from '../../lib/backStack'
import { Icon, type IconName } from '../../components/Icons'
import {
  Avatar, BottomNav, CenteredHeader, Button, Card, EmptyState, IconTile, List, ListRow,
  Notice, Page, Section, Tag, TopBar, useToast,
} from '../../components/ui'
import type { DashboardData, Employee } from '../../data/types'
import type { ApiError } from '../../lib/api'
import { firstName, formatShortDate, greeting, plural } from '../../lib/format'
import { listEmployees } from '../../lib/employees'
import {
  EMPTY_SUMMARY, getApprovalSummary, listTimesheetWeeks, weekKey, type ApprovalSummary, type HrTimesheetWeek,
} from '../../lib/approvals'
import { days as dayCount, listLeaveRequests, type LeaveRequestRecord } from '../../lib/leave'
import ApprovalsScreen, { type ApprovalView } from './ApprovalsScreen'
import EmployeesScreen from './EmployeesScreen'
import HolidaysScreen from './HolidaysScreen'
import HrDocumentsScreen from './HrDocumentsScreen'
import SalarySummaryScreen from './SalarySummaryScreen'

type Tab = 'home' | 'approvals' | 'employees' | 'documents'
type SubScreen = 'roles' | 'reports' | 'audit' | 'holidays' | 'salary' | null

export default function HrApp({
  user,
  data,
  token,
  onLogout,
  onSessionExpired,
}: {
  user: Employee
  data: DashboardData
  /** JWT for API calls. Memory only. */
  token: string
  onLogout: () => void
  onSessionExpired: () => void
}) {
  const { documents, employees, auditLog } = data
  const [tab, setTab] = useState<Tab>('home')
  const [sub, setSub] = useState<SubScreen>(null)
  const [approvalView, setApprovalView] = useState<ApprovalView>('timesheets')
  const { show, toast } = useToast()
  const [countsVersion, setCountsVersion] = useState(0)
  const [counts, setCounts] = useState<{ active: number; inactive: number } | null>(null)

  // Real employee counts for the home screen and reports.
  useEffect(() => {
    const controller = new AbortController()
    listEmployees(token, { size: 1 }, controller.signal).then((result) => {
      if (controller.signal.aborted) return
      if (result.ok) setCounts({ active: result.data.activeCount, inactive: result.data.inactiveCount })
      else if (result.error.kind === 'unauthorized') onSessionExpired()
    })
    return () => controller.abort()
  }, [token, countsVersion, onSessionExpired])

  // Approvals: counts and pending lists, always from the server. Reloaded after every decision.
  const [approvalsVersion, setApprovalsVersion] = useState(0)
  const [summary, setSummary] = useState<ApprovalSummary>(EMPTY_SUMMARY)
  const [pendingWeeks, setPendingWeeks] = useState<HrTimesheetWeek[]>([])
  const [pendingLeaves, setPendingLeaves] = useState<LeaveRequestRecord[]>([])
  const [approvalsError, setApprovalsError] = useState<string | null>(null)

  const handleError = useCallback(
    (error: ApiError) => {
      if (error.kind === 'unauthorized') onSessionExpired()
      return error
    },
    [onSessionExpired],
  )

  useEffect(() => {
    const controller = new AbortController()
    Promise.all([
      getApprovalSummary(token, controller.signal),
      listTimesheetWeeks(token, 'PENDING', controller.signal),
      listLeaveRequests(token, 'PENDING', controller.signal),
    ]).then(([s, w, l]) => {
      if (controller.signal.aborted) return
      if (!s.ok) return setApprovalsError(handleError(s.error).message)
      if (!w.ok) return setApprovalsError(handleError(w.error).message)
      if (!l.ok) return setApprovalsError(handleError(l.error).message)
      setApprovalsError(null)
      setSummary(s.data)
      setPendingWeeks(w.data)
      setPendingLeaves(l.data)
    })
    return () => controller.abort()
  }, [token, approvalsVersion, handleError])

  const pendingTotal = summary.timesheets.pending + summary.leave.pending
  const activeCount = counts ? counts.active : '–'
  const inactiveCount = counts ? counts.inactive : '–'

  function goTab(next: Tab) {
    setSub(null)
    setTab(next)
    // Fresh counts and lists whenever HR comes back to Home or Approvals.
    if (next === 'home' || next === 'approvals') setApprovalsVersion((v) => v + 1)
  }
  // Android Back on a main tab with no back arrow returns to Home (screens with a
  // back arrow handle it themselves, above this). On Home the app goes to the background.
  const backToHome = useRef<() => boolean>(() => false)
  backToHome.current = () => {
    if (tab === 'home' && sub === null) return false
    goTab('home')
    return true
  }
  useEffect(() => backStack.push(() => backToHome.current(), 'app'), [])

  function openApprovals(view: ApprovalView) {
    setApprovalView(view)
    goTab('approvals')
    setApprovalsVersion((v) => v + 1)
  }

  let screen: ReactNode
  if (sub === 'salary') {
    screen = <SalarySummaryScreen token={token} onBack={() => setSub(null)} onToast={show} onError={handleError} />
  } else if (sub === 'holidays') {
    screen = (
      <HolidaysScreen token={token} onBack={() => setSub(null)} onToast={show} onSessionExpired={onSessionExpired} />
    )
  } else if (sub === 'roles') {
    screen = (
      <>
        <TopBar title="Roles and access" subtitle={`${employees.length} user accounts`} onBack={() => setSub(null)} />
        <Section>
          <Notice>Changing roles arrives in a later update. The server already checks every permission.</Notice>
        </Section>
        <Section title="Accounts">
          {employees.length === 0 ? (
            <EmptyState icon="users" title="No accounts listed yet" message="Accounts appear here once employee management is connected." />
          ) : (
          <List>
            {employees.map((e) => (
              <ListRow
                key={e.id}
                leading={<Avatar name={e.name} size="sm" />}
                title={e.name}
                subtitle={<span className="tnum">{e.id}</span>}
                right={
                  <span className="flex flex-col items-end gap-1">
                    <Tag>{e.role === 'hr' ? 'HR/Admin' : 'Employee'}</Tag>
                    {!e.active && <span className="text-[11px] text-ink-muted">Inactive</span>}
                  </span>
                }
              />
            ))}
          </List>
          )}
        </Section>
      </>
    )
  } else if (sub === 'reports') {
    screen = (
      <>
        <TopBar title="Reports" subtitle="Summary of saved records" onBack={() => setSub(null)} />
        <Section title="Timesheets (weeks)">
          <MetricStrip
            items={[
              { label: 'Pending', value: summary.timesheets.pending },
              { label: 'Approved', value: summary.timesheets.approved },
              { label: 'Rejected', value: summary.timesheets.rejected },
            ]}
          />
        </Section>
        <Section title="Leave">
          <MetricStrip
            items={[
              { label: 'Pending', value: summary.leave.pending },
              { label: 'Approved', value: summary.leave.approved },
              { label: 'Rejected', value: summary.leave.rejected },
            ]}
          />
        </Section>
        <Section title="People">
          <MetricStrip
            items={[
              { label: 'Active', value: activeCount },
              { label: 'Inactive', value: inactiveCount },
              { label: 'Documents', value: documents.length },
            ]}
          />
        </Section>
        <Section>
          <Notice>Detailed reports and full approval history arrive in a later update.</Notice>
        </Section>
      </>
    )
  } else if (sub === 'audit') {
    screen = (
      <>
        <TopBar title="Audit log" subtitle="Important admin actions" onBack={() => setSub(null)} />
        <Section>
          {auditLog.length === 0 ? (
            <EmptyState icon="list" title="No actions recorded yet" message="Important admin actions will be listed here." />
          ) : (
          <Card className="px-4 py-2">
            <ol className="relative">
              {auditLog.map((a, i) => (
                <li key={a.id} className="relative flex gap-3 py-3">
                  <span className="relative flex w-3 shrink-0 justify-center">
                    <span className="mt-1.5 h-2 w-2 rounded-full bg-navy-700 ring-4 ring-white" />
                    {i < auditLog.length - 1 && <span className="absolute bottom-[-14px] top-4 w-px bg-line-strong" />}
                  </span>
                  <div className="min-w-0">
                    <p className="text-[14px] font-medium leading-snug text-ink">{a.action}</p>
                    <p className="tnum mt-0.5 text-[12px] text-ink-muted">
                      {a.actor}, {a.time}
                    </p>
                  </div>
                </li>
              ))}
            </ol>
          </Card>
          )}
        </Section>
      </>
    )
  } else if (tab === 'home') {
    const queue = [
      ...pendingWeeks.map((w) => ({
        id: `ts-${weekKey(w)}`,
        name: w.employeeName ?? `Employee ${w.employeeId}`,
        kind: 'Timesheet',
        detail: `Week of ${formatShortDate(w.weekStart)}, ${Number(w.totalHours)} h`,
        view: 'timesheets' as ApprovalView,
      })),
      ...pendingLeaves.map((l) => ({
        id: `lv-${l.id}`,
        name: l.employeeName ?? `Employee ${l.employeeId}`,
        kind: 'Leave',
        detail: `${l.label}, ${plural(dayCount(l.days), 'day')} from ${formatShortDate(l.startDate)}`,
        view: 'leaves' as ApprovalView,
      })),
    ]
    screen = (
      <>
        <CenteredHeader
          start={<Tag>HR/Admin</Tag>}
          end={
            <button
              type="button"
              onClick={onLogout}
              aria-label="Log out"
              className="press inline-flex h-10 min-w-10 items-center justify-center gap-1.5 rounded-full bg-bad-soft/70 px-3 text-[13px] font-semibold text-bad ring-1 ring-inset ring-bad/15 transition-[background-color,transform] duration-150 hover:bg-bad-soft focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-navy-700"
            >
              <Icon name="logout" className="h-[18px] w-[18px] shrink-0" />
              <span className="hidden min-[360px]:inline">Log out</span>
            </button>
          }
        />
        <div className="px-5 pt-3">
          <p className="text-[14px] text-ink-muted">{greeting()},</p>
          <h1 className="text-[26px] font-semibold leading-tight tracking-tight text-ink">{firstName(user.name)}</h1>
        </div>

        {/* Review queue panel */}
        <section className="px-5 pt-5">
          <div className="rounded-2xl bg-navy-900 p-5 text-white shadow-raised">
            <p className="text-[13px] font-medium text-mist-300">Review queue</p>
            <div className="mt-3 flex items-end gap-2">
              <span className="tnum text-[40px] font-semibold leading-none tracking-tight">{pendingTotal}</span>
              <span className="pb-1 text-[14px] text-mist-200">requests waiting for you</span>
            </div>
            <div className="mt-4 grid grid-cols-2 divide-x divide-white/10 rounded-lg bg-white/[0.06] ring-1 ring-inset ring-white/10">
              <button onClick={() => openApprovals('timesheets')} className="px-3 py-2.5 text-left hover:bg-white/5">
                <span className="tnum block text-[18px] font-semibold">{summary.timesheets.pending}</span>
                <span className="text-[12px] text-mist-300">Timesheets</span>
              </button>
              <button onClick={() => openApprovals('leaves')} className="px-3 py-2.5 text-left hover:bg-white/5">
                <span className="tnum block text-[18px] font-semibold">{summary.leave.pending}</span>
                <span className="text-[12px] text-mist-300">Leave</span>
              </button>
            </div>
            <Button variant="onDark" size="lg" onClick={() => openApprovals(summary.timesheets.pending || !summary.leave.pending ? 'timesheets' : 'leaves')} className="mt-4 w-full">
              <Icon name="check" className="h-[18px] w-[18px]" /> Review approvals
            </Button>
          </div>
        </section>

        <section className="px-5 pt-3">
          <MetricStrip
            items={[
              { label: 'Active staff', value: activeCount },
              { label: 'Inactive', value: inactiveCount },
              { label: 'Documents', value: documents.length },
            ]}
          />
        </section>

        <Section title="Waiting for review" action={<TextLink onClick={() => openApprovals('timesheets')}>Open queue</TextLink>}>
          {approvalsError ? (
            <Notice tone="bad">{approvalsError}</Notice>
          ) : queue.length === 0 ? (
            <EmptyState icon="checkCircle" title="Queue is clear" message="New timesheets and leave applications will appear here." />
          ) : (
            <List>
              {queue.slice(0, 4).map((q) => (
                <ListRow
                  key={q.id}
                  leading={<Avatar name={q.name} size="sm" />}
                  title={q.name}
                  subtitle={
                    <span className="flex items-center gap-2">
                      <Tag>{q.kind}</Tag>
                      <span className="tnum truncate">{q.detail}</span>
                    </span>
                  }
                  onClick={() => openApprovals(q.view)}
                />
              ))}
            </List>
          )}
        </Section>

        <Section title="Administration">
          <List>
            <AdminRow icon="users" title="Employees" meta={`${activeCount} active`} onClick={() => goTab('employees')} />
            <AdminRow icon="upload" title="Documents" meta="Upload and assign" onClick={() => goTab('documents')} />
            <AdminRow icon="wallet" title="Salary summary" meta="Monthly payroll days" onClick={() => setSub('salary')} />
            <AdminRow icon="calendar" title="Holiday calendar" meta="Company holidays" onClick={() => setSub('holidays')} />
            <AdminRow icon="shield" title="Roles and access" meta={`${employees.length} accounts`} onClick={() => setSub('roles')} />
            <AdminRow icon="chart" title="Reports" meta="Summary" onClick={() => setSub('reports')} />
            <AdminRow icon="list" title="Audit log" meta={`${auditLog.length} recent`} onClick={() => setSub('audit')} />
          </List>
        </Section>

      </>
    )
  } else if (tab === 'approvals') {
    screen = (
      <ApprovalsScreen
        token={token}
        view={approvalView}
        onViewChange={setApprovalView}
        summary={summary}
        onChanged={() => setApprovalsVersion((v) => v + 1)}
        onError={handleError}
        onToast={show}
      />
    )
  } else if (tab === 'employees') {
    screen = (
      <EmployeesScreen
        token={token}
        onToast={show}
        onSessionExpired={onSessionExpired}
        onChanged={() => setCountsVersion((v) => v + 1)}
      />
    )
  } else {
    screen = (
      <HrDocumentsScreen
        token={token}
        onToast={show}
        onSessionExpired={onSessionExpired}
        onChanged={() => setCountsVersion((v) => v + 1)}
      />
    )
  }

  return (
    <Page>
      {/* Keyed by tab, so each newly opened tab fades in once. */}
      <div key={tab} className="screen-enter">
        {screen}
      </div>
      <BottomNav
        items={[
          { id: 'home', label: 'Home', icon: 'home' },
          { id: 'approvals', label: 'Approvals', icon: 'checkCircle', badge: pendingTotal },
          { id: 'employees', label: 'Employees', icon: 'users' },
          { id: 'documents', label: 'Documents', icon: 'folder' },
        ]}
        active={tab}
        onChange={goTab}
      />
      {toast}
    </Page>
  )
}

/* ---------- Pieces used above ---------- */

function MetricStrip({ items }: { items: { label: string; value: number | string }[] }) {
  return (
    <Card>
      <div className="grid divide-x divide-line" style={{ gridTemplateColumns: `repeat(${items.length}, minmax(0, 1fr))` }}>
        {items.map((m) => (
          <div key={m.label} className="px-3.5 py-3">
            <p className="tnum text-[20px] font-semibold tracking-tight text-ink">{m.value}</p>
            <p className="truncate text-[12px] text-ink-muted">{m.label}</p>
          </div>
        ))}
      </div>
    </Card>
  )
}

function AdminRow({ icon, title, meta, onClick }: { icon: IconName; title: string; meta: string; onClick: () => void }) {
  return (
    <ListRow
      leading={<IconTile icon={icon} />}
      title={title}
      onClick={onClick}
      right={
        <span className="flex items-center gap-1 text-[13px] text-ink-muted">
          {meta}
          <Icon name="chevronRight" className="h-[18px] w-[18px] text-ink-muted/70" />
        </span>
      }
    />
  )
}

function TextLink({ children, onClick }: { children: ReactNode; onClick: () => void }) {
  return (
    <button onClick={onClick} className="-my-2 -mr-2 rounded-md px-2 py-2 text-[13px] font-semibold text-navy-700 hover:bg-mist-50">
      {children}
    </button>
  )
}
