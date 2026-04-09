import { useMemo, useState } from 'react'
import { createJobRequest } from '../api'
import {
  DEFAULT_REQUEST_IMAGE,
  DURATION_SECONDS_BY_UI_VALUE,
  createDefaultJobRequestDraft,
  toLegacyJobRequestPayload,
} from '../models/jobSpecV2'
import {
  buildDraftJobSpec,
  getMissingRequiredQuestions,
  getQuestionsForCategory,
  inferRequestCategory,
  validateDraftJobSpec,
} from '../features/request/requestBuilder'

const DURATION_OPTIONS = {
  urgent_24h: '4h',
  soon_3d: '3d',
  normal_1w: '7d',
  flexible: '7d',
}

function makeIpfsUri(payload) {
  const json = JSON.stringify(payload)
  const bytes = new TextEncoder().encode(json)
  const binary = Array.from(bytes, b => String.fromCharCode(b)).join('')
  const encoded = btoa(binary).slice(0, 46)
  return `ipfs://${encoded}`
}

function parseLines(raw) {
  return String(raw || '').split('\n').map(v => v.trim()).filter(Boolean)
}

function toLineBlock(list) {
  return Array.isArray(list) ? list.join('\n') : ''
}

function statusPill(label, value) {
  return (
    <span className="text-[11px] px-2 py-1 rounded border border-slate-700 bg-slate-950 text-slate-300">
      {label}: <span className="text-slate-100">{value}</span>
    </span>
  )
}

export function JobRequestTab({ wallet }) {
  const [rawRequest, setRawRequest] = useState('')
  const [step, setStep] = useState(1)
  const [category, setCategory] = useState('general')
  const [questions, setQuestions] = useState([])
  const [answers, setAnswers] = useState({})
  const [questionIndex, setQuestionIndex] = useState(0)
  const [draft, setDraft] = useState(null)

  const [editingTitle, setEditingTitle] = useState('')
  const [editingSummary, setEditingSummary] = useState('')
  const [editingScope, setEditingScope] = useState('')
  const [editingDeliverables, setEditingDeliverables] = useState('')
  const [editingAcceptance, setEditingAcceptance] = useState('')

  const [posting, setPosting] = useState(false)
  const [result, setResult] = useState(null)
  const [error, setError] = useState('')

  const walletReady = Boolean(wallet?.isConnected)

  const currentQuestion = questions[questionIndex]
  const requiredMissing = useMemo(() => getMissingRequiredQuestions(questions, answers), [questions, answers])

  const publishPayload = useMemo(() => {
    if (!draft || !walletReady || !wallet?.account) return null
    return {
      walletAddress: wallet.account,
      rawUserInput: rawRequest.trim(),
      category,
      answers,
      draft,
      createdAt: new Date().toISOString(),
    }
  }, [draft, walletReady, wallet, rawRequest, category, answers])

  const publishValidationErrors = useMemo(() => {
    if (!draft) return []
    return validateDraftJobSpec(draft)
  }, [draft])

  function resetBuilderState() {
    setStep(1)
    setCategory('general')
    setQuestions([])
    setAnswers({})
    setQuestionIndex(0)
    setDraft(null)
    setEditingTitle('')
    setEditingSummary('')
    setEditingScope('')
    setEditingDeliverables('')
    setEditingAcceptance('')
    setError('')
    setResult(null)
  }

  function handleBuildRequest() {
    setError('')
    setResult(null)

    if (!walletReady) {
      setError('Connect MetaMask to create a request.')
      return
    }
    if (!rawRequest.trim()) {
      setError('Request text is required.')
      return
    }

    const inferred = inferRequestCategory(rawRequest)
    const flow = getQuestionsForCategory(inferred)

    setCategory(inferred)
    setQuestions(flow)
    setAnswers({})
    setQuestionIndex(0)
    setStep(2)
  }

  function handleSelectAnswer(value) {
    if (!currentQuestion) return
    setAnswers(prev => ({ ...prev, [currentQuestion.id]: value }))
    setError('')
  }

  function handleNextQuestion() {
    if (!currentQuestion) return
    const currentAnswer = String(answers[currentQuestion.id] || '').trim()
    if (currentQuestion.required && !currentAnswer) {
      setError('Select an option to continue.')
      return
    }

    setError('')
    if (questionIndex >= questions.length - 1) {
      const nextDraft = buildDraftJobSpec(rawRequest, category, answers)
      setDraft(nextDraft)
      setEditingTitle(nextDraft.title)
      setEditingSummary(nextDraft.summary)
      setEditingScope(toLineBlock(nextDraft.scope))
      setEditingDeliverables(toLineBlock(nextDraft.deliverables))
      setEditingAcceptance(toLineBlock(nextDraft.acceptanceCriteria))
      setStep(3)
      return
    }

    setQuestionIndex(index => index + 1)
  }

  function handlePrevQuestion() {
    if (questionIndex <= 0) return
    setQuestionIndex(index => index - 1)
    setError('')
  }

  function handleApplyEditsAndContinue() {
    if (!draft) return

    const nextDraft = {
      ...draft,
      title: editingTitle.trim(),
      summary: editingSummary.trim(),
      scope: parseLines(editingScope),
      deliverables: parseLines(editingDeliverables),
      acceptanceCriteria: parseLines(editingAcceptance),
    }

    const validation = validateDraftJobSpec(nextDraft)
    if (validation.length > 0) {
      setError(validation[0])
      return
    }

    setDraft(nextDraft)
    setError('')
    setStep(4)
  }

  async function handleCreateJobRequest() {
    if (!publishPayload) {
      setError('Wallet is required before creating a request.')
      return
    }
    if (requiredMissing.length > 0) {
      setError('Answer all required questions before publishing.')
      return
    }
    if (publishValidationErrors.length > 0) {
      setError(publishValidationErrors[0])
      return
    }

    setPosting(true)
    setError('')
    setResult(null)

    try {
      const draftModel = {
        ...createDefaultJobRequestDraft(),
        title: draft.title,
        summary: draft.summary,
        details: [
          `Raw request: ${publishPayload.rawUserInput}`,
          '',
          'Scope:',
          ...draft.scope.map(item => `- ${item}`),
          '',
          'Constraints:',
          ...draft.constraints.map(item => `- ${item}`),
          '',
          'Deliverables:',
          ...draft.deliverables.map(item => `- ${item}`),
          '',
          'Acceptance criteria:',
          ...draft.acceptanceCriteria.map(item => `- ${item}`),
          '',
          'Exclusions:',
          ...draft.exclusions.map(item => `- ${item}`),
        ].join('\n'),
        category: draft.category,
        tags: [draft.category, String(draft.skillLevel || 'beginner').toLowerCase()],
        deliverables: draft.deliverables,
        acceptanceCriteria: draft.acceptanceCriteria,
        requirements: draft.constraints,
        payoutAGIALPHA: 100,
        durationSeconds: DURATION_SECONDS_BY_UI_VALUE[DURATION_OPTIONS[String(answers.deadline || 'normal_1w')]] || DURATION_SECONDS_BY_UI_VALUE['7d'],
        chainId: wallet.chainIdDecimal || 1,
        contract: '',
        createdBy: wallet.account,
      }

      const ipfsUri = makeIpfsUri(publishPayload)
      const response = await createJobRequest(toLegacyJobRequestPayload(draftModel, {
        durationUiValue: DURATION_OPTIONS[String(answers.deadline || 'normal_1w')] || '7d',
        ipfsUri,
        imageUri: DEFAULT_REQUEST_IMAGE,
      }))

      setResult({ ...response, publishPayload })
    } catch (e) {
      setError(e.message || 'Failed to publish request payload.')
    } finally {
      setPosting(false)
    }
  }

  return (
    <div className="bg-slate-900 rounded-lg border border-slate-800 p-4 space-y-4">
      <div>
        <div className="text-xs text-slate-500 uppercase tracking-wider">Request Builder</div>
        <div className="text-sm text-slate-300 mt-1">Guided, deterministic request compiler for AGIJobManager.</div>
      </div>

      <div className="rounded border border-slate-800 bg-slate-950 p-3 flex flex-wrap items-center gap-2">
        {statusPill('wallet', walletReady ? 'connected' : 'not connected')}
        {statusPill('step', String(step))}
        {statusPill('category', category)}
        {!walletReady && (
          <button
            onClick={wallet?.connect}
            disabled={!wallet?.providerAvailable || wallet?.status === 'connecting'}
            className="text-xs px-3 py-1.5 rounded border border-amber-700 text-amber-200 hover:bg-amber-900/30 disabled:opacity-50"
          >
            {wallet?.status === 'connecting' ? 'Connecting...' : 'Connect MetaMask to create a request'}
          </button>
        )}
      </div>

      {step === 1 && (
        <div className="space-y-3">
          <label className="block space-y-1">
            <span className="text-xs text-slate-400">Describe what you need in simple words</span>
            <textarea
              rows={5}
              value={rawRequest}
              onChange={e => setRawRequest(e.target.value)}
              disabled={!walletReady}
              placeholder="Example: I need a free webpage for my AI project and I am a beginner"
              className="w-full bg-slate-950 border border-slate-700 rounded px-3 py-2 text-sm outline-none focus:border-blue-500 disabled:opacity-60"
            />
          </label>
          <div className="text-[11px] text-slate-500">Tip: write your goal, budget preference, and your technical level.</div>
          <button
            onClick={handleBuildRequest}
            disabled={!walletReady || !rawRequest.trim()}
            className="px-3 py-2 rounded bg-blue-600 text-white text-sm disabled:opacity-50 disabled:cursor-not-allowed hover:bg-blue-500"
          >
            Build my request
          </button>
        </div>
      )}

      {step === 2 && currentQuestion && (
        <div className="space-y-3">
          <div className="text-xs text-slate-500">Question {questionIndex + 1} of {questions.length}</div>
          <div className="rounded border border-slate-700 bg-slate-950 p-3">
            <div className="text-sm text-slate-100 font-semibold">{currentQuestion.prompt}</div>
            <div className="mt-3 space-y-2">
              {currentQuestion.options.map(option => {
                const checked = answers[currentQuestion.id] === option.value
                return (
                  <label
                    key={option.id}
                    className={`flex items-center gap-2 px-3 py-2 rounded border text-sm cursor-pointer ${checked ? 'border-blue-500 bg-blue-950/30 text-blue-100' : 'border-slate-700 text-slate-300 hover:bg-slate-900'}`}
                  >
                    <input
                      type="radio"
                      name={currentQuestion.id}
                      checked={checked}
                      onChange={() => handleSelectAnswer(option.value)}
                    />
                    <span>{option.label}</span>
                  </label>
                )
              })}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handlePrevQuestion}
              disabled={questionIndex === 0}
              className="text-xs px-3 py-2 rounded border border-slate-700 text-slate-200 hover:bg-slate-800 disabled:opacity-50"
            >
              Back
            </button>
            <button
              onClick={handleNextQuestion}
              className="text-xs px-3 py-2 rounded border border-blue-700 text-blue-200 hover:bg-blue-900/20"
            >
              {questionIndex === questions.length - 1 ? 'Generate draft' : 'Next'}
            </button>
          </div>
        </div>
      )}

      {step === 3 && draft && (
        <div className="space-y-3">
          <div className="text-xs text-slate-500 uppercase tracking-wider">Step 3 · Draft job specification</div>

          <label className="block space-y-1">
            <span className="text-xs text-slate-400">Title</span>
            <input
              value={editingTitle}
              onChange={e => setEditingTitle(e.target.value)}
              className="w-full bg-slate-950 border border-slate-700 rounded px-3 py-2 text-sm outline-none focus:border-blue-500"
            />
          </label>

          <label className="block space-y-1">
            <span className="text-xs text-slate-400">Summary</span>
            <textarea
              rows={3}
              value={editingSummary}
              onChange={e => setEditingSummary(e.target.value)}
              className="w-full bg-slate-950 border border-slate-700 rounded px-3 py-2 text-sm outline-none focus:border-blue-500"
            />
          </label>

          <div className="grid md:grid-cols-2 gap-3 text-xs">
            <div className="rounded border border-slate-800 bg-slate-950 p-3">
              <div className="text-slate-500">Category</div>
              <div className="text-slate-200 mt-1">{draft.category}</div>
            </div>
            <div className="rounded border border-slate-800 bg-slate-950 p-3">
              <div className="text-slate-500">Audience / skill level</div>
              <div className="text-slate-200 mt-1">{draft.skillLevel || 'Beginner'}</div>
            </div>
          </div>

          <div className="grid md:grid-cols-2 gap-3">
            <label className="block space-y-1">
              <span className="text-xs text-slate-400">Scope (one per line)</span>
              <textarea
                rows={5}
                value={editingScope}
                onChange={e => setEditingScope(e.target.value)}
                className="w-full bg-slate-950 border border-slate-700 rounded px-3 py-2 text-sm outline-none focus:border-blue-500"
              />
            </label>
            <label className="block space-y-1">
              <span className="text-xs text-slate-400">Deliverables (one per line)</span>
              <textarea
                rows={5}
                value={editingDeliverables}
                onChange={e => setEditingDeliverables(e.target.value)}
                className="w-full bg-slate-950 border border-slate-700 rounded px-3 py-2 text-sm outline-none focus:border-blue-500"
              />
            </label>
          </div>

          <label className="block space-y-1">
            <span className="text-xs text-slate-400">Acceptance criteria (one per line)</span>
            <textarea
              rows={4}
              value={editingAcceptance}
              onChange={e => setEditingAcceptance(e.target.value)}
              className="w-full bg-slate-950 border border-slate-700 rounded px-3 py-2 text-sm outline-none focus:border-blue-500"
            />
          </label>

          <div className="grid md:grid-cols-2 gap-3 text-xs">
            <div className="rounded border border-slate-800 bg-slate-950 p-3">
              <div className="text-slate-500 mb-1">Constraints</div>
              <ul className="space-y-1 text-slate-300 list-disc pl-4">
                {draft.constraints.map((item, index) => <li key={index}>{item}</li>)}
              </ul>
            </div>
            <div className="rounded border border-slate-800 bg-slate-950 p-3">
              <div className="text-slate-500 mb-1">Exclusions</div>
              <ul className="space-y-1 text-slate-300 list-disc pl-4">
                {draft.exclusions.map((item, index) => <li key={index}>{item}</li>)}
              </ul>
            </div>
          </div>

          <div className="flex gap-2">
            <button
              onClick={() => setStep(2)}
              className="text-xs px-3 py-2 rounded border border-slate-700 text-slate-200 hover:bg-slate-800"
            >
              Back to questions
            </button>
            <button
              onClick={handleApplyEditsAndContinue}
              className="text-xs px-3 py-2 rounded border border-blue-700 text-blue-200 hover:bg-blue-900/20"
            >
              Continue to final review
            </button>
          </div>
        </div>
      )}

      {step === 4 && draft && (
        <div className="space-y-3">
          <div className="text-xs text-slate-500 uppercase tracking-wider">Step 4 · Final review and create job</div>
          <div className="rounded border border-slate-700 bg-slate-950 p-3 text-xs space-y-2">
            <div><span className="text-slate-500">Title:</span> <span className="text-slate-100">{draft.title}</span></div>
            <div><span className="text-slate-500">Category:</span> <span className="text-slate-100">{draft.category}</span></div>
            <div><span className="text-slate-500">Complexity:</span> <span className="text-slate-100">{draft.complexity || '—'}</span></div>
            <div><span className="text-slate-500">Reward hint:</span> <span className="text-slate-100">{draft.rewardHint || '—'}</span></div>
            <div><span className="text-slate-500">Wallet:</span> <span className="text-slate-100 font-mono">{wallet?.account || 'not connected'}</span></div>
          </div>

          {!walletReady && (
            <div className="text-xs text-amber-300 bg-amber-950/30 border border-amber-900 rounded p-2">
              Connect MetaMask before creating the request.
            </div>
          )}

          {publishValidationErrors.length > 0 && (
            <div className="text-xs text-amber-300 bg-amber-950/30 border border-amber-900 rounded p-2">
              {publishValidationErrors[0]}
            </div>
          )}

          <div className="flex gap-2">
            <button
              onClick={() => setStep(3)}
              className="text-xs px-3 py-2 rounded border border-slate-700 text-slate-200 hover:bg-slate-800"
            >
              Back to draft
            </button>
            <button
              onClick={handleCreateJobRequest}
              disabled={posting || !walletReady || publishValidationErrors.length > 0}
              className="px-3 py-2 rounded bg-blue-600 text-white text-sm disabled:opacity-50 disabled:cursor-not-allowed hover:bg-blue-500"
            >
              {posting ? 'Creating request...' : 'Create job request'}
            </button>
            <button
              onClick={resetBuilderState}
              className="text-xs px-3 py-2 rounded border border-slate-700 text-slate-200 hover:bg-slate-800"
            >
              Start new request
            </button>
          </div>
        </div>
      )}

      {error && <div className="text-xs text-red-400 bg-red-950/30 border border-red-900 rounded p-2">{error}</div>}

      {result && (
        <div className="text-xs text-emerald-300 bg-emerald-950/30 border border-emerald-900 rounded p-2 space-y-1">
          <div>Request payload created.</div>
          {result.tool && <div className="text-emerald-200">tool: {result.tool}</div>}
          {result.jobId && <div className="text-emerald-200">jobId: {result.jobId}</div>}
          {result.publishPayload && (
            <details className="mt-2">
              <summary className="cursor-pointer text-emerald-200">View publish payload</summary>
              <pre className="mt-2 p-2 rounded bg-slate-950 text-slate-300 overflow-x-auto">{JSON.stringify(result.publishPayload, null, 2)}</pre>
            </details>
          )}
        </div>
      )}
    </div>
  )
}
