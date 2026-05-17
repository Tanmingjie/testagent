import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { RotateCw, Loader2 } from 'lucide-react'
import { api } from '../lib/api'
import StatusBadge from '../components/StatusBadge'
import FixPromptPanel from '../components/FixPromptPanel'
import CodePreviewPanel from '../components/CodePreviewPanel'

interface RunSummary {
  total: number
  passed: number
  failed: number
  blocked: number
}

interface StepResult {
  action: string
  status: 'PASS' | 'FAIL' | 'BLOCK'
  screenshotUrl?: string
  errorMessage?: string
  generatedCode?: string
}

interface RunReport {
  summary: RunSummary
  steps: StepResult[]
  generatedPythonCode: string
  fixPrompt: string
  testCaseId?: string
}

const summaryCards = [
  { key: 'total', label: '总计', color: 'text-gray-700 bg-gray-50 border-gray-200' },
  { key: 'passed', label: '通过', color: 'text-green-700 bg-green-50 border-green-200' },
  { key: 'failed', label: '失败', color: 'text-red-700 bg-red-50 border-red-200' },
  { key: 'blocked', label: '阻塞', color: 'text-orange-700 bg-orange-50 border-orange-200' },
] as const

export default function ReportPage() {
  const { runId } = useParams<{ runId: string }>()
  const navigate = useNavigate()
  const [report, setReport] = useState<RunReport | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [rerunning, setRerunning] = useState(false)

  useEffect(() => {
    if (!runId) {
      setLoading(false)
      return
    }

    setLoading(true)
    setError(null)
    api.get<RunReport>(`/execution/runs/${runId}`)
      .then(setReport)
      .catch((err) => setError(err instanceof Error ? err.message : '获取报告失败'))
      .finally(() => setLoading(false))
  }, [runId])

  const handleRerun = async () => {
    if (!report?.testCaseId) return
    setRerunning(true)
    setError(null)
    try {
      const result = await api.post<{ runId: string }>(`/execution/run/${report.testCaseId}`, {})
      navigate(`/execute?runId=${result.runId}`)
    } catch (err) {
      setError(err instanceof Error ? err.message : '重新执行失败')
    } finally {
      setRerunning(false)
    }
  }

  if (!runId) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-gray-400">
        <p className="text-base">请选择一个运行记录查看报告</p>
      </div>
    )
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-6 h-6 text-blue-600 animate-spin" />
        <span className="ml-3 text-sm text-gray-500">加载中...</span>
      </div>
    )
  }

  if (error) {
    return (
      <div className="max-w-2xl mx-auto">
        <h1 className="text-2xl font-semibold text-gray-800 mb-6">测试报告</h1>
        <div className="p-4 rounded-lg bg-red-50 border border-red-200 text-sm text-red-700">
          {error}
        </div>
      </div>
    )
  }

  if (!report) {
    return (
      <div className="max-w-2xl mx-auto">
        <h1 className="text-2xl font-semibold text-gray-800 mb-6">测试报告</h1>
        <p className="text-sm text-gray-400">未找到报告数据</p>
      </div>
    )
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-gray-800">测试报告</h1>
        {report.testCaseId && (
          <button
            onClick={handleRerun}
            disabled={rerunning}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors bg-blue-600 text-white hover:bg-blue-700 active:bg-blue-800 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {rerunning ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                重新执行中...
              </>
            ) : (
              <>
                <RotateCw className="w-4 h-4" />
                重新执行
              </>
            )}
          </button>
        )}
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {summaryCards.map(({ key, label, color }) => (
          <div
            key={key}
            className={`rounded-lg border p-4 ${color}`}
          >
            <p className="text-xs font-medium uppercase tracking-wider opacity-70">{label}</p>
            <p className="text-2xl font-bold mt-1">
              {report.summary[key as keyof RunSummary]}
            </p>
          </div>
        ))}
      </div>

      <section>
        <h2 className="text-base font-medium text-gray-800 mb-3">执行步骤</h2>
        {report.steps.length === 0 ? (
          <p className="text-sm text-gray-400 py-4">暂无执行步骤</p>
        ) : (
          <div className="space-y-3">
            {report.steps.map((step, idx) => (
              <StepCard key={idx} step={step} index={idx} />
            ))}
          </div>
        )}
      </section>

      <FixPromptPanel prompt={report.fixPrompt} />

      <CodePreviewPanel code={report.generatedPythonCode} />
    </div>
  )
}

function StepCard({ step, index }: { step: StepResult; index: number }) {
  return (
    <div className="rounded-lg border border-gray-200 overflow-hidden">
      <div className="flex items-start gap-3 p-4">
        <span className="shrink-0 w-6 h-6 rounded-full bg-gray-100 text-gray-500 text-xs font-medium flex items-center justify-center mt-0.5">
          {index + 1}
        </span>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-sm font-medium text-gray-800 truncate">
              {step.action}
            </span>
            <StatusBadge status={step.status} size="sm" />
          </div>

          {step.screenshotUrl && (
            <img
              src={step.screenshotUrl}
              alt={`步骤 ${index + 1} 截图`}
              className="mt-2 rounded-md border border-gray-200 max-w-[200px] max-h-[120px] object-cover"
            />
          )}

          {step.status === 'FAIL' && step.errorMessage && (
            <div className="mt-2 p-3 rounded-md bg-red-50 border border-red-200">
              <p className="text-xs font-medium text-red-700 mb-1">错误信息</p>
              <p className="text-xs text-red-600 font-mono whitespace-pre-wrap">{step.errorMessage}</p>
            </div>
          )}

          {step.status === 'FAIL' && step.generatedCode && (
            <div className="mt-2">
              <p className="text-xs font-medium text-gray-500 mb-1">生成代码片段</p>
              <pre className="p-3 rounded-md bg-gray-50 border border-gray-200 text-xs font-mono text-gray-700 overflow-x-auto max-h-32 overflow-y-auto">
                {step.generatedCode}
              </pre>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
