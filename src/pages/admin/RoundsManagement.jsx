import { useEffect, useRef, useState } from "react";
import { Search } from "lucide-react";
import { getAdminRounds, recoverAdminRound } from "../../services/adminDataService";
import "./participants.css";

const PAGE_LIMIT = 20;
const roundStatuses = ["ready", "inProgress", "timeExpired", "submitted", "evaluated", "abandoned"];
const evaluationStatuses = ["PENDING", "PASS", "FAIL"];
const emptyFilters = {
  levelNumber: "",
  status: "",
  evaluationStatus: "",
  usn: "",
  search: "",
};

function formatDate(value) {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "—" : date.toLocaleString();
}

function formatSeconds(value) {
  if (!Number.isFinite(value) || value < 0) return "—";
  const seconds = Math.floor(value);
  return `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
}

function displayState(value) {
  if (value === true) return "Yes";
  if (value === false) return "No";
  return "—";
}

export default function RoundsManagement() {
  const [draftFilters, setDraftFilters] = useState(emptyFilters);
  const [filters, setFilters] = useState({ ...emptyFilters, page: 1, limit: PAGE_LIMIT });
  const [retryCount, setRetryCount] = useState(0);
  const [refreshCount, setRefreshCount] = useState(0);
  const [rounds, setRounds] = useState([]);
  const [pagination, setPagination] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [recoveringRoundId, setRecoveringRoundId] = useState(null);
  const [recoverySuccess, setRecoverySuccess] = useState("");
  const [recoveryError, setRecoveryError] = useState(null);
  const requestSequence = useRef(0);
  const activeRequests = useRef(new Map());
  const recoveryInFlight = useRef(false);

  useEffect(() => {
    const requestKey = JSON.stringify(filters);
    const requestId = ++requestSequence.current;
    let request = activeRequests.current.get(requestKey);
    if (!request) {
      request = getAdminRounds(filters);
      activeRequests.current.set(requestKey, request);
      request.then(
        () => { if (activeRequests.current.get(requestKey) === request) activeRequests.current.delete(requestKey); },
        () => { if (activeRequests.current.get(requestKey) === request) activeRequests.current.delete(requestKey); },
      );
    }

    setLoading(true);
    setError(null);
    setRounds([]);
    setPagination(null);
    request.then((result) => {
      if (requestSequence.current !== requestId) return;
      setRounds(result.rounds);
      setPagination(result.pagination);
    }).catch((requestError) => {
      if (requestSequence.current === requestId) setError(requestError);
    }).finally(() => {
      if (requestSequence.current === requestId) setLoading(false);
    });

    return () => {
      if (requestSequence.current === requestId) requestSequence.current += 1;
    };
  }, [filters, retryCount, refreshCount]);

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

  const recoverRound = async (round) => {
    if (recoveryInFlight.current || round?.status !== "abandoned" || !round.id) return;
    const confirmed = window.confirm("Recover this abandoned round? The backend will verify that it is eligible.");
    if (!confirmed) return;

    recoveryInFlight.current = true;
    setRecoveringRoundId(round.id);
    setRecoveryError(null);
    setRecoverySuccess("");
    try {
      const result = await recoverAdminRound(round.id);
      setRounds((current) => current.map((item) => item.id === result.round.id ? result.round : item));
      setRecoverySuccess(result.message || `Round ${result.round.id} was recovered and is ready.`);
      setRefreshCount((count) => count + 1);
    } catch (requestError) {
      setRecoveryError(requestError);
      if (requestError.status === 409 || requestError.status === 404) {
        setRefreshCount((count) => count + 1);
      }
    } finally {
      recoveryInFlight.current = false;
      setRecoveringRoundId(null);
    }
  };

  return (
    <div className="participant-management">
      <div className="participant-page-header">
        <div>
          <span className="admin-eyebrow">COMPETITION MANAGEMENT</span>
          <h1>Rounds.</h1>
          <p>Review participant rounds, questions and evaluation state.</p>
        </div>
      </div>

      <form onSubmit={applyFilters}>
        <div className="participant-toolbar">
          <div className="participant-search">
            <Search size={18} />
            <input name="search" type="search" placeholder="Search participant name, USN or question..." value={draftFilters.search} onChange={handleFilterChange} maxLength={100} />
          </div>
          <div className="participant-search">
            <input name="usn" type="search" aria-label="Filter by USN" placeholder="Filter by USN..." value={draftFilters.usn} onChange={handleFilterChange} minLength={8} maxLength={15} pattern="[A-Za-z0-9]{8,15}" title="Enter an 8 to 15 character alphanumeric USN" />
          </div>
        </div>
        <div className="participant-toolbar">
          <select name="levelNumber" aria-label="Filter by level" value={draftFilters.levelNumber} onChange={handleFilterChange}>
            <option value="">All Levels</option>
            {[1, 2, 3, 4, 5, 6].map((level) => <option key={level} value={level}>Level {level}</option>)}
          </select>
          <select name="status" aria-label="Filter by round status" value={draftFilters.status} onChange={handleFilterChange}>
            <option value="">All Round Statuses</option>
            {roundStatuses.map((status) => <option key={status} value={status}>{status}</option>)}
          </select>
          <select name="evaluationStatus" aria-label="Filter by evaluation status" value={draftFilters.evaluationStatus} onChange={handleFilterChange}>
            <option value="">All Evaluation Statuses</option>
            {evaluationStatuses.map((status) => <option key={status} value={status}>{status}</option>)}
          </select>
          <button className="participant-view-btn" type="submit" disabled={loading}>Apply filters</button>
          <button className="participant-view-btn" type="button" onClick={clearFilters} disabled={loading}>Clear filters</button>
        </div>
      </form>

      {error && (
        <p role="alert">
          {error.message || "Could not load rounds."}
          {error.code ? ` (${error.code})` : ""} {error.status ? `HTTP ${error.status}.` : ""}{" "}
          <button className="participant-view-btn" type="button" onClick={retry} disabled={loading}>Retry</button>
        </p>
      )}
      {loading && <p role="status">Loading rounds…</p>}
      {recoverySuccess && <p role="status">{recoverySuccess}</p>}
      {recoveryError && (
        <p role="alert">
          {recoveryError.message || "Could not recover this round."}
          {recoveryError.code ? ` (${recoveryError.code})` : ""} {recoveryError.status ? `HTTP ${recoveryError.status}.` : ""}{" "}
          <button
            className="participant-view-btn"
            type="button"
            onClick={() => {
              setRecoveryError(null);
              setRefreshCount((count) => count + 1);
            }}
            disabled={loading}
          >
            Refresh rounds
          </button>
        </p>
      )}

      <div className="participant-table-container">
        <div className="participant-table-heading">
          <h2>Round Records</h2>
          <span>{pagination ? `${pagination.totalItems} total rounds` : ""}</span>
        </div>
        <div className="participant-table-scroll">
          <table className="participant-table">
            <thead>
              <tr><th>ROUND</th><th>PARTICIPANT</th><th>QUESTION</th><th>TIMER</th><th>EVALUATION</th><th>ACTION</th></tr>
            </thead>
            <tbody>
              {rounds.map((round) => (
                <tr key={round.id}>
                  <td>
                    <strong>Level {round.levelNumber ?? "—"}</strong>
                    <span className="participant-status">{round.status || "—"}</span>
                  </td>
                  <td>
                    <strong>{round.participant?.name || "—"}</strong>
                    <small>{round.participant?.usn || "—"}</small>
                  </td>
                  <td>
                    <strong>{round.question?.title || "—"}</strong>
                    <small>{round.question?.difficulty || "—"}</small>
                  </td>
                  <td>
                    <strong>{formatSeconds(round.durationSeconds)}</strong>
                    <small>Remaining: {formatSeconds(round.remainingSeconds)}</small>
                    <small>Deadline: {formatDate(round.deadline)}</small>
                    <small>Expired: {displayState(round.isExpired)}</small>
                  </td>
                  <td>
                    <strong>{round.evaluation?.status || "—"}</strong>
                    <small>Language: {round.evaluation?.programmingLanguage || "—"}</small>
                    <small>Settled: {displayState(round.evaluation?.isSettled)}</small>
                    <small>Progressed: {displayState(round.evaluation?.isProgressed)}</small>
                  </td>
                  <td>
                    {round.status === "abandoned" && (
                      <button
                        className="participant-view-btn"
                        type="button"
                        onClick={() => recoverRound(round)}
                        disabled={loading || recoveringRoundId !== null}
                      >
                        {recoveringRoundId === round.id ? "Recovering…" : "Recover"}
                      </button>
                    )}
                    {round.status !== "abandoned" && "—"}
                  </td>
                </tr>
              ))}
              {!loading && !error && rounds.length === 0 && (
                <tr><td colSpan="6" className="participant-empty">No rounds found for the selected filters.</td></tr>
              )}
              {!loading && error && <tr><td colSpan="6" className="participant-empty">Round records are unavailable.</td></tr>}
              {loading && <tr><td colSpan="6" className="participant-empty">Loading rounds…</td></tr>}
            </tbody>
          </table>
        </div>
        <div className="participant-toolbar">
          <span>{pagination ? `Page ${pagination.page} of ${pagination.totalPages}` : ""}</span>
          <select aria-label="Rounds per page" value={filters.limit} onChange={changeLimit} disabled={loading}>
            {[10, 20, 50, 100].map((limit) => <option key={limit} value={limit}>{limit} per page</option>)}
          </select>
          <button className="participant-view-btn" type="button" onClick={() => changePage((pagination?.page || 1) - 1)} disabled={loading || !pagination?.hasPrevPage}>Previous</button>
          <button className="participant-view-btn" type="button" onClick={() => changePage((pagination?.page || 1) + 1)} disabled={loading || !pagination?.hasNextPage}>Next</button>
        </div>
      </div>
    </div>
  );
}
