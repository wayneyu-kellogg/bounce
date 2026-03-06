import {
  mockAssignments,
  mockDomainCatalog,
  mockFocusSession,
  mockInterventions,
  mockOutcomes,
} from './mockData.js'

const clamp01 = (value) => Math.max(0, Math.min(1, Number(value) || 0))

const tokenize = (text) =>
  String(text ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(Boolean)

const EDUCATIONAL_KEYWORDS = new Set([
  'assignment',
  'rubric',
  'lecture',
  'tutorial',
  'research',
  'paper',
  'study',
  'notebook',
  'analysis',
  'model',
  'metric',
  'learn',
  'course',
  'class',
  'project',
])

const VAGUE_INTENT_KEYWORDS = new Set([
  'break',
  'chill',
  'fun',
  'random',
  'scroll',
  'relax',
  'later',
  'bored',
  'quickly',
])

const computeDeadlineUrgencyScore = (dueAtISO, nowMs) => {
  if (!dueAtISO) {
    return 0.4
  }

  const dueMs = Date.parse(dueAtISO)
  if (!Number.isFinite(dueMs)) {
    return 0.4
  }

  const hoursRemaining = (dueMs - nowMs) / (1000 * 60 * 60)

  if (hoursRemaining <= 0) {
    return 1
  }
  if (hoursRemaining <= 24) {
    return 0.9
  }
  if (hoursRemaining <= 48) {
    return 0.8
  }
  if (hoursRemaining <= 72) {
    return 0.7
  }
  if (hoursRemaining <= 120) {
    return 0.55
  }

  return 0.35
}

const computeAssignmentProgressPressure = (status) => {
  if (status === 'pending') {
    return 0.8
  }
  if (status === 'in_progress') {
    return 0.45
  }
  return 0.5
}

const getDomainEntry = (targetDomain) => {
  const normalizedTarget = String(targetDomain ?? '').toLowerCase().trim()
  if (!normalizedTarget) {
    return undefined
  }

  return mockDomainCatalog.find((entry) => {
    const domain = String(entry.domain).toLowerCase()
    return normalizedTarget === domain || normalizedTarget.endsWith(`.${domain}`)
  })
}

const getRecentHistoryStats = (targetDomain, nowMs) => {
  const domainNormalized = String(targetDomain ?? '').toLowerCase().trim()

  const interventionsWithTimestamp = mockInterventions
    .map((item) => ({
      ...item,
      timestampMs: Date.parse(item.timestampISO),
    }))
    .filter((item) => Number.isFinite(item.timestampMs))

  const domainInterventions = interventionsWithTimestamp.filter(
    (item) => String(item.targetDomain ?? '').toLowerCase() === domainNormalized,
  )

  const grantedDomainCount = domainInterventions.filter((item) => item.decision === 'granted').length
  const grantedOverallCount = interventionsWithTimestamp.filter((item) => item.decision === 'granted').length

  const sevenDaysMs = 7 * 24 * 60 * 60 * 1000
  const recentDenials = interventionsWithTimestamp.filter(
    (item) => item.decision === 'denied' && nowMs - item.timestampMs <= sevenDaysMs,
  ).length

  const helpfulOutcomeCount = mockOutcomes.filter((item) => item.userFeedback === 'helpful').length

  return {
    priorAttemptsOnDomain: domainInterventions.length,
    domainGrantRate:
      domainInterventions.length > 0 ? grantedDomainCount / domainInterventions.length : 0.5,
    overallGrantRate:
      interventionsWithTimestamp.length > 0 ? grantedOverallCount / interventionsWithTimestamp.length : 0.5,
    recentDenialsLast7d: recentDenials,
    helpfulOutcomeRate: mockOutcomes.length > 0 ? helpfulOutcomeCount / mockOutcomes.length : 0.5,
  }
}

const computeRationaleSignals = (userMessage) => {
  const tokens = tokenize(userMessage)
  const educationalKeywordHits = tokens.filter((token) => EDUCATIONAL_KEYWORDS.has(token)).length
  const vagueIntentHits = tokens.filter((token) => VAGUE_INTENT_KEYWORDS.has(token)).length

  const lengthScore = clamp01(tokens.length / 24)
  const keywordScore = clamp01(educationalKeywordHits / 4)
  const penalty = clamp01(vagueIntentHits / 3)

  const rationaleSpecificityScore = clamp01(lengthScore * 0.45 + keywordScore * 0.55 - penalty * 0.4)

  return {
    rationaleLengthChars: String(userMessage ?? '').trim().length,
    rationaleWordCount: tokens.length,
    educationalKeywordHits,
    vagueIntentHits,
    rationaleSpecificityScore,
  }
}

export const buildInterventionSignals = ({ assignmentId, targetDomain, userMessage, nowISO } = {}) => {
  const assignment = mockAssignments.find((item) => item.id === assignmentId)
  const nowMs = Number.isFinite(Date.parse(nowISO ?? '')) ? Date.parse(nowISO) : Date.now()

  const dueAtMs = Date.parse(assignment?.dueAtISO ?? '')
  const deadlineHoursRemaining = Number.isFinite(dueAtMs)
    ? Number(((dueAtMs - nowMs) / (1000 * 60 * 60)).toFixed(2))
    : null

  const deadlineUrgencyScore = computeDeadlineUrgencyScore(assignment?.dueAtISO, nowMs)
  const progressPressureScore = computeAssignmentProgressPressure(assignment?.status)

  const domainEntry = getDomainEntry(targetDomain)
  const domainRiskScore = clamp01(domainEntry?.baseRiskScore ?? 0.5)
  const domainCategory = domainEntry?.category ?? 'unknown'

  const rationaleSignals = computeRationaleSignals(userMessage)
  const historySignals = getRecentHistoryStats(targetDomain, nowMs)

  const sessionAgeMin = Number.isFinite(Date.parse(mockFocusSession.startedAtISO))
    ? Math.max(0, Math.round((nowMs - Date.parse(mockFocusSession.startedAtISO)) / (1000 * 60)))
    : 0

  const urgencyPressureScore = clamp01(deadlineUrgencyScore * 0.65 + progressPressureScore * 0.35)

  const procrastinationRiskScore = clamp01(
    domainRiskScore * 0.55 +
      (1 - rationaleSignals.rationaleSpecificityScore) * 0.25 +
      clamp01(historySignals.recentDenialsLast7d / 4) * 0.1 +
      (1 - historySignals.helpfulOutcomeRate) * 0.1,
  )

  const reasonHints = []

  if (urgencyPressureScore >= 0.75) {
    reasonHints.push('deadline_pressure_high')
  }

  if (procrastinationRiskScore >= 0.7) {
    reasonHints.push('distraction_risk_high')
  }

  if (rationaleSignals.rationaleSpecificityScore >= 0.7) {
    reasonHints.push('rationale_specificity_high')
  } else if (rationaleSignals.rationaleSpecificityScore <= 0.35) {
    reasonHints.push('rationale_specificity_low')
  }

  if (domainCategory === 'academic') {
    reasonHints.push('domain_academic')
  }

  return {
    generatedAtISO: new Date(nowMs).toISOString(),
    assignment: assignment
      ? {
          id: assignment.id,
          title: assignment.title,
          course: assignment.course,
          dueAtISO: assignment.dueAtISO,
          status: assignment.status,
        }
      : null,
    targetDomain: targetDomain ?? null,
    userMessage: userMessage ?? '',
    features: {
      deadlineHoursRemaining,
      deadlineUrgencyScore,
      progressPressureScore,
      domainRiskScore,
      domainCategory,
      ...rationaleSignals,
      ...historySignals,
      sessionAgeMin,
      selectedAssignmentsCount: mockFocusSession.selectedAssignmentIds.length,
      blockedDomainsCount: mockFocusSession.blacklistDomains.length,
    },
    aggregates: {
      urgencyPressureScore,
      procrastinationRiskScore,
    },
    reasonHints,
  }
}
