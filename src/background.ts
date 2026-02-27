import { getState, setFocusSession, setState } from './lib/chromeStorage'
import { normalizeDomain, nowPlusMinutes } from './lib/domain'
import type { ExtensionMessage, ExtensionResponse } from './lib/messages'
import type { Assignment, BouncerActionsResponse, FocusSession } from './types'

const BLOCK_RULE_BASE = 10_000
const ALLOW_RULE_BASE = 20_000
const ALARM_PREFIX = 'temp-allow-'
const API_BASE = 'http://localhost:8787'

type AllowRecord = Record<string, number>
type SanitizerRecord = Record<string, number>

const getSanitizerRecords = async (): Promise<SanitizerRecord> => {
  const result = await chrome.storage.local.get('temporarySanitizers')
  return (result.temporarySanitizers ?? {}) as SanitizerRecord
}

const setSanitizerRecords = async (records: SanitizerRecord) => {
  await chrome.storage.local.set({ temporarySanitizers: records })
}

const isYouTubeDomain = (domain: string) => domain === 'youtube.com' || domain.endsWith('.youtube.com')

const hasActiveYouTubeSanitizer = async (domain: string) => {
  const normalized = normalizeDomain(domain)
  const records = await getSanitizerRecords()
  const expiresAt = records.youtube

  if (!expiresAt || expiresAt <= Date.now()) {
    return false
  }

  return isYouTubeDomain(normalized)
}

const getNearestDueAssignment = (assignments: Assignment[]) => {
  if (assignments.length === 0) {
    return null
  }

  return [...assignments]
    .filter((assignment) => Boolean(assignment.dueAtISO))
    .sort((left, right) => new Date(left.dueAtISO).getTime() - new Date(right.dueAtISO).getTime())[0]
}

const precomputeBouncerPlan = async (selectedAssignments: Assignment[]) => {
  const nearestDueAssignment = getNearestDueAssignment(selectedAssignments)

  if (!nearestDueAssignment) {
    await setState({ bouncerActionPlan: null })
    return
  }

  try {
    const response = await fetch(`${API_BASE}/api/bouncer-actions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        targetDomain: 'blocked site',
        assignment: nearestDueAssignment,
      }),
    })

    const payload = (await response.json()) as BouncerActionsResponse
    if (!response.ok || !payload.ok || !payload.actions || payload.actions.length === 0) {
      throw new Error(payload.error ?? 'Unable to precompute bouncer actions')
    }

    await setState({
      bouncerActionPlan: {
        assignment: nearestDueAssignment,
        summary: payload.summary ?? 'Choose one action and I will help you execute it.',
        actions: payload.actions,
        generatedAtISO: new Date().toISOString(),
      },
    })
  } catch {
    await setState({ bouncerActionPlan: null })
  }
}

const focusToRules = (focusSession: FocusSession): chrome.declarativeNetRequest.Rule[] => {
  if (!focusSession.active) {
    return []
  }

  return focusSession.blacklistDomains.map((domain, index) => {
    const cleanDomain = normalizeDomain(domain)
    const encoded = encodeURIComponent(cleanDomain)
    return {
      id: BLOCK_RULE_BASE + index,
      priority: 1,
      action: {
        type: 'redirect',
        redirect: {
          regexSubstitution: `${chrome.runtime.getURL('bouncer.html')}?target=${encoded}`,
        },
      },
      condition: {
        regexFilter: `^https?://([^/]+\\.)?${cleanDomain.replace(/\./g, '\\.')}/?.*`,
        resourceTypes: ['main_frame'],
      },
    }
  })
}

const applyFocusRules = async (focusSession: FocusSession) => {
  const existing = await chrome.declarativeNetRequest.getDynamicRules()
  const toRemove = existing
    .filter((rule) => rule.id >= BLOCK_RULE_BASE && rule.id < ALLOW_RULE_BASE)
    .map((rule) => rule.id)

  await chrome.declarativeNetRequest.updateDynamicRules({
    removeRuleIds: toRemove,
    addRules: focusToRules(focusSession),
  })
}

const getAllowRecords = async (): Promise<AllowRecord> => {
  const result = await chrome.storage.local.get('temporaryAllows')
  return (result.temporaryAllows ?? {}) as AllowRecord
}

const setAllowRecords = async (records: AllowRecord) => {
  await chrome.storage.local.set({ temporaryAllows: records })
}

const clearAllTempAllows = async () => {
  const existing = await chrome.declarativeNetRequest.getDynamicRules()
  const allowRuleIds = existing
    .filter((rule) => rule.id >= ALLOW_RULE_BASE && rule.id < ALLOW_RULE_BASE + 5000)
    .map((rule) => rule.id)

  if (allowRuleIds.length > 0) {
    await chrome.declarativeNetRequest.updateDynamicRules({
      removeRuleIds: allowRuleIds,
    })
  }

  const alarms = await chrome.alarms.getAll()
  await Promise.all(
    alarms
      .filter((alarm) => alarm.name.startsWith(ALARM_PREFIX))
      .map((alarm) => chrome.alarms.clear(alarm.name)),
  )

  await setAllowRecords({})
  await setSanitizerRecords({})
}

const applyTempAllow = async (domain: string, minutes = 5) => {
  const cleanDomain = normalizeDomain(domain)
  const hostRuleId = ALLOW_RULE_BASE + Math.abs(hash(cleanDomain) % 5000)

  await chrome.declarativeNetRequest.updateDynamicRules({
    removeRuleIds: [hostRuleId],
    addRules: [
      {
        id: hostRuleId,
        priority: 10,
        action: { type: 'allow' },
        condition: {
          requestDomains: [cleanDomain],
          resourceTypes: ['main_frame'],
        },
      },
    ],
  })

  const records = await getAllowRecords()
  const expiresAt = nowPlusMinutes(minutes)
  records[cleanDomain] = expiresAt
  await setAllowRecords(records)

  if (isYouTubeDomain(cleanDomain)) {
    const sanitizerRecords = await getSanitizerRecords()
    sanitizerRecords.youtube = expiresAt
    await setSanitizerRecords(sanitizerRecords)
  }

  await chrome.alarms.create(`${ALARM_PREFIX}${cleanDomain}`, {
    when: expiresAt,
  })
}

const removeTempAllow = async (domain: string) => {
  const cleanDomain = normalizeDomain(domain)
  const hostRuleId = ALLOW_RULE_BASE + Math.abs(hash(cleanDomain) % 5000)

  await chrome.declarativeNetRequest.updateDynamicRules({
    removeRuleIds: [hostRuleId],
  })

  const records = await getAllowRecords()
  delete records[cleanDomain]
  await setAllowRecords(records)

  if (isYouTubeDomain(cleanDomain)) {
    const sanitizerRecords = await getSanitizerRecords()
    delete sanitizerRecords.youtube
    await setSanitizerRecords(sanitizerRecords)
  }
}

chrome.runtime.onInstalled.addListener(async () => {
  const state = await getState()
  await clearAllTempAllows()
  await applyFocusRules(state.focusSession)
})

chrome.runtime.onStartup.addListener(async () => {
  await clearAllTempAllows()
})

chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (!alarm.name.startsWith(ALARM_PREFIX)) {
    return
  }

  const domain = alarm.name.replace(ALARM_PREFIX, '')
  await removeTempAllow(domain)
})

chrome.runtime.onMessage.addListener((message: ExtensionMessage, _sender, sendResponse) => {
  void (async () => {
    try {
      if (message.type === 'START_FOCUS') {
        await clearAllTempAllows()

        const focusSession: FocusSession = {
          active: true,
          selectedAssignments: message.payload.selectedAssignments,
          blacklistDomains: message.payload.blacklistDomains.map(normalizeDomain),
          startedAtISO: new Date().toISOString(),
        }
        await setFocusSession(focusSession)
        await applyFocusRules(focusSession)
        sendResponse({ ok: true, focusSession } satisfies ExtensionResponse)

        void precomputeBouncerPlan(message.payload.selectedAssignments)
        return
      }

      if (message.type === 'STOP_FOCUS') {
        await clearAllTempAllows()

        const focusSession: FocusSession = {
          active: false,
          selectedAssignments: [],
          blacklistDomains: [],
        }
        await setFocusSession(focusSession)
        await setState({ bouncerActionPlan: null })
        await applyFocusRules(focusSession)
        sendResponse({ ok: true, focusSession } satisfies ExtensionResponse)
        return
      }

      if (message.type === 'GET_FOCUS_STATE') {
        const state = await getState()
        sendResponse({ ok: true, focusSession: state.focusSession } satisfies ExtensionResponse)
        return
      }

      if (message.type === 'REQUEST_TEMP_ACCESS') {
        await applyTempAllow(message.payload.domain, message.payload.minutes ?? 5)
        sendResponse({ ok: true } satisfies ExtensionResponse)
        return
      }

      if (message.type === 'GET_SANITIZER_STATE') {
        const sanitizeEnabled = await hasActiveYouTubeSanitizer(message.payload.domain)
        sendResponse({ ok: true, sanitizeEnabled } satisfies ExtensionResponse)
        return
      }

      sendResponse({ ok: false, error: 'Unknown message type' } satisfies ExtensionResponse)
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error'
      sendResponse({ ok: false, error: message } satisfies ExtensionResponse)
    }
  })()

  return true
})

function hash(value: string) {
  let result = 0
  for (let index = 0; index < value.length; index += 1) {
    result = (result << 5) - result + value.charCodeAt(index)
    result |= 0
  }
  return result
}
