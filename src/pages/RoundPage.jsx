import { useEffect, useState } from 'react'
import { Check, Clock3, Flag } from 'lucide-react'
import { Link, useNavigate } from 'react-router-dom'
import { roundService } from '../services/roundService'
import { assignedQuestionService } from '../services/assignedQuestionService'
import { timerService } from '../services/timerService'
import { evaluationService } from '../services/evaluationService'
import { backendCompetitionService } from '../services/backendCompetitionService'
import { useStudent } from '../context/StudentContext'
import { formatCurrency, formatDuration } from '../utils/formatters'
import { Button, CountdownDisplay, EmptyState, InlineTag, LoadingState } from '../components/ui'

function questionExamples(question) {
  if (Array.isArray(question.examples)) return question.examples.filter(Boolean)
  return question.sample ? [question.sample] : []
}

function QuestionCard({ question, status }) {
  const passed = status === 'PASS'
  const failed = status === 'FAIL'
  const statement = question.statement ?? question.prompt ?? ''
  const constraints = Array.isArray(question.constraints) ? question.constraints : question.constraints ? [question.constraints] : []
  const examples = questionExamples(question)

  return <article className="question-card" aria-labelledby={`question-title-${question.id}`}>
    <header className="question-header">
      <div className="question-number" title="Assigned question ID">{question.id}</div>
      <div className="question-title"><InlineTag tone={question.difficulty?.toLowerCase()}>{question.difficulty}</InlineTag><h3 id={`question-title-${question.id}`}>{question.title}</h3></div>
      <span className={`evaluation-status${passed ? ' evaluation-pass' : failed ? ' evaluation-fail' : ''}`} aria-label={`Evaluation status: ${status}`}><span />{status}</span>
    </header>
    <div className="question-body">
      <div className="problem-section"><h4>Problem statement</h4><div className="problem-statement">{statement.split(/\n\s*\n/).map((paragraph, index) => <p key={index}>{paragraph}</p>)}</div></div>
      {question.inputFormat && <div className="problem-section"><h4>Input format</h4><p className="format-copy">{question.inputFormat}</p></div>}
      {question.outputFormat && <div className="problem-section"><h4>Output format</h4><p className="format-copy">{question.outputFormat}</p></div>}
      {constraints.length > 0 && <div className="problem-section"><h4>Constraints</h4><ul>{constraints.map((constraint, index) => <li key={constraint?.id || index}>{typeof constraint === 'string' ? constraint : constraint?.text || constraint?.value || ''}</li>)}</ul></div>}
      {examples.length > 0 && <div className="sample-list"><h4 className="problem-section-heading">Sample input and output</h4>{examples.map((example, index) => <div className="sample-grid" key={example.id || index}><div><h5>{example.title || `Sample ${index + 1} · input`}</h5><pre>{example.input}</pre></div><div><h5>{example.title ? `${example.title} · output` : `Sample ${index + 1} · output`}</h5><pre>{example.output}</pre></div></div>)}</div>}
      <footer className="question-footer"><span><Check size={14} /> Evaluation by volunteer</span><span className="readonly-evaluation">Read only</span></footer>
    </div>
  </article>
}

export default function RoundPage() {
  const { state, refresh } = useStudent()
  const navigate = useNavigate()
  const [round, setRound] = useState(null)
  const [error, setError] = useState('')
  useEffect(() => {
    let mounted = true
    if (state.auth?.mode === 'real') {
      Promise.all([backendCompetitionService.getActiveRound(), backendCompetitionService.getRoundHistory()])
        .then(([active, history]) => { if (mounted) setRound({ active, history, questionSource: 'backend' }) })
        .catch(loadError => { if (mounted) setError(loadError.message || 'Round details are unavailable. Please return to your dashboard.') })
    } else {
      Promise.all([roundService.getRound(), assignedQuestionService.getAssignedQuestions(), timerService.getTimerInformation(), evaluationService.getStatuses()])
        .then(([roundInfo, assignment, timer, evaluationStatuses]) => { if (mounted) setRound({ ...roundInfo, questions: assignment.questions, questionSource: assignment.source, timer, evaluationStatuses }) })
        .catch(() => { if (mounted) setError('Round details are unavailable. Please return to your dashboard.') })
    }
    return () => { mounted = false }
  }, [state.auth?.mode])
  useEffect(() => {
    const current = round?.active?.round
    if (state.auth?.mode !== 'real' || !current) return undefined
    let mounted = true
    const interval = window.setInterval(async () => {
      try {
        const [active, history] = await Promise.all([backendCompetitionService.getActiveRound(), backendCompetitionService.getRoundHistory()])
        if (!mounted) return
        if (!active) {
          await refresh()
          navigate('/dashboard', { replace: true })
          return
        }
        setRound(previous => ({ ...previous, active, history }))
      } catch (pollError) {
        if (mounted) setError(pollError.message || 'Round status could not be refreshed.')
      }
    }, 10000)
    return () => { mounted = false; window.clearInterval(interval) }
  }, [state.auth?.mode, round?.active?.round?.id, refresh, navigate])

  const isReal = state.auth?.mode === 'real'
  if (!isReal && (!state.student.roundEntered || !['ready', 'inProgress'].includes(state.student.roundAvailability))) return <div className="page"><EmptyState title="This round isn’t open." detail="Enter an available round from your dashboard before viewing your assigned question." action={<Button to="/dashboard" variant="dark">Back to dashboard</Button>} /></div>
  if (error) return <div className="page"><div role="alert" className="error-state">{error}</div></div>
  if (!round) return <LoadingState label="Loading your assigned round…" />
  const activeRound = isReal ? round.active?.round : null
  if (isReal && !activeRound) return <div className="page"><EmptyState title="No question has been assigned yet." detail="Question allocation is performed by the backend and remains attached to your account after refresh. Return to your dashboard to request the current eligible assignment." action={<Button to="/dashboard" variant="dark">Back to dashboard</Button>} /></div>
  if (!isReal && !round.questions?.length) return <div className="page"><EmptyState title="Your assignment is not available yet." detail="The demo assignment service has not returned a question for this student and level." action={<Button to="/dashboard" variant="dark">Back to dashboard</Button>} /></div>

  const configuration = state.competition
  const level = state.levelConfigurations.find(item => item.number === state.student.currentLevel)
  const nextLevel = state.levelConfigurations.find(item => item.number === state.student.currentLevel + 1)
  const question = isReal ? activeRound.question : round.questions[0]
  const historyRound = isReal ? round.history?.rounds?.find(item => item.id === activeRound.id) : null
  const evaluation = isReal ? historyRound?.evaluation?.status || 'PENDING' : (round.evaluationStatuses || {})[question.id] || 'Pending'
  const status = String(evaluation).toUpperCase()
  const passedCount = status === 'PASS' ? 1 : 0
  const durationSeconds = isReal ? activeRound.durationSeconds : round.timer.durationSeconds
  const duration = formatDuration(durationSeconds)
  const timerStatus = isReal ? activeRound.status === 'inProgress' ? 'Backend timer · live display' : activeRound.status === 'timeExpired' ? 'Time expired · awaiting evaluation' : activeRound.status === 'submitted' ? 'Submitted · awaiting evaluation' : activeRound.status === 'evaluated' ? 'Round evaluated' : 'Awaiting volunteer start' : `Reference only · ${duration} shared round`
  const timerSeconds = isReal ? activeRound.status === 'inProgress' ? activeRound.remainingSeconds : activeRound.status === 'timeExpired' ? 0 : null : durationSeconds
  const roundLevelNumber = isReal ? activeRound.levelNumber : round.level

  return <div className="page round-page">
    <Link to="/dashboard" className="back-link">← Back to dashboard</Link>
    <div className="round-top"><div><p className="eyebrow">{configuration?.name || 'Code Buddy'} · {level?.name || `Level ${roundLevelNumber}`}</p><h1>Your round.<br /><span>One assigned question.</span></h1><p className="hero-subtitle">Solve externally and demonstrate your solution to a volunteer.</p></div><CountdownDisplay seconds={timerSeconds} status={timerStatus} running={isReal && activeRound?.status === 'inProgress'} /></div>
    <section className="round-guidance"><span><Clock3 size={16} />One shared timer</span><p>{isReal ? activeRound.status === 'inProgress' ? `The official deadline is ${activeRound.deadline ? new Date(activeRound.deadline).toLocaleTimeString() : 'reported by the backend'}. This countdown is a local display based on the backend response; refresh the page to resync.` : activeRound.status === 'timeExpired' ? 'The backend reports that time has expired. Volunteer evaluation and official progression are still controlled by the competition team.' : activeRound.status === 'submitted' ? 'Your round is submitted and awaiting volunteer evaluation. The result and progression will appear when reported by the backend.' : activeRound.status === 'evaluated' ? 'The backend reports that this round has been evaluated. Your evaluation status is shown below.' : 'Your assignment is ready. A volunteer starts the official timer. No student timer controls are available.' : 'The configured round duration applies to your assigned question. Your volunteer starts it and may extend it when permitted. The backend controls the actual deadline; no countdown runs in this preview.'}</p></section>
    <div className="question-list-heading"><div><h2>Your assigned question</h2><p>Evaluation is provided by your volunteer and is read-only here.</p></div><div className="round-progress" aria-label={`${passedCount} of 1 questions passed`}><span>QUESTION PROGRESS</span><strong>{passedCount}/1</strong><div className="progress-track"><span style={{ width: `${passedCount * 100}%` }} /></div></div></div>
    <div className="language-row"><span>Supported walkthrough languages</span><div>{(configuration?.supportedLanguages || []).map(language => <InlineTag key={language}>{language}</InlineTag>)}</div><InlineTag tone="demo">{round.questionSource === 'demo' ? 'DEMO DATA' : 'BACKEND ASSIGNMENT'}</InlineTag></div>
    <div className="question-stack"><QuestionCard question={question} status={status} /></div>
    <section className="round-rules"><div className="rules-icon"><Flag size={17} /></div><div><strong>Competition rules</strong><p>Your assigned question must pass. {activeRound?.status === 'timeExpired' ? 'The backend reports timer expiry; your official result remains pending until volunteer evaluation and progression.' : 'Failure or timer expiry is handled by the backend and competition volunteer.'} {nextLevel ? `The next level risk requirement is ${formatCurrency(nextLevel.entryFee, 'INR', 'en-IN')}.` : 'Passing this question completes the final level.'} {level && `The configured pass payout is ${formatCurrency(level.passReward, 'INR', 'en-IN')}.`} Official results and wallet changes are backend-controlled.</p></div></section>
    <p className="round-readonly-note">Student evaluation and official timer are read-only. Solve in your own tools and demonstrate your solution to a volunteer. {isReal ? 'Question and timer data are from the backend.' : 'Demo question content is illustrative only.'}</p>
  </div>
}
