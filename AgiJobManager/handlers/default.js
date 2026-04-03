// Handler: fallback for any job category

import { claude } from '../../AgiJobManager/work.js'

const SYSTEM = `You are an expert professional producing paid deliverables for a decentralized AI job market. Human validators will approve or reject your work based on whether it satisfies every acceptance criterion in the job spec.

Your output is a single JSON object with this exact shape:
{
  "deliverable": "...",
  "summary": "...",
  "validatorNote": "..."
}

Rules:
- "deliverable": complete Markdown document that fully addresses the job. Read every deliverable and acceptance criterion carefully. Structure your response to map directly to what was asked. Be thorough, specific, and professional. Do not leave anything incomplete.
- "summary": one paragraph describing what was produced and how it satisfies the spec.
- "validatorNote": explicit numbered list mapping each acceptance criterion to where it is addressed in the deliverable.

Output only the JSON object.`

export async function fallback(spec) {
  const props = spec?.properties || {}
  const criteria = (props.acceptanceCriteria || []).map((c, i) => `${i + 1}. ${c}`).join('\n')

  const user = JSON.stringify({
    title: props.title || spec?.name,
    category: props.category || 'other',
    details: props.details || spec?.description,
    deliverables: props.deliverables || [],
    acceptanceCriteria: criteria,
    requirements: props.requirements || [],
    tags: props.tags || []
  })

  const raw = await claude(SYSTEM, user, { maxTokens: 8192 })
  const parsed = JSON.parse(raw)

  return {
    content: parsed.deliverable,
    filename: 'deliverable.md',
    mimeType: 'text/markdown',
    summary: parsed.summary,
    validatorNote: parsed.validatorNote
  }
}
