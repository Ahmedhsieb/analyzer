import type { GraphData, FlowStep } from '../types/graph'

// ── Mermaid from full graph data ──────────────────────────────────────────────

/**
 * Convert the current tab's graph (nodes + edges) into Mermaid flowchart syntax.
 * Includes full FQCN labels, node type annotations, and all lifecycle edges.
 */
export function graphToMermaid(data: GraphData, tabLabel: string): string {
  const lines: string[] = [
    `%% Laravel Lifecycle — ${tabLabel}`,
    `%% Nodes: ${data.nodes.length}  Edges: ${data.edges.length}`,
    `flowchart TD`,
    ``,
  ]

  // Node ID → safe Mermaid id
  const idMap = new Map<string, string>()
  const used = new Set<string>()
  const safeId = (raw: string): string => {
    if (idMap.has(raw)) return idMap.get(raw)!
    let base = raw
      .replace(/[^a-zA-Z0-9_]/g, '_')
      .replace(/^_+/, '')
      .replace(/_+$/, '')
      .substring(0, 40)
    if (!base) base = 'node'
    let id = base
    let n = 0
    while (used.has(id)) id = `${base}_${++n}`
    used.add(id)
    idMap.set(raw, id)
    return id
  }

  // Group nodes by type for section comments
  const byType = new Map<string, typeof data.nodes>()
  for (const node of data.nodes) {
    if (!byType.has(node.type)) byType.set(node.type, [])
    byType.get(node.type)!.push(node)
  }

  const TYPE_ORDER = ['route', 'middleware', 'controller', 'action', 'service', 'repository', 'model', 'job', 'event']
  const allTypes = [...new Set([...TYPE_ORDER, ...byType.keys()])]

  for (const type of allTypes) {
    const nodes = byType.get(type)
    if (!nodes || nodes.length === 0) continue
    lines.push(`  %% ${type.toUpperCase()}`)
    for (const node of nodes) {
      const id = safeId(node.id)
      const label = escapeLabel(buildNodeLabel(node))
      const [open, close] = nodeShape(node.type)
      lines.push(`  ${id}${open}"${label}"${close}`)
    }
    lines.push(``)
  }

  lines.push(`  %% EDGES`)
  for (const edge of data.edges) {
    const src = safeId(edge.source)
    const tgt = safeId(edge.target)
    const lbl = edge.label ? `|"${escapeLabel(edge.label)}"| ` : ''
    lines.push(`  ${src} -->${lbl}${tgt}`)
  }

  lines.push(``)
  lines.push(`  %% STYLES`)
  lines.push(`  classDef cls_route    fill:#2e7d32,stroke:#4CAF50,color:#fff`)
  lines.push(`  classDef cls_middleware fill:#e65100,stroke:#FF9800,color:#fff`)
  lines.push(`  classDef cls_controller fill:#1565c0,stroke:#2196F3,color:#fff`)
  lines.push(`  classDef cls_action   fill:#0277bd,stroke:#03A9F4,color:#fff`)
  lines.push(`  classDef cls_service  fill:#6a1b9a,stroke:#9C27B0,color:#fff`)
  lines.push(`  classDef cls_model    fill:#b71c1c,stroke:#F44336,color:#fff`)
  lines.push(`  classDef cls_job      fill:#37474f,stroke:#607D8B,color:#fff`)
  lines.push(`  classDef cls_event    fill:#f57f17,stroke:#FFD600,color:#000`)
  lines.push(``)

  // Apply class annotations
  for (const type of allTypes) {
    const nodes = byType.get(type)
    if (!nodes || nodes.length === 0) continue
    const ids = nodes.map(n => safeId(n.id)).join(',')
    lines.push(`  class ${ids} cls_${type}`)
  }

  return lines.join('\n')
}

// ── Mermaid from FlowStep[] ───────────────────────────────────────────────────

/**
 * Convert a method's FlowStep[] into Mermaid flowchart syntax.
 */
export function flowStepsToMermaid(steps: FlowStep[], methodLabel: string): string {
  const lines: string[] = [
    `%% Method Flow — ${methodLabel}`,
    `flowchart TD`,
  ]

  let counter = 0
  const nextId = () => `s${counter++}`

  const entryId = nextId()
  lines.push(`  ${entryId}([" 🚀 ${escapeLabel(methodLabel)} "])`)

  const processSteps = (stepsArr: FlowStep[], parentId: string): string => {
    let prevId = parentId
    for (const step of stepsArr) {
      const id = nextId()

      if (step.type === 'if') {
        const [open, close] = ['{', '}']
        lines.push(`  ${id}${open}"${escapeLabel(step.label)}"${close}`)
        lines.push(`  ${prevId} --> ${id}`)
        lines.push(`  class ${id} cls_if`)

        if (step.then && step.then.length > 0) {
          const thenFirst = nextId()
          const thenLabel = step.then[0]
          lines.push(`  ${thenFirst}${stepShape(thenLabel.type)}"${escapeLabel(thenLabel.label)}"${stepShapeClose(thenLabel.type)}`)
          lines.push(`  ${id} -->|"yes"| ${thenFirst}`)
          lines.push(`  class ${thenFirst} cls_${thenLabel.type}`)
          processSteps(step.then.slice(1), thenFirst)
        }
        if (step.else && step.else.length > 0) {
          const elseFirst = nextId()
          const elseLabel = step.else[0]
          lines.push(`  ${elseFirst}${stepShape(elseLabel.type)}"${escapeLabel(elseLabel.label)}"${stepShapeClose(elseLabel.type)}`)
          lines.push(`  ${id} -->|"no"| ${elseFirst}`)
          lines.push(`  class ${elseFirst} cls_${elseLabel.type}`)
          processSteps(step.else.slice(1), elseFirst)
        }

        prevId = id
      } else if (step.type === 'loop') {
        const n1Label = step.n1 ? ' ⚠️ N+1 ' : ''
        lines.push(`  ${id}[/"${n1Label}${escapeLabel(step.label)}"/]`)
        lines.push(`  ${prevId} --> ${id}`)
        lines.push(`  class ${id} ${step.n1 ? 'cls_n1' : 'cls_loop'}`)
        if (step.body && step.body.length > 0) {
          processSteps(step.body, id)
        }
        prevId = id
      } else {
        const [open, close] = [stepShape(step.type), stepShapeClose(step.type)]
        const icon = stepIcon(step.type)
        const n1Label = step.n1 ? ' ⚠️ N+1 ' : ''
        lines.push(`  ${id}${open}"${n1Label}${icon}${escapeLabel(step.label)}"${close}`)
        lines.push(`  ${prevId} --> ${id}`)
        lines.push(`  class ${id} ${step.n1 ? 'cls_n1' : `cls_${step.type}`}`)
        prevId = id
      }
    }
    return prevId
  }

  processSteps(steps, entryId)

  lines.push(``)
  lines.push(`  %% STYLES`)
  lines.push(`  classDef cls_call     fill:#0d47a1,stroke:#2196F3,color:#fff`)
  lines.push(`  classDef cls_assign   fill:#212121,stroke:#616161,color:#ccc`)
  lines.push(`  classDef cls_return   fill:#1b5e20,stroke:#4CAF50,color:#fff`)
  lines.push(`  classDef cls_throw    fill:#b71c1c,stroke:#F44336,color:#fff`)
  lines.push(`  classDef cls_if       fill:#f9a825,stroke:#fbc02d,color:#000`)
  lines.push(`  classDef cls_loop     fill:#6a1b9a,stroke:#9c27b0,color:#fff`)
  lines.push(`  classDef cls_n1       fill:#b71c1c,stroke:#ff5252,color:#fff`)
  lines.push(`  classDef cls_dispatch fill:#bf360c,stroke:#FF5722,color:#fff`)
  lines.push(`  classDef cls_event    fill:#0e47a1,stroke:#00BCD4,color:#fff`)

  return lines.join('\n')
}

// ── Download helpers ──────────────────────────────────────────────────────────

export function downloadText(text: string, filename: string): void {
  const blob = new Blob([text], { type: 'text/plain' })
  downloadBlob(blob, filename)
}

export function downloadPng(dataUrl: string, filename: string): void {
  const a = document.createElement('a')
  a.href = dataUrl
  a.download = filename
  a.click()
}

export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 2000)
}

/**
 * Convert a DOM element to a PNG data URL using Canvas.
 * Works on the sidebar flowchart div.
 */
export async function domToPng(element: HTMLElement, bgColor = '#0d0f14'): Promise<string> {
  const { default: html2canvas } = await import('html2canvas')
  const canvas = await html2canvas(element, {
    backgroundColor: bgColor,
    scale: 2,
    useCORS: true,
    logging: false,
  })
  return canvas.toDataURL('image/png')
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function buildNodeLabel(node: { type: string; label: string; data: Record<string, unknown> }): string {
  const parts = [node.label]
  if (node.data?.fqcn && node.data.fqcn !== node.label) {
    parts.push(String(node.data.fqcn))
  }
  if (node.data?.method) parts.push(`@${node.data.method}`)
  if (node.data?.file) {
    const file = String(node.data.file)
    const short = file.split('/').slice(-2).join('/')
    parts.push(short)
  }
  return parts.join('\n')
}

function nodeShape(type: string): [string, string] {
  switch (type) {
    case 'route':      return ['([', '])']
    case 'model':      return ['[(', ')]']
    case 'middleware': return ['{{', '}}']
    case 'job':        return ['[[', ']]']
    case 'event':      return ['((', '))']
    default:           return ['[', ']']
  }
}

function stepShape(type: string): string {
  switch (type) {
    case 'return':   return '(['
    case 'throw':    return '(['
    case 'dispatch': return '[['
    case 'event':    return '(('
    default:         return '['
  }
}

function stepShapeClose(type: string): string {
  switch (type) {
    case 'return':   return '])'
    case 'throw':    return '])'
    case 'dispatch': return ']]'
    case 'event':    return '))'
    default:         return ']'
  }
}

function stepIcon(type: string): string {
  switch (type) {
    case 'call':     return '→ '
    case 'assign':   return '= '
    case 'return':   return '◀ '
    case 'throw':    return '⚠ '
    case 'dispatch': return '⚡ '
    case 'event':    return '📡 '
    default:         return ''
  }
}

function escapeLabel(text: string): string {
  return text
    .replace(/"/g, "'")
    .replace(/\n/g, '\\n')
    .replace(/[<>]/g, (c) => (c === '<' ? '&lt;' : '&gt;'))
}
