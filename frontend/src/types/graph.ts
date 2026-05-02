export interface DbQuery {
  type: 'eloquent' | 'raw'
  model: string
  table: string
  operation: string
}

export interface FlowStep {
  type: 'call' | 'assign' | 'return' | 'throw' | 'if' | 'loop' | 'dispatch' | 'event'
  label: string
  then?: FlowStep[]
  else?: FlowStep[]
  body?: FlowStep[]
  n1?: boolean
}

export interface GraphMeta {
  project: string
  analyzedAt: string
  nodeCount: number
  edgeCount: number
}

export interface GraphNode {
  id: string
  type: 'route' | 'middleware' | 'controller' | 'action' | 'service' | 'model' | 'event' | 'job' | 'command' | 'channel' | 'schedule'
  label: string
  data: Record<string, unknown>
}

export interface GraphEdge {
  id: string
  source: string
  target: string
  label: string
  type: string
}

export interface GraphData {
  meta: GraphMeta
  nodes: GraphNode[]
  edges: GraphEdge[]
}

export interface MethodInfo {
  name: string
  flowSteps: FlowStep[]
  hasN1: boolean
}

export interface TabEntry {
  id: string
  label: string
  routeCount: number
  nodeCount: number
  edgeCount: number
  file: string
  routeFile?: string
  category?: string
}

export interface Manifest {
  project: string
  analyzedAt: string
  totalRoutes: number
  totalNodes: number
  totalEdges: number
  tabs: TabEntry[]
}
