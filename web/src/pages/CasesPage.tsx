import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { Search, ChevronDown, ChevronRight, Play, Languages, Split, Loader2 } from 'lucide-react'
import { api } from '../lib/api'
import StatusBadge from '../components/StatusBadge'

interface TreeCase {
  id: string
  name: string
  status: string
  lastRunStatus?: string
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
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)
  const [fetchError, setFetchError] = useState<string | null>(null)
  const [actionLoading, setActionLoading] = useState<Record<string, 'translate' | 'decompose'>>({})

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
      const data = await api.get<TreeResponse>('/test-cases/tree')
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

  async function handleTranslate(caseId: string) {
    setActionLoading((prev) => ({ ...prev, [caseId]: 'translate' }))
    try {
      await api.post(`/test-cases/${caseId}/translate`, {})
      await fetchTree()
    } catch {
    } finally {
      setActionLoading((prev) => {
        const next = { ...prev }
        delete next[caseId]
        return next
      })
    }
  }

  async function handleDecompose(caseId: string) {
    setActionLoading((prev) => ({ ...prev, [caseId]: 'decompose' }))
    try {
      await api.post(`/test-cases/${caseId}/decompose`, {})
      await fetchTree()
    } catch {
    } finally {
      setActionLoading((prev) => {
        const next = { ...prev }
        delete next[caseId]
        return next
      })
    }
  }

  function handleExecute(caseId: string) {
    navigate(`/execute?caseId=${caseId}`)
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
              <button
                onClick={() => toggleModule(module.name)}
                className="w-full flex items-center gap-2 px-4 py-3 bg-gray-50 hover:bg-gray-100 transition-colors text-left"
              >
                {expanded.has(module.name) ? (
                  <ChevronDown className="w-4 h-4 text-gray-400 shrink-0" />
                ) : (
                  <ChevronRight className="w-4 h-4 text-gray-400 shrink-0" />
                )}
                <span className="text-sm font-medium text-gray-700">
                  {module.name}
                </span>
                <span className="text-xs text-gray-400 ml-auto">
                  {module.cases.length} 个用例
                </span>
              </button>

              {expanded.has(module.name) && (
                <div className="divide-y divide-gray-100">
                  {module.cases.map((tc) => {
                    const isLoading = actionLoading[tc.id]
                    return (
                      <div
                        key={tc.id}
                        className="flex items-center gap-3 px-4 py-3 hover:bg-gray-50 transition-colors"
                      >
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-gray-800 truncate">
                            {tc.name}
                          </p>
                          <div className="flex items-center gap-2 mt-1">
                            <StatusBadge
                              status={tc.status as any}
                              size="sm"
                            />
                            <StatusBadge
                              status={
                                (tc.lastRunStatus as any) ?? 'not_run'
                              }
                              size="sm"
                            />
                          </div>
                        </div>

                        <div className="flex items-center gap-1.5 shrink-0">
                          <button
                            onClick={() => handleTranslate(tc.id)}
                            disabled={!!isLoading}
                            className="flex items-center gap-1 px-2.5 py-1.5 rounded-md text-xs font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed text-blue-600 hover:bg-blue-50 border border-blue-200"
                          >
                            {isLoading === 'translate' ? (
                              <Loader2 className="w-3 h-3 animate-spin" />
                            ) : (
                              <Languages className="w-3 h-3" />
                            )}
                            翻译
                          </button>
                          <button
                            onClick={() => handleDecompose(tc.id)}
                            disabled={!!isLoading}
                            className="flex items-center gap-1 px-2.5 py-1.5 rounded-md text-xs font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed text-purple-600 hover:bg-purple-50 border border-purple-200"
                          >
                            {isLoading === 'decompose' ? (
                              <Loader2 className="w-3 h-3 animate-spin" />
                            ) : (
                              <Split className="w-3 h-3" />
                            )}
                            分解
                          </button>
                          <button
                            onClick={() => handleExecute(tc.id)}
                            className="flex items-center gap-1 px-2.5 py-1.5 rounded-md text-xs font-medium transition-colors text-green-600 hover:bg-green-50 border border-green-200"
                          >
                            <Play className="w-3 h-3" />
                            执行
                          </button>
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
