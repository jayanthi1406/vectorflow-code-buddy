import { NavLink, Outlet, useNavigate } from 'react-router-dom'
import { BookOpenText, LayoutDashboard, LogOut, Menu, UserRound, X } from 'lucide-react'
import { useState } from 'react'
import { authService } from '../services/authService'
import { studentAuthenticationService } from '../services/studentAuthenticationService'
import { useStudent } from '../context/StudentContext'
import { Brand, DemoBanner } from './ui'

const links = [
  { to: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { to: '/records', label: 'Competition records', icon: BookOpenText },
  { to: '/profile', label: 'My profile', icon: UserRound },
]
export default function StudentLayout() {
  const { state, refresh } = useStudent()
  const [open, setOpen] = useState(false)
  const navigate = useNavigate()
  const signOut = async () => {
    if (state.auth?.mode === 'real') {
      await studentAuthenticationService.signOut()
      await authService.signOutDemo()
    } else await authService.signOutDemo()
    await refresh(); navigate('/login')
  }
  const initials = state.student?.name?.split(' ').map(name => name[0]).join('').slice(0, 2) || 'S'
  return <div className="app-shell"><header className="topbar"><Brand /><button className="mobile-menu" onClick={() => setOpen(!open)} aria-label={open ? 'Close navigation' : 'Open navigation'} aria-expanded={open}>{open ? <X size={20} /> : <Menu size={20} />}</button><nav className={`main-nav${open ? ' nav-open' : ''}`} aria-label="Student navigation">{links.map(({to,label,icon:Icon}) => <NavLink key={to} onClick={() => setOpen(false)} to={to} className={({isActive}) => isActive ? 'nav-link nav-active' : 'nav-link'}><Icon size={16} />{label}</NavLink>)}</nav><div className="topbar-right"><span className="student-initial">{initials}</span><span className="topbar-name">{state.student?.name || 'Student'}</span><button className="icon-button" onClick={signOut} aria-label="Sign out" title="Sign out"><LogOut size={15} /></button></div></header><main className="main-content">{state.auth?.mode === 'demo' && <DemoBanner />}{state.auth?.mode === 'real' && <div className="demo-banner real-session-banner"><span><strong>Verified session</strong> · Student profile loaded from the backend.</span></div>}<Outlet /></main><footer className="site-footer"><span>Built for the next generation of problem solvers.</span><span>Code Buddy <span className="brand-dot">·</span> VVCE</span></footer></div>
}
