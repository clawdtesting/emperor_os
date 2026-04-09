/** @typedef {'website'|'coding'|'design'|'research'|'content'|'automation'|'documentation'|'general'} RequestCategory */

/**
 * @typedef {Object} ChoiceOption
 * @property {string} id
 * @property {string} label
 * @property {string} value
 */

/**
 * @typedef {Object} FollowUpQuestion
 * @property {string} id
 * @property {RequestCategory|'shared'} category
 * @property {string} prompt
 * @property {string=} description
 * @property {ChoiceOption[]} options
 * @property {boolean} required
 * @property {number=} maxSelections
 */

/** @typedef {Record<string, string|string[]>} RequestAnswers */

/**
 * @typedef {Object} DraftJobSpec
 * @property {string} title
 * @property {string} summary
 * @property {RequestCategory} category
 * @property {string=} skillLevel
 * @property {string[]} assumptions
 * @property {string[]} scope
 * @property {string[]} constraints
 * @property {string[]} deliverables
 * @property {string[]} acceptanceCriteria
 * @property {string[]} exclusions
 * @property {string=} complexity
 * @property {string=} rewardHint
 * @property {string} rawUserInput
 */

const CATEGORIES = /** @type {RequestCategory[]} */ (['website', 'coding', 'design', 'research', 'content', 'automation', 'documentation', 'general'])

const CATEGORY_KEYWORDS = {
  website: ['website', 'webpage', 'landing', 'site', 'frontend', 'wordpress', 'portfolio', 'web app'],
  coding: ['code', 'script', 'api', 'backend', 'app', 'program', 'bug', 'feature', 'integration'],
  design: ['design', 'logo', 'figma', 'ui', 'ux', 'mockup', 'brand'],
  research: ['research', 'analyze', 'analysis', 'market', 'compare', 'benchmark', 'investigate'],
  content: ['content', 'write', 'copy', 'blog', 'article', 'post', 'newsletter'],
  automation: ['automation', 'automate', 'workflow', 'zapier', 'n8n', 'pipeline', 'scrape'],
  documentation: ['documentation', 'docs', 'readme', 'guide', 'manual', 'knowledge base'],
}

/** @type {FollowUpQuestion[]} */
const SHARED_QUESTIONS = [
  {
    id: 'skill_level',
    category: 'shared',
    prompt: 'How technical are you?',
    options: [
      { id: 'beginner', label: 'Beginner', value: 'beginner' },
      { id: 'basic', label: 'Basic', value: 'basic' },
      { id: 'intermediate', label: 'Intermediate', value: 'intermediate' },
      { id: 'advanced', label: 'Advanced', value: 'advanced' },
    ],
    required: true,
  },
  {
    id: 'deadline',
    category: 'shared',
    prompt: 'How fast do you need this delivered?',
    options: [
      { id: 'urgent', label: 'Urgent (24h)', value: 'urgent_24h' },
      { id: 'soon', label: 'Soon (3 days)', value: 'soon_3d' },
      { id: 'normal', label: 'Normal (1 week)', value: 'normal_1w' },
      { id: 'flexible', label: 'Flexible', value: 'flexible' },
    ],
    required: true,
  },
]

/** @type {Record<RequestCategory, FollowUpQuestion[]>} */
const CATEGORY_QUESTIONS = {
  website: [
    {
      id: 'website_type',
      category: 'website',
      prompt: 'What type of website do you need?',
      options: [
        { id: 'landing', label: 'Landing page', value: 'landing_page' },
        { id: 'multi', label: 'Multi-page website', value: 'multi_page' },
        { id: 'webapp', label: 'Web app', value: 'web_app' },
        { id: 'not_sure', label: 'Not sure', value: 'not_sure' },
      ],
      required: true,
    },
    {
      id: 'hosting',
      category: 'website',
      prompt: 'Hosting preference?',
      options: [
        { id: 'free_only', label: 'Yes, free only', value: 'free_only' },
        { id: 'free_preferred', label: 'Free preferred', value: 'free_preferred' },
        { id: 'paid_ok', label: 'Paid is okay', value: 'paid_ok' },
        { id: 'hosting_unsure', label: 'Not sure', value: 'not_sure' },
      ],
      required: true,
    },
    {
      id: 'content_ready',
      category: 'website',
      prompt: 'Do you already have website content?',
      options: [
        { id: 'yes', label: 'Yes', value: 'yes' },
        { id: 'partial', label: 'Partial', value: 'partial' },
        { id: 'need_help', label: 'No, I need help', value: 'need_help' },
      ],
      required: true,
    },
    {
      id: 'editing_preference',
      category: 'website',
      prompt: 'How should edits work after delivery?',
      options: [
        { id: 'simple_editor', label: 'Simple editor', value: 'simple_editor' },
        { id: 'markdown', label: 'Markdown files', value: 'markdown' },
        { id: 'developer_edits', label: 'Developer edits only', value: 'developer_only' },
      ],
      required: true,
    },
  ],
  coding: [
    {
      id: 'coding_outcome',
      category: 'coding',
      prompt: 'Primary coding outcome?',
      options: [
        { id: 'new_feature', label: 'Build a new feature', value: 'new_feature' },
        { id: 'bug_fix', label: 'Fix bugs', value: 'bug_fix' },
        { id: 'integration', label: 'Integrate APIs/tools', value: 'integration' },
        { id: 'refactor', label: 'Refactor existing code', value: 'refactor' },
      ],
      required: true,
    },
    {
      id: 'codebase_state',
      category: 'coding',
      prompt: 'Do you already have an existing codebase?',
      options: [
        { id: 'full_codebase', label: 'Yes, complete codebase', value: 'full' },
        { id: 'partial_codebase', label: 'Partial starter code', value: 'partial' },
        { id: 'no_codebase', label: 'No, start fresh', value: 'none' },
      ],
      required: true,
    },
  ],
  design: [
    {
      id: 'design_asset',
      category: 'design',
      prompt: 'What design asset is needed?',
      options: [
        { id: 'brand', label: 'Brand kit / logo', value: 'brand' },
        { id: 'ui_mockup', label: 'UI mockup', value: 'ui_mockup' },
        { id: 'full_system', label: 'Design system', value: 'design_system' },
      ],
      required: true,
    },
    {
      id: 'design_format',
      category: 'design',
      prompt: 'Preferred delivery format?',
      options: [
        { id: 'figma', label: 'Figma', value: 'figma' },
        { id: 'image_files', label: 'PNG/SVG files', value: 'image_files' },
        { id: 'both', label: 'Both', value: 'both' },
      ],
      required: true,
    },
  ],
  research: [
    {
      id: 'research_goal',
      category: 'research',
      prompt: 'What kind of research?',
      options: [
        { id: 'market', label: 'Market landscape', value: 'market' },
        { id: 'competitor', label: 'Competitor analysis', value: 'competitor' },
        { id: 'technical', label: 'Technical research', value: 'technical' },
      ],
      required: true,
    },
    {
      id: 'research_output',
      category: 'research',
      prompt: 'Preferred output format?',
      options: [
        { id: 'brief_report', label: 'Brief report', value: 'brief_report' },
        { id: 'deep_report', label: 'Deep report', value: 'deep_report' },
        { id: 'sheet_plus_summary', label: 'Spreadsheet + summary', value: 'sheet_plus_summary' },
      ],
      required: true,
    },
  ],
  content: [
    {
      id: 'content_type',
      category: 'content',
      prompt: 'What content do you need?',
      options: [
        { id: 'website_copy', label: 'Website copy', value: 'website_copy' },
        { id: 'blog_posts', label: 'Blog post(s)', value: 'blog_posts' },
        { id: 'social_pack', label: 'Social content pack', value: 'social_pack' },
      ],
      required: true,
    },
    {
      id: 'tone',
      category: 'content',
      prompt: 'Preferred writing tone?',
      options: [
        { id: 'professional', label: 'Professional', value: 'professional' },
        { id: 'friendly', label: 'Friendly', value: 'friendly' },
        { id: 'technical_tone', label: 'Technical', value: 'technical' },
        { id: 'tone_unsure', label: 'Not sure', value: 'not_sure' },
      ],
      required: true,
    },
  ],
  automation: [
    {
      id: 'automation_target',
      category: 'automation',
      prompt: 'What should be automated?',
      options: [
        { id: 'data_flow', label: 'Data flow between tools', value: 'data_flow' },
        { id: 'reporting', label: 'Recurring reporting', value: 'reporting' },
        { id: 'notifications', label: 'Alerts / notifications', value: 'notifications' },
      ],
      required: true,
    },
    {
      id: 'automation_stack',
      category: 'automation',
      prompt: 'Preferred stack?',
      options: [
        { id: 'no_code', label: 'No-code tools', value: 'no_code' },
        { id: 'code_script', label: 'Custom script', value: 'custom_code' },
        { id: 'either', label: 'Either', value: 'either' },
      ],
      required: true,
    },
  ],
  documentation: [
    {
      id: 'docs_type',
      category: 'documentation',
      prompt: 'Documentation type?',
      options: [
        { id: 'user_guide', label: 'User guide', value: 'user_guide' },
        { id: 'technical_docs', label: 'Technical docs', value: 'technical_docs' },
        { id: 'onboarding', label: 'Onboarding handbook', value: 'onboarding' },
      ],
      required: true,
    },
    {
      id: 'docs_depth',
      category: 'documentation',
      prompt: 'How detailed should it be?',
      options: [
        { id: 'quickstart', label: 'Quickstart', value: 'quickstart' },
        { id: 'standard', label: 'Standard detail', value: 'standard' },
        { id: 'comprehensive', label: 'Comprehensive', value: 'comprehensive' },
      ],
      required: true,
    },
  ],
  general: [
    {
      id: 'general_outcome',
      category: 'general',
      prompt: 'What outcome matters most?',
      options: [
        { id: 'launch_fast', label: 'Launch quickly', value: 'launch_fast' },
        { id: 'quality', label: 'Highest quality', value: 'quality' },
        { id: 'cost', label: 'Lowest cost', value: 'cost' },
        { id: 'unsure', label: 'Not sure', value: 'not_sure' },
      ],
      required: true,
    },
  ],
}

function normalizeText(rawText) {
  return String(rawText || '').toLowerCase()
}

/**
 * @param {string} rawText
 * @returns {RequestCategory}
 */
export function inferRequestCategory(rawText) {
  const text = normalizeText(rawText)
  if (!text.trim()) return 'general'

  let best = 'general'
  let bestScore = 0

  for (const category of CATEGORIES) {
    const keywords = CATEGORY_KEYWORDS[category] || []
    const score = keywords.reduce((acc, keyword) => (text.includes(keyword) ? acc + 1 : acc), 0)
    if (score > bestScore) {
      best = category
      bestScore = score
    }
  }

  return /** @type {RequestCategory} */ (best)
}

/**
 * @param {RequestCategory} category
 * @returns {FollowUpQuestion[]}
 */
export function getQuestionsForCategory(category) {
  return [...SHARED_QUESTIONS, ...(CATEGORY_QUESTIONS[category] || [])]
}

/**
 * @param {FollowUpQuestion[]} questions
 * @param {RequestAnswers} answers
 */
export function getMissingRequiredQuestions(questions, answers) {
  return questions
    .filter(question => question.required)
    .filter(question => !String(answers[question.id] || '').trim())
    .map(question => question.id)
}

function toTitleCase(value) {
  const clean = String(value || '').replace(/[_-]+/g, ' ').trim()
  if (!clean) return ''
  return clean.replace(/\b\w/g, char => char.toUpperCase())
}

/**
 * @param {string} rawUserInput
 * @param {RequestCategory} category
 * @param {RequestAnswers} answers
 * @returns {DraftJobSpec}
 */
export function buildDraftJobSpec(rawUserInput, category, answers) {
  const skillLevel = String(answers.skill_level || 'beginner')
  const deadline = String(answers.deadline || 'normal_1w')

  const websiteType = String(answers.website_type || 'not_sure')
  const hosting = String(answers.hosting || 'free_preferred')
  const contentReady = String(answers.content_ready || 'need_help')

  const beginnerSafe = skillLevel === 'beginner' || skillLevel === 'basic'

  const categorySpecificScope = {
    website: [
      websiteType === 'web_app' ? 'Implement a minimal web app shell with clear page routes.' : 'Implement a static website optimized for clarity and speed.',
      websiteType === 'multi_page' ? 'Deliver navigation with at least 3 clear sections.' : 'Deliver a focused primary page with clear calls to action.',
      contentReady === 'need_help' ? 'Include suggested starter copy blocks and placeholders.' : 'Integrate provided content into final pages.',
    ],
    coding: [
      `Implement coding outcome: ${toTitleCase(answers.coding_outcome || 'new_feature')}.`,
      'Preserve existing behavior unless explicitly changed in scope.',
      'Provide implementation notes for maintenance.',
    ],
    design: [
      `Design target: ${toTitleCase(answers.design_asset || 'ui_mockup')}.`,
      `Deliver format: ${toTitleCase(answers.design_format || 'figma')}.`,
      'Include one revision pass and final export package.',
    ],
    research: [
      `Research focus: ${toTitleCase(answers.research_goal || 'market')}.`,
      `Output style: ${toTitleCase(answers.research_output || 'brief_report')}.`,
      'Support findings with references and clear assumptions.',
    ],
    content: [
      `Content deliverable: ${toTitleCase(answers.content_type || 'website_copy')}.`,
      `Tone: ${toTitleCase(answers.tone || 'professional')}.`,
      'Provide final polished content ready for direct use.',
    ],
    automation: [
      `Automation target: ${toTitleCase(answers.automation_target || 'data_flow')}.`,
      `Preferred implementation style: ${toTitleCase(answers.automation_stack || 'either')}.`,
      'Include runbook steps for operation and recovery.',
    ],
    documentation: [
      `Documentation type: ${toTitleCase(answers.docs_type || 'user_guide')}.`,
      `Depth: ${toTitleCase(answers.docs_depth || 'standard')}.`,
      'Provide examples and clear structure for future updates.',
    ],
    general: [
      `Primary objective: ${toTitleCase(answers.general_outcome || 'launch_fast')}.`,
      'Translate request into a specific execution checklist.',
      'Return worker-ready structure with clear completion boundaries.',
    ],
  }

  const assumptions = [
    beginnerSafe ? 'Assume operator prefers simple, low-risk implementation choices.' : 'Assume operator can handle moderate implementation complexity.',
    deadline === 'urgent_24h' ? 'Prioritize a fast first-delivery version over optional extras.' : 'Balance quality and delivery speed with explicit milestones.',
    category === 'website' && (hosting === 'free_only' || hosting === 'free_preferred' || hosting === 'not_sure')
      ? 'Assume free hosting and static deployment unless backend is explicitly required.'
      : 'Assume tooling can include paid services if needed for scope.',
  ]

  const constraints = [
    hosting === 'free_only' ? 'Infrastructure must be free-tier compatible.' : 'Keep infrastructure costs clearly documented.',
    beginnerSafe ? 'Include beginner-friendly setup and handoff guidance.' : 'Include concise technical setup notes.',
    'Do not include out-of-scope features without explicit approval.',
  ]

  const deliverables = [
    'Structured implementation plan with ordered milestones.',
    category === 'website' ? 'Deployed website output and editable source files.' : 'Completed work artifact(s) in requested format.',
    'Handoff notes covering operation, edits, and next steps.',
  ]

  const acceptanceCriteria = [
    'All requested core scope items are delivered and verifiable.',
    'Deliverables are complete, organized, and usable without hidden dependencies.',
    beginnerSafe ? 'Instructions can be followed by a beginner without additional assumptions.' : 'Instructions are clear for a technical operator.',
  ]

  const exclusions = [
    'No hidden ongoing maintenance commitment after delivery.',
    'No additional features beyond defined scope without change approval.',
    category === 'website' ? 'No custom backend services unless explicitly requested.' : 'No unrelated platform migration or infrastructure redesign.',
  ]

  const complexity = beginnerSafe
    ? 'Low to Medium'
    : category === 'automation' || category === 'coding'
      ? 'Medium'
      : 'Low'

  const rewardHint = complexity === 'Low to Medium'
    ? 'Suggested reward hint: 50-150 AGIALPHA depending on speed requirements.'
    : 'Suggested reward hint: 120-300 AGIALPHA depending on required depth and deadline.'

  const titleSeed = category === 'website'
    ? `${toTitleCase(websiteType === 'not_sure' ? 'landing page' : websiteType)} build request`
    : `${toTitleCase(category)} job request`

  return {
    title: titleSeed,
    summary: String(rawUserInput || '').trim() || `Structured ${category} request`,
    category,
    skillLevel: toTitleCase(skillLevel),
    assumptions,
    scope: categorySpecificScope[category] || categorySpecificScope.general,
    constraints,
    deliverables,
    acceptanceCriteria,
    exclusions,
    complexity,
    rewardHint,
    rawUserInput: String(rawUserInput || '').trim(),
  }
}

/**
 * @param {DraftJobSpec} draft
 */
export function validateDraftJobSpec(draft) {
  const errors = []

  if (!String(draft?.title || '').trim()) errors.push('Title is required.')
  if (!String(draft?.summary || '').trim()) errors.push('Summary is required.')
  if (!Array.isArray(draft?.scope) || draft.scope.filter(Boolean).length === 0) errors.push('At least one scope item is required.')
  if (!Array.isArray(draft?.deliverables) || draft.deliverables.filter(Boolean).length === 0) errors.push('At least one deliverable is required.')
  if (!Array.isArray(draft?.acceptanceCriteria) || draft.acceptanceCriteria.filter(Boolean).length === 0) errors.push('At least one acceptance criterion is required.')

  return errors
}
