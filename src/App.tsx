import { lazy, Suspense } from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'
import { ScrollManager } from './components/ScrollManager'
import { AppLayout } from './components/app/AppLayout'
import { LandingPage } from './pages/LandingPage'

// Marketing landing stays eager: it is the product's front door and its
// chunk is already lean once the app routes are split out.
const WelcomePage = lazy(() => import('./pages/WelcomePage').then((m) => ({ default: m.WelcomePage })))
const DashboardPage = lazy(() => import('./pages/DashboardPage').then((m) => ({ default: m.DashboardPage })))
const ReportsPage = lazy(() => import('./pages/ReportsPage').then((m) => ({ default: m.ReportsPage })))
const HistoryPage = lazy(() => import('./pages/HistoryPage').then((m) => ({ default: m.HistoryPage })))
const UploadPage = lazy(() => import('./pages/UploadPage').then((m) => ({ default: m.UploadPage })))
const ReportViewerPage = lazy(() => import('./pages/ReportViewerPage').then((m) => ({ default: m.ReportViewerPage })))
const VerificationPage = lazy(() => import('./pages/VerificationPage').then((m) => ({ default: m.VerificationPage })))
const ResultsOverviewPage = lazy(() => import('./pages/ResultsOverviewPage').then((m) => ({ default: m.ResultsOverviewPage })))
const SettingsPage = lazy(() => import('./pages/SettingsPage').then((m) => ({ default: m.SettingsPage })))
const NotFoundPage = lazy(() => import('./pages/NotFoundPage').then((m) => ({ default: m.NotFoundPage })))

export function App() {
  return (
    <>
      <ScrollManager />
      <Suspense fallback={<div className="route-fallback" aria-hidden="true" />}>
        <Routes>
          <Route path="/" element={<LandingPage />} />
          <Route path="/app/start" element={<WelcomePage />} />
          <Route path="/app/upload" element={<UploadPage />} />

          {/* App shell with sidebar */}
          <Route path="/app" element={<AppLayout />}>
            <Route index element={<DashboardPage />} />
            <Route path="reports" element={<ReportsPage />} />
            <Route path="history" element={<HistoryPage />} />
            <Route path="reports/new" element={<Navigate to="/app/upload" replace />} />
            <Route path="reports/:reportId" element={<ReportViewerPage />} />
            <Route path="reports/:reportId/verify" element={<VerificationPage />} />
            <Route path="reports/:reportId/results" element={<ResultsOverviewPage />} />
            <Route path="settings" element={<SettingsPage />} />
          </Route>
          <Route path="*" element={<NotFoundPage />} />
        </Routes>
      </Suspense>
    </>
  )
}
