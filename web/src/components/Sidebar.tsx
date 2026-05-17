import { NavLink } from 'react-router-dom'
import {
  Download,
  FileText,
  BookOpen,
  PlayCircle,
  BarChart3,
} from 'lucide-react'

const navItems = [
  { to: '/', label: '导入用例', icon: Download },
  { to: '/cases', label: '用例管理', icon: FileText },
  { to: '/knowledge', label: '知识库', icon: BookOpen },
  { to: '/execute', label: '执行测试', icon: PlayCircle },
  { to: '/report', label: '测试报告', icon: BarChart3 },
]

export default function Sidebar() {
  return (
    <aside className="w-64 h-screen bg-gray-50 border-r border-gray-200 flex flex-col shrink-0">
      <div className="h-14 flex items-center px-4 border-b border-gray-200">
        <h1 className="text-lg font-semibold text-gray-800">TestAgent</h1>
      </div>
      <nav className="flex-1 p-2 space-y-1">
        {navItems.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.to === '/'}
            className={({ isActive }) =>
              `flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors ${
                isActive
                  ? 'bg-blue-50 text-blue-700 font-medium'
                  : 'text-gray-600 hover:bg-gray-100 hover:text-gray-800'
              }`
            }
          >
            <item.icon className="w-4 h-4" />
            <span>{item.label}</span>
          </NavLink>
        ))}
      </nav>
    </aside>
  )
}
