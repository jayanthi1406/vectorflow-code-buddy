import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Download,
  Users,
  UserCheck,
  Trophy,
  Wallet,
  TrendingUp,
} from "lucide-react";
import { getAdminDashboardStats, getAdminParticipants } from "../../services/adminDataService";
import "./reports.css";

const displayStatus = (status) => {
  if (["registered", "inProgress", "cleared"].includes(status)) return "ACTIVE";
  return String(status || "UNKNOWN").toUpperCase();
};

const roundStatuses = ["ready", "inProgress", "timeExpired", "submitted", "evaluated", "abandoned"];
const transactionTypes = [
  "STAKE_DEBIT",
  "REWARD_CREDIT",
  "REFUND",
  "SAFE_ZONE_PAYOUT",
  "ADMIN_ADJUSTMENT",
  "ROUND_SETTLEMENT",
];

export default function Reports() {
  const [participants, setParticipants] = useState([]);
  const [dashboard, setDashboard] = useState(null);
  const [loading, setLoading] = useState(true);
  const [dashboardError, setDashboardError] = useState("");
  const [participantsError, setParticipantsError] = useState("");

  const loadReports = useCallback(async () => {
    setLoading(true);
    setDashboardError("");
    setParticipantsError("");

    const dashboardRequest = getAdminDashboardStats()
      .then((stats) => setDashboard(stats))
      .catch((loadError) => setDashboardError(loadError.message || "Could not load dashboard statistics."));

    const participantsRequest = getAdminParticipants()
      .then((participantData) => setParticipants(participantData.map((participant) => ({
        id: participant.id,
        name: participant.name,
        usn: participant.usn || "—",
        level: participant.currentLevel,
        prize: participant.walletBalance,
        status: displayStatus(participant.competitionStatus),
      }))))
      .catch((loadError) => setParticipantsError(loadError.message || "Could not load participant records."));

    await Promise.all([dashboardRequest, participantsRequest]);
    setLoading(false);
  }, []);

  useEffect(() => {
    loadReports();
  }, [loadReports]);

  const levelRows = useMemo(() => Array.from({ length: 6 }, (_, index) => {
    const number = index + 1;
    const value = dashboard?.levels?.[`L${number}`] || {};
    return {
      level: number,
      reached: value.reachedCount ?? null,
      cleared: value.clearedCount ?? null,
    };
  }), [dashboard]);

  const totalBalance = dashboard?.wallet?.totalWalletBalance ?? null;
  const participantStats = dashboard?.participants;
  const activeParticipantCount = participantStats && [
    participantStats.registered,
    participantStats.inProgress,
    participantStats.cleared,
  ].every(Number.isFinite)
    ? participantStats.registered + participantStats.inProgress + participantStats.cleared
    : null;
  const stats = [
    { label: "Total Participants", value: participantStats?.total ?? null, icon: Users },
    { label: "Active Participants", value: activeParticipantCount, icon: UserCheck },
    { label: "Eliminated", value: participantStats?.eliminated ?? null, icon: TrendingUp },
    { label: "Completed", value: participantStats?.completed ?? null, icon: Trophy },
  ];
  const requestErrors = [dashboardError, participantsError].filter(Boolean);

  const exportCSV = () => {
    const headers = ["Name", "USN", "Current Level", "Wallet Balance", "Competition Status"];
    const rows = participants.map((participant) => [
      participant.name,
      participant.usn,
      participant.level,
      participant.prize,
      participant.status,
    ]);
    const csv = [headers, ...rows]
      .map((row) => row.map((value) => `"${String(value ?? "").replace(/"/g, '""')}"`).join(","))
      .join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "code-buddy-participant-report.csv";
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="reports-page">
      <div className="reports-header">
        <div>
          <span className="reports-eyebrow">ADMIN / ANALYTICS</span>
          <h1>Competition Reports</h1>
          <p>Track competition progress, participant performance and results.</p>
        </div>
        <button className="reports-export-btn" onClick={exportCSV} disabled={loading || !!participantsError}>
          <Download size={17} />
          Export CSV
        </button>
      </div>

      {requestErrors.length > 0 && (
        <div className="reports-demo-note" role="alert">
          {dashboardError && dashboard && "Dashboard refresh failed. The displayed dashboard figures are from the last successful response and may be stale. "}
          {participantsError && participants.length > 0 && "Participant rows are from the last successful response and may be stale. "}
          {requestErrors.join(" ")} <button type="button" onClick={loadReports}>Retry</button>
        </div>
      )}
      {loading && <div className="reports-demo-note" role="status">{dashboard || participants.length > 0 ? "Refreshing report data; previously loaded values remain visible until refreshed." : "Loading competition reports…"}</div>}
      {!loading && requestErrors.length === 0 && <div className="reports-demo-note">Live report data from the competition backend.</div>}

      <section className="reports-stats">
        {stats.map((stat) => {
          const Icon = stat.icon;
          return (
            <div className="reports-stat-card" key={stat.label}>
              <div className="reports-stat-icon"><Icon size={21} /></div>
              <div><span>{stat.label}</span><strong>{dashboard ? (stat.value ?? "Unavailable") : loading ? "—" : "Unavailable"}</strong></div>
            </div>
          );
        })}
      </section>

      <div className="reports-grid">
        <section className="reports-panel">
          <div className="reports-section-heading">
            <div><h2>Level-wise Performance</h2><p>Participant progress across all six levels</p></div>
          </div>
          <div className="level-report-list">
            {!dashboard && loading ? (
              <p role="status">Loading level performance...</p>
            ) : !dashboard ? (
              <p role="alert">Level performance is unavailable because dashboard data could not be loaded.</p>
            ) : (
              levelRows.map((item) => {
                const percentage = item.reached > 0 && item.cleared !== null
                  ? (item.cleared / item.reached) * 100
                  : 0;
                return (
                  <div className="level-report-row" key={item.level}>
                    <div className="level-report-label">
                      <strong>Level {item.level}</strong>
                      <span>{item.cleared ?? "—"} / {item.reached ?? "—"} cleared</span>
                    </div>
                    <div className="level-report-track"><div style={{ width: `${Math.min(100, percentage)}%` }} /></div>
                  </div>
                );
              })
            )}
          </div>
        </section>

        <section className="reports-panel">
          <div className="reports-section-heading">
            <div><h2>Prize Distribution</h2><p>Current balances reported by the backend</p></div>
            <Wallet size={20} />
          </div>
          {!dashboard && loading ? (
            <p className="reports-muted" role="status">Loading prize distribution...</p>
          ) : !dashboard ? (
            <p className="reports-muted" role="alert">Prize distribution is unavailable because dashboard data could not be loaded.</p>
          ) : (
            <>
              <div className="prize-total">{totalBalance === null ? "Unavailable" : `₹${Number(totalBalance).toLocaleString("en-IN")}`}</div>
              <span className="reports-muted">Combined participant wallet balances</span>
              {participantsError ? (
                <p className="reports-muted" role="alert">Wallet breakdown by participant status is unavailable: {participantsError}</p>
              ) : (
                <div className="prize-breakdown">
                  {["ACTIVE", "ELIMINATED", "COMPLETED"].map((status) => {
                    const amount = participants.filter((participant) => participant.status === status)
                      .reduce((sum, participant) => sum + (Number(participant.prize) || 0), 0);
                    return (
                      <div key={status}>
                        <span>{status.charAt(0) + status.slice(1).toLowerCase()} participants</span>
                        <strong>{`₹${amount.toLocaleString("en-IN")}`}</strong>
                      </div>
                    );
                  })}
                </div>
              )}
            </>
          )}
        </section>
      </div>

      <div className="reports-grid">
        <section className="reports-panel">
          <div className="reports-section-heading"><div><h2>Round Status</h2><p>Competition-wide round counts from the dashboard</p></div></div>
          {!dashboard && loading ? <p className="reports-muted" role="status">Loading round totals...</p> : !dashboard ? <p className="reports-muted" role="alert">Round totals are unavailable because dashboard data could not be loaded.</p> : (
            <div className="reports-table-wrap">
              <table className="reports-table">
                <thead><tr><th>Round Status</th><th>Count</th></tr></thead>
                <tbody>
                  {roundStatuses.map((status) => <tr key={status}><td>{status}</td><td>{dashboard.rounds?.byStatus?.[status] ?? "—"}</td></tr>)}
                  <tr><td><strong>Total</strong></td><td><strong>{dashboard.rounds?.total ?? "—"}</strong></td></tr>
                </tbody>
              </table>
            </div>
          )}
        </section>

        <section className="reports-panel">
          <div className="reports-section-heading"><div><h2>Transaction Totals</h2><p>Counts and amounts grouped by transaction type</p></div></div>
          {!dashboard && loading ? <p className="reports-muted" role="status">Loading transaction totals...</p> : !dashboard ? <p className="reports-muted" role="alert">Transaction totals are unavailable because dashboard data could not be loaded.</p> : (
            <div className="reports-table-wrap">
              <table className="reports-table">
                <thead><tr><th>Transaction Type</th><th>Count</th><th>Total Amount</th></tr></thead>
                <tbody>
                  {transactionTypes.map((type) => {
                    const totals = dashboard.transactions?.byType?.[type];
                    return <tr key={type}><td>{type}</td><td>{totals?.count ?? "—"}</td><td>{totals?.totalAmount === undefined ? "—" : `₹${Number(totals.totalAmount).toLocaleString("en-IN")}`}</td></tr>;
                  })}
                  <tr><td><strong>Total</strong></td><td><strong>{dashboard.transactions?.total ?? "—"}</strong></td><td><strong>{dashboard.transactions?.totalAmount === undefined ? "—" : `₹${Number(dashboard.transactions.totalAmount).toLocaleString("en-IN")}`}</strong></td></tr>
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>

      <section className="reports-panel volunteer-performance">
        <div className="reports-section-heading">
          <div><h2>Volunteer Performance</h2><p>Evaluation progress by volunteer</p></div>
        </div>
        <div className="reports-table-wrap">
          <table className="reports-table">
            <thead><tr><th>Volunteer</th><th>Assigned</th><th>Evaluated</th><th>Pending</th><th>Progress</th></tr></thead>
            <tbody><tr><td colSpan="5">Per-volunteer assigned, evaluated and pending totals are unavailable until Likith provides a backend API.</td></tr></tbody>
          </table>
        </div>
      </section>

      <section className="reports-panel participant-results">
        <div className="reports-section-heading">
          <div><h2>Participant Results</h2><p>Individual competition progress and current status</p></div>
          <span className="reports-record-count">{participantsError ? "Unavailable" : `${participants.length} records`}</span>
        </div>
        <div className="reports-table-wrap">
          <table className="reports-table">
            <thead><tr><th>Participant</th><th>USN</th><th>Level Reached</th><th>Wallet Balance</th><th>Status</th></tr></thead>
            <tbody>
              {participants.map((participant) => (
                <tr key={participant.id}>
                  <td>{participant.name}</td>
                  <td>{participant.usn}</td>
                  <td>Level {participant.level}</td>
                  <td>₹{Number(participant.prize || 0).toLocaleString("en-IN")}</td>
                  <td><span className={`report-status ${participant.status.toLowerCase()}`}>{participant.status}</span></td>
                </tr>
              ))}
              {loading && participants.length === 0 && <tr><td colSpan="5" role="status">Loading participant records...</td></tr>}
              {!loading && participantsError && <tr><td colSpan="5" role="alert">Participant results are unavailable: {participantsError}</td></tr>}
              {!loading && !participantsError && participants.length === 0 && <tr><td colSpan="5">No participant records found.</td></tr>}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
