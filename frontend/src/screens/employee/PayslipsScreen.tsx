// Payslips: choose a month and a year, tap "Get details", and that month's
// payslip shows with a Download button, or a clear message when HR hasn't
// published one. Opened from a "payslip published" notification, it shows
// that payslip straight away.
import { useEffect, useRef, useState } from 'react'
import { Icon } from '../../components/Icons'
import Dropdown from '../../components/Dropdown'
import Spotlight from '../../components/Spotlight'
import { Button, Card, Notice, Section, Spinner, TopBar } from '../../components/ui'
import type { EmployeeDocument } from '../../data/types'
import { formatDate, plural } from '../../lib/format'
import { MONTH_NAMES, defaultPayslipChoice, findPayslip, payslipPeriod, payslipYears, periodLabel } from '../../lib/payslips'

/** How long the search animation runs before the result shows. */
const SEARCH_MS = 1100

export default function PayslipsScreen({
  payslips, loading, error, focusId, onRetry, onDownload, onView, onBack,
}: {
  /** The employee's own payslips (newest first). */
  payslips: EmployeeDocument[]
  loading: boolean
  error: string | null
  /** A payslip a tapped notification is about: shown at once. */
  focusId: string | null
  onRetry: () => void
  onDownload: (doc: EmployeeDocument) => void
  /** Opens the payslip inside the app. */
  onView: (doc: EmployeeDocument) => void
  onBack: () => void
}) {
  const focused = focusId ? payslips.find((p) => p.id === focusId) ?? null : null
  const start = focused && payslipPeriod(focused)
    ? { year: Number(payslipPeriod(focused)!.slice(0, 4)), month: Number(payslipPeriod(focused)!.slice(5, 7)) }
    : defaultPayslipChoice(payslips)
  const [year, setYear] = useState(start.year)
  const [month, setMonth] = useState(start.month)
  // What "Get details" last looked up (null: not yet).
  const [shown, setShown] = useState<{ year: number; month: number } | null>(focused ? start : null)

  const result = shown ? findPayslip(payslips, shown.year, shown.month) : null
  const shownLabel = shown ? periodLabel(`${shown.year}-${String(shown.month).padStart(2, '0')}`) : ''
  const choiceChanged = !shown || shown.year !== year || shown.month !== month
  // "Get details": a short searching animation, then the result.
  const [searching, setSearching] = useState<{ year: number; month: number } | null>(null)
  const timer = useRef(0)
  useEffect(() => () => window.clearTimeout(timer.current), [])
  function getDetails() {
    const wanted = { year, month }
    setShown(null)
    setSearching(wanted)
    window.clearTimeout(timer.current)
    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    timer.current = window.setTimeout(() => {
      setSearching(null)
      setShown(wanted)
    }, reduce ? 0 : SEARCH_MS)
  }
  const searchingLabel = searching ? periodLabel(`${searching.year}-${String(searching.month).padStart(2, '0')}`) : ''

  return (
    <>
      <TopBar title="Payslips" subtitle={loading ? 'Loading…' : `${plural(payslips.length, 'payslip')} available`} onBack={onBack} />

      <Section>
        <Card className="p-4">
          <p className="text-[15px] font-semibold text-ink">Find a payslip</p>
          <p className="mt-0.5 text-[13px] text-ink-muted">Choose the month and year, then tap Get details.</p>
          <div className="mt-4 grid grid-cols-2 gap-3">
            <Dropdown
              label="Month"
              value={month}
              onChange={(m) => setMonth(m)}
              options={MONTH_NAMES.map((name, i) => ({ value: i + 1, label: name }))}
            />
            <Dropdown
              label="Year"
              value={year}
              onChange={(y) => setYear(y)}
              options={payslipYears(payslips).map((y) => ({ value: y, label: String(y) }))}
            />
          </div>
          <Button size="lg" className="mt-4 w-full" disabled={loading || !!error || !!searching} onClick={getDetails}>
            {searching ? <><Spinner /> Searching…</> : <><Icon name="search" className="h-[18px] w-[18px]" /> Get details</>}
          </Button>
        </Card>
      </Section>

      <Section title={shown && !choiceChanged ? shownLabel : undefined}>
        {error ? (
          <div className="space-y-3" role="alert">
            <Notice tone="bad">{error}</Notice>
            <Button variant="secondary" onClick={onRetry}>Try again</Button>
          </div>
        ) : loading ? (
          <Card className="flex items-center justify-center gap-2 px-4 py-8 text-[14px] text-ink-muted">
            <Spinner /> Loading payslips
          </Card>
        ) : searching ? (
          <SearchingCard label={searchingLabel} />
        ) : !shown ? (
          <Hint icon="receipt" title="Your payslip will show here" message="Pick a month and year above and tap Get details." />
        ) : result ? (
          <Spotlight on={!!focusId && result.id === focusId}>
            <Card className="result-pop overflow-hidden">
              <div className="flex items-center gap-4 px-4 py-4">
                <span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-lavender-50 text-lavender-600">
                  <Icon name="receipt" className="h-6 w-6" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-[17px] font-bold text-ink">{shownLabel}</span>
                  <span className="block text-[13px] text-ink-muted">Issued {formatDate(result.issuedOn)}</span>
                </span>
              </div>
              <div className="grid grid-cols-2 gap-3 border-t border-line px-4 py-3">
                <button
                  type="button"
                  onClick={() => onView(result)}
                  className="press flex h-12 items-center justify-center gap-2 rounded-2xl bg-royal-50 text-[15px] font-semibold text-royal-700 ring-1 ring-inset ring-royal-100 transition-transform duration-150"
                >
                  <Icon name="eye" className="h-5 w-5" /> View
                </button>
                <button
                  type="button"
                  onClick={() => onDownload(result)}
                  className="press save-cta flex h-12 items-center justify-center gap-2 rounded-2xl text-[15px] font-semibold text-white transition-transform duration-150"
                >
                  <Icon name="download" className="h-5 w-5" /> Download
                </button>
              </div>
            </Card>
          </Spotlight>
        ) : (
          <Hint
            icon="info"
            title={`No payslip for ${shownLabel}`}
            message="HR hasn’t published a payslip for this month yet. You’ll get a notification when they do."
          />
        )}
      </Section>
    </>
  )
}

/** While searching: a payslip being scanned, with three bouncing dots. */
function SearchingCard({ label }: { label: string }) {
  return (
    <Card className="flex flex-col items-center px-6 py-9 text-center" aria-live="polite">
      <span className="relative grid h-20 w-16 place-items-center overflow-hidden rounded-2xl bg-lavender-50 text-lavender-600 ring-1 ring-inset ring-lavender-100">
        <Icon name="receipt" className="h-9 w-9" />
        <span aria-hidden className="scan-line absolute inset-x-1 h-1 rounded-full bg-royal-600/70" />
      </span>
      <p className="mt-4 text-[15px] font-semibold text-ink">Searching for {label}</p>
      <span aria-hidden className="mt-2 flex gap-1.5">
        {[0, 1, 2].map((i) => (
          <span key={i} className="search-dot h-2 w-2 rounded-full bg-royal-600" style={{ animationDelay: `${i * 0.15}s` }} />
        ))}
      </span>
    </Card>
  )
}

function Hint({ icon, title, message }: { icon: 'receipt' | 'info'; title: string; message: string }) {
  return (
    <Card className="flex flex-col items-center px-6 py-9 text-center">
      <span className="grid h-12 w-12 place-items-center rounded-2xl bg-mist-50 text-mist-500 ring-1 ring-inset ring-mist-100">
        <Icon name={icon} className="h-6 w-6" />
      </span>
      <p className="mt-3 text-[15px] font-semibold text-ink">{title}</p>
      <p className="mt-1 max-w-64 text-[13px] text-ink-muted">{message}</p>
    </Card>
  )
}
