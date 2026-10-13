/**
 * ⚠️ DEVELOPMENT-ONLY SAMPLE DATA ⚠️
 *
 * Everything in this file is fake data used only to demonstrate the screens
 * in Phase 1. It will be replaced by the real Spring Boot + PostgreSQL backend
 * in Phase 4. The demo login below is NOT secure and must never be used in
 * production: real logins will be checked by the backend with hashed passwords.
 */

export type Role = 'employee' | 'hr'
export type Status = 'Pending' | 'Approved' | 'Rejected'
export type DocType = 'Offer Letter' | 'Experience Letter' | 'Payslip' | 'Form 16'

export interface Employee {
  id: string
  name: string
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

export interface Session {
  role: Role
  employee: Employee
}

export interface Timesheet {
  id: string
  employeeId: string
  date: string
  hours: number
  description: string
  status: Status
  remark?: string
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

export const employees: Employee[] = [
  {
    id: 'EMP001',
    name: 'Ravi Kumar',
    department: 'Engineering',
    designation: 'Software Engineer',
    joiningDate: '2023-06-12',
    email: 'ravi.kumar@example.com',
    phone: '+91 90000 00001',
    location: 'Hyderabad',
    manager: 'Anil Varma',
    active: true,
    role: 'employee',
  },
  {
    id: 'EMP002',
    name: 'Priya Sharma',
    department: 'Quality Assurance',
    designation: 'QA Analyst',
    joiningDate: '2024-01-08',
    email: 'priya.sharma@example.com',
    phone: '+91 90000 00002',
    location: 'Hyderabad',
    manager: 'Anil Varma',
    active: true,
    role: 'employee',
  },
  {
    id: 'EMP003',
    name: 'Arjun Reddy',
    department: 'Customer Support',
    designation: 'Support Executive',
    joiningDate: '2024-09-02',
    email: 'arjun.reddy@example.com',
    phone: '+91 90000 00003',
    location: 'Bengaluru',
    manager: 'Meena Joshi',
    active: true,
    role: 'employee',
  },
  {
    id: 'EMP004',
    name: 'Sneha Rao',
    department: 'Finance',
    designation: 'Accounts Associate',
    joiningDate: '2022-03-21',
    email: 'sneha.rao@example.com',
    phone: '+91 90000 00004',
    location: 'Hyderabad',
    manager: 'Meena Joshi',
    active: false,
    role: 'employee',
  },
  {
    id: 'HR001',
    name: 'Lakshmi Iyer',
    department: 'Human Resources',
    designation: 'HR Manager',
    joiningDate: '2021-11-15',
    email: 'lakshmi.iyer@example.com',
    phone: '+91 90000 00010',
    location: 'Hyderabad',
    manager: 'Director',
    active: true,
    role: 'hr',
  },
]

/** DEMO ONLY. The role comes from the account, never from the user's choice. */
const devAccounts: { username: string; password: string; employeeId: string }[] = [
  { username: 'EMP001', password: 'demo123', employeeId: 'EMP001' },
  { username: 'HR001', password: 'demo123', employeeId: 'HR001' },
]

export function devLogin(username: string, password: string): Session | null {
  const account = devAccounts.find(
    (a) => a.username.toLowerCase() === username.trim().toLowerCase() && a.password === password,
  )
  if (!account) return null
  const employee = employees.find((e) => e.id === account.employeeId)
  if (!employee || !employee.active) return null
  return { role: employee.role, employee }
}

export function employeeName(id: string): string {
  return employees.find((e) => e.id === id)?.name ?? id
}

export const leaveBalance = [
  { type: 'Casual', left: 5, total: 8 },
  { type: 'Sick', left: 6, total: 8 },
  { type: 'Earned', left: 9, total: 15 },
]

export const timesheets: Timesheet[] = [
  { id: 'TS-108', employeeId: 'EMP001', date: '2026-10-12', hours: 8, description: 'Login screen UI and code review', status: 'Pending' },
  { id: 'TS-107', employeeId: 'EMP001', date: '2026-10-09', hours: 8.5, description: 'Payslip module bug fixes', status: 'Approved' },
  { id: 'TS-106', employeeId: 'EMP001', date: '2026-10-08', hours: 6, description: 'Team meeting and documentation', status: 'Rejected', remark: 'Please add task details' },
  { id: 'TS-105', employeeId: 'EMP001', date: '2026-10-07', hours: 8, description: 'API testing', status: 'Approved' },
  { id: 'TS-210', employeeId: 'EMP002', date: '2026-10-12', hours: 8, description: 'Regression testing for release 2.4', status: 'Pending' },
  { id: 'TS-311', employeeId: 'EMP003', date: '2026-10-12', hours: 9, description: 'Customer tickets and follow-ups', status: 'Pending' },
]

export const leaves: LeaveRequest[] = [
  { id: 'LV-031', employeeId: 'EMP001', type: 'Casual', from: '2026-10-20', to: '2026-10-21', days: 2, reason: 'Family function', status: 'Pending' },
  { id: 'LV-024', employeeId: 'EMP001', type: 'Sick', from: '2026-09-15', to: '2026-09-15', days: 1, reason: 'Fever', status: 'Approved' },
  { id: 'LV-019', employeeId: 'EMP001', type: 'Earned', from: '2026-08-04', to: '2026-08-08', days: 5, reason: 'Vacation', status: 'Rejected', remark: 'Release week, please reschedule' },
  { id: 'LV-040', employeeId: 'EMP002', type: 'Sick', from: '2026-10-14', to: '2026-10-14', days: 1, reason: 'Doctor appointment', status: 'Pending' },
]

export const documents: EmployeeDocument[] = [
  { id: 'DOC-1', employeeId: 'EMP001', type: 'Offer Letter', title: 'Offer Letter', issuedOn: '2023-05-30' },
  { id: 'DOC-2', employeeId: 'EMP001', type: 'Payslip', title: 'Payslip - September 2026', issuedOn: '2026-10-01' },
  { id: 'DOC-3', employeeId: 'EMP001', type: 'Payslip', title: 'Payslip - August 2026', issuedOn: '2026-09-01' },
  { id: 'DOC-4', employeeId: 'EMP001', type: 'Payslip', title: 'Payslip - July 2026', issuedOn: '2026-08-01' },
  { id: 'DOC-5', employeeId: 'EMP001', type: 'Form 16', title: 'Form 16 - FY 2025-26', issuedOn: '2026-06-10' },
  { id: 'DOC-6', employeeId: 'EMP004', type: 'Experience Letter', title: 'Experience Letter', issuedOn: '2026-09-30' },
  { id: 'DOC-7', employeeId: 'EMP002', type: 'Payslip', title: 'Payslip - September 2026', issuedOn: '2026-10-01' },
]

export const notifications: AppNotification[] = [
  { id: 'N1', title: 'Payslip available', message: 'Your September 2026 payslip is ready to download.', time: '1 Oct', read: false },
  { id: 'N2', title: 'Timesheet rejected', message: 'Timesheet for 08 Oct was rejected: Please add task details.', time: '9 Oct', read: false },
  { id: 'N3', title: 'Leave approved', message: 'Your sick leave on 15 Sep was approved.', time: '15 Sep', read: true },
]

export const auditLog: AuditEntry[] = [
  { id: 'A5', actor: 'Lakshmi Iyer', action: 'Uploaded Payslip - September 2026 for 42 employees', time: '01 Oct 2026, 10:12' },
  { id: 'A4', actor: 'Lakshmi Iyer', action: 'Deactivated employee EMP004 (Sneha Rao)', time: '30 Sep 2026, 17:45' },
  { id: 'A3', actor: 'Lakshmi Iyer', action: 'Uploaded Experience Letter for EMP004', time: '30 Sep 2026, 17:40' },
  { id: 'A2', actor: 'Lakshmi Iyer', action: 'Approved leave LV-024 for EMP001', time: '14 Sep 2026, 09:05' },
  { id: 'A1', actor: 'Lakshmi Iyer', action: 'Added employee EMP003 (Arjun Reddy)', time: '02 Sep 2024, 11:30' },
]
