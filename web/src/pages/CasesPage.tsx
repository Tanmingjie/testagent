import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { Search, ChevronDown, ChevronRight, Play, Loader2, Trash2 } from 'lucide-react'
import { api } from '../lib/api'

interface StepInfo {
  order: number
  actionText: string
  expectedText: string
}

interface TreeCase {
  id: string
  name: string
  steps?: StepInfo[]
}

interface TreeModule {
  name: string
  cases: TreeCase[]
}

interface TreeResponse {
  modules: TreeModule[]
}

export default function CasesPage() {
  const navigate = useNavigate()
  const [modules, setModules] = useState<TreeModule[]>([])
  const [filteredModules, setFilteredModules] = useState<TreeModule[]>([])
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const [expandedCases, setExpandedCases] = useState<Set<string>>(new Set())
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)
  const [fetchError, setFetchError] = useState<string | null>(null)
  const [deletingCaseIds, setDeletingCaseIds] = useState<Set<string>>(new Set())
  const [deletingAll, setDeletingAll] = useState(false)

  useEffect(() => {
    fetchTree()
  }, [])

  useEffect(() => {
    if (!search.trim()) {
      setFilteredModules(modules)
      return
    }
    const q = search.toLowerCase()
    const filtered = modules
      .map((m) => ({
        ...m,
        cases: m.cases.filter(
          (c) =>
            c.name.toLowerCase().includes(q) || m.name.toLowerCase().includes(q)
        ),
      }))
      .filter((m) => m.cases.length > 0)
    setFilteredModules(filtered)
  }, [search, modules])

  async function fetchTree() {
    setLoading(true)
    setFetchError(null)
    try {
      const data = await api.get<TreeResponse>('/test-cases/tree?withSteps=true')
      setModules(data.modules)
      setFilteredModules(data.modules)
      setExpanded(new Set(data.modules.map((m) => m.name)))
    } catch {
      setFetchError('获取用例列表失败')
    } finally {
      setLoading(false)
    }
  }

  function toggleModule(name: string) {
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(name)) next.delete(name)
      else next.add(name)
      return next
    })
  }

  function toggleCase(caseId: string) {
    setExpandedCases((prev) => {
      const next = new Set(prev)
      if (next.has(caseId)) next.delete(caseId)
      else next.add(caseId)
      return next
    })
  }

  function handleExecute(caseId: string) {
    navigate(`/execute?caseId=${caseId}`)
  }

  async function handleDeleteCase(caseId: string) {
    if (!window.confirm('确定要删除该用例吗？此操作不可撤销。')) return
    setDeletingCaseIds((prev) => new Set(prev).add(caseId))
    try {
      await api.delete(`/test-cases/${caseId}`)
      await fetchTree()
    } catch {
      alert('删除失败，请重试')
    } finally {
      setDeletingCaseIds((prev) => {
        const next = new Set(prev)
        next.delete(caseId)
        return next
      })
    }
  }

  async function handleDeleteModule(moduleName: string) {
    if (!window.confirm(`确定要删除「${moduleName}」下的全部用例吗？此操作不可撤销。`)) return
    setDeletingAll(true)
    try {
      await api.delete(`/test-cases/batch?productLine=${encodeURIComponent(moduleName)}`)
      await fetchTree()
    } catch {
      alert('删除失败，请重试')
    } finally {
      setDeletingAll(false)
    }
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-semibold text-gray-800">用例管理</h1>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            placeholder="搜索用例..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9 pr-3 py-2 rounded-lg border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent w-64"
          />
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
        </div>
      ) : fetchError ? (
        <div className="text-center py-20">
          <p className="text-lg text-red-500 mb-2">{fetchError}</p>
          <button
            onClick={fetchTree}
            className="text-sm text-blue-600 hover:text-blue-800 underline"
          >
            点击重试
          </button>
        </div>
      ) : filteredModules.length === 0 ? (
        <div className="text-center py-20 text-gray-400">
          <p className="text-lg">暂无用例</p>
          <p className="text-sm mt-1">请先导入测试用例</p>
        </div>
      ) : (
        <div className="space-y-3">
          {filteredModules.map((module) => (
            <div
              key={module.name}
              className="rounded-lg border border-gray-200 overflow-hidden"
            >
              <div className="w-full flex items-center gap-2 px-4 py-3 bg-gray-50">
                <button
                  onClick={() => toggleModule(module.name)}
                  className="flex items-center gap-2 flex-1 hover:text-gray-900 transition-colors text-left"
                >
                  {expanded.has(module.name) ? (
                    <ChevronDown className="w-4 h-4 text-gray-400 shrink-0" />
                  ) : (
                    <ChevronRight className="w-4 h-4 text-gray-400 shrink-0" />
                  )}
                  <span className="text-sm font-medium text-gray-700">
                    {module.name}
                  </span>
                  <span className="text-xs text-gray-400">
                    {module.cases.length} 个用例
                  </span>
                </button>
                <button
                  onClick={(e) => { e.stopPropagation(); handleDeleteModule(module.name) }}
                  disabled={deletingAll}
                  className="flex items-center gap-1 px-2 py-1 rounded text-xs text-red-400 hover:text-red-600 hover:bg-red-50 transition-colors disabled:opacity-40 shrink-0"
                >
                  <Trash2 className="w-3 h-3" />
                  删除全部
                </button>
              </div>

              {expanded.has(module.name) && (
                <div className="divide-y divide-gray-100">
                  {module.cases.map((tc) => (
                    <div key={tc.id}>
                      <div
                        onClick={() => toggleCase(tc.id)}
                        className="flex items-center gap-3 px-4 py-3 hover:bg-gray-50 transition-colors cursor-pointer"
                      >
                        <div className="flex-1 min-w-0">
                          <span className="text-sm font-medium text-gray-800 truncate">
                            {tc.name}
                          </span>
                        </div>

                        <button
                          onClick={(e) => { e.stopPropagation(); handleExecute(tc.id) }}
                          className="flex items-center gap-1 px-3 py-1.5 rounded-md text-xs font-medium text-white bg-green-600 hover:bg-green-700 transition-colors shrink-0"
                        >
                          <Play className="w-3 h-3" />
                          执行
                        </button>
                        <button
                          onClick={(e) => { e.stopPropagation(); handleDeleteCase(tc.id) }}
                          disabled={deletingCaseIds.has(tc.id)}
                          className="flex items-center gap-1 px-2 py-1.5 rounded-md text-xs font-medium text-red-400 hover:text-white border border-red-300 hover:bg-red-500 transition-colors shrink-0 disabled:opacity-40 disabled:cursor-not-allowed"
                        >
                          {deletingCaseIds.has(tc.id) ? (
                            <Loader2 className="w-3 h-3 animate-spin" />
                          ) : (
                            <Trash2 className="w-3 h-3" />
                          )}
                        </button>
                      </div>

                      {expandedCases.has(tc.id) && tc.steps && tc.steps.length > 0 && (
                        <div className="px-4 pb-3">
                          <table className="w-full text-xs border-collapse">
                            <thead>
                              <tr className="border-t border-gray-100">
                                <th className="text-left py-1.5 pr-3 text-gray-500 font-medium w-12">步骤</th>
                                <th className="text-left py-1.5 pr-3 text-gray-500 font-medium">操作</th>
                                <th className="text-left py-1.5 text-gray-500 font-medium">预期结果</th>
                              </tr>
                            </thead>
                            <tbody>
                              {tc.steps.map((step) => (
                                <tr key={step.order} className="border-t border-gray-50">
                                  <td className="py-1.5 pr-3 text-gray-400 align-top">{step.order}</td>
                                  <td className="py-1.5 pr-3 text-gray-700 align-top">{step.actionText}</td>
                                  <td className="py-1.5 text-gray-700 align-top">{step.expectedText}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
