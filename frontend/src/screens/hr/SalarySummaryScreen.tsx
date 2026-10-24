// HR Admin: monthly salary summary for payroll (read only), with CSV export
// for Excel and a print-friendly table. The server does every calculation.
import { useCallback, useEffect, useState } from 'react'
import { Capacitor } from '@capacitor/core'
import Dropdown from '../../components/Dropdown'
import { Icon } from '../../components/Icons'
import { Button, Card, EmptyState, Notice, Section, Spinner, StatusBadge, TopBar } from '../../components/ui'
import type { ApiError } from '../../lib/api'
import { saveDownloadedFile, savedMessage } from '../../lib/fileSave'
import {
  SALARY_RULES, defaultPayrollMonth, getSalarySummary, monthName, salaryCsv, salaryCsvFileName, type SalarySummary,
} from '../../lib/salarySummary'
import { notifyDownloaded } from '../../lib/systemNotifications'

type State = { status: 'loading' } | { status: 'error'; message: string } | { status: 'ready'; report: SalarySummary }

const MONTHS = Array.from({ length: 12 }, (_, i) => i + 1)

export default function SalarySummaryScreen({
  token, onBack, onToast, onError,
}: {
  token: string
  onBack: () => void
  onToast: (text: string, tone?: 'info' | 'success' | 'error') => void
  onError: (error: ApiError) => ApiError
}) {
  const now = new Date()
  const [picked, setPicked] = useState(defaultPayrollMonth(now))
  const [state, setState] = useState<State>({ status: 'loading' })
  const [showRules, setShowRules] = useState(false)
  const [exporting, setExporting] = useState(false)
  const [retry, setRetry] = useState(0)

  const years = Array.from({ length: 4 }, (_, i) => now.getFullYear() - 3 + i)
  const isFuture = (y: number, m: number) => y > now.getFullYear() || (y === now.getFullYear() && m > now.getMonth() + 1)

  useEffect(() => {
    const controller = new AbortController()
    setState({ status: 'loading' })
    getSalarySummary(token, picked.year, picked.month, controller.signal).then((result) => {
      if (controller.signal.aborted) return
      if (result.ok) setState({ status: 'ready', report: result.data })
      else setState({ status: 'error', message: onError(result.error).message })
    })
    return () => controller.abort()
  }, [token, picked, retry, onError])

  const exportCsv = useCallback(async (report: SalarySummary) => {
    setExporting(true)
    const fileName = salaryCsvFileName(report)
    const title = `Salary summary ${monthName(report.year, report.month)}`
    const saved = await saveDownloadedFile({ blob: new Blob([salaryCsv(report)], { type: 'text/csv' }), fileName }, title)
    setExporting(false)
    if (saved.ok) {
      onToast(savedMessage(title, saved), 'success')
      if (saved.method === 'saved') void notifyDownloaded(saved, title)
    } else onToast(saved.message, saved.cancelled ? 'info' : 'error')
  }, [onToast])

  const canPrint = !Capacitor.isNativePlatform()

  return (
    <>
      <div className="no-print">
        <TopBar title="Salary summary" subtitle="Monthly attendance for payroll" onBack={onBack} />
      </div>

      <Section className="no-print">
        <Card className="p-4">
          <div className="grid grid-cols-[1.4fr_1fr] gap-2">
            <Dropdown
              label="Month"
              sheetTitle={`Month · ${picked.year}`}
              value={picked.month}
              onChange={(month) => setPicked((p) => ({ ...p, month }))}
              options={MONTHS.map((m) => ({
                value: m,
                label: new Date(2000, m - 1, 1).toLocaleDateString('en-IN', { month: 'long' }),
                disabled: isFuture(picked.year, m),
                hint: isFuture(picked.year, m) ? 'Not started' : undefined,
              }))}
            />
            <Dropdown
              label="Year"
              value={picked.year}
              onChange={(year) => setPicked((p) => ({ year, month: isFuture(year, p.month) ? now.getMonth() + 1 : p.month }))}
              options={years.map((y) => ({ value: y, label: String(y) }))}
            />
          </div>
          <p className="mt-2 text-[12px] text-ink-muted">Run it in the first days of the month for the month before.</p>
        </Card>
      </Section>

      {state.status === 'loading' ? (
        <Section>
          <Card className="flex items-center justify-center gap-2 px-4 py-10 text-[14px] text-ink-muted">
            <Spinner /> Calculating {monthName(picked.year, picked.month)}
          </Card>
        </Section>
      ) : state.status === 'error' ? (
        <Section>
          <div className="space-y-3" role="alert">
            <Notice tone="bad">{state.message}</Notice>
            <Button variant="secondary" onClick={() => setRetry((r) => r + 1)}>
              Try again
            </Button>
          </div>
        </Section>
      ) : (
        <Report
          report={state.report}
          exporting={exporting}
          canPrint={canPrint}
          showRules={showRules}
          onToggleRules={() => setShowRules((s) => !s)}
          onExport={() => exportCsv(state.report)}
        />
      )}
    </>
  )
}

function Report({
  report, exporting, canPrint, showRules, onToggleRules, onExport,
}: {
  report: SalarySummary
  exporting: boolean
  canPrint: boolean
  showRules: boolean
  onToggleRules: () => void
  onExport: () => void
}) {
  const t = report.totals
  return (
    <>
      <Section title={monthName(report.year, report.month)} className="print-area">
        {report.provisional && (
          <div className="mb-3">
            <Notice tone="bad">
              Provisional: {monthName(report.year, report.month)} is not over. Working days after {report.asOf} are not counted
              yet. Run the final report after the month ends.
            </Notice>
          </div>
        )}
        <div className="grid grid-cols-2 gap-2 min-[400px]:grid-cols-4">
          <Metric label="Employees" value={t.employees} />
          <Metric label="Payable days" value={t.payableDays} />
          <Metric label="LOP days" value={t.lopDays} tone={t.lopDays ? 'bad' : undefined} />
          <Metric label="To review" value={t.needsReview} tone={t.needsReview ? 'warn' : 'ok'} />
        </div>

        <div className="no-print mt-3 grid grid-cols-2 gap-2">
          <Button onClick={onExport} disabled={exporting || report.rows.length === 0}>
            {exporting ? <Spinner /> : <Icon name="download" className="h-4 w-4" />} Export for Excel
          </Button>
          {canPrint ? (
            <Button variant="secondary" onClick={() => window.print()} disabled={report.rows.length === 0}>
              <Icon name="file" className="h-4 w-4" /> Print
            </Button>
          ) : (
            <Button variant="secondary" onClick={onToggleRules}>
              <Icon name="info" className="h-4 w-4" /> {showRules ? 'Hide rules' : 'How it’s calculated'}
            </Button>
          )}
        </div>
        {!canPrint && (
          <p className="no-print mt-2 text-[12px] text-ink-muted">
            To print, open the exported file in Excel, or open this page in a browser on a computer.
          </p>
        )}
        {canPrint && (
          <button type="button" onClick={onToggleRules} className="no-print mt-2 text-[13px] font-semibold text-navy-700">
            {showRules ? 'Hide calculation rules' : 'How the figures are calculated'}
          </button>
        )}
        {showRules && <Rules />}
        <div className="print-only">
          <Rules />
        </div>
      </Section>

      <Section title="Employees" className="print-area">
        {report.rows.length === 0 ? (
          <EmptyState icon="users" title="No employees for this month" message="Nobody was employed in this month." />
        ) : (
          <Card className="overflow-hidden">
            {/* contain: paint keeps the wide table inside this scroll box. Without it the
                table still widened the page, and Android's WebView then stretched
                full-screen pop-ups (the Month/Year lists) past the right edge. */}
            <div className="overflow-x-auto [contain:paint]">
              <table className="salary-table w-full min-w-[1060px] border-collapse text-[13px]">
                <thead>
                  <tr className="bg-mist-50 text-left text-[12px] font-semibold text-ink-soft">
                    {['S.No', 'Employee ID', 'Employee name', 'Working', 'Present', 'Paid leave', 'Unpaid leave', 'Holidays',
                      'Weekly offs', 'Absences', 'Pending', 'Review', 'LOP', 'Payable', 'Status'].map((h, i) => (
                      <th key={h} className={`whitespace-nowrap border-b border-line px-3 py-2.5 ${i >= 3 && i <= 13 ? 'text-right' : ''}`}>
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {report.rows.map((r) => (
                    <tr key={r.employeeId} className="border-b border-line/70 align-top last:border-b-0">
                      <td className="tnum px-3 py-2.5 text-ink-muted">{r.serialNo}</td>
                      <td className="tnum whitespace-nowrap px-3 py-2.5 font-medium text-ink">{r.employeeCode}</td>
                      <td className="px-3 py-2.5">
                        <span className="font-medium text-ink">{r.employeeName}</span>
                        {r.flags.length > 0 && (
                          <ul className="mt-1 space-y-0.5 text-[12px] leading-snug text-pending-ink">
                            {r.flags.map((f) => (
                              <li key={f} className="flex gap-1">
                                <Icon name="alert" className="mt-[2px] h-3 w-3 shrink-0" />
                                {f}
                              </li>
                            ))}
                          </ul>
                        )}
                      </td>
                      <Num v={r.workingDays} />
                      <Num v={r.presentDays} />
                      <Num v={r.paidLeaveDays} />
                      <Num v={r.unpaidLeaveDays} />
                      <Num v={r.holidays} />
                      <Num v={r.weeklyOffs} />
                      <Num v={r.absences} strong={r.absences > 0} />
                      <Num v={r.pendingDays} strong={r.pendingDays > 0} />
                      <Num v={r.reviewDays} strong={r.reviewDays > 0} />
                      <Num v={r.lopDays} strong={r.lopDays > 0} />
                      <Num v={r.payableDays} strong />
                      <td className="whitespace-nowrap px-3 py-2.5">
                        <StatusBadge
                          status={r.complete && r.absences === 0 ? 'Approved' : r.pendingDays > 0 || r.reviewDays > 0 ? 'Pending' : 'Rejected'}
                        />
                        <span className="sr-only">{r.complete ? 'Ready for payroll' : 'Needs review'}</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="bg-mist-50 font-semibold text-ink">
                    <td className="px-3 py-2.5" colSpan={3}>
                      Total · {t.employees} employees
                    </td>
                    <td />
                    <Num v={t.presentDays} />
                    <Num v={t.paidLeaveDays} />
                    <Num v={t.unpaidLeaveDays} />
                    <td />
                    <td />
                    <Num v={t.absences} />
                    <Num v={t.pendingDays} />
                    <Num v={t.reviewDays} />
                    <Num v={t.lopDays} />
                    <Num v={t.payableDays} />
                    <td />
                  </tr>
                </tfoot>
              </table>
            </div>
          </Card>
        )}
        <p className="mt-2 text-[12px] text-ink-muted">
          Status: green = ready for payroll, orange = waiting for HR approval or review, red = LOP to confirm. Generated{' '}
          {new Date(report.generatedAt).toLocaleString('en-IN')}.
        </p>
      </Section>
    </>
  )
}

function Rules() {
  return (
    <Card className="mt-3 p-4">
      <p className="text-[13px] font-semibold text-ink">How the figures are calculated</p>
      <ol className="mt-2 list-decimal space-y-1 pl-5 text-[12.5px] leading-relaxed text-ink-soft">
        {SALARY_RULES.map((r) => (
          <li key={r}>{r}</li>
        ))}
      </ol>
    </Card>
  )
}

function Num({ v, strong }: { v: number; strong?: boolean }) {
  return <td className={`tnum px-3 py-2.5 text-right ${strong ? 'font-semibold text-ink' : 'text-ink-soft'}`}>{v}</td>
}

function Metric({ label, value, tone }: { label: string; value: number; tone?: 'ok' | 'warn' | 'bad' }) {
  const color = tone === 'bad' ? 'text-rejected-ink' : tone === 'warn' ? 'text-pending-ink' : tone === 'ok' ? 'text-approved-ink' : 'text-ink'
  return (
    <Card className="px-3 py-3">
      <p className="text-[12px] text-ink-muted">{label}</p>
      <p className={`tnum mt-0.5 text-[22px] font-semibold leading-tight ${color}`}>{value}</p>
    </Card>
  )
}
