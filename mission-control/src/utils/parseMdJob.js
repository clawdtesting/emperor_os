/**
 * Parse an Emperor_OS Markdown job specification into a JobRequestDraft-compatible object.
 *
 * Expected format (loosely):
 *   category label(s)
 *   contract/lane identifier line
 *   Title — subtitle
 *
 *   Long description paragraph
 *
 *   tag1
 *   tag2
 *   Payout
 *   10,000
 *   AGIALPHA tokens
 *   Duration
 *   7 days
 *   604,800 sec window
 *   ...
 *   Deliverables
 *   item1
 *   item2
 *   Acceptance criteria
 *   criterion1
 *   ...
 *   Requirements
 *   req1
 *   ...
 *   Employer: ... · Contract: 0x... · createdVia: ...
 */

const KNOWN_CONTRACTS = {
  '0xb3aaeb69b630f0299791679c063d68d6687481d1': 'agijob_v1',
  '0xbf6699c1f24bebbfabb515583e88a055bf2f9ec2': 'agijob_v2',
  '0xd5ef1dde7ac60488f697ff2a7967a52172a78f29': 'prime_v1',
}

const KNOWN_CATEGORIES = ['creative', 'development', 'research', 'analysis', 'operations']

const SECTION_KEYWORDS = [
  'payout', 'duration', 'category', 'lane', 'deliverables',
  'acceptance criteria', 'requirements', 'execution phases',
]

function isSectionMarker(line) {
  const lower = line.toLowerCase()
  return SECTION_KEYWORDS.some(k => lower === k || lower.startsWith(k + ' '))
}

function findSections(lines) {
  const map = {}
  for (let i = 0; i < lines.length; i++) {
    const lower = lines[i].toLowerCase()
    if (lower === 'payout') map.payout = i
    else if (lower === 'duration') map.duration = i
    else if (lower === 'category') map.category = i
    else if (lower === 'lane') map.lane = i
    else if (lower === 'deliverables') map.deliverables = i
    else if (lower === 'acceptance criteria' || lower.startsWith('acceptance criteria')) map.acceptance = i
    else if (lower === 'requirements') map.requirements = i
    else if (lower.startsWith('execution phases')) map.phases = i
  }
  return map
}

function nextSectionAfter(sections, idx, totalLines) {
  const indices = Object.values(sections).filter(i => i > idx).sort((a, b) => a - b)
  return indices.length > 0 ? indices[0] : totalLines
}

function collectLines(lines, startIdx, sections) {
  const end = nextSectionAfter(sections, startIdx, lines.length)
  const result = []
  for (let i = startIdx + 1; i < end; i++) {
    const trimmed = lines[i].trim()
    if (trimmed) result.push(trimmed)
  }
  return result
}

/**
 * @param {string} rawMd
 * @returns {{ draft: object, protocol: string, warnings: string[] }}
 */
export function parseMdJobSpec(rawMd) {
  const warnings = []
  const rawLines = rawMd.split('\n')
  const lines = rawLines.map(l => l.trim())
  const sections = findSections(lines)
  const allSectionIndices = Object.values(sections).filter(Number.isFinite).sort((a, b) => a - b)
  const firstSectionIdx = allSectionIndices.length > 0 ? allSectionIndices[0] : lines.length

  // ── Detect contract address ──────────────────────────────────────────────────
  let contract = ''
  let protocol = ''
  for (const line of lines) {
    const m = line.match(/0x[a-fA-F0-9]{40}/)
    if (m) {
      const addr = m[0].toLowerCase()
      if (KNOWN_CONTRACTS[addr]) {
        contract = m[0]
        protocol = KNOWN_CONTRACTS[addr]
        break
      }
    }
  }
  if (!protocol) {
    const full = rawMd.toLowerCase()
    if (full.includes('prime') || full.includes('commit-reveal')) protocol = 'prime_v1'
    else if (full.includes('v2')) protocol = 'agijob_v2'
    else protocol = 'agijob_v1'
    warnings.push('Contract address not detected — protocol inferred from keywords: ' + protocol)
  }

  // ── Extract title ────────────────────────────────────────────────────────────
  // First line > 30 chars in the header block that isn't a contract/lane label
  let title = ''
  let titleIdx = -1
  for (let i = 0; i < firstSectionIdx; i++) {
    const line = lines[i]
    if (line.length < 25) continue
    const lower = line.toLowerCase()
    // Skip lines that are just contract identifiers
    if (/^(ethereum|base|polygon)\s+mainnet/i.test(line)) continue
    if (/^AGIJob(Manager|DiscoveryPrime)/i.test(line) && !line.includes('—') && !line.includes(' - ')) continue
    title = line
    titleIdx = i
    break
  }
  if (!title) {
    // Fallback: longest line in header
    let best = ''
    for (let i = 0; i < Math.min(6, firstSectionIdx); i++) {
      if (lines[i].length > best.length) { best = lines[i]; titleIdx = i }
    }
    title = best
  }

  // ── Extract description ──────────────────────────────────────────────────────
  // Next long line (>50 chars) after title, before tags
  let description = ''
  if (titleIdx >= 0) {
    for (let i = titleIdx + 1; i < firstSectionIdx; i++) {
      if (lines[i].length > 50) {
        description = lines[i]
        break
      }
    }
  }

  // ── Extract tags ─────────────────────────────────────────────────────────────
  const tags = []
  const descIdx = description ? lines.indexOf(description) : titleIdx
  const tagEnd = sections.payout ?? firstSectionIdx
  for (let i = (descIdx >= 0 ? descIdx + 1 : 0); i < tagEnd; i++) {
    const line = lines[i]
    if (line && line.length > 0 && line.length < 30 && !isSectionMarker(line) && !line.startsWith('+')) {
      tags.push(line.toLowerCase().replace(/\s+/g, '-'))
    }
  }

  // ── Extract payout ───────────────────────────────────────────────────────────
  let payoutAmount = 0
  if (sections.payout != null) {
    for (const line of collectLines(lines, sections.payout, sections)) {
      const num = line.replace(/,/g, '').match(/^([\d.]+)/)
      if (num) { payoutAmount = Number(num[1]); break }
    }
  }

  // ── Extract duration ─────────────────────────────────────────────────────────
  let durationSeconds = 86400
  let durationDays = null
  let durationSecRaw = null
  if (sections.duration != null) {
    for (const line of collectLines(lines, sections.duration, sections)) {
      const secMatch = line.replace(/,/g, '').match(/([\d]+)\s*sec/)
      if (secMatch) durationSecRaw = Number(secMatch[1])
      const dayMatch = line.match(/([\d.]+)\s*day/)
      if (dayMatch) durationDays = Number(dayMatch[1])
    }
    if (durationDays != null && durationSecRaw != null) {
      const expectedSec = Math.round(durationDays * 86400)
      if (expectedSec !== durationSecRaw) {
        warnings.push(
          `Duration mismatch: ${durationDays} days = ${expectedSec}s but spec says ${durationSecRaw}s. Using ${durationDays} days (${expectedSec}s).`
        )
      }
      // Prefer days (human intent) when there is a mismatch
      durationSeconds = expectedSec
    } else if (durationSecRaw != null) {
      durationSeconds = durationSecRaw
    } else if (durationDays != null) {
      durationSeconds = Math.round(durationDays * 86400)
    }
  }

  // ── Extract category ─────────────────────────────────────────────────────────
  let category = 'other'
  if (sections.category != null) {
    for (const line of collectLines(lines, sections.category, sections)) {
      const clean = line.replace(/^\+\s*/, '').toLowerCase().trim()
      if (KNOWN_CATEGORIES.includes(clean)) { category = clean; break }
    }
  }
  if (category === 'other') {
    for (let i = 0; i < Math.min(3, firstSectionIdx); i++) {
      if (KNOWN_CATEGORIES.includes(lines[i].toLowerCase())) {
        category = lines[i].toLowerCase()
        break
      }
    }
  }

  // ── Extract deliverables ─────────────────────────────────────────────────────
  const deliverables = sections.deliverables != null
    ? collectLines(lines, sections.deliverables, sections)
    : []

  // ── Extract acceptance criteria ──────────────────────────────────────────────
  const acceptanceCriteria = sections.acceptance != null
    ? collectLines(lines, sections.acceptance, sections)
    : []

  // ── Extract requirements ─────────────────────────────────────────────────────
  let requirements = []
  if (sections.requirements != null) {
    requirements = collectLines(lines, sections.requirements, sections)
      .filter(l => !l.startsWith('Employer:') && !l.startsWith('· Employer') && !l.startsWith('Target contract'))
  }

  // ── Extract employer / createdVia from footer ────────────────────────────────
  let employer = ''
  let createdVia = 'Emperor_os'
  for (let i = lines.length - 1; i >= Math.max(0, lines.length - 5); i--) {
    const line = lines[i]
    if (!employer) {
      const m = line.match(/Employer:\s*([^\s·]+)/)
      if (m) employer = m[1]
    }
    if (line.includes('createdVia:')) {
      const m = line.match(/createdVia:\s*(.+?)(?:\s*$)/)
      if (m) createdVia = m[1].trim()
    }
    if (!contract) {
      const m = line.match(/(?:Contract|Target contract):\s*(0x[a-fA-F0-9]{40})/)
      if (m) {
        contract = m[1]
        const addr = m[1].toLowerCase()
        if (KNOWN_CONTRACTS[addr] && !protocol) protocol = KNOWN_CONTRACTS[addr]
      }
    }
  }

  // ── Detect lane ──────────────────────────────────────────────────────────────
  let lane = 'v1'
  if (protocol === 'prime_v1') lane = 'prime-v1'
  else if (protocol === 'agijob_v2') lane = 'v2'

  // ── Validation warnings ──────────────────────────────────────────────────────
  if (!title) warnings.push('Could not detect job title.')
  if (!description) warnings.push('Could not detect job description.')
  if (payoutAmount <= 0) warnings.push('Payout amount not detected or zero.')
  if (deliverables.length === 0) warnings.push('No deliverables detected.')
  if (acceptanceCriteria.length === 0) warnings.push('No acceptance criteria detected.')

  return {
    draft: {
      title,
      summary: description || title,
      details: description || title,
      category,
      locale: 'en-US',
      tags,
      deliverables,
      acceptanceCriteria,
      requirements,
      payoutAGIALPHA: payoutAmount,
      durationSeconds,
      chainId: 1,
      contract,
      employer,
      lane,
      createdVia,
    },
    protocol,
    warnings,
  }
}
