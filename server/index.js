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

app.use(cors())
app.use(express.json())

app.get('/health', (_req, res) => {
  res.json({ ok: true, service: 'bounce-server' })
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

app.listen(port, () => {
  console.log(`Bounce server running on http://localhost:${port}`)
})
