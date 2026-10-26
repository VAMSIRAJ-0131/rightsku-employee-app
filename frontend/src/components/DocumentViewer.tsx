// Shows a downloaded document inside the app (payslips, letters, Form 16):
// PDFs are drawn page by page with pdf.js (Android's web view can't show PDFs
// itself), images as they are. Nothing is saved to the phone; Download does
// that. pdf.js is only loaded the first time a PDF is opened, so it never
// slows the app's start.
//
// Zoom: pinch with two fingers, double-tap, or the − / + buttons. While the
// fingers move the pages are scaled smoothly; when they lift, the pages are
// laid out at the new size (and drawn again, sharper, when zoomed in further).
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { Icon } from './Icons'
import { Spinner, useBackHandler } from './ui'
import type { DownloadedFile } from '../lib/api'

/** The steps the − / + buttons move through. */
const ZOOMS = [1, 1.5, 2, 3]
const MIN_ZOOM = 1
const MAX_ZOOM = 3
/** The widest a drawn page gets, in pixels (keeps memory sensible on phones). */
const MAX_DRAW_WIDTH = 2400

export const clampZoom = (z: number) => Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, z))
/** How sharp to draw the pages for a zoom: 1, 2 or 3 (redrawn only when this changes). */
export const drawStep = (z: number) => (z <= 1.05 ? 1 : z <= 2 ? 2 : 3)

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
  const [zoom, setZoom] = useState(1)
  const [problem, setProblem] = useState<string | null>(null)
  // Only the first drawing hides the pages; sharper redraws swap in when ready.
  const [firstDraw, setFirstDraw] = useState(true)
  const scrollerRef = useRef<HTMLDivElement | null>(null)
  const contentRef = useRef<HTMLDivElement | null>(null)
  const pagesRef = useRef<HTMLDivElement | null>(null)
  // Where to scroll after a zoom, so the spot under the fingers stays put.
  const pendingScroll = useRef<{ left: number; top: number } | null>(null)
  const isPdf = !!file && (file.blob.type === 'application/pdf' || file.fileName.toLowerCase().endsWith('.pdf'))
  const [imageUrl, setImageUrl] = useState<string | null>(null)
  const step = drawStep(zoom)

  // Images: an object URL, released when the viewer closes.
  useEffect(() => {
    if (!file || isPdf) return
    const url = URL.createObjectURL(file.blob)
    setImageUrl(url)
    return () => URL.revokeObjectURL(url)
  }, [file, isPdf])

  // PDFs: draw every page, sharp for the zoom step and the screen's density.
  useEffect(() => {
    if (!file || !isPdf) return
    let cancelled = false
    const holder = pagesRef.current
    const scroller = scrollerRef.current
    setProblem(null)
    ;(async () => {
      try {
        const pdfjs = await import('pdfjs-dist')
        const worker = (await import('pdfjs-dist/build/pdf.worker.min.mjs?url')).default
        pdfjs.GlobalWorkerOptions.workerSrc = worker
        const doc = await pdfjs.getDocument({ data: new Uint8Array(await file.blob.arrayBuffer()) }).promise
        if (cancelled || !holder) return
        const fitWidth = (scroller?.clientWidth ?? window.innerWidth) - 24
        const ratio = window.devicePixelRatio || 1
        const canvases: HTMLCanvasElement[] = []
        for (let n = 1; n <= doc.numPages && !cancelled; n++) {
          const page = await doc.getPage(n)
          const base = page.getViewport({ scale: 1 })
          const drawWidth = Math.min(fitWidth * step * ratio, MAX_DRAW_WIDTH)
          const viewport = page.getViewport({ scale: drawWidth / base.width })
          const canvas = document.createElement('canvas')
          canvas.width = Math.floor(viewport.width)
          canvas.height = Math.floor(viewport.height)
          // Shown at the content's width (which follows the zoom), height in proportion.
          canvas.className = 'mb-3 block h-auto w-full rounded-lg bg-white shadow-raised'
          await page.render({ canvas, viewport }).promise
          canvases.push(canvas)
        }
        void doc.destroy()
        if (!cancelled) holder.replaceChildren(...canvases)
      } catch {
        if (!cancelled) setProblem('This file can’t be shown here. Use Download to open it.')
      } finally {
        if (!cancelled) setFirstDraw(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [file, isPdf, step])

  // After the zoom changes, scroll so the pinched (or tapped) spot stays under the fingers.
  useLayoutEffect(() => {
    const scroller = scrollerRef.current
    const target = pendingScroll.current
    if (!scroller || !target) return
    pendingScroll.current = null
    scroller.scrollLeft = target.left
    scroller.scrollTop = target.top
  }, [zoom])

  /** Zooms to `next`, keeping the point (fx, fy) of the scroller (from its top-left) in place. */
  const zoomAround = useCallback((from: number, next: number, fx: number, fy: number) => {
    const scroller = scrollerRef.current
    const content = contentRef.current
    next = clampZoom(next)
    if (!scroller || !content || next === from) return
    const cx = (scroller.scrollLeft + fx - content.offsetLeft) / from
    const cy = (scroller.scrollTop + fy - content.offsetTop) / from
    pendingScroll.current = {
      left: Math.max(0, cx * next + content.offsetLeft - fx),
      top: Math.max(0, cy * next + content.offsetTop - fy),
    }
    setZoom(next)
  }, [])

  // Two-finger pinch and double-tap. Touch listeners are added by hand so a
  // pinch can stop the web view's own page zoom (React's are passive).
  const zoomRef = useRef(zoom)
  zoomRef.current = zoom
  useEffect(() => {
    const scroller = scrollerRef.current
    const content = contentRef.current
    if (!scroller || !content) return
    let pinch: { dist: number; from: number; fx: number; fy: number; scale: number } | null = null
    let lastTap = { at: 0, x: 0, y: 0 }

    const point = (t: Touch) => {
      const r = scroller.getBoundingClientRect()
      return { x: t.clientX - r.left, y: t.clientY - r.top }
    }
    const distance = (a: Touch, b: Touch) => Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY)

    function onStart(e: TouchEvent) {
      if (e.touches.length !== 2) return
      const [a, b] = [e.touches[0], e.touches[1]]
      const pa = point(a)
      const pb = point(b)
      const fx = (pa.x + pb.x) / 2
      const fy = (pa.y + pb.y) / 2
      pinch = { dist: distance(a, b), from: zoomRef.current, fx, fy, scale: 1 }
      // Scale around the spot between the fingers, in the content's own coordinates.
      const ox = scroller!.scrollLeft + fx - content!.offsetLeft
      const oy = scroller!.scrollTop + fy - content!.offsetTop
      content!.style.transformOrigin = `${ox}px ${oy}px`
      content!.style.willChange = 'transform'
    }
    function onMove(e: TouchEvent) {
      if (!pinch || e.touches.length !== 2) return
      e.preventDefault()
      const next = clampZoom(pinch.from * (distance(e.touches[0], e.touches[1]) / pinch.dist))
      pinch.scale = next / pinch.from
      content!.style.transform = `scale(${pinch.scale})`
    }
    function onEnd(e: TouchEvent) {
      if (pinch && e.touches.length < 2) {
        const { from, scale, fx, fy } = pinch
        pinch = null
        content!.style.transform = ''
        content!.style.willChange = ''
        zoomAround(from, from * scale, fx, fy)
        lastTap = { at: 0, x: 0, y: 0 }
        return
      }
      // Double-tap: zoom to 200% at that spot, or back to fit.
      if (e.touches.length === 0 && e.changedTouches.length === 1) {
        const p = point(e.changedTouches[0])
        const now = Date.now()
        if (now - lastTap.at < 300 && Math.hypot(p.x - lastTap.x, p.y - lastTap.y) < 30) {
          const from = zoomRef.current
          zoomAround(from, from > 1.05 ? 1 : 2, p.x, p.y)
          lastTap = { at: 0, x: 0, y: 0 }
        } else lastTap = { at: now, x: p.x, y: p.y }
      }
    }
    scroller.addEventListener('touchstart', onStart, { passive: true })
    scroller.addEventListener('touchmove', onMove, { passive: false })
    scroller.addEventListener('touchend', onEnd)
    scroller.addEventListener('touchcancel', onEnd)
    return () => {
      scroller.removeEventListener('touchstart', onStart)
      scroller.removeEventListener('touchmove', onMove)
      scroller.removeEventListener('touchend', onEnd)
      scroller.removeEventListener('touchcancel', onEnd)
    }
  }, [zoomAround])

  /** The − / + buttons: the next step down or up, around the middle of the screen. */
  function stepZoom(dir: 1 | -1) {
    const scroller = scrollerRef.current
    const next = dir > 0 ? ZOOMS.find((z) => z > zoom + 0.01) ?? MAX_ZOOM : [...ZOOMS].reverse().find((z) => z < zoom - 0.01) ?? MIN_ZOOM
    zoomAround(zoom, next, (scroller?.clientWidth ?? 0) / 2, (scroller?.clientHeight ?? 0) / 2)
  }

  const loading = !file || (isPdf && firstDraw && !problem)

  return (
    <div role="dialog" aria-modal="true" aria-label={title} className="backdrop-enter fixed inset-0 z-[55] flex flex-col bg-navy-950/95">
      <div className="flex items-center gap-2 px-3 pb-2 pt-[calc(0.75rem+env(safe-area-inset-top))] text-white">
        <button type="button" onClick={onClose} aria-label="Close" className="grid h-11 w-11 place-items-center rounded-full hover:bg-white/10">
          <Icon name="x" className="h-6 w-6" />
        </button>
        <p className="min-w-0 flex-1 truncate text-[16px] font-semibold">{title}</p>
        {file && !problem && (
          <span className="flex items-center rounded-full bg-white/10">
            <button type="button" onClick={() => stepZoom(-1)} disabled={zoom <= MIN_ZOOM + 0.01 || loading}
              aria-label="Zoom out" className="grid h-10 w-10 place-items-center rounded-full text-[20px] font-semibold disabled:opacity-40">
              −
            </button>
            <span className="tnum w-11 text-center text-[13px]">{Math.round(zoom * 100)}%</span>
            <button type="button" onClick={() => stepZoom(1)} disabled={zoom >= MAX_ZOOM - 0.01 || loading}
              aria-label="Zoom in" className="grid h-10 w-10 place-items-center rounded-full text-[20px] font-semibold disabled:opacity-40">
              +
            </button>
          </span>
        )}
      </div>

      {/* touch-action keeps one-finger scrolling native; pinching is handled above. */}
      <div ref={scrollerRef} className="relative min-h-0 flex-1 overflow-auto overscroll-contain px-3 pb-4 [touch-action:pan-x_pan-y]">
        {loading && (
          <div className="absolute inset-0 grid place-items-center text-[14px] text-mist-200">
            <span className="flex items-center gap-2"><Spinner className="h-5 w-5" /> Opening…</span>
          </div>
        )}
        {problem && (
          <div className="mx-auto mt-10 max-w-xs rounded-2xl bg-white/10 p-4 text-center text-[14px] text-white">{problem}</div>
        )}
        <div ref={contentRef} className={zoom <= 1 ? 'mx-auto' : ''} style={{ width: `${zoom * 100}%` }}>
          {isPdf ? (
            <div ref={pagesRef} className={loading ? 'opacity-0' : 'opacity-100 transition-opacity duration-200'} />
          ) : imageUrl ? (
            <img src={imageUrl} alt={title} draggable={false} className="block w-full rounded-lg bg-white shadow-raised" style={{ maxWidth: 'none' }} />
          ) : null}
        </div>
        {!loading && !problem && zoom <= 1 && (
          <p className="mt-1 text-center text-[12px] text-mist-300">Pinch or double-tap to zoom</p>
        )}
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
