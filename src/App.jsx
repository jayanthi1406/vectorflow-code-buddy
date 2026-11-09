import { Navigate, Route, Routes } from 'react-router-dom'
import { StudentProvider, useStudent } from './context/StudentContext'
import StudentLayout from './components/StudentLayout'
import { ErrorState, LoadingState } from './components/ui'
import DashboardPage from './pages/DashboardPage'
import RoundPage from './pages/RoundPage'
import OutcomePage from './pages/OutcomePage'
import AuthPage from './pages/AuthPage'
import RecordsPage from './pages/RecordsPage'
import ProfilePage from './pages/ProfilePage'

function AppRoutes() {
  const { state, loading, loadError, refresh } = useStudent()
  if (loading) return <LoadingState />
  if (!state && loadError) return <main className="page"><ErrorState message={loadError.message || 'Your student session could not be loaded.'} /><button className="button button-dark" onClick={() => refresh().catch(() => {})}>Retry</button></main>
  if (!state) return <LoadingState />
  const signedIn = state.auth?.signedIn === true
  return <Routes>
    <Route path="/login" element={signedIn ? <Navigate to="/dashboard" replace /> : <AuthPage mode="login" />} />
    <Route path="/register" element={signedIn ? <Navigate to="/dashboard" replace /> : state.pendingIdentity ? <AuthPage mode="register" /> : <Navigate to="/login" replace />} />
    <Route path="/" element={<Navigate to={signedIn ? '/dashboard' : '/login'} replace />} />
    <Route element={signedIn ? <StudentLayout /> : <Navigate to="/login" replace />}>
      <Route path="/dashboard" element={<DashboardPage />} />
      <Route path="/records" element={<RecordsPage />} />
      <Route path="/profile" element={<ProfilePage />} />
      <Route path="/round" element={<RoundPage />} />
      <Route path="/result/:result" element={<OutcomePage />} />
      <Route path="*" element={<Navigate to="/dashboard" replace />} />
    </Route>
  </Routes>
}
export default function App() { return <StudentProvider><AppRoutes /></StudentProvider> }
