const NODE_TYPES = [
  { type: 'route', label: 'Route', color: '#4CAF50' },
  { type: 'middleware', label: 'Middleware', color: '#FF9800' },
  { type: 'controller', label: 'Controller', color: '#2196F3' },
  { type: 'action', label: 'Action', color: '#03A9F4' },
  { type: 'service', label: 'Service', color: '#9C27B0' },
  { type: 'model', label: 'Model', color: '#F44336' },
  { type: 'event', label: 'Event', color: '#FFD600' },
  { type: 'job', label: 'Job', color: '#607D8B' },
]

export function Legend() {
  return (
    <div className="legend">
      {NODE_TYPES.map(({ type, label, color }) => (
        <div key={type} className="legend-item">
          <span className="legend-dot" style={{ backgroundColor: color }} />
          <span className="legend-label">{label}</span>
        </div>
      ))}
    </div>
  )
}
