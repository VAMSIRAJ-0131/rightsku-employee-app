/**
 * Shared data types for the dashboards, plus the data a signed-in session
 * receives.
 *
 * There is no sample or demo data in the app. Each dashboard module shows
 * real data once its backend API exists; until then it receives empty lists
 * and shows an empty state.
 */

export type Role = 'employee' | 'hr'
export type Status = 'Pending' | 'Approved' | 'Rejected'
export type DocType = 'Offer Letter' | 'Experience Letter' | 'Payslip' | 'Form 16' | 'Appraisal Letter'

export interface Employee {
  id: string
  name: string
  /** Name with the prefix HR set, e.g. "Mr. Vamsi Ajjampudi" (falls back to name). */
  displayName?: string
  department: string
  designation: string
  joiningDate: string
  email: string
  phone: string
  location: string
  manager: string
  active: boolean
  role: Role
}

export interface Timesheet {
  id: string
  employeeId: string
  date: string
  hours: number
  description: string
  status: Status
  remark?: string
  /** When the day was sent for approval (ISO time), if known. */
  submittedAt?: string
}

export interface LeaveRequest {
  id: string
  employeeId: string
  type: string
  from: string
  to: string
  days: number
  reason: string
  status: Status
  remark?: string
}

export interface EmployeeDocument {
  id: string
  employeeId: string
  type: DocType
  title: string
  issuedOn: string
  /** Payslips: the month, "YYYY-MM"; Form 16: the financial year. */
  period?: string | null
}

export interface AppNotification {
  id: string
  title: string
  message: string
  time: string
  read: boolean
}

export interface AuditEntry {
  id: string
  actor: string
  action: string
  time: string
}

export interface LeaveBalance {
  type: string
  left: number
  total: number
}

/** Everything the Employee and HR dashboards display. */
export interface DashboardData {
  timesheets: Timesheet[]
  leaves: LeaveRequest[]
  leaveBalance: LeaveBalance[]
  documents: EmployeeDocument[]
  notifications: AppNotification[]
  employees: Employee[]
  auditLog: AuditEntry[]
}

/**
 * Data for real signed-in sessions until the backend APIs for timesheets,
 * leave, documents, notifications, employees and audit history exist.
 */
export const EMPTY_DASHBOARD_DATA: DashboardData = Object.freeze({
  timesheets: [],
  leaves: [],
  leaveBalance: [],
  documents: [],
  notifications: [],
  employees: [],
  auditLog: [],
}) as DashboardData
