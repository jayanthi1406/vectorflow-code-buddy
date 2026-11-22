import {
  Users,
  Clock,
  CheckCircle2,
  ClipboardList,
  Search,
  CircleUserRound,
} from "lucide-react";
import { useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import "./volunteer-dashboard.css";
import { getVolunteerSession } from "../../services/volunteerAuthService";
import { getVolunteerStudentRound } from "../../services/volunteerRoundService";

export default function VolunteerDashboard() {
  const volunteerName = getVolunteerSession()?.volunteer?.name || "Volunteer";
  const navigate = useNavigate();
  const [usn, setUsn] = useState("");
  const [lookupPending, setLookupPending] = useState(false);
  const [lookupError, setLookupError] = useState("");
  const lookupInProgress = useRef(false);

  async function handleLookup(event) {
    event.preventDefault();
    if (lookupInProgress.current) return;

    const trimmedUsn = usn.trim();
    if (!trimmedUsn) {
      setLookupError("Enter a USN to look up a participant.");
      return;
    }

    lookupInProgress.current = true;
    setLookupPending(true);
    setLookupError("");

    try {
      const response = await getVolunteerStudentRound(trimmedUsn);
      navigate("/volunteer/evaluations", { state: { lookupResult: response } });
    } catch (error) {
      const message = error?.message || "The participant lookup failed. Please try again.";
      const codeMessages = {
        MISSING_USN: `USN is required: ${message}`,
        INVALID_USN_FORMAT: `The USN format is invalid: ${message}`,
        STUDENT_NOT_FOUND: `No registered participant was found for that USN: ${message}`,
        REGISTRATION_INCOMPLETE: `The participant registration is incomplete: ${message}`,
        INVALID_STUDENT_LEVEL: `The participant's current level is invalid: ${message}`,
        ROUND_NOT_ALLOCATED: `No round is currently allocated for this participant: ${message}`,
      };

      if (error?.kind === "network") {
        setLookupError(`Network error. Check your connection and retry. ${message}`);
      } else if (codeMessages[error?.code]) {
        setLookupError(codeMessages[error.code]);
      } else if (error?.status >= 500 || error?.code === "INTERNAL_SERVER_ERROR") {
        setLookupError(`Server error. Please retry the lookup. ${message}`);
      } else if (error?.kind === "http" || error?.kind === "api") {
        setLookupError(message);
      } else {
        setLookupError(`The lookup could not be completed. Please retry. ${message}`);
      }
    } finally {
      lookupInProgress.current = false;
      setLookupPending(false);
    }
  }

  return (
    <div className="vol-dashboard">
      <header className="vol-dashboard-header">
        <div>
          <p className="vol-eyebrow">VOLUNTEER PANEL</p>
          <h1>Welcome back, {volunteerName}!</h1>
          <p className="vol-subtitle">
            Here's an overview of your assigned participants and evaluations.
          </p>
        </div>

        <div className="vol-profile-chip">
          <CircleUserRound size={20} />
          <span>{volunteerName}</span>
        </div>
      </header>

      <p className="vol-subtitle" role="status">
        Look up a registered participant by USN to view their current round.
      </p>

      <div className="vol-stats-grid">
        <div className="vol-stat-card">
          <div className="vol-stat-icon"><Users size={21} /></div>
          <p>Assigned Participants</p>
          <h2>—</h2>
          <span>Available when the assigned roster API is verified</span>
        </div>

        <div className="vol-stat-card">
          <div className="vol-stat-icon"><Clock size={21} /></div>
          <p>Pending Evaluations</p>
          <h2>—</h2>
          <span>Awaiting a verified evaluation status contract</span>
        </div>

        <div className="vol-stat-card">
          <div className="vol-stat-icon"><CheckCircle2 size={21} /></div>
          <p>Completed Evaluations</p>
          <h2>—</h2>
          <span>Awaiting a verified evaluation status contract</span>
        </div>

        <div className="vol-stat-card">
  <div className="vol-stat-icon">
    <ClipboardList size={21} />
  </div>

  <p>Evaluation Progress</p>

  <h2>—</h2>
  <span>Available when evaluation status data is verified</span>
</div>
      </div>

      <section className="vol-participants-section">
        <div className="vol-section-heading">
          <div>
            <p className="vol-eyebrow">YOUR WORKSPACE</p>
            <h2>Participant Lookup</h2>
            <p>Enter a participant's USN to retrieve their current round.</p>
          </div>

          <span className="vol-count">
            USN lookup
          </span>
        </div>

        <form className="vol-toolbar" onSubmit={handleLookup}>
          <div className="vol-search">
            <Search size={17} />
            <input
              type="text"
              placeholder="Enter participant USN..."
              value={usn}
              onChange={(event) => {
                setUsn(event.target.value);
                if (lookupError) setLookupError("");
              }}
              disabled={lookupPending}
              aria-label="Participant USN"
              aria-invalid={Boolean(lookupError)}
              aria-describedby={lookupError ? "volunteer-lookup-error" : undefined}
            />
          </div>

          <button type="submit" className="vol-filter" disabled={lookupPending}>
            {lookupPending
              ? "Looking up…"
              : lookupError
                ? "Retry lookup"
                : "Look up participant"}
          </button>
        </form>

        {lookupError && (
          <p id="volunteer-lookup-error" role="alert">
            {lookupError}
          </p>
        )}

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
              <tr>
                <td colSpan="5" className="vol-empty-state" role="status">
                  Enter a USN above to retrieve one participant's round details.
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
