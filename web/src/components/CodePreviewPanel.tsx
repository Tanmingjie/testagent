import { useState, useCallback } from 'react'
import { Copy, Check, Download } from 'lucide-react'

interface CodePreviewPanelProps {
  code: string
  filename?: string
}

function highlightPython(code: string): string {
  const escaped = code
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')

  return escaped.replace(
    /('''[\s\S]*?'''|"""[\s\S]*?"""|'[^'\\]*(?:\\.[^'\\]*)*'|"[^"\\]*(?:\\.[^"\\]*)*"|#[^\n]*|@\w+\b|\b(?:import|from|def|class|if|elif|else|for|while|return|try|except|finally|with|as|pass|break|continue|and|or|not|in|is|None|True|False|print|self|yield|raise|lambda|global|nonlocal|del|assert|async|await)\b|\b\d+(?:\.\d+)?\b)/g,
    (match) => {
      if (/^'''/.test(match) || /^"""/.test(match) || /^'/.test(match) || /^"/.test(match))
        return `<span class="text-amber-600">${match}</span>`
      if (/^#/.test(match))
        return `<span class="text-green-600">${match}</span>`
      if (/^@/.test(match))
        return `<span class="text-purple-600">${match}</span>`
      if (/^\d/.test(match))
        return `<span class="text-cyan-600">${match}</span>`
      return `<span class="text-blue-600 font-medium">${match}</span>`
    },
  )
}

export default function CodePreviewPanel({ code, filename = 'script.py' }: CodePreviewPanelProps) {
  const [copied, setCopied] = useState(false)

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(code)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // Clipboard API may fail in insecure contexts
    }
  }, [code])

  const handleDownload = useCallback(() => {
    const blob = new Blob([code], { type: 'text/x-python' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = filename
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }, [code, filename])

  if (!code) {
    return (
      <div className="rounded-lg border border-gray-200 p-6">
        <h3 className="text-sm font-medium text-gray-500 mb-1">生成代码</h3>
        <p className="text-sm text-gray-400">暂无生成的代码</p>
      </div>
    )
  }

  return (
    <div className="rounded-lg border border-gray-200 overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 bg-gray-50">
        <h3 className="text-sm font-medium text-gray-800">生成代码</h3>
        <div className="flex items-center gap-2">
          <button
            onClick={handleCopy}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors bg-white border border-gray-200 text-gray-600 hover:bg-gray-100 hover:text-gray-800"
          >
            {copied ? (
              <>
                <Check className="w-3.5 h-3.5 text-green-600" />
                已复制
              </>
            ) : (
              <>
                <Copy className="w-3.5 h-3.5" />
                复制代码
              </>
            )}
          </button>
          <button
            onClick={handleDownload}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors bg-blue-600 text-white hover:bg-blue-700 active:bg-blue-800"
          >
            <Download className="w-3.5 h-3.5" />
            下载 .py
          </button>
        </div>
      </div>
      <pre
        className="p-4 text-sm font-mono leading-relaxed overflow-x-auto max-h-96 overflow-y-auto bg-[#fafafa] rounded-b-lg"
        dangerouslySetInnerHTML={{ __html: highlightPython(code) }}
      />
    </div>
  )
}
