import { useEffect, useState } from "react";
import {
  Play,
  Pause,
  RotateCcw,
  Timer,
  AlertCircle,
  CheckCircle2,
} from "lucide-react";
import "./timer.css";

export default function TimerPanel({ level = 1 }) {
  const duration = level <= 3 ? 180 : 300;

  const [seconds, setSeconds] = useState(duration);
  const [isRunning, setIsRunning] = useState(false);

  useEffect(() => {
    setIsRunning(false);
    setSeconds(duration);
  }, [duration]);

  useEffect(() => {
    if (!isRunning) return;

    const interval = setInterval(() => {
      setSeconds((previous) => {
        if (previous <= 1) {
          setIsRunning(false);
          return 0;
        }

        return previous - 1;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [isRunning]);

  const formatTime = (value) => {
    const minutes = Math.floor(value / 60);
    const remainingSeconds = value % 60;

    return `${String(minutes).padStart(2, "0")}:${String(
      remainingSeconds
    ).padStart(2, "0")}`;
  };

  const handleStartPause = () => {
    if (seconds === 0) return;
    setIsRunning((previous) => !previous);
  };

  const handleReset = () => {
    setIsRunning(false);
    setSeconds(duration);
  };

  const isWarning = seconds <= 30 && seconds > 0;
  const isFinished = seconds === 0;

  return (
    <section className="timer-panel">
      <div className="timer-header">
        <div>
          <p className="timer-eyebrow">COMPETITION TIMER</p>
          <h2>Level {level} Timer</h2>
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
          {formatTime(seconds)}
        </span>

        <span className="timer-status">
          {isFinished
            ? "TIME COMPLETED"
            : isRunning
            ? "TIMER RUNNING"
            : seconds === duration
            ? "READY TO START"
            : "TIMER PAUSED"}
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

      <div className="timer-controls">
        <button
          className="timer-primary-button"
          onClick={handleStartPause}
          disabled={isFinished}
        >
          {isRunning ? <Pause size={17} /> : <Play size={17} />}
          {isRunning ? "Pause" : "Start"}
        </button>

        <button
          className="timer-reset-button"
          onClick={handleReset}
        >
          <RotateCcw size={16} />
          Reset
        </button>
      </div>

      <div className="timer-duration-note">
        <span>Level {level}</span>
        <span>{duration / 60} minutes allotted</span>
      </div>
    </section>
  );
}