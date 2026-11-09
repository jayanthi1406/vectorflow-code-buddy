import { useState } from "react";
import {
  Users,
  Clock,
  CheckCircle2,
  ClipboardList,
  Search,
  ArrowRight,
  Play,
  CircleUserRound,
} from "lucide-react";
import "./volunteer-dashboard.css";
import TimerPanel from "./TimerPanel";

const mockParticipants = [
  {
    id: 1,
    name: "Aarav Sharma",
    usn: "4VV23CS001",
    level: 3,
    status: "PENDING",
  },
  {
    id: 2,
    name: "Ananya Rao",
    usn: "4VV23CS002",
    level: 5,
    status: "COMPLETED",
  },
  {
    id: 3,
    name: "Rohan Kumar",
    usn: "4VV23CS003",
    level: 2,
    status: "PENDING",
  },
  {
    id: 4,
    name: "Priya Nair",
    usn: "4VV23CS004",
    level: 4,
    status: "COMPLETED",
  },
];

export default function VolunteerDashboard() {
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("ALL");

  const pendingCount = mockParticipants.filter(
    (p) => p.status === "PENDING"
  ).length;

  const completedCount = mockParticipants.filter(
    (p) => p.status === "COMPLETED"
  ).length;

  const filteredParticipants = mockParticipants.filter((participant) => {
    const matchesSearch =
      participant.name.toLowerCase().includes(search.toLowerCase()) ||
      participant.usn.toLowerCase().includes(search.toLowerCase());

    const matchesFilter =
      filter === "ALL" || participant.status === filter;

    return matchesSearch && matchesFilter;
  });

  return (
    <div className="vol-dashboard">
      <header className="vol-dashboard-header">
        <div>
          <p className="vol-eyebrow">VOLUNTEER PANEL</p>
          <h1>Welcome back, Meera!</h1>
          <p className="vol-subtitle">
            Here's an overview of your assigned participants and evaluations.
          </p>
        </div>

        <div className="vol-profile-chip">
          <CircleUserRound size={20} />
          <span>Meera Sharma</span>
        </div>
      </header>

      <div className="vol-status-banner">
        <div className="vol-status-dot" />
        <div>
          <strong>Competition is in progress</strong>
          <p>Stay ready for participant evaluations.</p>
        </div>
        <span className="vol-live-label">LIVE</span>
      </div>
      <TimerPanel level={1} />

      <div className="vol-stats-grid">
        <div className="vol-stat-card">
          <div className="vol-stat-icon"><Users size={21} /></div>
          <p>Assigned Participants</p>
          <h2>{mockParticipants.length}</h2>
          <span>Total participants assigned to you</span>
        </div>

        <div className="vol-stat-card">
          <div className="vol-stat-icon"><Clock size={21} /></div>
          <p>Pending Evaluations</p>
          <h2>{pendingCount}</h2>
          <span>Waiting for evaluation</span>
        </div>

        <div className="vol-stat-card">
          <div className="vol-stat-icon"><CheckCircle2 size={21} /></div>
          <p>Completed Evaluations</p>
          <h2>{completedCount}</h2>
          <span>Evaluations completed</span>
        </div>

        <div className="vol-stat-card">
  <div className="vol-stat-icon">
    <ClipboardList size={21} />
  </div>

  <p>Evaluation Progress</p>

  <h2>
    {completedCount}/{mockParticipants.length}
  </h2>

  <div className="vol-progress-track">
    <div
      className="vol-progress-fill"
      style={{
        width: `${
          (completedCount / mockParticipants.length) * 100
        }%`,
      }}
    />
  </div>

  <span>
    {Math.round(
      (completedCount / mockParticipants.length) * 100
    )}% evaluations completed
  </span>
</div>
      </div>

      <section className="vol-participants-section">
        <div className="vol-section-heading">
          <div>
            <p className="vol-eyebrow">YOUR WORKSPACE</p>
            <h2>Assigned Participants</h2>
            <p>View participant details and evaluation status.</p>
          </div>

          <span className="vol-count">
            {filteredParticipants.length} participants
          </span>
        </div>

        <div className="vol-toolbar">
          <div className="vol-search">
            <Search size={17} />
            <input
              type="text"
              placeholder="Search by name or USN..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>

          <select
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            className="vol-filter"
          >
            <option value="ALL">All Participants</option>
            <option value="PENDING">Pending</option>
            <option value="COMPLETED">Completed</option>
          </select>
        </div>

        <div className="vol-table-wrapper">
          <table className="vol-table">
            <thead>
              <tr>
                <th>PARTICIPANT</th>
                <th>USN</th>
                <th>CURRENT LEVEL</th>
                <th>STATUS</th>
                <th>ACTION</th>
              </tr>
            </thead>

            <tbody>
              {filteredParticipants.map((participant) => (
                <tr key={participant.id}>
                  <td className="vol-participant-name">
                    {participant.name}
                  </td>
                  <td>{participant.usn}</td>
                  <td>Level {participant.level}</td>
                  <td>
                    <span
                      className={`vol-status-tag ${
                        participant.status === "PENDING"
                          ? "vol-pending"
                          : "vol-completed"
                      }`}
                    >
                      {participant.status}
                    </span>
                  </td>
                  <td>
                    <button
                      className="vol-action-button"
                      onClick={() =>
                        alert(
                          `Evaluation screen for ${participant.name} will be built next.`
                        )
                      }
                    >
                      {participant.status === "PENDING" ? (
                        <>
                          <Play size={14} /> Evaluate
                        </>
                      ) : (
                        <>
                          View Details <ArrowRight size={14} />
                        </>
                      )}
                    </button>
                  </td>
                </tr>
              ))}

              {filteredParticipants.length === 0 && (
                <tr>
                  <td colSpan="5" className="vol-empty-state">
                    No participants found.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}