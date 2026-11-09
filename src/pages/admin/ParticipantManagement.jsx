import { useState } from "react";
import {
  Search,
  Users,
  Trophy,
  Wallet,
  Eye,
  X,
} from "lucide-react";
import "./participants.css";

const initialParticipants = [
  {
    id: 1,
    name: "Aarav Sharma",
    usn: "4VV24CS001",
    email: "aarav@vvce.ac.in",
    level: 3,
    prize: 150,
    status: "ACTIVE",
  },
  {
    id: 2,
    name: "Ananya Rao",
    usn: "4VV24CS002",
    email: "ananya@vvce.ac.in",
    level: 5,
    prize: 250,
    status: "ACTIVE",
  },
  {
    id: 3,
    name: "Rohan Kumar",
    usn: "4VV24CS003",
    email: "rohan@vvce.ac.in",
    level: 2,
    prize: 50,
    status: "ELIMINATED",
  },
  {
    id: 4,
    name: "Priya Nair",
    usn: "4VV24CS004",
    email: "priya@vvce.ac.in",
    level: 6,
    prize: 500,
    status: "COMPLETED",
  },
];

export default function ParticipantManagement() {
  const [participants] = useState(initialParticipants);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [selectedParticipant, setSelectedParticipant] = useState(null);

  const filteredParticipants = participants.filter((participant) => {
    const matchesSearch =
      participant.name.toLowerCase().includes(search.toLowerCase()) ||
      participant.usn.toLowerCase().includes(search.toLowerCase()) ||
      participant.email.toLowerCase().includes(search.toLowerCase());

    const matchesStatus =
      statusFilter === "ALL" ||
      participant.status === statusFilter;

    return matchesSearch && matchesStatus;
  });

  const activeCount = participants.filter(
    (p) => p.status === "ACTIVE"
  ).length;

  const eliminatedCount = participants.filter(
    (p) => p.status === "ELIMINATED"
  ).length;

  const completedCount = participants.filter(
    (p) => p.status === "COMPLETED"
  ).length;

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

      <div className="participant-toolbar">
        <div className="participant-search">
          <Search size={18} />
          <input
            type="text"
            placeholder="Search name, USN or email..."
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
                    <small>{participant.email}</small>
                  </td>

                  <td>{participant.usn}</td>
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
                      onClick={() =>
                        setSelectedParticipant(participant)
                      }
                    >
                      <Eye size={16} />
                      View
                    </button>
                  </td>
                </tr>
              ))}

              {filteredParticipants.length === 0 && (
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
                <strong>{selectedParticipant.email}</strong>
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
                <strong>{selectedParticipant.status}</strong>
              </div>
            </div>

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