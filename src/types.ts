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

export type BouncerActionItem = {
  id: string
  title: string
  description: string
  actionType: 'open_link' | 'create_google_doc'
  url?: string
}

export type BouncerActionsResponse = {
  ok: boolean
  summary?: string
  actions?: BouncerActionItem[]
  error?: string
}

export type BouncerActionPlan = {
  assignment: Assignment
  summary: string
  actions: BouncerActionItem[]
  generatedAtISO: string
}

export type BounceStorage = {
  mockMode: boolean
  assignments: Assignment[]
  selectedAssignmentIds: string[]
  blacklistDomains: string[]
  canvasDemoConnected: boolean
  bouncerActionPlan: BouncerActionPlan | null
  focusSession: FocusSession
}
