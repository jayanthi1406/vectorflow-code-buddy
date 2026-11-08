import { useEffect, useState } from 'react'
import { ArrowUpRight, Medal, Wallet } from 'lucide-react'
import { competitionRecordsService } from '../services/competitionRecordsService'
import { useStudent } from '../context/StudentContext'
import { formatCurrency } from '../utils/formatters'
import { LoadingState, SectionHeading } from '../components/ui'

export default function RecordsPage() {
  const { state } = useStudent()
  const [records, setRecords] = useState(null)
  const [error, setError] = useState(false)
  useEffect(() => { competitionRecordsService.getRecords().then(setRecords).catch(() => setError(true)) }, [])
  const recordLevel = state.levelConfigurations.find(level => level.number === records?.highestRound?.value)

  return <div className="page records-page">
    <SectionHeading kicker="Competition-wide milestones" title="Competition records." detail="Two records from across the whole competition. No rankings, just milestones." />
    {error && <div className="error-state" role="alert">Competition records are temporarily unavailable.</div>}
    {!records && !error && <LoadingState label="Loading competition records…" />}
    {records && <>
      <div className="record-grid">
        <article className="record-card"><div className="record-top"><span className="record-icon"><Medal size={19}/></span><span className="eyebrow">RECORD A</span></div><p className="record-label">Highest round reached</p><strong className="record-value">{recordLevel?.name || `Level ${records.highestRound.value}`}</strong><div className="record-holder"><span>Achieved by</span><b>{records.highestRound.participantName}</b></div></article>
        <article className="record-card record-highlight"><div className="record-top"><span className="record-icon"><Wallet size={19}/></span><span className="eyebrow">RECORD B</span></div><p className="record-label">Highest amount earned</p><strong className="record-value">{formatCurrency(records.highestEarnings.value, state.competition.currency, state.competition.locale)}</strong><div className="record-holder"><span>Cumulative rewards</span><b>{records.highestEarnings.participantName}</b></div></article>
      </div>
      <p className="record-footnote"><ArrowUpRight size={14}/> Highest amount earned is cumulative rewards before stakes. Ties use earliest achievement time; the name breaks any remaining tie.</p>
      <p className="record-source">Competition-wide record preview · Mock data</p>
    </>}
  </div>
}
