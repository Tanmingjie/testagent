import { useState } from 'react'
import { Copy, Check } from 'lucide-react'

interface FixPromptPanelProps {
  prompt: string
}

export default function FixPromptPanel({ prompt }: FixPromptPanelProps) {
  const [copied, setCopied] = useState(false)

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(prompt)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // Clipboard API may fail in insecure contexts
    }
  }

  if (!prompt) {
    return (
      <div className="rounded-lg border border-gray-200 p-6">
        <h3 className="text-sm font-medium text-gray-500 mb-1">修复提示</h3>
        <p className="text-sm text-gray-400">暂无修复提示</p>
      </div>
    )
  }

  return (
    <div className="rounded-lg border border-gray-200 overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 bg-gray-50">
        <h3 className="text-sm font-medium text-gray-800">修复提示</h3>
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
              复制提示
            </>
          )}
        </button>
      </div>
      <pre className="p-4 text-sm text-gray-700 whitespace-pre-wrap font-mono leading-relaxed max-h-64 overflow-y-auto">
        {prompt}
      </pre>
    </div>
  )
}
