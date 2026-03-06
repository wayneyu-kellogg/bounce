import { mockFocusSession, mockInterventions } from './mockData.js'
import { DEFAULT_POLICY_THRESHOLDS, scoreInterventionPolicy } from './policyScoring.js'

const normalizeThresholds = (thresholds) => ({
  allowAt: Number.isFinite(Number(thresholds?.allowAt)) ? Number(thresholds.allowAt) : DEFAULT_POLICY_THRESHOLDS.allowAt,
  denyAt: Number.isFinite(Number(thresholds?.denyAt)) ? Number(thresholds.denyAt) : DEFAULT_POLICY_THRESHOLDS.denyAt,
})

const evaluateWithThresholds = ({ thresholds, reviewPenalty = 0.15 }) => {
  const normalizedThresholds = normalizeThresholds(thresholds)

  const rows = mockInterventions.map((item) => {
    const expectedDecision = item.decision === 'granted' ? 'allow' : 'deny'

    const score = scoreInterventionPolicy({
      assignmentId: item.assignmentId ?? mockFocusSession.selectedAssignmentIds[0],
      targetDomain: item.targetDomain,
      userMessage: item.rationaleText,
      nowISO: item.timestampISO,
      thresholds: normalizedThresholds,
    })

    return {
      interventionId: item.id,
      expectedDecision,
      predictedDecision: score.policyDecision,
      grantLikelihood: score.grantLikelihood,
      confidence: score.confidence,
      reasonCode: score.reasonCode,
    }
  })

  const total = rows.length
  const reviewed = rows.filter((row) => row.predictedDecision === 'review').length
  const covered = total - reviewed

  const correctCovered = rows.filter(
    (row) => row.predictedDecision !== 'review' && row.predictedDecision === row.expectedDecision,
  ).length

  const wrongCovered = rows.filter(
    (row) => row.predictedDecision !== 'review' && row.predictedDecision !== row.expectedDecision,
  ).length

  const accuracyOnCovered = covered > 0 ? correctCovered / covered : 0
  const overallCorrectRate = total > 0 ? correctCovered / total : 0
  const coverageRate = total > 0 ? covered / total : 0
  const weightedScore = overallCorrectRate - (reviewed / Math.max(total, 1)) * reviewPenalty

  return {
    thresholds: normalizedThresholds,
    totals: {
      total,
      covered,
      reviewed,
      correctCovered,
      wrongCovered,
    },
    rates: {
      accuracyOnCovered,
      overallCorrectRate,
      coverageRate,
      reviewRate: total > 0 ? reviewed / total : 0,
    },
    weightedScore,
    reviewPenalty,
    rows,
  }
}

const buildThresholdCandidates = () => {
  const candidates = []

  for (let allowAt = 0.52; allowAt <= 0.78; allowAt += 0.02) {
    for (let denyAt = 0.22; denyAt <= 0.48; denyAt += 0.02) {
      if (denyAt >= allowAt - 0.08) {
        continue
      }

      candidates.push({
        allowAt: Number(allowAt.toFixed(2)),
        denyAt: Number(denyAt.toFixed(2)),
      })
    }
  }

  return candidates
}

export const runOfflinePolicyEvaluation = ({
  thresholds,
  reviewPenalty = 0.15,
  runGridSearch = true,
  includeRows = false,
} = {}) => {
  const baseline = evaluateWithThresholds({ thresholds, reviewPenalty })

  let bestCandidate = null

  if (runGridSearch) {
    const candidates = buildThresholdCandidates()
    for (const candidate of candidates) {
      const evaluation = evaluateWithThresholds({ thresholds: candidate, reviewPenalty })
      if (!bestCandidate || evaluation.weightedScore > bestCandidate.weightedScore) {
        bestCandidate = evaluation
      }
    }
  }

  const recommendation =
    bestCandidate && bestCandidate.weightedScore > baseline.weightedScore + 0.01
      ? {
          action: 'consider_threshold_update',
          currentThresholds: baseline.thresholds,
          suggestedThresholds: bestCandidate.thresholds,
          weightedScoreLift: Number((bestCandidate.weightedScore - baseline.weightedScore).toFixed(4)),
        }
      : {
          action: 'keep_current_thresholds',
          currentThresholds: baseline.thresholds,
          weightedScoreLift: 0,
        }

  const stripRows = (result) => ({
    ...result,
    rows: includeRows ? result.rows : undefined,
  })

  return {
    ok: true,
    generatedAtISO: new Date().toISOString(),
    baseline: stripRows(baseline),
    bestCandidate: bestCandidate ? stripRows(bestCandidate) : null,
    recommendation,
  }
}
