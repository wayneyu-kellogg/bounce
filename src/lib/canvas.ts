import type { Assignment } from '../types'

const API_BASE = 'http://localhost:8787'

type CanvasDemoResponse = {
	ok: boolean
	assignments?: Assignment[]
	error?: string
}

export const fetchDemoCanvasAssignments = async (): Promise<Assignment[]> => {
	const response = await fetch(`${API_BASE}/api/canvas/demo-assignments`)
	const payload = (await response.json()) as CanvasDemoResponse

	if (!response.ok || !payload.ok) {
		throw new Error(payload.error ?? 'Failed to fetch demo Canvas assignments')
	}

	return payload.assignments ?? []
}

