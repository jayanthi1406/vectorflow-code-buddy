import { NavLink, Outlet } from "react-router-dom";
import {
  LayoutDashboard,
  ClipboardList,
  LogOut,
} from "lucide-react";
import { Brand } from "../ui";
import "./volunteer-layout.css";

export default function VolunteerLayout() {
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
            <div className="vol-avatar">M</div>
            <div>
              <strong>Meera Sharma</strong>
              <span>Volunteer</span>
            </div>
          </div>

          <button
            className="vol-logout"
            onClick={() => alert("Logout will be connected later.")}
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