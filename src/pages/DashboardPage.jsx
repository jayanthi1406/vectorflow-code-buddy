import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { ArrowUpRight, BookOpenText, CircleCheck, CircleDot, Wallet, Zap } from 'lucide-react'
import { useStudent } from '../context/StudentContext'
import { roundService } from '../services/roundService'
import { formatCurrency } from '../utils/formatters'
import { Button, InlineTag, MetricCard, NextArrow, SectionHeading } from '../components/ui'

export default function DashboardPage() {
  const { state, refresh } = useStudent()
  const navigate = useNavigate()
  const [entering, setEntering] = useState(false)
  const [enterError, setEnterError] = useState('')
  const student = state.student
  if (state.auth?.mode === 'real') {
    return <div className="page dashboard-page">
      <div className="dashboard-heading"><div><p className="eyebrow">Verified student portal · {student.year}</p><h1>Good to see you,<br /><span>{student.name.split(' ')[0]}.</span></h1><p className="hero-subtitle">Your authenticated competition profile.</p></div><div className="dashboard-id"><span className="id-label">STUDENT IDENTIFICATION</span><strong>{student.usn}</strong><span>{student.email}</span><span>{student.year}</span></div></div>
      <section className="round-banner"><div className="round-copy"><span className="round-mark"><Zap size={18} /></span><div><p className="eyebrow">Competition status</p><h2>{student.competitionStatus || 'Status unavailable'}</h2><p>Current level · {student.currentLevel ? `L${student.currentLevel}` : 'Unavailable'}</p></div></div><div className="round-banner-action"><InlineTag>{student.roundAvailability || 'Availability unavailable'}</InlineTag><span className="round-unavailable">Round controls are not connected in this phase.</span></div></section>
      <SectionHeading kicker="Verified account" title="Your profile, at a glance." detail="Competition and wallet values shown here come from the authenticated backend profile." />
      <section className="metric-grid" aria-label="Authenticated competition statistics"><MetricCard label="Current level" value={student.currentLevel ? `L${student.currentLevel}` : '—'} caption="From your backend profile" accent /><MetricCard label="Highest level reached" value={student.highestLevel ? `L${student.highestLevel}` : '—'} caption="From your backend profile" /><MetricCard label="Wallet balance" value={typeof student.walletBalance === 'number' ? formatCurrency(student.walletBalance, 'INR', 'en-IN') : '—'} caption="Backend reported" /><MetricCard label="Levels cleared" value={typeof student.levelsCleared === 'number' ? String(student.levelsCleared).padStart(2, '0') : '—'} caption="Backend reported" /></section>
      <section className="finance-strip" aria-label="Backend wallet summary"><div><span className="finance-icon"><Wallet size={17} /></span><div><span>Cumulative rewards earned</span><strong>{typeof student.totalEarned === 'number' ? formatCurrency(student.totalEarned, 'INR', 'en-IN') : '—'}</strong></div></div>{typeof student.totalRisked === 'number' && <><span className="finance-divider" /><div><span>Total risked · backend field</span><strong>{formatCurrency(student.totalRisked, 'INR', 'en-IN')}</strong></div></>}</section>
      <section className="round-rules"><div><strong>Competition actions are not integrated yet</strong><p>This session is authenticated with the backend. Round entry, assigned questions, evaluation, official timing, and competition records will appear when their student APIs are available. No demo data is shown in this session.</p></div></section>
      <section className="dashboard-links"><Link to="/profile"><CircleDot size={17}/><span><strong>My student profile</strong><small>Review verified registration details</small></span><NextArrow/></Link></section>
    </div>
  }
  const configuration = state.competition
  const level = state.levelConfigurations.find(item => item.number === student.currentLevel)
  const eligible = Boolean(level && level.entryFee != null && student.roundAvailability === 'ready' && student.walletBalance >= level.entryFee)
  const label = student.roundAvailability === 'ready'
    ? !level || level.entryFee == null ? 'Entry fee unavailable' : eligible ? 'Round ready' : 'Insufficient balance'
    : student.roundAvailability === 'inProgress' ? 'Round in progress'
      : student.roundAvailability === 'evaluationPending' ? 'Evaluation pending'
        : student.roundAvailability === 'cleared' ? 'Round cleared'
          : student.roundAvailability === 'eliminated' ? 'Eliminated'
            : student.roundAvailability === 'completed' ? 'Competition completed' : 'Round unavailable'

  const enterRound = async () => {
    setEntering(true); setEnterError('')
    try { await roundService.enterRound(); await refresh(); navigate('/round') }
    catch (error) { setEnterError(error.message) }
    finally { setEntering(false) }
  }

  return <div className="page dashboard-page">
    <div className="dashboard-heading"><div><p className="eyebrow">Your student portal · {student.year}</p><h1>Good to see you,<br /><span>{student.name.split(' ')[0]}.</span></h1><p className="hero-subtitle">Your next challenge is only one good idea away.</p></div><div className="dashboard-id"><span className="id-label">STUDENT IDENTIFICATION</span><strong>{student.usn}</strong><span>{student.email}</span><span>{student.year}</span></div></div>
    <section className="round-banner"><div className="round-copy"><span className="round-mark"><Zap size={18} /></span><div><p className="eyebrow">{configuration.name}</p><h2>{level?.name || `Level ${student.currentLevel}`} · {label}</h2><p>{!level ? 'Competition configuration unavailable.' : level.entryFee == null || level.passReward == null ? 'Entry fee or pass reward configuration is unavailable.' : level.entryFee === 0 ? `No entry fee · ${formatCurrency(level.passReward, configuration.currency, configuration.locale)} pass reward.` : `${formatCurrency(level.entryFee, configuration.currency, configuration.locale)} entry fee · ${formatCurrency(level.passReward, configuration.currency, configuration.locale)} pass reward.`}</p></div></div><div className="round-banner-action"><InlineTag tone={eligible ? 'lime' : 'default'}>{label}</InlineTag>{eligible ? <Button onClick={enterRound} disabled={entering} variant="lime">{entering ? 'Opening round…' : 'Enter round'} <NextArrow /></Button> : student.roundAvailability === 'inProgress' ? <Button to="/round" variant="lime">Continue round <NextArrow /></Button> : student.roundAvailability === 'ready' && level && level.entryFee != null && student.walletBalance < level.entryFee ? <Button to="/result/insufficient" variant="outline">Why can’t I enter?</Button> : student.roundAvailability === 'evaluationPending' ? <Button to="/result/pending" variant="lime">View evaluation status <NextArrow /></Button> : student.roundAvailability === 'eliminated' ? <Button to="/result/eliminated" variant="outline">View result <NextArrow /></Button> : student.roundAvailability === 'completed' ? <Button to="/result/completed" variant="lime">View completion <NextArrow /></Button> : student.roundAvailability === 'cleared' ? <Button to="/result/cleared" variant="lime">View result <NextArrow /></Button> : <span className="round-unavailable">{student.roundAvailability === 'ready' ? 'Entry fee not configured' : 'Round not available'}</span>}</div><div className="banner-index" aria-hidden="true">{String(student.currentLevel).padStart(2, '0')}</div></section>
    {enterError && <p className="error-state" role="alert">{enterError}</p>}
    <SectionHeading kicker="Competition overview" title="Your progress, at a glance." detail="A running snapshot of your competition journey." action={<span className="status-pill"><span />{student.competitionStatus}</span>} />
    <section className="metric-grid" aria-label="Competition statistics"><MetricCard label="Current level" value={<>{String(student.currentLevel).padStart(2, '0')}<span className="metric-suffix"> / {String(configuration.levels.length).padStart(2, '0')}</span></>} caption={level?.name || 'Current challenge'} accent /><MetricCard label="Highest level reached" value={String(student.highestLevel).padStart(2, '0')} caption="Your personal best" /><MetricCard label="Wallet balance" value={<>{formatCurrency(student.walletBalance, configuration.currency, configuration.locale)}</>} caption="Available to stake" /><MetricCard label="Levels cleared" value={String(student.levelsCleared).padStart(2, '0')} caption="Rounds completed" /></section>
    <section className="finance-strip" aria-label="Wallet summary"><div><span className="finance-icon"><Wallet size={17} /></span><div><span>Cumulative rewards earned</span><strong>{formatCurrency(student.totalEarned, configuration.currency, configuration.locale)}</strong></div></div><span className="finance-divider" /><div><span className="finance-icon"><ArrowUpRight size={17} /></span><div><span>Total entry fees paid</span><strong>{formatCurrency(student.totalEntryFeesPaid, configuration.currency, configuration.locale)}</strong></div></div><div className="finance-note">Pass reward is shown separately; wallet accounting is backend-controlled.</div></section>
    <section className="journey-row"><div><p className="eyebrow">The path ahead</p><h2>{configuration.levels.length} levels. One good run.</h2><p>Every level is a fresh chance to think clearly and solve well.</p></div><div className="level-track" aria-label={`${student.levelsCleared} of ${configuration.levels.length} levels cleared`}>{configuration.levels.map(item => {
      const complete = item.number <= student.levelsCleared
      const current = item.number === student.currentLevel
      const upcoming = !complete && !current && item.number === student.currentLevel + 1
      const locked = !complete && !current && !upcoming
      const levelState = complete ? 'cleared' : current ? 'current' : upcoming ? 'upcoming' : 'locked'
      return <span key={item.number} className={`level-node${complete ? ' level-complete' : ''}${current ? ' level-current' : ''}${upcoming ? ' level-upcoming' : ''}${locked ? ' level-locked' : ''}`} title={`${item.name} · ${levelState}`} aria-label={`${item.name}, ${levelState}`}><span>{complete ? '✓' : String(item.number).padStart(2, '0')}</span></span>
    })}</div></section>
    <section className="dashboard-links"><Link to="/records"><BookOpenText size={17}/><span><strong>Competition records</strong><small>Two competition-wide milestones</small></span><NextArrow/></Link><Link to="/profile"><CircleDot size={17}/><span><strong>My student profile</strong><small>Review your registered details</small></span><NextArrow/></Link></section>
    {state.auth?.mode === 'demo' && <section className="preview-routes" aria-label="Demo-only screen previews"><p className="eyebrow">DEMO SCREEN PREVIEWS · LOCAL ONLY</p><p>These links show static example states. They do not change your results or wallet.</p><div><Link to="/result/cleared"><CircleCheck size={14}/> Cleared</Link><Link to="/result/pending">Pending</Link><Link to="/result/eliminated">Eliminated</Link><Link to="/result/completed">Completed</Link><Link to="/result/insufficient">Insufficient balance</Link></div></section>}
  </div>
}
