import { useState } from 'react'

export function AgentConnectionForm({ onSubmit, initial = null, onCancel }) {
  const [form, setForm] = useState(initial || {
    id: '',
    name: '',
    adapter: 'webhook',
    enabled: true,
    scopes: ['job-v1'],
    config: { baseUrl: '', submitPath: '/submit', statusPathTemplate: '/runs/{runId}', resultPathTemplate: '/runs/{runId}/result' }
  })

  const toggleScope = (scope) => {
    const next = form.scopes.includes(scope) ? form.scopes.filter(s => s !== scope) : [...form.scopes, scope]
    setForm({ ...form, scopes: next })
  }

  return (
    <div className="rounded border border-slate-700 bg-slate-900 p-3 space-y-2">
      <div className="grid md:grid-cols-3 gap-2">
        <input className="bg-slate-800 border border-slate-700 rounded px-2 py-1 text-xs" placeholder="Connection name" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} />
        <input className="bg-slate-800 border border-slate-700 rounded px-2 py-1 text-xs" placeholder="Connection id (optional)" value={form.id} onChange={e => setForm({ ...form, id: e.target.value })} />
        <select className="bg-slate-800 border border-slate-700 rounded px-2 py-1 text-xs" value={form.adapter} onChange={e => setForm({ ...form, adapter: e.target.value })}>
          {['webhook', 'hermes', 'openclaw', 'openai', 'ollama'].map(opt => <option key={opt} value={opt}>{opt}</option>)}
        </select>
      </div>
      <div className="grid md:grid-cols-2 gap-2">
        <input className="bg-slate-800 border border-slate-700 rounded px-2 py-1 text-xs" placeholder="baseUrl" value={form.config.baseUrl || ''} onChange={e => setForm({ ...form, config: { ...form.config, baseUrl: e.target.value } })} />
        <input className="bg-slate-800 border border-slate-700 rounded px-2 py-1 text-xs" placeholder="submitPath" value={form.config.submitPath || ''} onChange={e => setForm({ ...form, config: { ...form.config, submitPath: e.target.value } })} />
      </div>
      <div className="flex gap-2 text-xs">
        {['job-v1', 'job-v2', 'prime-v1', 'prime-v2'].map(scope => (
          <button type="button" key={scope} onClick={() => toggleScope(scope)} className={`px-2 py-1 rounded border ${form.scopes.includes(scope) ? 'border-blue-500 text-blue-300' : 'border-slate-700 text-slate-400'}`}>{scope}</button>
        ))}
      </div>
      <div className="flex items-center gap-3 text-xs">
        <label className="flex items-center gap-1"><input type="checkbox" checked={form.enabled} onChange={e => setForm({ ...form, enabled: e.target.checked })} /> enabled</label>
        <button className="px-2 py-1 rounded bg-blue-600 text-white" onClick={() => onSubmit(form)}>save</button>
        {onCancel && <button className="px-2 py-1 rounded border border-slate-700" onClick={onCancel}>cancel</button>}
      </div>
    </div>
  )
}
