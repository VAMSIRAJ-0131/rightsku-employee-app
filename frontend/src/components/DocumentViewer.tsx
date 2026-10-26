// Shows a downloaded document inside the app (payslips): PDFs are drawn page
// by page with pdf.js (Android's web view can't show PDFs itself), images as
// they are. Nothing is saved to the phone; Download does that. pdf.js is only
// loaded the first time a PDF is opened, so it never slows the app's start.
import { useEffect, useRef, useState } from 'react'
import { Icon } from './Icons'
import { Spinner, useBackHandler } from './ui'
import type { DownloadedFile } from '../lib/api'

const ZOOMS = [1, 1.5, 2]

export default function DocumentViewer({
  title, file, onClose, onDownload,
}: {
  title: string
  /** null while the file is still being fetched. */
  file: DownloadedFile | null
  onClose: () => void
  onDownload: () => void
}) {
  useBackHandler(onClose)
  const [zoom, setZoom] = useState(0)
  const [problem, setProblem] = useState<string | null>(null)
  const [drawing, setDrawing] = useState(false)
  const pagesRef = useRef<HTMLDivElement | null>(null)
  const isPdf = !!file && (file.blob.type === 'application/pdf' || file.fileName.toLowerCase().endsWith('.pdf'))
  const [imageUrl, setImageUrl] = useState<string | null>(null)

  // Images: an object URL, released when the viewer closes.
  useEffect(() => {
    if (!file || isPdf) return
    const url = URL.createObjectURL(file.blob)
    setImageUrl(url)
    return () => URL.revokeObjectURL(url)
  }, [file, isPdf])

  // PDFs: draw every page at the chosen zoom, sharp on high-density screens.
  useEffect(() => {
    if (!file || !isPdf) return
    let cancelled = false
    const holder = pagesRef.current
    setDrawing(true)
    setProblem(null)
    ;(async () => {
      try {
        const pdfjs = await import('pdfjs-dist')
        const worker = (await import('pdfjs-dist/build/pdf.worker.min.mjs?url')).default
        pdfjs.GlobalWorkerOptions.workerSrc = worker
        const doc = await pdfjs.getDocument({ data: new Uint8Array(await file.blob.arrayBuffer()) }).promise
        if (cancelled || !holder) return
        holder.replaceChildren()
        const width = holder.clientWidth || window.innerWidth
        const ratio = window.devicePixelRatio || 1
        for (let n = 1; n <= doc.numPages && !cancelled; n++) {
          const page = await doc.getPage(n)
          const base = page.getViewport({ scale: 1 })
          const scale = (width / base.width) * ZOOMS[zoom]
          const viewport = page.getViewport({ scale: scale * ratio })
          const canvas = document.createElement('canvas')
          canvas.width = Math.floor(viewport.width)
          canvas.height = Math.floor(viewport.height)
          canvas.style.width = `${Math.floor(viewport.width / ratio)}px`
          canvas.style.height = `${Math.floor(viewport.height / ratio)}px`
          canvas.className = 'mx-auto mb-3 block rounded-lg bg-white shadow-raised'
          holder.appendChild(canvas)
          await page.render({ canvas, viewport }).promise
        }
        void doc.destroy()
      } catch {
        if (!cancelled) setProblem('This payslip can’t be shown here. Use Download to open it.')
      } finally {
        if (!cancelled) setDrawing(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [file, isPdf, zoom])

  return (
    <div role="dialog" aria-modal="true" aria-label={title} className="backdrop-enter fixed inset-0 z-[55] flex flex-col bg-navy-950/95">
      <div className="flex items-center gap-2 px-3 pb-2 pt-[calc(0.75rem+env(safe-area-inset-top))] text-white">
        <button type="button" onClick={onClose} aria-label="Close" className="grid h-11 w-11 place-items-center rounded-full hover:bg-white/10">
          <Icon name="x" className="h-6 w-6" />
        </button>
        <p className="min-w-0 flex-1 truncate text-[16px] font-semibold">{title}</p>
        {isPdf && (
          <span className="flex items-center rounded-full bg-white/10">
            <button type="button" onClick={() => setZoom((z) => Math.max(0, z - 1))} disabled={zoom === 0 || drawing}
              aria-label="Zoom out" className="grid h-10 w-10 place-items-center rounded-full text-[20px] font-semibold disabled:opacity-40">
              −
            </button>
            <span className="tnum w-10 text-center text-[13px]">{Math.round(ZOOMS[zoom] * 100)}%</span>
            <button type="button" onClick={() => setZoom((z) => Math.min(ZOOMS.length - 1, z + 1))} disabled={zoom === ZOOMS.length - 1 || drawing}
              aria-label="Zoom in" className="grid h-10 w-10 place-items-center rounded-full text-[20px] font-semibold disabled:opacity-40">
              +
            </button>
          </span>
        )}
      </div>

      <div className="relative min-h-0 flex-1 overflow-auto px-3 pb-4">
        {!file || drawing ? (
          <div className="absolute inset-0 grid place-items-center text-[14px] text-mist-200">
            <span className="flex items-center gap-2"><Spinner className="h-5 w-5" /> Opening payslip…</span>
          </div>
        ) : null}
        {problem && (
          <div className="mx-auto mt-10 max-w-xs rounded-2xl bg-white/10 p-4 text-center text-[14px] text-white">{problem}</div>
        )}
        {isPdf ? (
          <div ref={pagesRef} className={drawing ? 'opacity-0' : 'opacity-100 transition-opacity duration-200'} />
        ) : imageUrl ? (
          <img src={imageUrl} alt={title} className="mx-auto rounded-lg bg-white shadow-raised" style={{ width: `${ZOOMS[zoom] * 100}%`, maxWidth: 'none' }} />
        ) : null}
      </div>

      <div className="px-4 pb-[calc(1rem+env(safe-area-inset-bottom))] pt-2">
        <button type="button" onClick={onDownload} disabled={!file}
          className="press save-cta flex h-13 w-full items-center justify-center gap-2 rounded-2xl text-[16px] font-semibold text-white transition-transform duration-150 disabled:opacity-60">
          <Icon name="download" className="h-5 w-5" /> Download
        </button>
      </div>
    </div>
  )
}
