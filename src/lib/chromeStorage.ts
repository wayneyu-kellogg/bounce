import type { BounceStorage } from '../types'

const STORAGE_KEY = 'bounce_state'
const DEFAULT_PRESET_PERSONA_ID = 'strict' as const

const defaultState: BounceStorage = {
  mockMode: false,
  assignments: [],
  selectedAssignmentIds: [],
  blacklistDomains: ['youtube.com', 'tiktok.com', 'instagram.com'],
  canvasDemoConnected: false,
  agentPersona: {
    mode: 'preset',
    presetId: DEFAULT_PRESET_PERSONA_ID,
  },
  bouncerActionPlan: null,
  focusSession: {
    active: false,
    selectedAssignments: [],
    blacklistDomains: [],
  },
}

export const getState = async (): Promise<BounceStorage> => {
  const result = await chrome.storage.local.get(STORAGE_KEY)
  const storedState = (result[STORAGE_KEY] ?? {}) as Partial<BounceStorage>

  const nextPersona = storedState.agentPersona
  const normalizedPersona =
    nextPersona?.mode === 'custom'
      ? { mode: 'custom' as const, customPrompt: String(nextPersona.customPrompt ?? '') }
      : {
          mode: 'preset' as const,
          presetId:
            nextPersona?.mode === 'preset' &&
            (nextPersona.presetId === 'strict' || nextPersona.presetId === 'supportive' || nextPersona.presetId === 'socratic')
              ? nextPersona.presetId
                : DEFAULT_PRESET_PERSONA_ID,
        }

  return {
    ...defaultState,
    ...storedState,
    agentPersona: normalizedPersona,
  } as BounceStorage
}

export const setState = async (partial: Partial<BounceStorage>) => {
  const current = await getState()
  const next = {
    ...current,
    ...partial,
  }
  await chrome.storage.local.set({ [STORAGE_KEY]: next })
  return next
}

export const setFocusSession = async (focusSession: BounceStorage['focusSession']) => {
  return setState({ focusSession })
}
