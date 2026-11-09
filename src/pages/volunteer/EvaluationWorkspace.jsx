import { useState } from "react";
import {
  Users,
  Play,
  CheckCircle2,
  XCircle,
  ClipboardCheck,
  Clock3,
  Code2,
  RotateCcw,
} from "lucide-react";
import TimerPanel from "./TimerPanel";
import "./evaluation.css";

const initialParticipants = [
  {
    id: "4VV23CS001",
    name: "Aarav Sharma",
    level: 3,
    status: "PENDING",
    question: {
      title: "Sum of Array Elements",
      difficulty: "EASY",
      description:
        "Given an array of integers, calculate and print the sum of all its elements.",
      input: "5\n1 2 3 4 5",
      output: "15",
    },
  },
  {
    id: "4VV23CS002",
    name: "Ananya Rao",
    level: 5,
    status: "PENDING",
    question: {
      title: "Longest Substring Without Repeating Characters",
      difficulty: "HARD",
      description:
        "Given a string, find the length of the longest substring without repeating characters.",
      input: "abcabcbb",
      output: "3",
    },
  },
  {
    id: "4VV23CS003",
    name: "Rohan Kumar",
    level: 2,
    status: "PENDING",
    question: {
      title: "Check Prime Number",
      difficulty: "EASY",
      description:
        "Given an integer N, determine whether it is a prime number.",
      input: "7",
      output: "Prime",
    },
  },
  {
    id: "4VV23CS004",
    name: "Priya Nair",
    level: 4,
    status: "PENDING",
    question: {
      title: "Merge Overlapping Intervals",
      difficulty: "HARD",
      description:
        "Given a collection of intervals, merge all overlapping intervals.",
      input: "[[1,3],[2,6],[8,10]]",
      output: "[[1,6],[8,10]]",
    },
  },
];

export default function EvaluationWorkspace() {
  const [participants, setParticipants] = useState(initialParticipants);
  const [selectedId, setSelectedId] = useState("");
  const [roundStarted, setRoundStarted] = useState(false);
  const [result, setResult] = useState(null);

  const selectedParticipant = participants.find(
    (participant) => participant.id === selectedId
  );

  const pendingCount = participants.filter(
    (participant) => participant.status === "PENDING"
  ).length;

  const completedCount = participants.filter(
    (participant) => participant.status !== "PENDING"
  ).length;

  const startRound = () => {
    if (!selectedParticipant) return;

    setRoundStarted(true);
    setResult(null);
  };

  const submitEvaluation = (decision) => {
    setResult(decision);

    setParticipants((current) =>
      current.map((participant) =>
        participant.id === selectedId
          ? { ...participant, status: decision }
          : participant
      )
    );

    setRoundStarted(false);
  };

  const resetEvaluation = () => {
    setParticipants(initialParticipants);
    setSelectedId("");
    setRoundStarted(false);
    setResult(null);
  };

  return (
    <div className="evaluation-page">
      <div className="evaluation-header">
        <div>
          <span className="evaluation-eyebrow">
            VOLUNTEER / EVALUATION
          </span>
          <h1>Evaluation Workspace</h1>
          <p>
            Manage participant rounds and record evaluation outcomes.
          </p>
        </div>

        <button className="evaluation-reset-btn" onClick={resetEvaluation}>
          <RotateCcw size={15} />
          Reset demo
        </button>
      </div>

      <div className="evaluation-demo-note">
        Demo mode · Participant assignments and evaluation results are temporary.
      </div>

      {/* Statistics */}
      <div className="evaluation-stats">
        <div className="evaluation-stat-card">
          <Users size={20} />
          <div>
            <span>Assigned Participants</span>
            <strong>{participants.length}</strong>
          </div>
        </div>

        <div className="evaluation-stat-card">
          <Clock3 size={20} />
          <div>
            <span>Pending Evaluation</span>
            <strong>{pendingCount}</strong>
          </div>
        </div>

        <div className="evaluation-stat-card">
          <ClipboardCheck size={20} />
          <div>
            <span>Evaluated</span>
            <strong>{completedCount}</strong>
          </div>
        </div>
      </div>

      <div className="evaluation-layout">
        {/* Participant selection */}
        <section className="evaluation-panel participant-selector">
          <div className="evaluation-panel-heading">
            <div>
              <h2>Assigned Participants</h2>
              <p>Select a participant to begin evaluation.</p>
            </div>
          </div>

          <div className="evaluation-participant-list">
            {participants.map((participant) => (
              <button
                key={participant.id}
                className={`evaluation-participant ${
                  selectedId === participant.id ? "selected" : ""
                }`}
                onClick={() => {
                  setSelectedId(participant.id);
                  setRoundStarted(false);
                  setResult(null);
                }}
              >
                <div className="evaluation-avatar">
                  {participant.name.charAt(0)}
                </div>

                <div className="evaluation-participant-info">
                  <strong>{participant.name}</strong>
                  <span>{participant.id}</span>
                  <span>Level {participant.level}</span>
                </div>

                <span
                  className={`evaluation-status ${participant.status.toLowerCase()}`}
                >
                  {participant.status}
                </span>
              </button>
            ))}
          </div>
        </section>

        {/* Evaluation workspace */}
        <section className="evaluation-panel evaluation-main">
          {!selectedParticipant ? (
            <div className="evaluation-empty">
              <div className="evaluation-empty-icon">
                <Users size={27} />
              </div>
              <h2>No participant selected</h2>
              <p>
                Select a participant from the list to view their round details.
              </p>
            </div>
          ) : (
            <>
              <div className="evaluation-selected-header">
                <div>
                  <span className="evaluation-eyebrow">
                    SELECTED PARTICIPANT
                  </span>
                  <h2>{selectedParticipant.name}</h2>
                  <p>
                    {selectedParticipant.id} · Level{" "}
                    {selectedParticipant.level}
                  </p>
                </div>

                <span className="evaluation-level-tag">
                  LEVEL {selectedParticipant.level}
                </span>
              </div>

              {result ? (
                <div className={`evaluation-result ${result.toLowerCase()}`}>
                  {result === "PASS" ? (
                    <CheckCircle2 size={34} />
                  ) : (
                    <XCircle size={34} />
                  )}

                  <h2>{result === "PASS" ? "Evaluation Passed" : "Evaluation Failed"}</h2>
                  <p>
                    {result === "PASS"
                      ? "The participant has passed this demo evaluation."
                      : "The participant has failed this demo evaluation."}
                  </p>
                  <span>Demo result only — no wallet or progression update.</span>
                </div>
              ) : !roundStarted ? (
                <div className="evaluation-start-area">
                  <div className="evaluation-start-icon">
                    <Play size={25} />
                  </div>
                  <h2>Ready to start the round?</h2>
                  <p>
                    Start the round to reveal the assigned question and timer.
                  </p>

                  <button
                    className="evaluation-primary-btn"
                    onClick={startRound}
                  >
                    <Play size={16} />
                    Start Round
                  </button>
                </div>
              ) : (
                <>
                  <div className="evaluation-question">
                    <div className="evaluation-question-heading">
                      <div>
                        <span className="evaluation-eyebrow">
                          ASSIGNED QUESTION
                        </span>
                        <h2>{selectedParticipant.question.title}</h2>
                      </div>

                      <span
                        className={`evaluation-difficulty ${selectedParticipant.question.difficulty.toLowerCase()}`}
                      >
                        {selectedParticipant.question.difficulty}
                      </span>
                    </div>

                    <p>{selectedParticipant.question.description}</p>

                    <div className="evaluation-example">
                      <strong>Sample Input</strong>
                      <pre>{selectedParticipant.question.input}</pre>
                    </div>

                    <div className="evaluation-example">
                      <strong>Expected Output</strong>
                      <pre>{selectedParticipant.question.output}</pre>
                    </div>
                  </div>

                  <div className="evaluation-timer-section">
                    <h3>
                      <Clock3 size={17} />
                      Round Timer
                    </h3>
                    <TimerPanel level={selectedParticipant.level} />
                  </div>

                  <div className="evaluation-decision">
                    <h3>Record Evaluation</h3>
                    <p>Choose the outcome after checking the participant's solution.</p>

                    <div className="evaluation-decision-buttons">
                      <button
                        className="evaluation-pass-btn"
                        onClick={() => submitEvaluation("PASS")}
                      >
                        <CheckCircle2 size={17} />
                        Mark as PASS
                      </button>

                      <button
                        className="evaluation-fail-btn"
                        onClick={() => submitEvaluation("FAIL")}
                      >
                        <XCircle size={17} />
                        Mark as FAIL
                      </button>
                    </div>
                  </div>
                </>
              )}
            </>
          )}
        </section>
      </div>

      <div className="evaluation-footer-note">
        <Code2 size={17} />
        <span>
          Volunteers evaluate solutions in person. This workspace records a
          demo outcome; actual evaluation submission and participant progression
          will be handled by the backend.
        </span>
      </div>
    </div>
  );
}