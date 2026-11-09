import { Navigate, Route, Routes } from "react-router-dom";
import { StudentProvider, useStudent } from "./context/StudentContext";
import StudentLayout from "./components/StudentLayout";
import { LoadingState } from "./components/ui";
import DashboardPage from "./pages/DashboardPage";
import RoundPage from "./pages/RoundPage";
import OutcomePage from "./pages/OutcomePage";
import AuthPage from "./pages/AuthPage";
import RecordsPage from "./pages/RecordsPage";
import ProfilePage from "./pages/ProfilePage";
import AdminLayout from "./components/admin/AdminLayout";
import AdminDashboard from "./pages/admin/AdminDashboard";
import QuestionManagement from "./pages/admin/QuestionManagement";
import ParticipantManagement from "./pages/admin/ParticipantManagement";
import VolunteerManagement from "./pages/admin/VolunteerManagement";
import VolunteerLayout from "./components/volunteer/VolunteerLayout";
import VolunteerDashboard from "./pages/volunteer/VolunteerDashboard";
import VolunteerLogin from "./pages/volunteer/VolunteerLogin";
import Reports from "./pages/admin/Reports";
import LevelManagement from "./pages/admin/LevelManagement";
import AdminLogin from "./pages/admin/AdminLogin";
import EvaluationWorkspace from "./pages/volunteer/EvaluationWorkspace";

function AppRoutes() {
  const { state, loading } = useStudent();
  if (loading || !state) return <LoadingState />;
  const signedIn = state.auth?.signedIn === true;
  return (
    <Routes>
      <Route
        path="/login"
        element={
          signedIn ? (
            <Navigate to="/dashboard" replace />
          ) : (
            <AuthPage mode="login" />
          )
        }
      />
      <Route
        path="/register"
        element={
          signedIn ? (
            <Navigate to="/dashboard" replace />
          ) : state.pendingIdentity ? (
            <AuthPage mode="register" />
          ) : (
            <Navigate to="/login" replace />
          )
        }
      />
      <Route
        path="/"
        element={<Navigate to={signedIn ? "/dashboard" : "/login"} replace />}
      />
      <Route
        element={
          signedIn ? <StudentLayout /> : <Navigate to="/login" replace />
        }
      >
        <Route path="/dashboard" element={<DashboardPage />} />
        <Route path="/records" element={<RecordsPage />} />
        <Route path="/profile" element={<ProfilePage />} />
        <Route path="/round" element={<RoundPage />} />
        <Route path="/result/:result" element={<OutcomePage />} />
        <Route path="*" element={<Navigate to="/dashboard" replace />} />
      </Route>
      <Route path="/admin/login" element={<AdminLogin />} />
      <Route path="/admin" element={<AdminLayout />}>
        <Route index element={<Navigate to="dashboard" replace />} />
        <Route path="dashboard" element={<AdminDashboard />} />
        <Route path="questions" element={<QuestionManagement />} />
        <Route path="levels" element={<LevelManagement />} />
        <Route path="participants" element={<ParticipantManagement />} />
        <Route path="volunteers" element={<VolunteerManagement />} />
        <Route path="reports" element={<Reports />} />
     
      </Route>
      <Route path="/volunteer/login" element={<VolunteerLogin />} />
      <Route path="/volunteer" element={<VolunteerLayout />}>
        <Route index element={<Navigate to="dashboard" replace />} />
        <Route path="dashboard" element={<VolunteerDashboard />} />
        <Route path="evaluations" element={<EvaluationWorkspace />} />
      </Route>
    </Routes>
  );
}
export default function App() {
  return (
    <StudentProvider>
      <AppRoutes />
    </StudentProvider>
  );
}



