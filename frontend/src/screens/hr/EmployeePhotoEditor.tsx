// HR Admin: an employee's profile photo with "Add photo" / "Change" / "Remove".
// Only this HR screen can change a photo; the server also allows it only for
// HR Admins (/api/hr/employees/{id}/photo). Employees just see their photo.
import { useEffect, useRef, useState } from 'react'
import { Icon } from '../../components/Icons'
import { Avatar, Spinner } from '../../components/ui'
import type { ApiError } from '../../lib/api'
import { checkPhotoFile, loadEmployeePhoto, removeEmployeePhoto, uploadEmployeePhoto } from '../../lib/photos'

export default function EmployeePhotoEditor({
  token, employeeId, name, onToast, onError,
}: {
  token: string
  employeeId: number
  name: string
  onToast: (text: string, tone?: 'info' | 'success' | 'error') => void
  onError: (error: ApiError) => ApiError
}) {
  const [url, setUrl] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [reload, setReload] = useState(0)
  const input = useRef<HTMLInputElement>(null)

  useEffect(() => {
    const controller = new AbortController()
    let loaded: string | null = null
    loadEmployeePhoto(token, employeeId, controller.signal).then((result) => {
      if (controller.signal.aborted) {
        if (result.ok && result.data) URL.revokeObjectURL(result.data)
        return
      }
      if (result.ok) {
        loaded = result.data
        setUrl(result.data)
      } else onError(result.error)
    })
    return () => {
      controller.abort()
      if (loaded) URL.revokeObjectURL(loaded)
    }
  }, [token, employeeId, reload, onError])

  async function upload(file: File) {
    const problem = checkPhotoFile(file)
    if (problem) {
      onToast(problem, 'error')
      return
    }
    setBusy(true)
    const result = await uploadEmployeePhoto(token, employeeId, file)
    setBusy(false)
    if (result.ok) {
      onToast(url ? 'Photo changed.' : 'Photo added.', 'success')
      setReload((r) => r + 1)
    } else {
      const error = onError(result.error)
      onToast(error.fields.file ?? error.message, 'error')
    }
  }

  async function remove() {
    setBusy(true)
    const result = await removeEmployeePhoto(token, employeeId)
    setBusy(false)
    if (result.ok) {
      setUrl(null)
      onToast('Photo removed.', 'success')
    } else onToast(onError(result.error).message, 'error')
  }

  return (
    <div className="flex shrink-0 flex-col items-center gap-1.5">
      <div className="relative">
        <Avatar name={name} size="lg" photoUrl={url} />
        <button
          type="button"
          onClick={() => input.current?.click()}
          disabled={busy}
          aria-label={url ? 'Change photo' : 'Add photo'}
          className="press gloss-navy absolute -bottom-1 -right-1 grid h-8 w-8 place-items-center rounded-full border-2 border-white text-white transition-transform duration-150 disabled:opacity-60"
        >
          {busy ? <Spinner className="h-3.5 w-3.5" /> : <Icon name="upload" className="h-4 w-4" />}
        </button>
        <input
          ref={input}
          type="file"
          accept="image/jpeg,image/png"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0]
            e.target.value = ''
            if (file) upload(file)
          }}
        />
      </div>
      {url && (
        <button
          type="button"
          onClick={remove}
          disabled={busy}
          className="rounded px-1.5 py-0.5 text-[11px] font-semibold text-ink-muted hover:bg-mist-50 hover:text-bad disabled:opacity-60"
        >
          Remove
        </button>
      )}
    </div>
  )
}
