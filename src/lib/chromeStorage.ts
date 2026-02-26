import { mockAssignments } from './mockAssignments'
import type { BounceStorage } from '../types'

const STORAGE_KEY = 'bounce_state'

const defaultState: BounceStorage = {
  mockMode: true,
  assignments: mockAssignments,
  selectedAssignmentIds: [],
  blacklistDomains: ['youtube.com', 'tiktok.com', 'instagram.com'],
  focusSession: {
    active: false,
    selectedAssignments: [],
    blacklistDomains: [],
  },
}

export const getState = async (): Promise<BounceStorage> => {
  const result = await chrome.storage.local.get(STORAGE_KEY)
  return {
    ...defaultState,
    ...(result[STORAGE_KEY] ?? {}),
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
