// test_02 — full flow simulation
// Pin job spec → generate SVG logo via LLM router → pin SVG → pin completion metadata
// Run from repo root: node tests/test_02/run.js

import { readFileSync, writeFileSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import { llmChat, listProviders } from '../../agent/llm-router.js'

const DIR = join(dirname(fileURLToPath(import.meta.url)))
const JWT = process.env.PINATA_JWT

if (!JWT) { console.error('PINATA_JWT required'); process.exit(1) }
if (!listProviders().some(p => p.enabled)) {
  console.error('No LLM provider enabled — set ANTHROPIC_API_KEY / OPENAI_API_KEY / GEMINI_API_KEY / OPENROUTER_API_KEY, or run Ollama.')
  process.exit(1)
}

// ── Pinata helpers ──────────────────────────────────────────────────────────

async function pinJson(obj, name) {
  const res = await fetch('https://api.pinata.cloud/pinning/pinJSONToIPFS', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${JWT}` },
    body: JSON.stringify({ pinataContent: obj, pinataMetadata: { name } })
  })
  if (!res.ok) throw new Error(`Pinata JSON ${res.status}: ${await res.text()}`)
  const { IpfsHash } = await res.json()
  return { uri: `ipfs://${IpfsHash}`, cid: IpfsHash, gateway: `https://ipfs.io/ipfs/${IpfsHash}` }
}

async function pinFile(content, filename, mimeType) {
  const form = new FormData()
  form.append('file', new Blob([content], { type: mimeType }), filename)
  form.append('pinataMetadata', JSON.stringify({ name: filename }))
  const res = await fetch('https://api.pinata.cloud/pinning/pinFileToIPFS', {
    method: 'POST',
    headers: { Authorization: `Bearer ${JWT}` },
    body: form
  })
  if (!res.ok) throw new Error(`Pinata file ${res.status}: ${await res.text()}`)
  const { IpfsHash } = await res.json()
  return { uri: `ipfs://${IpfsHash}`, cid: IpfsHash, gateway: `https://ipfs.io/ipfs/${IpfsHash}` }
}

// ── LLM call (provider-agnostic) ────────────────────────────────────────────

async function claudeCall(system, user, maxTokens = 8192) {
  return llmChat(system, user, { maxTokens, temperature: 0, timeoutMs: 300_000 })
}

async function generate(spec) {
  const props = spec.properties
  const brand = props.context.brand
  const jobCtx = JSON.stringify({
    title:              props.title,
    details:            props.details,
    deliverables:       props.deliverables,
    acceptanceCriteria: props.acceptanceCriteria,
    palette:            brand.paletteHex,
    visualReference:    brand.visualReference,
    avoid:              brand.avoid
  })

  // Step 1: Generate SVG only (plain text, no JSON wrapper to avoid truncation)
  const svgSystem = `You are an expert SVG illustrator producing a paid logo deliverable for the AGI Alpha job market.

Output ONLY a complete, self-contained SVG document (viewBox="0 0 512 512") representing the Emperor_OS logo.
The SVG MUST:
• Use the palette: gold #C9A84C, matte black #1A1A1A, crimson #9B1C1C, royal purple #4B0082, and cream #F5E6C8
• Depict a stylised mechanical emperor head/crown icon — regal, dark, detailed
• Include a jewelled crown, glowing red eye lenses, and armour elements using SVG shapes, gradients, and filters
• Have a transparent background (no background rect, or explicit fill="none" on root)
• Be readable at both 512×512 and 64×64 (use bold, clear shapes — avoid hairlines)
• Be valid, self-contained SVG with no external resources

Output ONLY the SVG markup. No preamble. No markdown fences. No JSON.`

  const svgText = await claudeCall(svgSystem, jobCtx, 8192)
  const deliverable = svgText.replace(/^```(?:xml|svg)?\n?/, '').replace(/\n?```$/, '').trim()
  if (!deliverable.startsWith('<svg') && !deliverable.startsWith('<?xml')) {
    throw new Error('Claude did not return SVG markup')
  }

  // Step 2: Generate summary + validatorNote (small JSON, no risk of truncation)
  const metaSystem = `You reviewed an SVG logo deliverable for the AGI Alpha job market.
Output a single JSON object:
{
  "summary": "2-3 sentence description of the design choices made.",
  "validatorNote": "numbered list mapping each acceptance criterion to the SVG element or technique that satisfies it."
}
Output ONLY the JSON object. No preamble. No markdown fences.`

  const metaUser = `Job spec:\n${jobCtx}\n\nSVG produced (first 500 chars):\n${deliverable.slice(0, 500)}`
  const metaText = await claudeCall(metaSystem, metaUser, 1024)
  const meta = JSON.parse(metaText.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '').trim())

  return { deliverable, summary: meta.summary, validatorNote: meta.validatorNote }
}

// ── Main ────────────────────────────────────────────────────────────────────

async function run() {
  console.log('='.repeat(60))
  console.log('test_02 — Emperor_OS Logo design flow simulation')
  console.log('='.repeat(60))

  const spec  = JSON.parse(readFileSync(join(DIR, 'job_spec.json'), 'utf8'))
  const props = spec.properties

  // 1. Pin job spec
  console.log('\n[1/4] Pinning job spec...')
  const specPin = await pinJson(spec, 'test_02-job-spec')
  console.log(`      ✓ ${specPin.uri}`)
  console.log(`        ${specPin.gateway}`)

  // 2. Generate SVG logo via LLM router
  console.log('\n[2/4] Generating SVG logo (via llm-router)...')
  const work = await generate(spec)
  console.log(`      ✓ ${work.deliverable.length} chars of SVG produced`)

  // 3. Pin SVG deliverable
  console.log('\n[3/4] Pinning SVG deliverable...')
  const delivPin = await pinFile(work.deliverable, 'emperor_os_logo.svg', 'image/svg+xml')
  console.log(`      ✓ ${delivPin.uri}`)
  console.log(`        ${delivPin.gateway}`)

  // 4. Build + pin completion metadata
  console.log('\n[4/4] Pinning completion metadata...')
  const completion = {
    name:        `AGI Job Completion · ${props.title}`,
    description: `Final completion for test_02. Resolves to the Emperor_OS SVG logo via image field.`,
    image:       delivPin.uri,
    attributes: [
      { trait_type: 'Kind',                value: 'job-completion' },
      { trait_type: 'Job ID',              value: 'test_02' },
      { trait_type: 'Category',            value: props.category },
      { trait_type: 'Final Asset Type',    value: 'SVG' },
      { trait_type: 'Locale',              value: 'en-US' },
      { trait_type: 'Completion Standard', value: 'Public IPFS deliverables' }
    ],
    properties: {
      schema:            'agijobmanager/job-completion/v1',
      kind:              'job-completion',
      version:           '1.0.0',
      locale:            'en-US',
      title:             props.title,
      summary:           work.summary,
      jobId:             'test_02',
      jobSpecURI:        specPin.uri,
      jobSpecGatewayURI: specPin.gateway,
      finalDeliverables: [{
        name:        'Emperor_OS Logo (SVG)',
        uri:         delivPin.uri,
        gatewayURI:  delivPin.gateway,
        description: work.summary
      }],
      validatorNote:    work.validatorNote,
      completionStatus: 'submitted',
      chainId:          1,
      contract:         '0xB3AAeb69b630f0299791679c063d68d6687481d1',
      createdVia:       'emperor-agent',
      generatedAt:      new Date().toISOString()
    },
    external_url: specPin.gateway
  }

  const metaPin = await pinJson(completion, 'test_02-completion')
  console.log(`      ✓ ${metaPin.uri}`)
  console.log(`        ${metaPin.gateway}`)

  // Save results
  const results = {
    test:               'test_02',
    timestamp:          new Date().toISOString(),
    jobSpecURI:         specPin.uri,
    jobSpecGateway:     specPin.gateway,
    deliverableURI:     delivPin.uri,
    deliverableGateway: delivPin.gateway,
    completionURI:      metaPin.uri,
    completionGateway:  metaPin.gateway,
    nextStep: `request_job_completion(jobId, "${metaPin.uri}")`
  }

  writeFileSync(join(DIR, 'results.json'), JSON.stringify(results, null, 2))
  writeFileSync(join(DIR, 'deliverable.svg'), work.deliverable)

  console.log('\n' + '='.repeat(60))
  console.log('DONE')
  console.log('='.repeat(60))
  console.log(`\nSpec:        ${specPin.uri}`)
  console.log(`Deliverable: ${delivPin.uri}`)
  console.log(`Completion:  ${metaPin.uri}`)
  console.log(`\nNext (on-chain): request_job_completion(jobId, "${metaPin.uri}")`)
}

run().catch(e => { console.error('[fatal]', e.message); process.exit(1) })
