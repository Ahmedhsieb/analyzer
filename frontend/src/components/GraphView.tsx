import { useEffect, useRef, useMemo, useCallback } from 'react' // useCallback used by spawnPacket/spawnChainFromNode
import CytoscapeComponent from 'react-cytoscapejs'
import type { Core, ElementDefinition, NodeSingular, EdgeSingular, Css } from 'cytoscape'
import cytoscape from 'cytoscape'
// @ts-expect-error: Missing type definitions for cytoscape-dagre
import dagre from 'cytoscape-dagre'
// @ts-expect-error: Missing type definitions for cytoscape-cose-bilkent
import coseBilkent from 'cytoscape-cose-bilkent'

cytoscape.use(dagre)
cytoscape.use(coseBilkent)

import { LARGE_GRAPH_THRESHOLD, PACKET_ANIMATION_THRESHOLD, ACCENT_COLORS, BG_COLORS, HIGHLIGHT_COLOR } from '../utils/graphConstants'

// ── Packet animation types ────────────────────────────────────────────────────

interface Packet {
  id: string
  // Model-space coordinates (Cytoscape units, converted to screen each frame)
  srcMX: number; srcMY: number
  tgtMX: number; tgtMY: number
  // Optional bezier control points (model space)
  cp1?: { x: number; y: number }
  cp2?: { x: number; y: number }
  progress: number      // 0 → 1
  speed: number         // progress units per ms
  color: string
  pulse: number         // 0→1 flash at destination when packet arrives
  sparkCooldown: number // ms until next spark spawn
  tgtNodeId: string     // cytoscape node id of the target node
  chained: boolean      // whether this packet should chain-fire on arrival
  arrived: boolean      // whether chain was already triggered
}

interface Spark {
  x: number; y: number     // screen coords
  vx: number; vy: number   // px per ms
  life: number             // 0..1
  decay: number            // life lost per ms
  size: number
  color: string
}

function hex2(n: number) {
  return Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, '0')
}

// Quadratic bezier
function qBez(t: number, p0: number, p1: number, p2: number) {
  const u = 1 - t
  return u * u * p0 + 2 * u * t * p1 + t * t * p2
}

// Cubic bezier
function cBez(t: number, p0: number, p1: number, p2: number, p3: number) {
  const u = 1 - t
  return u*u*u*p0 + 3*u*u*t*p1 + 3*u*t*t*p2 + t*t*t*p3
}

function modelToScreen(mx: number, my: number, pan: { x: number; y: number }, zoom: number) {
  return { x: mx * zoom + pan.x, y: my * zoom + pan.y }
}

function evalCurve(
  t: number,
  src: { x: number; y: number },
  tgt: { x: number; y: number },
  cp1?: { x: number; y: number },
  cp2?: { x: number; y: number },
) {
  if (cp1 && cp2) {
    return { x: cBez(t, src.x, cp1.x, cp2.x, tgt.x), y: cBez(t, src.y, cp1.y, cp2.y, tgt.y) }
  }
  if (cp1) {
    return { x: qBez(t, src.x, cp1.x, tgt.x), y: qBez(t, src.y, cp1.y, tgt.y) }
  }
  return { x: src.x + (tgt.x - src.x) * t, y: src.y + (tgt.y - src.y) * t }
}

// ── Cytoscape stylesheet ──────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function buildStylesheet(dark: boolean): any[] {
  const edgeLine = dark ? 'rgba(255,255,255, 0.07)' : 'rgba(0,0,0,0.1)'
  const edgeArrow = dark ? 'rgba(255,255,255, 0.12)' : 'rgba(0,0,0,0.15)'
  const edgeLabel = dark ? 'rgba(255,255,255, 0.4)' : 'rgba(0,0,0,0.5)'

  return [
    {
      selector: 'node',
      style: {
        label: (ele: NodeSingular) => {
          let prefix = ''
          if (ele.data('hasN1'))     prefix += '⚠️ '
          if (ele.data('fatMethod')) prefix += '🧱 '
          if (ele.data('fatClass'))  prefix += '🏗️ '

          const vis = ele.data('visibility')
          if (vis === 'private') prefix += '🔒 '
          if (vis === 'protected') prefix += '🛡️ '

          return prefix + ele.data('label')
        },
        'text-valign': 'center',
        'text-halign': 'center',
        'font-size': 11,
        'font-weight': 600,
        'font-family': 'ui-monospace, monospace',
        color: '#fff',
        'text-wrap': 'wrap',
        'text-max-width': '140px',
        width: 'label',
        height: 'label',
        padding: '10px 14px',
        shape: 'round-rectangle',
        'background-color': '#181c27',
        'border-width': 1.5,
        'border-color': 'rgba(255,255,255,0.1)',
        'corner-radius': '6px',
      } as Css.Node,
    },
    {
      selector: 'node[hasN1 = 1]',
      style: {
        'border-color': '#F44336',
        'border-width': 2,
        'shadow-blur': 12,
        'shadow-color': '#F44336',
        'shadow-opacity': 0.5,
      } as Css.Node,
    },
    ...Object.entries(ACCENT_COLORS).map(([type, color]) => ({
      selector: `node[type = "${type}"]`,
      style: {
        'border-color': color,
        'background-color': BG_COLORS[type] || '#181c27',
        color: color,
      } as Css.Node,
    })),
    { selector: 'node.dimmed', style: { opacity: 0.1, filter: 'grayscale(100%)' } },
    { selector: 'node.hidden', style: { display: 'none' } },
    {
      selector: 'node:selected',
      style: {
        'border-width': 2.5,
        'border-color': (ele: NodeSingular) => ACCENT_COLORS[ele.data('type')] || '#fff',
        'shadow-blur': 15,
        'shadow-color': (ele: NodeSingular) => ACCENT_COLORS[ele.data('type')] || '#fff',
        'shadow-opacity': 0.8,
        'background-color': (ele: NodeSingular) => {
          const type = ele.data('type')
          return BG_COLORS[type] ? BG_COLORS[type] : '#181c27'
        },
        'overlay-color': '#fff',
        'overlay-padding': 4,
        'overlay-opacity': 0.05,
      } as Css.Node,
    },
    {
      selector: 'edge',
      style: {
        width: 1,
        'line-color': edgeLine,
        'target-arrow-color': edgeArrow,
        'target-arrow-shape': 'triangle',
        'arrow-scale': 0.8,
        'curve-style': 'bezier',
        label: 'data(label)',
        'font-size': 9,
        'font-family': 'ui-monospace, monospace',
        color: edgeLabel,
        'text-rotation': 'autorotate',
        'text-margin-y': -10,
        'text-opacity': 1,
        'text-background-color': dark ? '#111218' : '#fff',
        'text-background-opacity': 1,
        'text-background-padding': '3px',
        'text-background-shape': 'roundrectangle',
      } as Css.Edge,
    },
    {
      selector: 'edge.highlighted',
      style: {
        width: 1.5,
        'line-color': HIGHLIGHT_COLOR,
        'target-arrow-color': HIGHLIGHT_COLOR,
        'text-opacity': 1,
        color: HIGHLIGHT_COLOR,
        'z-index': 999,
      } as Css.Edge,
    },
    { selector: 'edge.dimmed', style: { opacity: 0.02 } },
    { selector: 'edge.hidden', style: { display: 'none' } },
  ]
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function pickLayout(name: string, nodeCount: number, rankDir: 'LR' | 'TB'): any {
  const large = nodeCount > LARGE_GRAPH_THRESHOLD

  if (name === 'dagre') {
    if (large) {
      return { name: 'breadthfirst', directed: true, spacingFactor: 1.4, padding: 40, animate: false }
    }
    return { name: 'dagre', rankDir, nodeSep: rankDir === 'TB' ? 60 : 40, rankSep: 80, padding: 40, animate: false }
  }
  if (name === 'cose-bilkent') {
    return { name: 'cose-bilkent', animate: false, randomize: false, padding: 40, nodeDimensionsIncludeLabels: true }
  }
  if (name === 'breadthfirst') {
    return { name: 'breadthfirst', directed: true, spacingFactor: 1.4, padding: 40, animate: false }
  }
  return { name, padding: 40, animate: false }
}

// ── Props ─────────────────────────────────────────────────────────────────────

interface Props {
  elements: ElementDefinition[]
  layout: string
  rankDir: 'LR' | 'TB'
  searchQuery: string
  visibleTypes: Set<string>
  theme: 'dark' | 'light'
  onNodeSelect: (id: string | null) => void
  cyRef: React.MutableRefObject<Core | null>
}

// ── Component ─────────────────────────────────────────────────────────────────

export function GraphView({ elements, layout, rankDir, searchQuery, visibleTypes, theme, onNodeSelect, cyRef }: Props) {
  const nodeCount = useMemo(() => elements.filter((e) => !e.data?.source).length, [elements])
  const stylesheet = useMemo(() => buildStylesheet(theme === 'dark'), [theme])
  const prevSearch = useRef(searchQuery)
  const layoutTimeout = useRef<number | null>(null)
  const searchTimeout = useRef<number | null>(null)
  const layoutConfig = useMemo(() => pickLayout(layout, nodeCount, rankDir), [layout, nodeCount, rankDir])

  // Canvas overlay
  const containerRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const packetsRef = useRef<Packet[]>([])
  const sparksRef = useRef<Spark[]>([])
  const lastFrameRef = useRef<number>(0)
  // Keep nodeCount accessible in stable callbacks (cy event handlers registered once)
  const nodeCountRef = useRef(nodeCount)
  useEffect(() => { nodeCountRef.current = nodeCount }, [nodeCount])
  // Cooldown map: nodeId → timestamp of last fire (prevents infinite loop in cyclic graphs)
  const nodeLastFiredRef = useRef<Map<string, number>>(new Map())

  // ── Packet spawning ─────────────────────────────────────────────────────────

  const spawnPacket = useCallback((
    cy: Core,
    edgeId: string,
    color: string,
    delay = 0,
    chained = false,
  ) => {
    const edge = cy.getElementById(edgeId)
    if (!edge || !edge.isEdge()) return

    const src = edge.sourceEndpoint()
    const tgt = edge.targetEndpoint()
    const cps = edge.controlPoints() as { x: number; y: number }[] | undefined
    const tgtNodeId = edge.target().id()

    setTimeout(() => {
      const pkt: Packet = {
        id: `${edgeId}-${Date.now()}-${Math.random()}`,
        srcMX: src.x, srcMY: src.y,
        tgtMX: tgt.x, tgtMY: tgt.y,
        cp1: cps?.[0],
        cp2: cps?.[1],
        progress: 0,
        speed: 0.0009 + Math.random() * 0.0004,
        color,
        pulse: 0,
        sparkCooldown: 0,
        tgtNodeId,
        chained,
        arrived: false,
      }
      packetsRef.current.push(pkt)
    }, delay)
  }, [])

  // Fire packets on all outgoing edges of a node and mark them as chained
  const spawnChainFromNode = useCallback((cy: Core, nodeId: string, color: string, delay = 0) => {
    const COOLDOWN_MS = 1800
    const now = Date.now()
    const last = nodeLastFiredRef.current.get(nodeId) ?? 0
    if (now - last < COOLDOWN_MS) return
    nodeLastFiredRef.current.set(nodeId, now)

    const outEdges = cy.getElementById(nodeId).outgoers('edge:visible')
    outEdges.forEach((edge: EdgeSingular, i: number) => {
      spawnPacket(cy, edge.id(), color, delay + i * 60, true)
    })
  }, [spawnPacket])

  // ── Animation loop (single effect, hoisted function avoids self-reference lint error) ──

  useEffect(() => {
    let rafId: number

    // Using a named function declaration (hoisted) so it can reference itself without
    // triggering the "accessed before declaration" lint rule that fires on useCallback.
    function loop(now: number) {
      rafId = requestAnimationFrame(loop)

      const canvas = canvasRef.current
      const cy = cyRef.current
      if (!canvas || !cy) return

      const dt = Math.min(now - lastFrameRef.current, 50)
      lastFrameRef.current = now

      const ctx = canvas.getContext('2d')
      if (!ctx) return

      ctx.clearRect(0, 0, canvas.width, canvas.height)

      const pan = cy.pan()
      const zoom = cy.zoom()
      const z = Math.max(0.6, zoom)

      ctx.globalCompositeOperation = 'lighter'

      const alive: Packet[] = []

      for (const pkt of packetsRef.current) {
        if (pkt.progress < 1) {
          pkt.progress = Math.min(1, pkt.progress + pkt.speed * dt)
        }

        const srcS = modelToScreen(pkt.srcMX, pkt.srcMY, pan, zoom)
        const tgtS = modelToScreen(pkt.tgtMX, pkt.tgtMY, pan, zoom)
        const cp1S = pkt.cp1 ? modelToScreen(pkt.cp1.x, pkt.cp1.y, pan, zoom) : undefined
        const cp2S = pkt.cp2 ? modelToScreen(pkt.cp2.x, pkt.cp2.y, pan, zoom) : undefined

        const pos = evalCurve(pkt.progress, srcS, tgtS, cp1S, cp2S)

        // ── Comet tail ─────────────────────────────────────────────────────────
        const trailLength = 0.09
        const trailSteps = 18
        for (let i = trailSteps; i >= 1; i--) {
          const tTrail = pkt.progress - (i / trailSteps) * trailLength
          if (tTrail < 0) continue
          const tp = evalCurve(tTrail, srcS, tgtS, cp1S, cp2S)
          const k = 1 - i / trailSteps
          const alpha = k * k * 0.55
          const r = (0.8 + k * 2.6) * z
          ctx.beginPath()
          ctx.arc(tp.x, tp.y, r, 0, Math.PI * 2)
          ctx.fillStyle = pkt.color + hex2(alpha * 255)
          ctx.fill()
        }

        // ── Comet head ─────────────────────────────────────────────────────────
        ctx.save()
        ctx.shadowBlur = 24 * z
        ctx.shadowColor = pkt.color
        ctx.beginPath()
        ctx.arc(pos.x, pos.y, 5 * z, 0, Math.PI * 2)
        ctx.fillStyle = pkt.color + '66'
        ctx.fill()
        ctx.restore()

        const grad = ctx.createRadialGradient(pos.x, pos.y, 0, pos.x, pos.y, 8 * z)
        grad.addColorStop(0, '#ffffffee')
        grad.addColorStop(0.35, pkt.color + 'cc')
        grad.addColorStop(1, pkt.color + '00')
        ctx.fillStyle = grad
        ctx.beginPath()
        ctx.arc(pos.x, pos.y, 8 * z, 0, Math.PI * 2)
        ctx.fill()

        const flicker = 1 + 0.18 * Math.sin(now * 0.018 + pkt.progress * 12)
        ctx.beginPath()
        ctx.arc(pos.x, pos.y, 2.2 * z * flicker, 0, Math.PI * 2)
        ctx.fillStyle = '#ffffff'
        ctx.fill()

        // ── Spark emission ─────────────────────────────────────────────────────
        if (pkt.progress < 1) {
          pkt.sparkCooldown -= dt
          if (pkt.sparkCooldown <= 0) {
            pkt.sparkCooldown = 35 + Math.random() * 40
            const angle = Math.random() * Math.PI * 2
            const speed = 0.02 + Math.random() * 0.04
            sparksRef.current.push({
              x: pos.x, y: pos.y,
              vx: Math.cos(angle) * speed,
              vy: Math.sin(angle) * speed,
              life: 1,
              decay: 0.0028 + Math.random() * 0.0012,
              size: (0.8 + Math.random() * 1.4) * z,
              color: pkt.color,
            })
          }
        }

        // ── Arrival burst ──────────────────────────────────────────────────────
        if (pkt.progress >= 1) {
          if (!pkt.arrived) {
            pkt.arrived = true
            const count = 14
            for (let i = 0; i < count; i++) {
              const a = (i / count) * Math.PI * 2 + Math.random() * 0.3
              const s = 0.08 + Math.random() * 0.12
              sparksRef.current.push({
                x: tgtS.x, y: tgtS.y,
                vx: Math.cos(a) * s,
                vy: Math.sin(a) * s,
                life: 1,
                decay: 0.0018 + Math.random() * 0.0008,
                size: (1.2 + Math.random() * 1.6) * z,
                color: pkt.color,
              })
            }
            if (pkt.chained) {
              const tgtNode = cy.getElementById(pkt.tgtNodeId)
              const chainColor = ACCENT_COLORS[tgtNode.data('type')] || pkt.color
              spawnChainFromNode(cy, pkt.tgtNodeId, chainColor, 120)
            }
          }
          pkt.pulse = Math.min(1, pkt.pulse + 0.025)
          if (pkt.pulse < 1) {
            for (let r = 0; r < 3; r++) {
              const rp = pkt.pulse - r * 0.18
              if (rp <= 0 || rp >= 1) continue
              const ringR = (3 + rp * 38) * z
              const a = (1 - rp) * (1 - rp) * 220
              ctx.beginPath()
              ctx.arc(tgtS.x, tgtS.y, ringR, 0, Math.PI * 2)
              ctx.strokeStyle = pkt.color + hex2(a)
              ctx.lineWidth = 1.5 * z
              ctx.stroke()
            }
            const flashA = (1 - pkt.pulse) * (1 - pkt.pulse) * 255
            ctx.save()
            ctx.shadowBlur = 18 * z
            ctx.shadowColor = pkt.color
            ctx.beginPath()
            ctx.arc(tgtS.x, tgtS.y, 4 * z, 0, Math.PI * 2)
            ctx.fillStyle = '#ffffff' + hex2(flashA)
            ctx.fill()
            ctx.restore()
            alive.push(pkt)
          }
        } else {
          alive.push(pkt)
        }
      }

      // ── Sparks ─────────────────────────────────────────────────────────────
      const aliveSparks: Spark[] = []
      for (const sp of sparksRef.current) {
        sp.x += sp.vx * dt
        sp.y += sp.vy * dt
        sp.vx *= 0.985
        sp.vy *= 0.985
        sp.life -= sp.decay * dt
        if (sp.life <= 0) continue
        const r = Math.max(0.3, sp.size * sp.life)
        ctx.beginPath()
        ctx.arc(sp.x, sp.y, r, 0, Math.PI * 2)
        ctx.fillStyle = sp.color + hex2(sp.life * 220)
        ctx.fill()
        aliveSparks.push(sp)
      }
      sparksRef.current = aliveSparks

      ctx.globalCompositeOperation = 'source-over'
      packetsRef.current = alive
    }

    lastFrameRef.current = performance.now()
    rafId = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(rafId)
  }, [cyRef, spawnChainFromNode])

  // Clear packets whenever graph crosses the large threshold
  useEffect(() => {
    if (nodeCount > PACKET_ANIMATION_THRESHOLD) {
      packetsRef.current = []
      sparksRef.current = []
    }
  }, [nodeCount])

  // Auto-start chains — restarts whenever nodeCount changes so the large-graph guard is re-evaluated
  useEffect(() => {
    if (nodeCount > PACKET_ANIMATION_THRESHOLD) return
    let tick = 0
    const interval = setInterval(() => {
      const cy = cyRef.current
      if (!cy) return

      const roots = cy.nodes(':visible').filter((n) => n.incomers('edge:visible').length === 0).toArray()

      if (roots.length === 0) {
        const all = cy.nodes(':visible').toArray()
        if (all.length === 0) return
        const node = all[tick % all.length]
        spawnChainFromNode(cy, node.id(), ACCENT_COLORS[node.data('type')] || HIGHLIGHT_COLOR)
      } else {
        const node = roots[tick % roots.length]
        spawnChainFromNode(cy, node.id(), ACCENT_COLORS[node.data('type')] || HIGHLIGHT_COLOR)
      }

      tick++
    }, 1200)
    return () => clearInterval(interval)
  }, [nodeCount, cyRef, spawnChainFromNode])

  // Resize canvas to match container
  useEffect(() => {
    const container = containerRef.current
    const canvas = canvasRef.current
    if (!container || !canvas) return

    const observer = new ResizeObserver(() => {
      canvas.width = container.clientWidth
      canvas.height = container.clientHeight
    })
    observer.observe(container)
    canvas.width = container.clientWidth
    canvas.height = container.clientHeight
    return () => observer.disconnect()
  }, [])

  // ── Search dimming (debounced) ──────────────────────────────────────────────

  useEffect(() => {
    const cy = cyRef.current
    if (!cy || prevSearch.current === searchQuery) return
    prevSearch.current = searchQuery

    if (searchTimeout.current) clearTimeout(searchTimeout.current)

    searchTimeout.current = setTimeout(() => {
      cy.startBatch()
      if (!searchQuery) {
        cy.elements().removeClass('dimmed')
      } else {
        const q = searchQuery.toLowerCase()
        const matched = cy.nodes().filter((n) => n.data('label').toLowerCase().includes(q))
        cy.elements().addClass('dimmed')
        matched.removeClass('dimmed')
        matched.connectedEdges().removeClass('dimmed')
      }
      cy.endBatch()
    }, 150)

    return () => { if (searchTimeout.current) clearTimeout(searchTimeout.current) }
  }, [searchQuery, cyRef])

  // Clear ref on unmount
  useEffect(() => {
    return () => { cyRef.current = null }
  }, [cyRef])

  // Type visibility & layout re-run
  useEffect(() => {
    const cy = cyRef.current
    if (!cy) return

    cy.startBatch()
    cy.nodes().forEach((n) => {
      const type = n.data('type') as string
      if (visibleTypes.has(type)) n.removeClass('hidden')
      else n.addClass('hidden')
    })
    cy.edges().forEach((e) => {
      const srcVisible = visibleTypes.has(e.source().data('type'))
      const tgtVisible = visibleTypes.has(e.target().data('type'))
      if (srcVisible && tgtVisible) e.removeClass('hidden')
      else e.addClass('hidden')
    })
    cy.endBatch()

    if (layoutTimeout.current) clearTimeout(layoutTimeout.current)
    layoutTimeout.current = setTimeout(() => {
      const visibleNodes = cy.nodes(':visible')
      if (visibleNodes.length > 0) {
        cy.layout(pickLayout(layout, visibleNodes.length, rankDir)).run()
      }
    }, 200)

    return () => { if (layoutTimeout.current) clearTimeout(layoutTimeout.current) }
  }, [visibleTypes, layout, rankDir, cyRef])

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <div ref={containerRef} style={{ position: 'relative', width: '100%', height: '100%' }}>
      <CytoscapeComponent
        elements={elements}
        stylesheet={stylesheet}
        layout={layoutConfig}
        style={{ width: '100%', height: '100%' }}
        cy={(cy) => {
          if (cyRef.current === cy) return
          cyRef.current = cy

          cy.boxSelectionEnabled(false)

          // Node tap: highlight edges + start chain (only on small graphs)
          cy.on('tap', 'node', (evt) => {
            const node = evt.target
            cy.elements().removeClass('highlighted')
            node.connectedEdges().addClass('highlighted')
            onNodeSelect(node.id())

            if (nodeCountRef.current > PACKET_ANIMATION_THRESHOLD) return
            const nodeColor = ACCENT_COLORS[node.data('type')] || HIGHLIGHT_COLOR
            nodeLastFiredRef.current.delete(node.id())
            spawnChainFromNode(cy, node.id(), nodeColor)
          })

          // Edge tap: fire a chained packet (only on small graphs)
          cy.on('tap', 'edge', (evt) => {
            if (nodeCountRef.current > PACKET_ANIMATION_THRESHOLD) return
            const edge = evt.target
            const srcNode = edge.source()
            const color = ACCENT_COLORS[srcNode.data('type')] || HIGHLIGHT_COLOR
            spawnPacket(cy, edge.id(), color, 0, true)
          })

          cy.on('tap', (evt) => {
            if (evt.target === cy) {
              cy.elements().removeClass('highlighted')
              onNodeSelect(null)
            }
          })
        }}
      />

      {/* Canvas overlay for packet animations — pointer-events:none so clicks pass through */}
      <canvas
        ref={canvasRef}
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          pointerEvents: 'none',
        }}
      />
    </div>
  )
}
