const toISOFromNow = (daysFromNow) => new Date(Date.now() + daysFromNow * 24 * 60 * 60 * 1000).toISOString()

export const mockCourses = [
  { id: 'course-mbai-448', name: 'MBAI 448', term: 'Spring 2026' },
  { id: 'course-msai-437', name: 'MSAI 437', term: 'Spring 2026' },
  { id: 'course-lead-505', name: 'LEAD 505', term: 'Spring 2026' },
]

export const mockAssignments = [
  {
    id: 'canvas-demo-1',
    courseId: 'course-mbai-448',
    course: 'MBAI 448',
    title: 'Design Critique Reflection',
    dueAtISO: toISOFromNow(1),
    status: 'pending',
    estimatedEffortMin: 120,
    rubricCriteria: ['argument clarity', 'user evidence', 'tradeoff analysis'],
    learningObjectives: ['synthesize user research', 'defend design choices'],
  },
  {
    id: 'canvas-demo-2',
    courseId: 'course-msai-437',
    course: 'MSAI 437',
    title: 'Model Evaluation Notebook',
    dueAtISO: toISOFromNow(2),
    status: 'in_progress',
    estimatedEffortMin: 180,
    rubricCriteria: ['metric justification', 'error analysis', 'clear visuals'],
    learningObjectives: ['compare model performance', 'explain failures'],
  },
  {
    id: 'canvas-demo-3',
    courseId: 'course-lead-505',
    course: 'LEAD 505',
    title: 'Leadership Habit Experiment',
    dueAtISO: toISOFromNow(3),
    status: 'pending',
    estimatedEffortMin: 90,
    rubricCriteria: ['reflection depth', 'habit design quality', 'evidence of iteration'],
    learningObjectives: ['build leadership routines', 'evaluate behavior change'],
  },
  {
    id: 'canvas-demo-4',
    courseId: 'course-msai-437',
    course: 'MSAI 437',
    title: 'Ablation Study Memo',
    dueAtISO: toISOFromNow(5),
    status: 'pending',
    estimatedEffortMin: 150,
    rubricCriteria: ['ablation design', 'result interpretation', 'concise writing'],
    learningObjectives: ['reason about causal contribution', 'communicate findings'],
  },
  {
    id: 'canvas-demo-5',
    courseId: 'course-mbai-448',
    course: 'MBAI 448',
    title: 'Prototype Usability Synthesis',
    dueAtISO: toISOFromNow(7),
    status: 'pending',
    estimatedEffortMin: 140,
    rubricCriteria: ['theme extraction', 'insight quality', 'design recommendations'],
    learningObjectives: ['interpret usability findings', 'prioritize improvements'],
  },
]

export const mockResources = [
  {
    id: 'res-1',
    assignmentId: 'canvas-demo-1',
    type: 'rubric',
    title: 'Design Critique Rubric',
    tags: ['rubric', 'design', 'argument', 'evidence'],
    content:
      'A strong critique presents a clear argument, references direct user evidence, and discusses tradeoffs. Include at least two design alternatives and explain why one was chosen.',
  },
  {
    id: 'res-2',
    assignmentId: 'canvas-demo-1',
    type: 'lecture_note',
    title: 'Lecture Notes: Framing Design Tradeoffs',
    tags: ['lecture', 'tradeoffs', 'design'],
    content:
      'When framing tradeoffs, compare user value, implementation effort, and risk. Use a concise matrix to justify your recommendation and mention assumptions explicitly.',
  },
  {
    id: 'res-3',
    assignmentId: 'canvas-demo-2',
    type: 'rubric',
    title: 'Notebook Evaluation Rubric',
    tags: ['metrics', 'error analysis', 'visualization'],
    content:
      'Your notebook should justify metric choice, include confusion analysis, and discuss failure clusters. Visualizations must support conclusions, not merely decorate output.',
  },
  {
    id: 'res-4',
    assignmentId: 'canvas-demo-2',
    type: 'reading',
    title: 'Guide: Practical Error Analysis',
    tags: ['error analysis', 'classification', 'model evaluation'],
    content:
      'Start with worst-performing segments. Categorize errors by data quality, ambiguity, and model blind spots. Propose one actionable mitigation for each cluster.',
  },
  {
    id: 'res-5',
    assignmentId: 'canvas-demo-3',
    type: 'example',
    title: 'Habit Experiment Reflection Example',
    tags: ['reflection', 'habit', 'leadership'],
    content:
      'A high-quality reflection states baseline behavior, intervention design, observed outcomes, and next iteration. Include at least one quantitative and one qualitative signal.',
  },
  {
    id: 'res-6',
    assignmentId: 'canvas-demo-4',
    type: 'reading',
    title: 'Ablation Study Checklist',
    tags: ['ablation', 'experimental design', 'memo'],
    content:
      'Define a clean baseline, vary one component at a time, and report confidence intervals where possible. Conclude with practical implications and known limitations.',
  },
  {
    id: 'res-7',
    assignmentId: 'canvas-demo-5',
    type: 'lecture_note',
    title: 'Synthesizing Usability Test Results',
    tags: ['usability', 'synthesis', 'themes'],
    content:
      'Cluster observations into themes by severity and frequency. Recommend changes tied to user impact, and differentiate quick wins versus structural improvements.',
  },
]

export const mockDomainCatalog = [
  { domain: 'youtube.com', category: 'high_distraction', baseRiskScore: 0.82, allowedPatterns: ['education', 'tutorial'] },
  { domain: 'reddit.com', category: 'high_distraction', baseRiskScore: 0.88, allowedPatterns: ['research thread'] },
  { domain: 'wikipedia.org', category: 'neutral', baseRiskScore: 0.35, allowedPatterns: ['reference'] },
  { domain: 'scholar.google.com', category: 'academic', baseRiskScore: 0.1, allowedPatterns: ['paper search'] },
]

export const mockUserProfile = {
  id: 'user-demo-1',
  preferredStudyStyle: 'structured-sprints',
  quietHours: ['20:00-23:00'],
  dailyGoalMin: 120,
  agentPersona: {
    mode: 'preset',
    presetId: 'strict',
  },
}

export const mockFocusSession = {
  active: true,
  startedAtISO: toISOFromNow(0),
  selectedAssignmentIds: ['canvas-demo-2', 'canvas-demo-1'],
  blacklistDomains: ['youtube.com', 'reddit.com', 'x.com'],
}

export const mockInterventions = [
  {
    id: 'iv-1',
    timestampISO: toISOFromNow(-1),
    targetDomain: 'youtube.com',
    rationaleText: 'Need a quick tutorial on confusion matrices for the notebook.',
    decision: 'granted',
    confidence: 0.73,
    reasonCode: 'assignment_relevance_medium',
  },
  {
    id: 'iv-2',
    timestampISO: toISOFromNow(-2),
    targetDomain: 'reddit.com',
    rationaleText: 'Just taking a short break before writing.',
    decision: 'denied',
    confidence: 0.84,
    reasonCode: 'low_assignment_relevance',
  },
]

export const mockOutcomes = [
  {
    interventionId: 'iv-1',
    allowedDurationUsedMin: 9,
    returnedToTaskWithinMin: 4,
    actionCompleted: true,
    userFeedback: 'helpful',
  },
  {
    interventionId: 'iv-2',
    allowedDurationUsedMin: 0,
    returnedToTaskWithinMin: 6,
    actionCompleted: true,
    userFeedback: 'neutral',
  },
]

const makeInterventionId = () =>
  `iv-${new Date().toISOString().replace(/[-:TZ.]/g, '').slice(0, 14)}-${Math.random().toString(36).slice(2, 7)}`

export const recordMockIntervention = ({
  targetDomain,
  rationaleText,
  decision,
  confidence,
  reasonCode,
  assignmentId,
  assignmentTitle,
  policyDecision,
  orchestrationMode,
}) => {
  const intervention = {
    id: makeInterventionId(),
    timestampISO: new Date().toISOString(),
    targetDomain: String(targetDomain ?? 'unknown-site.com').toLowerCase(),
    rationaleText: String(rationaleText ?? '').trim(),
    decision: decision === 'granted' ? 'granted' : 'denied',
    confidence: Number.isFinite(Number(confidence)) ? Number(confidence) : 0.5,
    reasonCode: String(reasonCode ?? 'unknown_reason'),
    assignmentId: assignmentId ? String(assignmentId) : undefined,
    assignmentTitle: assignmentTitle ? String(assignmentTitle) : undefined,
    policyDecision: policyDecision ? String(policyDecision) : undefined,
    orchestrationMode: orchestrationMode ? String(orchestrationMode) : undefined,
  }

  mockInterventions.unshift(intervention)
  if (mockInterventions.length > 500) {
    mockInterventions.splice(500)
  }

  return intervention
}

export const recordMockOutcome = ({
  interventionId,
  allowedDurationUsedMin,
  returnedToTaskWithinMin,
  actionCompleted,
  userFeedback,
  feedbackText,
}) => {
  const outcome = {
    interventionId: String(interventionId ?? ''),
    allowedDurationUsedMin:
      Number.isFinite(Number(allowedDurationUsedMin)) && Number(allowedDurationUsedMin) >= 0
        ? Number(allowedDurationUsedMin)
        : 0,
    returnedToTaskWithinMin:
      Number.isFinite(Number(returnedToTaskWithinMin)) && Number(returnedToTaskWithinMin) >= 0
        ? Number(returnedToTaskWithinMin)
        : undefined,
    actionCompleted: Boolean(actionCompleted),
    userFeedback: userFeedback === 'helpful' || userFeedback === 'not_helpful' || userFeedback === 'neutral'
      ? userFeedback
      : 'neutral',
    feedbackText: typeof feedbackText === 'string' ? feedbackText.trim().slice(0, 300) : undefined,
    recordedAtISO: new Date().toISOString(),
  }

  const existingIndex = mockOutcomes.findIndex((item) => item.interventionId === outcome.interventionId)
  if (existingIndex >= 0) {
    mockOutcomes[existingIndex] = {
      ...mockOutcomes[existingIndex],
      ...outcome,
    }
  } else {
    mockOutcomes.unshift(outcome)
  }

  if (mockOutcomes.length > 500) {
    mockOutcomes.splice(500)
  }

  return outcome
}

export const mockCanvasAssignmentsResponse = {
  assignments: mockAssignments.map((assignment) => ({
    id: assignment.id,
    title: assignment.title,
    course: assignment.course,
    dueAtISO: assignment.dueAtISO,
    status: assignment.status,
  })),
}

const tokenize = (text) =>
  String(text ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(Boolean)

const overlapScore = (tokenSet, text) => {
  const tokens = tokenize(text)
  let score = 0
  for (const token of tokens) {
    if (tokenSet.has(token)) {
      score += 1
    }
  }
  return score
}

export const retrieveMockContext = ({ assignmentId, targetDomain, query, topK = 3 }) => {
  const assignment = mockAssignments.find((item) => item.id === assignmentId)
  const queryTokens = new Set([
    ...tokenize(query),
    ...tokenize(assignment?.title),
    ...tokenize(assignment?.course),
    ...tokenize(targetDomain),
  ])

  const ranked = mockResources
    .map((resource) => {
      let score = 0
      if (assignment && resource.assignmentId === assignment.id) {
        score += 4
      }

      score += overlapScore(queryTokens, resource.title)
      score += overlapScore(queryTokens, resource.content)

      for (const tag of resource.tags) {
        if (queryTokens.has(String(tag).toLowerCase())) {
          score += 2
        }
      }

      return {
        ...resource,
        score,
        snippet: resource.content.slice(0, 220),
      }
    })
    .filter((item) => item.score > 0)
    .sort((left, right) => right.score - left.score)
    .slice(0, Math.max(1, Math.min(10, Number(topK) || 3)))

  return {
    assignment,
    query,
    targetDomain,
    retrievedAtISO: new Date().toISOString(),
    evidence: ranked,
  }
}
