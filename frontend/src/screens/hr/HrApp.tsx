import { useState, type ReactNode } from 'react'
import { Icon, type IconName } from '../../components/Icons'
import {
  AppHeader, Avatar, BottomNav, Button, Card, EmptyState, IconTile, List, ListRow,
  Notice, Page, Section, Segmented, SearchField, StatusBadge, Tag, TopBar, useToast,
} from '../../components/ui'
import type { DashboardData, DocType, Employee } from '../../data/types'
import { firstName, formatDate, formatShortDate, greeting, plural } from '../../lib/format'

type Tab = 'home' | 'approvals' | 'employees' | 'documents'
type SubScreen = 'roles' | 'reports' | 'audit' | null
type ApprovalView = 'timesheets' | 'leaves'

export default function HrApp({
  user,
  data,
  onLogout,
}: {
  user: Employee
  data: DashboardData
  onLogout: () => void
}) {
  const { timesheets, leaves, documents, employees, auditLog } = data
  const employeeName = (id: string) => employees.find((e) => e.id === id)?.name ?? id
  const [tab, setTab] = useState<Tab>('home')
  const [sub, setSub] = useState<SubScreen>(null)
  const [approvalView, setApprovalView] = useState<ApprovalView>('timesheets')
  const [search, setSearch] = useState('')
  const { show, toast } = useToast()

  const pendingTimesheets = timesheets.filter((t) => t.status === 'Pending')
  const pendingLeaves = leaves.filter((l) => l.status === 'Pending')
  const pendingTotal = pendingTimesheets.length + pendingLeaves.length
  const staff = employees.filter((e) => e.role === 'employee')
  const activeCount = staff.filter((e) => e.active).length

  function goTab(next: Tab) {
    setSub(null)
    setTab(next)
  }
  function openApprovals(view: ApprovalView) {
    setApprovalView(view)
    goTab('approvals')
  }
  const later = (what: string, phase: string) => () => show(`${what} becomes available in ${phase}.`)

  let screen: ReactNode
  if (sub === 'roles') {
    screen = (
      <>
        <TopBar title="Roles and access" subtitle={`${employees.length} user accounts`} onBack={() => setSub(null)} />
        <Section>
          <Notice>Changing roles arrives in Phase 3. From Phase 4 the server checks every permission.</Notice>
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
    const approved = timesheets.filter((t) => t.status === 'Approved').length
    const rejected = timesheets.filter((t) => t.status === 'Rejected').length
    const leaveApproved = leaves.filter((l) => l.status === 'Approved').length
    const leaveRejected = leaves.filter((l) => l.status === 'Rejected').length
    screen = (
      <>
        <TopBar title="Reports" subtitle="Summary of sample records" onBack={() => setSub(null)} />
        <Section title="Timesheets">
          <MetricStrip
            items={[
              { label: 'Pending', value: pendingTimesheets.length },
              { label: 'Approved', value: approved },
              { label: 'Rejected', value: rejected },
            ]}
          />
        </Section>
        <Section title="Leave">
          <MetricStrip
            items={[
              { label: 'Pending', value: pendingLeaves.length },
              { label: 'Approved', value: leaveApproved },
              { label: 'Rejected', value: leaveRejected },
            ]}
          />
        </Section>
        <Section title="People">
          <MetricStrip
            items={[
              { label: 'Active', value: activeCount },
              { label: 'Inactive', value: staff.length - activeCount },
              { label: 'Documents', value: documents.length },
            ]}
          />
        </Section>
        <Section>
          <Notice>Detailed reports and full approval history arrive in Phase 3.</Notice>
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
      ...pendingTimesheets.map((t) => ({
        id: t.id,
        name: employeeName(t.employeeId),
        kind: 'Timesheet',
        detail: `${formatShortDate(t.date)}, ${t.hours} h`,
        view: 'timesheets' as ApprovalView,
      })),
      ...pendingLeaves.map((l) => ({
        id: l.id,
        name: employeeName(l.employeeId),
        kind: 'Leave',
        detail: `${l.type}, ${plural(l.days, 'day')} from ${formatShortDate(l.from)}`,
        view: 'leaves' as ApprovalView,
      })),
    ]
    screen = (
      <>
        <AppHeader
          right={
            <>
              <Tag>HR/Admin</Tag>
              <Avatar name={user.name} size="sm" />
            </>
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
                <span className="tnum block text-[18px] font-semibold">{pendingTimesheets.length}</span>
                <span className="text-[12px] text-mist-300">Timesheets</span>
              </button>
              <button onClick={() => openApprovals('leaves')} className="px-3 py-2.5 text-left hover:bg-white/5">
                <span className="tnum block text-[18px] font-semibold">{pendingLeaves.length}</span>
                <span className="text-[12px] text-mist-300">Leave</span>
              </button>
            </div>
            <Button variant="onDark" size="lg" onClick={() => openApprovals(pendingTimesheets.length ? 'timesheets' : 'leaves')} className="mt-4 w-full">
              <Icon name="check" className="h-[18px] w-[18px]" /> Review approvals
            </Button>
          </div>
        </section>

        <section className="px-5 pt-3">
          <MetricStrip
            items={[
              { label: 'Active staff', value: activeCount },
              { label: 'Inactive', value: staff.length - activeCount },
              { label: 'Documents', value: documents.length },
            ]}
          />
        </section>

        <Section title="Waiting for review" action={<TextLink onClick={() => openApprovals('timesheets')}>Open queue</TextLink>}>
          {queue.length === 0 ? (
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
            <AdminRow icon="shield" title="Roles and access" meta={`${employees.length} accounts`} onClick={() => setSub('roles')} />
            <AdminRow icon="chart" title="Reports" meta="Summary" onClick={() => setSub('reports')} />
            <AdminRow icon="list" title="Audit log" meta={`${auditLog.length} recent`} onClick={() => setSub('audit')} />
          </List>
        </Section>

        <Section>
          <Button variant="danger" onClick={onLogout} className="w-full">
            <Icon name="logout" className="h-[18px] w-[18px]" /> Log out
          </Button>
        </Section>
      </>
    )
  } else if (tab === 'approvals') {
    const isTs = approvalView === 'timesheets'
    const count = isTs ? pendingTimesheets.length : pendingLeaves.length
    const approve = later('Approving', 'Phase 3')
    const reject = later('Rejecting', 'Phase 3')
    screen = (
      <>
        <TopBar title="Approvals" subtitle={`${pendingTotal} waiting for review`} />
        <Section>
          <Segmented
            options={[
              { id: 'timesheets', label: 'Timesheets', count: pendingTimesheets.length },
              { id: 'leaves', label: 'Leave', count: pendingLeaves.length },
            ]}
            value={approvalView}
            onChange={setApprovalView}
          />
        </Section>
        <Section title={`Pending (${count})`}>
          {count === 0 ? (
            <EmptyState icon="checkCircle" title="Nothing to review" message="New requests will appear here as employees submit them." />
          ) : (
            <div className="space-y-3">
              {isTs
                ? pendingTimesheets.map((t) => (
                    <ApprovalCard
                      key={t.id}
                      name={employeeName(t.employeeId)}
                      reference={t.id}
                      facts={[
                        ['Date', formatDate(t.date)],
                        ['Hours', `${t.hours} h`],
                      ]}
                      note={t.description}
                      onApprove={approve}
                      onReject={reject}
                    />
                  ))
                : pendingLeaves.map((l) => (
                    <ApprovalCard
                      key={l.id}
                      name={employeeName(l.employeeId)}
                      reference={l.id}
                      facts={[
                        ['Type', `${l.type}, ${plural(l.days, 'day')}`],
                        ['Dates', l.from === l.to ? formatShortDate(l.from) : `${formatShortDate(l.from)} to ${formatShortDate(l.to)}`],
                      ]}
                      note={l.reason}
                      onApprove={approve}
                      onReject={reject}
                    />
                  ))}
            </div>
          )}
        </Section>
      </>
    )
  } else if (tab === 'employees') {
    const q = search.trim().toLowerCase()
    const shown = staff.filter(
      (e) => !q || e.name.toLowerCase().includes(q) || e.id.toLowerCase().includes(q) || e.department.toLowerCase().includes(q),
    )
    screen = (
      <>
        <TopBar
          title="Employees"
          subtitle={`${activeCount} active, ${staff.length - activeCount} inactive`}
          right={
            <Button size="sm" onClick={later('Adding employees', 'Phase 3')}>
              <Icon name="plus" className="h-4 w-4" /> Add
            </Button>
          }
        />
        <Section>
          <SearchField value={search} onChange={setSearch} placeholder="Search by name, ID or department" />
        </Section>
        <Section title={q ? `Results (${shown.length})` : `All employees (${shown.length})`}>
          {shown.length === 0 ? (
            <EmptyState icon="search" title="No matching employees" message="Check the spelling, or search by Employee ID instead." />
          ) : (
            <List>
              {shown.map((e) => (
                <ListRow
                  key={e.id}
                  leading={<Avatar name={e.name} size="sm" />}
                  title={e.name}
                  subtitle={
                    <span className="tnum">
                      {e.id}, {e.designation}
                    </span>
                  }
                  right={
                    <span className="flex items-center gap-1">
                      <StatusBadge status={e.active ? 'Active' : 'Inactive'} />
                      <Icon name="chevronRight" className="h-[18px] w-[18px] text-ink-muted/70" />
                    </span>
                  }
                  onClick={later('Editing employee details', 'Phase 3')}
                />
              ))}
            </List>
          )}
        </Section>
      </>
    )
  } else {
    const types: { type: DocType; icon: IconName; hint: string }[] = [
      { type: 'Offer Letter', icon: 'file', hint: 'Per employee' },
      { type: 'Experience Letter', icon: 'file', hint: 'Issued on exit' },
      { type: 'Payslip', icon: 'receipt', hint: 'Monthly' },
      { type: 'Form 16', icon: 'file', hint: 'Yearly' },
    ]
    screen = (
      <>
        <TopBar title="Documents" subtitle="Upload and assign to employees" />
        <Section title="Upload">
          <List>
            {types.map((t) => (
              <ListRow
                key={t.type}
                icon={t.icon}
                title={t.type}
                subtitle={`${t.hint}, ${documents.filter((d) => d.type === t.type).length} on file`}
                right={
                  <Button size="sm" variant="secondary" onClick={later(`Uploading a ${t.type.toLowerCase()}`, 'Phase 3')}>
                    <Icon name="upload" className="h-4 w-4" /> Upload
                  </Button>
                }
              />
            ))}
          </List>
          <p className="mt-2 px-1 text-[12px] text-ink-muted">Every file is linked to one employee and one document type.</p>
        </Section>
        <Section title={`Recently uploaded (${documents.length})`}>
          {documents.length === 0 ? (
            <EmptyState icon="file" title="No documents uploaded yet" message="Uploaded documents will be listed here." />
          ) : (
          <List>
            {documents.map((d) => (
              <ListRow
                key={d.id}
                icon={d.type === 'Payslip' ? 'receipt' : 'file'}
                title={d.title}
                subtitle={
                  <span className="tnum">
                    {employeeName(d.employeeId)}, {formatShortDate(d.issuedOn)}
                  </span>
                }
              />
            ))}
          </List>
          )}
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

function ApprovalCard({
  name, reference, facts, note, onApprove, onReject,
}: {
  name: string
  reference: string
  facts: [string, string][]
  note: string
  onApprove: () => void
  onReject: () => void
}) {
  return (
    <Card className="p-4">
      <div className="flex items-center gap-3">
        <Avatar name={name} size="sm" />
        <div className="min-w-0 flex-1">
          <p className="truncate text-[15px] font-semibold text-ink">{name}</p>
          <p className="tnum text-[12px] text-ink-muted">Ref {reference}</p>
        </div>
        <StatusBadge status="Pending" />
      </div>
      <dl className="mt-3 grid grid-cols-2 gap-px overflow-hidden rounded-lg bg-line ring-1 ring-line">
        {facts.map(([k, v]) => (
          <div key={k} className="bg-mist-50/60 px-3 py-2">
            <dt className="text-[11px] text-ink-muted">{k}</dt>
            <dd className="tnum text-[14px] font-medium text-ink">{v}</dd>
          </div>
        ))}
      </dl>
      <p className="mt-3 text-[14px] leading-relaxed text-ink-soft">{note}</p>
      <div className="mt-4 grid grid-cols-2 gap-2">
        <Button variant="danger" size="sm" onClick={onReject}>
          <Icon name="x" className="h-4 w-4" /> Reject
        </Button>
        <Button size="sm" onClick={onApprove}>
          <Icon name="check" className="h-4 w-4" /> Approve
        </Button>
      </div>
    </Card>
  )
}
