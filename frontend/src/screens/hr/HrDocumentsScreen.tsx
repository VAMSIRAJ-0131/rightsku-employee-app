// HR Documents tab: upload a document for any employee (with an employee
// picker), see recent uploads, download them and replace a file with a
// corrected version.
import { useCallback, useEffect, useState } from 'react'
import { Icon } from '../../components/Icons'
import { Button, Card, EmptyState, List, ListRow, Notice, Section, Spinner, TopBar } from '../../components/ui'
import { saveFile, type ApiError } from '../../lib/api'
import {
  DOCUMENT_TYPES, downloadHrDocument, formatSize, listRecentDocuments,
  type ApiDocumentType, type DocumentRecord,
} from '../../lib/documents'
import { formatShortDate } from '../../lib/format'
import DocumentUploadForm from './DocumentUploadForm'

type View = { kind: 'list' } | { kind: 'upload'; type: ApiDocumentType } | { kind: 'replace'; document: DocumentRecord }

export default function HrDocumentsScreen({
  token, onToast, onSessionExpired, onChanged,
}: {
  token: string
  onToast: (text: string, tone?: 'info' | 'success' | 'error') => void
  onSessionExpired: () => void
  onChanged: () => void
}) {
  const [view, setView] = useState<View>({ kind: 'list' })
  const [docs, setDocs] = useState<DocumentRecord[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [version, setVersion] = useState(0)

  const handleError = useCallback(
    (e: ApiError) => {
      if (e.kind === 'unauthorized') onSessionExpired()
      return e
    },
    [onSessionExpired],
  )

  useEffect(() => {
    if (view.kind !== 'list') return
    const controller = new AbortController()
    setError(null)
    listRecentDocuments(token, controller.signal).then((result) => {
      if (controller.signal.aborted) return
      if (result.ok) setDocs(result.data)
      else setError(handleError(result.error).message)
    })
    return () => controller.abort()
  }, [token, version, view.kind, handleError])

  const saved = (message: string) => {
    setVersion((v) => v + 1)
    onChanged()
    onToast(message, 'success')
    setView({ kind: 'list' })
  }

  if (view.kind === 'upload') {
    return (
      <DocumentUploadForm
        mode="upload"
        token={token}
        initialType={view.type}
        onCancel={() => setView({ kind: 'list' })}
        onSaved={(doc) => saved(`${doc.title} uploaded for ${doc.employeeName}.`)}
        onError={handleError}
      />
    )
  }
  if (view.kind === 'replace') {
    return (
      <DocumentUploadForm
        mode="replace"
        token={token}
        document={view.document}
        onCancel={() => setView({ kind: 'list' })}
        onSaved={(doc) => saved(`${doc.title} replaced.`)}
        onError={handleError}
      />
    )
  }

  async function download(doc: DocumentRecord) {
    const result = await downloadHrDocument(token, doc)
    if (result.ok) saveFile(result.data)
    else onToast(handleError(result.error).message, 'error')
  }

  return (
    <>
      <TopBar title="Documents" subtitle="Upload and assign to employees" />
      <Section title="Upload">
        <List>
          {DOCUMENT_TYPES.map((t) => (
            <ListRow
              key={t.type}
              icon={t.type === 'PAYSLIP' ? 'receipt' : 'file'}
              title={t.label}
              subtitle={t.hint}
              right={
                <Button size="sm" variant="secondary" onClick={() => setView({ kind: 'upload', type: t.type })}>
                  <Icon name="upload" className="h-4 w-4" /> Upload
                </Button>
              }
            />
          ))}
        </List>
        <p className="mt-2 px-1 text-[12px] text-ink-muted">
          Every file belongs to one employee. Only that employee and HR can download it.
        </p>
      </Section>
      <Section title={docs ? `Recently uploaded (${docs.length})` : 'Recently uploaded'}>
        {error ? (
          <div className="space-y-3" role="alert">
            <Notice tone="bad">{error}</Notice>
            <Button variant="secondary" size="sm" onClick={() => setVersion((v) => v + 1)}>
              Try again
            </Button>
          </div>
        ) : docs === null ? (
          <Card className="flex items-center justify-center gap-2 px-4 py-8 text-[14px] text-ink-muted">
            <Spinner /> Loading documents
          </Card>
        ) : docs.length === 0 ? (
          <EmptyState icon="file" title="No documents uploaded yet" message="Uploaded documents will be listed here." />
        ) : (
          <List>
            {docs.map((d) => (
              <ListRow
                key={d.id}
                icon={d.type === 'PAYSLIP' ? 'receipt' : 'file'}
                title={d.title}
                subtitle={
                  <span className="tnum">
                    {d.employeeName} ({d.employeeCode}), {formatShortDate(d.updatedAt.slice(0, 10))}, {formatSize(d.sizeBytes)}
                  </span>
                }
                right={
                  <span className="flex items-center">
                    <button
                      type="button"
                      onClick={() => download(d)}
                      aria-label={`Download ${d.title} for ${d.employeeName}`}
                      className="grid h-11 w-11 place-items-center rounded-full text-navy-700 hover:bg-mist-50"
                    >
                      <Icon name="download" className="h-[18px] w-[18px]" />
                    </button>
                    <button
                      type="button"
                      onClick={() => setView({ kind: 'replace', document: d })}
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
    </>
  )
}
