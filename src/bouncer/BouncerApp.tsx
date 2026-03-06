import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react'
import brandLogo from '../assets/logo.png'
import { getState, setState } from '../lib/chromeStorage'
import type { AgentPersona, Assignment, BouncerActionItem, BouncerActionsResponse, BouncerDecision } from '../types'

type ChatMessage = {
  role: 'assistant' | 'user'
  text: string
}

const API_BASE = 'http://localhost:8787'
const wait = (milliseconds: number) => new Promise((resolve) => setTimeout(resolve, milliseconds))

const isYouTubeDomain = (domain: string) => {
  const normalized = domain.toLowerCase()
  return normalized === 'youtube.com' || normalized.endsWith('.youtube.com')
}

const isYouTubeUrl = (value: string) => {
  try {
    const url = new URL(value)
    const host = url.hostname.toLowerCase()
    return host === 'youtube.com' || host.endsWith('.youtube.com') || host === 'youtu.be'
  } catch {
    return false
  }
}

const buildYouTubeResearchUrl = (decision: BouncerDecision, fallbackQuery: string) => {
  if (decision.recommendedVideoUrl && isYouTubeUrl(decision.recommendedVideoUrl)) {
    return decision.recommendedVideoUrl
  }

  const query = decision.researchQuery?.trim() || fallbackQuery.trim()
  const encodedQuery = encodeURIComponent(query || 'assignment research')
  return `https://www.youtube.com/results?search_query=${encodedQuery}`
}

const getRedirectNotice = (targetDomain: string, decision: BouncerDecision, fallbackQuery: string) => {
  if (!isYouTubeDomain(targetDomain)) {
    return `Access approved. Opening ${targetDomain} for focused work.`
  }

  if (decision.recommendedVideoUrl && isYouTubeUrl(decision.recommendedVideoUrl)) {
    return 'Access approved. Opening the recommended research video now.'
  }

  const query = decision.researchQuery?.trim() || fallbackQuery.trim() || 'assignment research'
  return `Access approved. Opening YouTube research results for: "${query}".`
}

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
  const [activePersonaLabel, setActivePersonaLabel] = useState('Strict Coach')
  const [decisionTrace, setDecisionTrace] = useState<{
    confidence?: number
    reasonCode?: string
    policyDecision?: string
    orchestrationMode?: string
    evidenceCount?: number
    verifierWarnings?: string[]
  } | null>(null)
  const [lastInterventionId, setLastInterventionId] = useState('')
  const [feedbackStatus, setFeedbackStatus] = useState('')

const getPersonaLabel = (persona: AgentPersona) => {
  if (persona.mode === 'custom') {
    return 'Custom Persona'
  }

  if (persona.presetId === 'supportive') {
    return 'Supportive Mentor'
  }

  if (persona.presetId === 'socratic') {
    return 'Socratic Strategist'
  }

  return 'Strict Coach'
}

  const targetDomain = useMemo(() => {
    const params = new URLSearchParams(window.location.search)
    return params.get('target') ?? 'unknown-site.com'
  }, [])

  const loadActionPlan = useCallback(async (forceRefresh = false) => {
    try {
      setActionsLoading(true)
      setError('')
      const state = await getState()
      setActivePersonaLabel(getPersonaLabel(state.agentPersona))
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
          persona: state.agentPersona,
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

      const state = await getState()

      const response = await fetch(`${API_BASE}/api/bouncer-action-guide`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          assignment: activeAssignment,
          action,
          persona: state.agentPersona,
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
      setActivePersonaLabel(getPersonaLabel(state.agentPersona))
      const primaryAssignment = state.focusSession.selectedAssignments[0]

      const response = await fetch(`${API_BASE}/api/bouncer-decision`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          targetDomain,
          userMessage: text,
          assignment: primaryAssignment,
          assignments: state.focusSession.selectedAssignments,
          persona: state.agentPersona,
        }),
      })

      if (!response.ok) {
        let details = 'Focus Agent server is unavailable'
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

      setDecisionTrace({
        confidence: decision.confidence,
        reasonCode: decision.reasonCode,
        policyDecision: decision.policyDecision,
        orchestrationMode: decision.orchestrationMode,
        evidenceCount: decision.evidenceCount,
        verifierWarnings: decision.verifier?.warnings,
      })
      setFeedbackStatus('')

      try {
        const interventionResponse = await fetch(`${API_BASE}/api/mock/log-intervention`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            targetDomain,
            rationaleText: text,
            decision: decision.grant_access ? 'granted' : 'denied',
            confidence: decision.confidence,
            reasonCode: decision.reasonCode,
            assignmentId: primaryAssignment?.id,
            assignmentTitle: primaryAssignment?.title,
            policyDecision: decision.policyDecision,
            orchestrationMode: decision.orchestrationMode,
          }),
        })

        if (interventionResponse.ok) {
          const payload = (await interventionResponse.json()) as {
            ok: boolean
            intervention?: { id?: string }
          }
          setLastInterventionId(payload.intervention?.id ?? '')
        } else {
          setLastInterventionId('')
        }
      } catch {
        setLastInterventionId('')
      }

      if (decision.grant_access) {
        await chrome.runtime.sendMessage({
          type: 'REQUEST_TEMP_ACCESS',
          payload: { domain: targetDomain, minutes: 5 },
        })

        const fallbackQuery = `${primaryAssignment?.title ?? ''} ${primaryAssignment?.course ?? ''} ${text}`.trim()
        const targetUrl = isYouTubeDomain(targetDomain)
          ? buildYouTubeResearchUrl(decision, fallbackQuery)
          : `https://${targetDomain}`

        setMessages((prev) => [
          ...prev,
          {
            role: 'assistant',
            text: getRedirectNotice(targetDomain, decision, fallbackQuery),
          },
        ])
        await wait(900)
        try {
          await chrome.tabs.create({ url: targetUrl })
        } catch {
          window.location.href = targetUrl
        }
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

  const submitFeedback = async (feedback: 'helpful' | 'not_helpful') => {
    if (!lastInterventionId || loading) {
      return
    }

    try {
      setFeedbackStatus('Saving feedback...')
      const response = await fetch(`${API_BASE}/api/mock/log-outcome`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          interventionId: lastInterventionId,
          userFeedback: feedback,
          actionCompleted: selectedActionId.length > 0,
        }),
      })

      if (!response.ok) {
        throw new Error('Failed to save feedback')
      }

      setFeedbackStatus(feedback === 'helpful' ? 'Marked as helpful.' : 'Marked as not helpful.')
    } catch {
      setFeedbackStatus('Could not save feedback.')
    }
  }

  return (
    <main className="mx-auto min-h-screen w-full max-w-2xl p-6">
      <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <div>
          <img src={brandLogo} alt="Focus Agent" className="h-16 w-auto max-w-[320px] object-contain" />
        </div>
        <h1 className="mt-1 text-2xl font-semibold text-slate-900">Why are you opening {targetDomain}?</h1>
        <p className="mt-2 text-sm text-slate-600">
          You are in a focus session. If this is directly required for your assignment, explain clearly.
        </p>
        <p className="mt-2 inline-flex items-center rounded-full bg-rose-50 px-2.5 py-1 text-[11px] font-medium text-rose-700">
          Persona: {activePersonaLabel}
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
            <p className="text-sm font-medium text-slate-800">Chat with Focus Agent</p>
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

          {decisionTrace ? (
            <div className="mt-4 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Decision trace</p>
              <div className="mt-1 grid grid-cols-2 gap-x-3 gap-y-1 text-xs text-slate-700">
                <p>
                  <span className="font-medium">Confidence:</span>{' '}
                  {typeof decisionTrace.confidence === 'number'
                    ? `${Math.round(decisionTrace.confidence * 100)}%`
                    : 'n/a'}
                </p>
                <p>
                  <span className="font-medium">Policy:</span> {decisionTrace.policyDecision ?? 'n/a'}
                </p>
                <p>
                  <span className="font-medium">Reason code:</span> {decisionTrace.reasonCode ?? 'n/a'}
                </p>
                <p>
                  <span className="font-medium">Mode:</span> {decisionTrace.orchestrationMode ?? 'legacy'}
                </p>
                <p>
                  <span className="font-medium">Evidence:</span>{' '}
                  {typeof decisionTrace.evidenceCount === 'number' ? decisionTrace.evidenceCount : 'n/a'}
                </p>
                <p>
                  <span className="font-medium">Verifier warnings:</span>{' '}
                  {decisionTrace.verifierWarnings && decisionTrace.verifierWarnings.length > 0
                    ? decisionTrace.verifierWarnings.join(', ')
                    : 'none'}
                </p>
              </div>

              {lastInterventionId ? (
                <div className="mt-3 flex items-center gap-2">
                  <span className="text-[11px] text-slate-500">Was this decision helpful?</span>
                  <button
                    type="button"
                    onClick={() => void submitFeedback('helpful')}
                    className="rounded-md border border-emerald-200 bg-emerald-50 px-2 py-1 text-[11px] font-medium text-emerald-700"
                  >
                    Helpful
                  </button>
                  <button
                    type="button"
                    onClick={() => void submitFeedback('not_helpful')}
                    className="rounded-md border border-amber-200 bg-amber-50 px-2 py-1 text-[11px] font-medium text-amber-700"
                  >
                    Not helpful
                  </button>
                </div>
              ) : null}

              {feedbackStatus ? <p className="mt-2 text-[11px] text-slate-600">{feedbackStatus}</p> : null}
            </div>
          ) : null}

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
