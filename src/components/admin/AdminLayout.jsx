import "./admin.css";
import { useCallback, useEffect, useState } from "react";
import { NavLink, Outlet, useNavigate } from "react-router-dom";
import {
  LayoutDashboard,
  BookOpen,
  Layers,
  Users,
  UserCog,
  ChartNoAxesCombined,
  LogOut,
} from "lucide-react";

import { Brand } from "../ui";
import {
  clearAdminSession,
  getAdminSession,
  validateAdminSession,
} from "../../services/adminAuthService";

const navItems = [
  { to: "/admin/dashboard", label: "Overview", icon: LayoutDashboard },
  { to: "/admin/questions", label: "Question Bank", icon: BookOpen },
  { to: "/admin/levels", label: "Levels", icon: Layers },
  { to: "/admin/participants", label: "Participants", icon: Users },
  { to: "/admin/volunteers", label: "Volunteers", icon: UserCog },
  { to: "/admin/reports", label: "Reports", icon: ChartNoAxesCombined },
];

export default function AdminLayout() {
  const navigate = useNavigate();
  const [session, setSession] = useState(null);
  const [checking, setChecking] = useState(true);
  const [validationError, setValidationError] = useState("");

  const validateSession = useCallback(async () => {
    const storedSession = getAdminSession();
    if (!storedSession) {
      navigate("/admin/login", { replace: true });
      return;
    }

    setChecking(true);
    setValidationError("");
    try {
      await validateAdminSession(storedSession.token);
      setSession(storedSession);
    } catch (error) {
      if (error.code === "SESSION_EXPIRED") {
        clearAdminSession();
        navigate("/admin/login", { replace: true });
      } else {
        setValidationError(error.message || "Could not validate the admin session.");
      }
    } finally {
      setChecking(false);
    }
  }, [navigate]);

  useEffect(() => {
    validateSession();
  }, [validateSession]);

  const handleLogout = () => {
    clearAdminSession();
    navigate("/admin/login", { replace: true });
  };

  if (checking) return <div role="status" style={{ padding: 24 }}>Checking admin session…</div>;
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

  return (
    <div className="admin-shell">
      <aside className="admin-sidebar">
        <div className="admin-brand">
          <Brand />
          <span>ADMIN PANEL</span>
        </div>

        <nav className="admin-navigation">
          <p className="admin-nav-heading">MANAGEMENT</p>

          {navItems.map(({ to, label, icon: Icon }) => (
            <NavLink
              key={to}
              to={to}
              className={({ isActive }) =>
                `admin-nav-link ${isActive ? "active" : ""}`
              }
            >
              <Icon size={18} />
              <span>{label}</span>
            </NavLink>
          ))}
        </nav>

        <div className="admin-sidebar-footer">
          <span>CODE BUDDY</span>
          <small>Competition Management</small>
        </div>
      </aside>

      <main className="admin-main">
        <header className="admin-topbar">
          <span>VVCE CODE SPRINT</span>
          <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
            <span className="admin-role">{session.admin.name || "ADMINISTRATOR"}</span>
            <button className="admin-logout-button" type="button" onClick={handleLogout} aria-label="Log out" title="Log out">
              <LogOut size={16} />
            </button>
          </div>
        </header>

        <section className="admin-content">
          <Outlet />
        </section>
      </main>
    </div>
  );
}
