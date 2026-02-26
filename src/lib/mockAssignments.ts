import type { Assignment } from '../types'

const now = new Date()

const plusDays = (days: number) => {
  const date = new Date(now)
  date.setDate(now.getDate() + days)
  return date.toISOString()
}

export const mockAssignments: Assignment[] = [
  {
    id: 'a1',
    title: 'MBAI 448 Product Friction Draft',
    course: 'MBAI 448',
    dueAtISO: plusDays(1),
    status: 'pending',
  },
  {
    id: 'a2',
    title: 'MSAI 437 Research Checkpoint',
    course: 'MSAI 437',
    dueAtISO: plusDays(2),
    status: 'in_progress',
  },
  {
    id: 'a3',
    title: 'Behavioral Metrics Reflection',
    course: 'LEAD 505',
    dueAtISO: plusDays(3),
    status: 'pending',
  },
]
