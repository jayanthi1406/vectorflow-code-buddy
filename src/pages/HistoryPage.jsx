import { useEffect, useState } from 'react'
import { Clock3, Flag } from 'lucide-react'
import { EmptyState, LoadingState, SectionHeading } from '../components/ui'
import { useStudent } from '../context/StudentContext'
import { backendCompetitionService } from '../services/backendCompetitionService'

const statusLabel = (round) => {
  const evaluation = round.evaluation?.status
  if (evaluation === 'PASS' || evaluation === 'FAIL') return evaluation
  if (round.status === 'submitted' || round.status === 'timeExpired') return 'Evaluation pending'
  if (round.status === 'inProgress') return 'In progress'
  if (round.status === 'evaluated') return 'Evaluated'
  return round.status || 'Unavailable'
}

function formatDate(value) {
  if (!value) return 'Date unavailable'
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? 'Date unavailable' : date.toLocaleString()
}

export default function HistoryPage() {
  const { state } = useStudent()
  const isReal = state.auth?.mode === 'real'
  const [page, setPage] = useState(1)
  const [retry, setRetry] = useState(0)
  const [data, setData] = useState(null)
  const [error, setError] = useState(null)

  useEffect(() => {
    let mounted = true
    setData(null)
    setError(null)
    if (!isReal) return () => { mounted = false }
    backendCompetitionService.getRoundHistory({ page, limit: 20 })
      .then(result => { if (mounted) setData(result) })
      .catch(loadError => { if (mounted) setError(loadError) })
    return () => { mounted = false }
  }, [isReal, page, retry])

  return <div className="page history-page">
    <SectionHeading kicker="Your competition journey" title="Round history." detail="Assigned questions and evaluation summaries reported by the competition backend." />
    {error && <div className="error-state" role="alert"><p>{error.message || 'Round history is unavailable.'}</p><button className="button button-dark" type="button" onClick={() => setRetry(value => value + 1)}>Try again</button></div>}
    {isReal && !data && !error && <LoadingState label="Loading your round history…" />}
    {!isReal && <EmptyState title="Demo history is not simulated." detail="The local demo previews a current assignment and static outcome screens, but it does not create past evaluations or wallet activity." />}
    {data && !error && (data.rounds?.length ? <>
      <div className="history-list">
        {data.rounds.map(round => {
          const status = statusLabel(round)
          const question = round.question || {}
          return <article className="history-item" key={round.id}>
            <div className="history-item-top"><span className="history-level">L{round.levelNumber}</span><span className={`history-status history-status-${status.toLowerCase().replaceAll(' ', '-')}`}>{status}</span></div>
            <h2>{question.title || `Question ${question.id || round.questionId}`}</h2>
            <p className="history-question-meta">{question.id || round.questionId} · {question.difficulty || 'Difficulty unavailable'} · {formatDate(round.createdAt)}</p>
            {round.evaluation?.remarks && <p className="history-remarks"><strong>Volunteer note</strong>{round.evaluation.remarks}</p>}
            <div className="history-item-footer"><span><Clock3 size={14}/>{round.durationSeconds ? `${Math.floor(round.durationSeconds / 60)} minute round` : 'Duration unavailable'}</span><span><Flag size={14}/>{round.evaluation?.isProgressed ? 'Progression recorded' : round.evaluation?.isSettled ? 'Settlement recorded' : 'Backend status only'}</span></div>
          </article>
        })}
      </div>
      {data.pagination?.totalPages > 1 && <nav className="ledger-pagination" aria-label="Round history pages"><button type="button" onClick={() => setPage(value => Math.max(1, value - 1))} disabled={!data.pagination.hasPrevPage}>Previous</button><span>Page {page} of {data.pagination.totalPages}</span><button type="button" onClick={() => setPage(value => value + 1)} disabled={!data.pagination.hasNextPage}>Next</button></nav>}
      <p className="record-source">Round and evaluation records · Backend data</p>
    </> : <EmptyState title="No past rounds yet." detail="Completed and active round records will appear here after the backend records them." />)}
  </div>
}
