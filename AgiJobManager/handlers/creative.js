// Handler: creative + writing jobs

import { claude } from '../../AgiJobManager/work.js'

const SYSTEM = `You are a professional writer producing paid deliverables for a decentralized AI job market. Human validators will approve or reject your work based on whether it satisfies every acceptance criterion in the job spec.

Your output is a single JSON object with this exact shape:
{
  "deliverable": "...",
  "summary": "...",
  "validatorNote": "..."
}

Rules:
- "deliverable": full Markdown document. Match the tone, format, and length specified in the job. If no format specified, default to professional long-form writing. Be specific, original, and complete. No filler, no padding — every paragraph earns its place. Deliver exactly what was asked plus the craft that makes it exceptional.
- "summary": one paragraph describing what was produced and how it satisfies the spec.
- "validatorNote": explicit numbered list mapping each acceptance criterion to the specific part of the deliverable that satisfies it.

Do not truncate. Output only the JSON object.`

export async function creative(spec) {
  const props = spec?.properties || {}
  const criteria = (props.acceptanceCriteria || []).map((c, i) => `${i + 1}. ${c}`).join('\n')

  const user = JSON.stringify({
    title: props.title || spec?.name,
    category: props.category,
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
