'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

const FLAG_OPTIONS = ['🇬🇧', '🇺🇸', '🇩🇪', '🇫🇷', '🇪🇸', '🇮🇹', '🇵🇱', '🇺🇦', '🇷🇺', '🇨🇳', '🇯🇵', '🇰🇷', '🇧🇷', '🇵🇹', '🇸🇪', '🇳🇱']

export default function NewLanguagePage() {
  const router = useRouter()
  const [name, setName] = useState('')
  const [flag, setFlag] = useState('🇬🇧')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setLoading(true)

    const res = await fetch('/api/languages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, flagEmoji: flag }),
    })

    if (!res.ok) {
      setError('Failed to add language')
      setLoading(false)
      return
    }

    const lang = await res.json()
    router.push(`/languages/${lang.id}/rules`)
    router.refresh()
  }

  return (
    <div className="max-w-sm">
      <div className="mb-6">
        <h1 className="text-xl font-semibold">Add language</h1>
        <p className="text-sm text-muted-foreground mt-0.5">Choose a language to study</p>
      </div>

      <Card>
        <CardContent className="pt-6">
          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="name">Name</Label>
              <Input
                id="name"
                value={name}
                onChange={e => setName(e.target.value)}
                placeholder="English"
                required
                autoFocus
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <Label>Flag</Label>
              <div className="flex flex-wrap gap-1.5">
                {FLAG_OPTIONS.map(f => (
                  <button
                    key={f}
                    type="button"
                    onClick={() => setFlag(f)}
                    className={`w-8 h-8 flex items-center justify-center rounded-lg text-lg transition-colors ${
                      flag === f ? 'bg-primary' : 'bg-muted hover:bg-accent'
                    }`}
                  >
                    {f}
                  </button>
                ))}
              </div>
            </div>

            {error && (
              <p className="text-destructive bg-destructive/10 px-3 py-2 rounded-lg text-xs">{error}</p>
            )}

            <div className="flex gap-2 mt-1">
              <Button type="button" variant="outline" className="flex-1" onClick={() => router.back()}>
                Cancel
              </Button>
              <Button type="submit" className="flex-1" disabled={loading}>
                {loading ? 'Adding...' : 'Add'}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}