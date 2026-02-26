import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { getState, setState } from '../lib/chromeStorage'
import { formatDueDate, normalizeDomain } from '../lib/domain'
import type { ExtensionMessage, ExtensionResponse } from '../lib/messages'
import type { Assignment } from '../types'

const sendMessage = <T extends ExtensionResponse>(message: ExtensionMessage) =>
  chrome.runtime.sendMessage<ExtensionMessage, T>(message)

export function PopupApp() {
  const [loading, setLoading] = useState(true)
  const [mockMode, setMockMode] = useState(true)
  const [assignments, setAssignments] = useState<Assignment[]>([])
  const [selectedAssignmentIds, setSelectedAssignmentIds] = useState<string[]>([])
  const [blacklistDomains, setBlacklistDomains] = useState<string[]>([])
  const [newDomain, setNewDomain] = useState('')
  const [focusActive, setFocusActive] = useState(false)

  const selectedAssignments = useMemo(
    () => assignments.filter((assignment) => selectedAssignmentIds.includes(assignment.id)),
    [assignments, selectedAssignmentIds],
  )

  useEffect(() => {
    void (async () => {
      const state = await getState()
      setMockMode(state.mockMode)
      setAssignments(state.assignments)
      setSelectedAssignmentIds(state.selectedAssignmentIds)
      setBlacklistDomains(state.blacklistDomains)
      setFocusActive(state.focusSession.active)
      setLoading(false)
    })()
  }, [])

  const toggleAssignment = async (assignmentId: string) => {
    const next = selectedAssignmentIds.includes(assignmentId)
      ? selectedAssignmentIds.filter((id) => id !== assignmentId)
      : [...selectedAssignmentIds, assignmentId]

    setSelectedAssignmentIds(next)
    await setState({ selectedAssignmentIds: next })
  }

  const addDomain = async () => {
    const clean = normalizeDomain(newDomain)
    if (!clean || blacklistDomains.includes(clean)) {
      return
    }

    const next = [...blacklistDomains, clean]
    setBlacklistDomains(next)
    setNewDomain('')
    await setState({ blacklistDomains: next })
  }

  const removeDomain = async (domain: string) => {
    const next = blacklistDomains.filter((item) => item !== domain)
    setBlacklistDomains(next)
    await setState({ blacklistDomains: next })
  }

  const startFocus = async () => {
    if (selectedAssignments.length === 0 || blacklistDomains.length === 0) {
      return
    }

    const response = await sendMessage<ExtensionResponse>({
      type: 'START_FOCUS',
      payload: {
        selectedAssignments,
        blacklistDomains,
      },
    })

    if (response.ok) {
      setFocusActive(true)
    }
  }

  const stopFocus = async () => {
    const response = await sendMessage<ExtensionResponse>({ type: 'STOP_FOCUS' })
    if (response.ok) {
      setFocusActive(false)
    }
  }

  if (loading) {
    return <Shell>Loading Bounce…</Shell>
  }

  return (
    <Shell>
      <div className="space-y-4">
        <header className="flex items-center justify-between">
          <div>
            <p className="text-xs uppercase tracking-wide text-slate-500">Bounce</p>
            <h1 className="text-lg font-semibold text-slate-900">Focus Control</h1>
          </div>
          <span
            className={`rounded-full px-2.5 py-1 text-xs font-medium ${
              focusActive ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-600'
            }`}
          >
            {focusActive ? 'Focused' : 'Idle'}
          </span>
        </header>

        <section className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
          <p className="text-sm font-medium text-slate-800">Canvas Source</p>
          <p className="mt-1 text-xs text-slate-500">
            {mockMode ? 'Mock mode enabled (default for MVP)' : 'Live Canvas mode'}
          </p>
          <button
            type="button"
            className="mt-2 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-700 hover:bg-slate-50"
            onClick={async () => {
              const next = !mockMode
              setMockMode(next)
              await setState({ mockMode: next })
            }}
          >
            {mockMode ? 'Switch to Canvas OAuth (later)' : 'Switch back to Mock mode'}
          </button>
        </section>

        <section className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
          <p className="text-sm font-medium text-slate-800">Assignments</p>
          <div className="mt-2 space-y-2">
            {assignments.map((assignment) => (
              <label
                key={assignment.id}
                className="flex cursor-pointer items-start gap-2 rounded-lg border border-slate-200 p-2 hover:bg-slate-50"
              >
                <input
                  type="checkbox"
                  className="mt-1"
                  checked={selectedAssignmentIds.includes(assignment.id)}
                  onChange={() => void toggleAssignment(assignment.id)}
                />
                <div>
                  <p className="text-sm font-medium text-slate-800">{assignment.title}</p>
                  <p className="text-xs text-slate-500">
                    {assignment.course} · due {formatDueDate(assignment.dueAtISO)}
                  </p>
                </div>
              </label>
            ))}
          </div>
        </section>

        <section className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
          <p className="text-sm font-medium text-slate-800">Blocked Sites</p>
          <div className="mt-2 flex gap-2">
            <input
              value={newDomain}
              onChange={(event) => setNewDomain(event.target.value)}
              placeholder="youtube.com"
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-slate-400"
            />
            <button
              type="button"
              onClick={() => void addDomain()}
              className="rounded-lg bg-slate-900 px-3 py-2 text-sm font-medium text-white"
            >
              Add
            </button>
          </div>
          <div className="mt-2 flex flex-wrap gap-2">
            {blacklistDomains.map((domain) => (
              <button
                key={domain}
                type="button"
                onClick={() => void removeDomain(domain)}
                className="rounded-full border border-slate-300 px-2.5 py-1 text-xs text-slate-700 hover:bg-slate-100"
              >
                {domain} ×
              </button>
            ))}
          </div>
        </section>

        <button
          type="button"
          onClick={() => void (focusActive ? stopFocus() : startFocus())}
          disabled={!focusActive && (selectedAssignments.length === 0 || blacklistDomains.length === 0)}
          className="w-full rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
        >
          {focusActive ? 'Stop Focus' : 'Start Focus'}
        </button>
      </div>
    </Shell>
  )
}

function Shell({ children }: { children: ReactNode }) {
  return <main className="min-h-screen w-[360px] bg-slate-50 p-4">{children}</main>
}
