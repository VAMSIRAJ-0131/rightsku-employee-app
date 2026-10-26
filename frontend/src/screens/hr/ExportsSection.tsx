// HR Reports: download employees, leave, timesheets or Comp-Off for a month
// as a CSV file that opens in Excel. Bank account numbers are included only
// when HR ticks the box; every export is recorded in Activity.
import { useState } from 'react'
import { Icon } from '../../components/Icons'
import Dropdown from '../../components/Dropdown'
import { Card, Section, Spinner } from '../../components/ui'
import type { ApiError } from '../../lib/api'
import { EXPORTS, downloadExport, type ExportKind } from '../../lib/activity'
import { saveDownloadedFile, savedMessage } from '../../lib/fileSave'
import { MONTH_NAMES } from '../../lib/payslips'

export default function ExportsSection({
  token, onError, onToast,
}: {
  token: string
  onError: (error: ApiError) => ApiError
  onToast: (message: string, tone?: 'success' | 'error' | 'info') => void
}) {
  const now = new Date()
  const [year, setYear] = useState(now.getFullYear())
  const [month, setMonth] = useState(now.getMonth() + 1)
  const [withBank, setWithBank] = useState(false)
  const [busy, setBusy] = useState<ExportKind | null>(null)
  const ym = `${year}-${String(month).padStart(2, '0')}`

  async function run(kind: ExportKind) {
    if (busy) return
    setBusy(kind)
    const result = await downloadExport(token, kind, ym, withBank)
    setBusy(null)
    if (!result.ok) {
      onToast(onError(result.error).message, 'error')
      return
    }
    const saved = await saveDownloadedFile(result.data, result.data.fileName)
    if (saved.ok) onToast(savedMessage(result.data.fileName, saved), 'success')
    else onToast(saved.message, saved.cancelled ? 'info' : 'error')
  }

  return (
    <Section title="Export to Excel">
      <Card className="p-4">
        <p className="text-[13px] text-ink-muted">CSV files that open in Excel or Google Sheets. Each export is recorded in Activity.</p>
        <div className="mt-4 grid grid-cols-2 gap-3">
          <Dropdown label="Month" value={month} onChange={setMonth}
            options={MONTH_NAMES.map((name, i) => ({ value: i + 1, label: name }))} />
          <Dropdown label="Year" value={year} onChange={setYear}
            options={Array.from({ length: 6 }, (_, i) => now.getFullYear() - i).map((y) => ({ value: y, label: String(y) }))} />
        </div>
        <div className="mt-4 divide-y divide-line rounded-xl ring-1 ring-inset ring-line">
          {EXPORTS.map((e) => (
            <div key={e.kind} className="flex items-center gap-3 px-3 py-3">
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-approved-soft text-approved-ink">
                <Icon name="chart" className="h-5 w-5" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-[15px] font-semibold text-ink">{e.label}</span>
                <span className="block text-[12px] text-ink-muted">{e.monthly ? `${MONTH_NAMES[month - 1]} ${year} · ` : ''}{e.hint}</span>
              </span>
              <button
                type="button"
                onClick={() => void run(e.kind)}
                disabled={!!busy}
                aria-label={`Download ${e.label}`}
                className="press grid h-11 w-11 shrink-0 place-items-center rounded-full bg-royal-50 text-royal-700 ring-1 ring-inset ring-royal-100 transition-transform duration-150 disabled:opacity-50"
              >
                {busy === e.kind ? <Spinner /> : <Icon name="download" className="h-5 w-5" />}
              </button>
            </div>
          ))}
        </div>
        <label className="mt-3 flex items-start gap-2.5 px-1 text-[13px] text-ink-soft">
          <input type="checkbox" checked={withBank} onChange={(e) => setWithBank(e.target.checked)} className="mt-0.5 h-4 w-4 accent-[#2554cc]" />
          <span>Include full bank account numbers in the Employees file (otherwise only the last 4 digits).</span>
        </label>
      </Card>
    </Section>
  )
}
