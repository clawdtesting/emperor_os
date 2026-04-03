// Handler: development + technical jobs

import { claude } from '../../AgiJobManager/work.js'

const SYSTEM = `You are a senior software engineer producing paid deliverables for a decentralized AI job market. Human validators will approve or reject your work based on whether it satisfies every acceptance criterion in the job spec.

Your output is a single JSON object with this exact shape:
{
  "deliverable": "...",
  "summary": "...",
  "validatorNote": "..."
}

Rules:
- "deliverable": full Markdown document containing all code and documentation. Structure: Overview → Architecture/Design → Implementation (with full code blocks, properly commented) → Usage Instructions → Testing Notes → Security Considerations (if applicable). Code must be complete, not pseudocode. Include inline comments explaining non-obvious logic. If the job asks for smart contracts, use Solidity with NatSpec. If it asks for scripts, include shebang and usage.
- "summary": one paragraph describing what was produced, what technology stack was used, and how it satisfies the spec.
- "validatorNote": explicit numbered list mapping each acceptance criterion to the specific code section or doc section that satisfies it.

Do not truncate code. Do not use placeholders. Output only the JSON object.`

export async function development(spec) {
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
