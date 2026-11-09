import { useEffect } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { ArrowRight, Award, Check, Clock3, Flag, Trophy, Wallet } from 'lucide-react'
import { outcomeCopy } from '../data/mockStudent'
import { useStudent } from '../context/StudentContext'
import { formatCurrency } from '../utils/formatters'
import { Button, InlineTag } from '../components/ui'

const icons = { cleared: Check, pending: Clock3, eliminated: Flag, completed: Trophy, insufficient: Wallet }

export default function OutcomePage() {
  const { result } = useParams()
  const { state } = useStudent()
  const navigate = useNavigate()
  const student = state.student
  const isReal = state.auth?.mode === 'real'
  const completedAfterFinalPass = result === 'cleared' && student.currentLevel === 6
  const officialCompletion = student.competitionStatus?.toLowerCase() === 'completed' || student.roundAvailability === 'completed'
  const outcome = completedAfterFinalPass || officialCompletion ? 'completed' : result
  const copy = outcomeCopy[outcome]

  useEffect(() => { if (isReal || !copy) navigate('/dashboard', { replace: true }) }, [isReal, copy, navigate])
  if (isReal || !copy) return null

  const Icon = icons[outcome]
  const configuration = state.competition
  const level = state.levelConfigurations.find(item => item.number === student.currentLevel)
  const entryFee = level?.entryFee ?? 0
  const score = outcome === 'completed'
    ? String(configuration.levels.length).padStart(2, '0')
    : outcome === 'cleared' ? '01' : String(student.levelsCleared).padStart(2, '0')
  const scoreLabel = outcome === 'completed' ? 'levels completed' : outcome === 'cleared' ? 'question passed' : 'levels cleared'

  return <div className="outcome-screen">
    <div className="outcome-topline"><InlineTag tone="lime">{copy.eyebrow}</InlineTag><span>{configuration.name}</span></div>
    <div className="outcome-layout">
      <section className={`outcome-copy outcome-${outcome}`}>
        <div className="outcome-icon"><Icon size={27} strokeWidth={1.8} /></div>
        <p className="eyebrow">{copy.eyebrow.toUpperCase()}</p>
        <h1>{copy.title}</h1>
        <p>{copy.body}</p>
        {outcome === 'insufficient' && <p className="preserved-balance">Current wallet balance · <strong>{formatCurrency(student.walletBalance, configuration.currency, configuration.locale)}</strong><span>Entry fee required: {formatCurrency(entryFee, configuration.currency, configuration.locale)}</span><span>You are not eliminated and no fee is charged.</span></p>}
        {outcome === 'cleared' && level && <p className="preserved-balance">Configured pass reward · <strong>{formatCurrency(level.passReward, configuration.currency, configuration.locale)}</strong><span>Reward and entry fee are separate values. Wallet accounting is controlled by the backend.</span></p>}
        <Button to="/dashboard" variant="lime">Back to dashboard <ArrowRight size={17} /></Button>
        <p className="outcome-demo-note">Static demo screen · No official result or balance is changed.</p>
      </section>
      <aside className="outcome-aside">
        <p className="eyebrow">Your competition snapshot</p>
        <div className="outcome-score">{score}</div>
        <div className="outcome-score-label">{scoreLabel}</div>
        <div className="aside-divider" />
        <div className="aside-stat"><span>Current wallet balance</span><strong>{formatCurrency(student.walletBalance, configuration.currency, configuration.locale)}</strong></div>
        <div className="aside-stat"><span>Cumulative rewards earned</span><strong>{formatCurrency(student.totalEarned, configuration.currency, configuration.locale)}</strong></div>
        <div className="aside-stat"><span>Total entry fees paid</span><strong>{formatCurrency(student.totalEntryFeesPaid, configuration.currency, configuration.locale)}</strong></div>
        <div className="aside-stat"><span>Competition status</span><strong>{outcome === 'completed' ? 'Completed' : outcome === 'eliminated' ? 'Eliminated' : student.competitionStatus}</strong></div>
        <div className="aside-signoff"><Award size={17} /><span>Official statuses and financial changes come from the backend.</span></div>
      </aside>
    </div>
    <div className="outcome-footer"><span><Clock3 size={14} /> Example state for interface review only.</span><button onClick={() => navigate('/dashboard')}>Return to dashboard</button></div>
  </div>
}
