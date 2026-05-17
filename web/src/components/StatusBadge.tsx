type BadgeStatus =
  | 'PASS' | 'FAIL' | 'BLOCK' | 'not_run'
  | 'raw' | 'translated' | 'decomposed' | 'executed'

interface StatusBadgeProps {
  status: BadgeStatus
  size?: 'sm' | 'md'
}

const colorMap: Record<BadgeStatus, string> = {
  PASS: 'bg-green-100 text-green-700 border-green-200',
  FAIL: 'bg-red-100 text-red-700 border-red-200',
  BLOCK: 'bg-orange-100 text-orange-700 border-orange-200',
  not_run: 'bg-gray-100 text-gray-500 border-gray-200',
  raw: 'bg-gray-100 text-gray-600 border-gray-200',
  translated: 'bg-blue-100 text-blue-700 border-blue-200',
  decomposed: 'bg-purple-100 text-purple-700 border-purple-200',
  executed: 'bg-teal-100 text-teal-700 border-teal-200',
}

const labelMap: Record<BadgeStatus, string> = {
  PASS: '通过',
  FAIL: '失败',
  BLOCK: '阻塞',
  not_run: '未执行',
  raw: '原始',
  translated: '已翻译',
  decomposed: '已分解',
  executed: '已执行',
}

export default function StatusBadge({ status, size = 'md' }: StatusBadgeProps) {
  const sizeClass = size === 'sm' ? 'px-1.5 py-0.5 text-xs' : 'px-2 py-0.5 text-sm'

  return (
    <span
      className={`inline-flex items-center rounded-full border font-medium ${sizeClass} ${colorMap[status] ?? 'bg-gray-100 text-gray-600 border-gray-200'}`}
    >
      {labelMap[status] ?? status}
    </span>
  )
}
