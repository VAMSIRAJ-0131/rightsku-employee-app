import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  MAX_DOCUMENT_BYTES, checkFile, financialYears, toEmployeeDocument, toUploadForm, updateDocument, uploadDocument,
  validateUpload, type DocumentRecord, type UploadFormValues,
} from './documents'
import { downloadMyDocument } from './documents'
import { fileNameFromDisposition } from './api'

const TOKEN = 'test-only-token'
const pdf = () => new File(['%PDF-1.7 test'], 'sept.pdf', { type: 'application/pdf' })

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('upload checks', () => {
  const base: UploadFormValues = { type: 'PAYSLIP', period: '2026-09', title: '', file: null }

  it('accepts a payslip with a month and a PDF', () => {
    expect(validateUpload({ ...base, file: pdf() })).toEqual({})
  })

  it('needs the right period for each type', () => {
    expect(validateUpload({ ...base, period: '', file: pdf() }).period).toBeDefined()
    expect(validateUpload({ ...base, type: 'FORM_16', period: '2025-27', file: pdf() }).period).toBeDefined()
    expect(validateUpload({ ...base, type: 'FORM_16', period: '2025-26', file: pdf() })).toEqual({})
    expect(validateUpload({ ...base, type: 'OFFER_LETTER', period: '', file: pdf() })).toEqual({})
    expect(validateUpload({ ...base, type: '', file: pdf() }).type).toBeDefined()
  })

  it('refuses missing, empty, oversized and unsupported files', () => {
    expect(checkFile(null)).toBeDefined()
    expect(checkFile({ name: 'a.pdf', size: 0, type: 'application/pdf' })).toBeDefined()
    expect(checkFile({ name: 'a.pdf', size: MAX_DOCUMENT_BYTES + 1, type: 'application/pdf' })).toContain('10 MB')
    expect(checkFile({ name: 'a.exe', size: 10, type: 'application/x-msdownload' })).toContain('PDF, PNG or JPG')
    expect(checkFile({ name: 'scan.JPG', size: 10, type: '' })).toBeUndefined()
  })

  it('builds the multipart form; letters send no period', () => {
    const payslip = toUploadForm({ ...base, title: ' Sept ', file: pdf() })
    expect(payslip.get('type')).toBe('PAYSLIP')
    expect(payslip.get('period')).toBe('2026-09')
    expect(payslip.get('title')).toBe('Sept')
    expect((payslip.get('file') as File).name).toBe('sept.pdf')
    const letter = toUploadForm({ type: 'OFFER_LETTER', period: '2026-09', title: '', file: pdf() })
    expect(letter.has('period')).toBe(false)
    expect(letter.has('title')).toBe(false)
  })

  it('lists financial years starting in April', () => {
    expect(financialYears(new Date(2026, 9, 14), 3)).toEqual(['2026-27', '2025-26', '2024-25'])
    expect(financialYears(new Date(2026, 1, 1), 1)).toEqual(['2025-26'])
  })
})

describe('document API calls', () => {
  it('uploads as multipart without forcing a JSON content type', async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ id: 5 }), { status: 201 }))
    vi.stubGlobal('fetch', fetchMock)

    await uploadDocument(TOKEN, 10, { type: 'PAYSLIP', period: '2026-09', title: '', file: pdf() })

    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe('/api/hr/employees/10/documents')
    expect(init.method).toBe('POST')
    expect(init.body).toBeInstanceOf(FormData)
    expect((init.headers as Record<string, string>)['Content-Type']).toBeUndefined()
    expect((init.headers as Record<string, string>).Authorization).toBe(`Bearer ${TOKEN}`)
  })

  it('replaces a file with a POST to the document', async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ id: 7 }), { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)

    await updateDocument(TOKEN, 7, { file: pdf() })

    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe('/api/hr/documents/7')
    expect((init.body as FormData).has('file')).toBe(true)
    expect((init.body as FormData).has('title')).toBe(false)
  })

  it('downloads with the token and reads the file name from the server', async () => {
    const fetchMock = vi.fn(async () => new Response(new Blob(['%PDF-']), {
      status: 200,
      headers: { 'Content-Disposition': "attachment; filename=\"x.pdf\"; filename*=UTF-8''Sept%20payslip.pdf" },
    }))
    vi.stubGlobal('fetch', fetchMock)

    const result = await downloadMyDocument(TOKEN, '7', 'document.pdf')

    const [url] = fetchMock.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe('/api/employee/documents/7/file')
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.data.fileName).toBe('Sept payslip.pdf')
  })

  it('turns a refused download into an error, not a file', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ error: 'Document not found.' }), { status: 404 })))
    const result = await downloadMyDocument(TOKEN, '8', 'document.pdf')
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error.kind).toBe('not-found')
  })
})

describe('file names from the server', () => {
  it('never keeps folders or unsafe characters', () => {
    expect(fileNameFromDisposition('attachment; filename="../../evil.pdf"', 'd.pdf')).toBe('evil.pdf')
    expect(fileNameFromDisposition('attachment; filename*=UTF-8\'\'a%2Fb%3C.pdf', 'd.pdf')).toBe('b.pdf')
    expect(fileNameFromDisposition(null, 'd.pdf')).toBe('d.pdf')
    expect(fileNameFromDisposition('attachment; filename=".."', 'd.pdf')).toBe('d.pdf')
  })
})

describe('employee document shape', () => {
  it('maps a server record to the employee list item', () => {
    const record: DocumentRecord = {
      id: 7, employeeId: 10, employeeCode: 'EMP010', employeeName: 'Ravi Kumar', type: 'FORM_16', typeLabel: 'Form 16',
      period: '2025-26', title: 'Form 16 - FY 2025-26', fileName: 'f16.pdf', contentType: 'application/pdf',
      sizeBytes: 100, version: 1, uploadedAt: '2026-06-01T05:00:00Z', updatedAt: '2026-06-02T05:00:00Z',
    }
    expect(toEmployeeDocument(record, 'EMP010')).toEqual({
      id: '7', employeeId: 'EMP010', type: 'Form 16', title: 'Form 16 - FY 2025-26', issuedOn: '2026-06-02',
    })
  })
})
