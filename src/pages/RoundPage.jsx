import { useEffect, useState } from 'react'
import { Check, Clock3, Flag } from 'lucide-react'
import { Link } from 'react-router-dom'
import { roundService } from '../services/roundService'
import { assignedQuestionService } from '../services/assignedQuestionService'
import { timerService } from '../services/timerService'
import { evaluationService } from '../services/evaluationService'
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

  return <article className="question-card"><header className="question-header"><div className="question-number" title="Assigned question ID">{question.id}</div><div className="question-title"><InlineTag tone={question.difficulty?.toLowerCase()}>{question.difficulty}</InlineTag><h3>{question.title}</h3></div><span className={`evaluation-status${passed ? ' evaluation-pass' : failed ? ' evaluation-fail' : ''}`}><span />{status}</span></header><div className="question-body"><div className="problem-section"><h4>Problem</h4><div className="problem-statement">{statement.split(/\n\s*\n/).map((paragraph, index) => <p key={index}>{paragraph}</p>)}</div></div>{constraints.length > 0 && <div className="problem-section"><h4>Constraints</h4><ul>{constraints.map((constraint, index) => <li key={constraint?.id || index}>{typeof constraint === 'string' ? constraint : constraint?.text || constraint?.value || ''}</li>)}</ul></div>}{examples.length > 0 && <div className="sample-list"><h4>Examples</h4>{examples.map((example, index) => <div className="sample-grid" key={example.id || index}><div><h5>{example.title || `Input ${index + 1}`}</h5><pre>{example.input}</pre></div><div><h5>{example.title ? `${example.title} · output` : `Output ${index + 1}`}</h5><pre>{example.output}</pre></div></div>)}</div>}<footer className="question-footer"><span><Check size={14}/> Evaluation by volunteer</span><span className="readonly-evaluation">Read only</span></footer></div></article>
}

export default function RoundPage() {
  const { state } = useStudent()
  const [round, setRound] = useState(null)
  const [error, setError] = useState('')
  useEffect(() => {
    Promise.all([roundService.getRound(), assignedQuestionService.getAssignedQuestions(), timerService.getTimerInformation(), evaluationService.getStatuses()])
      .then(([roundInfo, assignment, timer, evaluationStatuses]) => setRound({ ...roundInfo, questions: assignment.questions, questionSource: assignment.source, timer, evaluationStatuses }))
      .catch(() => setError('Round details are unavailable. Please return to your dashboard.'))
  }, [])
  if (!state.student.roundEntered || !['ready', 'inProgress'].includes(state.student.roundAvailability)) return <div className="page"><EmptyState title="This round isn’t open." detail="Enter an available round from your dashboard before viewing assigned questions." action={<Button to="/dashboard" variant="dark">Back to dashboard</Button>} /></div>
  if (error) return <div className="page"><div role="alert" className="error-state">{error}</div></div>
  if (!round) return <LoadingState label="Loading your assigned round…" />
  if (!round.questions?.length) return <div className="page"><EmptyState title="Questions are not available yet." detail="Your assignment service has not returned question data for this demo round." action={<Button to="/dashboard" variant="dark">Back to dashboard</Button>} /></div>

  const configuration = state.competition
  const level = state.levelConfigurations.find(item => item.number === state.student.currentLevel)
  const nextLevel = state.levelConfigurations.find(item => item.number === state.student.currentLevel + 1)
  const evaluation = round.evaluationStatuses || {}
  const passedCount = round.questions.filter(question => evaluation[question.id] === 'PASS').length
  const duration = formatDuration(round.timer.durationSeconds)

  return <div className="page round-page"><Link to="/dashboard" className="back-link">← Back to dashboard</Link><div className="round-top"><div><p className="eyebrow">{configuration.name} · {level?.name || `Level ${round.level}`}</p><h1>Your round.<br /><span>Both questions, together.</span></h1><p className="hero-subtitle">Solve externally and demonstrate each solution to your volunteer.</p></div><CountdownDisplay seconds={round.timer.durationSeconds} status={`Reference only · ${duration} shared round`} /></div><section className="round-guidance"><span><Clock3 size={16} />One shared timer</span><p>The configured round lasts {duration} for all assigned questions together. Your volunteer starts it and may extend it when permitted. The backend controls the actual deadline; no countdown runs in this preview.</p></section><div className="question-list-heading"><div><h2>Your assigned questions</h2><p>Evaluation is provided by your volunteer and is read-only here.</p></div><div className="round-progress"><span>PASS PROGRESS</span><strong>{passedCount}/{round.questions.length}</strong><div className="progress-track"><span style={{width: `${round.questions.length ? passedCount / round.questions.length * 100 : 0}%`}} /></div></div></div><div className="language-row"><span>Supported walkthrough languages</span><div>{configuration.supportedLanguages.map(language => <InlineTag key={language}>{language}</InlineTag>)}</div><InlineTag tone="demo">{round.questionSource === 'demo' ? 'DEMO DATA' : 'ASSIGNED'}</InlineTag></div><div className="question-stack">{round.questions.map(question => <QuestionCard key={question.id} question={question} status={evaluation[question.id] || 'Pending'} />)}</div><section className="round-rules"><div className="rules-icon"><Flag size={17} /></div><div><strong>Competition rules</strong><p>Both assigned questions must pass. Failure in either question or timer expiry means elimination and there are no retries. {nextLevel ? `The next level requires a ${formatCurrency(nextLevel.entryStake, configuration.currency, configuration.locale)} stake.` : 'Clearing this level completes the configured competition.'} {level && `This level awards ${formatCurrency(level.reward, configuration.currency, configuration.locale)} when cleared.`} Official results and wallet changes are backend-controlled.</p></div></section><p className="round-readonly-note">Student evaluations, official timer, level and wallet are read-only. Demo question content is illustrative only.</p></div>
}
