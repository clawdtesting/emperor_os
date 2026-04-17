/** @typedef {'agijob_v1'|'agijob_v2'|'prime_v1'|'prime_v2'} ProtocolType */
/** @typedef {'website'|'coding'|'design'|'research'|'content'|'automation'|'documentation'|'general'} RequestCategory */
/** @typedef {Record<string, string|string[]>} RequestAnswers */

const CATEGORY_KEYWORDS = {
  website: ['website', 'webpage', 'landing', 'site', 'frontend', 'wordpress', 'portfolio', 'web app'],
  coding: ['code', 'script', 'api', 'backend', 'app', 'program', 'bug', 'feature', 'integration'],
  design: ['design', 'logo', 'figma', 'ui', 'ux', 'mockup', 'brand'],
  research: ['research', 'analyze', 'analysis', 'market', 'compare', 'benchmark', 'investigate'],
  content: ['content', 'write', 'copy', 'blog', 'article', 'post', 'newsletter'],
  automation: ['automation', 'automate', 'workflow', 'zapier', 'n8n', 'pipeline'],
  documentation: ['documentation', 'docs', 'readme', 'guide', 'manual', 'knowledge base'],
}

/** @type {Array<{id:string,category:RequestCategory|'shared',protocol:ProtocolType|'all',prompt:string,required:boolean,options:Array<{id:string,label:string,value:string}>}>} */
const QUESTIONS = [
  {
    id: 'skill_level', category: 'shared', protocol: 'all', prompt: 'How technical are you?', required: true,
    options: [
      { id: 'beginner', label: 'Beginner', value: 'beginner' },
      { id: 'basic', label: 'Basic', value: 'basic' },
      { id: 'intermediate', label: 'Intermediate', value: 'intermediate' },
      { id: 'advanced', label: 'Advanced', value: 'advanced' },
    ],
  },
  {
    id: 'deadline', category: 'shared', protocol: 'all', prompt: 'Delivery target?', required: true,
    options: [
      { id: 'urgent', label: 'Urgent (24h)', value: 'urgent_24h' },
      { id: 'soon', label: 'Soon (3 days)', value: 'soon_3d' },
      { id: 'normal', label: 'Normal (1 week)', value: 'normal_1w' },
      { id: 'flex', label: 'Flexible', value: 'flexible' },
    ],
  },
  {
    id: 'website_type', category: 'website', protocol: 'all', prompt: 'What type of website do you need?', required: true,
    options: [
      { id: 'landing', label: 'Landing page', value: 'landing_page' },
      { id: 'multi', label: 'Multi-page website', value: 'multi_page' },
      { id: 'webapp', label: 'Web app', value: 'web_app' },
      { id: 'unsure', label: 'Not sure', value: 'not_sure' },
    ],
  },
  {
    id: 'hosting', category: 'website', protocol: 'all', prompt: 'Hosting preference?', required: true,
    options: [
      { id: 'free_only', label: 'Yes, free only', value: 'free_only' },
      { id: 'free_pref', label: 'Free preferred', value: 'free_preferred' },
      { id: 'paid_ok', label: 'Paid is okay', value: 'paid_ok' },
      { id: 'host_unsure', label: 'Not sure', value: 'not_sure' },
    ],
  },
  {
    id: 'content_ready', category: 'website', protocol: 'all', prompt: 'Do you already have content?', required: true,
    options: [
      { id: 'yes', label: 'Yes', value: 'yes' },
      { id: 'partial', label: 'Partial', value: 'partial' },
      { id: 'help', label: 'No, I need help', value: 'need_help' },
    ],
  },
  {
    id: 'editing_preference', category: 'website', protocol: 'all', prompt: 'Post-delivery editing preference?', required: true,
    options: [
      { id: 'simple', label: 'Simple editor', value: 'simple_editor' },
      { id: 'markdown', label: 'Markdown files', value: 'markdown' },
      { id: 'dev_only', label: 'Developer edits only', value: 'developer_only' },
    ],
  },
  {
    id: 'prime_competition_bias', category: 'shared', protocol: 'prime_v1', prompt: 'Prime flow strategy focus?', required: true,
    options: [
      { id: 'speed', label: 'Fast shortlist path', value: 'speed' },
      { id: 'quality', label: 'Highest quality evidence', value: 'quality' },
      { id: 'balanced', label: 'Balanced', value: 'balanced' },
    ],
  },
]

function toTitleCase(value) {
  return String(value || '').replace(/[_-]+/g, ' ').replace(/\b\w/g, c => c.toUpperCase()).trim()
}

/** @param {string} rawText */
export function inferRequestCategory(rawText) {
  const text = String(rawText || '').toLowerCase()
  let best = 'general'
  let bestScore = 0
  for (const [category, keywords] of Object.entries(CATEGORY_KEYWORDS)) {
    const score = keywords.reduce((acc, keyword) => acc + (text.includes(keyword) ? 1 : 0), 0)
    if (score > bestScore) {
      best = category
      bestScore = score
    }
  }
  return /** @type {RequestCategory} */ (best)
}

/** @param {ProtocolType} protocol @param {RequestCategory} category */
export function getQuestionsForCategory(protocol, category) {
  return QUESTIONS.filter(question => {
    const protocolMatch = question.protocol === 'all' || question.protocol === protocol
    const categoryMatch = question.category === 'shared' || question.category === category
    return protocolMatch && categoryMatch
  })
}

export function getMissingRequiredQuestions(questions, answers) {
  return questions.filter(q => q.required && !String(answers[q.id] || '').trim()).map(q => q.id)
}

/**
 * @param {ProtocolType} protocol
 * @param {{tokenAddress:string,symbol:string,amount:string}} payment
 * @param {string} rawUserInput
 * @param {RequestCategory} category
 * @param {RequestAnswers} answers
 */
export function buildDraftJobSpec(protocol, payment, rawUserInput, category, answers) {
  const skillLevel = String(answers.skill_level || 'beginner')
  const websiteType = String(answers.website_type || 'not_sure')
  const hosting = String(answers.hosting || 'free_preferred')
  const beginnerSafe = skillLevel === 'beginner' || skillLevel === 'basic'

  const protocolAssumption = protocol === 'prime_v1'
    ? 'Delivery must include procurement-legible structure for shortlist evaluation.'
    : protocol === 'agijob_v2'
      ? 'Use AGIJobManager v2-compatible metadata and cleaner structured output.'
      : 'Use AGIJobManager v1-compatible structure with explicit task boundaries.'

  const scope = category === 'website'
    ? [
      websiteType === 'web_app' ? 'Implement a minimal web app shell with page routes.' : 'Implement a static website optimized for clarity and speed.',
      websiteType === 'multi_page' ? 'Deliver at least 3 linked sections/pages.' : 'Deliver a focused main page with clear call-to-action blocks.',
      String(answers.content_ready || 'need_help') === 'need_help' ? 'Include starter copy guidance and editable placeholders.' : 'Integrate provided content in final pages.',
    ]
    : [
      `Primary outcome: ${toTitleCase(answers.general_outcome || category) || toTitleCase(category)}.`,
      'Produce worker-ready implementation checklist with bounded scope.',
      'Provide clear handoff notes and operational guidance.',
    ]

  const constraints = [
    category === 'website' && (hosting === 'free_only' || hosting === 'free_preferred' || hosting === 'not_sure')
      ? 'Favor free-tier static hosting unless backend is explicitly required.'
      : 'Document infrastructure/tool costs explicitly.',
    beginnerSafe ? 'Include beginner-safe setup and editing instructions.' : 'Include concise technical setup notes.',
    protocolAssumption,
  ]

  const complexity = beginnerSafe ? 'Low to Medium' : 'Medium'

  return {
    title: category === 'website' ? `${toTitleCase(websiteType === 'not_sure' ? 'landing page' : websiteType)} build request` : `${toTitleCase(category)} job request`,
    summary: String(rawUserInput || '').trim(),
    protocol,
    category,
    skillLevel: toTitleCase(skillLevel),
    assumptions: [
      beginnerSafe ? 'Assume low-risk, beginner-friendly defaults.' : 'Assume operator can handle moderate complexity.',
      protocolAssumption,
      `Payment denomination is ${payment.symbol || 'token'} with target payout ${payment.amount || '0'}.`,
    ],
    scope,
    constraints,
    deliverables: [
      'Structured implementation plan with milestones.',
      category === 'website' ? 'Website output + editable source files.' : 'Completed artifact(s) in requested format.',
      'Handoff notes for operation and next steps.',
    ],
    acceptanceCriteria: [
      'All core scope items are delivered and verifiable.',
      'Deliverables are organized and directly usable.',
      beginnerSafe ? 'Instructions are executable by a beginner.' : 'Instructions are complete for a technical operator.',
    ],
    exclusions: [
      'No out-of-scope feature additions without change approval.',
      category === 'website' ? 'No custom backend unless explicitly requested.' : 'No unrelated platform migration.',
      protocol === 'prime_v1' ? 'No skipping procurement evidence requirements.' : 'No hidden maintenance obligation after delivery.',
    ],
    complexity,
    rewardHint: complexity === 'Low to Medium'
      ? `Suggested reward hint: 50-150 ${payment.symbol || 'TOKEN'}.`
      : `Suggested reward hint: 120-300 ${payment.symbol || 'TOKEN'}.`,
    rawUserInput: String(rawUserInput || '').trim(),
    payment: {
      tokenAddress: payment.tokenAddress,
      symbol: payment.symbol,
      amount: payment.amount,
    },
  }
}

export function validateDraftJobSpec(draft) {
  const errors = []
  if (!String(draft?.title || '').trim()) errors.push('Title is required.')
  if (!String(draft?.summary || '').trim()) errors.push('Summary is required.')
  if (!draft?.protocol) errors.push('Protocol is required.')
  if (!draft?.payment?.tokenAddress) errors.push('Payment token is required.')
  if (!Array.isArray(draft?.scope) || draft.scope.filter(Boolean).length === 0) errors.push('At least one scope item is required.')
  if (!Array.isArray(draft?.deliverables) || draft.deliverables.filter(Boolean).length === 0) errors.push('At least one deliverable is required.')
  if (!Array.isArray(draft?.acceptanceCriteria) || draft.acceptanceCriteria.filter(Boolean).length === 0) errors.push('At least one acceptance criterion is required.')
  return errors
}
