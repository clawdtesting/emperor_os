import { useState } from 'react'

const GATEWAYS = [
  'https://ipfs.io/ipfs/',
  'https://cloudflare-ipfs.com/ipfs/',
  'https://gateway.pinata.cloud/ipfs/',
]

async function fetchFromIpfs(uri) {
  const cid = uri.replace('ipfs://', '')
  for (const gw of GATEWAYS) {
    try {
      const res = await fetch(gw + cid, { signal: AbortSignal.timeout(10000) })
      if (res.ok) {
        const text = await res.text()
        try {
          return { type: 'json', data: JSON.parse(text), raw: text }
        } catch {
          return { type: 'text', data: text, raw: text }
        }
      }
    } catch { continue }
  }
  throw new Error('All IPFS gateways failed — try again or check the CID')
}

// Extract all ipfs:// links from a raw string or nested object
function extractIpfsLinks(source) {
  const raw = typeof source === 'string' ? source : JSON.stringify(source)
  const matches = raw.match(/ipfs:\/\/[a-zA-Z0-9]+/g)
  return [...new Set(matches || [])]
}

// Parse plain-text / markdown into spec fields
function textToSpec(text, uri) {
  const lines = text.split('\n').map(l => l.trim()).filter(Boolean)

  // First markdown heading or first non-empty line → title
  const headingLine = lines.find(l => /^#+\s/.test(l))
  const title = headingLine
    ? headingLine.replace(/^#+\s+/, '')
    : (lines[0]?.length < 120 ? lines[0] : null) || uri

  // Everything after the title line → details
  const startIdx = headingLine
    ? lines.indexOf(headingLine) + 1
    : 1
  const details = lines.slice(startIdx).join('\n').trim()

  return {
    name: title,
    properties: {
      title,
      summary: '',
      details,
      category: '',
      tags: [],
      deliverables: [],
      acceptanceCriteria: [],
      requirements: [],
      payoutAGIALPHA: null,
      durationSeconds: null,
    },
  }
}

function normalizeToSpec(result, uri) {
  if (result.type === 'text') return textToSpec(result.data, uri)

  const data = result.data
  if (!data || typeof data !== 'object') return textToSpec(String(data ?? ''), uri)

  // Already a valid job spec
  if (data?.properties?.schema?.startsWith('agijobmanager')) return data

  // Try to build a spec from whatever fields exist
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

function BriefDisplay({ spec, uri }) {
  const p = spec?.properties || {}
  const durationDays = p.durationSeconds ? Math.round(p.durationSeconds / 86400) : null
  const cid = uri.replace('ipfs://', '')
  const cidShort = cid.slice(0, 12) + '...' + cid.slice(-6)

  return (
    <div className="bg-slate-900 rounded-xl border border-slate-700 overflow-hidden">
      <div className="border-b border-slate-800 px-5 py-3 flex items-center justify-between">
        <div className="text-sm font-semibold text-white">Job Brief</div>
        <a
          href={GATEWAYS[0] + cid}
          target="_blank"
          rel="noopener noreferrer"
          className="text-xs text-blue-400 hover:text-blue-300 font-mono"
        >
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
                  <span className="text-blue-500 shrink-0 mt-0.5">→</span>
                  <span>{d}</span>
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
                  <span className="text-green-500 shrink-0 mt-0.5">✓</span>
                  <span>{c}</span>
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
                  <span className="text-amber-500 shrink-0 mt-0.5">•</span>
                  <span>{r}</span>
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

export function IpfsTab() {
  const [link, setLink] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [primaryBrief, setPrimaryBrief] = useState(null)
  const [nestedBriefs, setNestedBriefs] = useState([])

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

      // Find and fetch nested IPFS links inside the raw content (excluding self)
      const nested = extractIpfsLinks(result.raw).filter(l => l !== uri)
      if (nested.length > 0) {
        const results = await Promise.allSettled(
          nested.map(async nestedUri => {
            const res = await fetchFromIpfs(nestedUri)
            return { uri: nestedUri, spec: normalizeToSpec(res, nestedUri) }
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

      {primaryBrief && (
        <BriefDisplay uri={primaryBrief.uri} spec={primaryBrief.spec} />
      )}

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
