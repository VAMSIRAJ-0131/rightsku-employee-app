import { beforeEach, describe, expect, it, vi } from 'vitest'

const native = vi.hoisted(() => ({
  isNative: false,
  writeFile: vi.fn(),
  stat: vi.fn(),
  share: vi.fn(),
  saveFile: vi.fn(),
}))

vi.mock('@capacitor/core', () => ({ Capacitor: { isNativePlatform: () => native.isNative } }))
vi.mock('@capacitor/filesystem', () => ({
  Directory: { Cache: 'CACHE', Documents: 'DOCUMENTS' },
  Filesystem: { writeFile: native.writeFile, stat: native.stat },
}))
vi.mock('@capacitor/share', () => ({ Share: { share: native.share } }))
vi.mock('./api', () => ({ saveFile: native.saveFile }))

import { blobToBase64, fileNameFor, numberedName, saveDownloadedFile, savedMessage } from './fileSave'

const pdf = () => ({ blob: new Blob(['%PDF-1.7'], { type: 'application/pdf' }), fileName: 'Payslip - September 2026.pdf' })
const notFound = () => Promise.reject(new Error('File does not exist'))

beforeEach(() => {
  native.isNative = false
  for (const m of [native.writeFile, native.stat, native.share, native.saveFile]) m.mockReset()
  native.stat.mockImplementation(notFound)
})

describe('file names', () => {
  it('keeps a correct name and fixes or adds the extension from the real content', () => {
    expect(fileNameFor(pdf())).toBe('Payslip - September 2026.pdf')
    expect(fileNameFor({ blob: new Blob(['x'], { type: 'image/png' }), fileName: 'Offer letter.pdf' })).toBe('Offer letter.png')
    expect(fileNameFor({ blob: new Blob(['x'], { type: 'image/jpeg' }), fileName: 'Experience letter' })).toBe('Experience letter.jpg')
    expect(fileNameFor({ blob: new Blob(['x'], { type: 'application/pdf' }), fileName: 'Form 16 2025-26' })).toBe('Form 16 2025-26.pdf')
  })

  it('removes characters that are not allowed in file names', () => {
    expect(fileNameFor({ blob: new Blob(['x'], { type: 'application/pdf' }), fileName: 'a/b:c*?.pdf' })).toBe('abc.pdf')
    expect(fileNameFor({ blob: new Blob(['x'], { type: 'application/pdf' }), fileName: '///' })).toBe('document.pdf')
  })

  it('numbers repeat downloads instead of overwriting', () => {
    expect(numberedName('Payslip.pdf', 1)).toBe('Payslip.pdf')
    expect(numberedName('Payslip.pdf', 2)).toBe('Payslip (2).pdf')
    expect(numberedName('README', 3)).toBe('README (3)')
  })
})

describe('blobToBase64', () => {
  it('returns only the base64 content', async () => {
    expect(await blobToBase64(new Blob(['hello'], { type: 'text/plain' }))).toBe(btoa('hello'))
  })
})

describe('saveDownloadedFile', () => {
  it('in a browser saves through a download link', async () => {
    const result = await saveDownloadedFile(pdf(), 'Payslip - September 2026')
    expect(result).toEqual({ ok: true, method: 'browser' })
    expect(native.saveFile).toHaveBeenCalledOnce()
    expect(native.writeFile).not.toHaveBeenCalled()
  })

  it('on Android saves into Documents/RightCentral and only then reports success, without the share sheet', async () => {
    native.isNative = true
    native.writeFile.mockResolvedValue({ uri: 'file:///storage/emulated/0/Documents/RightCentral/x.pdf' })

    const result = await saveDownloadedFile(pdf(), 'Payslip - September 2026')

    expect(result).toEqual({
      ok: true,
      method: 'saved',
      location: 'Documents/RightCentral/Payslip - September 2026.pdf',
      fileName: 'Payslip - September 2026.pdf',
      uri: 'file:///storage/emulated/0/Documents/RightCentral/x.pdf',
      mimeType: 'application/pdf',
    })
    expect(native.writeFile).toHaveBeenCalledWith({
      path: 'RightCentral/Payslip - September 2026.pdf',
      directory: 'DOCUMENTS',
      data: btoa('%PDF-1.7'),
      recursive: true,
    })
    expect(native.share).not.toHaveBeenCalled()
    expect(savedMessage('Payslip - September 2026', result as Extract<typeof result, { ok: true }>))
      .toBe('Payslip - September 2026 saved to Documents › RightCentral.')
  })

  it('never overwrites an earlier download of the same document', async () => {
    native.isNative = true
    native.stat.mockImplementation(({ path }: { path: string }) =>
      path.endsWith('Payslip - September 2026.pdf') || path.endsWith('(2).pdf') ? Promise.resolve({}) : notFound())
    native.writeFile.mockResolvedValue({ uri: 'file:///x' })

    const result = await saveDownloadedFile(pdf(), 'Payslip')

    expect(result).toMatchObject({ ok: true, location: 'Documents/RightCentral/Payslip - September 2026 (3).pdf' })
  })

  it('asks the person to allow storage access when Android refuses it (older phones)', async () => {
    native.isNative = true
    native.writeFile.mockRejectedValue(new Error('Permission denied'))

    const result = await saveDownloadedFile(pdf(), 'Payslip')

    expect(result).toEqual({ ok: false, cancelled: false, message: expect.stringMatching(/Allow RightCentral to save files/) })
    expect(native.share).not.toHaveBeenCalled()
  })

  it('falls back to the share sheet if the Documents folder cannot be used, and succeeds only when it completes', async () => {
    native.isNative = true
    native.writeFile
      .mockRejectedValueOnce(new Error('EIO'))
      .mockResolvedValueOnce({ uri: 'file:///cache/documents/x.pdf' })
    native.share.mockResolvedValue({ activityType: 'com.google.android.apps.docs' })

    expect(await saveDownloadedFile(pdf(), 'Payslip')).toEqual({ ok: true, method: 'share' })
    expect(native.writeFile).toHaveBeenLastCalledWith(expect.objectContaining({ directory: 'CACHE' }))
  })

  it('a cancelled share sheet is "not saved", not success', async () => {
    native.isNative = true
    native.writeFile.mockRejectedValueOnce(new Error('EIO')).mockResolvedValueOnce({ uri: 'file:///cache/x.pdf' })
    native.share.mockRejectedValue(new Error('Share canceled'))

    const result = await saveDownloadedFile(pdf(), 'Payslip')
    expect(result).toEqual({ ok: false, cancelled: true, message: expect.stringMatching(/Not saved/) })
  })

  it('reports a clear error when nothing can be written at all', async () => {
    native.isNative = true
    native.writeFile.mockRejectedValue(new Error('ENOSPC'))

    const result = await saveDownloadedFile(pdf(), 'Payslip')
    expect(result).toEqual({ ok: false, cancelled: false, message: expect.stringMatching(/Couldn’t save the file/) })
  })
})
