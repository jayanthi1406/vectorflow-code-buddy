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
  const copy = outcomeCopy[result]
  useEffect(() => { if (!copy) navigate('/dashboard', { replace: true }) }, [copy, navigate])
  if (!copy) return null

  const Icon = icons[result]
  const student = state.student
  const configuration = state.competition
  const level = state.levelConfigurations.find(item => item.number === student.currentLevel)
  const entryStake = level?.entryStake ?? 0
  const exampleBalance = result === 'insufficient' ? Math.min(student.walletBalance, Math.max(0, entryStake - 1)) : student.walletBalance
  const score = result === 'completed' ? String(configuration.levels.length).padStart(2, '0') : result === 'cleared' ? String(configuration.questionsPerRound).padStart(2, '0') : String(student.levelsCleared).padStart(2, '0')
  const scoreLabel = result === 'completed' ? 'levels completed' : result === 'cleared' ? 'questions passed' : 'levels cleared'

  return <div className="outcome-screen"><div className="outcome-topline"><InlineTag tone="lime">{copy.eyebrow}</InlineTag><span>{configuration.name}</span></div><div className="outcome-layout"><section className={`outcome-copy outcome-${result}`}><div className="outcome-icon"><Icon size={27} strokeWidth={1.8} /></div><p className="eyebrow">{copy.eyebrow.toUpperCase()}</p><h1>{copy.title}</h1><p>{copy.body}</p>{result === 'insufficient' && <p className="preserved-balance">Example available balance · <strong>{formatCurrency(exampleBalance, configuration.currency, configuration.locale)}</strong><span>Required stake: {formatCurrency(entryStake, configuration.currency, configuration.locale)}</span></p>}{result === 'cleared' && level && <p className="preserved-balance">Configured level reward · <strong>{formatCurrency(level.reward, configuration.currency, configuration.locale)}</strong></p>}<Button to="/dashboard" variant="lime">Back to dashboard <ArrowRight size={17} /></Button><p className="outcome-demo-note">Static demo screen · No official result or balance is changed.</p></section><aside className="outcome-aside"><p className="eyebrow">Your competition snapshot</p><div className="outcome-score">{score}</div><div className="outcome-score-label">{scoreLabel}</div><div className="aside-divider" /><div className="aside-stat"><span>{result === 'insufficient' ? 'Example balance' : 'Current wallet balance'}</span><strong>{formatCurrency(result === 'insufficient' ? exampleBalance : student.walletBalance, configuration.currency, configuration.locale)}</strong></div><div className="aside-stat"><span>Cumulative rewards</span><strong>{formatCurrency(student.totalEarned, configuration.currency, configuration.locale)}</strong></div><div className="aside-stat"><span>Competition status</span><strong>{student.competitionStatus}</strong></div><div className="aside-signoff"><Award size={17} /><span>Official statuses and financial changes come from the backend.</span></div></aside></div><div className="outcome-footer"><span><Clock3 size={14} /> Example state for interface review only.</span><button onClick={() => navigate('/dashboard')}>Return to dashboard</button></div></div>
}
