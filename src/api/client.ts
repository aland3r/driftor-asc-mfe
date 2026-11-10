/**
 * Único ponto de saída do front: tudo passa pelo API Management até o BFF.
 * O front nunca fala direto com os microsserviços.
 */
import type { Activity, AggregatedData, Analysis, AnalysisSummary, Overview, Process, ProcessSummary, Trace } from './types'

const BASE = (import.meta.env.VITE_API_URL ?? 'http://localhost:8080').replace(/\/$/, '')
const KEY = import.meta.env.VITE_API_KEY ?? ''

export class ApiError extends Error {
  constructor(message: string, readonly status: number) {
    super(message)
  }
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers)
  if (KEY) headers.set('Ocp-Apim-Subscription-Key', KEY)
  if (init.body && !(init.body instanceof FormData)) headers.set('Content-Type', 'application/json')
  let res: Response
  try {
    res = await fetch(`${BASE}${path}`, { ...init, headers })
  } catch {
    throw new ApiError('Não foi possível falar com o servidor. Verifique a conexão e tente de novo.', 0)
  }
  if (res.status === 204) return undefined as T
  const type = res.headers.get('content-type') ?? ''
  const body = type.includes('json') ? await res.json().catch(() => null) : await res.text()
  if (!res.ok) {
    const detail = typeof body === 'object' && body ? (body as any).detail ?? (body as any).message : null
    throw new ApiError(typeof detail === 'string' ? detail : messageFor(res.status), res.status)
  }
  return body as T
}

function messageFor(status: number) {
  if (status === 401 || status === 403) return 'Acesso negado pelo gateway.'
  if (status === 429) return 'Muitas requisições. Aguarde alguns segundos.'
  if (status === 404) return 'Não encontrado.'
  if (status >= 500) return 'Um serviço não respondeu. Tente de novo em instantes.'
  return 'Não foi possível concluir a ação.'
}

export const api = {
  overview: () => request<Overview>('/overview'),
  aggregated: (analysisId: string) => request<AggregatedData>(`/aggregated-data?analysisId=${encodeURIComponent(analysisId)}`),
  documentation: () => request<string>('/documentation/arc42'),

  listProcesses: () => request<ProcessSummary[]>('/processes'),
  getProcess: (id: string) => request<Process>(`/processes/${id}`),
  uploadProcess: (name: string, file: File) => {
    const form = new FormData()
    form.append('name', name)
    form.append('file', file)
    return request<Process>('/processes', { method: 'POST', body: form })
  },
  mapOperations: (id: string, operations: { rawLabel: string; activity: string }[]) =>
    request<Process>(`/processes/${id}/operations`, { method: 'PUT', body: JSON.stringify({ operations }) }),
  renameProcess: (id: string, name: string) => request<Process>(`/processes/${id}`, { method: 'PATCH', body: JSON.stringify({ name }) }),
  deleteProcess: (id: string) => request<void>(`/processes/${id}`, { method: 'DELETE' }),
  traces: (id: string) => request<Trace[]>(`/processes/${id}/traces`),
  activities: () => request<Activity[]>('/activities'),

  listAnalyses: () => request<AnalysisSummary[]>('/analyses'),
  getAnalysis: (id: string) => request<Analysis>(`/analyses/${id}`),
  createAnalysis: (body: { processId: string; name?: string; delta: number; treatment: 'raw' | 'treated'; activity?: string | null }) =>
    request<AnalysisSummary>('/analyses', { method: 'POST', body: JSON.stringify(body) }),
  renameAnalysis: (id: string, name: string) => request<Analysis>(`/analyses/${id}`, { method: 'PATCH', body: JSON.stringify({ name }) }),
  deleteAnalysis: (id: string) => request<void>(`/analyses/${id}`, { method: 'DELETE' }),
}
