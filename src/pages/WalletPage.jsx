import { useEffect, useState } from 'react'
import { ArrowDown, ArrowUp, Wallet } from 'lucide-react'
import { EmptyState, LoadingState, MetricCard, SectionHeading } from '../components/ui'
import { useStudent } from '../context/StudentContext'
import { backendCompetitionService } from '../services/backendCompetitionService'
import { walletService } from '../services/walletService'
import { formatCurrency } from '../utils/formatters'

export default function WalletPage() {
  const { state } = useStudent()
  const isReal = state.auth?.mode === 'real'
  const [page, setPage] = useState(1)
  const [data, setData] = useState(null)
  const [error, setError] = useState(null)
  useEffect(() => {
    let mounted = true
    setData(null); setError(null)
    const request = isReal
      ? backendCompetitionService.getTransactions({ page, limit: 20 })
      : walletService.getSummary().then(summary => summary ? { ...summary, transactions: [], pagination: { page: 1, totalPages: 1, hasNextPage: false, hasPrevPage: false }, source: 'demo' } : null)
    request.then(result => { if (mounted) setData(result) }).catch(loadError => { if (mounted) setError(loadError) })
    return () => { mounted = false }
  }, [isReal, page])

  return <div className="page wallet-page">
    <SectionHeading kicker="Student wallet" title="Wallet activity." detail="Balances and ledger entries are read-only. Official settlement is handled by the backend." />
    {error && <div className="error-state" role="alert">{error.message || 'Wallet information is unavailable.'}</div>}
    {!data && !error && <LoadingState label="Loading wallet details…" />}
    {data && <>
      <section className="metric-grid" aria-label="Wallet balances">
        <MetricCard label="Current balance" value={formatCurrency(data.walletBalance ?? data.balance, 'INR', 'en-IN')} caption="Available wallet balance" accent />
        <MetricCard label="Cumulative rewards" value={formatCurrency(data.totalEarned ?? data.totalRewardsEarned, 'INR', 'en-IN')} caption="Backend reported" />
        <MetricCard label="Total risked" value={formatCurrency(data.totalRisked ?? data.totalEntryFeesPaid, 'INR', 'en-IN')} caption="Backend field; no client calculation" />
      </section>
      <section className="wallet-ledger" aria-labelledby="wallet-ledger-title">
        <div className="wallet-ledger-heading"><span className="record-icon"><Wallet size={18}/></span><div><h2 id="wallet-ledger-title">Transaction history</h2><p>{isReal ? 'Immutable entries reported by the competition backend.' : 'Demo preview has no server ledger entries.'}</p></div></div>
        {data.transactions?.length ? <div className="transaction-list">{data.transactions.map(transaction => <article className="transaction-row" key={transaction.id}><span className="transaction-mark" aria-hidden="true">{transaction.type === 'REWARD_CREDIT' ? <ArrowDown size={16}/> : <ArrowUp size={16}/>}</span><div className="transaction-description"><strong>{transaction.description || transaction.type}</strong><span>{transaction.type} · Level {transaction.levelNumber ?? '—'} · {new Date(transaction.timestamp).toLocaleString()}</span></div><div className="transaction-amount"><strong>{formatCurrency(transaction.amount, 'INR', 'en-IN')}</strong><span>Balance after · {formatCurrency(transaction.balanceAfter, 'INR', 'en-IN')}</span></div></article>)}</div> : <EmptyState title="No transactions to show." detail={isReal ? 'No wallet ledger entries have been recorded for your account yet.' : 'The local demo does not simulate wallet transactions.'} />}
        {isReal && data.pagination?.totalPages > 1 && <nav className="ledger-pagination" aria-label="Transaction pages"><button type="button" onClick={() => setPage(value => Math.max(1, value - 1))} disabled={!data.pagination.hasPrevPage}>Previous</button><span>Page {page} of {data.pagination.totalPages}</span><button type="button" onClick={() => setPage(value => value + 1)} disabled={!data.pagination.hasNextPage}>Next</button></nav>}
      </section>
      <p className="record-source">{isReal ? 'Backend wallet data' : 'Demo wallet data'}</p>
    </>}
  </div>
}
