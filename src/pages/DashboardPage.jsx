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
  const configuration = state.competition
  const level = state.levelConfigurations.find(item => item.number === student.currentLevel)
  const eligible = Boolean(level && student.roundAvailability === 'ready' && student.walletBalance >= level.entryStake)
  const label = student.roundAvailability === 'ready'
    ? eligible ? 'Round ready' : 'Insufficient balance'
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
    <section className="round-banner"><div className="round-copy"><span className="round-mark"><Zap size={18} /></span><div><p className="eyebrow">{configuration.name}</p><h2>{level?.name || `Level ${student.currentLevel}`} · {label}</h2><p>{level ? level.entryStake === 0 ? 'No entry stake for this level.' : `${formatCurrency(level.entryStake, configuration.currency, configuration.locale)} entry stake · ${formatCurrency(level.reward, configuration.currency, configuration.locale)} for clearing both questions.` : 'Competition configuration unavailable.'}</p></div></div><div className="round-banner-action"><InlineTag tone={eligible ? 'lime' : 'default'}>{label}</InlineTag>{eligible ? <Button onClick={enterRound} disabled={entering} variant="lime">{entering ? 'Opening round…' : 'Enter round'} <NextArrow /></Button> : student.roundAvailability === 'inProgress' ? <Button to="/round" variant="lime">Continue round <NextArrow /></Button> : student.roundAvailability === 'ready' && level && student.walletBalance < level.entryStake ? <Button to="/result/insufficient" variant="outline">Why can’t I enter?</Button> : student.roundAvailability === 'evaluationPending' ? <Button to="/result/pending" variant="lime">View evaluation status <NextArrow /></Button> : student.roundAvailability === 'eliminated' ? <Button to="/result/eliminated" variant="outline">View result <NextArrow /></Button> : student.roundAvailability === 'completed' ? <Button to="/result/completed" variant="lime">View completion <NextArrow /></Button> : student.roundAvailability === 'cleared' ? <Button to="/result/cleared" variant="lime">View result <NextArrow /></Button> : <span className="round-unavailable">Round not available</span>}</div><div className="banner-index" aria-hidden="true">{String(student.currentLevel).padStart(2, '0')}</div></section>
    {enterError && <p className="error-state" role="alert">{enterError}</p>}
    <SectionHeading kicker="Competition overview" title="Your progress, at a glance." detail="A running snapshot of your competition journey." action={<span className="status-pill"><span />{student.competitionStatus}</span>} />
    <section className="metric-grid" aria-label="Competition statistics"><MetricCard label="Current level" value={<>{String(student.currentLevel).padStart(2, '0')}<span className="metric-suffix"> / {String(configuration.levels.length).padStart(2, '0')}</span></>} caption={level?.name || 'Current challenge'} accent /><MetricCard label="Highest level reached" value={String(student.highestLevel).padStart(2, '0')} caption="Your personal best" /><MetricCard label="Wallet balance" value={<>{formatCurrency(student.walletBalance, configuration.currency, configuration.locale)}</>} caption="Available to stake" /><MetricCard label="Levels cleared" value={String(student.levelsCleared).padStart(2, '0')} caption="Rounds completed" /></section>
    <section className="finance-strip" aria-label="Wallet activity"><div><span className="finance-icon"><Wallet size={17} /></span><div><span>Total rewards earned</span><strong>{formatCurrency(student.totalEarned, configuration.currency, configuration.locale)}</strong></div></div><span className="finance-divider" /><div><span className="finance-icon"><ArrowUpRight size={17} /></span><div><span>Total amount risked</span><strong>{formatCurrency(student.totalRisked, configuration.currency, configuration.locale)}</strong></div></div><div className="finance-note">Demo wallet values · Official balances come from the competition backend.</div></section>
    <section className="journey-row"><div><p className="eyebrow">The path ahead</p><h2>{configuration.levels.length} levels. One good run.</h2><p>Every level is a fresh chance to think clearly and solve well.</p></div><div className="level-track" aria-label={`${student.levelsCleared} of ${configuration.levels.length} levels cleared`}>{configuration.levels.map(item => <span key={item.number} className={`level-node${item.number <= student.levelsCleared ? ' level-complete' : ''}${item.number === student.currentLevel ? ' level-current' : ''}`} title={item.name}><span>{item.number <= student.levelsCleared ? '✓' : String(item.number).padStart(2, '0')}</span></span>)}</div></section>
    <section className="dashboard-links"><Link to="/records"><BookOpenText size={17}/><span><strong>Competition records</strong><small>Two competition-wide milestones</small></span><NextArrow/></Link><Link to="/profile"><CircleDot size={17}/><span><strong>My student profile</strong><small>Review your registered details</small></span><NextArrow/></Link></section>
    <section className="preview-routes"><p className="eyebrow">DEMO SCREEN PREVIEWS</p><p>These links show static example states. They do not change your results or wallet.</p><div><Link to="/result/cleared"><CircleCheck size={14}/> Cleared</Link><Link to="/result/pending">Pending</Link><Link to="/result/eliminated">Eliminated</Link><Link to="/result/completed">Completed</Link><Link to="/result/insufficient">Insufficient balance</Link></div></section>
  </div>
}
