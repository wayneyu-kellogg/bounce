const sanitizeString = (value, fallback = '') => {
  const text = typeof value === 'string' ? value.replace(/\s+/g, ' ').trim() : ''
  return text.length > 0 ? text : fallback
}

const isLikelyYouTubeWatchUrl = (url) => {
  if (typeof url !== 'string' || url.trim().length === 0) {
    return false
  }

  try {
    const parsed = new URL(url)
    if (!['youtube.com', 'www.youtube.com', 'm.youtube.com', 'youtu.be'].includes(parsed.hostname)) {
      return false
    }

    return parsed.pathname.startsWith('/watch') || parsed.hostname === 'youtu.be'
  } catch {
    return false
  }
}

const buildDefaultResponse = ({ grantAccess, assignment, targetDomain }) => {
  const assignmentTitle = assignment?.title ?? 'your assignment'
  if (grantAccess) {
    return `Access allowed for focused work tied to ${assignmentTitle} on ${targetDomain}.`
  }

  return `Stay focused on ${assignmentTitle} first before opening ${targetDomain}.`
}

export const verifyDecisionResponse = ({
  decision,
  policyScore,
  assignment,
  targetDomain,
  isYouTubeTarget,
}) => {
  const warnings = []

  const verified = {
    grant_access: Boolean(decision?.grant_access),
    reason: sanitizeString(decision?.reason, decision?.grant_access ? 'educational' : 'insufficient_relevance'),
    response: sanitizeString(
      decision?.response,
      buildDefaultResponse({
        grantAccess: Boolean(decision?.grant_access),
        assignment,
        targetDomain,
      }),
    ),
    researchQuery: sanitizeString(decision?.researchQuery, ''),
    recommendedVideoUrl: sanitizeString(decision?.recommendedVideoUrl, ''),
  }

  if (!isYouTubeTarget) {
    if (verified.researchQuery) {
      warnings.push('removed_non_youtube_research_query')
    }
    if (verified.recommendedVideoUrl) {
      warnings.push('removed_non_youtube_video_url')
    }
    verified.researchQuery = undefined
    verified.recommendedVideoUrl = undefined
  } else if (verified.grant_access) {
    if (!verified.researchQuery) {
      verified.researchQuery = `${assignment?.title ?? 'assignment'} tutorial`
      warnings.push('added_default_youtube_research_query')
    }

    if (verified.recommendedVideoUrl && !isLikelyYouTubeWatchUrl(verified.recommendedVideoUrl)) {
      verified.recommendedVideoUrl = undefined
      warnings.push('removed_invalid_youtube_video_url')
    }
  } else {
    if (verified.researchQuery || verified.recommendedVideoUrl) {
      warnings.push('removed_youtube_fields_for_denied_decision')
    }
    verified.researchQuery = undefined
    verified.recommendedVideoUrl = undefined
  }

  const highConfidencePolicyDeny =
    policyScore?.policyDecision === 'deny' && Number(policyScore?.confidence ?? 0) >= 0.75

  if (highConfidencePolicyDeny && verified.grant_access) {
    verified.grant_access = false
    verified.reason = 'policy_guardrail_deny'
    verified.response = `High-confidence policy guardrail blocked this request. Complete a measurable step on ${assignment?.title ?? 'your assignment'} first.`
    verified.researchQuery = undefined
    verified.recommendedVideoUrl = undefined
    warnings.push('policy_guardrail_override_deny')
  }

  return {
    verifiedDecision: verified,
    verifier: {
      passed: true,
      warnings,
      mode: 'strict_schema_and_policy_guardrails',
    },
  }
}
