import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react'
import { getState, setState } from '../lib/chromeStorage'
import type { Assignment, BouncerActionItem, BouncerActionsResponse, BouncerDecision } from '../types'

type ChatMessage = {
  role: 'assistant' | 'user'
  text: string
}

const API_BASE = 'http://localhost:8787'

const getNearestDueAssignment = (assignments: Assignment[]) => {
  if (assignments.length === 0) {
    return null
  }

  return [...assignments]
    .filter((assignment) => Boolean(assignment.dueAtISO))
    .sort((left, right) => new Date(left.dueAtISO).getTime() - new Date(right.dueAtISO).getTime())[0]
}

export function BouncerApp() {
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [actionsLoading, setActionsLoading] = useState(false)
  const [actionsSummary, setActionsSummary] = useState('')
  const [actions, setActions] = useState<BouncerActionItem[]>([])
  const [selectedActionId, setSelectedActionId] = useState('')
  const [actionStatus, setActionStatus] = useState('')
  const [activeAssignment, setActiveAssignment] = useState<Assignment | null>(null)
  const [error, setError] = useState('')

  const targetDomain = useMemo(() => {
    const params = new URLSearchParams(window.location.search)
    return params.get('target') ?? 'unknown-site.com'
  }, [])

  const loadActionPlan = useCallback(async (forceRefresh = false) => {
    try {
      setActionsLoading(true)
      setError('')
      const state = await getState()
      const nearestDueAssignment = getNearestDueAssignment(state.focusSession.selectedAssignments)

      if (!nearestDueAssignment) {
        setActionsSummary('No selected assignments found. Return to popup and select at least one assignment.')
        setActions([])
        setActiveAssignment(null)
        return
      }

      if (!forceRefresh && state.bouncerActionPlan?.assignment?.id === nearestDueAssignment.id) {
        setActiveAssignment(state.bouncerActionPlan.assignment)
        setActionsSummary(state.bouncerActionPlan.summary)
        setActions(state.bouncerActionPlan.actions)
        setActionStatus('')
        return
      }

      setActiveAssignment(nearestDueAssignment)

      const response = await fetch(`${API_BASE}/api/bouncer-actions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          targetDomain,
          assignment: nearestDueAssignment,
        }),
      })

      const payload = (await response.json()) as BouncerActionsResponse
      if (!response.ok || !payload.ok) {
        throw new Error(payload.error ?? 'Failed to generate action options')
      }

      setActionsSummary(payload.summary ?? 'Choose one action and I will help you execute it.')
      setActions(payload.actions ?? [])
      setActionStatus('')

      await setState({
        bouncerActionPlan: {
          assignment: nearestDueAssignment,
          summary: payload.summary ?? 'Choose one action and I will help you execute it.',
          actions: payload.actions ?? [],
          generatedAtISO: new Date().toISOString(),
        },
      })
    } catch (caughtError) {
      const reason = caughtError instanceof Error ? caughtError.message : 'Unexpected error'
      setError(reason)
    } finally {
      setActionsLoading(false)
    }
  }, [targetDomain])

  const handleActionSelect = async (action: BouncerActionItem) => {
    if (!activeAssignment) {
      return
    }

    setSelectedActionId(action.id)
    setMessages((prev) => [...prev, { role: 'user', text: `I choose: ${action.title}` }])

    try {
      setLoading(true)
      setError('')

      if (action.url) {
        await chrome.tabs.create({ url: action.url })
      } else if (action.actionType === 'create_google_doc') {
        await chrome.tabs.create({ url: 'https://docs.new' })
      }
      setActionStatus(`Opened ${action.title} in a new tab. Continue here for coaching.`)

      const response = await fetch(`${API_BASE}/api/bouncer-action-guide`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          assignment: activeAssignment,
          action,
        }),
      })

      const payload = (await response.json()) as { ok: boolean; response?: string; error?: string }
      if (!response.ok || !payload.ok) {
        throw new Error(payload.error ?? 'Failed to generate action guidance')
      }

      setMessages((prev) => [
        ...prev,
        {
          role: 'assistant',
          text: payload.response ?? `Opened ${action.title}. Start now and make visible progress in the next 10 minutes.`,
        },
      ])
    } catch (caughtError) {
      const reason = caughtError instanceof Error ? caughtError.message : 'Unexpected error'
      setError(reason)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void loadActionPlan()
  }, [loadActionPlan])

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
        <p className="text-xs uppercase tracking-wide text-slate-500">Bounce</p>
        <h1 className="mt-1 text-2xl font-semibold text-slate-900">Why are you opening {targetDomain}?</h1>
        <p className="mt-2 text-sm text-slate-600">
          You are in a focus session. If this is directly required for your assignment, explain clearly.
        </p>

        <section className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-3">
          <p className="text-sm font-medium text-slate-800">How to use this page</p>
          <ol className="mt-2 list-decimal space-y-1 pl-5 text-xs text-slate-600">
            <li>Pick a quick action to start immediate progress.</li>
            <li>Or use chat for custom guidance and justification.</li>
          </ol>
        </section>

        <section className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-3">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <p className="text-sm font-medium text-slate-800">Suggested next actions (one-click)</p>
              <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-medium text-emerald-700">
                Quick path
              </span>
            </div>
            <button
              type="button"
              onClick={() => void loadActionPlan(true)}
              disabled={actionsLoading}
              className="rounded-lg border border-slate-300 bg-white px-2.5 py-1 text-xs text-slate-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {actionsLoading ? 'Planning...' : actions.length > 0 ? 'Refresh plan' : 'Generate plan'}
            </button>
          </div>

          {activeAssignment ? (
            <p className="mt-2 text-xs text-slate-600">
              Nearest due: {activeAssignment.title} ({activeAssignment.course})
            </p>
          ) : null}

          {actionsSummary ? <p className="mt-2 text-xs text-slate-600">{actionsSummary}</p> : null}

          <div className="mt-3 space-y-2">
            {actions.map((action) => (
              <button
                key={action.id}
                type="button"
                onClick={() => void handleActionSelect(action)}
                disabled={loading}
                className={`w-full rounded-lg border px-3 py-2 text-left disabled:cursor-not-allowed disabled:opacity-50 ${
                  selectedActionId === action.id
                    ? 'border-slate-400 bg-slate-100'
                    : 'border-slate-200 bg-white hover:bg-slate-50'
                }`}
              >
                <p className="text-sm font-medium text-slate-800">{action.title}</p>
                <p className="mt-1 text-xs text-slate-600">{action.description}</p>
              </button>
            ))}
          </div>

          {actionStatus ? <p className="mt-3 text-xs text-slate-600">{actionStatus}</p> : null}
        </section>

        <section className="mt-4 rounded-xl border border-slate-200 bg-white p-3">
          <div className="flex items-center gap-2">
            <p className="text-sm font-medium text-slate-800">Chat with Bounce coach</p>
            <span className="rounded-full bg-sky-100 px-2 py-0.5 text-[10px] font-medium text-sky-700">Custom path</span>
          </div>
          <p className="mt-1 text-xs text-slate-600">Use chat when you need custom help or want to explain your intent.</p>

          <div className="mt-4 space-y-3">
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
        </section>
      </div>
    </main>
  )
}
