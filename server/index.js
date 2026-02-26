import cors from 'cors'
import dotenv from 'dotenv'
import express from 'express'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

dotenv.config({ path: path.join(__dirname, '.env') })

const app = express()
const port = Number(process.env.PORT ?? 8787)

const mockCanvasAssignmentsResponse = {
  assignments: [
    {
      id: 'canvas-demo-1',
      title: 'Design Critique Reflection',
      course: 'MBAI 448',
      dueAtISO: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
      status: 'pending',
    },
    {
      id: 'canvas-demo-2',
      title: 'Model Evaluation Notebook',
      course: 'MSAI 437',
      dueAtISO: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).toISOString(),
      status: 'in_progress',
    },
    {
      id: 'canvas-demo-3',
      title: 'Leadership Habit Experiment',
      course: 'LEAD 505',
      dueAtISO: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString(),
      status: 'pending',
    },
  ],
}

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

app.use(cors())
app.use(express.json())

app.get('/health', (_req, res) => {
  res.json({ ok: true, service: 'bounce-server' })
})

app.get('/api/canvas/demo-assignments', (_req, res) => {
  res.json({
    ok: true,
    ...mockCanvasAssignmentsResponse,
  })
})

app.post('/api/bouncer-decision', async (req, res) => {
  const geminiApiKey = process.env.GEMINI_API_KEY

  if (!geminiApiKey) {
    res.status(500).json({
      grant_access: false,
      response: 'Server missing GEMINI_API_KEY in server/.env',
    })
    return
  }

  const { targetDomain, userMessage, assignment, assignments } = req.body ?? {}

  const assignmentTitle = assignment?.title ?? 'an assignment'
  const assignmentDue = assignment?.dueAtISO ?? 'soon'

  const systemPrompt = [
    'You are a strict, pragmatic productivity bouncer.',
    `The user has an impending deadline for ${assignmentTitle} due at ${assignmentDue}.`,
    `They are trying to access ${targetDomain}.`,
    'Your goal is to prevent procrastination.',
    'If their excuse is educational and directly required for the assignment, output exactly JSON: {"grant_access": true, "reason": "educational"}.',
    'If it is weak, output exactly JSON: {"grant_access": false, "response": "<snarky motivational pushback>"}.',
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
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown server error'
    res.status(500).json({
      grant_access: false,
      response: `Bounce server error: ${message}`,
    })
  }
})

app.post('/api/bouncer-actions', async (req, res) => {
  const geminiApiKey = process.env.GEMINI_API_KEY
  const { targetDomain, assignment } = req.body ?? {}

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
    'You are a practical study coach inside a productivity blocker app.',
    'Given assignment context and a distraction target, suggest exactly 3 next actions that move the assignment forward.',
    'Action options must include one reading resource, one case/research PDF path, and one write-up action.',
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
  const { assignment, action } = req.body ?? {}

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
    'You are a concise academic productivity coach.',
    'The user selected an action item. Give a short, practical execution plan in 2-4 sentences.',
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
  console.log(`Bounce server running on http://localhost:${port}`)
})
