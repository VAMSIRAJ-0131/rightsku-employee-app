// Saving a downloaded document so the person can find it in their file manager.
//
// In a desktop browser a temporary link with "download" saves the file. In the
// Android app (a Capacitor WebView) that does nothing: the WebView has no
// download handler and cannot hand an in-memory blob: URL to Android. So on
// Android the file is written straight into the shared Documents folder, in
// Documents/RightCentral, where every file manager shows it. Android 11 and
// newer allow this without any permission; Android 10 and older ask once for
// storage access (see AndroidManifest.xml).
//
// Only if that save fails for another reason does the app fall back to
// Android's share sheet, so the person can still choose where to save it.
// The caller shows "saved" only when this returns ok.
import { Capacitor } from '@capacitor/core'
import { Directory, Filesystem } from '@capacitor/filesystem'
import { Share } from '@capacitor/share'
import { saveFile, type DownloadedFile } from './api'

/** Folder inside the phone's shared Documents folder. */
export const SAVE_FOLDER = 'RightCentral'

export type SaveResult =
  | { ok: true; method: 'browser' | 'share' }
  /** uri and mimeType let a notification open the saved file. */
  | { ok: true; method: 'saved'; location: string; fileName: string; uri: string; mimeType: string }
  | { ok: false; cancelled: boolean; message: string }

const EXTENSIONS: Record<string, string> = {
  'application/pdf': 'pdf',
  'image/png': 'png',
  'image/jpeg': 'jpg',
}

/** A safe file name with the extension that matches the content (the server's name when it sent one). */
export function fileNameFor(file: DownloadedFile): string {
  const ext = EXTENSIONS[file.blob.type]
  const base = file.fileName.replace(/[\\/:*?"<>|\u0000-\u001f]/g, '').trim() || 'document'
  if (!ext) return base
  return base.toLowerCase().endsWith(`.${ext}`) ? base : `${base.replace(/\.(pdf|png|jpe?g)$/i, '')}.${ext}`
}

/** "Payslip.pdf", then "Payslip (2).pdf", "Payslip (3).pdf", ... */
export function numberedName(name: string, n: number): string {
  if (n <= 1) return name
  const dot = name.lastIndexOf('.')
  return dot > 0 ? `${name.slice(0, dot)} (${n})${name.slice(dot)}` : `${name} (${n})`
}

/** The file content as base64, which is what the Filesystem plugin writes. */
export async function blobToBase64(blob: Blob): Promise<string> {
  const bytes = new Uint8Array(await blob.arrayBuffer())
  let binary = ''
  // In slices, so large files never hit the argument limit of String.fromCharCode.
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  }
  return btoa(binary)
}

/** A name not used yet in Documents/RightCentral, so an earlier download is never overwritten. */
async function freeName(name: string): Promise<string> {
  for (let n = 1; n <= 50; n++) {
    const candidate = numberedName(name, n)
    try {
      await Filesystem.stat({ path: `${SAVE_FOLDER}/${candidate}`, directory: Directory.Documents })
    } catch {
      return candidate // does not exist yet
    }
  }
  return numberedName(name, Date.now())
}

function isPermissionError(error: unknown): boolean {
  const text = error instanceof Error ? error.message : String(error)
  return /permission|denied|not allowed/i.test(text)
}

export async function saveDownloadedFile(file: DownloadedFile, title: string): Promise<SaveResult> {
  const name = fileNameFor(file)
  if (!Capacitor.isNativePlatform()) {
    saveFile({ ...file, fileName: name })
    return { ok: true, method: 'browser' }
  }

  let data: string
  try {
    data = await blobToBase64(file.blob)
  } catch {
    return { ok: false, cancelled: false, message: 'Couldn’t read the downloaded file. Try again.' }
  }

  // 1. Straight into Documents/RightCentral.
  let saveError: unknown
  try {
    const savedName = await freeName(name)
    const written = await Filesystem.writeFile({
      path: `${SAVE_FOLDER}/${savedName}`,
      data,
      directory: Directory.Documents,
      recursive: true,
    })
    return {
      ok: true,
      method: 'saved',
      location: `Documents/${SAVE_FOLDER}/${savedName}`,
      fileName: savedName,
      uri: written.uri,
      mimeType: file.blob.type || 'application/octet-stream',
    }
  } catch (error) {
    saveError = error
  }
  if (isPermissionError(saveError)) {
    return {
      ok: false,
      cancelled: false,
      message: 'Allow RightCentral to save files (Settings › Apps › RightCentral › Permissions), then try again.',
    }
  }

  // 2. Fallback: Android's share sheet, where the person picks where to save it.
  let uri: string
  try {
    uri = (await Filesystem.writeFile({ path: `documents/${name}`, data, directory: Directory.Cache, recursive: true })).uri
  } catch {
    return { ok: false, cancelled: false, message: 'Couldn’t save the file on this phone. Check free space and try again.' }
  }
  try {
    await Share.share({ title, files: [uri], dialogTitle: `Save ${title}` })
    return { ok: true, method: 'share' }
  } catch (error) {
    const text = error instanceof Error ? error.message : String(error)
    if (/cancel/i.test(text)) return { ok: false, cancelled: true, message: 'Not saved. Tap download again when you’re ready.' }
    return { ok: false, cancelled: false, message: 'Couldn’t save the file. Try again.' }
  }
}

/** The message to show after a successful save. */
export function savedMessage(title: string, result: Extract<SaveResult, { ok: true }>): string {
  if (result.method === 'saved') return `${title} saved to ${result.location.replace(/\/[^/]*$/, '').replace(/\//g, ' › ')}.`
  if (result.method === 'share') return `${title} is ready.`
  return `${title} downloaded.`
}
