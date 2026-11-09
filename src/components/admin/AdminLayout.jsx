import "./admin.css";
import { NavLink, Outlet } from "react-router-dom";
import {
  LayoutDashboard,
  BookOpen,
  Layers,
  Users,
  UserCog,
  ChartNoAxesCombined,
} from "lucide-react";

import { Brand } from "../UI";

const navItems = [
  { to: "/admin/dashboard", label: "Overview", icon: LayoutDashboard },
  { to: "/admin/questions", label: "Question Bank", icon: BookOpen },
  { to: "/admin/levels", label: "Levels", icon: Layers },
  { to: "/admin/participants", label: "Participants", icon: Users },
  { to: "/admin/volunteers", label: "Volunteers", icon: UserCog },
  { to: "/admin/reports", label: "Reports", icon: ChartNoAxesCombined },
];

export default function AdminLayout() {
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
          <span className="admin-role">ADMINISTRATOR</span>
        </header>

        <section className="admin-content">
          <Outlet />
        </section>
      </main>
    </div>
  );
}
