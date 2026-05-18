import { BrowserRouter, Routes, Route } from 'react-router-dom'
import Layout from './components/Layout'
import ImportPage from './pages/ImportPage'
import CasesPage from './pages/CasesPage'
import ExecutionPage from './pages/ExecutionPage'
import ReportPage from './pages/ExecutionHistoryPage'

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<Layout />}>
          <Route index element={<ImportPage />} />
          <Route path="cases" element={<CasesPage />} />
          <Route path="execute" element={<ExecutionPage />} />
          <Route path="history" element={<ReportPage />} />
          <Route path="history/:runId" element={<ReportPage />} />
        </Route>
      </Routes>
    </BrowserRouter>
  )
}
