import { useState, useEffect } from 'react'

const GATEWAYS = [
  'https://ipfs.io/ipfs/',
  'https://cloudflare-ipfs.com/ipfs/',
  'https://gateway.pinata.cloud/ipfs/',
]
const STORAGE_KEY = 'ipfs-briefs-v1'

// ── Storage helpers ───────────────────────────────────────────────────────────
function loadSaved() {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]') } catch { return [] }
}
function persistSaved(list) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(list))
}

// ── IPFS fetch ────────────────────────────────────────────────────────────────
async function fetchFromIpfs(uri) {
  const cid = uri.replace('ipfs://', '')
  for (const gw of GATEWAYS) {
    try {
      const res = await fetch(gw + cid, { signal: AbortSignal.timeout(10000) })
      if (res.ok) {
        const text = await res.text()
        try { return { type: 'json', data: JSON.parse(text), raw: text } }
        catch { return { type: 'text', data: text, raw: text } }
      }
    } catch { continue }
  }
  throw new Error('All IPFS gateways failed — try again or check the CID')
}

// ── Parsers ───────────────────────────────────────────────────────────────────
function extractIpfsLinks(raw) {
  const matches = (typeof raw === 'string' ? raw : JSON.stringify(raw)).match(/ipfs:\/\/[a-zA-Z0-9]+/g)
  return [...new Set(matches || [])]
}

function textToSpec(text, uri) {
  const lines = text.split('\n').map(l => l.trim()).filter(Boolean)
  const headingLine = lines.find(l => /^#+\s/.test(l))
  const title = headingLine
    ? headingLine.replace(/^#+\s+/, '')
    : (lines[0]?.length < 120 ? lines[0] : null) || uri
  const startIdx = headingLine ? lines.indexOf(headingLine) + 1 : 1
  const details = lines.slice(startIdx).join('\n').trim()
  return { name: title, properties: { title, summary: '', details, category: '', tags: [], deliverables: [], acceptanceCriteria: [], requirements: [], payoutAGIALPHA: null, durationSeconds: null } }
}

function normalizeToSpec(result, uri) {
  if (result.type === 'text') return textToSpec(result.data, uri)
  const data = result.data
  if (!data || typeof data !== 'object') return textToSpec(String(data ?? ''), uri)
  if (data?.properties?.schema?.startsWith('agijobmanager')) return data
  const p = data?.properties || data
  return {
    name: data?.name || p?.title || uri,
    properties: {
      title: p?.title || data?.name || data?.label || uri,
      summary: p?.summary || data?.description || data?.summary || '',
      details: p?.details || p?.description || data?.details || '',
      category: p?.category || data?.category || '',
      tags: p?.tags || data?.tags || [],
      deliverables: p?.deliverables || data?.deliverables || [],
      acceptanceCriteria: p?.acceptanceCriteria || data?.acceptanceCriteria || [],
      requirements: p?.requirements || data?.requirements || [],
      payoutAGIALPHA: p?.payoutAGIALPHA ?? data?.payoutAGIALPHA ?? null,
      durationSeconds: p?.durationSeconds ?? data?.durationSeconds ?? null,
    },
  }
}

// ── Brief display (inline, no modal) ─────────────────────────────────────────
function BriefDisplay({ spec, uri }) {
  const p = spec?.properties || {}
  const durationDays = p.durationSeconds ? Math.round(p.durationSeconds / 86400) : null
  const cid = uri.replace('ipfs://', '')
  const cidShort = cid.slice(0, 12) + '...' + cid.slice(-6)

  return (
    <div className="bg-slate-900 rounded-xl border border-slate-700 overflow-hidden">
      <div className="border-b border-slate-800 px-5 py-3 flex items-center justify-between">
        <div className="text-sm font-semibold text-white">Job Brief</div>
        <a href={GATEWAYS[0] + cid} target="_blank" rel="noopener noreferrer"
           className="text-xs text-blue-400 hover:text-blue-300 font-mono">
          {cidShort} ↗
        </a>
      </div>

      <div className="px-5 py-4 space-y-5">
        <div>
          <div className="text-xs text-slate-500 uppercase tracking-wider mb-1">Title</div>
          <div className="text-base font-medium text-white leading-snug">{p.title || spec?.name || '—'}</div>
        </div>

        {p.summary && (
          <div>
            <div className="text-xs text-slate-500 uppercase tracking-wider mb-1">Summary</div>
            <div className="text-sm text-slate-300 leading-relaxed">{p.summary}</div>
          </div>
        )}

        {(p.payoutAGIALPHA != null || durationDays || p.category) && (
          <div className="grid grid-cols-3 gap-3">
            <div className="bg-slate-800 rounded-lg p-3 text-center">
              <div className="text-xs text-slate-500 mb-1">Payout</div>
              <div className="text-sm font-semibold text-blue-400">
                {p.payoutAGIALPHA != null ? Number(p.payoutAGIALPHA).toLocaleString() : '—'}
              </div>
              <div className="text-xs text-slate-600">AGIALPHA</div>
            </div>
            <div className="bg-slate-800 rounded-lg p-3 text-center">
              <div className="text-xs text-slate-500 mb-1">Duration</div>
              <div className="text-sm font-semibold text-slate-200">{durationDays || '—'}</div>
              <div className="text-xs text-slate-600">days</div>
            </div>
            <div className="bg-slate-800 rounded-lg p-3 text-center">
              <div className="text-xs text-slate-500 mb-1">Category</div>
              <div className="text-xs font-semibold text-slate-200 capitalize leading-tight">{p.category || '—'}</div>
              <div className="text-xs text-slate-600">type</div>
            </div>
          </div>
        )}

        {p.details && (
          <div>
            <div className="text-xs text-slate-500 uppercase tracking-wider mb-2">Details</div>
            <div className="text-sm text-slate-400 leading-relaxed bg-slate-800/50 rounded-lg p-3 whitespace-pre-wrap">{p.details}</div>
          </div>
        )}

        {p.deliverables?.length > 0 && (
          <div>
            <div className="text-xs text-slate-500 uppercase tracking-wider mb-2">Deliverables</div>
            <ul className="space-y-1.5">
              {p.deliverables.map((d, i) => (
                <li key={i} className="flex gap-2 text-sm text-slate-300">
                  <span className="text-blue-500 shrink-0 mt-0.5">→</span><span>{d}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {p.acceptanceCriteria?.length > 0 && (
          <div>
            <div className="text-xs text-slate-500 uppercase tracking-wider mb-2">Acceptance criteria</div>
            <ul className="space-y-1.5">
              {p.acceptanceCriteria.map((c, i) => (
                <li key={i} className="flex gap-2 text-sm text-slate-300">
                  <span className="text-green-500 shrink-0 mt-0.5">✓</span><span>{c}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {p.requirements?.length > 0 && (
          <div>
            <div className="text-xs text-slate-500 uppercase tracking-wider mb-2">Requirements</div>
            <ul className="space-y-1.5">
              {p.requirements.map((r, i) => (
                <li key={i} className="flex gap-2 text-sm text-slate-300">
                  <span className="text-amber-500 shrink-0 mt-0.5">•</span><span>{r}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {p.tags?.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {p.tags.map(t => (
              <span key={t} className="text-xs bg-slate-800 text-slate-400 px-2 py-0.5 rounded-full border border-slate-700">{t}</span>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

// ── Saved brief row ───────────────────────────────────────────────────────────
function SavedRow({ entry, onLoad, onRename, onDelete, nested = false }) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(entry.alias)

  function commitRename() {
    const name = draft.trim()
    if (name) onRename(entry.id, name)
    setEditing(false)
  }

  const cid = entry.uri.replace('ipfs://', '')
  const cidShort = cid.slice(0, 8) + '...' + cid.slice(-4)
  const date = new Date(entry.savedAt).toLocaleDateString()

  return (
    <div className={`flex items-center gap-2 px-3 py-2.5 rounded-lg border group transition-colors ${
      nested
        ? 'border-slate-800/60 bg-slate-900/50 hover:border-slate-700/60'
        : 'border-slate-800 bg-slate-900 hover:border-slate-700'
    }`}>
      {nested && <span className="text-slate-700 text-xs shrink-0">↳</span>}
      {editing ? (
        <input
          autoFocus
          value={draft}
          onChange={e => setDraft(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') commitRename(); if (e.key === 'Escape') setEditing(false) }}
          onBlur={commitRename}
          className="flex-1 text-xs bg-slate-800 border border-blue-500 rounded px-2 py-1 text-slate-200 focus:outline-none"
        />
      ) : (
        <button onClick={() => onLoad(entry)} className="flex-1 min-w-0 text-left">
          <div className={`text-xs truncate font-medium ${nested ? 'text-slate-400' : 'text-slate-200'}`}>{entry.alias}</div>
          <div className="text-xs text-slate-600 font-mono mt-0.5">{cidShort} · {date}</div>
        </button>
      )}

      <div className="flex items-center gap-1 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
        {!editing && (
          <button
            onClick={() => { setDraft(entry.alias); setEditing(true) }}
            title="Rename"
            className="text-xs px-1.5 py-1 rounded text-slate-500 hover:text-slate-300 hover:bg-slate-800"
          >
            ✎
          </button>
        )}
        <button
          onClick={() => onDelete(entry.id)}
          title="Remove"
          className="text-xs px-1.5 py-1 rounded text-slate-500 hover:text-red-400 hover:bg-slate-800"
        >
          ✕
        </button>
      </div>
    </div>
  )
}

// ── Main tab ──────────────────────────────────────────────────────────────────
export function IpfsTab() {
  const [link, setLink] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [primaryBrief, setPrimaryBrief] = useState(null)
  const [nestedBriefs, setNestedBriefs] = useState([])
  const [saved, setSaved] = useState(loadSaved)

  // Keep saved list in sync with localStorage
  useEffect(() => { persistSaved(saved) }, [saved])

  function saveEntry(uri, spec, parentId = null) {
    setSaved(prev => {
      if (prev.some(e => e.uri === uri)) return prev // already stored
      const alias = spec?.properties?.title || spec?.name || uri
      const entry = { id: crypto.randomUUID(), uri, alias, spec, parentId, savedAt: new Date().toISOString() }
      if (parentId) {
        // Insert immediately after the parent
        const idx = prev.findIndex(e => e.id === parentId)
        if (idx !== -1) {
          const next = [...prev]
          next.splice(idx + 1, 0, entry)
          return next
        }
      }
      return [entry, ...prev]
    })
  }

  function renameEntry(id, alias) {
    setSaved(prev => prev.map(e => e.id === id ? { ...e, alias } : e))
  }

  function deleteEntry(id) {
    // Also delete all children of this entry
    setSaved(prev => prev.filter(e => e.id !== id && e.parentId !== id))
  }

  function loadEntry(entry) {
    setPrimaryBrief({ uri: entry.uri, spec: entry.spec })
    setNestedBriefs([])
    setLink(entry.uri)
    setError(null)
  }

  async function handleFetch() {
    const uri = link.trim()
    if (!uri) return
    if (!uri.startsWith('ipfs://')) {
      setError('Please enter a valid IPFS link starting with ipfs://')
      return
    }

    setLoading(true)
    setError(null)
    setPrimaryBrief(null)
    setNestedBriefs([])

    try {
      const result = await fetchFromIpfs(uri)
      const spec = normalizeToSpec(result, uri)
      setPrimaryBrief({ uri, spec })

      // Save primary first so we have its id for children
      let parentId = null
      setSaved(prev => {
        if (prev.some(e => e.uri === uri)) {
          parentId = prev.find(e => e.uri === uri).id
          return prev
        }
        const alias = spec?.properties?.title || spec?.name || uri
        const entry = { id: crypto.randomUUID(), uri, alias, spec, parentId: null, savedAt: new Date().toISOString() }
        parentId = entry.id
        return [entry, ...prev]
      })

      const nested = extractIpfsLinks(result.raw).filter(l => l !== uri)
      if (nested.length > 0) {
        const results = await Promise.allSettled(
          nested.map(async nestedUri => {
            const res = await fetchFromIpfs(nestedUri)
            const nestedSpec = normalizeToSpec(res, nestedUri)
            saveEntry(nestedUri, nestedSpec, parentId)
            return { uri: nestedUri, spec: nestedSpec }
          })
        )
        setNestedBriefs(results.filter(r => r.status === 'fulfilled').map(r => r.value))
      }
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="space-y-4">
      {/* Input */}
      <div className="bg-slate-900 rounded-lg border border-slate-800 p-4">
        <div className="text-xs text-slate-500 uppercase tracking-wider mb-3">IPFS Brief Viewer</div>
        <div className="flex gap-2">
          <input
            type="text"
            value={link}
            onChange={e => setLink(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleFetch()}
            placeholder="ipfs://bafkrei..."
            className="flex-1 text-xs bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-slate-200 placeholder-slate-600 focus:outline-none focus:border-blue-500 font-mono"
          />
          <button
            onClick={handleFetch}
            disabled={loading || !link.trim()}
            className="text-xs px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white transition-colors font-medium whitespace-nowrap"
          >
            {loading ? 'fetching...' : 'fetch'}
          </button>
        </div>
        {error && (
          <div className="mt-3 text-xs text-red-400 bg-red-950/30 border border-red-900 rounded p-2">{error}</div>
        )}
      </div>

      {/* Saved briefs */}
      {saved.length > 0 && (
        <div className="bg-slate-900 rounded-lg border border-slate-800 p-4">
          <div className="flex items-center justify-between mb-3">
            <div className="text-xs text-slate-500 uppercase tracking-wider">Saved briefs ({saved.length})</div>
            <button
              onClick={() => { if (window.confirm('Clear all saved briefs?')) setSaved([]) }}
              className="text-xs text-slate-600 hover:text-red-400 transition-colors"
            >
              clear all
            </button>
          </div>
          <div className="space-y-1.5">
            {saved.filter(e => !e.parentId).map(parent => {
              const children = saved.filter(e => e.parentId === parent.id)
              return (
                <div key={parent.id}>
                  <SavedRow
                    entry={parent}
                    onLoad={loadEntry}
                    onRename={renameEntry}
                    onDelete={deleteEntry}
                  />
                  {children.length > 0 && (
                    <div className="ml-3 mt-1 pl-3 border-l border-slate-800 space-y-1">
                      {children.map(child => (
                        <SavedRow
                          key={child.id}
                          entry={child}
                          onLoad={loadEntry}
                          onRename={renameEntry}
                          onDelete={deleteEntry}
                          nested
                        />
                      ))}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Primary brief */}
      {primaryBrief && (
        <BriefDisplay uri={primaryBrief.uri} spec={primaryBrief.spec} />
      )}

      {/* Nested briefs */}
      {nestedBriefs.length > 0 && (
        <div className="space-y-3">
          <div className="text-xs text-slate-500 uppercase tracking-wider px-1">
            Nested IPFS links — {nestedBriefs.length} found
          </div>
          {nestedBriefs.map(({ uri, spec }) => (
            <BriefDisplay key={uri} uri={uri} spec={spec} />
          ))}
        </div>
      )}
    </div>
  )
}
