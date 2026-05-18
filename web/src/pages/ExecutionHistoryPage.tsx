import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { Loader2, ChevronLeft, X, Trash2 } from 'lucide-react'
import { api } from '../lib/api'
import StatusBadge from '../components/StatusBadge'
import FixPromptPanel from '../components/FixPromptPanel'
import CodePreviewPanel from '../components/CodePreviewPanel'

/* ───────── Interfaces ───────── */

interface RunListItem {
  runId: string
  caseId: string
  caseName?: string
  status: string
  createdAt: string
}

interface RunsResponse {
  runs: RunListItem[]
}

interface RunSummary {
  total: number
  pass: number
  fail: number
  blocked: number
}

interface StepResult {
  stepOrder: number
  action?: string
  status: 'PASS' | 'FAIL' | 'BLOCK'
  screenshotUrl?: string
  error?: string
  pythonCode?: string
}

interface RunDetail {
  runId: string
  status: string
  testCaseId?: string
  caseName?: string
  summary: RunSummary
  steps: StepResult[]
  generatedPythonCode: string
  fixPrompt: string
}

/* ───────── Helpers ───────── */

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

const runStatusConfig: Record<string, { label: string; className: string }> = {
  running: { label: '执行中', className: 'bg-blue-100 text-blue-700 border-blue-200' },
  passed: { label: '已通过', className: 'bg-green-100 text-green-700 border-green-200' },
  failed: { label: '已失败', className: 'bg-red-100 text-red-700 border-red-200' },
  error: { label: '出错', className: 'bg-orange-100 text-orange-700 border-orange-200' },
}

function RunStatusBadge({ status }: { status: string }) {
  const cfg =
    runStatusConfig[status] ?? {
      label: status,
      className: 'bg-gray-100 text-gray-600 border-gray-200',
    }
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium ${cfg.className}`}
    >
      {cfg.label}
    </span>
  )
}

/* ───────── Screenshot Modal ───────── */

function ScreenshotModal({ url, onClose }: { url: string; onClose: () => void }) {
  useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', handleEsc)
    return () => document.removeEventListener('keydown', handleEsc)
  }, [onClose])

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
      onClick={onClose}
    >
      <div
        className="relative max-w-[90vw] max-h-[90vh]"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          onClick={onClose}
          className="absolute -top-3 -right-3 w-8 h-8 rounded-full bg-white shadow-lg flex items-center justify-center hover:bg-gray-100 transition-colors"
        >
          <X className="w-4 h-4" />
        </button>
        <img
          src={url}
          alt="截图"
          className="max-w-full max-h-[85vh] rounded-lg shadow-2xl"
        />
      </div>
    </div>
  )
}

/* ───────── Step Card ───────── */

function StepCard({
  step,
  onScreenshotClick,
}: {
  step: StepResult
  onScreenshotClick: (url: string) => void
}) {
  return (
    <div className="rounded-lg border border-gray-200 overflow-hidden">
      <div className="flex items-start gap-3 p-4">
        <span className="shrink-0 w-6 h-6 rounded-full bg-gray-100 text-gray-500 text-xs font-medium flex items-center justify-center mt-0.5">
          {step.stepOrder}
        </span>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-sm font-medium text-gray-800 truncate">
              {step.action || `步骤 ${step.stepOrder}`}
            </span>
            <StatusBadge status={step.status} size="sm" />
          </div>

          {step.screenshotUrl && (
            <img
              src={step.screenshotUrl}
              alt={`步骤 ${step.stepOrder} 截图`}
              className="mt-2 rounded-md border border-gray-200 max-w-[200px] max-h-[120px] object-cover cursor-pointer hover:opacity-80 transition-opacity"
              onClick={() => onScreenshotClick(step.screenshotUrl!)}
            />
          )}

          {step.status === 'FAIL' && step.error && (
            <div className="mt-2 p-3 rounded-md bg-red-50 border border-red-200">
              <p className="text-xs font-medium text-red-700 mb-1">错误信息</p>
              <p className="text-xs text-red-600 font-mono whitespace-pre-wrap">
                {step.error}
              </p>
            </div>
          )}

          {step.pythonCode && (
            <div className="mt-2">
              <p className="text-xs font-medium text-gray-500 mb-1">
                Python 代码片段
              </p>
              <pre className="p-3 rounded-md bg-gray-50 border border-gray-200 text-xs font-mono text-gray-700 overflow-x-auto max-h-32 overflow-y-auto">
                {step.pythonCode}
              </pre>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

/* ───────── Page ───────── */

export default function ExecutionHistoryPage() {
  const { runId } = useParams<{ runId: string }>()
  const navigate = useNavigate()

  const [runs, setRuns] = useState<RunListItem[]>([])
  const [listLoading, setListLoading] = useState(false)
  const [listError, setListError] = useState<string | null>(null)

  const [detail, setDetail] = useState<RunDetail | null>(null)
  const [detailLoading, setDetailLoading] = useState(false)
  const [detailError, setDetailError] = useState<string | null>(null)

  const [modalUrl, setModalUrl] = useState<string | null>(null)
  const [clearing, setClearing] = useState(false)

  const handleClearRuns = async () => {
    if (!confirm('确定要清除全部执行记录吗？此操作不可恢复。')) return
    setClearing(true)
    try {
      await api.delete('/execution/runs')
      setRuns([])
    } catch {}
    finally { setClearing(false) }
  }

  /* ── fetch runs list ── */
  useEffect(() => {
    if (runId) return
    setListLoading(true)
    setListError(null)
    api
      .get<RunsResponse>('/execution/runs')
      .then((res) => setRuns(res.runs))
      .catch((err) =>
        setListError(
          err instanceof Error ? err.message : '获取执行记录失败',
        ),
      )
      .finally(() => setListLoading(false))
  }, [runId])

  /* ── fetch run detail ── */
  useEffect(() => {
    if (!runId) return
    setDetailLoading(true)
    setDetailError(null)
    setDetail(null)
    api
      .get<RunDetail>(`/execution/runs/${runId}`)
      .then(setDetail)
      .catch((err) =>
        setDetailError(
          err instanceof Error ? err.message : '获取执行详情失败',
        ),
      )
      .finally(() => setDetailLoading(false))
  }, [runId])

  /* ────── LIST MODE ────── */
  if (!runId) {
    return (
      <div className="max-w-4xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-semibold text-gray-800">执行历史</h1>
          {runs.length > 0 && (
            <button
              onClick={handleClearRuns}
              disabled={clearing}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-red-600 hover:bg-red-50 border border-red-200 rounded-md transition-colors disabled:opacity-50"
            >
              <Trash2 className="w-3.5 h-3.5" />
              {clearing ? '清除中...' : '清除全部记录'}
            </button>
          )}
        </div>

        {listLoading && (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="w-6 h-6 text-blue-600 animate-spin" />
            <span className="ml-3 text-sm text-gray-500">加载中...</span>
          </div>
        )}

        {listError && (
          <div className="p-4 rounded-lg bg-red-50 border border-red-200 text-sm text-red-700">
            {listError}
          </div>
        )}

        {!listLoading && !listError && runs.length === 0 && (
          <div className="flex flex-col items-center justify-center py-20 text-gray-400">
            <p className="text-base">暂无执行记录</p>
          </div>
        )}

        {!listLoading && runs.length > 0 && (
          <div className="overflow-hidden rounded-lg border border-gray-200">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    用例名称
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    状态
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    时间
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {runs.map((run) => (
                  <tr
                    key={run.runId}
                    onClick={() => navigate(`/history/${run.runId}`)}
                    className="cursor-pointer hover:bg-gray-50 transition-colors"
                  >
                    <td className="px-4 py-3 text-sm font-medium text-gray-800">
                      {run.caseName || run.caseId}
                    </td>
                    <td className="px-4 py-3">
                      <RunStatusBadge status={run.status} />
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-500">
                      {formatDate(run.createdAt)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    )
  }

  /* ────── DETAIL MODE ────── */
  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <button
        onClick={() => navigate('/history')}
        className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-800 transition-colors"
      >
        <ChevronLeft className="w-4 h-4" />
        返回列表
      </button>

      {detailLoading && (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="w-6 h-6 text-blue-600 animate-spin" />
          <span className="ml-3 text-sm text-gray-500">加载中...</span>
        </div>
      )}

      {detailError && (
        <>
          <h1 className="text-2xl font-semibold text-gray-800">执行详情</h1>
          <div className="p-4 rounded-lg bg-red-50 border border-red-200 text-sm text-red-700">
            {detailError}
          </div>
        </>
      )}

      {!detailLoading && !detailError && detail && (
        <>
          <h1 className="text-2xl font-semibold text-gray-800">
            {detail.caseName
              ? `${detail.caseName} - 执行详情`
              : '执行详情'}
          </h1>

          <section>
            <h2 className="text-base font-medium text-gray-800 mb-3">
              执行步骤
            </h2>
            {detail.steps.length === 0 ? (
              <p className="text-sm text-gray-400 py-4">暂无执行步骤</p>
            ) : (
              <div className="space-y-3">
                {detail.steps.map((step) => (
                  <StepCard
                    key={step.stepOrder}
                    step={step}
                    onScreenshotClick={(url) => setModalUrl(url)}
                  />
                ))}
              </div>
            )}
          </section>

          <FixPromptPanel prompt={detail.fixPrompt} />
          <CodePreviewPanel code={detail.generatedPythonCode} />
        </>
      )}

      {!detailLoading && !detailError && !detail && (
        <>
          <h1 className="text-2xl font-semibold text-gray-800">执行详情</h1>
          <p className="text-sm text-gray-400">未找到执行详情</p>
        </>
      )}

      {modalUrl && (
        <ScreenshotModal
          url={modalUrl}
          onClose={() => setModalUrl(null)}
        />
      )}
    </div>
  )
}
