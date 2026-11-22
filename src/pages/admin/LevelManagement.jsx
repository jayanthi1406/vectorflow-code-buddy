import { useCallback, useEffect, useState } from "react";
import {
  Settings2,
  Users,
  Trophy,
  Clock3,
  BookOpen,
  Pencil,
  X,
  Save,
  CheckCircle2,
  AlertCircle,
  Layers3,
} from "lucide-react";
import "./levels.css";
import { getAdminDashboardStats } from "../../services/adminDataService";
import { getAdminQuestionList } from "../../services/adminQuestionService";
import { getAdminLevels, setAdminLevelActive, updateAdminLevel } from "../../services/adminLevelService";

export default function LevelManagement() {
  const [levels, setLevels] = useState([]);
  const [editingLevel, setEditingLevel] = useState(null);
  const [savedMessage, setSavedMessage] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const loadLevels = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [configuredLevels, dashboard, questions] = await Promise.all([
        getAdminLevels(),
        getAdminDashboardStats(),
        getAdminQuestionList(),
      ]);
      setLevels(configuredLevels.map((level) => {
        const progress = dashboard.levels?.[`L${level.number}`] || {};
        const levelQuestions = questions.filter((question) => question.levelNumber === level.number && question.isActive);
        return {
          id: level.number,
          name: level.name,
          entryFee: level.entryRiskAmount ?? "",
          passReward: level.winningPayout,
          duration: (level.durationSeconds || 0) / 60,
          easy: levelQuestions.filter((question) => question.difficulty === "EASY").length,
          hard: levelQuestions.filter((question) => question.difficulty === "HARD").length,
          reached: progress.reachedCount ?? 0,
          cleared: progress.clearedCount ?? 0,
          status: level.isActive ? "ACTIVE" : "INACTIVE",
          isUsedInCompetition: level.isUsedInCompetition === true,
          hasOpenRounds: level.hasOpenRounds === true,
        };
      }));
    } catch (loadError) {
      setError(loadError.message || "Could not load level configuration.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadLevels();
  }, [loadLevels]);

  const totalReached = levels.find((level) => level.id === 1)?.reached ?? 0;
  const totalCleared = levels.find((level) => level.id === 6)?.cleared ?? 0;

  const updateField = (field, value) => {
    setEditingLevel((current) => ({
      ...current,
      [field]: value,
    }));
  };

  const saveLevel = async (event) => {
    event.preventDefault();
    setSaving(true);
    setError("");
    const updates = {
      winningPayout: Number(editingLevel.passReward),
      durationSeconds: Number(editingLevel.duration) * 60,
    };
    if (editingLevel.entryFee !== "") updates.entryRiskAmount = Number(editingLevel.entryFee);
    try {
      await updateAdminLevel(editingLevel.id, updates);
      setEditingLevel(null);
      setSavedMessage("Level configuration updated.");
      await loadLevels();
      window.setTimeout(() => setSavedMessage(""), 3000);
    } catch (saveError) {
      setError(saveError.message || "Could not update level configuration.");
    } finally {
      setSaving(false);
    }
  };

  const toggleStatus = async (level) => {
    setError("");
    try {
      await setAdminLevelActive(level.id, level.status !== "ACTIVE");
      await loadLevels();
    } catch (toggleError) {
      setError(toggleError.message || "Could not update level status.");
    }
  };

  return (
    <div className="levels-page">
      <div className="levels-header">
        <div>
          <span className="levels-eyebrow">ADMIN / CONFIGURATION</span>
          <h1>Level Management</h1>
          <p>Configure competition levels, settings and progression.</p>
        </div>

        <div className="levels-count">
          <Layers3 size={17} />
          6 Competition Levels
        </div>
      </div>

      {savedMessage && (
        <div className="levels-success-message">
          <CheckCircle2 size={17} />
          {savedMessage}
        </div>
      )}

      {error && <div className="levels-demo-note" role="alert"><AlertCircle size={17} />{error} <button type="button" onClick={loadLevels}>Retry</button></div>}
      {loading && <div className="levels-demo-note" role="status">Loading level configuration…</div>}

      {/* Overview */}
      <section className="levels-overview">
        <OverviewCard
          icon={<Layers3 />}
          label="Total Levels"
          value="06"
        />
        <OverviewCard
          icon={<Users />}
          label="Initial Participants"
          value={loading ? "—" : totalReached}
        />
        <OverviewCard
          icon={<Trophy />}
          label="Reached Final Level"
          value={loading ? "—" : levels.find((level) => level.id === 6)?.reached ?? 0}
        />
        <OverviewCard
          icon={<CheckCircle2 />}
          label="Completed Competition"
          value={loading ? "—" : totalCleared}
        />
      </section>

      {/* Level cards */}
      <section className="levels-section">
        <div className="levels-section-heading">
          <div>
            <h2>Competition Levels</h2>
            <p>Manage the configuration of each level.</p>
          </div>
        </div>

        <div className="levels-grid">
          {levels.map((level) => {
            const percentage = level.reached
              ? Math.round((level.cleared / level.reached) * 100)
              : 0;

            return (
              <article className="level-card" key={level.id}>
                <div className="level-card-top">
                  <div className="level-number">
                    {String(level.id).padStart(2, "0")}
                  </div>

                  <span className={`level-status ${level.status.toLowerCase()}`}>
                    {level.status}
                  </span>
                </div>

                <h3>{level.name}</h3>
                <p className="level-card-subtitle">
                  Competition stage {level.id} of 6
                </p>

                <div className="level-card-details">
                  <div>
                    <span><WalletIcon /> Entry fee</span>
                    <strong>
                      {level.entryFee === "" ? "Not configured" : `₹${level.entryFee}`}
                    </strong>
                  </div>

                  <div>
                    <span><Trophy size={14} /> Pass reward</span>
                    <strong>
                      {level.passReward === "" ? "Not configured" : `₹${level.passReward}`}
                    </strong>
                  </div>

                  <div>
                    <span><Clock3 size={14} /> Duration</span>
                    <strong>{level.duration} minutes</strong>
                  </div>
                </div>

                <div className="level-card-progress">
                  <div className="level-progress-heading">
                    <span>Progression</span>
                    <strong>{percentage}% cleared</strong>
                  </div>

                  <div className="level-progress-track">
                    <div style={{ width: `${Math.min(100, percentage)}%` }} />
                  </div>

                  <div className="level-progress-counts">
                    <span>{level.reached} reached</span>
                    <span>{level.cleared} cleared</span>
                  </div>
                </div>

                <div className="level-card-footer">
                  <button
                    className="level-edit-btn"
                    onClick={() => setEditingLevel({ ...level })}
                  >
                    <Pencil size={15} />
                    Edit configuration
                  </button>

                  <button
                    className="level-toggle-btn"
                    onClick={() => toggleStatus(level)}
                    title={level.status === "ACTIVE" ? "Deactivate level" : "Activate level"}
                  >
                    {level.status === "ACTIVE" ? "Deactivate" : "Activate"}
                  </button>
                </div>
              </article>
            );
          })}
        </div>
      </section>

      {/* Question allocation */}
      <section className="levels-section allocation-panel">
        <div className="levels-section-heading">
          <div>
            <h2>Question Allocation Rules</h2>
            <p>Question difficulty is determined by the participant's academic year.</p>
          </div>
          <BookOpen size={21} />
        </div>

        <div className="allocation-grid">
          <div className="allocation-item">
            <span className="allocation-year">1st Year</span>
            <strong className="easy-tag">EASY</strong>
            <p>One question per level</p>
          </div>

          <div className="allocation-item">
            <span className="allocation-year">2nd Year</span>
            <strong className="hard-tag">HARD</strong>
            <p>One question per level</p>
          </div>

          <div className="allocation-item">
            <span className="allocation-year">3rd Year</span>
            <strong className="hard-tag">HARD</strong>
            <p>One question per level</p>
          </div>

          <div className="allocation-item">
            <span className="allocation-year">4th Year</span>
            <strong className="hard-tag">HARD</strong>
            <p>One question per level</p>
          </div>
        </div>

        <div className="allocation-note">
          Each participant receives one assigned question per level. Refreshing the page must not assign a new question.
        </div>
      </section>

      {/* Rules */}
      <section className="levels-section rules-panel">
        <div className="levels-section-heading">
          <div>
            <h2>Competition Rules</h2>
            <p>Overview of the competition progression model.</p>
          </div>
          <Settings2 size={21} />
        </div>

        <div className="rules-list">
          <div>
            <CheckCircle2 size={17} />
            Six progressive competition levels.
          </div>
          <div>
            <CheckCircle2 size={17} />
            Participants are evaluated as PASS or FAIL.
          </div>
          <div>
            <CheckCircle2 size={17} />
            Wallet balance determines eligibility for the next level.
          </div>
          <div>
            <CheckCircle2 size={17} />
            Participants who cannot afford the next level retain their remaining balance.
          </div>
          <div>
            <CheckCircle2 size={17} />
            Clearing Level 6 marks the participant as COMPLETED.
          </div>
        </div>

        <p className="rules-disclaimer">
          Entry fees, rewards and final timer rules are pending confirmation from the event team.
        </p>
      </section>

      {/* Edit modal */}
      {editingLevel && (
        <div
          className="level-modal-overlay"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) {
              setEditingLevel(null);
            }
          }}
        >
          <div className="level-modal">
            <div className="level-modal-header">
              <div>
                <span className="levels-eyebrow">LEVEL CONFIGURATION</span>
                <h2>Edit {editingLevel.name}</h2>
              </div>

              <button
                className="level-modal-close"
                onClick={() => setEditingLevel(null)}
                aria-label="Close"
              >
                <X size={20} />
              </button>
            </div>

            <form onSubmit={saveLevel}>
              <div className="level-form-grid">
                <label>
                  Entry fee (₹)
                  <input
                    type="number"
                    min="0"
                    value={editingLevel.entryFee}
                    placeholder="Enter amount"
                    onChange={(e) => updateField("entryFee", e.target.value)}
                  />
                </label>

                <label>
                  Pass reward (₹)
                  <input
                    type="number"
                    min="0"
                    value={editingLevel.passReward}
                    placeholder="Enter amount"
                    onChange={(e) => updateField("passReward", e.target.value)}
                  />
                </label>

                <label>
                  Timer duration (minutes)
                  <input
                    type="number"
                    min="1"
                    max="60"
                    step="any"
                    required
                    value={editingLevel.duration}
                    onChange={(e) => updateField("duration", Number(e.target.value))}
                  />
                </label>

                <label>
                  EASY questions available
                  <input
                    type="number"
                    min="0"
                    value={editingLevel.easy}
                    readOnly
                  />
                </label>

                <label>
                  HARD questions available
                  <input
                    type="number"
                    min="0"
                    value={editingLevel.hard}
                    readOnly
                  />
                </label>
              </div>

              <div className="level-form-note">
                Question counts are derived from active questions. Entry amount, payout and timer settings are saved using the backend level configuration.
              </div>

              <div className="level-modal-actions">
                <button
                  type="button"
                  className="level-cancel-btn"
                  onClick={() => setEditingLevel(null)}
                >
                  Cancel
                </button>

                <button type="submit" className="level-save-btn" disabled={saving}>
                  <Save size={16} />
                  {saving ? "Saving…" : "Save changes"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

function OverviewCard({ icon, label, value }) {
  return (
    <div className="levels-overview-card">
      <div className="levels-overview-icon">{icon}</div>
      <div>
        <span>{label}</span>
        <strong>{value}</strong>
      </div>
    </div>
  );
}

function WalletIcon() {
  return <span className="rupee-symbol">₹</span>;
}
