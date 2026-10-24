// The employee's virtual ID card, opened from the ID-card button on Profile
// as a pop-up: RIGHTSKU logo, a square photo (initials when HR has not added
// one), full name with prefix, job title, Employee ID, and the company name
// and office address from HR's company profile. Everything comes from the
// server; anything HR has not entered yet shows as "Not set by HR yet".
// Close, Escape and the Android back gesture all close it.
import { useEffect, useState } from 'react'
import { Icon } from '../../components/Icons'
import { Logo } from '../../components/Logo'
import { Button, Notice, Spinner, useBackHandler } from '../../components/ui'
import type { ApiError } from '../../lib/api'
import { getMyIdCard, type IdCardRecord } from '../../lib/company'

const NOT_SET = 'Not set by HR yet'

/** "Mr. Vamsi Ajjampudi" -> "VA": initials from the name itself, not the prefix. */
export function cardInitials(displayName: string): string {
  const parts = displayName.replace(/^(mr|ms|mrs)\.?\s+/i, '').trim().split(/\s+/).filter(Boolean)
  return parts.slice(0, 2).map((p) => p[0]?.toUpperCase() ?? '').join('') || '?'
}

export default function IdCardSheet({
  token, photoUrl, onClose, onError,
}: {
  token: string
  photoUrl: string | null
  onClose: () => void
  onError: (error: ApiError) => ApiError
}) {
  const [card, setCard] = useState<IdCardRecord | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [retry, setRetry] = useState(0)

  useBackHandler(onClose)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  useEffect(() => {
    const controller = new AbortController()
    setError(null)
    getMyIdCard(token, controller.signal).then((r) => {
      if (controller.signal.aborted) return
      if (r.ok) setCard(r.data)
      else setError(onError(r.error).message)
    })
    return () => controller.abort()
  }, [token, retry, onError])

  return (
    <div
      className="backdrop-enter fixed inset-0 z-50 grid place-items-center overflow-y-auto bg-navy-950/55 p-4 backdrop-blur-[2px]"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div role="dialog" aria-modal="true" aria-label="Virtual employee ID card" className="sheet-enter relative w-full max-w-sm">
        <button
          type="button"
          onClick={onClose}
          aria-label="Close ID card"
          className="absolute -top-3 -right-1 z-10 grid h-10 w-10 place-items-center rounded-full bg-white text-navy-900 shadow-raised ring-1 ring-line"
        >
          <Icon name="x" className="h-5 w-5" />
        </button>
        {error ? (
          <div className="sheet space-y-3 p-5" role="alert">
            <Notice tone="bad">{error}</Notice>
            <Button variant="secondary" size="sm" onClick={() => setRetry((r) => r + 1)}>
              Try again
            </Button>
          </div>
        ) : !card ? (
          <div className="sheet flex items-center justify-center gap-2 px-4 py-10 text-[14px] text-ink-muted">
            <Spinner /> Loading ID card
          </div>
        ) : (
          <IdCardView card={card} photoUrl={photoUrl} />
        )}
        <p className="mt-3 text-center text-[12px] text-white/85">To correct any detail on the card, contact HR.</p>
      </div>
    </div>
  )
}

/**
 * The card itself. White, blue and navy in both themes (like a printed card,
 * so it reads the same when saved as a screenshot); the logo is made for a
 * white background.
 */
export function IdCardView({ card, photoUrl }: { card: IdCardRecord; photoUrl: string | null }) {
  const office = card.officeAddress ? `${card.officeLabel ? `${card.officeLabel}: ` : ''}${card.officeAddress}` : null
  return (
    <div
      className="overflow-hidden rounded-2xl shadow-raised"
      style={{ background: '#ffffff', color: '#0f1e38' }}
      aria-label={`ID card of ${card.displayName}`}
    >
      <div className="flex items-center justify-between gap-3 px-5 pb-3 pt-4">
        <Logo className="h-8" />
        <span className="text-right text-[11px] font-bold uppercase leading-tight tracking-[0.12em]" style={{ color: '#1e3a64' }}>
          Virtual Emp Card
        </span>
      </div>
      <div className="h-1" style={{ background: 'linear-gradient(90deg, #1E88D2, #1e3a64)' }} />
      <div className="flex flex-col items-center px-5 pb-5 pt-5 text-center">
        {photoUrl ? (
          <img
            src={photoUrl}
            alt={`Photo of ${card.displayName}`}
            data-testid="id-card-photo"
            className="h-28 w-28 rounded-xl object-cover"
            style={{ boxShadow: '0 0 0 1px #d6e2f0' }}
          />
        ) : (
          <div
            data-testid="id-card-photo"
            className="grid h-28 w-28 place-items-center rounded-xl text-[30px] font-semibold"
            style={{ background: '#eaf2fb', color: '#1e3a64', boxShadow: '0 0 0 1px #d6e2f0' }}
            aria-label="No photo yet"
          >
            {cardInitials(card.displayName)}
          </div>
        )}
        <p className="mt-3 text-[19px] font-semibold leading-tight">{card.displayName}</p>
        {card.jobTitle && <p className="mt-0.5 text-[13px]" style={{ color: '#55657f' }}>{card.jobTitle}</p>}
        <p className="tnum mt-2 rounded-full px-3 py-1 text-[13px] font-semibold" style={{ background: '#eaf2fb', color: '#1e3a64' }}>
          ID {card.employeeCode}
        </p>
      </div>
      <dl className="space-y-2.5 px-5 py-4 text-[13px]" style={{ background: '#f4f8fd', borderTop: '1px solid #e2e9f2' }}>
        <CardRow label="Company" value={card.companyName} />
        <CardRow label="Office" value={office} />
      </dl>
    </div>
  )
}

function CardRow({ label, value }: { label: string; value: string | null }) {
  return (
    <div>
      <dt className="text-[11px] font-semibold uppercase tracking-wide" style={{ color: '#6b7a92' }}>{label}</dt>
      <dd className={`mt-0.5 leading-snug ${value ? '' : 'italic'}`} style={{ color: value ? '#0f1e38' : '#6b7a92' }}>
        {value ?? NOT_SET}
      </dd>
    </div>
  )
}
