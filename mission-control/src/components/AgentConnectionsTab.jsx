import { useEffect, useState } from 'react'
import { fetchAgentConnections, createAgentConnection, deleteAgentConnection, testAgentConnection, updateAgentConnection } from '../api'
import { AgentConnectionForm } from './AgentConnectionForm'

export function AgentConnectionsTab({ onSelectConnection, selectedConnectionId }) {
  const [connections, setConnections] = useState([])
  const [showForm, setShowForm] = useState(false)
  const [editing, setEditing] = useState(null)
  const [message, setMessage] = useState('')

  const load = async () => {
    const data = await fetchAgentConnections()
    setConnections(data.connections || [])
  }

  useEffect(() => { load().catch(err => setMessage(err.message)) }, [])

  const save = async (payload) => {
    try {
      if (editing) await updateAgentConnection(editing.id, payload)
      else await createAgentConnection(payload)
      setShowForm(false)
      setEditing(null)
      await load()
    } catch (err) {
      setMessage(err.message)
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="text-xs uppercase tracking-wider text-slate-500">Agents</div>
        <button className="text-xs px-2 py-1 rounded border border-slate-700" onClick={() => { setEditing(null); setShowForm(v => !v) }}>{showForm ? 'close' : 'add connection'}</button>
      </div>
      {message && <div className="text-xs text-amber-400">{message}</div>}
      {showForm && <AgentConnectionForm initial={editing} onSubmit={save} onCancel={() => { setShowForm(false); setEditing(null) }} />}
      <div className="space-y-2">
        {connections.map(conn => (
          <div key={conn.id} className="rounded border border-slate-800 bg-slate-900 p-3 text-xs space-y-2">
            <div className="flex items-center justify-between">
              <button className={`font-semibold ${selectedConnectionId === conn.id ? 'text-blue-300' : 'text-slate-200'}`} onClick={() => onSelectConnection?.(conn)}>{conn.name} ({conn.adapter})</button>
              <div className="flex gap-1">
                <button className="px-2 py-1 rounded border border-slate-700" onClick={async () => { await testAgentConnection({ connectionId: conn.id }); setMessage(`tested ${conn.id}`) }}>test</button>
                <button className="px-2 py-1 rounded border border-slate-700" onClick={() => { setEditing(conn); setShowForm(true) }}>edit</button>
                <button className="px-2 py-1 rounded border border-red-800 text-red-300" onClick={async () => { await deleteAgentConnection(conn.id); await load() }}>delete</button>
              </div>
            </div>
            <div className="text-slate-400">id: {conn.id}</div>
            <div className="text-slate-400">scopes: {(conn.scopes || []).join(', ') || '(none)'}</div>
          </div>
        ))}
        {!connections.length && <div className="text-xs text-slate-500">No agent connections configured.</div>}
      </div>
    </div>
  )
}
