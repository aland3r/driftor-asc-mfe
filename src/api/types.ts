export interface Operation {
  rawLabel: string
  occurrenceCount: number
  caseCount: number
  meanDurationSeconds: number
  suggestedActivity: string
  activity: string | null
}

export interface GraphNode {
  id: string
  label: string
  frequency: number
  caseFrequency: number
  startFrequency: number
  endFrequency: number
  maxRepetitions: number
  totalDurationSeconds: number
  meanDurationSeconds: number
  medianDurationSeconds: number
  minDurationSeconds: number
  maxDurationSeconds: number
  histogram: number[]
}

export interface GraphEdge { source: string; target: string; frequency: number }

export interface Variant { id: string; label: string; sequence: string[]; traceCount: number; share: number }

export interface ProcessSummary {
  id: string
  name: string
  fileName: string
  format: string
  status: 'vazio' | 'mapeando' | 'pronto'
  createdAt: string
  updatedAt: string
  startedAt: string | null
  endedAt: string | null
  traceCount: number
  eventCount: number
  activityCount: number
  variantCount: number
}

export interface Process extends ProcessSummary {
  operations: Operation[]
  variants: Variant[]
  graph: { nodes: GraphNode[]; edges: GraphEdge[] } | null
}

export interface Trace {
  index: number
  caseId: string
  variantId: string | null
  startedAt: string | null
  durationSeconds: number | null
  eventCount: number
  activities: string[]
}

export interface Activity { id: string; name: string; description?: string }

export interface Drift {
  position: number
  index: number
  anomalyStartIndex: number
  value: number
  width: number
  estimation: number
  meanBefore: number
  meanAfter: number
  changePercent: number
}

export interface Segment {
  id: string
  label: string
  startIndex: number
  endIndex: number
  traceCount: number
  mean: number
  outlierCount: number
  driftCount: number
}

export interface AnalysisSummary {
  id: string
  processId: string
  processName: string
  name: string
  delta: number
  treatment: 'raw' | 'treated'
  activity: string | null
  status: 'em_andamento' | 'concluida' | 'falhou'
  error: string | null
  observationCount: number
  smoothingWindow: number | null
  outlierIndices: number[]
  driftCount: number
  createdAt: string
  updatedAt: string
  completedAt: string | null
}

export interface Analysis extends AnalysisSummary {
  drifts: Drift[]
  points: { index: number; caseId: string; value: number }[]
  segments: Segment[]
}

export interface SourceStatus { source: 'ipdd' | 'pmining' | 'fnAdwin'; ok: boolean; ms: number; error?: string }

export interface AggregatedData {
  analysisId: string
  analysis: Analysis | null
  process: Process | null
  treatedSeries: { smoothingWindow: number; processedValues: number[]; outlierIndices: number[] } | null
  sources: SourceStatus[]
  generatedAt: string
}

export interface Overview {
  processes: ProcessSummary[] | null
  analyses: AnalysisSummary[] | null
  functionOnline: boolean | null
  sources: SourceStatus[]
}
