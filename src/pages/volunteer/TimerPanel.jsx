import { useEffect, useMemo, useState } from "react";
import {
  Play,
  RotateCcw,
  Timer,
  AlertCircle,
  CheckCircle2,
  Plus,
} from "lucide-react";
import "./timer.css";

function formatTime(value) {
  const totalSeconds = Math.max(0, Math.floor(value));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;

  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

function formatDeadline(value) {
  if (!value) return "Unavailable";

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Unavailable";

  return date.toLocaleString();
}

export default function TimerPanel({
  levelNumber,
  roundStatus,
  remainingSeconds,
  deadline,
  isExpired,
  canStart = false,
  canExtend = false,
  isStarting = false,
  isExtending = false,
  isBusy = false,
  onStart,
  onExtend,
}) {
  const [now, setNow] = useState(() => Date.now());
  const [extensionSeconds, setExtensionSeconds] = useState("");
  const [extensionReason, setExtensionReason] = useState("");
  const [extensionError, setExtensionError] = useState("");

  useEffect(() => {
    if (roundStatus !== "inProgress" || isExpired === true || !deadline) return undefined;

    const intervalId = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(intervalId);
  }, [deadline, isExpired, roundStatus]);

  const deadlineMilliseconds = deadline ? new Date(deadline).getTime() : NaN;
  const hasDeadline = Number.isFinite(deadlineMilliseconds);
  const hasRemainingTime =
    typeof remainingSeconds === "number" && Number.isFinite(remainingSeconds);
  const isFinished = isExpired === true;
  const countdownSeconds = useMemo(() => {
    if (isFinished) return 0;
    if (roundStatus === "inProgress" && hasDeadline) {
      return Math.max(0, Math.ceil((deadlineMilliseconds - now) / 1000));
    }
    return hasRemainingTime ? Math.max(0, remainingSeconds) : null;
  }, [
    deadlineMilliseconds,
    hasDeadline,
    hasRemainingTime,
    isFinished,
    now,
    remainingSeconds,
    roundStatus,
  ]);
  const canDisplayCountdown = countdownSeconds !== null;
  const isAwaitingBackendExpiration =
    roundStatus === "inProgress" && countdownSeconds === 0 && !isFinished;
  const isWarning =
    canDisplayCountdown && !isFinished && countdownSeconds <= 30 && countdownSeconds > 0;
  const extensionValue = Number(extensionSeconds);
  const isValidExtension =
    extensionSeconds.trim() !== "" &&
    Number.isSafeInteger(extensionValue) &&
    extensionValue > 0;

  async function handleExtensionSubmit(event) {
    event.preventDefault();
    setExtensionError("");
    if (!canExtend || isBusy || !isValidExtension) {
      setExtensionError("Enter a positive whole number of seconds.");
      return;
    }

    const response = await onExtend?.(
      extensionValue,
      extensionReason.trim() || undefined,
    );
    if (response) {
      setExtensionSeconds("");
      setExtensionReason("");
    }
  }

  return (
    <section className="timer-panel" aria-busy={isStarting || isExtending}>
      <div className="timer-header">
        <div>
          <p className="timer-eyebrow">COMPETITION TIMER</p>
          <h2>{levelNumber ? `Level ${levelNumber} Timer` : "Round Timer"}</h2>
        </div>

        <div className="timer-icon">
          <Timer size={22} />
        </div>
      </div>

      <div
        className={`timer-display ${
          isWarning ? "timer-warning" : ""
        } ${isFinished ? "timer-finished" : ""}`}
      >
        <span className="timer-time">
          {canDisplayCountdown ? formatTime(countdownSeconds) : "--:--"}
        </span>

        <span className="timer-status">
          {isFinished
            ? "TIME COMPLETED"
            : isAwaitingBackendExpiration
              ? "AWAITING BACKEND STATUS"
              : canDisplayCountdown
                ? "TIME REMAINING"
                : roundStatus === "ready"
                  ? "READY TO START"
                  : "TIMER UNAVAILABLE"}
        </span>
      </div>

      {isWarning && (
        <div className="timer-message timer-message-warning">
          <AlertCircle size={16} />
          Less than 30 seconds remaining!
        </div>
      )}

      {isFinished && (
        <div className="timer-message timer-message-finished">
          <CheckCircle2 size={16} />
          Time is up!
        </div>
      )}

      {isAwaitingBackendExpiration && (
        <div className="timer-message">
          <AlertCircle size={16} />
          The display countdown reached zero; waiting for backend round status.
        </div>
      )}

      <div className="timer-controls">
        <button
          type="button"
          className="timer-primary-button"
          disabled={!canStart || isBusy}
          onClick={onStart}
        >
          <Play size={17} />
          {isStarting ? "Starting…" : "Start"}
        </button>

        <button
          type="button"
          className="timer-reset-button"
          disabled
          aria-disabled="true"
          title="Reset is not a supported backend operation"
        >
          <RotateCcw size={16} />
          Reset
        </button>
      </div>

      {canExtend && (
        <form
          className="vol-toolbar timer-extension-form"
          onSubmit={handleExtensionSubmit}
        >
          <div className="vol-search">
            <input
              id="timer-extension-seconds"
              name="extensionSeconds"
              type="number"
              min="1"
              step="1"
              placeholder="Extension seconds"
              aria-label="Timer extension in seconds"
              value={extensionSeconds}
              onChange={(event) => {
                setExtensionSeconds(event.target.value);
                setExtensionError("");
              }}
              disabled={isBusy}
              required
            />
          </div>
          <div className="vol-search">
            <input
              id="timer-extension-reason"
              name="reason"
              type="text"
              placeholder="Reason (optional)"
              aria-label="Timer extension reason (optional)"
              value={extensionReason}
              onChange={(event) => setExtensionReason(event.target.value)}
              disabled={isBusy}
            />
          </div>
          {extensionError && (
            <p className="form-error" role="alert">
              {extensionError}
            </p>
          )}
          <button
            type="submit"
            className="vol-filter"
            disabled={!isValidExtension || isBusy}
          >
            <Plus size={16} />
            {isExtending ? "Extending…" : "Extend time"}
          </button>
        </form>
      )}

      <div className="timer-duration-note">
        <span>{levelNumber ? `Level ${levelNumber}` : "Round"}</span>
        <span>Deadline: {formatDeadline(deadline)}</span>
      </div>
    </section>
  );
}
