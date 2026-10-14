// HR: the documents of one employee, shown on their details page, with
// download and "replace with a corrected file".
import { useEffect, useState } from 'react'
import { Icon } from '../../components/Icons'
import { Button, Card, EmptyState, List, ListRow, Notice, Section, Spinner } from '../../components/ui'
import { saveFile, type ApiError } from '../../lib/api'
import { downloadHrDocument, formatSize, listEmployeeDocuments, type DocumentRecord } from '../../lib/documents'
import { formatDate } from '../../lib/format'

export default function EmployeeDocumentsSection({
  token, employeeId, version, onUpload, onReplace, onError, onToast,
}: {
  token: string
  employeeId: number
  /** Changes after an upload or replace, so the list reloads. */
  version: number
  onUpload: () => void
  onReplace: (doc: DocumentRecord) => void
  onError: (error: ApiError) => ApiError
  onToast: (text: string, tone?: 'info' | 'success' | 'error') => void
}) {
  const [docs, setDocs] = useState<DocumentRecord[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [retry, setRetry] = useState(0)

  useEffect(() => {
    const controller = new AbortController()
    setError(null)
    listEmployeeDocuments(token, employeeId, controller.signal).then((result) => {
      if (controller.signal.aborted) return
      if (result.ok) setDocs(result.data)
      else setError(onError(result.error).message)
    })
    return () => controller.abort()
  }, [token, employeeId, version, retry, onError])

  async function download(doc: DocumentRecord) {
    const result = await downloadHrDocument(token, doc)
    if (result.ok) saveFile(result.data)
    else onToast(onError(result.error).message, 'error')
  }

  return (
    <Section
      title={docs ? `Documents (${docs.length})` : 'Documents'}
      action={
        <Button size="sm" variant="secondary" onClick={onUpload}>
          <Icon name="upload" className="h-4 w-4" /> Upload
        </Button>
      }
    >
      {error ? (
        <div className="space-y-3" role="alert">
          <Notice tone="bad">{error}</Notice>
          <Button variant="secondary" size="sm" onClick={() => setRetry((r) => r + 1)}>
            Try again
          </Button>
        </div>
      ) : docs === null ? (
        <Card className="flex items-center justify-center gap-2 px-4 py-8 text-[14px] text-ink-muted">
          <Spinner /> Loading documents
        </Card>
      ) : docs.length === 0 ? (
        <EmptyState icon="file" title="No documents yet" message="Upload an offer letter, payslip, Form 16 or experience letter." />
      ) : (
        <List>
          {docs.map((d) => (
            <ListRow
              key={d.id}
              icon={d.type === 'PAYSLIP' ? 'receipt' : 'file'}
              title={d.title}
              subtitle={
                <span className="tnum">
                  {formatDate(d.updatedAt.slice(0, 10))}, {formatSize(d.sizeBytes)}
                  {d.version > 1 ? `, version ${d.version}` : ''}
                </span>
              }
              right={
                <span className="flex items-center">
                  <button
                    type="button"
                    onClick={() => download(d)}
                    aria-label={`Download ${d.title}`}
                    className="grid h-11 w-11 place-items-center rounded-full text-navy-700 hover:bg-mist-50"
                  >
                    <Icon name="download" className="h-[18px] w-[18px]" />
                  </button>
                  <button
                    type="button"
                    onClick={() => onReplace(d)}
                    className="h-11 rounded-md px-2 text-[13px] font-semibold text-navy-700 hover:bg-mist-50"
                  >
                    Replace
                  </button>
                </span>
              }
            />
          ))}
        </List>
      )}
    </Section>
  )
}
