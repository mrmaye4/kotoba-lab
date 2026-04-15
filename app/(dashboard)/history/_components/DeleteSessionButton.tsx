'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Trash2 } from 'lucide-react'

export default function DeleteSessionButton({
  sessionId,
  redirectAfter,
}: {
  sessionId: string
  redirectAfter?: string
}) {
  const router = useRouter()
  const [confirm, setConfirm] = useState(false)
  const [deleting, setDeleting] = useState(false)

  async function handleDelete() {
    setDeleting(true)
    await fetch(`/api/sessions/${sessionId}`, { method: 'DELETE' })
    if (redirectAfter) {
      router.push(redirectAfter)
    } else {
      router.refresh()
    }
  }

  if (confirm) {
    return (
      <div className="flex items-center gap-1.5 shrink-0">
        <button
          onClick={() => setConfirm(false)}
          className="text-xs text-muted-foreground border border-border rounded-lg px-2 py-1 hover:bg-muted transition-colors"
        >
          Cancel
        </button>
        <button
          onClick={handleDelete}
          disabled={deleting}
          className="text-xs text-destructive border border-destructive/40 rounded-lg px-2 py-1 hover:bg-destructive/10 transition-colors disabled:opacity-50"
        >
          {deleting ? '...' : 'Delete'}
        </button>
      </div>
    )
  }

  return (
    <button
      onClick={e => { e.preventDefault(); setConfirm(true) }}
      className="shrink-0 p-1.5 rounded-lg text-muted-foreground/40 hover:text-destructive hover:bg-destructive/10 transition-colors"
      title="Delete session"
    >
      <Trash2 className="w-3.5 h-3.5" />
    </button>
  )
}