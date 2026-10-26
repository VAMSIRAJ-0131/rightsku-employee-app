import { useCallback, useEffect, useLayoutEffect, useReducer, useRef, useState, type ReactNode } from 'react'
import { Icon } from '../../components/Icons'
import {
  Avatar, BottomNav, Button, Card, DetailRow, EmptyState,
  IconTile, List, ListRow, LogoutButton, Notice, Page, Section,
  Segmented, Spinner, StatusBadge, Tag, TopBar, useToast,
} from '../../components/ui'
import type {
  DashboardData, DocType, Employee, EmployeeDocument, LeaveBalance, LeaveRequest, Timesheet,
} from '../../data/types'
import {
  firstName, formatDate, formatShortDate, plural, toIsoDate,
} from '../../lib/format'
import type { ApiError } from '../../lib/api'
import { saveDownloadedFile, savedMessage } from '../../lib/fileSave'
import {
  downloadMyDocument, listMyDocuments, toEmployeeDocument,
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
import WeeklyTimesheetHistory, { statusTile } from './WeeklyTimesheetHistory'
import PayslipsScreen from './PayslipsScreen'
import DocumentsScreen from './DocumentsScreen'
import NotificationList from './NotificationList'
import DocumentViewer from '../../components/DocumentViewer'
import type { DownloadedFile } from '../../lib/api'
import HolidayCalendar from './HolidayCalendar'
import SwipePager from '../../components/SwipePager'
import { startPush } from '../../lib/push'
import HomeScreen from './HomeDashboard'
import Dropdown from '../../components/Dropdown'
import { weekCount, type MonthWeekStatus } from '../../lib/timesheetHistory'
import { RECENT_LIMIT, newestLeaveFirst, recentItems } from '../../lib/recentItems'
import ChangePasswordScreen from '../shared/ChangePasswordScreen'
import { getMyProfile, withProfileRecord } from '../../lib/profile'
import {
  clearAllNotifications, clearNotification, listMyNotifications, markAllNotificationsRead, markNotificationRead,
  notificationTarget, timeAgo, type NotificationRecord,
} from '../../lib/notifications'
import { listMyHolidays, type HolidayRecord } from '../../lib/workCalendar'
import { loadMyPhoto } from '../../lib/photos'
import {
  cancelWeeklyReminders, notifyDownloaded, notifyNewInbox, scheduleWeeklyReminders, setInboxOpener, setTimesheetOpener,
} from '../../lib/systemNotifications'
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
  appLock,
  onLogout,
  onSessionExpired,
  onPasswordChanged,
}: {
  user: Employee
  data: DashboardData
  /** JWT for API calls. Memory only. */
  token: string
  /** Android app only: Profile → App lock (PIN / fingerprint to stay signed in). */
  appLock?: { label: string; onOpen: () => void }
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
  // The week the timesheet opens on: one picked on the home card or a reminder, or this week (null).
  const [timesheetWeek, setTimesheetWeek] = useState<string | null>(null)
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

  // Tapping a timesheet reminder opens this week's timesheet.
  useEffect(() => {
    setTimesheetOpener(() => {
      setTimesheetWeek(null)
      dispatch({ type: 'open', sub: 'timesheet' })
    })
    return () => setTimesheetOpener(null)
  }, [])

  // Pushes from the server (HR decisions, payslips, the Monday reminder) when
  // this build has Firebase; otherwise the phone keeps its own Monday reminder.
  useEffect(() => {
    let cancelled = false
    void startPush(
      token,
      (data) => {
        if (data.type === 'TIMESHEET_REMINDER') {
          setTimesheetWeek(null)
          dispatch({ type: 'open', sub: 'timesheet' })
        } else dispatch({ type: 'open', sub: 'notifications' })
      },
      () => loadNotifications(),
    ).then((pushing) => {
      if (cancelled) return
      if (pushing) void cancelWeeklyReminders()
      else void scheduleWeeklyReminders()
    })
    return () => {
      cancelled = true
    }
  }, [token, loadNotifications])

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

  // Company holidays published by HR for this year and next year, so that late
  // in December the next holiday (e.g. New Year, Sankranti) is already known.
  useEffect(() => {
    const controller = new AbortController()
    const year = new Date().getFullYear()
    Promise.all([listMyHolidays(token, year, controller.signal), listMyHolidays(token, year + 1, controller.signal)]).then(
      ([thisYear, nextYear]) => {
        if (controller.signal.aborted) return
        if (!thisYear.ok) {
          setHolidayState({ status: 'error', message: handleError(thisYear.error).message })
          return
        }
        // Next year's list is a bonus: if it fails, this year's still shows.
        const items = nextYear.ok ? [...thisYear.data, ...nextYear.data] : thisYear.data
        // Each holiday once, in date order.
        const unique = [...new Map(items.map((h) => [h.id, h])).values()]
        setHolidayState({ status: 'ready', items: unique.sort((a, b) => a.date.localeCompare(b.date)) })
      },
    )
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
      case 'timesheet':
        // A reminder: the week it is about.
        openTimesheetWeek(target.key ?? weekStartOf(toIsoDate(new Date())))
        return
      case 'holidays':
        dispatch({ type: 'open', sub: 'holidays' })
        return
      case 'leave':
        setLeaveTab('leave')
        dispatch({ type: 'open', sub: 'leave' })
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
  // The timesheet asks to save typed hours before the bottom tabs take the employee away.
  const leaveGuard = useRef<((proceed: () => void) => boolean) | null>(null)
  const registerLeaveGuard = useCallback((g: ((proceed: () => void) => boolean) | null) => {
    leaveGuard.current = g
  }, [])
  const goTabGuarded = (next: Tab) => {
    if (!leaveGuard.current?.(() => goTab(next))) goTab(next)
  }
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
  // Every newly opened screen starts at its top (heading and first section),
  // never at the scroll position of the screen before it.
  useLayoutEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: 'instant' })
  }, [tab, sub])

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

  // A payslip shown inside the app (View): fetched for the signed-in employee only, never saved.
  const [viewing, setViewing] = useState<{ doc: EmployeeDocument; file: DownloadedFile | null } | null>(null)
  async function view(doc: EmployeeDocument) {
    setViewing({ doc, file: null })
    const result = await downloadMyDocument(token, doc.id, doc.title)
    if (!result.ok) {
      setViewing(null)
      show(handleError(result.error).message, 'error')
      return
    }
    setViewing((v) => (v && v.doc.id === doc.id ? { doc, file: result.data } : v))
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

  // Requests: only the newest few, with a note when there are more.
  const recentLeaves = leaveState.status === 'ready' ? (
    <>
      <LeaveList items={myLeaves} highlight={focused} limit={RECENT_LIMIT} />
      {myLeaves.length > RECENT_LIMIT && <MoreNote text={`Showing your latest ${RECENT_LIMIT} leave applications.`} />}
    </>
  ) : leaveHistory
  const tsWeekCount = new Set(myTimesheets.map((t) => weekStartOf(t.date))).size
  const recentTimesheets = timesheetState.status === 'ready' ? (
    <>
      <WeeklyTimesheetHistory items={myTimesheets} limit={RECENT_LIMIT} highlightWeek={focus && focus.tab === tab && focus.sub === sub ? focus.key : null} />
      {tsWeekCount > RECENT_LIMIT && <MoreNote text={`Showing your latest ${RECENT_LIMIT} weeks. Older weeks are in Timesheet.`} />}
    </>
  ) : timesheetHistory

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
        registerLeaveGuard={registerLeaveGuard}
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
    screen = (
      <PayslipsScreen
        payslips={payslips}
        loading={docState.status === 'loading'}
        error={docState.status === 'error' ? docState.message : null}
        focusId={focus && focus.sub === 'payslips' ? focus.key : null}
        onRetry={() => setVersion((v) => v + 1)}
        onDownload={download}
        onView={view}
        onBack={() => setSub(null)}
      />
    )
  } else if (sub === 'notifications') {
    screen = (
      <>
        <TopBar title="Notifications" subtitle={unread ? `${unread} unread` : 'All read'} onBack={() => setSub(null)} />
        {notifications.length > 0 && (
          <div className="flex justify-end gap-2 px-5 pt-3">
            {unread > 0 && (
              <button type="button" onClick={readAll} className="press flex h-9 items-center gap-1.5 rounded-full bg-royal-50 px-3.5 text-[13px] font-semibold text-royal-700 transition-transform duration-150">
                <Icon name="check" className="h-4 w-4" /> Mark all read
              </button>
            )}
            <button type="button" onClick={() => setConfirmClearAll(true)} className="press flex h-9 items-center gap-1.5 rounded-full bg-white px-3.5 text-[13px] font-semibold text-ink-soft ring-1 ring-inset ring-line-strong transition-transform duration-150">
              <Icon name="trash" className="h-4 w-4" /> Clear all
            </button>
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
            <NotificationList items={notifications} onOpen={openNotification} onClear={clearOne} />
          )}
        </Section>
      </>
    )
  } else if (sub === 'holidays') {
    screen = (
      <HolidayCalendar
        holidays={holidays}
        loading={holidayState.status === 'loading'}
        error={holidayState.status === 'error' ? holidayState.message : null}
        onRetry={() => setVersion((v) => v + 1)}
        onBack={() => setSub(null)}
      />
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
        {/* Swipe left for Leave, right for Timesheets. */}
        <SwipePager
          label="Request lists"
          value={requestsView}
          onChange={setRequestsView}
          pages={[
            { id: 'timesheets', content: <Section title="Latest timesheets">{recentTimesheets}</Section> },
            { id: 'leaves', content: <Section title="Latest leave applications">{recentLeaves}</Section> },
          ]}
        />
      </>
    )
  } else if (tab === 'documents') {
    screen = (
      <DocumentsScreen
        key={`${docFilter}|${focus?.tab === 'documents' ? focus.key : ''}`}
        docs={myDocs.filter((d) => d.type !== 'Payslip')}
        loading={docState.status === 'loading'}
        error={docState.status === 'error' ? docState.message : null}
        initialType={docFilter}
        focusId={focus && focus.tab === 'documents' ? focus.key : null}
        onRetry={() => setVersion((v) => v + 1)}
        onDownload={download}
        onView={view}
        onBack={goBack}
      />
    )
  } else {
    screen = (
      <>
        <TopBar title="Profile" onBack={goBack} />
        <Section>
          {/* Premium header: photo, name, job, Employee ID and the virtual ID card. */}
          <div className="hero-card relative overflow-hidden rounded-[24px] px-5 py-5 text-white">
            <span aria-hidden className="pointer-events-none absolute -right-10 -top-12 h-40 w-40 rounded-full bg-white/[0.06]" />
            <div className="relative flex items-center gap-4">
              <span className="rounded-full p-[3px] ring-2 ring-white/40">
                <Avatar name={user.name} size="lg" photoUrl={photoUrl} />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-[20px] font-bold leading-tight [overflow-wrap:anywhere]">{user.displayName ?? user.name}</p>
                {user.designation && <p className="mt-0.5 truncate text-[14px] text-mist-200">{user.designation}{user.department ? ` · ${user.department}` : ''}</p>}
                <span className="tnum mt-2 inline-flex items-center gap-1.5 rounded-full bg-white/12 px-2.5 py-1 text-[12px] font-semibold ring-1 ring-inset ring-white/20">
                  <Icon name="idCard" className="h-3.5 w-3.5" /> {user.id}
                </span>
              </div>
            </div>
            {/* Opens the virtual ID card as a pop-up. */}
            <button
              type="button"
              onClick={() => setShowIdCard(true)}
              aria-label="Show virtual ID card"
              aria-haspopup="dialog"
              className="press hero-button relative mt-4 flex h-12 w-full items-center justify-center gap-2 rounded-2xl text-[15px] font-semibold transition-transform duration-150"
            >
              <Icon name="idBadge" className="h-5 w-5" /> Virtual ID
            </button>
          </div>
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
            {appLock && <ListRow icon="fingerprint" title="App lock" subtitle={appLock.label} onClick={appLock.onOpen} />}
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
        onChange={goTabGuarded}
      />
      {viewing && (
        <DocumentViewer
          title={viewing.doc.title.replace('Payslip - ', 'Payslip · ')}
          file={viewing.file}
          onClose={() => setViewing(null)}
          onDownload={() => void download(viewing.doc)}
        />
      )}
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
          {/* Next year's holidays say which year they are in. */}
          {date.getFullYear() !== new Date().getFullYear() ? ` · ${date.getFullYear()}` : ''}
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

function TextLink({ children, onClick }: { children: ReactNode; onClick: () => void }) {
  return (
    <button onClick={onClick} className="-my-2 -mr-2 rounded-md px-2 py-2 text-[13px] font-semibold text-navy-700 hover:bg-mist-50">
      {children}
    </button>
  )
}

function MoreNote({ text }: { text: string }) {
  return <p className="mt-3 px-1 text-center text-[12.5px] text-ink-muted">{text}</p>
}

function LeaveList({
  items: all, highlight, limit,
}: {
  items: LeaveRequest[]
  highlight?: (id: string) => boolean
  /** Show only the newest this many (a highlighted one always shows). */
  limit?: number
}) {
  const items = limit ? recentItems(newestLeaveFirst(all), limit, (l) => !!highlight?.(l.id)) : all
  if (items.length === 0)
    return <EmptyState icon="calendar" title="No leave applications" message="Applications you submit will appear here with their status." />
  return (
    <List>
      {items.map((l) => (
        <Spotlight key={l.id} on={!!highlight?.(l.id)}>
        <div className="flex gap-3.5 px-4 py-3.5">
          <span className={`grid h-11 w-11 shrink-0 place-items-center rounded-2xl ${statusTile(l.status)}`}>
            <Icon name="calendar" className="h-[22px] w-[22px]" />
          </span>
          <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-3">
            <p className="text-[15px] font-semibold leading-snug text-ink">
              {l.type} leave
              <span className="tnum ml-2 text-[13px] font-medium text-ink-muted">{plural(l.days, 'day')}</span>
            </p>
            <StatusBadge status={l.status} />
          </div>
          <p className="tnum mt-1 text-[13.5px] font-medium text-ink-soft">
            {formatShortDate(l.from)}
            {l.from !== l.to ? ` – ${formatShortDate(l.to)}` : ''}
          </p>
          {l.reason && <p className="mt-0.5 text-[13px] leading-snug text-ink-muted">{l.reason}</p>}
          {l.status === 'Rejected' && l.remark && (
            <div className="mt-2.5 rounded-md border-l-2 border-rejected bg-rejected-soft px-3 py-2 text-[12px] leading-relaxed text-rejected-ink">
              <span className="font-semibold">HR note:</span> {l.remark}
            </div>
          )}
          </div>
        </div>
        </Spotlight>
      ))}
    </List>
  )
}

