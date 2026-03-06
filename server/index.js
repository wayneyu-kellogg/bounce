import cors from 'cors'
import dotenv from 'dotenv'
import express from 'express'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  mockCanvasAssignmentsResponse,
  mockCourses,
  mockAssignments,
  mockResources,
  mockDomainCatalog,
  mockUserProfile,
  mockFocusSession,
  mockInterventions,
  mockOutcomes,
  retrieveMockContext,
  recordMockIntervention,
  recordMockOutcome,
} from './mockData.js'
import { buildInterventionSignals } from './signalExtraction.js'
import { scoreInterventionPolicy } from './policyScoring.js'
import { runDecisionOrchestrator } from './orchestrator.js'
import { runOfflinePolicyEvaluation } from './offlineEval.js'
import { getFeatureFlags } from './featureFlags.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

dotenv.config({ path: path.join(__dirname, '.env') })

const app = express()
const port = Number(process.env.PORT ?? 8787)
const featureFlags = getFeatureFlags()

const fallbackActions = (assignment, targetDomain) => {
  const assignmentTitle = assignment?.title ?? 'upcoming assignment'
  const encodedTopic = encodeURIComponent(`${assignmentTitle} ${assignment?.course ?? ''}`.trim())

  return [
    {
      id: 'read-resource',
      title: 'Read a focused resource',
      description: `Open a targeted reading list for ${assignmentTitle} instead of browsing ${targetDomain}.`,
      actionType: 'open_link',
      url: `https://www.google.com/search?q=${encodedTopic}+study+guide`,
    },
    {
      id: 'open-case-pdf',
      title: 'Open a relevant case PDF',
      description: `Find a research or case-study PDF related to ${assignmentTitle}.`,
      actionType: 'open_link',
      url: `https://scholar.google.com/scholar?q=${encodedTopic}+case+study+filetype%3Apdf`,
    },
    {
      id: 'create-writeup-doc',
      title: 'Create write-up draft',
      description: 'Open a blank Google Doc and start a quick first draft now.',
      actionType: 'create_google_doc',
      url: 'https://docs.new',
    },
  ]
}

const parseGeminiJson = (data, fallback) => {
  const outputText = data?.candidates?.[0]?.content?.parts?.map((part) => part.text).join('')
  if (!outputText) {
    return fallback
  }

  try {
    return JSON.parse(outputText)
  } catch {
    return fallback
  }
}

const personaPresetInstructions = {
  strict:
    'Persona mode: Strict Coach. Tone is strict and direct. Prioritize accountability, brevity, and clear boundaries.',
  supportive:
    'Persona mode: Supportive Mentor. Tone is supportive and empathetic. Encourage progress while still holding the user accountable.',
  socratic:
    'Persona mode: Socratic Strategist. Tone is strategic and reflective. Use concise probing questions to guide better decisions.',
}

const normalizePersona = (persona) => {
  if (persona?.mode === 'custom') {
    const customPrompt = String(persona.customPrompt ?? '')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 400)

    if (customPrompt.length > 0) {
      return {
        mode: 'custom',
        customPrompt,
      }
    }
  }

  const presetId = persona?.mode === 'preset' ? persona.presetId : undefined
  if (presetId === 'supportive' || presetId === 'socratic' || presetId === 'strict') {
    return {
      mode: 'preset',
      presetId,
    }
  }

  return {
    mode: 'preset',
    presetId: 'strict',
  }
}

const buildPersonaInstruction = (persona) => {
  const normalizedPersona = normalizePersona(persona)

  if (normalizedPersona.mode === 'custom') {
    return `Use this custom persona instruction while preserving focus guardrails: ${normalizedPersona.customPrompt}`
  }

  return personaPresetInstructions[normalizedPersona.presetId]
}

app.use(cors())
app.use(express.json())

app.get('/health', (_req, res) => {
  res.json({ ok: true, service: 'focus-agent-server' })
})

app.get('/api/feature-flags', (_req, res) => {
  res.json({
    ok: true,
    featureFlags,
  })
})

app.get('/api/canvas/demo-assignments', (_req, res) => {
  res.json({
    ok: true,
    ...mockCanvasAssignmentsResponse,
  })
})

app.get('/api/mock/bootstrap', (_req, res) => {
  const sampleSignalInput = {
    assignmentId: mockFocusSession.selectedAssignmentIds[0],
    targetDomain: mockFocusSession.blacklistDomains[0],
    userMessage: 'Need a tutorial to complete the assignment notebook error analysis section.',
  }

  const sampleSignals = buildInterventionSignals(sampleSignalInput)
  const samplePolicyScore = scoreInterventionPolicy({
    ...sampleSignalInput,
    signals: sampleSignals,
  })

  res.json({
    ok: true,
    courses: mockCourses,
    assignments: mockAssignments,
    resources: mockResources,
    domainCatalog: mockDomainCatalog,
    userProfile: mockUserProfile,
    focusSession: mockFocusSession,
    interventions: mockInterventions,
    outcomes: mockOutcomes,
    sampleSignals,
    samplePolicyScore,
  })
})

app.get('/api/mock/courses', (_req, res) => {
  res.json({ ok: true, courses: mockCourses })
})

app.get('/api/mock/assignments', (_req, res) => {
  res.json({ ok: true, assignments: mockAssignments })
})

app.get('/api/mock/resources', (_req, res) => {
  res.json({ ok: true, resources: mockResources })
})

app.get('/api/mock/domains', (_req, res) => {
  res.json({ ok: true, domains: mockDomainCatalog })
})

app.get('/api/mock/profile', (_req, res) => {
  res.json({ ok: true, userProfile: mockUserProfile, focusSession: mockFocusSession })
})

app.get('/api/mock/history', (_req, res) => {
  res.json({ ok: true, interventions: mockInterventions, outcomes: mockOutcomes })
})

app.get('/api/mock/metrics-summary', (_req, res) => {
  const totalInterventions = mockInterventions.length
  const grantedCount = mockInterventions.filter((item) => item.decision === 'granted').length
  const deniedCount = totalInterventions - grantedCount
  const outcomeCount = mockOutcomes.length
  const helpfulCount = mockOutcomes.filter((item) => item.userFeedback === 'helpful').length
  const notHelpfulCount = mockOutcomes.filter((item) => item.userFeedback === 'not_helpful').length

  res.json({
    ok: true,
    totals: {
      interventions: totalInterventions,
      outcomes: outcomeCount,
    },
    rates: {
      grantRate: totalInterventions > 0 ? grantedCount / totalInterventions : 0,
      denyRate: totalInterventions > 0 ? deniedCount / totalInterventions : 0,
      helpfulRate: outcomeCount > 0 ? helpfulCount / outcomeCount : 0,
      notHelpfulRate: outcomeCount > 0 ? notHelpfulCount / outcomeCount : 0,
    },
  })
})

app.post('/api/mock/log-intervention', (req, res) => {
  if (!featureFlags.enableTelemetryCapture) {
    res.json({
      ok: true,
      skipped: true,
      reason: 'telemetry_capture_disabled',
    })
    return
  }

  const {
    targetDomain,
    rationaleText,
    decision,
    confidence,
    reasonCode,
    assignmentId,
    assignmentTitle,
    policyDecision,
    orchestrationMode,
  } = req.body ?? {}

  if (!targetDomain || !decision) {
    res.status(400).json({
      ok: false,
      error: 'targetDomain and decision are required',
    })
    return
  }

  const intervention = recordMockIntervention({
    targetDomain,
    rationaleText,
    decision,
    confidence,
    reasonCode,
    assignmentId,
    assignmentTitle,
    policyDecision,
    orchestrationMode,
  })

  res.json({ ok: true, intervention })
})

app.post('/api/mock/log-outcome', (req, res) => {
  if (!featureFlags.enableTelemetryCapture) {
    res.json({
      ok: true,
      skipped: true,
      reason: 'telemetry_capture_disabled',
    })
    return
  }

  const {
    interventionId,
    allowedDurationUsedMin,
    returnedToTaskWithinMin,
    actionCompleted,
    userFeedback,
    feedbackText,
  } = req.body ?? {}

  if (!interventionId) {
    res.status(400).json({ ok: false, error: 'interventionId is required' })
    return
  }

  const outcome = recordMockOutcome({
    interventionId,
    allowedDurationUsedMin,
    returnedToTaskWithinMin,
    actionCompleted,
    userFeedback,
    feedbackText,
  })

  res.json({ ok: true, outcome })
})

app.get('/api/mock/evaluate-policy', (_req, res) => {
  if (!featureFlags.enableOfflineEval) {
    res.status(403).json({
      ok: false,
      error: 'offline_eval_disabled',
    })
    return
  }

  const result = runOfflinePolicyEvaluation()
  res.json(result)
})

app.post('/api/mock/evaluate-policy', (req, res) => {
  if (!featureFlags.enableOfflineEval) {
    res.status(403).json({
      ok: false,
      error: 'offline_eval_disabled',
    })
    return
  }

  const { thresholds, reviewPenalty, runGridSearch, includeRows } = req.body ?? {}
  const result = runOfflinePolicyEvaluation({
    thresholds,
    reviewPenalty,
    runGridSearch: runGridSearch !== false,
    includeRows: Boolean(includeRows),
  })

  res.json(result)
})

app.post('/api/mock/retrieve-context', (req, res) => {
  const { assignmentId, targetDomain, query, topK } = req.body ?? {}

  if (!assignmentId && !query) {
    res.status(400).json({
      ok: false,
      error: 'Provide at least assignmentId or query to retrieve context',
    })
    return
  }

  const retrieval = retrieveMockContext({
    assignmentId,
    targetDomain,
    query,
    topK,
  })

  res.json({
    ok: true,
    ...retrieval,
  })
})

app.post('/api/mock/extract-signals', (req, res) => {
  const { assignmentId, assignment, targetDomain, userMessage, nowISO } = req.body ?? {}

  const resolvedAssignmentId = assignmentId ?? assignment?.id ?? mockFocusSession.selectedAssignmentIds[0]

  const signalBundle = buildInterventionSignals({
    assignmentId: resolvedAssignmentId,
    targetDomain: targetDomain ?? mockFocusSession.blacklistDomains[0],
    userMessage: userMessage ?? '',
    nowISO,
  })

  res.json({
    ok: true,
    ...signalBundle,
  })
})

app.post('/api/mock/policy-score', (req, res) => {
  const { assignmentId, assignment, targetDomain, userMessage, nowISO, signals } = req.body ?? {}

  const resolvedAssignmentId = assignmentId ?? assignment?.id ?? mockFocusSession.selectedAssignmentIds[0]

  const policyScore = scoreInterventionPolicy({
    assignmentId: resolvedAssignmentId,
    assignment,
    targetDomain: targetDomain ?? mockFocusSession.blacklistDomains[0],
    userMessage: userMessage ?? '',
    nowISO,
    signals,
  })

  res.json({
    ok: true,
    ...policyScore,
  })
})

app.post('/api/mock/orchestrate-decision', async (req, res) => {
  if (!featureFlags.enableAiOrchestrator) {
    res.status(403).json({
      ok: false,
      grant_access: false,
      response: 'ai_orchestrator_disabled',
    })
    return
  }

  const geminiApiKey = process.env.GEMINI_API_KEY
  const { targetDomain, userMessage, assignment, assignments, persona } = req.body ?? {}

  try {
    const decision = await runDecisionOrchestrator({
      geminiApiKey,
      targetDomain,
      userMessage,
      assignment,
      assignments,
      personaInstruction: buildPersonaInstruction(persona),
      enableResponseVerifier: featureFlags.enableResponseVerifier,
      includeDecisionTraceMetadata: featureFlags.enableDecisionTraceMetadata,
    })

    res.json({
      ok: true,
      ...decision,
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown server error'
    res.status(500).json({
      ok: false,
      grant_access: false,
      response: `Focus Agent orchestration error: ${message}`,
    })
  }
})

app.post('/api/bouncer-decision', async (req, res) => {
  const geminiApiKey = process.env.GEMINI_API_KEY

  const { targetDomain, userMessage, assignment, assignments, persona } = req.body ?? {}

  if (featureFlags.enableAiOrchestrator) {
    try {
      const decision = await runDecisionOrchestrator({
        geminiApiKey,
        targetDomain,
        userMessage,
        assignment,
        assignments,
        personaInstruction: buildPersonaInstruction(persona),
        enableResponseVerifier: featureFlags.enableResponseVerifier,
        includeDecisionTraceMetadata: featureFlags.enableDecisionTraceMetadata,
      })

      res.json(decision)
      return
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown server error'
      res.status(500).json({
        grant_access: false,
        response: `Focus Agent server error: ${message}`,
      })
      return
    }
  }

  if (!geminiApiKey) {
    res.status(500).json({
      grant_access: false,
      response: 'Server missing GEMINI_API_KEY in server/.env',
    })
    return
  }

  const assignmentTitle = assignment?.title ?? 'an assignment'
  const assignmentDue = assignment?.dueAtISO ?? 'soon'
  const normalizedTarget = String(targetDomain ?? '').toLowerCase()
  const isYouTubeTarget = normalizedTarget === 'youtube.com' || normalizedTarget.endsWith('.youtube.com')

  const systemPrompt = [
    'You are Focus Agent, a productivity coach and attention firewall.',
    `The user has an impending deadline for ${assignmentTitle} due at ${assignmentDue}.`,
    `They are trying to access ${targetDomain}.`,
    'Your goal is to prevent procrastination.',
    buildPersonaInstruction(persona),
    'If their excuse is educational and directly required for the assignment, output exactly JSON: {"grant_access": true, "reason": "educational"}.',
    'If it is weak, output exactly JSON: {"grant_access": false, "response": "<snarky motivational pushback>"}.',
    isYouTubeTarget
      ? 'When grant_access is true for YouTube, also include "researchQuery" (concise keyword phrase) and optionally "recommendedVideoUrl" if you can infer a likely direct YouTube watch URL. Keep valid JSON only.'
      : 'For non-YouTube targets, do not include YouTube-specific fields.',
    'Never output markdown, only valid JSON.',
  ].join(' ')

  const userContext = {
    targetDomain,
    userMessage,
    primaryAssignment: assignment,
    allSelectedAssignments: assignments,
  }

  try {
    const model = 'gemini-2.5-flash'
    const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${geminiApiKey}`

    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        systemInstruction: {
          parts: [{ text: systemPrompt }],
        },
        generationConfig: {
          temperature: 0.2,
          responseMimeType: 'application/json',
        },
        contents: [
          {
            role: 'user',
            parts: [{ text: JSON.stringify(userContext) }],
          },
        ],
      }),
    })

    if (!response.ok) {
      const text = await response.text()
      throw new Error(`Gemini API error (${response.status}): ${text}`)
    }

    const data = await response.json()
    const outputText =
      data?.candidates?.[0]?.content?.parts?.map((part) => part.text).join('') ?? '{"grant_access": false}'

    let parsed
    try {
      parsed = JSON.parse(outputText)
    } catch {
      parsed = {
        grant_access: false,
        response: 'Not convinced. Finish the assignment first.',
      }
    }

    res.json({
      grant_access: Boolean(parsed.grant_access),
      reason: parsed.reason,
      response: parsed.response,
      researchQuery: typeof parsed.researchQuery === 'string' ? parsed.researchQuery : undefined,
      recommendedVideoUrl: typeof parsed.recommendedVideoUrl === 'string' ? parsed.recommendedVideoUrl : undefined,
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown server error'
    res.status(500).json({
      grant_access: false,
      response: `Focus Agent server error: ${message}`,
    })
  }
})

app.post('/api/bouncer-actions', async (req, res) => {
  const geminiApiKey = process.env.GEMINI_API_KEY
  const { targetDomain, assignment, persona } = req.body ?? {}

  if (!assignment) {
    res.status(400).json({
      ok: false,
      error: 'Missing assignment context for action planning',
    })
    return
  }

  if (!geminiApiKey) {
    res.json({
      ok: true,
      summary: `Focus on ${assignment.title}. Pick one concrete next step before opening ${targetDomain}.`,
      actions: fallbackActions(assignment, targetDomain),
    })
    return
  }

  const systemPrompt = [
    'You are Focus Agent inside a productivity blocker app.',
    'Given assignment context and a distraction target, suggest exactly 3 next actions that move the assignment forward.',
    'Action options must include one reading resource, one case/research PDF path, and one write-up action.',
    buildPersonaInstruction(persona),
    'Respond with strict JSON only in this shape:',
    '{"summary":"...","actions":[{"id":"...","title":"...","description":"...","actionType":"open_link|create_google_doc","url":"https://..."}]}.',
    'Keep titles under 6 words and descriptions under 120 chars.',
  ].join(' ')

  const userContext = {
    targetDomain,
    assignment,
  }

  try {
    const model = 'gemini-2.5-flash'
    const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${geminiApiKey}`

    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        systemInstruction: {
          parts: [{ text: systemPrompt }],
        },
        generationConfig: {
          temperature: 0.4,
          responseMimeType: 'application/json',
        },
        contents: [
          {
            role: 'user',
            parts: [{ text: JSON.stringify(userContext) }],
          },
        ],
      }),
    })

    if (!response.ok) {
      throw new Error(`Gemini API error (${response.status})`)
    }

    const data = await response.json()
    const parsed = parseGeminiJson(data, null)

    if (!parsed?.summary || !Array.isArray(parsed?.actions) || parsed.actions.length === 0) {
      res.json({
        ok: true,
        summary: `Focus on ${assignment.title}. Pick one concrete next step before opening ${targetDomain}.`,
        actions: fallbackActions(assignment, targetDomain),
      })
      return
    }

    const normalizedActions = parsed.actions.slice(0, 3).map((action, index) => ({
      id: String(action.id ?? `action-${index + 1}`),
      title: String(action.title ?? `Action ${index + 1}`),
      description: String(action.description ?? 'Take a focused next step.'),
      actionType: action.actionType === 'create_google_doc' ? 'create_google_doc' : 'open_link',
      url:
        typeof action.url === 'string' && action.url.trim().length > 0
          ? action.url
          : fallbackActions(assignment, targetDomain)[index]?.url,
    }))

    res.json({
      ok: true,
      summary: String(parsed.summary),
      actions: normalizedActions,
    })
  } catch {
    res.json({
      ok: true,
      summary: `Focus on ${assignment.title}. Pick one concrete next step before opening ${targetDomain}.`,
      actions: fallbackActions(assignment, targetDomain),
    })
  }
})

app.post('/api/bouncer-action-guide', async (req, res) => {
  const geminiApiKey = process.env.GEMINI_API_KEY
  const { assignment, action, persona } = req.body ?? {}

  if (!assignment || !action) {
    res.status(400).json({ ok: false, error: 'Missing assignment or action payload' })
    return
  }

  if (!geminiApiKey) {
    res.json({
      ok: true,
      response: `Great choice: ${action.title}. Spend 10 focused minutes and capture 3 concrete notes tied to ${assignment.title}.`,
    })
    return
  }

  const systemPrompt = [
    'You are Focus Agent, an academic productivity coach.',
    'The user selected an action item. Give a short, practical execution plan in 2-4 sentences.',
    buildPersonaInstruction(persona),
    'Tone: encouraging and direct. Mention one immediate first step and one completion checkpoint.',
    'Output strict JSON only: {"response":"..."}',
  ].join(' ')

  try {
    const model = 'gemini-2.5-flash'
    const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${geminiApiKey}`

    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        systemInstruction: {
          parts: [{ text: systemPrompt }],
        },
        generationConfig: {
          temperature: 0.4,
          responseMimeType: 'application/json',
        },
        contents: [
          {
            role: 'user',
            parts: [{ text: JSON.stringify({ assignment, action }) }],
          },
        ],
      }),
    })

    if (!response.ok) {
      throw new Error(`Gemini API error (${response.status})`)
    }

    const data = await response.json()
    const parsed = parseGeminiJson(data, null)

    if (!parsed?.response) {
      res.json({
        ok: true,
        response: `Great choice: ${action.title}. Spend 10 focused minutes and capture 3 concrete notes tied to ${assignment.title}.`,
      })
      return
    }

    res.json({ ok: true, response: String(parsed.response) })
  } catch {
    res.json({
      ok: true,
      response: `Great choice: ${action.title}. Spend 10 focused minutes and capture 3 concrete notes tied to ${assignment.title}.`,
    })
  }
})

app.listen(port, () => {
  console.log(`Focus Agent server running on http://localhost:${port}`)
})
