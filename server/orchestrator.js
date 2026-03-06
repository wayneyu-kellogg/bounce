import { retrieveMockContext } from './mockData.js'
import { scoreInterventionPolicy } from './policyScoring.js'
import { verifyDecisionResponse } from './responseVerifier.js'

const parseJsonSafe = (text, fallback) => {
  try {
    return JSON.parse(text)
  } catch {
    return fallback
  }
}

const normalizeDecisionPayload = (parsed) => ({
  grant_access: Boolean(parsed?.grant_access),
  reason: typeof parsed?.reason === 'string' ? parsed.reason : undefined,
  response: typeof parsed?.response === 'string' ? parsed.response : undefined,
  researchQuery: typeof parsed?.researchQuery === 'string' ? parsed.researchQuery : undefined,
  recommendedVideoUrl:
    typeof parsed?.recommendedVideoUrl === 'string' ? parsed.recommendedVideoUrl : undefined,
})

const buildPolicyFallback = ({ policyScore, targetDomain, assignment }) => {
  const title = assignment?.title ?? 'your assignment'

  if (policyScore.policyDecision === 'allow') {
    return {
      grant_access: true,
      reason: 'policy_allow',
      response: `Access allowed for focused research on ${targetDomain}. Stay tied to ${title}.`,
    }
  }

  if (policyScore.policyDecision === 'review') {
    return {
      grant_access: false,
      reason: 'policy_review',
      response: `This rationale is borderline. Do one concrete step on ${title} first, then retry with a specific research goal.`,
    }
  }

  return {
    grant_access: false,
    reason: 'policy_deny',
    response: `Not enough assignment relevance right now. Make progress on ${title} before opening ${targetDomain}.`,
  }
}

const finalizeDecision = ({
  decision,
  policyScore,
  assignment,
  targetDomain,
  isYouTubeTarget,
  orchestrationMode,
  evidenceCount,
}) => {
  const verification = verifyDecisionResponse({
    decision,
    policyScore,
    assignment,
    targetDomain,
    isYouTubeTarget,
  })

  return {
    ...verification.verifiedDecision,
    reasonCode: policyScore.reasonCode,
    confidence: policyScore.confidence,
    policyDecision: policyScore.policyDecision,
    orchestrationMode,
    evidenceCount,
    verifier: verification.verifier,
  }
}

const buildSystemPrompt = ({
  assignment,
  targetDomain,
  personaInstruction,
  policyScore,
  retrieval,
  isYouTubeTarget,
}) => {
  const assignmentTitle = assignment?.title ?? 'an assignment'
  const assignmentDue = assignment?.dueAtISO ?? 'soon'

  const evidenceLines = retrieval.evidence
    .slice(0, 3)
    .map((item, index) => `${index + 1}. ${item.title} (${item.type}) -> ${item.snippet}`)
    .join('\n')

  const policyContext = {
    policyDecision: policyScore.policyDecision,
    confidence: policyScore.confidence,
    reasonCode: policyScore.reasonCode,
    urgencyPressureScore: policyScore.signals.aggregates.urgencyPressureScore,
    procrastinationRiskScore: policyScore.signals.aggregates.procrastinationRiskScore,
    rationaleSpecificityScore: policyScore.signals.features.rationaleSpecificityScore,
  }

  return [
    'You are Focus Agent, a productivity coach and attention firewall.',
    `The user has an impending deadline for ${assignmentTitle} due at ${assignmentDue}.`,
    `They are trying to access ${targetDomain}.`,
    personaInstruction,
    'Use retrieved evidence and policy context below to make a grounded decision.',
    `Policy context: ${JSON.stringify(policyContext)}`,
    `Retrieved evidence:\n${evidenceLines || 'No evidence retrieved.'}`,
    'If rationale is educational and assignment-relevant, return grant_access=true with concise reason.',
    'If weak or unfocused, return grant_access=false with concise motivational pushback.',
    isYouTubeTarget
      ? 'For granted YouTube requests, include researchQuery and optionally recommendedVideoUrl. JSON only.'
      : 'For non-YouTube targets, do not include YouTube-specific fields.',
    'Respond with strict JSON only in this shape:',
    '{"grant_access": boolean, "reason": string, "response": string, "researchQuery"?: string, "recommendedVideoUrl"?: string}',
  ].join(' ')
}

export const runDecisionOrchestrator = async ({
  geminiApiKey,
  targetDomain,
  userMessage,
  assignment,
  assignments,
  personaInstruction,
  enableResponseVerifier = true,
  includeDecisionTraceMetadata = true,
}) => {
  const normalizedTarget = String(targetDomain ?? '').toLowerCase()
  const isYouTubeTarget = normalizedTarget === 'youtube.com' || normalizedTarget.endsWith('.youtube.com')

  const policyScore = scoreInterventionPolicy({
    assignmentId: assignment?.id,
    assignment,
    targetDomain,
    userMessage,
  })

  const retrieval = retrieveMockContext({
    assignmentId: assignment?.id,
    targetDomain,
    query: `${userMessage ?? ''} ${assignment?.title ?? ''}`.trim(),
    topK: 3,
  })

  const finalize = ({ decision, orchestrationMode }) => {
    if (enableResponseVerifier) {
      return finalizeDecision({
        decision,
        policyScore,
        assignment,
        targetDomain,
        isYouTubeTarget,
        orchestrationMode,
        evidenceCount: retrieval.evidence.length,
      })
    }

    const sanitized = normalizeDecisionPayload(decision)

    if (!includeDecisionTraceMetadata) {
      return sanitized
    }

    return {
      ...sanitized,
      reasonCode: policyScore.reasonCode,
      confidence: policyScore.confidence,
      policyDecision: policyScore.policyDecision,
      orchestrationMode,
      evidenceCount: retrieval.evidence.length,
    }
  }

  if (!geminiApiKey) {
    return finalize({
      decision: buildPolicyFallback({ policyScore, targetDomain, assignment }),
      orchestrationMode: 'policy_only_fallback',
    })
  }

  const model = 'gemini-2.5-flash'
  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${geminiApiKey}`

  const systemPrompt = buildSystemPrompt({
    assignment,
    targetDomain,
    personaInstruction,
    policyScore,
    retrieval,
    isYouTubeTarget,
  })

  const userContext = {
    targetDomain,
    userMessage,
    primaryAssignment: assignment,
    allSelectedAssignments: assignments,
  }

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
  const rawOutput = data?.candidates?.[0]?.content?.parts?.map((part) => part.text).join('') ?? '{}'

  const parsed = parseJsonSafe(rawOutput, {
    grant_access: false,
    response: 'Not convinced. Finish the assignment first.',
  })

  const llmDecision = normalizeDecisionPayload(parsed)

  const forcePolicyDeny = policyScore.policyDecision === 'deny' && policyScore.confidence >= 0.75

  if (forcePolicyDeny) {
    return finalize({
      decision: {
        grant_access: false,
        reason: llmDecision.reason ?? 'policy_guardrail_deny',
        response:
          llmDecision.response ??
          `Staying focused is higher priority right now. Make measurable progress on ${assignment?.title ?? 'the assignment'} first.`,
      },
      orchestrationMode: 'policy_guardrail_deny',
    })
  }

  return finalize({
    decision: llmDecision,
    orchestrationMode: 'policy_llm',
  })
}
