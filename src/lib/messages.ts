import type { Assignment, FocusSession } from '../types'

export type ExtensionMessage =
  | { type: 'START_FOCUS'; payload: { selectedAssignments: Assignment[]; blacklistDomains: string[] } }
  | { type: 'STOP_FOCUS' }
  | { type: 'GET_FOCUS_STATE' }
  | { type: 'REQUEST_TEMP_ACCESS'; payload: { domain: string; minutes?: number } }
  | { type: 'GET_SANITIZER_STATE'; payload: { domain: string } }

export type ExtensionResponse =
  | { ok: true; focusSession?: FocusSession; sanitizeEnabled?: boolean }
  | { ok: false; error: string }
