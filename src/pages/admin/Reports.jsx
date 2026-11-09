import {
  Download,
  Users,
  UserCheck,
  Trophy,
  Wallet,
  TrendingUp,
} from "lucide-react";
import "./reports.css";

// Demo data — replace with backend data during integration.
const participants = [
  { name: "Aarav Sharma", usn: "4VV23CS001", level: 3, prize: 150, status: "ACTIVE" },
  { name: "Ananya Rao", usn: "4VV23CS002", level: 5, prize: 250, status: "ACTIVE" },
  { name: "Rohan Kumar", usn: "4VV23CS003", level: 2, prize: 50, status: "ELIMINATED" },
  { name: "Priya Nair", usn: "4VV23CS004", level: 6, prize: 500, status: "COMPLETED" },
  { name: "Kiran Das", usn: "4VV23CS005", level: 4, prize: 150, status: "ACTIVE" },
];

const levels = [
  { level: 1, reached: 5, cleared: 5 },
  { level: 2, reached: 5, cleared: 4 },
  { level: 3, reached: 4, cleared: 3 },
  { level: 4, reached: 3, cleared: 2 },
  { level: 5, reached: 2, cleared: 1 },
  { level: 6, reached: 1, cleared: 1 },
];

const volunteers = [
  { name: "Meera Sharma", assigned: 8, evaluated: 7 },
  { name: "Arjun Rao", assigned: 6, evaluated: 6 },
  { name: "Sneha Kumar", assigned: 4, evaluated: 2 },
];

export default function Reports() {
  const totalPrize = participants.reduce((sum, p) => sum + p.prize, 0);

  const stats = [
    { label: "Total Participants", value: participants.length, icon: Users },
    {
      label: "Active Participants",
      value: participants.filter((p) => p.status === "ACTIVE").length,
      icon: UserCheck,
    },
    {
      label: "Eliminated",
      value: participants.filter((p) => p.status === "ELIMINATED").length,
      icon: TrendingUp,
    },
    {
      label: "Completed",
      value: participants.filter((p) => p.status === "COMPLETED").length,
      icon: Trophy,
    },
  ];

  const exportCSV = () => {
    const headers = ["Name", "USN", "Current Level", "Prize Balance", "Status"];

    const rows = participants.map((p) => [
      p.name,
      p.usn,
      p.level,
      p.prize,
      p.status,
    ]);

    const csv = [headers, ...rows]
      .map((row) =>
        row.map((value) =>
          `"${String(value).replace(/"/g, '""')}"`
        ).join(",")
      )
      .join("\n");

    const blob = new Blob([csv], {
      type: "text/csv;charset=utf-8;",
    });

    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");

    link.href = url;
    link.download = "code-buddy-participant-report.csv";
    link.click();

    URL.revokeObjectURL(url);
  };

  return (
    <div className="reports-page">

      {/* Header */}
      <div className="reports-header">
        <div>
          <span className="reports-eyebrow">ADMIN / ANALYTICS</span>
          <h1>Competition Reports</h1>
          <p>
            Track competition progress, participant performance and results.
          </p>
        </div>

        <button className="reports-export-btn" onClick={exportCSV}>
          <Download size={17} />
          Export CSV
        </button>
      </div>

      <div className="reports-demo-note">
        Demo report · Showing sample data until backend integration.
      </div>

      {/* Overview cards */}
      <section className="reports-stats">
        {stats.map((stat) => {
          const Icon = stat.icon;

          return (
            <div className="reports-stat-card" key={stat.label}>
              <div className="reports-stat-icon">
                <Icon size={21} />
              </div>

              <div>
                <span>{stat.label}</span>
                <strong>{stat.value}</strong>
              </div>
            </div>
          );
        })}
      </section>

      {/* Level and prize reports */}
      <div className="reports-grid">

        <section className="reports-panel">
          <div className="reports-section-heading">
            <div>
              <h2>Level-wise Performance</h2>
              <p>Participant progress across all six levels</p>
            </div>
          </div>

          <div className="level-report-list">
            {levels.map((item) => {
              const percentage = item.reached
                ? (item.cleared / item.reached) * 100
                : 0;

              return (
                <div className="level-report-row" key={item.level}>
                  <div className="level-report-label">
                    <strong>Level {item.level}</strong>
                    <span>
                      {item.cleared} / {item.reached} cleared
                    </span>
                  </div>

                  <div className="level-report-track">
                    <div
                      className="level-report-fill"
                      style={{ width: `${percentage}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        <section className="reports-panel">
          <div className="reports-section-heading">
            <div>
              <h2>Prize Distribution</h2>
              <p>Current balances in demo participant records</p>
            </div>
            <Wallet size={20} />
          </div>

          <div className="prize-total">
            ₹{totalPrize.toLocaleString("en-IN")}
          </div>

          <span className="reports-muted">
            Combined participant balances
          </span>

          <div className="prize-breakdown">
            {["ACTIVE", "ELIMINATED", "COMPLETED"].map((status) => {
              const amount = participants
                .filter((p) => p.status === status)
                .reduce((sum, p) => sum + p.prize, 0);

              return (
                <div key={status}>
                  <span>
                    {status.charAt(0) + status.slice(1).toLowerCase()} participants
                  </span>
                  <strong>₹{amount.toLocaleString("en-IN")}</strong>
                </div>
              );
            })}
          </div>
        </section>
      </div>

      {/* Volunteer performance */}
      <section className="reports-panel volunteer-performance">
        <div className="reports-section-heading">
          <div>
            <h2>Volunteer Performance</h2>
            <p>Evaluation progress by volunteer</p>
          </div>
        </div>

        <div className="reports-table-wrap">
          <table className="reports-table">
            <thead>
              <tr>
                <th>Volunteer</th>
                <th>Assigned</th>
                <th>Evaluated</th>
                <th>Pending</th>
                <th>Progress</th>
              </tr>
            </thead>

            <tbody>
              {volunteers.map((volunteer) => {
                const progress = volunteer.assigned
                  ? (volunteer.evaluated / volunteer.assigned) * 100
                  : 0;

                return (
                  <tr key={volunteer.name}>
                    <td>{volunteer.name}</td>
                    <td>{volunteer.assigned}</td>
                    <td>{volunteer.evaluated}</td>
                    <td>{volunteer.assigned - volunteer.evaluated}</td>
                    <td>
                      <div className="volunteer-progress-cell">
                        <div className="volunteer-progress-track">
                          <div
                            style={{ width: `${progress}%` }}
                          />
                        </div>
                        <span>{Math.round(progress)}%</span>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      {/* Participant results */}
      <section className="reports-panel participant-results">
        <div className="reports-section-heading">
          <div>
            <h2>Participant Results</h2>
            <p>Individual competition progress and current status</p>
          </div>

          <span className="reports-record-count">
            {participants.length} records
          </span>
        </div>

        <div className="reports-table-wrap">
          <table className="reports-table">
            <thead>
              <tr>
                <th>Participant</th>
                <th>USN</th>
                <th>Level Reached</th>
                <th>Prize Balance</th>
                <th>Status</th>
              </tr>
            </thead>

            <tbody>
              {participants.map((participant) => (
                <tr key={participant.usn}>
                  <td>{participant.name}</td>
                  <td>{participant.usn}</td>
                  <td>Level {participant.level}</td>
                  <td>₹{participant.prize}</td>
                  <td>
                    <span
                      className={`report-status ${participant.status.toLowerCase()}`}
                    >
                      {participant.status}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

    </div>
  );
}