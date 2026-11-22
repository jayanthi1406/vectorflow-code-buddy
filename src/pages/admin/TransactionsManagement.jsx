import { useEffect, useRef, useState } from "react";
import { Search } from "lucide-react";
import { getAdminTransactions } from "../../services/adminDataService";
import "./participants.css";

const PAGE_LIMIT = 20;
const transactionTypes = [
  "STAKE_DEBIT",
  "REWARD_CREDIT",
  "REFUND",
  "SAFE_ZONE_PAYOUT",
  "ADMIN_ADJUSTMENT",
  "ROUND_SETTLEMENT",
];
const emptyFilters = { type: "", levelNumber: "", usn: "", search: "" };

function formatDate(value) {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "—" : date.toLocaleString();
}

function displayAmount(value) {
  return value === null || value === undefined || !Number.isFinite(Number(value))
    ? "—"
    : String(value);
}

export default function TransactionsManagement() {
  const [draftFilters, setDraftFilters] = useState(emptyFilters);
  const [filters, setFilters] = useState({ ...emptyFilters, page: 1, limit: PAGE_LIMIT });
  const [retryCount, setRetryCount] = useState(0);
  const [transactions, setTransactions] = useState([]);
  const [pagination, setPagination] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const requestSequence = useRef(0);
  const activeRequests = useRef(new Map());

  useEffect(() => {
    const requestKey = JSON.stringify(filters);
    const requestId = ++requestSequence.current;
    let request = activeRequests.current.get(requestKey);
    if (!request) {
      request = getAdminTransactions(filters);
      activeRequests.current.set(requestKey, request);
      request.then(
        () => { if (activeRequests.current.get(requestKey) === request) activeRequests.current.delete(requestKey); },
        () => { if (activeRequests.current.get(requestKey) === request) activeRequests.current.delete(requestKey); },
      );
    }

    setLoading(true);
    setError(null);
    setTransactions([]);
    setPagination(null);
    request.then((result) => {
      if (requestSequence.current !== requestId) return;
      setTransactions(result.transactions);
      setPagination(result.pagination);
    }).catch((requestError) => {
      if (requestSequence.current === requestId) setError(requestError);
    }).finally(() => {
      if (requestSequence.current === requestId) setLoading(false);
    });

    return () => {
      if (requestSequence.current === requestId) requestSequence.current += 1;
    };
  }, [filters, retryCount]);

  const handleFilterChange = (event) => {
    const { name, value } = event.target;
    setDraftFilters((current) => ({ ...current, [name]: value }));
  };

  const applyFilters = (event) => {
    event.preventDefault();
    setFilters({
      ...draftFilters,
      levelNumber: draftFilters.levelNumber ? Number(draftFilters.levelNumber) : "",
      usn: draftFilters.usn.trim(),
      search: draftFilters.search.trim(),
      page: 1,
      limit: filters.limit,
    });
  };

  const clearFilters = () => {
    setDraftFilters({ ...emptyFilters });
    setFilters({ ...emptyFilters, page: 1, limit: filters.limit });
  };

  const changePage = (nextPage) => {
    if (loading || !pagination || nextPage < 1) return;
    setFilters((current) => ({ ...current, page: nextPage }));
  };

  const changeLimit = (event) => {
    const limit = Number(event.target.value);
    setFilters((current) => ({ ...current, limit, page: 1 }));
  };

  const retry = () => {
    if (!loading) setRetryCount((count) => count + 1);
  };

  return (
    <div className="participant-management">
      <div className="participant-page-header">
        <div>
          <span className="admin-eyebrow">COMPETITION MANAGEMENT</span>
          <h1>Transactions.</h1>
          <p>Review the competition transaction ledger.</p>
        </div>
      </div>

      <form onSubmit={applyFilters}>
        <div className="participant-toolbar">
          <div className="participant-search">
            <Search size={18} />
            <input name="search" type="search" placeholder="Search participant name, USN or description..." value={draftFilters.search} onChange={handleFilterChange} maxLength={100} />
          </div>
          <div className="participant-search">
            <input name="usn" type="search" aria-label="Filter by USN" placeholder="Filter by USN..." value={draftFilters.usn} onChange={handleFilterChange} minLength={8} maxLength={15} pattern="[A-Za-z0-9]{8,15}" title="Enter an 8 to 15 character alphanumeric USN" />
          </div>
        </div>
        <div className="participant-toolbar">
          <select name="type" aria-label="Filter by transaction type" value={draftFilters.type} onChange={handleFilterChange}>
            <option value="">All Transaction Types</option>
            {transactionTypes.map((type) => <option key={type} value={type}>{type}</option>)}
          </select>
          <select name="levelNumber" aria-label="Filter by level" value={draftFilters.levelNumber} onChange={handleFilterChange}>
            <option value="">All Levels</option>
            {[1, 2, 3, 4, 5, 6].map((level) => <option key={level} value={level}>Level {level}</option>)}
          </select>
          <button className="participant-view-btn" type="submit" disabled={loading}>Apply filters</button>
          <button className="participant-view-btn" type="button" onClick={clearFilters} disabled={loading}>Clear filters</button>
        </div>
      </form>

      {error && (
        <p role="alert">
          {error.message || "Could not load transactions."}
          {error.code ? ` (${error.code})` : ""} {error.status ? `HTTP ${error.status}.` : ""}{" "}
          <button className="participant-view-btn" type="button" onClick={retry} disabled={loading}>Retry</button>
        </p>
      )}
      {loading && <p role="status">Loading transactions…</p>}

      <div className="participant-table-container">
        <div className="participant-table-heading">
          <h2>Transaction Records</h2>
          <span>{pagination ? `${pagination.totalItems} total transactions` : ""}</span>
        </div>
        <div className="participant-table-scroll">
          <table className="participant-table">
            <thead>
              <tr><th>TRANSACTION</th><th>AMOUNT</th><th>LEVEL / ROUND</th><th>DESCRIPTION</th><th>DATE / TIME</th><th>PARTICIPANT</th></tr>
            </thead>
            <tbody>
              {transactions.map((transaction) => (
                <tr key={transaction.id}>
                  <td>
                    <strong>{transaction.type || "—"}</strong>
                    <small>{transaction.id || "—"}</small>
                  </td>
                  <td>
                    <strong>{displayAmount(transaction.amount)}</strong>
                    <small>Balance after: {displayAmount(transaction.balanceAfter)}</small>
                  </td>
                  <td>
                    <strong>{transaction.levelNumber == null ? "—" : `Level ${transaction.levelNumber}`}</strong>
                    <small>{transaction.roundId || "—"}</small>
                  </td>
                  <td>{transaction.description || "—"}</td>
                  <td>{formatDate(transaction.timestamp)}</td>
                  <td>
                    <strong>{transaction.participant?.name || "—"}</strong>
                    <small>{transaction.participant?.usn || "—"}</small>
                  </td>
                </tr>
              ))}
              {!loading && !error && transactions.length === 0 && (
                <tr><td colSpan="6" className="participant-empty">No transactions found for the selected filters.</td></tr>
              )}
              {!loading && error && <tr><td colSpan="6" className="participant-empty">Transaction records are unavailable.</td></tr>}
              {loading && <tr><td colSpan="6" className="participant-empty">Loading transactions…</td></tr>}
            </tbody>
          </table>
        </div>
        <div className="participant-toolbar">
          <span>{pagination ? `Page ${pagination.page} of ${pagination.totalPages}` : ""}</span>
          <select aria-label="Transactions per page" value={filters.limit} onChange={changeLimit} disabled={loading}>
            {[10, 20, 50, 100].map((limit) => <option key={limit} value={limit}>{limit} per page</option>)}
          </select>
          <button className="participant-view-btn" type="button" onClick={() => changePage((pagination?.page || 1) - 1)} disabled={loading || !pagination?.hasPrevPage}>Previous</button>
          <button className="participant-view-btn" type="button" onClick={() => changePage((pagination?.page || 1) + 1)} disabled={loading || !pagination?.hasNextPage}>Next</button>
        </div>
      </div>
    </div>
  );
}
