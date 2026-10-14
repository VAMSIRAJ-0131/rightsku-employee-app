// Employee documents: HR uploads and corrects them; employees download only
// their own. The server checks every rule again (file type from the content,
// size, permissions); these checks only give faster feedback.
import { apiDownload, apiRequest, type ApiResult } from './api'
import type { DocType, EmployeeDocument } from '../data/types'

export type ApiDocumentType = 'OFFER_LETTER' | 'EXPERIENCE_LETTER' | 'PAYSLIP' | 'FORM_16'

export interface DocumentRecord {
  id: number
  employeeId: number
  employeeCode: string
  employeeName: string
  type: ApiDocumentType
  typeLabel: string
  period: string | null
  title: string
  fileName: string
  contentType: string
  sizeBytes: number
  version: number
  uploadedAt: string
  updatedAt: string
}

export const DOCUMENT_TYPES: { type: ApiDocumentType; label: DocType; period: 'none' | 'month' | 'year'; hint: string }[] = [
  { type: 'OFFER_LETTER', label: 'Offer Letter', period: 'none', hint: 'One per employee' },
  { type: 'EXPERIENCE_LETTER', label: 'Experience Letter', period: 'none', hint: 'Issued on exit' },
  { type: 'PAYSLIP', label: 'Payslip', period: 'month', hint: 'One per month' },
  { type: 'FORM_16', label: 'Form 16', period: 'year', hint: 'One per financial year' },
]

/** Same limits as the backend (DocumentFileRules). */
export const MAX_DOCUMENT_BYTES = 10 * 1024 * 1024
const ALLOWED_TYPES = ['application/pdf', 'image/png', 'image/jpeg']
const ALLOWED_EXTENSIONS = /\.(pdf|png|jpe?g)$/i
/** For the file picker. */
export const DOCUMENT_ACCEPT = '.pdf,.png,.jpg,.jpeg,application/pdf,image/png,image/jpeg'

export function periodKind(type: ApiDocumentType): 'none' | 'month' | 'year' {
  return DOCUMENT_TYPES.find((t) => t.type === type)?.period ?? 'none'
}

export function labelFor(type: ApiDocumentType): DocType {
  return DOCUMENT_TYPES.find((t) => t.type === type)?.label ?? 'Offer Letter'
}

/** Financial years for Form 16, newest first: "2026-27", "2025-26", ... */
export function financialYears(today = new Date(), count = 6): string[] {
  // The Indian financial year starts on 1 April.
  const startYear = today.getMonth() >= 3 ? today.getFullYear() : today.getFullYear() - 1
  return Array.from({ length: count }, (_, i) => {
    const y = startYear - i
    return `${y}-${String((y + 1) % 100).padStart(2, '0')}`
  })
}

export interface UploadFormValues {
  type: ApiDocumentType | ''
  /** "2026-09" for payslips, "2025-26" for Form 16, empty for letters. */
  period: string
  title: string
  file: File | null
}

export type UploadFormErrors = Partial<Record<'type' | 'period' | 'title' | 'file', string>>

export function checkFile(file: { name: string; size: number; type: string } | null): string | undefined {
  if (!file) return 'Choose a file to upload.'
  if (file.size === 0) return 'This file is empty.'
  if (file.size > MAX_DOCUMENT_BYTES) return 'The file is larger than 10 MB.'
  if (!ALLOWED_TYPES.includes(file.type) && !ALLOWED_EXTENSIONS.test(file.name)) {
    return 'Only PDF, PNG or JPG files can be uploaded.'
  }
  return undefined
}

export function validateUpload(values: UploadFormValues): UploadFormErrors {
  const errors: UploadFormErrors = {}
  if (!values.type) errors.type = 'Choose a document type.'
  else {
    const kind = periodKind(values.type)
    if (kind === 'month' && !/^\d{4}-(0[1-9]|1[0-2])$/.test(values.period)) errors.period = 'Choose the payslip month.'
    if (kind === 'year') {
      const m = /^(\d{4})-(\d{2})$/.exec(values.period)
      if (!m || (Number(m[1]) + 1) % 100 !== Number(m[2])) errors.period = 'Choose the financial year.'
    }
  }
  if (values.title.trim().length > 150) errors.title = 'Use at most 150 characters.'
  const fileError = checkFile(values.file)
  if (fileError) errors.file = fileError
  return errors
}

/** Multipart body for the upload. Letters send no period. */
export function toUploadForm(values: UploadFormValues): FormData {
  const form = new FormData()
  form.append('type', values.type)
  if (values.type && periodKind(values.type) !== 'none') form.append('period', values.period)
  if (values.title.trim()) form.append('title', values.title.trim())
  if (values.file) form.append('file', values.file, values.file.name)
  return form
}

export function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

/** The shape the employee screens already use. */
export function toEmployeeDocument(record: DocumentRecord, employeeId: string): EmployeeDocument {
  return {
    id: String(record.id),
    employeeId,
    type: labelFor(record.type),
    title: record.title,
    issuedOn: record.updatedAt.slice(0, 10),
  }
}

/* ---------- API: HR ---------- */

export function listEmployeeDocuments(token: string, employeeId: number, signal?: AbortSignal) {
  return apiRequest<DocumentRecord[]>(`/api/hr/employees/${employeeId}/documents`, { token, signal })
}

export function listRecentDocuments(token: string, signal?: AbortSignal) {
  return apiRequest<DocumentRecord[]>('/api/hr/documents?limit=20', { token, signal })
}

export function uploadDocument(token: string, employeeId: number, values: UploadFormValues): Promise<ApiResult<DocumentRecord>> {
  return apiRequest<DocumentRecord>(`/api/hr/employees/${employeeId}/documents`, {
    token,
    method: 'POST',
    body: toUploadForm(values),
  })
}

/** Replaces the file with a corrected one and/or changes the title. */
export function updateDocument(token: string, documentId: number, change: { title?: string; file?: File | null }) {
  const form = new FormData()
  if (change.title?.trim()) form.append('title', change.title.trim())
  if (change.file) form.append('file', change.file, change.file.name)
  return apiRequest<DocumentRecord>(`/api/hr/documents/${documentId}`, { token, method: 'POST', body: form })
}

export function downloadHrDocument(token: string, doc: Pick<DocumentRecord, 'id' | 'fileName'>) {
  return apiDownload(`/api/hr/documents/${doc.id}/file`, { token, fallbackName: doc.fileName })
}

/* ---------- API: employee (own documents only) ---------- */

export function listMyDocuments(token: string, signal?: AbortSignal) {
  return apiRequest<DocumentRecord[]>('/api/employee/documents', { token, signal })
}

export function downloadMyDocument(token: string, documentId: string, fallbackName: string) {
  return apiDownload(`/api/employee/documents/${encodeURIComponent(documentId)}/file`, { token, fallbackName })
}
