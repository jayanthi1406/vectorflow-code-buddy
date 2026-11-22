import { useCallback, useEffect, useState } from "react";
import {
  Search,
  Users,
  Trophy,
  Wallet,
  Eye,
  X,
} from "lucide-react";
import "./participants.css";
import {
  getAdminParticipantDetails,
  getAdminParticipantRounds,
  getAdminParticipantTransactions,
  getAdminParticipants,
} from "../../services/adminDataService";

const HISTORY_PAGE_LIMIT = 5;

const displayStatus = (status) => {
  if (["registered", "inProgress", "cleared"].includes(status)) return "ACTIVE";
  return String(status || "UNKNOWN").toUpperCase();
};

function formatCounts(counts) {
  if (!counts || typeof counts !== "object" || Array.isArray(counts)) return "Not available";
  return Object.entries(counts)
    .map(([status, count]) => `${status}: ${count}`)
    .join(" · ");
}

function formatTransactionTotals(totals) {
  if (!totals || typeof totals !== "object" || Array.isArray(totals)) {
    return "Not available";
  }
  return Object.entries(totals)
    .map(([type, value]) => {
      const count = value && typeof value.count === "number" ? value.count : "—";
      const amount = value && typeof value.totalAmount === "number"
        ? value.totalAmount
        : "—";
      return `${type}: ${count} / ₹${amount}`;
    })
    .join(" · ");
}

function formatDate(value) {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "—" : date.toLocaleString();
}

export default function ParticipantManagement() {
  const [participants, setParticipants] = useState([]);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [selectedParticipant, setSelectedParticipant] = useState(null);
  const [loading, setLoading] = useState(true);
  const [detailsLoading, setDetailsLoading] = useState(false);
  const [detailsError, setDetailsError] = useState("");
  const [error, setError] = useState("");
  const [retryDetailsParticipant, setRetryDetailsParticipant] = useState(null);
  const [roundHistory, setRoundHistory] = useState(null);
  const [roundHistoryLoading, setRoundHistoryLoading] = useState(false);
  const [roundHistoryError, setRoundHistoryError] = useState("");
  const [roundPage, setRoundPage] = useState(1);
  const [transactionHistory, setTransactionHistory] = useState(null);
  const [transactionHistoryLoading, setTransactionHistoryLoading] = useState(false);
  const [transactionHistoryError, setTransactionHistoryError] = useState("");
  const [transactionPage, setTransactionPage] = useState(1);
  const [activeHistory, setActiveHistory] = useState("");

  const loadParticipants = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const data = await getAdminParticipants();
      setParticipants(data.map((participant) => ({
        ...participant,
        level: participant.currentLevel,
        prize: participant.totalEarned,
        status: displayStatus(participant.competitionStatus),
      })));
    } catch (loadError) {
      setError(loadError.message || "Could not load participants.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadParticipants();
  }, [loadParticipants]);

  const filteredParticipants = participants.filter((participant) => {
    const matchesSearch =
      String(participant.name || "").toLowerCase().includes(search.toLowerCase()) ||
      String(participant.usn || "").toLowerCase().includes(search.toLowerCase());

    const matchesStatus =
      statusFilter === "ALL" ||
      participant.status === statusFilter;

    return matchesSearch && matchesStatus;
  });

  const activeCount = participants.filter((p) => p.status === "ACTIVE").length;

  const eliminatedCount = participants.filter(
    (p) => p.status === "ELIMINATED"
  ).length;

  const completedCount = participants.filter(
    (p) => p.status === "COMPLETED"
  ).length;

  const loadRoundHistory = async (identifier, page = 1) => {
    setRoundPage(page);
    setRoundHistory(null);
    setRoundHistoryLoading(true);
    setRoundHistoryError("");
    try {
      const result = await getAdminParticipantRounds(identifier, {
        page,
        limit: HISTORY_PAGE_LIMIT,
      });
      setRoundHistory(result);
    } catch (historyError) {
      setRoundHistoryError(historyError.message || "Could not load round history.");
    } finally {
      setRoundHistoryLoading(false);
    }
  };

  const loadTransactionHistory = async (identifier, page = 1) => {
    setTransactionPage(page);
    setTransactionHistory(null);
    setTransactionHistoryLoading(true);
    setTransactionHistoryError("");
    try {
      const result = await getAdminParticipantTransactions(identifier, {
        page,
        limit: HISTORY_PAGE_LIMIT,
      });
      setTransactionHistory(result);
    } catch (historyError) {
      setTransactionHistoryError(
        historyError.message || "Could not load transaction history.",
      );
    } finally {
      setTransactionHistoryLoading(false);
    }
  };

  const openParticipant = async (participant) => {
    const identifier = participant.usn || participant.id;
    setRetryDetailsParticipant(participant);
    setSelectedParticipant(participant);
    setActiveHistory("");
    setDetailsLoading(true);
    setDetailsError("");
    setError("");

    const detailsRequest = getAdminParticipantDetails(identifier)
      .then((result) => {
        setSelectedParticipant((current) => current && ({
          ...current,
          ...(result.participant || {}),
          level: result.participant?.currentLevel ?? participant.level,
          prize: result.wallet?.totalEarned ?? participant.prize,
          walletBalance: result.wallet?.walletBalance,
          summary: result.summary,
        }));
        setRetryDetailsParticipant(null);
      })
      .catch((detailsLoadError) => {
        setDetailsError(detailsLoadError.message || "Could not load participant details.");
      })
      .finally(() => setDetailsLoading(false));

    setRoundHistoryError("");
    setTransactionHistoryError("");
    setRoundHistory(null);
    setTransactionHistory(null);
    setRoundPage(1);
    setTransactionPage(1);
    await Promise.all([
      detailsRequest,
      loadRoundHistory(identifier, 1),
      loadTransactionHistory(identifier, 1),
    ]);
  };

  return (
    <div className="participant-management">

      <div className="participant-page-header">
        <div>
          <span className="admin-eyebrow">
            COMPETITION MANAGEMENT
          </span>
          <h1>Participants.</h1>
          <p>
            Monitor registered students and their competition progress.
          </p>
        </div>
      </div>

      <div className="participant-summary">
        <div>
          <Users size={21} />
          <span>Total Participants</span>
          <strong>{participants.length}</strong>
        </div>

        <div>
          <Trophy size={21} />
          <span>Active</span>
          <strong>{activeCount}</strong>
        </div>

        <div>
          <Wallet size={21} />
          <span>Eliminated</span>
          <strong>{eliminatedCount}</strong>
        </div>

        <div>
          <Trophy size={21} />
          <span>Completed</span>
          <strong>{completedCount}</strong>
        </div>
      </div>

      {error && <p role="alert">{error} <button type="button" onClick={loadParticipants}>Retry</button></p>}
      {loading && <p role="status">Loading participants…</p>}

      <div className="participant-toolbar">
        <div className="participant-search">
          <Search size={18} />
          <input
            type="text"
            placeholder="Search name or USN..."
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
        </div>

        <select
          value={statusFilter}
          onChange={(event) => setStatusFilter(event.target.value)}
        >
          <option value="ALL">All Statuses</option>
          <option value="ACTIVE">Active</option>
          <option value="ELIMINATED">Eliminated</option>
          <option value="COMPLETED">Completed</option>
        </select>
      </div>

      <div className="participant-table-container">
        <div className="participant-table-heading">
          <h2>Registered Participants</h2>
          <span>{filteredParticipants.length} students</span>
        </div>

        <div className="participant-table-scroll">
          <table className="participant-table">
            <thead>
              <tr>
                <th>STUDENT</th>
                <th>USN</th>
                <th>LEVEL</th>
                <th>PRIZE SECURED</th>
                <th>STATUS</th>
                <th>DETAILS</th>
              </tr>
            </thead>

            <tbody>
              {filteredParticipants.map((participant) => (
                <tr key={participant.id}>
                  <td>
                    <strong>{participant.name}</strong>
                    <small>Email is not provided by the participant list API</small>
                  </td>

                  <td>{participant.usn || "—"}</td>
                  <td>Level {participant.level}</td>
                  <td>₹{participant.prize}</td>

                  <td>
                    <span
                      className={`participant-status ${participant.status.toLowerCase()}`}
                    >
                      {participant.status}
                    </span>
                  </td>

                  <td>
                    <button
                      className="participant-view-btn"
                      onClick={() => openParticipant(participant)}
                      disabled={detailsLoading || roundHistoryLoading || transactionHistoryLoading}
                    >
                      <Eye size={16} />
                      View
                    </button>
                  </td>
                </tr>
              ))}

              {!loading && !error && filteredParticipants.length === 0 && (
                <tr>
                  <td colSpan="6" className="participant-empty">
                    No participants found.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {selectedParticipant && (
        <div className="participant-modal-overlay">
          <div className="participant-modal">
            <div className="participant-modal-header">
              <div>
                <span className="admin-eyebrow">
                  STUDENT DETAILS
                </span>
                <h2>{selectedParticipant.name}</h2>
              </div>

              <button
                type="button"
                onClick={() => setSelectedParticipant(null)}
              >
                <X size={20} />
              </button>
            </div>

            <div className="participant-details-list">
              <div>
                <span>USN</span>
                <strong>{selectedParticipant.usn}</strong>
              </div>

              <div>
                <span>Email</span>
                <strong>Email is not provided by the API</strong>
              </div>

              <div>
                <span>Current Level</span>
                <strong>Level {selectedParticipant.level}</strong>
              </div>

              <div>
                <span>Prize Secured</span>
                <strong>₹{selectedParticipant.prize}</strong>
              </div>

              <div>
                <span>Competition Status</span>
                  <strong>{selectedParticipant.competitionStatus || selectedParticipant.status}</strong>
              </div>
                <div>
                  <span>Current Wallet Balance</span>
                  <strong>{selectedParticipant.walletBalance === undefined ? "—" : `₹${selectedParticipant.walletBalance}`}</strong>
                </div>
              <div>
                <span>Total Rounds / Completed</span>
                <strong>
                  {selectedParticipant.summary
                    ? `${selectedParticipant.summary.totalRounds} / ${selectedParticipant.summary.completedRounds}`
                    : "Not available"}
                </strong>
              </div>
              <div>
                <span>Round Counts by Status</span>
                <strong>{formatCounts(selectedParticipant.summary?.roundCountsByStatus)}</strong>
              </div>
              <div>
                <span>Evaluation Counts by Status</span>
                <strong>{formatCounts(selectedParticipant.summary?.evaluationCountsByStatus)}</strong>
              </div>
              <div>
                <span>Total Transactions</span>
                <strong>{selectedParticipant.summary?.totalTransactions ?? "Not available"}</strong>
              </div>
              <div>
                <span>Transaction Totals by Type</span>
                <strong>{formatTransactionTotals(selectedParticipant.summary?.transactionTotalsByType)}</strong>
              </div>
            </div>

            {detailsLoading && <p role="status">Loading participant details…</p>}
            {detailsError && (
              <p role="alert">
                {detailsError}{" "}
                <button
                  type="button"
                  className="participant-view-btn"
                  disabled={detailsLoading}
                  onClick={() => retryDetailsParticipant && openParticipant(retryDetailsParticipant)}
                >
                  Retry
                </button>
              </p>
            )}

            <div className="participant-toolbar">
              <button
                type="button"
                className="participant-view-btn"
                aria-expanded={activeHistory === "rounds"}
                onClick={() => setActiveHistory(activeHistory === "rounds" ? "" : "rounds")}
              >
                Round History
              </button>
              <button
                type="button"
                className="participant-view-btn"
                aria-expanded={activeHistory === "transactions"}
                onClick={() => setActiveHistory(activeHistory === "transactions" ? "" : "transactions")}
              >
                Transaction History
              </button>
            </div>

            {activeHistory === "rounds" && (
              <div className="participant-table-container">
                <div className="participant-table-heading">
                  <h2>Round History</h2>
                  <span>{roundHistory?.pagination?.totalItems ?? 0} rounds</span>
                </div>
                {roundHistoryLoading && <p role="status">Loading round history…</p>}
                {roundHistoryError && (
                  <p role="alert">
                    {roundHistoryError}{" "}
                    <button
                      type="button"
                      className="participant-view-btn"
                      disabled={roundHistoryLoading}
                      onClick={() => loadRoundHistory(selectedParticipant.usn || selectedParticipant.id, roundPage)}
                    >
                      Retry
                    </button>
                  </p>
                )}
                {roundHistory && !roundHistoryLoading && !roundHistoryError && (
                  <>
                    <div className="participant-table-scroll">
                      <table className="participant-table">
                        <thead>
                          <tr>
                            <th>LEVEL</th>
                            <th>STATUS</th>
                            <th>DURATION</th>
                            <th>EVALUATION</th>
                            <th>SETTLED</th>
                            <th>PROGRESSED</th>
                          </tr>
                        </thead>
                        <tbody>
                          {roundHistory.rounds.map((historyRound) => (
                            <tr key={historyRound.id}>
                              <td>Level {historyRound.levelNumber}</td>
                              <td>{historyRound.status}</td>
                              <td>{historyRound.durationSeconds} sec</td>
                              <td>{historyRound.evaluation?.status ?? "Not available"}</td>
                              <td>{historyRound.evaluation?.isSettled ? "Yes" : "No"}</td>
                              <td>{historyRound.evaluation?.isProgressed ? "Yes" : "No"}</td>
                            </tr>
                          ))}
                          {roundHistory.rounds.length === 0 && (
                            <tr>
                              <td colSpan="6" className="participant-empty">No round history found.</td>
                            </tr>
                          )}
                        </tbody>
                      </table>
                    </div>
                    <div className="participant-toolbar">
                      <button
                        type="button"
                        className="participant-view-btn"
                        disabled={roundHistoryLoading || roundPage <= 1}
                        onClick={() => loadRoundHistory(selectedParticipant.usn || selectedParticipant.id, roundPage - 1)}
                      >
                        Previous
                      </button>
                      <span>Page {roundPage} of {Math.max(1, roundHistory.pagination.totalPages)}</span>
                      <button
                        type="button"
                        className="participant-view-btn"
                        disabled={roundHistoryLoading || roundPage >= roundHistory.pagination.totalPages}
                        onClick={() => loadRoundHistory(selectedParticipant.usn || selectedParticipant.id, roundPage + 1)}
                      >
                        Next
                      </button>
                    </div>
                  </>
                )}
              </div>
            )}

            {activeHistory === "transactions" && (
              <div className="participant-table-container">
                <div className="participant-table-heading">
                  <h2>Transaction History</h2>
                  <span>{transactionHistory?.pagination?.totalItems ?? 0} transactions</span>
                </div>
                {transactionHistoryLoading && <p role="status">Loading transaction history…</p>}
                {transactionHistoryError && (
                  <p role="alert">
                    {transactionHistoryError}{" "}
                    <button
                      type="button"
                      className="participant-view-btn"
                      disabled={transactionHistoryLoading}
                      onClick={() => loadTransactionHistory(selectedParticipant.usn || selectedParticipant.id, transactionPage)}
                    >
                      Retry
                    </button>
                  </p>
                )}
                {transactionHistory && !transactionHistoryLoading && !transactionHistoryError && (
                  <>
                    <div className="participant-table-scroll">
                      <table className="participant-table">
                        <thead>
                          <tr>
                            <th>DATE</th>
                            <th>TYPE</th>
                            <th>AMOUNT</th>
                            <th>BALANCE AFTER</th>
                            <th>LEVEL</th>
                            <th>DESCRIPTION</th>
                          </tr>
                        </thead>
                        <tbody>
                          {transactionHistory.transactions.map((transaction) => (
                            <tr key={transaction.id}>
                              <td>{formatDate(transaction.timestamp)}</td>
                              <td>{transaction.type}</td>
                              <td>₹{transaction.amount}</td>
                              <td>₹{transaction.balanceAfter}</td>
                              <td>{transaction.levelNumber ?? "—"}</td>
                              <td>{transaction.description}</td>
                            </tr>
                          ))}
                          {transactionHistory.transactions.length === 0 && (
                            <tr>
                              <td colSpan="6" className="participant-empty">No transaction history found.</td>
                            </tr>
                          )}
                        </tbody>
                      </table>
                    </div>
                    <div className="participant-toolbar">
                      <button
                        type="button"
                        className="participant-view-btn"
                        disabled={transactionHistoryLoading || transactionPage <= 1}
                        onClick={() => loadTransactionHistory(selectedParticipant.usn || selectedParticipant.id, transactionPage - 1)}
                      >
                        Previous
                      </button>
                      <span>Page {transactionPage} of {Math.max(1, transactionHistory.pagination.totalPages)}</span>
                      <button
                        type="button"
                        className="participant-view-btn"
                        disabled={transactionHistoryLoading || transactionPage >= transactionHistory.pagination.totalPages}
                        onClick={() => loadTransactionHistory(selectedParticipant.usn || selectedParticipant.id, transactionPage + 1)}
                      >
                        Next
                      </button>
                    </div>
                  </>
                )}
              </div>
            )}

            <button
              className="participant-close-btn"
              onClick={() => setSelectedParticipant(null)}
            >
              Close
            </button>
          </div>
        </div>
      )}

    </div>
  );
}
