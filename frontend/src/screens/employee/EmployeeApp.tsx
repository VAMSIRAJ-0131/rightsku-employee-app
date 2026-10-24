import { useCallback, useEffect, useLayoutEffect, useReducer, useRef, useState, type ReactNode } from 'react'
import { Icon } from '../../components/Icons'
import {
  AppHeader, Avatar, AvatarButton, BottomNav, Button, Card, CardButton, DetailRow, EmptyState,
  IconButton, IconTile, List, ListRow, LogoutButton, Notice, Page, ProgressBar, Section,
  Segmented, Spinner, StatusBadge, Tag, TopBar, useToast,
} from '../../components/ui'
import type {
  DashboardData, DocType, Employee, EmployeeDocument, LeaveBalance, LeaveRequest, Timesheet,
} from '../../data/types'
import {
  currentWorkWeek, firstName, formatDate, formatShortDate, greeting, monthLabel, plural, toIsoDate,
} from '../../lib/format'
import type { ApiError } from '../../lib/api'
import { saveDownloadedFile, savedMessage } from '../../lib/fileSave'
import {
  documentFilterOptions, downloadMyDocument, filterDocuments, listMyDocuments, toEmployeeDocument,
} from '../../lib/documents'
import { INITIAL_EMPLOYEE_NAV, canGoBack, employeeNav, type EmployeeSubScreen, type EmployeeTab } from '../../lib/employeeNav'
import { backStack } from '../../lib/backStack'
import { setStatusBarTheme } from '../../lib/statusBar'
import {
  THEME_CHOICES, applyTheme, onSystemThemeChange, readThemeChoice, resolveTheme, saveThemeChoice, systemPrefersDark,
  type ThemeChoice,
} from '../../lib/theme'
import { MAX_DAYS_BACK, addDays, getMyCalendar, listMyTimesheets, toTimesheet, weekStartOf } from '../../lib/workCalendar'
import ConfirmSheet from '../../components/ConfirmSheet'
import Spotlight from '../../components/Spotlight'
import IdCardSheet from './IdCard'
import TimesheetScreen from './TimesheetScreen'
import LeaveScreen from './LeaveScreen'
import { getMyLeaveBalances, getMyLeaveRequests, toLeaveBalance, toLeaveRequest, type LeaveBalanceRecord } from '../../lib/leave'
import WeeklyTimesheetHistory from './WeeklyTimesheetHistory'
import Dropdown from '../../components/Dropdown'
import { canOpenWeek, monthWeeks, weekCount, type MonthWeekStatus } from '../../lib/timesheetHistory'
import ChangePasswordScreen from '../shared/ChangePasswordScreen'
import { getMyProfile, withProfileRecord } from '../../lib/profile'
import {
  clearAllNotifications, clearNotification, listMyNotifications, markAllNotificationsRead, markNotificationRead,
  notificationTarget, timeAgo, type NotificationRecord,
} from '../../lib/notifications'
import { listMyHolidays, upcomingHolidays, type HolidayRecord } from '../../lib/workCalendar'
import { loadMyPhoto } from '../../lib/photos'
import { notifyDownloaded, notifyNewInbox, setInboxOpener } from '../../lib/systemNotifications'
import { App as CapacitorApp } from '@capacitor/app'

type Tab = EmployeeTab
type SubScreen = EmployeeSubScreen
type DocFilter = 'All' | DocType

/** Loaded from the server: loading, failed (with a message) or ready. */
type Loaded<T> = { status: 'loading' } | { status: 'error'; message: string } | { status: 'ready'; items: T[] }

export default function EmployeeApp({
  user: sessionUser,
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
  // Notifications come from the server (GET /api/employee/notifications), not from data.
  void data
  const [nav, dispatch] = useReducer(employeeNav, INITIAL_EMPLOYEE_NAV)
  const { choice: themeChoice, theme, choose: chooseTheme } = useEmployeeTheme()
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
  // Starts from the login response; the real name and work details replace it once loaded.
  const [user, setUser] = useState<Employee>(sessionUser)
  const [notifState, setNotifState] = useState<Loaded<NotificationRecord>>({ status: 'loading' })
  const [unread, setUnread] = useState(0)
  const [holidayState, setHolidayState] = useState<Loaded<HolidayRecord>>({ status: 'loading' })
  // Object URL of the employee's own photo (set by HR), or null for initials.
  const [photoUrl, setPhotoUrl] = useState<string | null>(null)
  // The record a tapped notification points at, on the screen it opened (outlined there).
  const [focus, setFocus] = useState<{ tab: Tab; sub: SubScreen; key: string | null } | null>(null)
  const [leaveTab, setLeaveTab] = useState<'leave' | 'compoff'>('leave')
  const [confirmClearAll, setConfirmClearAll] = useState(false)
  const [showIdCard, setShowIdCard] = useState(false)
  // This week's weekly offs and hours, from the server's calendar (the HR schedule in force).
  const [schedule, setSchedule] = useState<{ offs: string[]; hours: number } | null>(null)

  /** Shared handling for a failed request: sign out on 401, otherwise keep the message. */
  const handleError = useCallback(
    (error: ApiError) => {
      if (error.kind === 'unauthorized') onSessionExpired()
      return error
    },
    [onSessionExpired],
  )

  // The employee's own profile (name, department, job title, ...). If it fails,
  // the dashboard keeps the Employee ID as the name; nothing else depends on it.
  useEffect(() => {
    const controller = new AbortController()
    getMyProfile(token, controller.signal).then((result) => {
      if (controller.signal.aborted) return
      if (result.ok) setUser((current) => withProfileRecord(current, result.data))
      else handleError(result.error)
    })
    return () => controller.abort()
  }, [token, handleError])

  // The employee's own photo. No photo (or an older server) simply keeps the initials.
  useEffect(() => {
    const controller = new AbortController()
    let url: string | null = null
    loadMyPhoto(token, controller.signal).then((result) => {
      if (controller.signal.aborted) {
        if (result.ok && result.data) URL.revokeObjectURL(result.data)
        return
      }
      if (result.ok) {
        url = result.data
        setPhotoUrl(result.data)
      } else handleError(result.error)
    })
    return () => {
      controller.abort()
      if (url) URL.revokeObjectURL(url)
    }
  }, [token, handleError])

  // Notifications written by the server when HR acts. Reloaded with the other lists.
  const loadNotifications = useCallback(
    (signal?: AbortSignal) =>
      listMyNotifications(token, signal).then((result) => {
        if (signal?.aborted) return
        if (result.ok) {
          setNotifState({ status: 'ready', items: result.data.items })
          setUnread(result.data.unreadCount)
          // New ones also go to the phone's notification centre (while the app is open).
          void notifyNewInbox(sessionUser.id, result.data.items)
        } else setNotifState({ status: 'error', message: handleError(result.error).message })
      }),
    [token, handleError, sessionUser.id],
  )
  useEffect(() => {
    const controller = new AbortController()
    loadNotifications(controller.signal)
    return () => controller.abort()
  }, [loadNotifications, version])

  // Check for new notifications every minute while the app is on screen, and
  // straight away when it comes back to the front. Nothing runs in the background.
  useEffect(() => {
    const refresh = () => {
      if (document.visibilityState === 'visible') loadNotifications()
    }
    const timer = window.setInterval(refresh, 60_000)
    document.addEventListener('visibilitychange', refresh)
    const resume = CapacitorApp.addListener('resume', refresh).catch(() => null)
    return () => {
      window.clearInterval(timer)
      document.removeEventListener('visibilitychange', refresh)
      resume.then((h) => h?.remove()).catch(() => {})
    }
  }, [loadNotifications])

  // Tapping an "approval" phone notification opens this list.
  useEffect(() => {
    setInboxOpener(() => dispatch({ type: 'open', sub: 'notifications' }))
    return () => setInboxOpener(null)
  }, [])

  // The weekly offs and hours in force this week (from the HR schedule), for Profile.
  useEffect(() => {
    const controller = new AbortController()
    const monday = weekStartOf(toIsoDate(new Date()))
    getMyCalendar(token, monday, addDays(monday, 6), controller.signal).then((result) => {
      if (controller.signal.aborted || !result.ok) return
      const offs = result.data.days.filter((d) => d.weeklyOff)
        .map((d) => new Date(`${d.date}T00:00:00`).toLocaleDateString('en-US', { weekday: 'long' }))
      const working = result.data.days.find((d) => !d.weeklyOff)
      setSchedule({ offs, hours: working ? Number(working.hoursPerDay) : 0 })
    })
    return () => controller.abort()
  }, [token, version])

  // The Leave screen opens on its first tab unless a Comp-Off notification opened it.
  useEffect(() => {
    if (sub !== 'leave') setLeaveTab('leave')
  }, [sub])

  // This year's company holidays (published by HR).
  useEffect(() => {
    const controller = new AbortController()
    listMyHolidays(token, new Date().getFullYear(), controller.signal).then((result) => {
      if (controller.signal.aborted) return
      if (result.ok) setHolidayState({ status: 'ready', items: result.data })
      else setHolidayState({ status: 'error', message: handleError(result.error).message })
    })
    return () => controller.abort()
  }, [token, version, handleError])

  /** Tapping a notification: marks it read and opens the record it is about (only the employee's own). */
  async function openNotification(n: NotificationRecord) {
    goToNotificationTarget(n)
    if (n.read) return
    // Shown as read straight away; the server is the record.
    setNotifState((s) => (s.status === 'ready' ? { ...s, items: s.items.map((x) => (x.id === n.id ? { ...x, read: true } : x)) } : s))
    setUnread((u) => Math.max(0, u - 1))
    const result = await markNotificationRead(token, n.id)
    if (!result.ok) {
      show(handleError(result.error).message, 'error')
      loadNotifications()
    }
  }

  function goToNotificationTarget(n: NotificationRecord) {
    const target = notificationTarget(n)
    const gone = (what: string) => show(`This ${what} is no longer available.`, 'info')
    switch (target.screen) {
      case 'requests': {
        setRequestsView(target.view)
        setFocus({ tab: 'requests', sub: null, key: target.key })
        goTab('requests')
        if (target.key && target.view === 'leaves' && leaveState.status === 'ready' && !myLeaves.some((l) => l.id === target.key)) gone('leave request')
        if (target.key && target.view === 'timesheets' && timesheetState.status === 'ready'
          && !myTimesheets.some((t) => weekStartOf(t.date) === target.key)) gone('timesheet week')
        return
      }
      case 'payslips':
        setFocus({ tab, sub: 'payslips', key: target.key })
        dispatch({ type: 'open', sub: 'payslips' })
        if (target.key && docState.status === 'ready' && !payslips.some((d) => d.id === target.key)) gone('payslip')
        return
      case 'documents':
        setDocFilter('All')
        setFocus({ tab: 'documents', sub: null, key: target.key })
        goTab('documents')
        if (target.key && docState.status === 'ready' && !myDocs.some((d) => d.id === target.key)) gone('document')
        return
      case 'compoff':
        setLeaveTab('compoff')
        setFocus({ tab, sub: 'leave', key: target.key })
        dispatch({ type: 'open', sub: 'leave' })
        return
      case 'schedule':
        setFocus({ tab: 'profile', sub: null, key: 'schedule' })
        goTab('profile')
        return
      default:
        return
    }
  }

  /** Clears one notification from the list. The leave, timesheet or document it is about is not touched. */
  async function clearOne(n: NotificationRecord) {
    setNotifState((s) => (s.status === 'ready' ? { ...s, items: s.items.filter((x) => x.id !== n.id) } : s))
    if (!n.read) setUnread((u) => Math.max(0, u - 1))
    const result = await clearNotification(token, n.id)
    if (result.ok) {
      setNotifState({ status: 'ready', items: result.data.items })
      setUnread(result.data.unreadCount)
    } else {
      show(handleError(result.error).message, 'error')
      loadNotifications()
    }
  }

  async function clearAll() {
    setConfirmClearAll(false)
    const result = await clearAllNotifications(token)
    if (result.ok) {
      setNotifState({ status: 'ready', items: result.data.items })
      setUnread(result.data.unreadCount)
      show('Notifications cleared.', 'success')
    } else show(handleError(result.error).message, 'error')
  }

  /** Whether the record with this key was the one a tapped notification opened here. */
  const focused = (key: string) => !!focus && focus.tab === tab && focus.sub === sub && focus.key === key

  async function readAll() {
    const result = await markAllNotificationsRead(token)
    if (result.ok) {
      setNotifState({ status: 'ready', items: result.data.items })
      setUnread(result.data.unreadCount)
    } else show(handleError(result.error).message, 'error')
  }

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
  const notifications = notifState.status === 'ready' ? notifState.items : []
  const holidays = holidayState.status === 'ready' ? holidayState.items : []
  const pendingTs = myTimesheets.filter((t) => t.status === 'Pending')
  // Requests waiting for HR: timesheets count per week (one weekly submission), leave per request.
  const pendingTsWeeks = weekCount(pendingTs)
  const pendingLeaves = myLeaves.filter((l) => l.status === 'Pending')
  const payslips = myDocs.filter((d) => d.type === 'Payslip')

  const goTab = (next: Tab) => dispatch({ type: 'tab', tab: next })
  /** The previous screen, or Home when there is none. */
  const goBack = () => dispatch({ type: 'back' })

  // Fallback for Android Back on any screen without a back arrow;
  // screens with an arrow and open pop-ups handle it first. On Home the app goes to the background.
  const navRef = useRef(nav)
  navRef.current = nav
  useEffect(
    () => backStack.push(() => {
      if (!canGoBack(navRef.current)) return false
      dispatch({ type: 'back' })
    }, 'app'),
    [],
  )
  // The week the timesheet opens on: one picked on the home card, or this week (null).
  const [timesheetWeek, setTimesheetWeek] = useState<string | null>(null)
  const setSub = (next: SubScreen) => {
    if (next === 'timesheet') setTimesheetWeek(null)
    if (next) dispatch({ type: 'open', sub: next })
    else dispatch({ type: 'back' })
  }
  function openTimesheetWeek(weekStart: string) {
    dispatch({ type: 'open', sub: 'timesheet' })
    setTimesheetWeek(weekStart)
  }
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
    const result = await downloadMyDocument(token, doc.id, doc.title)
    if (!result.ok) {
      show(handleError(result.error).message, 'error')
      return
    }
    // Success only once the file is really saved (on Android: in Documents/RightCentral).
    const saved = await saveDownloadedFile(result.data, doc.title)
    if (saved.ok) {
      show(savedMessage(doc.title, saved), 'success')
      // Also in the phone's notification centre; tapping it opens the file.
      if (saved.method === 'saved') void notifyDownloaded(saved, doc.title)
    } else show(saved.message, saved.cancelled ? 'info' : 'error')
  }

  const leaveHistory =
    leaveState.status === 'error' ? (
      <LoadError message={leaveState.message} onRetry={() => setVersion((v) => v + 1)} />
    ) : leaveState.status === 'loading' ? (
      <LoadingCard label="Loading leave requests" />
    ) : (
      <LeaveList items={myLeaves} highlight={focused} />
    )

  const timesheetHistory =
    timesheetState.status === 'error' ? (
      <LoadError message={timesheetState.message} onRetry={() => setVersion((v) => v + 1)} />
    ) : timesheetState.status === 'loading' ? (
      <LoadingCard label="Loading timesheets" />
    ) : (
      <WeeklyTimesheetHistory items={myTimesheets} highlightWeek={focus && focus.tab === tab && focus.sub === sub ? focus.key : null} />
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
        key={timesheetWeek ?? 'this-week'}
        token={token}
        initialWeekStart={timesheetWeek ?? undefined}
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
        initialTab={leaveTab}
        highlightCompOffId={focus?.sub === 'leave' ? focus.key : null}
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
              <Spotlight on={focused(latest.id)}>
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
              </Spotlight>
            </Section>
            {older.length > 0 && (
              <Section title="Earlier">
                <DocList items={older} onDownload={download} highlight={focused} />
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
        {notifications.length > 0 && (
          <div className="flex justify-end gap-4 px-5 pt-3">
            {unread > 0 && <TextLink onClick={readAll}>Mark all as read</TextLink>}
            <TextLink onClick={() => setConfirmClearAll(true)}>Clear all</TextLink>
          </div>
        )}
        {confirmClearAll && (
          <ConfirmSheet
            title="Clear all notifications?"
            message="They are removed from this list only. Your leave, timesheets, payslips and documents stay as they are."
            confirmLabel="Clear all"
            danger
            onCancel={() => setConfirmClearAll(false)}
            onConfirm={clearAll}
          />
        )}
        <Section>
          {notifState.status === 'error' ? (
            <LoadError message={notifState.message} onRetry={() => setVersion((v) => v + 1)} />
          ) : notifState.status === 'loading' ? (
            <LoadingCard label="Loading notifications" />
          ) : notifications.length === 0 ? (
            <EmptyState icon="bell" title="No notifications" message="Leave and timesheet decisions, payslips and new documents will show up here." />
          ) : (
            <List>
              {notifications.map((n) => (
                <div key={n.id} className={`flex items-start ${n.read ? '' : 'bg-mist-50/70'}`}>
                  <button
                    type="button"
                    onClick={() => openNotification(n)}
                    aria-label={`${n.read ? '' : 'Unread: '}${n.title}. Open`}
                    className={`flex min-w-0 flex-1 gap-3 py-3.5 pl-4 pr-1 text-left ${n.read ? 'hover:bg-mist-50/60' : 'hover:bg-mist-50'}`}
                  >
                    <span className={`mt-[7px] h-2 w-2 shrink-0 rounded-full ${n.read ? 'bg-line-strong' : notificationDot(n.type)}`} />
                    <span className="min-w-0 flex-1">
                      <span className="flex items-baseline justify-between gap-3">
                        <span className={`text-[15px] text-ink ${n.read ? 'font-medium' : 'font-semibold'}`}>{n.title}</span>
                        <span className="tnum shrink-0 text-[12px] text-ink-muted">{timeAgo(n.createdAt)}</span>
                      </span>
                      <span className="mt-0.5 block text-[13px] leading-relaxed text-ink-muted">{n.message}</span>
                    </span>
                  </button>
                  <button
                    type="button"
                    onClick={() => clearOne(n)}
                    aria-label={`Clear notification: ${n.title}`}
                    className="mr-1.5 mt-2 grid h-10 w-10 shrink-0 place-items-center rounded-full text-ink-muted hover:bg-mist-50 hover:text-ink"
                  >
                    <Icon name="x" className="h-4 w-4" />
                  </button>
                </div>
              ))}
            </List>
          )}
        </Section>
      </>
    )
  } else if (sub === 'holidays') {
    const today = toIsoDate(new Date())
    screen = (
      <>
        <TopBar title="Holiday calendar" subtitle={`${new Date().getFullYear()} company holidays`} onBack={() => setSub(null)} />
        <Section>
          {holidayState.status === 'error' ? (
            <LoadError message={holidayState.message} onRetry={() => setVersion((v) => v + 1)} />
          ) : holidayState.status === 'loading' ? (
            <LoadingCard label="Loading holidays" />
          ) : holidays.length === 0 ? (
            <EmptyState icon="calendar" title="No holidays published" message="HR adds the company holidays here when they are decided." />
          ) : (
            <List>
              {holidays.map((h) => (
                <HolidayRow key={h.id} holiday={h} past={h.date < today} />
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
        photoUrl={photoUrl}
        unread={unread}
        holidays={holidays}
        holidaysLoading={holidayState.status === 'loading'}
        myTimesheets={myTimesheets}
        myDocs={myDocs}
        pendingTsCount={pendingTsWeeks}
        pendingLeaveCount={pendingLeaves.length}
        payslips={payslips}
        leaveBalance={leaveBalance}
        weeklyOffs={schedule ? schedule.offs : null}
        onOpen={setSub}
        onOpenWeek={openTimesheetWeek}
        onOpenDocs={openDocs}
        onOpenRequests={openRequests}
        onOpenProfile={() => dispatch({ type: 'header-profile' })}
        onDownload={download}
      />
    )
  } else if (tab === 'requests') {
    screen = (
      <>
        <TopBar title="Requests" subtitle="Track approval status" onBack={goBack} />
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
    const shown = filterDocuments(myDocs, docFilter)
    screen = (
      <>
        <TopBar title="Documents" subtitle="Visible only to you and HR" onBack={goBack} />
        <Section>
          <Dropdown
            label="Document type"
            value={docFilter}
            onChange={setDocFilter}
            options={documentFilterOptions(docState.status === 'ready' ? myDocs : null)}
          />
        </Section>
        <Section title={docFilter === 'All' ? `All documents (${shown.length})` : docFilter}>
          {docState.status === 'error' ? (
            <LoadError message={docState.message} onRetry={() => setVersion((v) => v + 1)} />
          ) : docState.status === 'loading' ? (
            <LoadingCard label="Loading documents" />
          ) : shown.length === 0 ? (
            <EmptyState icon="file" title="Not issued yet" message="HR uploads this document when it is ready. You’ll get a notification." />
          ) : (
            <DocList items={shown} onDownload={download} highlight={focused} />
          )}
        </Section>
      </>
    )
  } else {
    screen = (
      <>
        <TopBar title="Profile" onBack={goBack} />
        <Section>
          <Card className="flex items-center gap-4 px-4 py-5">
            <Avatar name={user.name} size="lg" photoUrl={photoUrl} />
            <div className="min-w-0 flex-1">
              <p className="truncate text-[18px] font-semibold text-ink">{user.displayName ?? user.name}</p>
              {user.designation && <p className="truncate text-[14px] text-ink-muted">{user.designation}</p>}
              <p className="tnum mt-1.5">
                <Tag>{user.id}</Tag>
              </p>
            </div>
            {/* Opens the virtual ID card as a pop-up. */}
            <button
              type="button"
              onClick={() => setShowIdCard(true)}
              aria-label="Show virtual ID card"
              aria-haspopup="dialog"
              className="press group flex shrink-0 flex-col items-center gap-1 self-center transition-transform duration-150"
            >
              <span className="grid h-11 w-11 place-items-center rounded-xl border border-line-strong bg-mist-50 text-navy-700 group-hover:bg-mist-100">
                <Icon name="idBadge" className="h-6 w-6" />
              </span>
              <span className="text-[11px] font-medium text-ink-soft">Virtual ID</span>
            </button>
          </Card>
        </Section>
        {showIdCard && (
          <IdCardSheet token={token} photoUrl={photoUrl} onClose={() => setShowIdCard(false)} onError={handleError} />
        )}
        <Section title="Work">
          <Card className="divide-y divide-line">
            {/* Manager and location are not stored by the backend yet, so they are not shown. */}
            <DetailRow icon="briefcase" label="Department" value={user.department} />
            <DetailRow icon="user" label="Job title" value={user.designation} />
            <DetailRow icon="calendar" label="Joined" value={user.joiningDate ? formatDate(user.joiningDate) : ''} />
          </Card>
        </Section>
        <Section title="Contact">
          <Card className="divide-y divide-line">
            <DetailRow icon="mail" label="Email" value={user.email} />
            <DetailRow icon="phone" label="Phone" value={user.phone} />
          </Card>
          <p className="mt-2 px-1 text-[12px] text-ink-muted">To correct any detail, contact HR.</p>
        </Section>
        <Section title="Work schedule">
          <Spotlight on={focused('schedule')}>
            <Card className="divide-y divide-line">
              <DetailRow icon="calendar" label="Weekly off" value={schedule ? schedule.offs.join(' and ') || 'None' : ''} />
              <DetailRow icon="clock" label="Working hours" value={schedule?.hours ? `${schedule.hours} h a working day` : ''} />
            </Card>
          </Spotlight>
          <p className="mt-2 px-1 text-[12px] text-ink-muted">Set by HR. You get a notification when it changes.</p>
        </Section>
        <Section title="Appearance">
          <Segmented options={THEME_CHOICES} value={themeChoice} onChange={chooseTheme} />
          <p className="mt-2 px-1 text-[12px] text-ink-muted">
            {themeChoice === 'system'
              ? `Follows your phone’s setting (now ${theme}).`
              : `Always ${themeChoice}, whatever your phone is set to.`}
          </p>
        </Section>
        <Section title="Security">
          <List>
            <ListRow icon="lock" title="Change password" subtitle="At least 8 characters" onClick={() => setSub('password')} />
          </List>
        </Section>
        <Section>
          <LogoutButton onLogout={onLogout} subtitle={`Signed in as ${user.id}`} />
        </Section>
      </>
    )
  }

  return (
    <Page>
      {/* Keyed by screen, so each newly opened screen fades in once. */}
      <div key={`${tab}/${sub ?? ''}`} className="screen-enter">
        {screen}
      </div>
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

/* ---------- Theme ---------- */

/**
 * The employee's Light / Dark / System choice, applied to the whole page while
 * the employee app is open (and removed when it closes, so HR and sign-in stay light).
 */
function useEmployeeTheme() {
  const [choice, setChoice] = useState<ThemeChoice>(() => readThemeChoice())
  const [systemDark, setSystemDark] = useState(systemPrefersDark)
  const theme = resolveTheme(choice, systemDark)

  // Follow the phone live, and check again when the app comes back to the front.
  useEffect(() => {
    const stop = onSystemThemeChange(setSystemDark)
    const resume = CapacitorApp.addListener('resume', () => setSystemDark(systemPrefersDark())).catch(() => null)
    return () => {
      stop()
      resume.then((l) => l?.remove())
    }
  }, [])

  // Before the screen paints, so a dark choice never flashes light first.
  useLayoutEffect(() => {
    applyTheme(document.documentElement, theme)
    setStatusBarTheme(theme)
  }, [theme])
  // Leaving the employee app (sign out): back to the light sign-in screen.
  useLayoutEffect(() => () => {
    applyTheme(document.documentElement, null)
    setStatusBarTheme('light')
  }, [])

  const choose = useCallback((next: ThemeChoice) => {
    setChoice(next)
    saveThemeChoice(next)
  }, [])
  return { choice, theme, choose }
}

/* ---------- Home dashboard ---------- */

function HomeScreen({
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
  onOpen: (s: SubScreen) => void
  /** Opens the timesheet on the week starting this Monday. */
  onOpenWeek: (weekStart: string) => void
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
  const week = currentWorkWeek(now, weeklyOffs)
  const monthWeekList = monthWeeks(myTimesheets, toIsoDate(now))
  const weekHours = week.reduce((s, d) => s + (myTimesheets.find((t) => t.date === d.iso)?.hours ?? 0), 0)
  const totalLeft = leaveBalance.reduce((s, b) => s + b.left, 0)
  const latestPayslip = payslips[0]
  const nextHoliday = upcomingHolidays(holidays, toIsoDate(now))[0]
  const rejectedTs = myTimesheets.filter((t) => t.status === 'Rejected').length

  const statusLine =
    rejectedTs > 0
      ? `${plural(rejectedTs, 'timesheet')} rejected, needs changes`
      : pendingTsCount > 0
        ? `${plural(pendingTsCount, 'timesheet')} awaiting approval`
        : myTimesheets.length === 0
          ? 'No timesheets submitted yet'
          : 'All timesheets approved'
  const statusDot =
    rejectedTs > 0 ? 'bg-rejected' : pendingTsCount > 0 ? 'bg-pending' : myTimesheets.length === 0 ? 'bg-accent' : 'bg-approved'

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
            <AvatarButton name={user.name} label="Open your profile" onClick={onOpenProfile} photoUrl={photoUrl} />
            <IconButton icon="bell" label={`Notifications, ${unread} unread`} count={unread} onClick={() => onOpen('notifications')} />
          </>
        }
      />

      <div className="px-5 pt-3">
        <p className="text-[14px] text-ink-muted">{greeting()},</p>
        <h1 className="text-[26px] font-semibold leading-tight tracking-tight text-ink">{user.displayName ?? user.name}</h1>
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
            <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${statusDot}`} />
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
        <div className="card-surface rounded-2xl border border-line p-4">
          <button type="button" onClick={() => onOpen('timesheet')} aria-label="Timesheet, this week" className="press flex w-full items-center gap-3 text-left transition-transform duration-150">
            <IconTile icon="clock" />
            <div className="flex-1">
              <p className="text-[15px] font-semibold text-ink">Timesheet</p>
              <p className="tnum text-[13px] text-ink-muted">{weekHours} h this week</p>
            </div>
            <Icon name="chevronRight" className="h-[18px] w-[18px] text-ink-muted/70" />
          </button>
          {/* This month, week by week (same bars as before, one per week): each week's
              status comes from all of its saved days. Tapping a week opens that week. */}
          <div className="mt-4 grid gap-2" style={{ gridTemplateColumns: `repeat(${monthWeekList.length}, minmax(0, 1fr))` }}>
            {monthWeekList.map((w) => {
              const bar = w.status === 'Approved' ? 'bg-approved' : w.status === 'Rejected' ? 'bg-rejected' : w.status === 'Pending' ? 'bg-pending' : null
              const openable = canOpenWeek(w.weekStart, toIsoDate(now))
              return (
                <button
                  key={w.weekStart}
                  type="button"
                  disabled={!openable}
                  onClick={() => onOpenWeek(w.weekStart)}
                  aria-label={`${w.label} (${w.range}): ${w.status}. ${openable ? 'Open this week' : 'Opens when the week starts'}`}
                  className="press flex min-w-0 flex-col items-center gap-1.5 rounded-lg transition-transform duration-150 disabled:cursor-default"
                >
                  <div
                    className={`flex h-10 w-full items-end overflow-hidden rounded-md ${bar ? 'bg-mist-50' : 'bg-mist-50 ring-1 ring-inset ring-line'}`}
                  >
                    {bar && <div className={`h-full w-full rounded-md ${bar}`} />}
                  </div>
                  <span className={`whitespace-nowrap text-[11px] ${w.current ? 'font-semibold text-navy-900' : 'text-ink-muted'}`}>{w.label}</span>
                </button>
              )
            })}
          </div>
          <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-ink-muted">
            <Legend className="bg-approved" label="Approved" />
            <Legend className="bg-pending" label="Pending" />
            <Legend className="bg-rejected" label="Rejected" />
            <Legend className="bg-mist-50 ring-1 ring-inset ring-line" label="Not submitted" />
          </div>
        </div>

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
            {/* Holiday calendar (Documents stay one tap away in the bottom bar and below). */}
            <CardButton onClick={() => onOpen('holidays')} className="p-4" label="Holiday calendar">
              <IconTile icon="calendar" />
              <p className="mt-3 text-[15px] font-semibold text-ink">Holidays</p>
              <p className="truncate text-[13px] text-ink-muted">
                {holidaysLoading
                  ? 'Loading…'
                  : nextHoliday
                    ? `${formatShortDate(nextHoliday.date)} · ${nextHoliday.name}`
                    : holidays.length
                      ? 'No more this year'
                      : 'None published yet'}
              </p>
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

/** Unread marker colour: green for approvals, red for rejections, navy for documents and payslips. */
function notificationDot(type: string): string {
  if (type.endsWith('_APPROVED')) return 'bg-approved'
  if (type.endsWith('_REJECTED')) return 'bg-rejected'
  return 'bg-navy-700'
}

function HolidayRow({ holiday, past }: { holiday: HolidayRecord; past: boolean }) {
  const date = new Date(`${holiday.date}T00:00:00`)
  const weekday = holiday.weekday.charAt(0) + holiday.weekday.slice(1).toLowerCase()
  return (
    <div className={`flex items-center gap-3.5 px-4 py-3 ${past ? 'opacity-55' : ''}`}>
      <span className="grid h-12 w-12 shrink-0 place-items-center rounded-xl bg-mist-50 text-center ring-1 ring-inset ring-mist-100">
        <span className="leading-none">
          <span className="tnum block text-[17px] font-semibold text-navy-900">{date.getDate()}</span>
          <span className="mt-0.5 block text-[10px] font-semibold uppercase tracking-wide text-mist-500">
            {date.toLocaleDateString('en-IN', { month: 'short' })}
          </span>
        </span>
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[15px] font-medium text-ink">{holiday.name}</span>
        <span className="block text-[13px] text-ink-muted">
          {weekday}
          {past ? ' · Past' : ''}
        </span>
      </span>
    </div>
  )
}

/** A week's status in the existing colours: green approved, orange pending, red rejected, neutral not submitted. */
function WeekStatusPill({ status }: { status: MonthWeekStatus }) {
  if (status === 'Not submitted') {
    return (
      <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-mist-50 px-2.5 py-1 text-[12px] font-medium text-ink-muted ring-1 ring-inset ring-line">
        <span className="h-1.5 w-1.5 rounded-full bg-line-strong" />
        Not submitted
      </span>
    )
  }
  return <StatusBadge status={status} />
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

function LeaveList({ items, highlight }: { items: LeaveRequest[]; highlight?: (id: string) => boolean }) {
  if (items.length === 0)
    return <EmptyState icon="calendar" title="No leave applications" message="Applications you submit will appear here with their status." />
  return (
    <List>
      {items.map((l) => (
        <Spotlight key={l.id} on={!!highlight?.(l.id)}>
        <div className="px-4 py-3.5">
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
            <div className="mt-2.5 rounded-md border-l-2 border-rejected bg-rejected-soft px-3 py-2 text-[12px] leading-relaxed text-rejected-ink">
              <span className="font-semibold">HR note:</span> {l.remark}
            </div>
          )}
        </div>
        </Spotlight>
      ))}
    </List>
  )
}

function DocList({
  items, onDownload, highlight,
}: { items: EmployeeDocument[]; onDownload: (doc: EmployeeDocument) => void; highlight?: (id: string) => boolean }) {
  return (
    <List>
      {items.map((d) => (
        <Spotlight key={d.id} on={!!highlight?.(d.id)}>
        <ListRow
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
        </Spotlight>
      ))}
    </List>
  )
}
