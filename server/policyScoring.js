import { buildInterventionSignals } from './signalExtraction.js'

export const DEFAULT_POLICY_THRESHOLDS = {
  allowAt: 0.62,
  denyAt: 0.38,
}

const clamp01 = (value) => Math.max(0, Math.min(1, Number(value) || 0))

const explainScoreBand = (score) => {
  if (score >= 0.75) {
    return 'high'
  }
  if (score >= 0.45) {
    return 'medium'
  }
  return 'low'
}

const computeGrantLikelihood = (signals) => {
  const features = signals.features
  const aggregates = signals.aggregates

  const positiveEvidenceScore = clamp01(
    features.rationaleSpecificityScore * 0.45 +
      (features.domainCategory === 'academic' ? 0.25 : 0) +
      features.helpfulOutcomeRate * 0.2 +
      Math.max(0, features.domainGrantRate - 0.5) * 0.2,
  )

  const negativePressureScore = clamp01(
    aggregates.urgencyPressureScore * 0.45 +
      aggregates.procrastinationRiskScore * 0.45 +
      Math.min(1, features.recentDenialsLast7d / 4) * 0.1,
  )

  const grantLikelihood = clamp01(positiveEvidenceScore * 0.62 + (1 - negativePressureScore) * 0.38)

  return {
    grantLikelihood,
    positiveEvidenceScore,
    negativePressureScore,
  }
}

const buildReasonCode = ({ grantLikelihood, signals, scoreDetails, thresholds }) => {
  if (signals.features.domainCategory === 'academic' && grantLikelihood >= thresholds.allowAt) {
    return 'policy_academic_research_allowed'
  }

  if (signals.aggregates.urgencyPressureScore >= 0.8 && grantLikelihood < 0.45) {
    return 'policy_deadline_pressure_block'
  }

  if (signals.aggregates.procrastinationRiskScore >= 0.75 && grantLikelihood < 0.5) {
    return 'policy_high_distraction_risk_block'
  }

  if (scoreDetails.positiveEvidenceScore >= 0.7 && grantLikelihood >= 0.55) {
    return 'policy_rationale_strength_allow'
  }

  if (grantLikelihood >= 0.6) {
    return 'policy_allow_default'
  }

  if (grantLikelihood <= 0.4) {
    return 'policy_deny_default'
  }

  return 'policy_review_uncertain'
}

export const scoreInterventionPolicy = ({
  assignmentId,
  assignment,
  targetDomain,
  userMessage,
  nowISO,
  signals: providedSignals,
  thresholds,
} = {}) => {
  const signals =
    providedSignals ??
    buildInterventionSignals({
      assignmentId: assignmentId ?? assignment?.id,
      targetDomain,
      userMessage,
      nowISO,
    })

  const scoreDetails = computeGrantLikelihood(signals)
  const grantLikelihood = scoreDetails.grantLikelihood
  const normalizedThresholds = {
    allowAt: Number.isFinite(Number(thresholds?.allowAt)) ? Number(thresholds.allowAt) : DEFAULT_POLICY_THRESHOLDS.allowAt,
    denyAt: Number.isFinite(Number(thresholds?.denyAt)) ? Number(thresholds.denyAt) : DEFAULT_POLICY_THRESHOLDS.denyAt,
  }

  let policyDecision = 'review'
  if (grantLikelihood >= normalizedThresholds.allowAt) {
    policyDecision = 'allow'
  } else if (grantLikelihood <= normalizedThresholds.denyAt) {
    policyDecision = 'deny'
  }

  const uncertaintyDistance = Math.abs(grantLikelihood - 0.5)
  const confidence = clamp01(0.35 + uncertaintyDistance * 1.4)

  const reasonCode = buildReasonCode({
    grantLikelihood,
    signals,
    scoreDetails,
    thresholds: normalizedThresholds,
  })

  const decisionRationale = [
    `grant_likelihood_${explainScoreBand(grantLikelihood)}`,
    `urgency_pressure_${explainScoreBand(signals.aggregates.urgencyPressureScore)}`,
    `procrastination_risk_${explainScoreBand(signals.aggregates.procrastinationRiskScore)}`,
    `rationale_specificity_${explainScoreBand(signals.features.rationaleSpecificityScore)}`,
  ]

  return {
    generatedAtISO: new Date().toISOString(),
    policyDecision,
    grantLikelihood,
    confidence,
    reasonCode,
    decisionRationale,
    thresholds: {
      allowAt: normalizedThresholds.allowAt,
      denyAt: normalizedThresholds.denyAt,
    },
    scoreDetails,
    signals,
  }
}
