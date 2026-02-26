export type Assignment = {
  id: string
  title: string
  course: string
  dueAtISO: string
  status: 'pending' | 'in_progress'
}

export type FocusSession = {
  active: boolean
  selectedAssignments: Assignment[]
  blacklistDomains: string[]
  startedAtISO?: string
}

export type BouncerDecision = {
  grant_access: boolean
  reason?: string
  response?: string
}

export type BounceStorage = {
  mockMode: boolean
  assignments: Assignment[]
  selectedAssignmentIds: string[]
  blacklistDomains: string[]
  focusSession: FocusSession
}
