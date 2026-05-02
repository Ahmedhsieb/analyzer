import { useRef, useState, useMemo, useEffect, useCallback } from 'react'
import type { Core } from 'cytoscape'
import { useManifest } from './hooks/useManifest'
import { useTabGraph } from './hooks/useTabGraph'
import { useVirtualGraph } from './hooks/useVirtualGraph'
import { useTheme } from './hooks/useTheme'
import { GraphView } from './components/GraphView'
import { LARGE_GRAPH_THRESHOLD } from './utils/graphConstants'
import { Sidebar } from './components/Sidebar'
import { Toolbar } from './components/Toolbar'
import { LeftSidebar } from './components/LeftSidebar'
import type { GraphNode, TabEntry } from './types/graph'
import './App.css'

const ALL_TYPES: GraphNode['type'][] = [
  'route', 'middleware', 'controller', 'action', 'service', 'model', 'event', 'job',
  'command', 'channel', 'schedule',
]

export default function App() {
  const { theme, toggle: toggleTheme } = useTheme()
  const { manifest, loading: manifestLoading, error: manifestError } = useManifest()
  const { state: tabState, elements: allElements, load } = useTabGraph()
  const elements = useVirtualGraph(allElements)

  const [activeTab, setActiveTab] = useState<TabEntry | null>(null)
  const [loadingTabId, setLoadingTabId] = useState<string | null>(null)
  const [layout, setLayout] = useState('dagre')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [visibleTypes, setVisibleTypes] = useState<Set<string>>(new Set(ALL_TYPES))
  const [rankDir, setRankDir] = useState<'LR' | 'TB'>('TB')
  const cyRef = useRef<Core | null>(null)

  const handleSelectTab = useCallback((tab: TabEntry) => {
    if (activeTab?.id === tab.id) return

    const url = new URL(window.location.href)
    if (url.searchParams.get('tab') !== tab.id) {
      url.searchParams.set('tab', tab.id)
      window.history.pushState({ tabId: tab.id }, '', url.toString())
    }

    setActiveTab(tab)
    setSearchQuery('')
    setLoadingTabId(tab.id)
    load(tab.file)
  }, [activeTab, load])

  const [prevManifest, setPrevManifest] = useState(manifest)
  if (manifest !== prevManifest) {
    setPrevManifest(manifest)
    if (manifest && !activeTab) {
      const params = new URLSearchParams(window.location.search)
      const urlTabId = params.get('tab')
      const targetTab = manifest.tabs.find((t) => t.id === urlTabId)
      if (targetTab) {
        handleSelectTab(targetTab)
      }
    }
  }

  const [prevTabData, setPrevTabData] = useState(tabState.data)
  if (tabState.data !== prevTabData) {
    setPrevTabData(tabState.data)
    if (tabState.data) {
      const nodeCount = tabState.data.nodes.length
      const nextVisible = new Set(
        nodeCount > LARGE_GRAPH_THRESHOLD
          ? ALL_TYPES.filter((t) => t !== 'middleware')
          : ALL_TYPES
      )
      setVisibleTypes(nextVisible)
    }
    setSelectedId(null)
  }

  useEffect(() => {
    const handlePopState = () => {
      if (!manifest) return
      const params = new URLSearchParams(window.location.search)
      const tabId = params.get('tab')
      const tab = manifest.tabs.find((t) => t.id === tabId)
      if (tab) {
        setActiveTab(tab)
        setLoadingTabId(tab.id)
        load(tab.file)
      }
    }
    window.addEventListener('popstate', handlePopState)
    return () => window.removeEventListener('popstate', handlePopState)
  }, [manifest, load])

  const handleNodeSelect = useCallback((id: string | null) => {
    setSelectedId(id)
  }, [])

  const [prevTabLoading, setPrevTabLoading] = useState(tabState.loading)
  if (tabState.loading !== prevTabLoading) {
    setPrevTabLoading(tabState.loading)
    if (!tabState.loading) {
      setLoadingTabId(null)
    }
  }

  const groupedTabs = useMemo(() => {
    if (!manifest) return { fileGroups: [] }

    const byFile = new Map<string, TabEntry[]>()
    manifest.tabs.forEach((tab) => {
      let key: string
      if (tab.category === 'Command') {
        key = 'Console Commands'
      } else if (tab.category === 'Channel') {
        key = 'Broadcast Channels'
      } else if (tab.category === 'Schedule') {
        key = 'Schedules'
      } else {
        key = tab.routeFile ?? 'routes.php'
      }
      const list = byFile.get(key) ?? []
      list.push(tab)
      byFile.set(key, list)
    })

    const HTTP_METHODS = new Set(['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS', 'ANY'])

    const fileGroups = [...byFile.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([fileName, tabs]) => {
        const byPrefix = new Map<string, TabEntry[]>()
        tabs.forEach((tab) => {
          const firstWord = tab.label.split(' ')[0]
          const isHttp = HTTP_METHODS.has(firstWord)
          const prefix = isHttp
            ? (tab.label.replace(/^[A-Z]+\s+/, '').split('/').filter(Boolean)[0] ?? '/')
            : '_flat'

          const list = byPrefix.get(prefix) ?? []
          list.push(tab)
          byPrefix.set(prefix, list)
        })

        const prefixGroups = [...byPrefix.entries()]
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([prefix, groupedTabs]) => ({ prefix, tabs: groupedTabs }))

        return { fileName, prefixGroups }
      })

    return { fileGroups }
  }, [manifest])

  const typeCounts = useMemo(() => {
    if (!tabState.data) return {} as Record<string, number>
    return tabState.data.nodes.reduce<Record<string, number>>((acc, node) => {
      acc[node.type] = (acc[node.type] ?? 0) + 1
      return acc
    }, {})
  }, [tabState.data])

  const visibleNodeCount = useMemo(() => {
    if (!tabState.data) return 0
    return tabState.data.nodes.filter((node) => visibleTypes.has(node.type)).length
  }, [tabState.data, visibleTypes])

  const toggleType = useCallback((type: string) => {
    setVisibleTypes((prev) => {
      const next = new Set(prev)
      if (next.has(type)) {
        next.delete(type)
      } else {
        next.add(type)
      }
      return next
    })
  }, [])

  const onShowAll = useCallback(() => setVisibleTypes(new Set(ALL_TYPES)), [])
  const onHideAll = useCallback(() => setVisibleTypes(new Set()), [])

  const [scanning, setScanning] = useState(false)

  const handleScan = async () => {
    if (!window.confirm('This will analyze the full project. Continue?')) return
    setScanning(true)
    try {
      const res = await fetch(import.meta.env.BASE_URL + 'api/scan', { method: 'POST' })
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

  if (manifestLoading) {
    return (
      <div className="loading-screen">
        <div className="loading-spinner" />
        <p>Loading architecture graph...</p>
      </div>
    )
  }

  if (manifestError || !manifest) {
    return (
      <div className="error-screen welcome-screen">
        <div className="welcome-card">
          <div className="welcome-icon">
            <svg xmlns="http://www.w3.org/2000/svg" width="180" height="180" viewBox="0 0 180 180" fill="none">
              <rect width="180" height="180" fill="#0B1724" rx="24"/>
              <g transform="translate(18,18) scale(2.0)">
                <circle cx="36" cy="36" r="30" fill="#2DD4BF" opacity="0.16"/>
                <circle cx="36" cy="36" r="5" fill="#2DD4BF"/>
                <circle cx="24" cy="26" r="3" fill="#38BDF8"/>
                <circle cx="48" cy="26" r="3" fill="#38BDF8"/>
                <circle cx="24" cy="46" r="3" fill="#38BDF8"/>
                <circle cx="48" cy="46" r="3" fill="#38BDF8"/>
                <line x1="24" y1="26" x2="36" y2="36" stroke="#2DD4BF" strokeWidth="1.2"/>
                <line x1="48" y1="26" x2="36" y2="36" stroke="#2DD4BF" strokeWidth="1.2"/>
                <line x1="24" y1="46" x2="36" y2="36" stroke="#2DD4BF" strokeWidth="1.2"/>
                <line x1="48" y1="46" x2="36" y2="36" stroke="#2DD4BF" strokeWidth="1.2"/>
              </g>
            </svg>
          </div>
          <h2>Welcome to Analyzer</h2>
          <p>No analysis data found. Run an initial architecture scan to start exploring application flow.</p>

          {manifestError && manifestError !== 'HTTP 404' && (
            <div className="error-details">
              <small>Error: {manifestError}</small>
            </div>
          )}

          <button
            className={`scan-btn ${scanning ? 'scan-btn--loading' : ''}`}
            onClick={handleScan}
            disabled={scanning}
          >
            {scanning ? (
              <>
                <div className="btn-spinner" />
                Analyzing Project...
              </>
            ) : (
              'Start Analysis'
            )}
          </button>

          <div className="welcome-hint">
            Or run <code>php artisan analyzer:analyze</code> in your terminal.
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="app">
      <Toolbar
        layout={layout}
        nodeCount={tabState.data?.meta.nodeCount ?? activeTab?.nodeCount ?? 0}
        edgeCount={tabState.data?.meta.edgeCount ?? activeTab?.edgeCount ?? 0}
        visibleCount={visibleNodeCount}
        activeTabLabel={activeTab?.label ?? 'graph'}
        graphData={tabState.data ?? null}
        analyzedAt={manifest.analyzedAt}
        theme={theme}
        onLayoutChange={setLayout}
        rankDir={rankDir}
        onRankDirChange={setRankDir}
        onSearch={setSearchQuery}
        onToggleTheme={toggleTheme}
        cyRef={cyRef}
      />
      <div className="main">
        <LeftSidebar
          fileGroups={groupedTabs.fileGroups ?? []}
          activeId={activeTab?.id ?? null}
          loadingId={loadingTabId}
          onSelect={handleSelectTab}
          visibleTypes={visibleTypes}
          counts={typeCounts}
          onToggle={toggleType}
          onShowAll={onShowAll}
          onHideAll={onHideAll}
        />
        <div className="graph-container">
          {tabState.loading && (
            <div className="graph-loading-overlay">
              <div className="loading-spinner" />
              <p>Loading {activeTab?.label}...</p>
            </div>
          )}
          {tabState.error && (
            <div className="graph-loading-overlay">
              <p style={{ color: '#F44336' }}>Error: {tabState.error}</p>
            </div>
          )}
          {!activeTab && !tabState.loading && (
            <div className="graph-placeholder">
              <div className="placeholder-icon">
                <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
                </svg>
              </div>
              <h3>Select a route to explore</h3>
              <p>Expand files from the left panel and choose a route, command, or channel to inspect execution flow.</p>
            </div>
          )}
          {!tabState.loading && activeTab && elements.length === 0 && !tabState.error && (
            <div className="graph-placeholder">
              <div className="placeholder-icon">
                <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="10" />
                  <line x1="12" y1="8" x2="12" y2="12" />
                  <line x1="12" y1="16" x2="12.01" y2="16" />
                </svg>
              </div>
              <h3>Empty Graph</h3>
              <p>No nodes or edges were generated for this selection.</p>
            </div>
          )}
          {!tabState.loading && elements.length > 0 && (
            <GraphView
              key={activeTab?.id}
              elements={elements}
              layout={layout}
              searchQuery={searchQuery}
              rankDir={rankDir}
              visibleTypes={visibleTypes}
              theme={theme}
              onNodeSelect={handleNodeSelect}
              cyRef={cyRef}
            />
          )}
        </div>
        <Sidebar
          selectedId={selectedId}
          graphData={tabState.data}
          theme={theme}
          onClose={() => setSelectedId(null)}
        />
      </div>
    </div>
  )
}


