const URGENCY_STYLES = {
  urgent: { border: 'border-red-500/60', bg: 'bg-red-950/20', badge: 'bg-red-600', text: 'text-red-400' },
  warning: { border: 'border-amber-500/60', bg: 'bg-amber-950/20', badge: 'bg-amber-600', text: 'text-amber-400' },
  info: { border: 'border-slate-700', bg: 'bg-slate-900/50', badge: 'bg-slate-600', text: 'text-slate-400' },
}

const SOURCE_LABELS = {
  procurement: 'Proc',
  job: 'Job',
}

function formatDuration(secs) {
  if (secs == null) return ''
  const s = Math.abs(secs)
  if (s < 60) return `${s}s`
  if (s < 3600) return `${Math.floor(s / 60)}m`
  if (s < 86400) return `${Math.floor(s / 3600)}h ${Math.floor((s % 3600) / 60)}m`
  return `${Math.floor(s / 86400)}d ${Math.floor((s % 86400) / 3600)}h`
}

function timeAgo(iso) {
  if (!iso) return ''
  const mins = Math.round((Date.now() - Date.parse(iso)) / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.round(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  return `${Math.round(hrs / 24)}d ago`
}

function ActionItem({ action, onDismiss }) {
  const style = URGENCY_STYLES[action.urgency] || URGENCY_STYLES.info
  const sourceLabel = SOURCE_LABELS[action.sourceType] || 'Item'
  const deadlineText = action.secsUntilDeadline != null
    ? (action.secsUntilDeadline < 0
        ? `expired ${formatDuration(action.secsUntilDeadline)} ago`
        : `${formatDuration(action.secsUntilDeadline)} remaining`)
    : ''

  return (
    <div className={`rounded-lg border ${style.border} ${style.bg} p-3 mb-2 transition-all hover:bg-slate-800/50`}>
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2 shrink-0">
          <span className={`text-xs font-bold px-1.5 py-0.5 rounded ${style.badge} text-white`}>
            {sourceLabel} #{action.sourceId}
          </span>
          <span className="text-xs font-mono text-slate-300">{action.action}</span>
        </div>
        <button
          onClick={() => onDismiss(action.id)}
          className="text-xs text-slate-600 hover:text-slate-300 shrink-0 px-1.5 py-0.5 rounded hover:bg-slate-700"
          title="Dismiss"
        >
          dismiss
        </button>
      </div>

      <p className="text-xs text-slate-400 mt-1.5">{action.summary}</p>
      {Array.isArray(action.checklist) && action.checklist.length > 0 && (
        <ul className="mt-2 list-disc list-inside text-xs text-slate-300 space-y-0.5">
          {action.checklist.slice(0, 4).map((item, idx) => (
            <li key={`${action.id}-check-${idx}`}>{typeof item === 'string' ? item : item?.label || item?.name || 'Checklist item'}</li>
          ))}
        </ul>
      )}
      {Array.isArray(action.missingRequiredArtifacts) && action.missingRequiredArtifacts.length > 0 && (
        <div className="mt-2 text-xs text-amber-300">
          Missing: {action.missingRequiredArtifacts.slice(0, 4).join(', ')}
        </div>
      )}

      <div className="flex items-center gap-3 mt-2 text-xs">
        {deadlineText && (
          <span className={action.secsUntilDeadline < 0 ? 'text-red-400' : style.text}>
            {deadlineText}
          </span>
        )}
        {action.blockedReason && (
          <span className="text-amber-400">blocked: {action.blockedReason}</span>
        )}
        {action.stateStatus && (
          <span className="text-slate-500">state: {action.stateStatus}</span>
        )}
        <span className="text-slate-600 ml-auto">{timeAgo(action.createdAt)}</span>
      </div>
    </div>
  )
}

export function ActionsPanel({
  actions = [],
  loading = false,
  error = null,
  filter = 'pending',
  setFilter = () => {},
  unreadCount = 0,
  dismiss = () => {},
  dismissAll = () => {},
  refetch = () => {},
}) {

  const filters = [
    { key: 'pending', label: 'Pending' },
    { key: 'urgent', label: 'Urgent' },
    { key: 'dismissed', label: 'Dismissed' },
  ]

  return (
    <div className="p-4">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <h2 className="text-lg font-bold text-slate-100">Action Feed</h2>
          {unreadCount > 0 && (
            <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-blue-600 text-white">
              {unreadCount} new
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={dismissAll}
            disabled={actions.length === 0}
            className="text-xs px-2 py-1 rounded border border-slate-700 text-slate-400 hover:bg-slate-800 hover:text-slate-200 disabled:opacity-50"
          >
            dismiss all
          </button>
          <button
            onClick={refetch}
            className="text-xs px-2 py-1 rounded border border-slate-700 text-slate-400 hover:bg-slate-800 hover:text-slate-200"
          >
            refresh
          </button>
        </div>
      </div>

      <div className="flex gap-2 mb-4">
        {filters.map(f => (
          <button
            key={f.key}
            onClick={() => setFilter(f.key)}
            className={`px-3 py-1.5 rounded text-xs transition-colors ${
              filter === f.key
                ? 'bg-blue-600/25 text-blue-300 border border-blue-500/50'
                : 'bg-slate-800 text-slate-500 border border-transparent hover:text-slate-300 hover:bg-slate-700'
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {loading && actions.length === 0 && (
        <div className="text-slate-600 text-xs text-center py-8">Loading actions...</div>
      )}

      {error && (
        <div className="text-red-400 text-xs p-3 bg-red-950/30 rounded-lg border border-red-900 mb-4">
          {error}
        </div>
      )}

      {!loading && actions.length === 0 && !error && (
        <div className="text-slate-600 text-xs text-center py-8">No actions to display</div>
      )}

      <div className="space-y-0 max-h-[600px] overflow-y-auto">
        {actions.map(action => (
          <ActionItem key={action.id} action={action} onDismiss={dismiss} />
        ))}
      </div>
    </div>
  )
}
