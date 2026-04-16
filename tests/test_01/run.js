// test_01 — full flow simulation
// Pin job spec → generate deliverable via Claude → pin deliverable → pin completion metadata
// Run from: agent/ directory (node ../tests/test_01/run.js)

import { readFileSync, writeFileSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import { llmCall } from '../../config/llm_router.js'

const DIR   = join(dirname(fileURLToPath(import.meta.url)))
const JWT   = process.env.PINATA_JWT
const MODEL = process.env.ANTHROPIC_MODEL || 'claude-sonnet-4-6'

if (!JWT)  { console.error('PINATA_JWT required');         process.exit(1) }

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

// ── Claude call ─────────────────────────────────────────────────────────────

async function generate(spec) {
  const props = spec.properties

  const system = `You are an elite writer producing a paid deliverable for the AGI Alpha job market.
Human validators will approve or reject based on whether every acceptance criterion is met.

Output a single JSON object:
{
  "deliverable": "...",
  "summary": "...",
  "validatorNote": "..."
}

Rules:
- "deliverable": complete Markdown document. No Solidity, no jargon. Use analogies, plain English, ASCII diagrams. Minimum 800 words. Cover both contracts fully.
- "summary": 2-3 sentence description of what was produced.
- "validatorNote": numbered list mapping each acceptance criterion to the section that satisfies it.

Output only the JSON object. No preamble.`

  const user = JSON.stringify({
    title:              props.title,
    details:            props.details,
    deliverables:       props.deliverables,
    acceptanceCriteria: props.acceptanceCriteria,
    tags:               props.tags
  })

  const text = await llmCall(system, user, spec, {
    model: MODEL,
    max_tokens: 8192,
    temperature: 0,
    timeout_ms: 120_000,
  })
  const cleaned = text.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '').trim()
  if (!cleaned) throw new Error('Empty LLM response')
  return JSON.parse(cleaned)
}

// ── Main ────────────────────────────────────────────────────────────────────

async function run() {
  console.log('='.repeat(60))
  console.log('test_01 — AGI Alpha flow simulation')
  console.log('='.repeat(60))

  const spec = JSON.parse(readFileSync(join(DIR, 'job_spec.json'), 'utf8'))
  const props = spec.properties

  // 1. Pin job spec
  console.log('\n[1/4] Pinning job spec...')
  const specPin = await pinJson(spec, 'test_01-job-spec')
  console.log(`      ✓ ${specPin.uri}`)
  console.log(`        ${specPin.gateway}`)

  // 2. Generate deliverable via Claude
  console.log('\n[2/4] Generating deliverable (Claude)...')
  const work = await generate(spec)
  console.log(`      ✓ ${work.deliverable.length} chars produced`)

  // 3. Pin deliverable
  console.log('\n[3/4] Pinning deliverable...')
  const delivPin = await pinFile(work.deliverable, 'deliverable.md', 'text/markdown')
  console.log(`      ✓ ${delivPin.uri}`)
  console.log(`        ${delivPin.gateway}`)

  // 4. Build + pin completion metadata
  console.log('\n[4/4] Pinning completion metadata...')
  const completion = {
    name:        `AGI Job Completion · ${props.title}`,
    description: `Final completion for test_01. Resolves to deliverable via image field.`,
    image:       delivPin.uri,
    attributes: [
      { trait_type: 'Kind',                value: 'job-completion' },
      { trait_type: 'Job ID',              value: 'test_01' },
      { trait_type: 'Category',            value: props.category },
      { trait_type: 'Final Asset Type',    value: 'Markdown' },
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
      jobId:             'test_01',
      jobSpecURI:        specPin.uri,
      jobSpecGatewayURI: specPin.gateway,
      finalDeliverables: [{
        name:        'Primary deliverable',
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

  const metaPin = await pinJson(completion, 'test_01-completion')
  console.log(`      ✓ ${metaPin.uri}`)
  console.log(`        ${metaPin.gateway}`)

  // Save results
  const results = {
    test:           'test_01',
    timestamp:      new Date().toISOString(),
    jobSpecURI:     specPin.uri,
    jobSpecGateway: specPin.gateway,
    deliverableURI: delivPin.uri,
    deliverableGateway: delivPin.gateway,
    completionURI:  metaPin.uri,
    completionGateway: metaPin.gateway,
    nextStep: `request_job_completion(jobId, "${metaPin.uri}")`
  }

  writeFileSync(join(DIR, 'results.json'), JSON.stringify(results, null, 2))
  writeFileSync(join(DIR, 'deliverable.md'), work.deliverable)

  console.log('\n' + '='.repeat(60))
  console.log('DONE')
  console.log('='.repeat(60))
  console.log(`\nSpec:        ${specPin.uri}`)
  console.log(`Deliverable: ${delivPin.uri}`)
  console.log(`Completion:  ${metaPin.uri}`)
  console.log(`\nNext (on-chain): request_job_completion(jobId, "${metaPin.uri}")`)
}

run().catch(e => { console.error('[fatal]', e.message); process.exit(1) })
