import type { TabEntry } from '../types/graph'

interface TabGroup {
  name: string
  list: TabEntry[]
}

interface Props {
  groups: TabGroup[]
  activeId: string | null
  loadingId: string | null
  onSelect: (tab: TabEntry) => void
}

export function TabBar({ groups, activeId, loadingId, onSelect }: Props) {
  return (
    <div className="tab-bar">
      {groups.map((group) => (
        <div key={group.name} className="tab-group">
          <div className="tab-group-header">{group.name}</div>
          <div className="tab-group-content">
            {group.list.map((tab) => {
              const isActive = tab.id === activeId
              const isLoading = tab.id === loadingId
              return (
                <button
                  key={tab.id}
                  className={`tab-item ${isActive ? 'tab-item--active' : ''}`}
                  onClick={() => onSelect(tab)}
                  title={`${tab.nodeCount} nodes · ${tab.edgeCount} edges`}
                >
                  <span className="tab-label">{tab.label}</span>
                  <span className="tab-badge">
                    {isLoading ? '…' : tab.routeCount}
                  </span>
                </button>
              )
            })}
          </div>
        </div>
      ))}
    </div>
  )
}
