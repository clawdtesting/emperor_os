import { useEffect, useMemo, useState } from 'react'
import { createJobRequest, pinJsonToIpfs } from '../api'
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
import { PROTOCOL_OPTIONS, getProtocolOption } from '../features/request/protocolConfig'
import { approveToken, formatUnits, parseUnits, readAllowance } from '../features/request/erc20'

const STATIC_TOKEN_OPTIONS = [
  { id: 'agialpha', symbol: 'AGIALPHA', address: '', decimals: 18 },
]

const DEADLINE_TO_DURATION = {
  urgent_24h: '4h',
  soon_3d: '3d',
  normal_1w: '7d',
  flexible: '7d',
}

function parseLines(raw) {
  return String(raw || '').split('\n').map(v => v.trim()).filter(Boolean)
}

function toLineBlock(list) {
  return Array.isArray(list) ? list.join('\n') : ''
}

function normalizeAddress(address) {
  const value = String(address || '').trim()
  if (!/^0x[a-fA-F0-9]{40}$/.test(value)) return ''
  return value.toLowerCase()
}

function extractCid(uri) {
  const value = String(uri || '').trim()
  if (!value.startsWith('ipfs://')) return ''
  return value.replace('ipfs://', '').split('/')[0]
}

function statusPill(label, value) {
  return (
    <span className="text-[11px] px-2 py-1 rounded border border-slate-700 bg-slate-950 text-slate-300">
      {label}: <span className="text-slate-100">{value}</span>
    </span>
  )
}

export function JobRequestTab({ wallet }) {
  const walletReady = Boolean(wallet?.isConnected)

  const [step, setStep] = useState(1)
  const [error, setError] = useState('')

  const [protocolId, setProtocolId] = useState('')
  const [tokenAddress, setTokenAddress] = useState('')
  const [tokenSymbol, setTokenSymbol] = useState('')
  const [tokenDecimals, setTokenDecimals] = useState(18)
  const [payoutAmount, setPayoutAmount] = useState('')

  const [allowanceLoading, setAllowanceLoading] = useState(false)
  const [approvePending, setApprovePending] = useState(false)
  const [approveTxHash, setApproveTxHash] = useState('')
  const [allowanceBaseUnits, setAllowanceBaseUnits] = useState(0n)

  const [rawRequest, setRawRequest] = useState('')
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

  const [ipfsUploading, setIpfsUploading] = useState(false)
  const [ipfsResult, setIpfsResult] = useState(null)

  const [posting, setPosting] = useState(false)
  const [result, setResult] = useState(null)

  const tokenOptions = useMemo(() => [{ ...STATIC_TOKEN_OPTIONS[0], address: normalizeAddress(wallet?.agiToken) || '' }], [wallet?.agiToken])
  const protocol = useMemo(() => getProtocolOption(protocolId), [protocolId])
  const amountBaseUnits = useMemo(() => {
    try {
      if (!payoutAmount) return 0n
      return parseUnits(payoutAmount, Number(tokenDecimals || 18))
    } catch {
      return null
    }
  }, [payoutAmount, tokenDecimals])

  const payoutPreview = useMemo(() => {
    if (amountBaseUnits === null) return 'invalid amount'
    return `${formatUnits(amountBaseUnits || 0n, Number(tokenDecimals || 18), 6)} ${tokenSymbol || 'TOKEN'}`
  }, [amountBaseUnits, tokenDecimals, tokenSymbol])

  const approvalRequired = useMemo(() => {
    if (!walletReady || !protocol || !normalizeAddress(tokenAddress) || amountBaseUnits === null) return false
    return (allowanceBaseUnits || 0n) < (amountBaseUnits || 0n)
  }, [walletReady, protocol, tokenAddress, amountBaseUnits, allowanceBaseUnits])

  const requiredMissing = useMemo(() => getMissingRequiredQuestions(questions, answers), [questions, answers])
  const currentQuestion = questions[questionIndex]

  const paymentState = useMemo(() => ({
    tokenAddress: normalizeAddress(tokenAddress),
    symbol: tokenSymbol,
    decimals: Number(tokenDecimals || 18),
    amount: payoutAmount,
    amountBaseUnits: amountBaseUnits ? amountBaseUnits.toString() : '',
  }), [tokenAddress, tokenSymbol, tokenDecimals, payoutAmount, amountBaseUnits])

  const publishPayload = useMemo(() => {
    if (!draft || !ipfsResult || !wallet?.account) return null
    return {
      version: 'mission-control-request/v1',
      walletAddress: wallet.account,
      protocol: protocolId,
      rawUserInput: rawRequest.trim(),
      category,
      answers,
      payment: paymentState,
      draft,
      ipfs: ipfsResult,
      createdAt: new Date().toISOString(),
    }
  }, [draft, ipfsResult, wallet, protocolId, rawRequest, category, answers, paymentState])

  useEffect(() => {
    const selected = tokenOptions[0]
    if (!tokenAddress) {
      setTokenAddress(selected.address)
      setTokenSymbol(selected.symbol)
      setTokenDecimals(selected.decimals)
      setPayoutAmount('100')
    }
  }, [tokenAddress, tokenOptions])

  useEffect(() => {
    async function refreshAllowance() {
      if (!walletReady || !protocol?.spenderAddress || !wallet?.account) {
        setAllowanceBaseUnits(0n)
        return
      }
      const normalizedToken = normalizeAddress(tokenAddress)
      if (!normalizedToken) {
        setAllowanceBaseUnits(0n)
        return
      }

      setAllowanceLoading(true)
      try {
        const allowance = await readAllowance({
          tokenAddress: normalizedToken,
          owner: wallet.account,
          spender: protocol.spenderAddress,
        })
        setAllowanceBaseUnits(allowance)
      } catch (e) {
        setError(e.message || 'Failed to read token allowance.')
      } finally {
        setAllowanceLoading(false)
      }
    }

    refreshAllowance()
  }, [walletReady, wallet, protocol, tokenAddress, approveTxHash])

  function resetAfterProtocolPaymentChange() {
    setCategory('general')
    setRawRequest('')
    setQuestions([])
    setAnswers({})
    setQuestionIndex(0)
    setDraft(null)
    setIpfsResult(null)
    setResult(null)
    setError('')
    setStep(4)
  }

  function validateProtocolAndPayment() {
    if (!walletReady) return 'Connect MetaMask to create a request.'
    if (!protocol) return 'Select a protocol before continuing.'
    if (!normalizeAddress(tokenAddress)) return 'Valid token address is required.'
    if (!tokenSymbol.trim()) return 'Token symbol is required.'
    if (!Number.isFinite(Number(tokenDecimals)) || Number(tokenDecimals) < 0) return 'Token decimals must be valid.'
    if (amountBaseUnits === null || amountBaseUnits <= 0n) return 'Payout amount must be greater than zero.'
    return ''
  }

  function handleBuildRequest() {
    setError('')
    setResult(null)
    const protocolAndPaymentError = validateProtocolAndPayment()
    if (protocolAndPaymentError) {
      setError(protocolAndPaymentError)
      return
    }
    if (approvalRequired) {
      setError('Token approval is required before request building.')
      return
    }
    if (!rawRequest.trim()) {
      setError('Request text is required.')
      return
    }

    const inferred = inferRequestCategory(rawRequest)
    const flow = getQuestionsForCategory(protocolId, inferred)

    setCategory(inferred)
    setQuestions(flow)
    setAnswers({})
    setQuestionIndex(0)
    setStep(5)
  }

  async function handleApproveToken() {
    setError('')
    if (!walletReady || !protocol?.spenderAddress || !wallet?.account) {
      setError('Wallet and protocol are required for token approval.')
      return
    }
    const normalizedToken = normalizeAddress(tokenAddress)
    if (!normalizedToken || amountBaseUnits === null || amountBaseUnits <= 0n) {
      setError('Valid token and payout amount are required for approval.')
      return
    }

    setApprovePending(true)
    try {
      const txHash = await approveToken({
        tokenAddress: normalizedToken,
        owner: wallet.account,
        spender: protocol.spenderAddress,
        amountBaseUnits,
      })
      setApproveTxHash(txHash)
    } catch (e) {
      setError(e.message || 'Token approval failed.')
    } finally {
      setApprovePending(false)
    }
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

    if (questionIndex >= questions.length - 1) {
      const nextDraft = buildDraftJobSpec(protocolId, paymentState, rawRequest, category, answers)
      setDraft(nextDraft)
      setEditingTitle(nextDraft.title)
      setEditingSummary(nextDraft.summary)
      setEditingScope(toLineBlock(nextDraft.scope))
      setEditingDeliverables(toLineBlock(nextDraft.deliverables))
      setEditingAcceptance(toLineBlock(nextDraft.acceptanceCriteria))
      setStep(6)
      return
    }

    setQuestionIndex(index => index + 1)
  }

  function handleApplyDraftEdits() {
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
    setStep(7)
  }

  async function handleUploadToIpfs() {
    if (!draft) return
    setError('')
    setIpfsUploading(true)

    try {
      const payload = {
        version: 'mission-control-job-request-spec/v1',
        generatedAt: new Date().toISOString(),
        protocol: protocolId,
        rawUserInput: rawRequest.trim(),
        category,
        answers,
        payment: paymentState,
        draft,
      }
      const ipfs = await pinJsonToIpfs(payload, `${protocolId}-${Date.now()}-job-request.json`)
      if (!ipfs?.uri || !extractCid(ipfs.uri)) {
        throw new Error('IPFS upload did not return a valid URI.')
      }
      setIpfsResult({ cid: ipfs.cid || extractCid(ipfs.uri), uri: ipfs.uri, gatewayUrl: ipfs.gatewayUrl || '' })
      setStep(8)
    } catch (e) {
      setError(e.message || 'IPFS upload failed.')
    } finally {
      setIpfsUploading(false)
    }
  }

  async function handleCreateJobRequest() {
    setError('')
    if (!publishPayload) {
      setError('Publish payload is incomplete. Upload to IPFS first.')
      return
    }
    if (approvalRequired) {
      setError('Approval must be sufficient before creating a job request.')
      return
    }
    if (requiredMissing.length > 0) {
      setError('All required questions must be answered.')
      return
    }

    setPosting(true)
    try {
      const durationKey = DEADLINE_TO_DURATION[String(answers.deadline || 'normal_1w')] || '7d'
      const draftModel = {
        ...createDefaultJobRequestDraft(),
        title: draft.title,
        summary: draft.summary,
        details: JSON.stringify(publishPayload, null, 2),
        category: draft.category,
        tags: [draft.category, draft.protocol, paymentState.symbol],
        deliverables: draft.deliverables,
        acceptanceCriteria: draft.acceptanceCriteria,
        requirements: draft.constraints,
        payoutAGIALPHA: Number.parseFloat(payoutAmount || '0') || 0,
        durationSeconds: DURATION_SECONDS_BY_UI_VALUE[durationKey] || DURATION_SECONDS_BY_UI_VALUE['7d'],
        chainId: wallet.chainIdDecimal || 1,
        contract: protocol?.contractAddress || '',
        createdBy: wallet.account,
      }

      const response = await createJobRequest(toLegacyJobRequestPayload(draftModel, {
        durationUiValue: durationKey,
        ipfsUri: ipfsResult.uri,
        imageUri: DEFAULT_REQUEST_IMAGE,
      }))

      setResult({ ...response, publishPayload })
    } catch (e) {
      setError(e.message || 'Create job request failed.')
    } finally {
      setPosting(false)
    }
  }

  return (
    <div className="bg-slate-900 rounded-lg border border-slate-800 p-4 space-y-4">
      <div>
        <div className="text-xs text-slate-500 uppercase tracking-wider">Request Wizard</div>
        <div className="text-sm text-slate-300 mt-1">Protocol-aware guided compiler for AGI job creation.</div>
      </div>

      <div className="rounded border border-slate-800 bg-slate-950 p-3 flex flex-wrap items-center gap-2">
        {statusPill('wallet', walletReady ? 'connected' : 'not connected')}
        {statusPill('step', String(step))}
        {statusPill('protocol', protocol?.label || 'not selected')}
        {statusPill('approval', approvalRequired ? 'required' : 'sufficient')}
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

      <div className="rounded border border-slate-800 bg-slate-950 p-3 space-y-3">
        <div className="text-xs text-slate-500 uppercase tracking-wider">Step 1 · Protocol selection</div>
        <div className="grid md:grid-cols-3 gap-2">
          {PROTOCOL_OPTIONS.map(option => {
            const selected = protocolId === option.id
            return (
              <button
                key={option.id}
                onClick={() => {
                  setProtocolId(option.id)
                  resetAfterProtocolPaymentChange()
                }}
                disabled={!walletReady}
                className={`text-left rounded border p-3 ${selected ? 'border-blue-500 bg-blue-950/30' : 'border-slate-700 bg-slate-900'} disabled:opacity-60`}
              >
                <div className="text-sm text-slate-100 font-semibold">{option.label}</div>
                <div className="text-xs text-slate-400 mt-1">{option.description}</div>
              </button>
            )
          })}
        </div>
      </div>

      <div className="rounded border border-slate-800 bg-slate-950 p-3 space-y-3">
        <div className="text-xs text-slate-500 uppercase tracking-wider">Step 2 · Payment token and payout</div>
        <div className="grid md:grid-cols-2 gap-3">
          <label className="space-y-1">
            <span className="text-xs text-slate-400">Token</span>
            <select
              value={tokenAddress}
              disabled={!walletReady || !protocol}
              onChange={e => {
                const selected = tokenOptions.find(item => item.address === e.target.value)
                setTokenAddress(selected?.address || '')
                setTokenSymbol(selected?.symbol || '')
                setTokenDecimals(selected?.decimals || 18)
                setApproveTxHash('')
              }}
              className="w-full bg-slate-900 border border-slate-700 rounded px-3 py-2 text-sm"
            >
              {tokenOptions.map(option => (
                <option key={option.id} value={option.address}>{option.symbol}</option>
              ))}
            </select>
          </label>
          <label className="space-y-1">
            <span className="text-xs text-slate-400">Token address</span>
            <input
              value={tokenAddress}
              disabled={!walletReady || !protocol}
              onChange={e => {
                setTokenAddress(e.target.value)
                setApproveTxHash('')
              }}
              placeholder="0x..."
              className="w-full bg-slate-900 border border-slate-700 rounded px-3 py-2 text-sm"
            />
          </label>

          <label className="space-y-1">
            <span className="text-xs text-slate-400">Token symbol</span>
            <input
              value={tokenSymbol}
              disabled={!walletReady || !protocol}
              onChange={e => setTokenSymbol(e.target.value.toUpperCase())}
              placeholder="AGIALPHA"
              className="w-full bg-slate-900 border border-slate-700 rounded px-3 py-2 text-sm"
            />
          </label>
          <label className="space-y-1">
            <span className="text-xs text-slate-400">Token decimals</span>
            <input
              value={tokenDecimals}
              disabled={!walletReady || !protocol}
              onChange={e => setTokenDecimals(e.target.value)}
              placeholder="18"
              className="w-full bg-slate-900 border border-slate-700 rounded px-3 py-2 text-sm"
            />
          </label>

          <label className="space-y-1">
            <span className="text-xs text-slate-400">Payout amount</span>
            <input
              value={payoutAmount}
              disabled={!walletReady || !protocol}
              onChange={e => {
                setPayoutAmount(e.target.value)
                setApproveTxHash('')
              }}
              placeholder="100"
              className="w-full bg-slate-900 border border-slate-700 rounded px-3 py-2 text-sm"
            />
          </label>
        </div>
        <div className="text-xs text-slate-400">Preview: {payoutPreview}</div>
      </div>

      <div className="rounded border border-slate-800 bg-slate-950 p-3 space-y-2">
        <div className="text-xs text-slate-500 uppercase tracking-wider">Step 3 · Token approval</div>
        <div className="text-xs text-slate-400">Spender: <span className="font-mono">{protocol?.spenderAddress || '—'}</span></div>
        <div className="text-xs text-slate-400">Allowance: {allowanceLoading ? 'loading...' : `${formatUnits(allowanceBaseUnits || 0n, Number(tokenDecimals || 18), 6)} ${tokenSymbol || 'TOKEN'}`}</div>
        {approvalRequired ? (
          <div className="space-y-2">
            <div className="text-xs text-amber-300">Approval required before request generation and publish.</div>
            <button
              onClick={handleApproveToken}
              disabled={approvePending || !walletReady || !protocol}
              className="text-xs px-3 py-2 rounded border border-amber-700 text-amber-200 hover:bg-amber-900/30 disabled:opacity-50"
            >
              {approvePending ? 'Approving...' : 'Approve token spending'}
            </button>
            {approveTxHash && <div className="text-xs text-slate-400 font-mono break-all">approval tx: {approveTxHash}</div>}
          </div>
        ) : (
          <div className="text-xs text-emerald-300">Approval sufficient for selected payout.</div>
        )}
      </div>

      <div className="rounded border border-slate-800 bg-slate-950 p-3 space-y-2">
        <div className="text-xs text-slate-500 uppercase tracking-wider">Step 4 · Request input</div>
        <textarea
          rows={4}
          disabled={!walletReady || !protocol || approvalRequired}
          value={rawRequest}
          onChange={e => setRawRequest(e.target.value)}
          placeholder="Describe what you need in simple words"
          className="w-full bg-slate-900 border border-slate-700 rounded px-3 py-2 text-sm"
        />
        <button
          onClick={handleBuildRequest}
          disabled={!walletReady || !protocol || approvalRequired || !rawRequest.trim()}
          className="px-3 py-2 rounded bg-blue-600 text-white text-sm disabled:opacity-50"
        >
          Build my request
        </button>
      </div>

      {step >= 5 && currentQuestion && (
        <div className="rounded border border-slate-800 bg-slate-950 p-3 space-y-3">
          <div className="text-xs text-slate-500 uppercase tracking-wider">Step 5 · Guided questions ({questionIndex + 1}/{questions.length})</div>
          <div className="text-sm text-slate-100 font-semibold">{currentQuestion.prompt}</div>
          <div className="space-y-2">
            {currentQuestion.options.map(option => {
              const checked = answers[currentQuestion.id] === option.value
              return (
                <label key={option.id} className={`flex items-center gap-2 px-3 py-2 rounded border ${checked ? 'border-blue-500 bg-blue-950/30' : 'border-slate-700'}`}>
                  <input type="radio" name={currentQuestion.id} checked={checked} onChange={() => handleSelectAnswer(option.value)} />
                  <span className="text-sm">{option.label}</span>
                </label>
              )
            })}
          </div>
          <div className="flex gap-2">
            <button onClick={() => setQuestionIndex(i => Math.max(0, i - 1))} disabled={questionIndex === 0} className="text-xs px-3 py-2 rounded border border-slate-700 disabled:opacity-50">Back</button>
            <button onClick={handleNextQuestion} className="text-xs px-3 py-2 rounded border border-blue-700 text-blue-200">{questionIndex === questions.length - 1 ? 'Generate draft' : 'Next'}</button>
          </div>
        </div>
      )}

      {step >= 6 && draft && (
        <div className="rounded border border-slate-800 bg-slate-950 p-3 space-y-3">
          <div className="text-xs text-slate-500 uppercase tracking-wider">Step 6 · Draft spec</div>
          <label className="space-y-1 block"><span className="text-xs text-slate-400">Title</span><input value={editingTitle} onChange={e => setEditingTitle(e.target.value)} className="w-full bg-slate-900 border border-slate-700 rounded px-3 py-2 text-sm" /></label>
          <label className="space-y-1 block"><span className="text-xs text-slate-400">Summary</span><textarea rows={3} value={editingSummary} onChange={e => setEditingSummary(e.target.value)} className="w-full bg-slate-900 border border-slate-700 rounded px-3 py-2 text-sm" /></label>
          <div className="grid md:grid-cols-2 gap-3">
            <label className="space-y-1 block"><span className="text-xs text-slate-400">Scope</span><textarea rows={4} value={editingScope} onChange={e => setEditingScope(e.target.value)} className="w-full bg-slate-900 border border-slate-700 rounded px-3 py-2 text-sm" /></label>
            <label className="space-y-1 block"><span className="text-xs text-slate-400">Deliverables</span><textarea rows={4} value={editingDeliverables} onChange={e => setEditingDeliverables(e.target.value)} className="w-full bg-slate-900 border border-slate-700 rounded px-3 py-2 text-sm" /></label>
          </div>
          <label className="space-y-1 block"><span className="text-xs text-slate-400">Acceptance criteria</span><textarea rows={4} value={editingAcceptance} onChange={e => setEditingAcceptance(e.target.value)} className="w-full bg-slate-900 border border-slate-700 rounded px-3 py-2 text-sm" /></label>
          <div className="text-xs text-slate-400">Protocol: {protocol?.label} · Category: {draft.category} · Complexity: {draft.complexity}</div>
          <div className="flex gap-2">
            <button onClick={handleApplyDraftEdits} className="text-xs px-3 py-2 rounded border border-blue-700 text-blue-200">Continue to IPFS</button>
          </div>
        </div>
      )}

      {step >= 7 && draft && (
        <div className="rounded border border-slate-800 bg-slate-950 p-3 space-y-3">
          <div className="text-xs text-slate-500 uppercase tracking-wider">Step 7 · IPFS upload</div>
          {!ipfsResult ? (
            <button onClick={handleUploadToIpfs} disabled={ipfsUploading} className="text-xs px-3 py-2 rounded border border-cyan-700 text-cyan-200 disabled:opacity-50">
              {ipfsUploading ? 'Uploading to IPFS...' : 'Upload reviewed spec to IPFS'}
            </button>
          ) : (
            <div className="space-y-1 text-xs">
              <div className="text-emerald-300">IPFS upload complete.</div>
              <div className="text-slate-400 font-mono break-all">URI: {ipfsResult.uri}</div>
              {ipfsResult.gatewayUrl && <a href={ipfsResult.gatewayUrl} target="_blank" rel="noreferrer" className="text-blue-400">Open gateway ↗</a>}
            </div>
          )}
        </div>
      )}

      {step >= 8 && draft && ipfsResult && (
        <div className="rounded border border-slate-800 bg-slate-950 p-3 space-y-3">
          <div className="text-xs text-slate-500 uppercase tracking-wider">Step 8 · Final review / generate sign-ready request package</div>
          <div className="text-xs text-slate-300 space-y-1">
            <div>Wallet: <span className="font-mono">{wallet?.account || '—'}</span></div>
            <div>Protocol: {protocol?.label}</div>
            <div>Payment: {payoutPreview}</div>
            <div>Approval status: {approvalRequired ? 'insufficient' : 'sufficient'}</div>
            <div>IPFS URI: <span className="font-mono break-all">{ipfsResult.uri}</span></div>
          </div>
          <button
            onClick={handleCreateJobRequest}
            disabled={posting || approvalRequired || !publishPayload}
            className="px-3 py-2 rounded bg-blue-600 text-white text-sm disabled:opacity-50"
          >
            {posting ? 'Generating package...' : 'Generate sign-ready request package'}
          </button>
          {result?.unsignedTxPath && (
            <div className="rounded border border-emerald-900 bg-emerald-950/20 p-2 text-xs space-y-1">
              <div className="text-emerald-300">Sign-ready request package generated.</div>
              <div className="text-slate-300 break-all">unsigned tx: <a className="text-blue-300 underline" href={`/api/operator-actions/file?path=${encodeURIComponent(result.unsignedTxPath)}`} target="_blank" rel="noreferrer">open</a></div>
              <div className="text-slate-300 break-all">review manifest: <a className="text-blue-300 underline" href={`/api/operator-actions/file?path=${encodeURIComponent(result.reviewManifestPath || '')}`} target="_blank" rel="noreferrer">open</a></div>
            </div>
          )}
          {result?.publishPayload && (
            <details>
              <summary className="text-xs text-slate-300 cursor-pointer">View publish payload</summary>
              <pre className="mt-2 p-2 rounded bg-slate-900 text-xs text-slate-300 overflow-x-auto">{JSON.stringify(result.publishPayload, null, 2)}</pre>
            </details>
          )}
        </div>
      )}

      {error && <div className="text-xs text-red-400 bg-red-950/30 border border-red-900 rounded p-2">{error}</div>}
    </div>
  )
}
