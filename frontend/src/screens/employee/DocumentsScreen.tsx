// Documents: choose the document type (and the year for Form 16 and the hike
// letter), tap "Get document", and it shows with View and Download, or a
// clear message when HR hasn't issued it. Opened from a "document published"
// notification, it shows that document straight away.
import { useEffect, useRef, useState } from 'react'
import { Icon } from '../../components/Icons'
import Dropdown from '../../components/Dropdown'
import Spotlight from '../../components/Spotlight'
import DocStackLoader from '../../components/DocStackLoader'
import { Button, Card, Notice, Section, Spinner, TopBar } from '../../components/ui'
import type { EmployeeDocument } from '../../data/types'
import {
  EMPLOYEE_DOC_TYPES, type EmployeeDocType, defaultYear, docTypeInfo, documentLabel, findDocument, isEmployeeDocType, yearChoices,
} from '../../lib/employeeDocuments'
import { FoundCard, Hint } from './PayslipsScreen'

/** How long the fetching animation runs before the result shows. */
const SEARCH_MS = 1100

export default function DocumentsScreen({
  docs, loading, error, initialType, focusId, onRetry, onDownload, onView, onBack,
}: {
  /** The employee's own documents (payslips are left out). */
  docs: EmployeeDocument[]
  loading: boolean
  error: string | null
  /** The type to start on (from a Home shortcut). */
  initialType: string
  /** A document a tapped notification is about: shown at once. */
  focusId: string | null
  onRetry: () => void
  onDownload: (doc: EmployeeDocument) => void
  onView: (doc: EmployeeDocument) => void
  onBack: () => void
}) {
  const focused = focusId ? docs.find((d) => d.id === focusId && isEmployeeDocType(d.type)) ?? null : null
  const startType: EmployeeDocType = focused
    ? (focused.type as EmployeeDocType)
    : isEmployeeDocType(initialType) ? initialType : 'Offer Letter'
  const [type, setType] = useState<EmployeeDocType>(startType)
  const [year, setYear] = useState(focused?.period ?? defaultYear(docs, startType))
  // What "Get document" last looked up (null: not yet).
  const [shown, setShown] = useState<{ type: EmployeeDocType; year: string } | null>(
    focused ? { type: startType, year: focused.period ?? '' } : null,
  )
  const [searching, setSearching] = useState<{ type: EmployeeDocType; year: string } | null>(null)
  const timer = useRef(0)
  useEffect(() => () => window.clearTimeout(timer.current), [])

  const yearly = docTypeInfo(type).year !== 'none'
  const result = shown ? findDocument(docs, shown.type, shown.year) : null
  const shownLabel = shown ? documentLabel(shown.type, shown.year) : ''

  function chooseType(t: EmployeeDocType) {
    setType(t)
    setYear(defaultYear(docs, t))
  }
  function getDocument() {
    const wanted = { type, year }
    setShown(null)
    setSearching(wanted)
    window.clearTimeout(timer.current)
    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    timer.current = window.setTimeout(() => {
      setSearching(null)
      setShown(wanted)
    }, reduce ? 0 : SEARCH_MS)
  }

  return (
    <>
      <TopBar title="Documents" subtitle="Letters and Form 16 · visible only to you and HR" onBack={onBack} />

      <Section>
        <Card className="p-4">
          <p className="text-[15px] font-semibold text-ink">Find a document</p>
          <p className="mt-0.5 text-[13px] text-ink-muted">
            Choose the document{yearly ? ' and year' : ''}, then tap Get document.
          </p>
          <div className={`mt-4 grid gap-3 ${yearly ? 'grid-cols-[1.35fr_1fr]' : 'grid-cols-1'}`}>
            <Dropdown
              label="Document type"
              value={type}
              onChange={chooseType}
              options={EMPLOYEE_DOC_TYPES.map((t) => ({ value: t.type, label: t.label }))}
            />
            {yearly && (
              <Dropdown
                label={docTypeInfo(type).year === 'financial' ? 'Financial year' : 'Year'}
                value={year}
                onChange={setYear}
                options={yearChoices(docs, type).map((y) => ({ value: y, label: y }))}
              />
            )}
          </div>
          <Button size="lg" className="mt-4 w-full" disabled={loading || !!error || !!searching} onClick={getDocument}>
            {searching ? <><Spinner /> Fetching…</> : <><Icon name="search" className="h-[18px] w-[18px]" /> Get document</>}
          </Button>
        </Card>
      </Section>

      <Section>
        {error ? (
          <div className="space-y-3" role="alert">
            <Notice tone="bad">{error}</Notice>
            <Button variant="secondary" onClick={onRetry}>Try again</Button>
          </div>
        ) : loading ? (
          <Card className="flex items-center justify-center gap-2 px-4 py-8 text-[14px] text-ink-muted">
            <Spinner /> Loading documents
          </Card>
        ) : searching ? (
          <Card><DocStackLoader label={`Fetching your ${documentLabel(searching.type, searching.year)}`} /></Card>
        ) : !shown ? (
          <Hint icon="file" title="Your document will show here" message="Pick a document above and tap Get document. Payslips are under Home → Payslips." />
        ) : result ? (
          <Spotlight on={!!focusId && result.id === focusId}>
            <FoundCard icon="file" title={shownLabel} issuedOn={result.issuedOn} onView={() => onView(result)} onDownload={() => onDownload(result)} />
          </Spotlight>
        ) : (
          <Hint
            icon="info"
            title={`No ${shownLabel} yet`}
            message="HR hasn’t issued this document yet. You’ll get a notification when they do."
          />
        )}
      </Section>
    </>
  )
}
