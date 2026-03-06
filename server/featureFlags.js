const parseBooleanFlag = (value, defaultValue) => {
  if (typeof value !== 'string') {
    return defaultValue
  }

  const normalized = value.trim().toLowerCase()
  if (['1', 'true', 'yes', 'on'].includes(normalized)) {
    return true
  }

  if (['0', 'false', 'no', 'off'].includes(normalized)) {
    return false
  }

  return defaultValue
}

export const getFeatureFlags = () => ({
  enableAiOrchestrator: parseBooleanFlag(process.env.ENABLE_AI_ORCHESTRATOR, false),
  enableResponseVerifier: parseBooleanFlag(process.env.ENABLE_RESPONSE_VERIFIER, true),
  enableDecisionTraceMetadata: parseBooleanFlag(process.env.ENABLE_DECISION_TRACE_METADATA, true),
  enableTelemetryCapture: parseBooleanFlag(process.env.ENABLE_TELEMETRY_CAPTURE, false),
  enableOfflineEval: parseBooleanFlag(process.env.ENABLE_OFFLINE_EVAL, false),
})
