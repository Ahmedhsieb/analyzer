import { useState, useRef, useEffect, useMemo } from 'react'
import type { Core } from 'cytoscape'
import { LARGE_GRAPH_THRESHOLD } from '../utils/graphConstants'
import { ExportModal } from './ExportModal'
import { graphToMermaid, downloadPng } from '../utils/exportUtils'
import type { GraphData } from '../types/graph'

interface Props {
  layout: string
  nodeCount: number
  edgeCount: number
  visibleCount: number
  activeTabLabel: string
  graphData: GraphData | null
  analyzedAt?: string
  theme: 'dark' | 'light'
  onLayoutChange: (layout: string) => void
  rankDir: 'LR' | 'TB'
  onRankDirChange: (dir: 'LR' | 'TB') => void
  onSearch: (query: string) => void
  onToggleTheme: () => void
  cyRef: React.MutableRefObject<Core | null>
}

function formatAge(ms: number): string {
  const secs = Math.floor(ms / 1000)
  if (secs < 60) return `${secs}s`
  const mins = Math.floor(secs / 60)
  if (mins < 60) return `${mins}m`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h`
  const days = Math.floor(hrs / 24)
  return `${days}d`
}

const LAYOUTS = [
  { value: 'dagre', label: 'Hierarchical' },
  { value: 'breadthfirst', label: 'Breadth-first' },
  { value: 'cose-bilkent', label: 'Force' },
  { value: 'circle', label: 'Circle' },
  { value: 'grid', label: 'Grid' },
]

function getCsrfToken(): string {
  return document.querySelector('meta[name="csrf-token"]')?.getAttribute('content') ?? ''
}

function ActionDropdown({ label, children }: { label: string, children: React.ReactNode }) {
  const [isOpen, setIsOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setIsOpen(false)
    }
    window.addEventListener('mousedown', handleClick)
    return () => window.removeEventListener('mousedown', handleClick)
  }, [])

  return (
    <div className="action-dropdown" ref={ref}>
      <button className={`toolbar-btn ${isOpen ? 'toolbar-btn--active' : ''}`} type="button" onClick={() => setIsOpen(!isOpen)}>
        <span>{label}</span> <span className="dropdown-chevron">v</span>
      </button>
      {isOpen && <div className="action-dropdown-menu">{children}</div>}
    </div>
  )
}

export function Toolbar({ layout, rankDir, onRankDirChange, nodeCount, edgeCount, visibleCount, activeTabLabel, graphData, analyzedAt, theme, onLayoutChange, onSearch, onToggleTheme, cyRef }: Props) {
  const [searchValue, setSearchValue] = useState('')
  const [showMermaid, setShowMermaid] = useState(false)
  const [scanning, setScanning] = useState(false)
  const [loggingOut, setLoggingOut] = useState(false)
  const timeoutRef = useRef<number | null>(null)

  useEffect(() => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current)
    timeoutRef.current = window.setTimeout(() => {
      onSearch(searchValue)
    }, 250)
    return () => { if (timeoutRef.current) clearTimeout(timeoutRef.current) }
  }, [searchValue, onSearch])

  const handleFit = () => cyRef.current?.fit()

  const handleExportPng = () => {
    const cy = cyRef.current
    if (!cy) return
    const dataUrl = cy.png({ output: 'base64uri', scale: 2, full: true })
    const safe = activeTabLabel.replace(/[^a-z0-9]/gi, '_')
    downloadPng(dataUrl, `${safe}_graph.png`)
  }

  const handleExportMermaid = () => {
    if (graphData) setShowMermaid(true)
  }

  const handleScan = async () => {
    if (!window.confirm('This will re-analyze the full project. Continue?')) return
    setScanning(true)
    try {
      const res = await fetch(import.meta.env.BASE_URL + 'api/scan', {
        method: 'POST',
        headers: {
          'X-CSRF-TOKEN': getCsrfToken(),
        },
      })
      if (res.ok) {
        window.location.reload()
      } else {
        alert('Analysis failed.')
      }
    } catch {
      alert('Analysis failed.')
    } finally {
      setScanning(false)
    }
  }

  const handleLogout = async () => {
    setLoggingOut(true)
    try {
      await fetch(import.meta.env.BASE_URL + 'logout', {
        method: 'POST',
        headers: {
          'X-CSRF-TOKEN': getCsrfToken(),
        },
      })
      window.location.href = import.meta.env.BASE_URL + 'login'
    } catch {
      alert('Logout failed.')
      setLoggingOut(false)
    }
  }

  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 60000)
    return () => clearInterval(timer)
  }, [])

  const ageData = useMemo(() => {
    if (!analyzedAt) return null
    const ageMs = now - new Date(analyzedAt).getTime()
    return {
      ageMs,
      isStale: ageMs > 24 * 3600 * 1000,
      label: `Analyzed ${formatAge(ageMs)} ago`,
    }
  }, [analyzedAt, now])

  const isLarge = nodeCount > LARGE_GRAPH_THRESHOLD

  return (
    <>
      <div className="toolbar">
        <div className="toolbar-brand">
          <div className="erp-brand-mark">AN</div>
          <div className="erp-brand-text">
            <strong>Analyzer</strong>
            <span>Architecture Map</span>
          </div>
        </div>

        <div className="toolbar-stats">
          <span className="stat-chip">{visibleCount}/{nodeCount} nodes</span>
          <span className="stat-chip">{edgeCount} edges</span>
          {isLarge && <span className="stat-chip stat-chip--warn">large graph</span>}
          {ageData && (
            ageData.isStale ? (
              <button
                className="stat-chip stat-chip--stale"
                type="button"
                onClick={handleScan}
                title={`Last analyzed: ${analyzedAt ? new Date(analyzedAt).toLocaleString() : ''}`}
              >
                {ageData.label} | re-analyze
              </button>
            ) : (
              <span
                className="stat-chip stat-chip--age"
                title={`Last analyzed: ${analyzedAt ? new Date(analyzedAt).toLocaleString() : ''}`}
              >
                {ageData.label}
              </span>
            )
          )}
        </div>

        <div className="toolbar-controls">
          <div className="toolbar-group">
            <ActionDropdown label="View">
              <div className="dropdown-item">
                <label>Layout</label>
                <select
                  value={layout}
                  onChange={(e) => onLayoutChange(e.target.value)}
                  className="toolbar-select"
                >
                  {LAYOUTS.map(({ value, label }) => (
                    <option key={value} value={value}>{label}</option>
                  ))}
                </select>
              </div>

              {layout === 'dagre' && (
                <div className="dropdown-item">
                  <label>Orientation</label>
                  <button
                    className="toolbar-btn toolbar-btn--rank"
                    type="button"
                    onClick={() => onRankDirChange(rankDir === 'LR' ? 'TB' : 'LR')}
                  >
                    {rankDir === 'LR' ? 'Horizontal' : 'Vertical'}
                  </button>
                </div>
              )}

              <div className="dropdown-item">
                <button type="button" onClick={handleFit} className="toolbar-btn w-full">
                  Fit to screen
                </button>
              </div>
            </ActionDropdown>
          </div>

          <div className="toolbar-group">
            <div className="toolbar-search-wrapper">
              <input
                type="search"
                placeholder="Search nodes..."
                className="toolbar-search"
                value={searchValue}
                onChange={(e) => setSearchValue(e.target.value)}
              />
            </div>
          </div>

          <div className="toolbar-group">
            <ActionDropdown label="Export">
              <div className="dropdown-item">
                <button type="button" onClick={handleExportPng} className="toolbar-btn w-full">
                  Download PNG
                </button>
              </div>
              <div className="dropdown-item">
                <button
                  type="button"
                  onClick={handleExportMermaid}
                  className="toolbar-btn w-full"
                  disabled={!graphData}
                >
                  Copy Mermaid
                </button>
              </div>
            </ActionDropdown>
          </div>

          <div className="toolbar-group">
            <button
              type="button"
              onClick={handleScan}
              className={`toolbar-btn toolbar-btn--scan ${scanning ? 'toolbar-btn--loading' : ''}`}
              title="Re-analyze project"
              disabled={scanning}
            >
              {scanning ? (
                <>
                  <div className="btn-spinner btn-spinner--small" />
                  <span>Analyzing...</span>
                </>
              ) : (
                <span>Re-analyze</span>
              )}
            </button>

            <button
              type="button"
              onClick={onToggleTheme}
              className="theme-toggle"
              title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
            >
              {theme === 'dark' ? 'Light' : 'Dark'}
            </button>

            <button
              type="button"
              onClick={handleLogout}
              className={`toolbar-btn toolbar-btn--logout ${loggingOut ? 'toolbar-btn--loading' : ''}`}
              title="Logout"
              disabled={loggingOut}
            >
              {loggingOut ? <span>Signing out...</span> : <span>Logout</span>}
            </button>
          </div>
        </div>
      </div>

      {showMermaid && graphData && (
        <ExportModal
          mermaidCode={graphToMermaid(graphData, activeTabLabel)}
          filename={`${activeTabLabel.replace(/[^a-z0-9]/gi, '_')}_graph.mmd`}
          title={`${activeTabLabel} - Architecture Graph`}
          onClose={() => setShowMermaid(false)}
        />
      )}
    </>
  )
}
