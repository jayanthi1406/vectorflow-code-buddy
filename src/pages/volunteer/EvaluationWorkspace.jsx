import {
  Users,
  CheckCircle2,
  XCircle,
  ClipboardCheck,
  Clock3,
  Code2,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import {
  evaluateVolunteerStudentRound,
  extendVolunteerStudentRound,
  getVolunteerStudentRound,
  progressVolunteerStudentRound,
  settleVolunteerStudentRound,
  startVolunteerStudentRound,
} from "../../services/volunteerRoundService";
import TimerPanel from "./TimerPanel";
import "./evaluation.css";

function isRecord(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isValidLookupResult(value) {
  const student = value?.student;
  const round = value?.round;
  const question = round?.question;

  return (
    value?.success === true &&
    isRecord(student) &&
    typeof student.usn === "string" &&
    isRecord(round) &&
    typeof round.levelNumber === "number" &&
    isRecord(question) &&
    typeof question.title === "string" &&
    typeof question.statement === "string" &&
    Array.isArray(question.constraints) &&
    Array.isArray(question.examples)
  );
}

function displayValue(value) {
  if (value === null || value === undefined || value === "") return "Not provided";
  return typeof value === "string" ? value : JSON.stringify(value);
}

function getErrorMessage(error) {
  if (error?.kind === "network") {
    return `Network error. Check the connection and retry. ${error.message || ""}`.trim();
  }
  if (typeof error?.status === "number" && error.status >= 500) {
    return `The server could not complete the request. ${error.message || "Please retry."}`;
  }
  return error?.message || "The round action could not be completed. Please retry.";
}

export default function EvaluationWorkspace() {
  const location = useLocation();
  const navigate = useNavigate();
  const lookupResult = location.state?.lookupResult;
  const [workspaceResult, setWorkspaceResult] = useState(() =>
    isValidLookupResult(lookupResult) ? lookupResult : null,
  );
  const [activeAction, setActiveAction] = useState("");
  const activeActionRef = useRef("");
  const [actionError, setActionError] = useState("");
  const [actionMessage, setActionMessage] = useState("");
  const [remarks, setRemarks] = useState("");
  const [programmingLanguage, setProgrammingLanguage] = useState("");

  useEffect(() => {
    setWorkspaceResult(isValidLookupResult(lookupResult) ? lookupResult : null);
    setActionError("");
    setActionMessage("");
  }, [location.key, lookupResult]);

  const hasLookupResult = isValidLookupResult(workspaceResult);
  const student = hasLookupResult ? workspaceResult.student : null;
  const round = hasLookupResult ? workspaceResult.round : null;
  const question = hasLookupResult ? round.question : null;
  const evaluation = isRecord(workspaceResult?.evaluation)
    ? workspaceResult.evaluation
    : null;
  const progression = isRecord(workspaceResult?.progression)
    ? workspaceResult.progression
    : null;
  const settlement = isRecord(workspaceResult?.settlement)
    ? workspaceResult.settlement
    : null;
  const hasEvaluation =
    isRecord(evaluation) && ["PASS", "FAIL"].includes(evaluation.status);
  const isSettled = evaluation?.isSettled === true;
  const isProgressed = evaluation?.isProgressed === true || Boolean(progression);
  const isBusy = Boolean(activeAction);
  const roundStatus = round?.status;
  const canStart = hasLookupResult && roundStatus === "ready";
  const canExtend =
    hasLookupResult && roundStatus === "inProgress" && round.isExpired !== true;
  const canEvaluate =
    hasLookupResult &&
    ["inProgress", "timeExpired"].includes(roundStatus) &&
    !hasEvaluation;
  const canSettle = hasLookupResult && hasEvaluation && !isSettled;
  const canProgress = hasLookupResult && hasEvaluation && !isProgressed;
  const studentName = typeof student?.name === "string" ? student.name.trim() : "";
  const participantDisplayName = studentName || student?.usn || "";

  async function runAction(actionName, operation) {
    if (activeActionRef.current || !student?.usn) return null;

    activeActionRef.current = actionName;
    setActiveAction(actionName);
    setActionError("");
    setActionMessage("");

    try {
      const response = await operation(student.usn);
      if (!isValidLookupResult(response)) {
        const invalidResponse = new Error(
          "The server returned an incomplete round response.",
        );
        invalidResponse.kind = "invalid_response";
        throw invalidResponse;
      }
      setWorkspaceResult(response);
      setActionMessage(
        typeof response.message === "string" && response.message.trim()
          ? response.message
          : "The round state was updated.",
      );
      return response;
    } catch (error) {
      let message = getErrorMessage(error);

      if (error?.status === 409 || error?.kind === "invalid_response") {
        try {
          const refreshed = await getVolunteerStudentRound(student.usn);
          if (isValidLookupResult(refreshed)) {
            setWorkspaceResult(refreshed);
          } else {
            message += " The participant state could not be refreshed.";
          }
        } catch (refreshError) {
          message += ` Participant state refresh failed: ${getErrorMessage(refreshError)}`;
        }
      }

      setActionError(message);
      return null;
    } finally {
      activeActionRef.current = "";
      setActiveAction("");
    }
  }

  function handleStart() {
    if (!canStart) return null;
    return runAction("start", (usn) => startVolunteerStudentRound(usn));
  }

  function handleExtend(extensionSeconds, reason) {
    if (!canExtend) return null;
    return runAction("extend", (usn) =>
      extendVolunteerStudentRound(usn, {
        extensionSeconds,
        ...(reason ? { reason } : {}),
      }),
    );
  }

  function handleEvaluate(result) {
    if (!canEvaluate) return null;
    const optionalRemarks = remarks.trim();
    const optionalLanguage = programmingLanguage.trim();
    return runAction("evaluate", (usn) =>
      evaluateVolunteerStudentRound(usn, {
        result,
        ...(optionalRemarks ? { remarks: optionalRemarks } : {}),
        ...(optionalLanguage ? { programmingLanguage: optionalLanguage } : {}),
      }),
    );
  }

  function handleSettle() {
    if (!canSettle) return null;
    return runAction("settle", (usn) => settleVolunteerStudentRound(usn));
  }

  function handleProgress() {
    if (!canProgress) return null;
    return runAction("progress", (usn) => progressVolunteerStudentRound(usn));
  }

  return (
    <div className="evaluation-page">
      <div className="evaluation-header">
        <div>
          <span className="evaluation-eyebrow">VOLUNTEER / EVALUATION</span>
          <h1>Evaluation Workspace</h1>
          <p>Manage participant rounds and record evaluation outcomes.</p>
        </div>
      </div>

      <div className="evaluation-demo-note" role="status">
        {hasLookupResult
          ? "Participant and round details were loaded from the Dashboard USN lookup."
          : lookupResult
            ? "The participant lookup response is incomplete. Return to the Dashboard and retry the USN lookup."
            : "Look up a participant by USN from the Volunteer Dashboard to view their round."}
      </div>

      {actionError && (
        <div className="evaluation-demo-note" role="alert">
          {actionError}
        </div>
      )}
      {actionMessage && (
        <div className="evaluation-demo-note" role="status">
          {actionMessage}
        </div>
      )}

      <div className="evaluation-stats">
        <div className="evaluation-stat-card">
          <Users size={20} />
          <div>
            <span>Assigned Participants</span>
            <strong>N/A</strong>
          </div>
        </div>

        <div className="evaluation-stat-card">
          <Clock3 size={20} />
          <div>
            <span>Pending Evaluation</span>
            <strong>N/A</strong>
          </div>
        </div>

        <div className="evaluation-stat-card">
          <ClipboardCheck size={20} />
          <div>
            <span>Evaluated</span>
            <strong>N/A</strong>
          </div>
        </div>
      </div>

      <div className="evaluation-layout">
        <section className="evaluation-panel participant-selector">
          <div className="evaluation-panel-heading">
            <div>
              <h2>Selected Participant</h2>
              <p>Participant details from the Dashboard lookup.</p>
            </div>
          </div>

          {hasLookupResult ? (
            <div className="evaluation-participant-list">
              <div className="evaluation-participant selected">
                <div className="evaluation-avatar">
                  {participantDisplayName.slice(0, 1).toUpperCase()}
                </div>
                <div className="evaluation-participant-info">
                  <strong>{participantDisplayName}</strong>
                  <span>{student.usn}</span>
                </div>
                <span className="evaluation-status pending">
                  {progression ? "Progression applied" : `Level ${round.levelNumber}`}
                </span>
              </div>
            </div>
          ) : (
            <div className="evaluation-empty" role="status">
              <div className="evaluation-empty-icon">
                <Users size={27} />
              </div>
              <h2>Participant lookup required</h2>
              <p>
                {lookupResult
                  ? "The returned participant or round details could not be validated."
                  : "No participant was passed from the Dashboard."}
              </p>
              <button
                type="button"
                className="evaluation-primary-btn"
                onClick={() => navigate("/volunteer/dashboard")}
              >
                Return to Volunteer Dashboard
              </button>
            </div>
          )}
        </section>

        <section className="evaluation-panel evaluation-main">
          {!hasLookupResult && (
            <div className="evaluation-empty" role="status">
              <div className="evaluation-empty-icon">
                <Users size={27} />
              </div>
              <h2>No participant selected</h2>
              <p>Return to the Volunteer Dashboard and look up a participant by USN.</p>
              <button
                type="button"
                className="evaluation-primary-btn"
                onClick={() => navigate("/volunteer/dashboard")}
              >
                Return to Volunteer Dashboard
              </button>
            </div>
          )}

          <div className="evaluation-selected-header">
            <div>
              <span className="evaluation-eyebrow">PARTICIPANT AND ROUND</span>
              <h2>{hasLookupResult ? participantDisplayName : "Details unavailable"}</h2>
              <p>
                {hasLookupResult
                  ? `${student.usn} · Round status: ${displayValue(round.status)} · Student level: ${displayValue(student.currentLevel)}`
                  : "Round details will appear after a valid Dashboard lookup."}
              </p>
            </div>
          </div>

          {hasLookupResult && (
            <div className="evaluation-question">
              <div className="evaluation-question-heading">
                <div>
                  <span className="evaluation-eyebrow">
                    {progression ? "EVALUATED ROUND" : "ROUND DETAILS"}
                  </span>
                  <h2>Level {round.levelNumber}</h2>
                </div>
              </div>
              <p>
                Year: {displayValue(student.year)} · Competition status: {displayValue(student.competitionStatus)} · Round availability: {displayValue(student.roundAvailability)}
              </p>
              {progression && (
                <p role="status">
                  {workspaceResult.message} Evaluated level {displayValue(progression.evaluatedLevel)}; result {displayValue(progression.evaluationResult)}.
                  {progression.advancedToLevel !== null &&
                  progression.advancedToLevel !== undefined
                    ? ` Advanced to Level ${progression.advancedToLevel}.`
                    : progression.isCompleted
                      ? " Competition completed."
                      : progression.isEliminated
                        ? " Participant eliminated."
                        : " No next level was allocated by this response."}
                </p>
              )}
              {settlement && (
                <div className="evaluation-example">
                  <strong>Wallet settlement</strong>
                  <p>Evaluation result: {displayValue(settlement.evaluationResult)}</p>
                  <p>
                    Previous balance: {displayValue(settlement.previousWalletBalance)} · Target balance: {displayValue(settlement.targetBalance)} · Change: {displayValue(settlement.deltaAmount)}
                  </p>
                  <p>
                    Safe zone: {displayValue(settlement.isSafeZone)}
                    {typeof settlement.didSettleNow === "boolean"
                      ? ` · Settled during progression: ${settlement.didSettleNow}`
                      : ""}
                  </p>
                </div>
              )}
            </div>
          )}

          <div className="evaluation-question">
            <div className="evaluation-question-heading">
              <div>
                <span className="evaluation-eyebrow">ASSIGNED QUESTION</span>
                <h2>{hasLookupResult ? question.title : "Question details unavailable"}</h2>
              </div>
            </div>
            <p>
              {hasLookupResult
                ? question.statement
                : "The public question snapshot will appear after a valid Dashboard lookup. No sample question data is shown here."}
            </p>
            {hasLookupResult && (
              <>
                <p>Difficulty: {displayValue(question.difficulty)}</p>
                <div className="evaluation-example">
                  <strong>Constraints</strong>
                  {question.constraints.length ? (
                    <ul>
                      {question.constraints.map((constraint, index) => (
                        <li key={index}>{displayValue(constraint)}</li>
                      ))}
                    </ul>
                  ) : (
                    <p>No constraints provided.</p>
                  )}
                </div>
                {question.examples.map((example, index) => (
                  <div className="evaluation-example" key={index}>
                    <strong>Example {index + 1}</strong>
                    <pre>{displayValue(example)}</pre>
                  </div>
                ))}
              </>
            )}
          </div>

          {hasLookupResult && (
            <TimerPanel
              levelNumber={round.levelNumber}
              roundStatus={roundStatus}
              remainingSeconds={round.remainingSeconds}
              deadline={round.deadline}
              isExpired={round.isExpired}
              canStart={canStart}
              canExtend={canExtend}
              isStarting={activeAction === "start"}
              isExtending={activeAction === "extend"}
              isBusy={isBusy}
              onStart={handleStart}
              onExtend={handleExtend}
            />
          )}

          <div className="evaluation-decision">
            <h3>{hasEvaluation ? "Evaluation Result" : "Record Evaluation"}</h3>
            {hasEvaluation ? (
              <p>
                Result: <strong>{evaluation.status}</strong>
                {evaluation.volunteerNotes ? ` · ${evaluation.volunteerNotes}` : ""}
                {evaluation.programmingLanguage
                  ? ` · ${evaluation.programmingLanguage}`
                  : ""}
              </p>
            ) : (
              <p>
                {canEvaluate
                  ? "Record the backend evaluation result for this round."
                  : "Evaluation is available only while the round is in progress or time expired."}
              </p>
            )}

            <div className="evaluation-example">
              <strong>
                <label htmlFor="evaluation-remarks">Remarks (optional)</label>
              </strong>
              <div className="vol-search">
                <input
                  id="evaluation-remarks"
                  name="remarks"
                  type="text"
                  maxLength={1000}
                  placeholder="Add evaluation remarks"
                  aria-label="Evaluation remarks, optional, up to 1000 characters"
                  value={remarks}
                  onChange={(event) => setRemarks(event.target.value)}
                  disabled={!canEvaluate || isBusy}
                />
              </div>
            </div>

            <div className="evaluation-example">
              <strong>
                <label htmlFor="evaluation-language">
                  Programming language (optional)
                </label>
              </strong>
              <div className="vol-search">
                <input
                  id="evaluation-language"
                  name="programmingLanguage"
                  type="text"
                  maxLength={50}
                  placeholder="Programming language"
                  aria-label="Programming language, optional, up to 50 characters"
                  value={programmingLanguage}
                  onChange={(event) => setProgrammingLanguage(event.target.value)}
                  disabled={!canEvaluate || isBusy}
                />
              </div>
            </div>

            {!hasEvaluation && (
              <div className="evaluation-decision-buttons">
                <button
                  type="button"
                  className="evaluation-pass-btn"
                  disabled={!canEvaluate || isBusy}
                  onClick={() => handleEvaluate("PASS")}
                >
                  <CheckCircle2 size={17} />
                  {activeAction === "evaluate" ? "Submitting…" : "Mark as PASS"}
                </button>

                <button
                  type="button"
                  className="evaluation-fail-btn"
                  disabled={!canEvaluate || isBusy}
                  onClick={() => handleEvaluate("FAIL")}
                >
                  <XCircle size={17} />
                  {activeAction === "evaluate" ? "Submitting…" : "Mark as FAIL"}
                </button>
              </div>
            )}

            {hasEvaluation && (
              <div className="evaluation-decision-buttons">
                <button
                  type="button"
                  className="evaluation-pass-btn"
                  disabled={!canSettle || isBusy}
                  onClick={handleSettle}
                >
                  <CheckCircle2 size={17} />
                  {activeAction === "settle"
                    ? "Settling…"
                    : isSettled
                      ? "Wallet settled"
                      : "Settle wallet"}
                </button>
                <button
                  type="button"
                  className="evaluation-fail-btn"
                  disabled={!canProgress || isBusy}
                  onClick={handleProgress}
                >
                  <Code2 size={17} />
                  {activeAction === "progress"
                    ? "Applying progression…"
                    : isProgressed
                      ? "Progression applied"
                      : "Progress (settles if needed)"}
                </button>
              </div>
            )}
          </div>
        </section>
      </div>

      <div className="evaluation-footer-note">
        <Code2 size={17} />
        <span>
          Round status, timer state, evaluation, settlement, and progression are taken from backend responses.
        </span>
      </div>
    </div>
  );
}
