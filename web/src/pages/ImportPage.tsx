import { useState, useRef, useCallback, useEffect } from 'react'
import { Upload, FileSpreadsheet, FileText, X, Loader2 } from 'lucide-react'
import { api } from '../lib/api'

interface ProductLine {
  id: string
  name: string
}

interface ImportedCase {
  id: string
  name: string
  status: string
}

interface ImportResult {
  cases: ImportedCase[]
}

export default function ImportPage() {
  const [productLines, setProductLines] = useState<ProductLine[]>([])
  const [selectedProductLine, setSelectedProductLine] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const [dragOver, setDragOver] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [result, setResult] = useState<ImportedCase[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loadingLines, setLoadingLines] = useState(true)
  const fileInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    setLoadingLines(true)
    api.get<ProductLine[]>('/product-lines')
      .then((lines) => {
        setProductLines(lines)
        if (lines.length > 0) setSelectedProductLine(lines[0].id)
      })
      .catch(() => setError('获取产品线列表失败'))
      .finally(() => setLoadingLines(false))
  }, [])

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setDragOver(true)
  }, [])

  const handleDragLeave = useCallback(() => {
    setDragOver(false)
  }, [])

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setDragOver(false)
    const droppedFile = e.dataTransfer.files[0]
    if (droppedFile && (droppedFile.name.endsWith('.xlsx') || droppedFile.name.endsWith('.md'))) {
      setFile(droppedFile)
      setResult(null)
      setError(null)
    } else {
      setError('仅支持 .xlsx 和 .md 文件')
    }
  }, [])

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = e.target.files?.[0]
    if (selected) {
      setFile(selected)
      setResult(null)
      setError(null)
    }
  }

  const handleUpload = async () => {
    if (!file || !selectedProductLine) return

    setUploading(true)
    setError(null)
    setResult(null)

    try {
      const formData = new FormData()
      formData.append('file', file)
      formData.append('productLineId', selectedProductLine)

      const data = await api.upload<ImportResult>('/test-cases/import', formData)
      setResult(data.cases)
      setFile(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : '导入失败')
    } finally {
      setUploading(false)
    }
  }

  const clearFile = () => {
    setFile(null)
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  if (loadingLines) {
    return (
      <div className="max-w-2xl mx-auto">
        <h1 className="text-2xl font-semibold text-gray-800 mb-6">导入用例</h1>
        <div className="flex items-center justify-center py-20">
          <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
        </div>
      </div>
    )
  }

  if (productLines.length === 0) {
    return (
      <div className="max-w-2xl mx-auto">
        <h1 className="text-2xl font-semibold text-gray-800 mb-6">导入用例</h1>
        <div className="text-center py-20 text-gray-400">
          <FileSpreadsheet className="w-12 h-12 mx-auto mb-3 text-gray-300" />
          <p className="text-lg">未配置产品线</p>
          <p className="text-sm mt-1">请先创建知识库文件以配置产品线</p>
        </div>
      </div>
    )
  }

  return (
    <div className="max-w-2xl mx-auto">
      <h1 className="text-2xl font-semibold text-gray-800 mb-6">导入用例</h1>

      <div className="mb-4">
        <label className="block text-sm font-medium text-gray-700 mb-1">产品线</label>
        <select
          value={selectedProductLine}
          onChange={(e) => setSelectedProductLine(e.target.value)}
          className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white"
        >
          {productLines.map((line) => (
            <option key={line.id} value={line.id}>
              {line.name}
            </option>
          ))}
        </select>
      </div>

      <div
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onClick={() => fileInputRef.current?.click()}
        className={`relative border-2 border-dashed rounded-xl p-10 text-center cursor-pointer transition-colors ${
          dragOver
            ? 'border-blue-400 bg-blue-50'
            : 'border-gray-300 bg-gray-50 hover:border-gray-400 hover:bg-gray-100'
        }`}
      >
        {file ? (
          <div className="flex items-center justify-center gap-3" onClick={(e) => e.stopPropagation()}>
            {file.name.endsWith('.xlsx') ? (
              <FileSpreadsheet className="w-8 h-8 text-green-600" />
            ) : (
              <FileText className="w-8 h-8 text-blue-600" />
            )}
            <div className="text-left">
              <p className="text-sm font-medium text-gray-700">{file.name}</p>
              <p className="text-xs text-gray-500">
                {(file.size / 1024).toFixed(1)} KB
              </p>
            </div>
            <button
              onClick={clearFile}
              className="ml-2 p-1 rounded-full hover:bg-gray-200 transition-colors"
            >
              <X className="w-4 h-4 text-gray-400" />
            </button>
          </div>
        ) : (
          <div>
            <Upload className="w-10 h-10 text-gray-400 mx-auto mb-3" />
            <p className="text-sm text-gray-600">
              拖拽文件到此处，或<span className="text-blue-600 font-medium">点击选择</span>
            </p>
            <p className="text-xs text-gray-400 mt-1">支持 .xlsx 和 .md 格式</p>
          </div>
        )}
        <input
          ref={fileInputRef}
          type="file"
          accept=".xlsx,.md"
          className="hidden"
          onChange={handleFileSelect}
        />
      </div>

      <button
        onClick={handleUpload}
        disabled={!file || !selectedProductLine || uploading}
        className="mt-4 w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed bg-blue-600 text-white hover:bg-blue-700 active:bg-blue-800"
      >
        {uploading ? (
          <>
            <Loader2 className="w-4 h-4 animate-spin" />
            导入中...
          </>
        ) : (
          <>
            <Upload className="w-4 h-4" />
            导入
          </>
        )}
      </button>

      {error && (
        <div className="mt-4 p-3 rounded-lg bg-red-50 border border-red-200 text-sm text-red-700">
          {error}
        </div>
      )}

      {result && (
        <div className="mt-6 p-4 rounded-lg bg-green-50 border border-green-200">
          <p className="text-sm font-medium text-green-800 mb-2">
            导入成功 — 共 {result.length} 个用例
          </p>
          <ul className="space-y-1">
            {result.map((c) => (
              <li key={c.id} className="text-sm text-green-700 flex items-center gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-green-500 shrink-0" />
                {c.name}
                <span className="text-xs text-green-500">({c.status})</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}
