import { useEffect, useMemo, useRef, useState } from 'react'
import {
  createJobDraftArtifact,
  createJobRequest,
  fetchHealthStatus,
  fetchOperatorActionFile,
  pinJsonToIpfs,
} from '../api'
import {
  DEFAULT_REQUEST_IMAGE,
  createDefaultJobRequestDraft,
  toJobSpecV2,
  toLegacyJobRequestPayload,
} from '../models/jobSpecV2'
import { PROTOCOL_OPTIONS, getProtocolOption } from '../features/request/protocolConfig'
import { approveToken, formatUnits, parseUnits, readAllowance } from '../features/request/erc20'
import { shouldAutoScrollToStep } from '../features/request/stepNavigation'
import {
  JSON_EXAMPLE_TEMPLATE,
  TXT_EXAMPLE_TEMPLATE,
  canonicalizeStructuredJobSpec,
  parseStrictTxtTemplate,
  validateStructuredJobSpec,
} from '../features/request/structuredJobSpec'

const STATIC_TOKEN_OPTIONS = [{ id: 'agialpha', symbol: 'AGIALPHA', address: '', decimals: 18 }]

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
      {label}: <span className="text-slate-100 break-all">{value}</span>
    </span>
  )
}

function SectionText({ children, mono = false }) {
  return (
    <div className={`min-w-0 whitespace-pre-wrap break-words ${mono ? 'font-mono' : ''}`}>
      {children}
    </div>
  )
}

function BriefCard({ title, items }) {
  return (
    <div className="rounded border border-slate-700 bg-slate-950/70 p-3 space-y-2 min-w-0">
      <div className="text-xs font-semibold text-slate-200">{title}</div>
      <div className="space-y-2 text-xs text-slate-300 min-w-0">
        {items.map((item, i) => (
          <div key={i} className="min-w-0">
            <div className="text-slate-500">{item.label}</div>
            <SectionText mono={item.mono}>{item.value}</SectionText>
          </div>
        ))}
      </div>
    </div>
  )
}

function toCanonicalSpecFromDraft(draft, createdBy = '') {
  return toJobSpecV2({
    ...createDefaultJobRequestDraft(),
    title: draft?.title || '',
    summary: draft?.summary || '',
    details: draft?.details || draft?.summary || '',
    category: draft?.category || 'other',
    locale: draft?.locale || 'en-US',
    tags: Array.isArray(draft?.tags) ? draft.tags : [],
    deliverables: Array.isArray(draft?.deliverables) ? draft.deliverables : [],
    acceptanceCriteria: Array.isArray(draft?.acceptanceCriteria) ? draft.acceptanceCriteria : [],
    requirements: Array.isArray(draft?.requirements) ? draft.requirements : [],
    payoutAGIALPHA: Number(draft?.payoutAGIALPHA || 0),
    durationSeconds: Number(draft?.durationSeconds || 86400),
    chainId: Number(draft?.chainId || 1),
    contract: draft?.contract || '',
    ...(createdBy ? { createdBy } : {}),
  })
}

function toDraftFromStructuredSpec(spec, protocol, wallet, payoutAmountDecimal) {
  const category = String(spec.category || 'other').trim().toLowerCase()
  return {
    ...createDefaultJobRequestDraft(),
    title: spec.title,
    summary: spec.objective,
    details: spec.objective,
    category: category || 'other',
    locale: 'en-US',
    tags: [category || 'other', protocol?.id || 'unknown', 'structured-input-v1'],
    deliverables: spec.deliverables,
    acceptanceCriteria: spec.evaluationCriteria,
    requirements: spec.constraints,
    payoutAGIALPHA: Number(payoutAmountDecimal || 0),
    durationSeconds: Number(spec.duration),
    chainId: wallet?.chainIdDecimal || 1,
    contract: protocol?.contractAddress || '',
    scope: spec.inputs,
    constraints: spec.constraints,
    payment: {
      tokenAddress: normalizeAddress(wallet?.agiToken) || '',
      symbol: 'AGIALPHA',
      amount: String(payoutAmountDecimal || ''),
    },
  }
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

  const [inputMode, setInputMode] = useState('json')
  const [structuredRawInput, setStructuredRawInput] = useState(JSON_EXAMPLE_TEMPLATE)
  const [validationErrors, setValidationErrors] = useState([])
  const [validationPassed, setValidationPassed] = useState(false)
  const [validatedSpec, setValidatedSpec] = useState(null)
  const [draftArtifactPath, setDraftArtifactPath] = useState('')

  const [draft, setDraft] = useState(null)
  const [ipfsUploading, setIpfsUploading] = useState(false)
  const [ipfsResult, setIpfsResult] = useState(null)
  const [infraLoading, setInfraLoading] = useState(false)
  const [ipfsPinataReady, setIpfsPinataReady] = useState(null)
  const [posting, setPosting] = useState(false)
  const [result, setResult] = useState(null)
  const [pushPending, setPushPending] = useState(false)
  const [pushTxHash, setPushTxHash] = useState('')
  const [pushStatus, setPushStatus] = useState('')

  const stepRefs = useRef({})
  const pendingScrollStepRef = useRef(null)

  const tokenOptions = useMemo(
    () => [{ ...STATIC_TOKEN_OPTIONS[0], address: normalizeAddress(wallet?.agiToken) || '' }],
    [wallet?.agiToken],
  )
  const protocol = useMemo(() => getProtocolOption(protocolId), [protocolId])
  const ipfsReady = ipfsPinataReady !== false

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

  const publishPayload = useMemo(() => {
    if (!draft || !ipfsResult || !wallet?.account || !validatedSpec) return null
    return {
      version: 'mission-control-request/v1',
      walletAddress: wallet.account,
      protocol: protocolId,
      structuredInputMode: inputMode,
      structuredJobSpec: validatedSpec,
      draftArtifactPath,
      payment: {
        tokenAddress: normalizeAddress(tokenAddress),
        symbol: tokenSymbol,
        decimals: Number(tokenDecimals || 18),
        amount: payoutAmount,
        amountBaseUnits: amountBaseUnits ? amountBaseUnits.toString() : '',
      },
      draft,
      canonicalSpec: toCanonicalSpecFromDraft(draft, wallet?.account || ''),
      ipfs: ipfsResult,
      createdAt: new Date().toISOString(),
    }
  }, [draft, ipfsResult, wallet, protocolId, inputMode, validatedSpec, draftArtifactPath, tokenAddress, tokenSymbol, tokenDecimals, payoutAmount, amountBaseUnits])

  const unsignedBriefItems = useMemo(() => {
    if (!result?.unsignedTxPath || !publishPayload) return []
    const props = publishPayload?.canonicalSpec?.properties || {}
    return [
      { label: 'Action', value: 'createJob on AGIJobManager v1' },
      { label: 'Title', value: props.title || draft?.title || '—' },
      { label: 'Summary', value: props.summary || draft?.summary || '—' },
      { label: 'Contract', value: protocol?.contractAddress || draft?.contract || '—', mono: true },
      { label: 'Payout', value: payoutPreview },
      { label: 'Duration', value: `${Number(draft?.durationSeconds || 0).toLocaleString()} seconds` },
      { label: 'IPFS spec URI', value: ipfsResult?.uri || '—', mono: true },
      { label: 'Unsigned tx file', value: result?.unsignedTxPath || '—', mono: true },
    ]
  }, [result, publishPayload, draft, protocol, payoutPreview, ipfsResult])

  const reviewBriefItems = useMemo(() => {
    if (!result?.reviewManifestPath) return []
    return [
      { label: 'Review mode', value: 'Human-signed request package' },
      { label: 'Checklist', value: 'Confirm contract, confirm IPFS spec, confirm payout/duration, then sign in MetaMask.' },
      { label: 'Review manifest file', value: result?.reviewManifestPath || '—', mono: true },
      { label: 'Unsigned tx file', value: result?.unsignedTxPath || '—', mono: true },
      { label: 'Wallet', value: wallet?.account || '—', mono: true },
    ]
  }, [result, wallet])

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
    let cancelled = false
    async function refreshInfra() {
      setInfraLoading(true)
      try {
        const health = await fetchHealthStatus()
        if (!cancelled) setIpfsPinataReady(Boolean(health?.readiness?.ipfsPinata))
      } catch {
        if (!cancelled) setIpfsPinataReady(null)
      } finally {
        if (!cancelled) setInfraLoading(false)
      }
    }
    refreshInfra()
    return () => {
      cancelled = true
    }
  }, [])

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

  useEffect(() => {
    const scrollStep = pendingScrollStepRef.current
    if (!scrollStep) return
    pendingScrollStepRef.current = null
    const node = stepRefs.current[scrollStep]
    if (!node) return
    const timer = setTimeout(() => node.scrollIntoView({ behavior: 'smooth', block: 'start' }), 0)
    return () => clearTimeout(timer)
  }, [step])

  function registerStepRef(stepNumber) {
    return (node) => {
      if (node) stepRefs.current[stepNumber] = node
      else delete stepRefs.current[stepNumber]
    }
  }

  function moveToStep(nextStep) {
    setStep((currentStep) => {
      pendingScrollStepRef.current = shouldAutoScrollToStep({ previousStep: currentStep, nextStep }) ? nextStep : null
      return nextStep
    })
  }

  function resetAfterProtocolPaymentChange() {
    setValidationErrors([])
    setValidationPassed(false)
    setValidatedSpec(null)
    setDraftArtifactPath('')
    setDraft(null)
    setIpfsResult(null)
    setResult(null)
    setError('')
    setPushPending(false)
    setPushTxHash('')
    setPushStatus('')
    moveToStep(4)
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

  function loadExampleTemplate() {
    setStructuredRawInput(inputMode === 'json' ? JSON_EXAMPLE_TEMPLATE : TXT_EXAMPLE_TEMPLATE)
    setValidationErrors([])
    setValidationPassed(false)
  }

  async function handleValidateStructuredInput() {
    setError('')
    setValidationErrors([])
    setValidationPassed(false)

    const protocolAndPaymentError = validateProtocolAndPayment()
    if (protocolAndPaymentError) {
      setError(protocolAndPaymentError)
      return
    }

    if (approvalRequired) {
      setError('Token approval is required before request validation.')
      return
    }

    let parsed
    try {
      if (inputMode === 'json') parsed = JSON.parse(structuredRawInput)
      else parsed = parseStrictTxtTemplate(structuredRawInput)
    } catch (e) {
      setValidationErrors([e.message || 'Failed to parse structured input.'])
      return
    }

    const candidate = canonicalizeStructuredJobSpec(parsed)
    const verdict = validateStructuredJobSpec(candidate)
    if (!verdict.ok) {
      setValidationErrors(verdict.errors)
      return
    }

    try {
      const artifact = await createJobDraftArtifact({ spec: candidate })
      const payoutDecimal = formatUnits(BigInt(candidate.payout), Number(tokenDecimals || 18), 6)
      setPayoutAmount(payoutDecimal)
      const nextDraft = toDraftFromStructuredSpec(candidate, protocol, wallet, payoutDecimal)
      setDraft(nextDraft)
      setValidatedSpec(candidate)
      setDraftArtifactPath(artifact?.jobSpecPath || '')
      setValidationPassed(true)
      moveToStep(5)
    } catch (e) {
      setError(e.message || 'Failed to persist structured draft artifact.')
    }
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
      const txHash = await approveToken({ tokenAddress: normalizedToken, owner: wallet.account, spender: protocol.spenderAddress, amountBaseUnits })
      setApproveTxHash(txHash)
    } catch (e) {
      setError(e.message || 'Token approval failed.')
    } finally {
      setApprovePending(false)
    }
  }

  async function handleUploadToIpfs() {
    if (!draft || !validatedSpec) return
    setError('')
    if (!ipfsReady) {
      setError('IPFS pinning is not ready: PINATA_JWT is missing on server. Add it in Render env vars and redeploy.')
      return
    }
    setIpfsUploading(true)
    try {
      const payload = {
        version: 'mission-control-job-request-spec/v1',
        generatedAt: new Date().toISOString(),
        protocol: protocolId,
        structuredJobSpec: validatedSpec,
        draftArtifactPath,
        draft,
        canonicalSpec: toCanonicalSpecFromDraft(draft, wallet?.account || ''),
      }
      const ipfs = await pinJsonToIpfs(payload, `${protocolId}-${Date.now()}-job-request.json`)
      if (!ipfs?.uri || !extractCid(ipfs.uri)) throw new Error('IPFS upload did not return a valid URI.')
      setIpfsResult({ cid: ipfs.cid || extractCid(ipfs.uri), uri: ipfs.uri, gatewayUrl: ipfs.gatewayUrl || '' })
      moveToStep(6)
    } catch (e) {
      setError(e.message || 'IPFS upload failed.')
    } finally {
      setIpfsUploading(false)
    }
  }

  async function handleCreateJobRequest() {
    setError('')
    setPushTxHash('')
    setPushStatus('')
    if (!publishPayload || !validatedSpec) {
      setError('Publish payload is incomplete. Validate and upload to IPFS first.')
      return
    }
    if (approvalRequired) {
      setError('Approval must be sufficient before creating a job request.')
      return
    }
    setPosting(true)
    try {
      const response = await createJobRequest(
        toLegacyJobRequestPayload(
          {
            ...createDefaultJobRequestDraft(),
            title: draft.title,
            summary: draft.summary,
            details: draft.details,
            category: draft.category,
            tags: draft.tags,
            deliverables: draft.deliverables,
            acceptanceCriteria: draft.acceptanceCriteria,
            requirements: draft.requirements,
            payoutAGIALPHA: Number.parseFloat(payoutAmount || '0') || 0,
            durationSeconds: Number(validatedSpec.duration),
            chainId: wallet.chainIdDecimal || 1,
            contract: protocol?.contractAddress || draft.contract || '',
            createdBy: wallet.account,
          },
          {
            durationUiValue: `${Math.round(validatedSpec.duration)}s`,
            ipfsUri: ipfsResult.uri,
            imageUri: DEFAULT_REQUEST_IMAGE,
          },
        ),
      )
      setResult({ ...response, publishPayload })
      moveToStep(7)
    } catch (e) {
      setError(e.message || 'Create job request failed.')
    } finally {
      setPosting(false)
    }
  }

  async function handlePushJobOnchain() {
    setError('')
    setPushStatus('')
    setPushTxHash('')
    if (!walletReady || !wallet?.account) return setError('Connect MetaMask before pushing the job on-chain.')
    if (!result?.unsignedTxPath) return setError('Unsigned tx package is missing.')
    const provider = window?.ethereum || wallet?.provider
    if (!provider?.request) return setError('No injected wallet provider found.')
    setPushPending(true)
    try {
      const file = await fetchOperatorActionFile(result.unsignedTxPath)
      const tx = file?.json
      if (!tx || typeof tx !== 'object') throw new Error('Unsigned tx package could not be loaded as JSON.')
      const desiredChainId = String(tx.chainId || wallet?.chainId || '0x1').toLowerCase()
      const currentChainId = String(wallet?.chainId || (await provider.request({ method: 'eth_chainId' }))).toLowerCase()
      if (desiredChainId && desiredChainId !== currentChainId) {
        await provider.request({ method: 'wallet_switchEthereumChain', params: [{ chainId: desiredChainId }] })
      }
      const sendTx = { from: wallet.account, to: tx.to, data: tx.data, value: tx.value || '0x0' }
      setPushStatus('Opening MetaMask for final createJob signature...')
      const txHash = await provider.request({ method: 'eth_sendTransaction', params: [sendTx] })
      setPushTxHash(txHash)
      setPushStatus('Job create transaction submitted.')
    } catch (e) {
      setError(e?.message || 'Failed to push job on-chain.')
    } finally {
      setPushPending(false)
    }
  }

  return (
    <div className="bg-slate-900 rounded-lg border border-slate-800 p-4 space-y-4 min-w-0 overflow-x-hidden">
      <div className="min-w-0">
        <div className="text-xs text-slate-500 uppercase tracking-wider">Request Wizard</div>
        <div className="text-sm text-slate-300 mt-1 break-words">Deterministic structured job compiler for AGI job creation.</div>
      </div>

      <div className="rounded border border-slate-800 bg-slate-950 p-3 flex flex-wrap items-center gap-2 min-w-0">
        {statusPill('wallet', walletReady ? 'connected' : 'not connected')}
        {statusPill('step', String(step))}
        {statusPill('protocol', protocol?.label || 'not selected')}
        {statusPill('approval', approvalRequired ? 'required' : 'sufficient')}
        {statusPill('ipfs pin', infraLoading ? 'checking…' : ipfsReady ? 'ready' : 'missing PINATA_JWT')}
      </div>

      <div ref={registerStepRef(1)} className="rounded border border-slate-800 bg-slate-950 p-3 space-y-3 min-w-0">
        <div className="text-xs text-slate-500 uppercase tracking-wider">Step 1 · Protocol selection</div>
        <div className="grid md:grid-cols-3 gap-2 min-w-0">
          {PROTOCOL_OPTIONS.map((option) => {
            const selected = protocolId === option.id
            return (
              <button
                key={option.id}
                onClick={() => {
                  setProtocolId(option.id)
                  resetAfterProtocolPaymentChange()
                }}
                disabled={!walletReady}
                className={`text-left rounded border p-3 min-w-0 ${selected ? 'border-blue-500 bg-blue-950/30' : 'border-slate-700 bg-slate-900'} disabled:opacity-60`}
              >
                <div className="text-sm text-slate-100 font-semibold break-words">{option.label}</div>
                <div className="text-xs text-slate-400 mt-1 break-words">{option.description}</div>
              </button>
            )
          })}
        </div>
      </div>

      <div ref={registerStepRef(2)} className="rounded border border-slate-800 bg-slate-950 p-3 space-y-3 min-w-0">
        <div className="text-xs text-slate-500 uppercase tracking-wider">Step 2 · Payment token and payout</div>
        <div className="grid md:grid-cols-2 gap-3 min-w-0">
          <label className="space-y-1 min-w-0"><span className="text-xs text-slate-400">Token</span><select value={tokenAddress} disabled={!walletReady || !protocol} onChange={(e) => { const selected = tokenOptions.find((item) => item.address === e.target.value); setTokenAddress(selected?.address || ''); setTokenSymbol(selected?.symbol || ''); setTokenDecimals(selected?.decimals || 18); setApproveTxHash('') }} className="w-full bg-slate-900 border border-slate-700 rounded px-3 py-2 text-sm min-w-0">{tokenOptions.map((option) => <option key={option.id} value={option.address}>{option.symbol}</option>)}</select></label>
          <label className="space-y-1 min-w-0"><span className="text-xs text-slate-400">Token address</span><input value={tokenAddress} disabled={!walletReady || !protocol} onChange={(e) => { setTokenAddress(e.target.value); setApproveTxHash('') }} placeholder="0x..." className="w-full bg-slate-900 border border-slate-700 rounded px-3 py-2 text-sm min-w-0" /></label>
          <label className="space-y-1 min-w-0"><span className="text-xs text-slate-400">Token symbol</span><input value={tokenSymbol} disabled={!walletReady || !protocol} onChange={(e) => setTokenSymbol(e.target.value.toUpperCase())} className="w-full bg-slate-900 border border-slate-700 rounded px-3 py-2 text-sm min-w-0" /></label>
          <label className="space-y-1 min-w-0"><span className="text-xs text-slate-400">Token decimals</span><input value={tokenDecimals} disabled={!walletReady || !protocol} onChange={(e) => setTokenDecimals(e.target.value)} className="w-full bg-slate-900 border border-slate-700 rounded px-3 py-2 text-sm min-w-0" /></label>
          <label className="space-y-1 min-w-0"><span className="text-xs text-slate-400">Payout amount</span><input value={payoutAmount} disabled={!walletReady || !protocol} onChange={(e) => { setPayoutAmount(e.target.value); setApproveTxHash('') }} className="w-full bg-slate-900 border border-slate-700 rounded px-3 py-2 text-sm min-w-0" /></label>
        </div>
        <div className="text-xs text-slate-400 break-words">Preview: {payoutPreview}</div>
      </div>

      <div ref={registerStepRef(3)} className="rounded border border-slate-800 bg-slate-950 p-3 space-y-2 min-w-0">
        <div className="text-xs text-slate-500 uppercase tracking-wider">Step 3 · Token approval</div>
        <div className="text-xs text-slate-400 break-all">Spender: <span className="font-mono">{protocol?.spenderAddress || '—'}</span></div>
        <div className="text-xs text-slate-400 break-words">Allowance: {allowanceLoading ? 'loading...' : `${formatUnits(allowanceBaseUnits || 0n, Number(tokenDecimals || 18), 6)} ${tokenSymbol || 'TOKEN'}`}</div>
        {approvalRequired ? (
          <div className="space-y-2">
            <div className="text-xs text-amber-300">Approval required before request generation and publish.</div>
            <button onClick={handleApproveToken} disabled={approvePending || !walletReady || !protocol} className="text-xs px-3 py-2 rounded border border-amber-700 text-amber-200 hover:bg-amber-900/30 disabled:opacity-50">{approvePending ? 'Approving...' : 'Approve token spending'}</button>
            {approveTxHash && <div className="text-xs text-slate-400 font-mono break-all">approval tx: {approveTxHash}</div>}
          </div>
        ) : <div className="text-xs text-emerald-300">Approval sufficient for selected payout.</div>}
      </div>

      <div ref={registerStepRef(4)} className="rounded border border-slate-800 bg-slate-950 p-3 space-y-4 min-w-0">
        <div className="text-xs text-slate-500 uppercase tracking-wider">Step 4 · Structured request input (strict)</div>
        <div className="text-xs text-slate-400">Only JSON mode or strict TXT template mode are accepted. Free-form chat input is disabled.</div>
        <div className="flex gap-2">
          <button onClick={() => { setInputMode('json'); setValidationPassed(false); setValidationErrors([]); setStructuredRawInput(JSON_EXAMPLE_TEMPLATE) }} className={`px-3 py-1.5 rounded text-xs border ${inputMode === 'json' ? 'border-blue-500 bg-blue-950/30 text-blue-200' : 'border-slate-700 text-slate-300'}`}>JSON Mode</button>
          <button onClick={() => { setInputMode('txt'); setValidationPassed(false); setValidationErrors([]); setStructuredRawInput(TXT_EXAMPLE_TEMPLATE) }} className={`px-3 py-1.5 rounded text-xs border ${inputMode === 'txt' ? 'border-blue-500 bg-blue-950/30 text-blue-200' : 'border-slate-700 text-slate-300'}`}>TXT Mode</button>
        </div>
        <textarea rows={18} value={structuredRawInput} onChange={(e) => setStructuredRawInput(e.target.value)} className="w-full bg-slate-900 border border-slate-700 rounded px-3 py-2 text-sm font-mono text-slate-200" />
        <div className="flex flex-wrap gap-2">
          <button onClick={loadExampleTemplate} className="px-3 py-2 rounded border border-slate-600 text-xs text-slate-200">Load Example Template</button>
          <button onClick={handleValidateStructuredInput} disabled={!walletReady || !protocol || approvalRequired} className="px-3 py-2 rounded border border-cyan-700 text-cyan-200 text-xs disabled:opacity-50">Validate</button>
          <button onClick={() => validationPassed && moveToStep(5)} disabled={!validationPassed} className="px-3 py-2 rounded border border-blue-700 text-blue-200 text-xs disabled:opacity-50">Proceed</button>
        </div>
        <div className="rounded border border-slate-700 bg-slate-900/50 p-2 text-xs">
          <div className="text-slate-300 font-semibold mb-1">Validation status</div>
          {validationPassed ? <div className="text-emerald-300">Valid structured input. Draft artifact written: <span className="font-mono break-all">{draftArtifactPath || 'pending'}</span></div> : <div className="text-amber-300">Not validated.</div>}
          {validationErrors.length > 0 && <ul className="list-disc ml-4 mt-2 text-red-300">{validationErrors.map((item, idx) => <li key={idx} className="break-words">{item}</li>)}</ul>}
        </div>
      </div>

      {step >= 5 && draft && (
        <div ref={registerStepRef(5)} className="rounded border border-slate-800 bg-slate-950 p-3 space-y-3 min-w-0">
          <div className="text-xs text-slate-500 uppercase tracking-wider">Step 5 · Upload canonical payload to IPFS</div>
          {!ipfsResult ? (
            <button onClick={handleUploadToIpfs} disabled={ipfsUploading || !ipfsReady || !validationPassed} className="text-xs px-3 py-2 rounded border border-cyan-700 text-cyan-200 disabled:opacity-50">{ipfsUploading ? 'Uploading to IPFS...' : !ipfsReady ? 'IPFS disabled (missing PINATA_JWT)' : 'Upload reviewed spec to IPFS'}</button>
          ) : (
            <div className="space-y-1 text-xs min-w-0"><div className="text-emerald-300">IPFS upload complete.</div><div className="text-slate-400 font-mono break-all">URI: {ipfsResult.uri}</div></div>
          )}
        </div>
      )}

      {step >= 6 && draft && ipfsResult && (
        <div ref={registerStepRef(6)} className="rounded border border-slate-800 bg-slate-950 p-3 space-y-3 min-w-0">
          <div className="text-xs text-slate-500 uppercase tracking-wider">Step 6 · Generate sign-ready request package</div>
          <button onClick={handleCreateJobRequest} disabled={posting || approvalRequired || !publishPayload} className="px-3 py-2 rounded bg-blue-600 text-white text-sm disabled:opacity-50">{posting ? 'Generating package...' : 'Generate sign-ready request package'}</button>
        </div>
      )}

      {step >= 7 && result?.unsignedTxPath && (
        <div ref={registerStepRef(7)} className="rounded border border-slate-800 bg-slate-950 p-3 space-y-3 min-w-0">
          <div className="text-xs text-slate-500 uppercase tracking-wider">Step 7 · Final push job on-chain</div>
          <BriefCard title="Unsigned tx brief" items={unsignedBriefItems} />
          <BriefCard title="Review manifest brief" items={reviewBriefItems} />
          <button onClick={handlePushJobOnchain} disabled={pushPending || !walletReady} className="px-3 py-2 rounded bg-violet-600 text-white text-sm disabled:opacity-50">{pushPending ? 'Opening MetaMask...' : 'Push job on-chain in MetaMask'}</button>
          {pushStatus && <div className="text-xs text-slate-300 break-words">{pushStatus}</div>}
          {pushTxHash && <div className="text-xs text-emerald-300 break-all">tx hash: {pushTxHash}</div>}
        </div>
      )}

      {error && <div className="text-xs text-red-400 bg-red-950/30 border border-red-900 rounded p-2 break-words min-w-0">{error}</div>}
    </div>
  )
}
