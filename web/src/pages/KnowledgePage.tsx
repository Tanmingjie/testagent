import { useState, useEffect, useCallback } from 'react'
import { api } from '../lib/api'
import { Plus, Trash2, Save, Loader2 } from 'lucide-react'

interface ProductLine {
  id: string
  name: string
}

interface VocabItem {
  term: string
  locator?: string
  description?: string
}

interface TestDataItem {
  key: string
  value: string
  environment?: string
}

interface BehaviorItem {
  instruction: string
  priority: string
}

interface PreconditionItem {
  name: string
  description?: string
  steps: string[]
}

type SectionKey = 'vocab' | 'testData' | 'behaviors' | 'preconditions'

const SECTIONS: { key: SectionKey; label: string }[] = [
  { key: 'vocab', label: '术语词汇' },
  { key: 'testData', label: '测试数据' },
  { key: 'behaviors', label: '行为指令' },
  { key: 'preconditions', label: '前置条件' },
]

const PRIORITY_OPTIONS = [
  { value: 'high', label: '高' },
  { value: 'medium', label: '中' },
  { value: 'low', label: '低' },
]

const emptyVocab = (): VocabItem => ({ term: '', locator: '', description: '' })
const emptyTestData = (): TestDataItem => ({ key: '', value: '', environment: '' })
const emptyBehavior = (): BehaviorItem => ({ instruction: '', priority: 'medium' })
const emptyPrecondition = (): PreconditionItem => ({ name: '', description: '', steps: [''] })

export default function KnowledgePage() {
  const [productLines, setProductLines] = useState<ProductLine[]>([])
  const [selectedLine, setSelectedLine] = useState('')
  const [activeSection, setActiveSection] = useState<SectionKey>('vocab')
  const [vocab, setVocab] = useState<VocabItem[]>([])
  const [testData, setTestData] = useState<TestDataItem[]>([])
  const [behaviors, setBehaviors] = useState<BehaviorItem[]>([])
  const [preconditions, setPreconditions] = useState<PreconditionItem[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saveMsg, setSaveMsg] = useState<string | null>(null)

  useEffect(() => {
    api.get<ProductLine[]>('/product-lines')
      .then((lines) => {
        setProductLines(lines)
        if (lines.length > 0) setSelectedLine(lines[0].name)
      })
      .catch(console.error)
  }, [])

  useEffect(() => {
    if (!selectedLine) return
    setLoading(true)
    api.get<{
      vocab?: VocabItem[]
      testData?: TestDataItem[]
      behaviors?: BehaviorItem[]
      preconditions?: PreconditionItem[]
    }>(`/knowledge/${encodeURIComponent(selectedLine)}`)
      .then((data) => {
        setVocab(data.vocab ?? [])
        setTestData(data.testData ?? [])
        setBehaviors(data.behaviors ?? [])
        setPreconditions(data.preconditions ?? [])
      })
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [selectedLine])

  const handleSave = useCallback(async () => {
    if (!selectedLine) return
    setSaving(true)
    setSaveMsg(null)
    try {
      await api.put(`/knowledge/${encodeURIComponent(selectedLine)}`, {
        vocab,
        testData,
        behaviors,
        preconditions,
      })
      setSaveMsg('保存成功')
    } catch {
      setSaveMsg('保存失败')
    } finally {
      setSaving(false)
      setTimeout(() => setSaveMsg(null), 2000)
    }
  }, [selectedLine, vocab, testData, behaviors, preconditions])

  const updateVocab = (i: number, field: keyof VocabItem, value: string) =>
    setVocab((prev) => prev.map((item, idx) => (idx === i ? { ...item, [field]: value } : item)))
  const addVocab = () => setVocab((prev) => [...prev, emptyVocab()])
  const removeVocab = (i: number) => setVocab((prev) => prev.filter((_, idx) => idx !== i))

  const updateTestData = (i: number, field: keyof TestDataItem, value: string) =>
    setTestData((prev) => prev.map((item, idx) => (idx === i ? { ...item, [field]: value } : item)))
  const addTestData = () => setTestData((prev) => [...prev, emptyTestData()])
  const removeTestData = (i: number) => setTestData((prev) => prev.filter((_, idx) => idx !== i))

  const updateBehavior = (i: number, field: keyof BehaviorItem, value: string) =>
    setBehaviors((prev) => prev.map((item, idx) => (idx === i ? { ...item, [field]: value } : item)))
  const addBehavior = () => setBehaviors((prev) => [...prev, emptyBehavior()])
  const removeBehavior = (i: number) => setBehaviors((prev) => prev.filter((_, idx) => idx !== i))

  const updatePrecondition = (i: number, field: 'name' | 'description', value: string) =>
    setPreconditions((prev) => prev.map((item, idx) => (idx === i ? { ...item, [field]: value } : item)))
  const updatePreconditionStep = (i: number, stepIdx: number, value: string) =>
    setPreconditions((prev) =>
      prev.map((item, idx) =>
        idx === i
          ? { ...item, steps: item.steps.map((s, si) => (si === stepIdx ? value : s)) }
          : item,
      ),
    )
  const addPreconditionStep = (i: number) =>
    setPreconditions((prev) =>
      prev.map((item, idx) => (idx === i ? { ...item, steps: [...item.steps, ''] } : item)),
    )
  const removePreconditionStep = (i: number, stepIdx: number) =>
    setPreconditions((prev) =>
      prev.map((item, idx) =>
        idx === i ? { ...item, steps: item.steps.filter((_, si) => si !== stepIdx) } : item,
      ),
    )
  const addPrecondition = () => setPreconditions((prev) => [...prev, emptyPrecondition()])
  const removePrecondition = (i: number) => setPreconditions((prev) => prev.filter((_, idx) => idx !== i))

  if (productLines.length === 0 && !loading) {
    return (
      <div>
        <h1 className="text-2xl font-semibold text-gray-800 mb-4">知识库</h1>
        <p className="text-gray-500">暂无产品线。请先在后台创建知识库文件。</p>
      </div>
    )
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-semibold text-gray-800">知识库</h1>
        <div className="flex items-center gap-3">
          {saveMsg && (
            <span className={`text-sm ${saveMsg.includes('失败') ? 'text-red-600' : 'text-green-600'}`}>
              {saveMsg}
            </span>
          )}
          <button
            onClick={handleSave}
            disabled={saving || loading}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            保存
          </button>
        </div>
      </div>

      <div className="flex gap-1 mb-4 border-b border-gray-200">
        {productLines.map((line) => (
          <button
            key={line.id}
            onClick={() => setSelectedLine(line.name)}
            className={`px-4 py-2 text-sm font-medium rounded-t-lg transition-colors ${
              selectedLine === line.name
                ? 'bg-blue-50 text-blue-700 border-b-2 border-blue-600'
                : 'text-gray-600 hover:text-gray-800 hover:bg-gray-50'
            }`}
          >
            {line.name}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
        </div>
      ) : (
        <>
          <div className="flex gap-4 mb-4">
            {SECTIONS.map((section) => (
              <button
                key={section.key}
                onClick={() => setActiveSection(section.key)}
                className={`px-3 py-1.5 text-sm rounded-md transition-colors ${
                  activeSection === section.key
                    ? 'bg-gray-800 text-white'
                    : 'text-gray-600 hover:bg-gray-100'
                }`}
              >
                {section.label}
              </button>
            ))}
          </div>

          <div className="bg-white border border-gray-200 rounded-lg">
            {activeSection === 'vocab' && renderVocabTable()}
            {activeSection === 'testData' && renderTestDataTable()}
            {activeSection === 'behaviors' && renderBehaviorsTable()}
            {activeSection === 'preconditions' && renderPreconditionsList()}
          </div>
        </>
      )}
    </div>
  )

  function renderVocabTable() {
    return (
      <div className="p-4">
        <table className="w-full border-collapse">
          <thead>
            <tr className="text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
              <th className="pb-3 pr-2 w-2/5">术语</th>
              <th className="pb-3 pr-2 w-1/4">定位符</th>
              <th className="pb-3 pr-2">描述</th>
              <th className="pb-3 w-10" />
            </tr>
          </thead>
          <tbody>
            {vocab.map((item, i) => (
              <tr key={i} className="border-t border-gray-100">
                <td className="py-2 pr-2">
                  <input
                    className="w-full px-2 py-1.5 border border-gray-200 rounded text-sm focus:outline-none focus:border-blue-400"
                    value={item.term}
                    onChange={(e) => updateVocab(i, 'term', e.target.value)}
                    placeholder="输入术语"
                  />
                </td>
                <td className="py-2 pr-2">
                  <input
                    className="w-full px-2 py-1.5 border border-gray-200 rounded text-sm focus:outline-none focus:border-blue-400"
                    value={item.locator ?? ''}
                    onChange={(e) => updateVocab(i, 'locator', e.target.value)}
                    placeholder="CSS/XPath 定位符"
                  />
                </td>
                <td className="py-2 pr-2">
                  <input
                    className="w-full px-2 py-1.5 border border-gray-200 rounded text-sm focus:outline-none focus:border-blue-400"
                    value={item.description ?? ''}
                    onChange={(e) => updateVocab(i, 'description', e.target.value)}
                    placeholder="描述（可选）"
                  />
                </td>
                <td className="py-2">
                  <button
                    onClick={() => removeVocab(i)}
                    className="p-1.5 text-gray-400 hover:text-red-500 transition-colors rounded hover:bg-red-50"
                    title="删除"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <button
          onClick={addVocab}
          className="flex items-center gap-1.5 mt-3 px-3 py-1.5 text-sm text-blue-600 hover:bg-blue-50 rounded-md transition-colors"
        >
          <Plus className="w-4 h-4" />
          添加行
        </button>
      </div>
    )
  }

  function renderTestDataTable() {
    return (
      <div className="p-4">
        <table className="w-full border-collapse">
          <thead>
            <tr className="text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
              <th className="pb-3 pr-2 w-1/3">键</th>
              <th className="pb-3 pr-2 w-1/3">值</th>
              <th className="pb-3 pr-2">环境</th>
              <th className="pb-3 w-10" />
            </tr>
          </thead>
          <tbody>
            {testData.map((item, i) => (
              <tr key={i} className="border-t border-gray-100">
                <td className="py-2 pr-2">
                  <input
                    className="w-full px-2 py-1.5 border border-gray-200 rounded text-sm focus:outline-none focus:border-blue-400"
                    value={item.key}
                    onChange={(e) => updateTestData(i, 'key', e.target.value)}
                    placeholder="变量名"
                  />
                </td>
                <td className="py-2 pr-2">
                  <input
                    className="w-full px-2 py-1.5 border border-gray-200 rounded text-sm focus:outline-none focus:border-blue-400"
                    value={item.value}
                    onChange={(e) => updateTestData(i, 'value', e.target.value)}
                    placeholder="值"
                  />
                </td>
                <td className="py-2 pr-2">
                  <input
                    className="w-full px-2 py-1.5 border border-gray-200 rounded text-sm focus:outline-none focus:border-blue-400"
                    value={item.environment ?? ''}
                    onChange={(e) => updateTestData(i, 'environment', e.target.value)}
                    placeholder="如：staging / production"
                  />
                </td>
                <td className="py-2">
                  <button
                    onClick={() => removeTestData(i)}
                    className="p-1.5 text-gray-400 hover:text-red-500 transition-colors rounded hover:bg-red-50"
                    title="删除"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <button
          onClick={addTestData}
          className="flex items-center gap-1.5 mt-3 px-3 py-1.5 text-sm text-blue-600 hover:bg-blue-50 rounded-md transition-colors"
        >
          <Plus className="w-4 h-4" />
          添加行
        </button>
      </div>
    )
  }

  function renderBehaviorsTable() {
    return (
      <div className="p-4">
        <table className="w-full border-collapse">
          <thead>
            <tr className="text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
              <th className="pb-3 pr-2">指令</th>
              <th className="pb-3 pr-2 w-24">优先级</th>
              <th className="pb-3 w-10" />
            </tr>
          </thead>
          <tbody>
            {behaviors.map((item, i) => (
              <tr key={i} className="border-t border-gray-100">
                <td className="py-2 pr-2">
                  <input
                    className="w-full px-2 py-1.5 border border-gray-200 rounded text-sm focus:outline-none focus:border-blue-400"
                    value={item.instruction}
                    onChange={(e) => updateBehavior(i, 'instruction', e.target.value)}
                    placeholder="指令描述"
                  />
                </td>
                <td className="py-2 pr-2">
                  <select
                    className="w-full px-2 py-1.5 border border-gray-200 rounded text-sm focus:outline-none focus:border-blue-400 bg-white"
                    value={item.priority}
                    onChange={(e) => updateBehavior(i, 'priority', e.target.value)}
                  >
                    {PRIORITY_OPTIONS.map((opt) => (
                      <option key={opt.value} value={opt.value}>
                        {opt.label}
                      </option>
                    ))}
                  </select>
                </td>
                <td className="py-2">
                  <button
                    onClick={() => removeBehavior(i)}
                    className="p-1.5 text-gray-400 hover:text-red-500 transition-colors rounded hover:bg-red-50"
                    title="删除"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <button
          onClick={addBehavior}
          className="flex items-center gap-1.5 mt-3 px-3 py-1.5 text-sm text-blue-600 hover:bg-blue-50 rounded-md transition-colors"
        >
          <Plus className="w-4 h-4" />
          添加行
        </button>
      </div>
    )
  }

  function renderPreconditionsList() {
    if (preconditions.length === 0) {
      return (
        <div className="p-6 text-center text-gray-400">
          <p className="mb-3">暂无前置条件</p>
          <button
            onClick={addPrecondition}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm text-blue-600 hover:bg-blue-50 rounded-md transition-colors"
          >
            <Plus className="w-4 h-4" />
            添加前置条件
          </button>
        </div>
      )
    }

    return (
      <div className="p-4 space-y-4">
        {preconditions.map((item, i) => (
          <div key={i} className="border border-gray-200 rounded-lg p-4">
            <div className="flex items-start justify-between mb-3">
              <div className="flex-1 space-y-2">
                <input
                  className="w-full px-2 py-1.5 border border-gray-200 rounded text-sm font-medium focus:outline-none focus:border-blue-400"
                  value={item.name}
                  onChange={(e) => updatePrecondition(i, 'name', e.target.value)}
                  placeholder="前置条件名称"
                />
                <input
                  className="w-full px-2 py-1.5 border border-gray-200 rounded text-sm focus:outline-none focus:border-blue-400"
                  value={item.description ?? ''}
                  onChange={(e) => updatePrecondition(i, 'description', e.target.value)}
                  placeholder="描述（可选）"
                />
              </div>
              <button
                onClick={() => removePrecondition(i)}
                className="p-1.5 text-gray-400 hover:text-red-500 transition-colors rounded hover:bg-red-50 ml-2 shrink-0"
                title="删除此前置条件"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>

            <div className="ml-1">
              <p className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-2">步骤序列</p>
              <div className="space-y-1.5">
                {item.steps.map((step, si) => (
                  <div key={si} className="flex items-center gap-2">
                    <span className="text-xs text-gray-400 w-5 text-right shrink-0">{si + 1}.</span>
                    <input
                      className="flex-1 px-2 py-1.5 border border-gray-200 rounded text-sm focus:outline-none focus:border-blue-400"
                      value={step}
                      onChange={(e) => updatePreconditionStep(i, si, e.target.value)}
                      placeholder={`步骤 ${si + 1}`}
                    />
                    <button
                      onClick={() => removePreconditionStep(i, si)}
                      className="p-1 text-gray-400 hover:text-red-500 transition-colors rounded hover:bg-red-50 shrink-0"
                      title="删除步骤"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>
              <button
                onClick={() => addPreconditionStep(i)}
                className="flex items-center gap-1 mt-2 px-2 py-1 text-xs text-blue-600 hover:bg-blue-50 rounded transition-colors"
              >
                <Plus className="w-3.5 h-3.5" />
                添加步骤
              </button>
            </div>
          </div>
        ))}

        <button
          onClick={addPrecondition}
          className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-blue-600 hover:bg-blue-50 rounded-md transition-colors"
        >
          <Plus className="w-4 h-4" />
          添加前置条件
        </button>
      </div>
    )
  }
}
