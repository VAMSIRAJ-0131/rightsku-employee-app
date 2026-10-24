// Where each HR dashboard summary box leads. Kept apart from the screen so the
// mapping is easy to test: every box opens the list it counts, already filtered.

export type ApprovalQueue = 'timesheets' | 'leaves' | 'compoff'
export type QueueStatus = 'PENDING' | 'APPROVED' | 'REJECTED'

export type DashboardBox =
  | { kind: 'active' }
  | { kind: 'inactive' }
  | { kind: 'documents' }
  | { kind: 'queue'; queue: ApprovalQueue; status: QueueStatus }

export type DashboardTarget =
  | { tab: 'employees'; employeeFilter: 'ACTIVE' | 'INACTIVE' }
  | { tab: 'documents' }
  | { tab: 'approvals'; view: ApprovalQueue; status: QueueStatus }

export function dashboardTarget(box: DashboardBox): DashboardTarget {
  switch (box.kind) {
    case 'active':
      return { tab: 'employees', employeeFilter: 'ACTIVE' }
    case 'inactive':
      return { tab: 'employees', employeeFilter: 'INACTIVE' }
    case 'documents':
      return { tab: 'documents' }
    case 'queue':
      return { tab: 'approvals', view: box.queue, status: box.status }
  }
}
