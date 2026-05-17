import { useState, useEffect } from 'react'
import { api } from '../lib/api'

export interface RunStatusStep {
  stepOrder: number
  status: string
  screenshotUrl?: string
  error?: string
  pythonCode?: string
}

export interface RunStatusSummary {
  total: number
  pass: number
  fail: number
  blocked: number
}

export interface RunStatusResponse {
  runId: string
  status: string
  summary: RunStatusSummary
  steps: RunStatusStep[]
  generatedPythonCode: string
  fixPrompt: string
}

export function useExecutionProgress(runId: string | null) {
  const [data, setData] = useState<RunStatusResponse | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!runId) {
      setData(null)
      setError(null)
      setLoading(false)
      return
    }

    let cancelled = false
    setLoading(true)

    const poll = async () => {
      if (cancelled) return
      try {
        const result = await api.get<RunStatusResponse>(`/execution/runs/${runId}`)
        if (cancelled) return
        setData(result)
        setError(null)

        const terminal = ['passed', 'failed', 'error']
        if (terminal.includes(result.status)) {
          setLoading(false)
          return
        }

        setTimeout(poll, 3000)
      } catch (err) {
        if (cancelled) return
        setError(err instanceof Error ? err.message : 'Failed to fetch execution progress')
        setTimeout(poll, 3000)
      }
    }

    poll()

    return () => {
      cancelled = true
    }
  }, [runId])

  return {
    status: data?.status ?? null,
    summary: data?.summary ?? null,
    steps: data?.steps ?? [],
    generatedPythonCode: data?.generatedPythonCode ?? '',
    fixPrompt: data?.fixPrompt ?? '',
    loading,
    error,
  }
}
