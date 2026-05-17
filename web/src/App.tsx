import { BrowserRouter, Routes, Route } from 'react-router-dom'
import Layout from './components/Layout'
import ImportPage from './pages/ImportPage'
import CasesPage from './pages/CasesPage'
import KnowledgePage from './pages/KnowledgePage'
import ExecutionPage from './pages/ExecutionPage'
import ReportPage from './pages/ReportPage'

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<Layout />}>
          <Route index element={<ImportPage />} />
          <Route path="cases" element={<CasesPage />} />
          <Route path="knowledge" element={<KnowledgePage />} />
          <Route path="execute" element={<ExecutionPage />} />
          <Route path="report" element={<ReportPage />} />
          <Route path="report/:runId" element={<ReportPage />} />
        </Route>
      </Routes>
    </BrowserRouter>
  )
}
