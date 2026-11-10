import { useCallback, useEffect, useState } from "react";
import { NavLink, Outlet, useNavigate } from "react-router-dom";
import {
  LayoutDashboard,
  ClipboardList,
  LogOut,
} from "lucide-react";
import { Brand } from "../ui";
import {
  clearVolunteerSession,
  getVolunteerSession,
  validateVolunteerSession,
} from "../../services/volunteerAuthService";
import "./volunteer-layout.css";

export default function VolunteerLayout() {
  const navigate = useNavigate();
  const [session, setSession] = useState(null);
  const [checking, setChecking] = useState(true);
  const [validationError, setValidationError] = useState("");

  const validateSession = useCallback(async () => {
    const storedSession = getVolunteerSession();
    if (!storedSession) {
      navigate("/volunteer/login", { replace: true });
      return;
    }

    setChecking(true);
    setValidationError("");
    try {
      await validateVolunteerSession(storedSession.token);
      setSession(storedSession);
    } catch (error) {
      if (error.code === "SESSION_EXPIRED") {
        clearVolunteerSession();
        navigate("/volunteer/login", { replace: true });
      } else {
        setValidationError(error.message || "Could not validate the volunteer session.");
      }
    } finally {
      setChecking(false);
    }
  }, [navigate]);

  useEffect(() => {
    validateSession();
  }, [validateSession]);

  const handleLogout = () => {
    clearVolunteerSession();
    navigate("/volunteer/login", { replace: true });
  };

  if (checking) return <div role="status" style={{ padding: 24 }}>Checking volunteer session…</div>;
  if (!session && validationError) {
    return (
      <div role="alert" style={{ padding: 24 }}>
        <p>{validationError}</p>
        <button type="button" onClick={validateSession}>Retry</button>{" "}
        <button type="button" onClick={handleLogout}>Return to sign in</button>
      </div>
    );
  }
  if (!session) return null;

  const volunteerName = session.volunteer.name || "Volunteer";

  return (
    <div className="vol-layout">
      <aside className="vol-sidebar">
        <div className="vol-brand">
          <Brand />
        </div>

        <p className="vol-nav-label">WORKSPACE</p>

        <nav className="vol-nav">
          <NavLink
            to="/volunteer/dashboard"
            className={({ isActive }) =>
              isActive ? "vol-nav-link vol-active" : "vol-nav-link"
            }
          >
            <LayoutDashboard size={18} />
            <span>Dashboard</span>
          </NavLink>

          <NavLink
            to="/volunteer/evaluations"
            className="vol-nav-link"
          >
            <ClipboardList size={18} />
            <span>Evaluations</span>
          </NavLink>
        </nav>

        <div className="vol-sidebar-bottom">
          <div className="vol-user">
            <div className="vol-avatar">{volunteerName.charAt(0).toUpperCase()}</div>
            <div>
              <strong>{volunteerName}</strong>
              <span>Volunteer</span>
            </div>
          </div>

          <button
            className="vol-logout"
            type="button"
            onClick={handleLogout}
          >
            <LogOut size={17} />
            Logout
          </button>
        </div>
      </aside>

      <main className="vol-main">
        <Outlet />
      </main>
    </div>
  );
}
