import { useState, useEffect } from 'react'
import { api } from '../lib/api'
import { useExecutionProgress } from '../hooks/useExecutionProgress'
import {
  Play,
  Loader2,
  CheckCircle,
  XCircle,
  AlertCircle,
  Clock,
  ChevronRight,
  FileText,
  RotateCw,
  Code2,
  Lightbulb,
} from 'lucide-react'

/* ---------- types ---------- */

interface ListCaseItem {
  id: string
  name: string
  productLine: string
  status: string
  lastRunStatus?: string
}

interface RunListItem {
  runId: string
  caseId: string
  status: string
  createdAt: string
}

/* ---------- helpers ---------- */

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

const runStatusLabel: Record<string, string> = {
  running: '执行中',
  passed: '已通过',
  failed: '已失败',
  error: '出错',
}

/* ---------- component ---------- */

export default function ExecutionPage() {
  const [testCases, setTestCases] = useState<ListCaseItem[]>([])
  const [selectedCaseId, setSelectedCaseId] = useState('')
  const [runId, setRunId] = useState<string | null>(null)
  const [recentRuns, setRecentRuns] = useState<RunListItem[]>([])
  const [executing, setExecuting] = useState(false)
  const [executeError, setExecuteError] = useState<string | null>(null)
  const [screenshotModal, setScreenshotModal] = useState<string | null>(null)
  const [casesLoading, setCasesLoading] = useState(true)
  const [runsLoading, setRunsLoading] = useState(true)
  const [casesError, setCasesError] = useState<string | null>(null)

  const { status, summary, steps, generatedPythonCode, fixPrompt, loading, error } =
    useExecutionProgress(runId)

  /* ---- data fetching ---- */

  useEffect(() => {
    setCasesLoading(true)
    api.get<{ cases: ListCaseItem[] }>('/test-cases?status=decomposed')
      .then((res) => setTestCases(res.cases))
      .catch(() => setCasesError('获取测试用例失败'))
      .finally(() => setCasesLoading(false))

    setRunsLoading(true)
    api.get<{ runs: RunListItem[] }>('/execution/runs')
      .catch(() => {})
      .finally(() => setRunsLoading(false))
  }, [])

  /* refresh recent runs when a terminal state is reached */
  useEffect(() => {
    if (status && !['running', 'pending'].includes(status)) {
      api.get<{ runs: RunListItem[] }>('/execution/runs')
        .then((res) => setRecentRuns(res.runs))
        .catch(() => {})
    }
  }, [status])

  /* ---- actions ---- */

  const handleExecute = async () => {
    if (!selectedCaseId) return
    setExecuting(true)
    setExecuteError(null)
    try {
      const result = await api.post<{ runId: string }>(`/execution/run/${selectedCaseId}`, {})
      setRunId(result.runId)
    } catch (err) {
      setExecuteError(err instanceof Error ? err.message : '启动执行失败')
    } finally {
      setExecuting(false)
    }
  }

  const isTerminal = status && !['running', 'pending'].includes(status)
  const completedCount = steps.filter((s) =>
    ['PASS', 'FAIL', 'BLOCK'].includes(s.status),
  ).length

  /* ---- render ---- */

  return (
    <div>
      <h1 className="text-2xl font-semibold text-gray-800 mb-6">执行测试</h1>

      {/* ---- test-case selector + execute ---- */}
      <section className="bg-white border border-gray-200 rounded-lg p-4 mb-6">
        {casesLoading ? (
          <div className="flex items-center justify-center py-10">
            <Loader2 className="w-5 h-5 animate-spin text-gray-400 mr-2" />
            <span className="text-sm text-gray-500">加载测试用例...</span>
          </div>
        ) : casesError ? (
          <div className="text-center py-10 text-red-500">
            <p className="text-sm">{casesError}</p>
          </div>
        ) : testCases.length === 0 ? (
          <div className="text-center py-10 text-gray-400">
            <FileText className="w-10 h-10 mx-auto mb-2 text-gray-300" />
            <p className="text-sm">暂无已分解的测试用例</p>
            <p className="text-xs mt-1">请先在用例管理页面对用例进行分解操作</p>
          </div>
        ) : (
          <>
            <div className="flex items-end gap-4">
              <div className="flex-1">
                <label
                  htmlFor="case-select"
                  className="block text-sm font-medium text-gray-700 mb-1"
                >
                  选择已分解的测试用例
                </label>
                <select
                  id="case-select"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  value={selectedCaseId}
                  onChange={(e) => setSelectedCaseId(e.target.value)}
                >
                  <option value="">-- 请选择 --</option>
                  {testCases.map((tc) => (
                    <option key={tc.id} value={tc.id}>
                      {tc.name}
                      {tc.productLine ? ` (${tc.productLine})` : ''}
                    </option>
                  ))}
                </select>
              </div>

              <button
                className="flex items-center gap-2 px-5 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                onClick={handleExecute}
                disabled={!selectedCaseId || executing}
              >
                {executing ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Play className="w-4 h-4" />
                )}
                {executing ? '启动中...' : '执行'}
              </button>
            </div>

            {executeError && (
              <p className="mt-2 text-sm text-red-600">{executeError}</p>
            )}
          </>
        )}
      </section>

      {/* ---- execution progress ---- */}
      {runId && (
        <section className="bg-white border border-gray-200 rounded-lg p-4 mb-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-medium text-gray-800">执行进度</h2>
            {loading && (
              <span className="flex items-center gap-1.5 text-sm text-blue-600">
                <RotateCw className="w-3.5 h-3.5 animate-spin" />
                更新中
              </span>
            )}
          </div>

          {/* status banner */}
          <div
            className={`mb-4 px-4 py-3 rounded-lg text-sm font-medium border ${
              status === 'passed'
                ? 'bg-green-50 text-green-700 border-green-200'
                : status === 'failed'
                  ? 'bg-red-50 text-red-700 border-red-200'
                  : status === 'error'
                    ? 'bg-orange-50 text-orange-700 border-orange-200'
                    : 'bg-blue-50 text-blue-700 border-blue-200'
            }`}
          >
            {!status || status === 'running' || status === 'pending' ? (
              <span className="flex items-center gap-2">
                <Loader2 className="w-4 h-4 animate-spin" />
                执行中…
              </span>
            ) : status === 'passed' ? (
              '✅ 测试通过'
            ) : status === 'failed' ? (
              '❌ 测试失败'
            ) : (
              '⚠️ 执行出错'
            )}
          </div>

          {/* progress bar */}
          {summary && summary.total > 0 && (
            <div className="mb-4">
              <div className="flex justify-between text-sm text-gray-600 mb-1">
                <span>
                  步骤 {completedCount}/{summary.total}
                </span>
                <span>{Math.round((completedCount / summary.total) * 100)}%</span>
              </div>
              <div className="w-full bg-gray-200 rounded-full h-2 overflow-hidden">
                <div
                  className="h-full rounded-full transition-all duration-500 ease-out"
                  style={{
                    width: `${(completedCount / summary.total) * 100}%`,
                    backgroundColor:
                      status === 'passed'
                        ? '#22c55e'
                        : status === 'failed' || status === 'error'
                          ? '#ef4444'
                          : '#3b82f6',
                  }}
                />
              </div>

              {/* summary counters */}
              <div className="flex gap-4 mt-2 text-xs text-gray-500">
                <span className="text-green-600">通过 {summary.pass}</span>
                <span className="text-red-600">失败 {summary.fail}</span>
                <span className="text-orange-600">阻塞 {summary.blocked}</span>
              </div>
            </div>
          )}

          {/* step list */}
          {steps.length > 0 && (
            <ul className="space-y-2">
              {steps.map((step) => {
                const cfg = stepStatusConfig[step.status] ?? defaultStepConfig
                return (
                  <li
                    key={step.stepOrder}
                    className={`flex items-start gap-3 p-3 rounded-lg border ${cfg.class}`}
                  >
                    <span className="mt-0.5 shrink-0 text-current">
                      {cfg.icon}
                    </span>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium text-gray-800">
                          步骤 {step.stepOrder}
                        </span>
                        <span
                          className={`text-xs ${
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
                      </div>

                      {step.error && (
                        <p className="text-sm text-red-600 mt-1 font-mono text-xs leading-relaxed">
                          {step.error}
                        </p>
                      )}
                    </div>

                    {step.screenshotUrl && (
                      <button
                        type="button"
                        className="shrink-0"
                        onClick={() => setScreenshotModal(step.screenshotUrl!)}
                      >
                        <img
                          src={step.screenshotUrl}
                          alt={`步骤 ${step.stepOrder} 截图`}
                          className="w-20 h-14 object-cover rounded border border-gray-200 cursor-pointer hover:opacity-80 transition-opacity"
                        />
                      </button>
                    )}
                  </li>
                )
              })}
            </ul>
          )}

          {/* initial loading */}
          {loading && steps.length === 0 && (
            <div className="flex items-center justify-center py-10 text-gray-400">
              <Loader2 className="w-5 h-5 animate-spin mr-2" />
              正在获取执行进度…
            </div>
          )}

          {/* polling error */}
          {error && (
            <div className="py-4 text-sm text-red-600 text-center">
              获取进度出错: {error}
            </div>
          )}
        </section>
      )}

      {/* ---- generated code & fix prompt (terminal state) ---- */}
      {isTerminal && (generatedPythonCode || fixPrompt) && (
        <section className="bg-white border border-gray-200 rounded-lg p-4 mb-6">
          <h2 className="text-lg font-medium text-gray-800 mb-3">执行详情</h2>

          {generatedPythonCode && (
            <div className="mb-4">
              <h3 className="flex items-center gap-1.5 text-sm font-medium text-gray-700 mb-2">
                <Code2 className="w-4 h-4" />
                生成的 Python 代码
              </h3>
              <pre className="bg-gray-900 text-gray-100 text-xs p-4 rounded-lg overflow-x-auto max-h-80 leading-relaxed">
                <code>{generatedPythonCode}</code>
              </pre>
            </div>
          )}

          {fixPrompt && (
            <div>
              <h3 className="flex items-center gap-1.5 text-sm font-medium text-gray-700 mb-2">
                <Lightbulb className="w-4 h-4" />
                修复建议
              </h3>
              <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3 text-sm text-gray-700 whitespace-pre-wrap leading-relaxed">
                {fixPrompt}
              </div>
            </div>
          )}
        </section>
      )}

      {/* ---- recent executions ---- */}
      <section className="bg-white border border-gray-200 rounded-lg p-4">
        <h2 className="text-lg font-medium text-gray-800 mb-3">最近执行</h2>

        {runsLoading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="w-5 h-5 animate-spin text-gray-400" />
          </div>
        ) : recentRuns.length === 0 ? (
          <p className="text-sm text-gray-400 py-8 text-center">暂无执行记录</p>
        ) : (
          <ul className="divide-y divide-gray-100">
            {recentRuns.slice(0, 10).map((run) => (
              <li key={run.runId}>
                <button
                  type="button"
                  className="flex items-center justify-between w-full px-3 py-3 rounded-lg hover:bg-gray-50 transition-colors text-left"
                  onClick={() => setRunId(run.runId)}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <FileText className="w-4 h-4 text-gray-400 shrink-0" />
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-gray-800 truncate">
                        {run.caseId}
                      </p>
                      <p className="text-xs text-gray-500">
                        {formatDate(run.createdAt)}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0 ml-3">
                    <RunStatusBadge status={run.status} />
                    <ChevronRight className="w-4 h-4 text-gray-300" />
                  </div>
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* ---- screenshot modal ---- */}
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

/* ---------- sub-components ---------- */

function RunStatusBadge({ status }: { status: string }) {
  const colorClass: Record<string, string> = {
    running: 'bg-blue-100 text-blue-700 border-blue-200',
    passed: 'bg-green-100 text-green-700 border-green-200',
    failed: 'bg-red-100 text-red-700 border-red-200',
    error: 'bg-orange-100 text-orange-700 border-orange-200',
  }

  return (
    <span
      className={`inline-flex items-center rounded-full border px-1.5 py-0.5 text-xs font-medium ${
        colorClass[status] ?? 'bg-gray-100 text-gray-600 border-gray-200'
      }`}
    >
      {runStatusLabel[status] ?? status}
    </span>
  )
}

/* ---------- utils ---------- */

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleString('zh-CN', {
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    })
  } catch {
    return iso
  }
}
