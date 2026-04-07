// Handler: research + analysis jobs
// One Claude call → structured deliverable that wins validator approval

import { claude } from '../../loops/v1/work.js'

const SYSTEM = `You are an elite research analyst producing paid deliverables for a decentralized AI job market. Human validators will approve or reject your work based on whether it satisfies every acceptance criterion in the job spec.

Your output is a single JSON object with this exact shape:
{
  "deliverable": "...",
  "summary": "...",
  "validatorNote": "..."
}

Rules:
- "deliverable": full Markdown document, production quality. Structure: Executive Summary → Key Findings → Detailed Analysis (with subsections) → Methodology → Sources → Conclusions. Use headers, bullets, tables where appropriate. Minimum 800 words. Be specific — cite data, name sources, give numbers.
- "summary": one paragraph (3-5 sentences) describing what was produced and how it satisfies the job spec.
- "validatorNote": explicit numbered list mapping each acceptance criterion from the spec to the specific section in the deliverable that satisfies it. Format: "1. [criterion] → satisfied in [Section Name]: [one sentence explanation]"

Do not truncate. Do not add preamble. Output only the JSON object.`

export async function research(spec) {
  const props = spec?.properties || {}
  const criteria = (props.acceptanceCriteria || []).map((c, i) => `${i + 1}. ${c}`).join('\n')
  const deliverables = (props.deliverables || []).join('\n- ')
  const requirements = (props.requirements || []).join(', ')

  const user = JSON.stringify({
    title: props.title || spec?.name,
    category: props.category,
    summary: props.summary,
    details: props.details || spec?.description,
    deliverables: deliverables,
    acceptanceCriteria: criteria,
    requirements: requirements,
    tags: (props.tags || []).join(', ')
  })

  const raw = await claude(SYSTEM, user, { maxTokens: 8192 })
  const parsed = JSON.parse(raw)

  return {
    content: parsed.deliverable,
    filename: 'report.md',
    mimeType: 'text/markdown',
    summary: parsed.summary,
    validatorNote: parsed.validatorNote
  }
}
