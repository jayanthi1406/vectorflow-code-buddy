import { useEffect, useState } from 'react'
import { ArrowUpRight, Medal, Wallet } from 'lucide-react'
import { competitionRecordsService } from '../services/competitionRecordsService'
import { backendCompetitionService } from '../services/backendCompetitionService'
import { useStudent } from '../context/StudentContext'
import { formatCurrency } from '../utils/formatters'
import { EmptyState, LoadingState, SectionHeading } from '../components/ui'

export default function RecordsPage() {
  const { state } = useStudent()
  const [records, setRecords] = useState(null)
  const [error, setError] = useState(null)
  const isReal = state.auth?.mode === 'real'
  useEffect(() => { (isReal ? backendCompetitionService.getRecords() : competitionRecordsService.getRecords()).then(setRecords).catch(setError) }, [isReal])
  const recordLevel = state.levelConfigurations.find(level => level.number === records?.highestRound?.value)

  return <div className="page records-page">
    <SectionHeading kicker="Competition-wide milestones" title="Competition records." detail="Two records from across the whole competition. No rankings, just milestones." />
    {error && <div className="error-state" role="alert">{error.message || 'Competition records are temporarily unavailable.'}</div>}
    {!records && !error && <LoadingState label="Loading competition records…" />}
    {records && <>
      <div className="record-grid">
        <article className="record-card"><div className="record-top"><span className="record-icon"><Medal size={19}/></span><span className="eyebrow">RECORD A</span></div><p className="record-label">Highest level reached</p><strong className="record-value">{recordLevel?.name || (records.highestRound?.value ? `Level ${records.highestRound.value}` : 'No record yet')}</strong><div className="record-holder"><span>Participant</span><b>{records.highestRound?.participantName || '—'}</b></div></article>
        <article className="record-card record-highlight"><div className="record-top"><span className="record-icon"><Wallet size={19}/></span><span className="eyebrow">RECORD B</span></div><p className="record-label">Highest cumulative rewards</p><strong className="record-value">{typeof records.highestEarnings?.value === 'number' ? formatCurrency(records.highestEarnings.value, 'INR', 'en-IN') : 'No record yet'}</strong><div className="record-holder"><span>Participant</span><b>{records.highestEarnings?.participantName || '—'}</b></div></article>
      </div>
      <p className="record-footnote"><ArrowUpRight size={14}/> Highest cumulative earnings are supplied by the backend as a competition-wide record.</p>
      <p className="record-source">Competition-wide record · {isReal ? 'Backend data' : 'Mock data'}</p>
    </>}
  </div>
}
