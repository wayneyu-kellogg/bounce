import { useMemo, useState, type FormEvent } from 'react'
import { getState } from '../lib/chromeStorage'
import type { BouncerDecision } from '../types'

type ChatMessage = {
  role: 'assistant' | 'user'
  text: string
}

const API_BASE = 'http://localhost:8787'

export function BouncerApp() {
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const targetDomain = useMemo(() => {
    const params = new URLSearchParams(window.location.search)
    return params.get('target') ?? 'unknown-site.com'
  }, [])

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault()

    const text = input.trim()
    if (!text || loading) {
      return
    }

    setInput('')
    setError('')
    setMessages((prev) => [...prev, { role: 'user', text }])
    setLoading(true)

    try {
      const state = await getState()
      const primaryAssignment = state.focusSession.selectedAssignments[0]

      const response = await fetch(`${API_BASE}/api/bouncer-decision`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          targetDomain,
          userMessage: text,
          assignment: primaryAssignment,
          assignments: state.focusSession.selectedAssignments,
        }),
      })

      if (!response.ok) {
        let details = 'Bouncer server is unavailable'
        try {
          const errorPayload = (await response.json()) as { response?: string }
          if (errorPayload.response) {
            details = errorPayload.response
          }
        } catch {
          // ignore malformed response payload
        }
        throw new Error(details)
      }

      const decision = (await response.json()) as BouncerDecision

      if (decision.grant_access) {
        await chrome.runtime.sendMessage({
          type: 'REQUEST_TEMP_ACCESS',
          payload: { domain: targetDomain, minutes: 5 },
        })

        const targetUrl = `https://${targetDomain}`
        window.location.href = targetUrl
        return
      }

      setMessages((prev) => [
        ...prev,
        {
          role: 'assistant',
          text:
            decision.response ??
            `Access denied. You still have work due soon. Finish your assignment before opening ${targetDomain}.`,
        },
      ])
    } catch (caughtError) {
      const reason = caughtError instanceof Error ? caughtError.message : 'Unexpected error'
      setError(reason)
    } finally {
      setLoading(false)
    }
  }

  return (
    <main className="mx-auto min-h-screen w-full max-w-2xl p-6">
      <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <p className="text-xs uppercase tracking-wide text-slate-500">Bounce Bouncer</p>
        <h1 className="mt-1 text-2xl font-semibold text-slate-900">Why are you opening {targetDomain}?</h1>
        <p className="mt-2 text-sm text-slate-600">
          You are in a focus session. If this is directly required for your assignment, explain clearly.
        </p>

        <div className="mt-5 space-y-3">
          {messages.map((message, index) => (
            <div
              key={`${message.role}-${index}`}
              className={`rounded-xl p-3 text-sm ${
                message.role === 'user'
                  ? 'ml-auto max-w-[85%] bg-slate-900 text-white'
                  : 'max-w-[90%] bg-slate-100 text-slate-800'
              }`}
            >
              {message.text}
            </div>
          ))}
        </div>

        {error ? (
          <p className="mt-3 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p>
        ) : null}

        <form onSubmit={handleSubmit} className="mt-5 flex gap-2">
          <input
            value={input}
            onChange={(event) => setInput(event.target.value)}
            placeholder="Example: I need a React tutorial for my assignment"
            className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-slate-400"
          />
          <button
            type="submit"
            disabled={loading || input.trim().length === 0}
            className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-50"
          >
            {loading ? 'Checking...' : 'Ask'}
          </button>
        </form>
      </div>
    </main>
  )
}
