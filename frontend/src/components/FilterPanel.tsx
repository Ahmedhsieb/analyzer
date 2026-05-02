import type { GraphNode } from '../types/graph'

const NODE_TYPES: { type: GraphNode['type']; label: string; color: string }[] = [
  { type: 'route',      label: 'Routes',      color: '#4CAF50' },
  { type: 'middleware', label: 'Middleware',   color: '#FF9800' },
  { type: 'controller', label: 'Controllers', color: '#2196F3' },
  { type: 'action',     label: 'Actions',     color: '#03A9F4' },
  { type: 'service',    label: 'Services',    color: '#9C27B0' },
  { type: 'model',      label: 'Models',      color: '#F44336' },
  { type: 'event',      label: 'Events',      color: '#FFD600' },
  { type: 'job',        label: 'Jobs',        color: '#607D8B' },
  { type: 'command',    label: 'Commands',    color: '#14b8a6' },
  { type: 'channel',    label: 'Channels',    color: '#8b5cf6' },
  { type: 'schedule',   label: 'Schedules',   color: '#f97316' },
]

interface Props {
  visibleTypes: Set<string>
  counts: Record<string, number>
  onToggle: (type: string) => void
  onShowAll: () => void
  onHideAll: () => void
}

export function FilterPanel({ visibleTypes, counts, onToggle, onShowAll, onHideAll }: Props) {
  return (
    <div className="filter-panel">
      <div className="filter-header">
        <span className="filter-title">Filters</span>
        <div className="filter-actions">
          <button onClick={onShowAll} className="filter-link">all</button>
          <span className="filter-sep">·</span>
          <button onClick={onHideAll} className="filter-link">none</button>
        </div>
      </div>

      {NODE_TYPES.map(({ type, label, color }) => {
        const count = counts[type] ?? 0
        if (count === 0) return null
        const checked = visibleTypes.has(type)
        return (
          <label key={type} className={`filter-item ${!checked ? 'filter-item--dim' : ''}`}>
            <input
              type="checkbox"
              checked={checked}
              onChange={() => onToggle(type)}
              className="filter-checkbox"
            />
            <span className="filter-dot" style={{ backgroundColor: color }} />
            <span className="filter-label">{label}</span>
            <span className="filter-count">{count}</span>
          </label>
        )
      })}
    </div>
  )
}
