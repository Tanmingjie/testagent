import { useState, useEffect, useCallback } from 'react'
import { useSearchParams, useNavigate } from 'react-router-dom'
import { api } from '../lib/api'
import { useExecutionProgress } from '../hooks/useExecutionProgress'
import {
  Play,
  Loader2,
  CheckCircle,
  XCircle,
  AlertCircle,
  Clock,
  ChevronDown,
  ChevronRight,
  Code2,
  Lightbulb,
  ExternalLink,
  Copy,
  Download,
  Zap,
  Languages,
  Split,
} from 'lucide-react'

interface StepWithDetails {
  stepOrder: number
  status: string
  screenshotUrl?: string
  error?: string
  pythonCode?: string
  actionText?: string
  expectedText?: string
  code?: string
}

interface CaseStep {
  order: number
  actionText: string
  expectedText: string
}

interface CaseDetail {
  id: string
  name: string
  productLine: string
  steps: CaseStep[]
  status: string
}

type PhaseStatus = 'idle' | 'loading' | 'done' | 'error'

interface PhaseState {
  status: PhaseStatus
  steps: CaseStep[]
  error?: string
  reasoningText?: string
}

type Mode = 'auto' | 'manual'

const stepStatusConfig: Record<string, { label: string; icon: React.ReactNode; class: string }> = {
  PASS: {
    label: '通过',
    icon: <CheckCircle className="w-4 h-4" />,
    class: 'border-green-200 bg-green-50',
  },
  FAIL: {
    label: '失败',
    icon: <XCircle className="w-4 h-4" />,
    class: 'border-red-200 bg-red-50',
  },
  BLOCK: {
    label: '阻塞',
    icon: <AlertCircle className="w-4 h-4" />,
    class: 'border-orange-200 bg-orange-50',
  },
  running: {
    label: '执行中',
    icon: <Loader2 className="w-4 h-4 animate-spin" />,
    class: 'border-blue-200 bg-blue-50',
  },
}

const defaultStepConfig = {
  label: '等待中',
  icon: <Clock className="w-4 h-4 text-gray-400" />,
  class: 'border-gray-100 bg-gray-50',
}

const PHASE_CONFIG = [
  {
    key: 'translate' as const,
    number: 1,
    title: '翻译',
    description: '标准化用例术语，适配产品知识库',
    icon: Languages,
    apiEndpoint: (id: string) => `/test-cases/${id}/translate`,
    successLabel: '翻译完成',
    loadingLabel: '正在翻译…',
  },
  {
    key: 'decompose' as const,
    number: 2,
    title: '分解',
    description: '将复合步骤分解为原子操作',
    icon: Split,
    apiEndpoint: (id: string) => `/test-cases/${id}/decompose`,
    successLabel: '分解完成',
    loadingLabel: '正在分解…',
  },
  {
    key: 'execute' as const,
    number: 3,
    title: '执行',
    description: 'AI 驱动浏览器自动测试',
    icon: Zap,
    apiEndpoint: (id: string) => `/execution/run/${id}`,
    successLabel: '执行完成',
    loadingLabel: '正在执行…',
  },
]

function AnimatedStepsTable({ steps }: { steps: CaseStep[] }) {
  const [visibleCount, setVisibleCount] = useState(0)

  useEffect(() => {
    setVisibleCount(0)
    if (steps.length === 0) return
    let i = 1
    const t = setInterval(() => {
      if (i <= steps.length) {
        setVisibleCount(i)
        i++
      } else {
        clearInterval(t)
      }
    }, 250)
    return () => clearInterval(t)
  }, [steps])

  if (visibleCount === 0) return null

  const styles = `
    @keyframes stepIn {
      from { opacity: 0; transform: translateY(6px); }
      to { opacity: 1; transform: translateY(0); }
    }
  `

  return (
    <>
      <style>{styles}</style>
      <table className="w-full text-xs border-collapse">
        <thead>
          <tr className="border-b border-gray-100">
            <th className="text-left py-1.5 pr-3 text-gray-500 font-medium w-12">步骤</th>
            <th className="text-left py-1.5 pr-3 text-gray-500 font-medium">操作</th>
            <th className="text-left py-1.5 text-gray-500 font-medium">预期结果</th>
          </tr>
        </thead>
        <tbody>
          {steps.slice(0, visibleCount).map((step) => (
            <tr
              key={step.order}
              style={{ animation: 'stepIn 0.3s ease forwards' }}
              className="border-t border-gray-50"
            >
              <td className="py-1.5 pr-3 text-gray-400 align-top">{step.order}</td>
              <td className="py-1.5 pr-3 text-gray-700 align-top">{step.actionText}</td>
              <td className="py-1.5 text-gray-700 align-top">{step.expectedText}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </>
  )
}

export default function ExecutionPage() {
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const caseIdFromUrl = searchParams.get('caseId')

  const [selectedCaseId, setSelectedCaseId] = useState(caseIdFromUrl || '')
  const [caseDetail, setCaseDetail] = useState<CaseDetail | null>(null)
  const [caseDetailLoading, setCaseDetailLoading] = useState(false)

  const [mode, setMode] = useState<Mode>('auto')
  const [translate, setTranslate] = useState<PhaseState>({ status: 'idle', steps: [] })
  const [decompose, setDecompose] = useState<PhaseState>({ status: 'idle', steps: [] })
  const [execute, setExecute] = useState<PhaseState>({ status: 'idle', steps: [] })

  const [activeRunId, setActiveRunId] = useState<string | null>(null)
  const [executingAll, setExecutingAll] = useState(false)

  const [screenshotModal, setScreenshotModal] = useState<string | null>(null)
  const [expandedSteps, setExpandedSteps] = useState<Set<number>>(new Set())
  const [copied, setCopied] = useState(false)

  const {
    status: runStatus,
    summary,
    steps: runSteps,
    generatedPythonCode,
    fixPrompt,
    loading: runProgressLoading,
    error: runProgressError,
  } = useExecutionProgress(activeRunId)

  const isRunTerminal = runStatus && !['running', 'pending'].includes(runStatus)
  const execCompletedCount = runSteps.filter((s) =>
    ['PASS', 'FAIL', 'BLOCK'].includes(s.status),
  ).length

  useEffect(() => {
    const cid = searchParams.get('caseId')
    if (!cid) return
    setSelectedCaseId(cid)
  }, [searchParams])

  useEffect(() => {
    if (!selectedCaseId) {
      setCaseDetail(null)
      return
    }
    setCaseDetailLoading(true)
    api.get<CaseDetail>(`/test-cases/${selectedCaseId}`)
      .then((data) => setCaseDetail(data))
      .catch(() => setCaseDetail(null))
      .finally(() => setCaseDetailLoading(false))
  }, [selectedCaseId])

  useEffect(() => {
    setTranslate({ status: 'idle', steps: [] })
    setDecompose({ status: 'idle', steps: [] })
    setExecute({ status: 'idle', steps: [] })
    setActiveRunId(null)
    setExecutingAll(false)
  }, [selectedCaseId])

  useEffect(() => {
    if (activeRunId && isRunTerminal) {
      setExecute((prev) => ({ ...prev, status: 'done' }))
    } else if (activeRunId && runStatus === 'running') {
      setExecute((prev) => ({ ...prev, status: 'loading' }))
    }
  }, [activeRunId, isRunTerminal, runStatus])

  const startPhase = useCallback(
    async (phase: 'translate' | 'decompose') => {
      if (!selectedCaseId) return
      const setter = phase === 'translate' ? setTranslate : setDecompose
      setter({ status: 'loading', steps: [] })
      const ep = phase === 'translate' ? 'translate' : 'decompose'
      try {
        const response = await fetch(`/api/test-cases/${selectedCaseId}/${ep}/stream`, { method: 'POST' })
        if (!response.ok) {
          const errorText = await response.text().catch(() => '')
          throw new Error(errorText || `${phase} 请求失败`)
        }
        if (!response.body) throw new Error('No response body')
        const reader = response.body.getReader()
        const decoder = new TextDecoder()
        let buffer = ''

        while (true) {
          const { done, value } = await reader.read()
          if (done) break
          buffer += decoder.decode(value, { stream: true })
          const lines = buffer.split('\n')
          buffer = lines.pop() || ''
          for (const line of lines) {
            const trimmed = line.trim()
            if (!trimmed.startsWith('data: ')) continue
            try {
              const data = JSON.parse(trimmed.slice(6))
              if (data.type === 'reasoning') {
                setter((prev) => ({ ...prev, reasoningText: (prev.reasoningText || '') + data.chunk }))
              } else if (data.status === 'done') {
                setter({ status: 'done', steps: data.steps })
                return { steps: data.steps }
              } else if (data.status === 'error') {
                setter({ status: 'error', steps: [], error: data.error })
                throw new Error(data.error)
              }
            } catch (e) {
              if (e instanceof SyntaxError) continue
              throw e
            }
          }
        }
        setter({ status: 'done', steps: [] })
        return { steps: [] }
      } catch (err) {
        const msg = err instanceof Error ? err.message : `${phase} 失败`
        setter((prev) => ({ ...prev, status: 'error', error: msg }))
        throw err
      }
    },
    [selectedCaseId],
  )

  const startExecution = useCallback(async () => {
    if (!selectedCaseId) return
    setExecute({ status: 'loading', steps: [] })
    setActiveRunId(null)
    try {
      const result = await api.post<{ runId: string }>(`/execution/run/${selectedCaseId}`, {})
      setActiveRunId(result.runId)
      return result
    } catch (err) {
      const msg = err instanceof Error ? err.message : '启动执行失败'
      setExecute({ status: 'error', steps: [], error: msg })
    }
  }, [selectedCaseId])

  const handleAutoExecute = useCallback(async () => {
    if (!selectedCaseId || executingAll) return
    setExecutingAll(true)
    try {
      await startPhase('translate')
      await startPhase('decompose')

      setExecute({ status: 'loading', steps: [] })
      setActiveRunId(null)
      const execResult = await api.post<{ runId: string }>(`/execution/run/${selectedCaseId}`, {})
      setActiveRunId(execResult.runId)
    } catch {
      setExecutingAll(false)
    }
  }, [selectedCaseId, executingAll, startPhase])

  const isAutoDisabled =
    !selectedCaseId ||
    executingAll ||
    translate.status === 'loading' ||
    decompose.status === 'loading' ||
    execute.status === 'loading'

  const canTranslate = selectedCaseId && translate.status === 'idle'
  const canDecompose = selectedCaseId && translate.status === 'done' && decompose.status === 'idle'
  const canExecute = selectedCaseId && decompose.status === 'done' && execute.status === 'idle'

  useEffect(() => {
    if (executingAll && activeRunId && isRunTerminal) {
      setExecutingAll(false)
    }
  }, [executingAll, activeRunId, isRunTerminal])

  const toggleStep = (order: number) => {
    setExpandedSteps((prev) => {
      const next = new Set(prev)
      if (next.has(order)) next.delete(order)
      else next.add(order)
      return next
    })
  }

  function renderPhaseStatus(status: PhaseStatus) {
    switch (status) {
      case 'idle':
        return (
          <span className="flex items-center gap-1.5 text-xs text-gray-400">
            <Clock className="w-3.5 h-3.5" />
            等待中
          </span>
        )
      case 'loading':
        return (
          <span className="flex items-center gap-1.5 text-xs text-blue-600 font-medium">
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
            进行中
          </span>
        )
      case 'done':
        return (
          <span className="flex items-center gap-1.5 text-xs text-green-600 font-medium">
            <CheckCircle className="w-3.5 h-3.5" />
            已完成
          </span>
        )
      case 'error':
        return (
          <span className="flex items-center gap-1.5 text-xs text-red-600 font-medium">
            <XCircle className="w-3.5 h-3.5" />
            出错
          </span>
        )
    }
  }

  function phaseHeaderBg(status: PhaseStatus): string {
    switch (status) {
      case 'idle': return 'bg-gray-50'
      case 'loading': return 'bg-blue-50'
      case 'done': return 'bg-green-50'
      case 'error': return 'bg-red-50'
    }
  }

  function renderPhaseCard(config: (typeof PHASE_CONFIG)[number]) {
    const state =
      config.key === 'translate'
        ? translate
        : config.key === 'decompose'
          ? decompose
          : execute

    const { status: phaseStatus, steps: phaseSteps, error: phaseError, reasoningText } = state
    const isExpanded = phaseStatus !== 'idle'
    const PhaseIcon = config.icon

    return (
      <div
        className={`rounded-lg border overflow-hidden transition-all duration-300 ${
          phaseStatus === 'idle'
            ? 'border-gray-200'
            : phaseStatus === 'loading'
              ? 'border-blue-300 shadow-sm'
              : phaseStatus === 'done'
                ? 'border-green-300'
                : 'border-red-300'
        }`}
      >
        <div className={`flex items-center gap-3 px-4 py-3 ${phaseHeaderBg(phaseStatus)}`}>
          <span
            className={`flex items-center justify-center w-7 h-7 rounded-full text-xs font-bold shrink-0 ${
              phaseStatus === 'done'
                ? 'bg-green-500 text-white'
                : phaseStatus === 'loading'
                  ? 'bg-blue-500 text-white'
                  : phaseStatus === 'error'
                    ? 'bg-red-500 text-white'
                    : 'bg-gray-200 text-gray-500'
            }`}
          >
            {phaseStatus === 'done' ? (
              <CheckCircle className="w-4 h-4" />
            ) : (
              config.number
            )}
          </span>

          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <PhaseIcon
                className={`w-4 h-4 ${
                  phaseStatus === 'idle'
                    ? 'text-gray-400'
                    : phaseStatus === 'loading'
                      ? 'text-blue-500'
                      : phaseStatus === 'done'
                        ? 'text-green-600'
                        : 'text-red-500'
                }`}
              />
              <h3
                className={`text-sm font-semibold ${
                  phaseStatus === 'idle'
                    ? 'text-gray-600'
                    : phaseStatus === 'loading'
                      ? 'text-blue-700'
                      : phaseStatus === 'done'
                        ? 'text-green-700'
                        : 'text-red-700'
                }`}
              >
                {config.title}
              </h3>
            </div>
            {phaseStatus === 'idle' && (
              <p className="text-xs text-gray-400 mt-0.5">{config.description}</p>
            )}
          </div>

          <div className="shrink-0">{renderPhaseStatus(phaseStatus)}</div>

          {mode === 'manual' && phaseStatus === 'idle' && (
            <button
              type="button"
              onClick={() => {
                if (config.key === 'execute') {
                  startExecution()
                } else {
                  startPhase(config.key)
                }
              }}
              disabled={
                config.key === 'translate'
                  ? !canTranslate
                  : config.key === 'decompose'
                    ? !canDecompose
                    : !canExecute
              }
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md transition-colors
                enabled:bg-blue-600 enabled:text-white enabled:hover:bg-blue-700
                disabled:bg-gray-100 disabled:text-gray-400 disabled:cursor-not-allowed"
            >
              <Play className="w-3 h-3" />
              开始{config.title}
            </button>
          )}
        </div>

        {isExpanded && (
          <div className="px-4 py-3 border-t border-gray-100">
            {(config.key === 'translate' || config.key === 'decompose') && state.reasoningText && (
              <ReasoningPanel text={state.reasoningText} />
            )}

            {phaseStatus === 'loading' && config.key !== 'execute' && (
              <div className="flex items-center justify-center py-6">
                <Loader2 className="w-5 h-5 animate-spin text-blue-500 mr-2" />
                <span className="text-sm text-gray-500">{config.loadingLabel}</span>
              </div>
            )}

            {phaseStatus === 'error' && (
              <div className="flex items-start gap-2 py-2">
                <AlertCircle className="w-4 h-4 text-red-500 mt-0.5 shrink-0" />
                <p className="text-sm text-red-600">{phaseError || '操作失败'}</p>
              </div>
            )}

            {config.key !== 'execute' && phaseStatus === 'done' && phaseSteps.length > 0 && (
              <div>
                <p className="text-xs font-medium text-gray-500 mb-2">
                  {config.successLabel} — 共 {phaseSteps.length} 步
                </p>
                <AnimatedStepsTable steps={phaseSteps} />
              </div>
            )}

            {config.key !== 'execute' && phaseStatus === 'done' && phaseSteps.length === 0 && (
              <p className="text-sm text-gray-400 py-2 text-center">{config.successLabel}</p>
            )}

            {config.key === 'execute' && activeRunId && (
              <div>
                {runStatus && (
                  <div
                    className={`mb-3 px-3 py-2 rounded-lg text-sm font-medium border ${
                      runStatus === 'passed'
                        ? 'bg-green-50 text-green-700 border-green-200'
                        : runStatus === 'failed'
                          ? 'bg-red-50 text-red-700 border-red-200'
                          : runStatus === 'error'
                            ? 'bg-orange-50 text-orange-700 border-orange-200'
                            : 'bg-blue-50 text-blue-700 border-blue-200'
                    }`}
                  >
                    {runStatus === 'running' || runStatus === 'pending' ? (
                      <span className="flex items-center gap-2">
                        <Loader2 className="w-4 h-4 animate-spin" />
                        执行中…
                      </span>
                    ) : runStatus === 'passed' ? (
                      '✅ 测试通过'
                    ) : runStatus === 'failed' ? (
                      '❌ 测试失败'
                    ) : (
                      '⚠️ 执行出错'
                    )}
                  </div>
                )}

                {summary && summary.total > 0 && (
                  <div className="mb-3">
                    <div className="flex justify-between text-sm text-gray-600 mb-1">
                      <span>
                        步骤 {execCompletedCount}/{summary.total}
                      </span>
                      <span>{Math.round((execCompletedCount / summary.total) * 100)}%</span>
                    </div>
                    <div className="w-full bg-gray-200 rounded-full h-2 overflow-hidden">
                      <div
                        className="h-full rounded-full transition-all duration-500 ease-out"
                        style={{
                          width: `${(execCompletedCount / summary.total) * 100}%`,
                          backgroundColor:
                            runStatus === 'passed'
                              ? '#22c55e'
                              : runStatus === 'failed' || runStatus === 'error'
                                ? '#ef4444'
                                : '#3b82f6',
                        }}
                      />
                    </div>
                    <div className="flex gap-4 mt-2 text-xs text-gray-500">
                      <span className="text-green-600">通过 {summary.pass}</span>
                      <span className="text-red-600">失败 {summary.fail}</span>
                      <span className="text-orange-600">阻塞 {summary.blocked}</span>
                    </div>
                  </div>
                )}

                {runSteps.length > 0 && (
                  <ul className="space-y-2">
                    {runSteps.map((step) => {
                      const cfg = stepStatusConfig[step.status] ?? defaultStepConfig
                      const isExpanded = expandedSteps.has(step.stepOrder)
                      const stepData = step as StepWithDetails
                      return (
                        <li
                          key={step.stepOrder}
                          className={`rounded-lg border overflow-hidden transition-colors ${cfg.class}`}
                        >
                          <button
                            type="button"
                            onClick={() => toggleStep(step.stepOrder)}
                            className="w-full flex items-center gap-3 px-4 py-3 text-left hover:opacity-80 transition-opacity"
                          >
                            <span className="shrink-0 text-current">{cfg.icon}</span>
                            <span className="text-sm font-medium text-gray-800 shrink-0">
                              步骤 {step.stepOrder}
                            </span>
                            <span className="flex-1 text-sm text-gray-600 truncate min-w-0">
                              {stepData.actionText || ''}
                            </span>
                            <span
                              className={`text-xs shrink-0 ${
                                step.status === 'PASS'
                                  ? 'text-green-600'
                                  : step.status === 'FAIL'
                                    ? 'text-red-600'
                                    : step.status === 'running'
                                      ? 'text-blue-600'
                                      : 'text-gray-400'
                              }`}
                            >
                              {cfg.label}
                            </span>
                            {stepData.screenshotUrl && (
                              <img
                                src={stepData.screenshotUrl}
                                alt=""
                                className="w-10 h-7 object-cover rounded border border-gray-300 shrink-0"
                              />
                            )}
                            {isExpanded ? (
                              <ChevronDown className="w-4 h-4 text-gray-400 shrink-0" />
                            ) : (
                              <ChevronRight className="w-4 h-4 text-gray-400 shrink-0" />
                            )}
                          </button>

                          {isExpanded && (
                            <div className="px-4 pb-4 pt-1 space-y-3 border-t border-gray-200">
                              {stepData.actionText && (
                                <div>
                                  <span className="text-xs font-medium text-gray-500">操作</span>
                                  <p className="text-sm text-gray-800 mt-0.5">{stepData.actionText}</p>
                                </div>
                              )}
                              {stepData.expectedText && (
                                <div>
                                  <span className="text-xs font-medium text-gray-500">预期结果</span>
                                  <p className="text-sm text-gray-800 mt-0.5">{stepData.expectedText}</p>
                                </div>
                              )}
                              {stepData.error && (
                                <div>
                                  <span className="text-xs font-medium text-red-500">错误信息</span>
                                  <p className="text-sm text-red-600 mt-0.5 font-mono">{stepData.error}</p>
                                </div>
                              )}
                              {stepData.screenshotUrl && (
                                <div>
                                  <span className="text-xs font-medium text-gray-500">截图</span>
                                  <button
                                    type="button"
                                    className="block mt-1"
                                    onClick={() => setScreenshotModal(stepData.screenshotUrl!)}
                                  >
                                    <img
                                      src={stepData.screenshotUrl}
                                      alt={`步骤 ${step.stepOrder} 截图`}
                                      className="max-w-sm rounded border border-gray-200 cursor-pointer hover:opacity-80 transition-opacity"
                                    />
                                  </button>
                                </div>
                              )}
                              {stepData.pythonCode && (
                                <div>
                                  <span className="text-xs font-medium text-gray-500">Python 代码</span>
                                  <pre className="mt-1 bg-gray-900 text-gray-100 text-xs p-3 rounded-lg overflow-x-auto leading-relaxed">
                                    <code>{stepData.pythonCode}</code>
                                  </pre>
                                </div>
                              )}
                            </div>
                          )}
                        </li>
                      )
                    })}
                  </ul>
                )}

                {runProgressLoading && runSteps.length === 0 && (
                  <div className="flex items-center justify-center py-6 text-gray-400">
                    <Loader2 className="w-5 h-5 animate-spin mr-2" />
                    正在获取执行进度…
                  </div>
                )}

                {runProgressError && (
                  <div className="py-3 text-sm text-red-600 text-center">
                    获取进度出错: {runProgressError}
                  </div>
                )}

                {isRunTerminal && activeRunId && (
                  <div className="mt-3 flex justify-center">
                    <button
                      type="button"
                      onClick={() => navigate(`/history/${activeRunId}`)}
                      className="flex items-center gap-2 px-5 py-2 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700 transition-colors"
                    >
                      <ExternalLink className="w-4 h-4" />
                      查看详细报告
                    </button>
                  </div>
                )}

                {isRunTerminal && (generatedPythonCode || fixPrompt) && (
                  <div className="mt-4 border-t border-gray-100 pt-4">
                    {generatedPythonCode && (
                      <div className="mb-4">
                        <div className="flex items-center justify-between mb-2">
                          <h4 className="flex items-center gap-1.5 text-sm font-medium text-gray-700">
                            <Code2 className="w-4 h-4" />
                            生成的 Python 代码
                          </h4>
                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              onClick={() => {
                                navigator.clipboard.writeText(generatedPythonCode).then(() => {
                                  setCopied(true)
                                  setTimeout(() => setCopied(false), 2000)
                                })
                              }}
                              className="flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-gray-600 border border-gray-300 rounded-md hover:bg-gray-50 transition-colors"
                            >
                              <Copy className="w-3.5 h-3.5" />
                              {copied ? '已复制' : '复制代码'}
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                const blob = new Blob([generatedPythonCode], { type: 'text/x-python' })
                                const url = URL.createObjectURL(blob)
                                const a = document.createElement('a')
                                a.href = url
                                a.download = `test_case_${caseDetail?.id ?? 'export'}.py`
                                document.body.appendChild(a)
                                a.click()
                                document.body.removeChild(a)
                                URL.revokeObjectURL(url)
                              }}
                              className="flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-gray-600 border border-gray-300 rounded-md hover:bg-gray-50 transition-colors"
                            >
                              <Download className="w-3.5 h-3.5" />
                              下载 .py
                            </button>
                          </div>
                        </div>
                        <pre className="bg-gray-900 text-gray-100 text-xs p-4 rounded-lg overflow-x-auto max-h-80 leading-relaxed">
                          <code>{generatedPythonCode}</code>
                        </pre>
                      </div>
                    )}

                    {fixPrompt && (
                      <div>
                        <h4 className="flex items-center gap-1.5 text-sm font-medium text-gray-700 mb-2">
                          <Lightbulb className="w-4 h-4" />
                          修复建议
                        </h4>
                        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3 text-sm text-gray-700 whitespace-pre-wrap leading-relaxed">
                          {fixPrompt}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}


          </div>
        )}
      </div>
    )
  }

  if (!caseIdFromUrl) {
    return (
      <div>
        <h1 className="text-2xl font-semibold text-gray-800 mb-6">执行测试</h1>
        <div className="text-center py-20">
          <p className="text-lg text-gray-500 mb-6">请先在用例管理页面选取用例</p>
          <button
            onClick={() => navigate('/cases')}
            className="inline-flex items-center gap-2 px-6 py-2.5 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors"
          >
            <Play className="w-4 h-4" />
            前往用例管理
          </button>
        </div>
      </div>
    )
  }

  return (
    <div>
      <h1 className="text-2xl font-semibold text-gray-800 mb-6">执行测试</h1>

      {caseDetailLoading ? (
        <section className="bg-white border border-gray-200 rounded-lg p-4 mb-6">
          <div className="flex items-center justify-center py-6">
            <Loader2 className="w-5 h-5 animate-spin text-gray-400 mr-2" />
            <span className="text-sm text-gray-500">加载测试用例详情...</span>
          </div>
        </section>
      ) : caseDetail && caseDetail.steps.length > 0 ? (
        <section className="bg-white border border-gray-200 rounded-lg p-4 mb-6">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-medium text-gray-500 uppercase tracking-wider">测试用例步骤</h2>
            <span className="text-xs text-gray-400">{caseDetail.name}</span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100">
                  <th className="text-left py-2 pr-4 text-xs font-medium text-gray-400 w-12">步骤</th>
                  <th className="text-left py-2 pr-4 text-xs font-medium text-gray-400">操作</th>
                  <th className="text-left py-2 text-xs font-medium text-gray-400">预期结果</th>
                </tr>
              </thead>
              <tbody>
                {caseDetail.steps.map((step) => (
                  <tr key={step.order} className="border-b border-gray-50 last:border-0">
                    <td className="py-2 pr-4 text-gray-800 font-medium">{step.order}</td>
                    <td className="py-2 pr-4 text-gray-700">{step.actionText}</td>
                    <td className="py-2 text-gray-700">{step.expectedText}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}

      <section className="mb-6">
        <div className="flex items-center gap-2">
          <span className="text-xs font-medium text-gray-500 mr-1">执行模式</span>
          <div className="inline-flex rounded-lg border border-gray-200 overflow-hidden">
            <button
              type="button"
              onClick={() => setMode('auto')}
              className={`flex items-center gap-1.5 px-4 py-2 text-sm font-medium transition-colors ${
                mode === 'auto'
                  ? 'bg-blue-600 text-white'
                  : 'bg-white text-gray-600 hover:bg-gray-50'
              }`}
            >
              <Zap className="w-3.5 h-3.5" />
              一键执行
            </button>
            <button
              type="button"
              onClick={() => setMode('manual')}
              className={`flex items-center gap-1.5 px-4 py-2 text-sm font-medium transition-colors ${
                mode === 'manual'
                  ? 'bg-blue-600 text-white'
                  : 'bg-white text-gray-600 hover:bg-gray-50'
              }`}
            >
              <Play className="w-3.5 h-3.5" />
              分步执行
            </button>
          </div>
        </div>
      </section>

      <section className="space-y-4 mb-6">
        {PHASE_CONFIG.map((config) => (
          <div key={config.key}>{renderPhaseCard(config)}</div>
        ))}
      </section>

      {mode === 'auto' && (
        <section className="mb-6">
          <button
            type="button"
            onClick={handleAutoExecute}
            disabled={isAutoDisabled}
            className={`w-full flex items-center justify-center gap-2 px-6 py-3 text-sm font-semibold rounded-lg transition-all duration-200 ${
              isAutoDisabled
                ? 'bg-gray-200 text-gray-400 cursor-not-allowed'
                : 'bg-blue-600 text-white hover:bg-blue-700 shadow-sm hover:shadow-md active:scale-[0.98]'
            }`}
          >
            {executingAll ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                执行中…
              </>
            ) : (
              <>
                <Zap className="w-4 h-4" />
                一键执行
              </>
            )}
          </button>
        </section>
      )}

      {screenshotModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
          onClick={() => setScreenshotModal(null)}
        >
          <div
            className="relative max-w-3xl max-h-[90vh]"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              className="absolute -top-3 -right-3 w-8 h-8 rounded-full bg-white shadow-md flex items-center justify-center text-gray-600 hover:text-gray-900 transition-colors"
              onClick={() => setScreenshotModal(null)}
            >
              ✕
            </button>
            <img
              src={screenshotModal}
              alt="截图预览"
              className="max-w-full max-h-[90vh] rounded-lg shadow-xl"
            />
          </div>
        </div>
      )}
    </div>
  )
}

function ReasoningPanel({ text }: { text: string }) {
  const [open, setOpen] = useState(false)
  if (!text) return null
  return (
    <div className="mb-3">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="flex items-center gap-1.5 text-xs text-purple-600 hover:text-purple-800 transition-colors"
      >
        <span className={`inline-block transition-transform ${open ? 'rotate-90' : ''}`}>▶</span>
        思考过程 {open ? '▾' : '▸'}
      </button>
      {open && (
        <pre className="mt-2 p-3 bg-purple-50 rounded text-xs text-purple-900 max-h-40 overflow-y-auto whitespace-pre-wrap break-all leading-relaxed border border-purple-100">
          {text}
        </pre>
      )}
    </div>
  )
}
