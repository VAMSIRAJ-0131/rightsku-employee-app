// HR: an employee's personal details (address, emergency contact, bank) in
// full, read only. They change through the employee's update requests.
import { useEffect, useState } from 'react'
import { Card, DetailRow, Section } from '../../components/ui'
import type { ApiError } from '../../lib/api'
import { getEmployeePersonalDetails, type PersonalDetails } from '../../lib/profileChanges'

export default function EmployeePersonalDetails({
  token, employeeId, onError, onOpenRequests,
}: {
  token: string
  employeeId: number
  onError: (error: ApiError) => ApiError
  /** Opens the waiting profile update, when there is one. */
  onOpenRequests?: () => void
}) {
  const [details, setDetails] = useState<PersonalDetails | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const controller = new AbortController()
    getEmployeePersonalDetails(token, employeeId, controller.signal).then((r) => {
      if (controller.signal.aborted) return
      if (r.ok) setDetails(r.data)
      else setError(onError(r.error).message)
    })
    return () => controller.abort()
  }, [token, employeeId, onError])

  return (
    <Section title="Personal details">
      {error ? (
        <p className="px-1 text-[13px] text-bad">{error}</p>
      ) : (
        <Card className="divide-y divide-line">
          <DetailRow icon="pin" label="Address" value={details?.address ?? ''} />
          <DetailRow icon="user" label="Emergency contact" value={details?.emergencyContactName ?? ''} />
          <DetailRow icon="phone" label="Emergency phone" value={details?.emergencyContactPhone ?? ''} />
          <DetailRow icon="user" label="Account holder" value={details?.bankAccountName ?? ''} />
          <DetailRow icon="wallet" label="Account number" value={details?.bankAccountNumber ?? ''} />
          <DetailRow icon="briefcase" label="IFSC" value={details?.bankIfsc ?? ''} />
        </Card>
      )}
      {details?.pendingRequestId ? (
        onOpenRequests ? (
          <button type="button" onClick={onOpenRequests} className="mt-2 px-1 text-[13px] font-semibold text-royal-600">
            An update from this employee is waiting for review →
          </button>
        ) : (
          <p className="mt-2 px-1 text-[13px] font-medium text-pending-ink">
            An update from this employee is waiting: Home → Profile update requests.
          </p>
        )
      ) : (
        <p className="mt-2 px-1 text-[12px] text-ink-muted">The employee updates these from their Profile; you approve each change.</p>
      )}
    </Section>
  )
}
