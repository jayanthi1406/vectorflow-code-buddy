import { useState } from "react";
import {
  Plus,
  Search,
  Pencil,
  Trash2,
  X,
  BookOpen,
} from "lucide-react";
import "./questions.css";

const initialQuestions = [
  {
    id: 1,
    number: "Q001",
    title: "Sum of Digits",
    level: 1,
    difficulty: "EASY",
    statement: "Find the sum of all digits of a given integer.",
    constraints: "1 <= N <= 1000000",
    sampleInput: "123",
    sampleOutput: "6",
    assigned: false,
  },
  {
    id: 2,
    number: "Q002",
    title: "Reverse a Number",
    level: 1,
    difficulty: "HARD",
    statement: "Reverse the digits of a given integer.",
    constraints: "0 <= N <= 100000000",
    sampleInput: "1234",
    sampleOutput: "4321",
    assigned: false,
  },
  {
    id: 3,
    number: "Q003",
    title: "Find Maximum Element",
    level: 2,
    difficulty: "EASY",
    statement: "Find the largest element in an array.",
    constraints: "1 <= N <= 1000",
    sampleInput: "5\n2 8 1 9 4",
    sampleOutput: "9",
    assigned: false,
  },
];

const emptyForm = {
  title: "",
  level: 1,
  difficulty: "EASY",
  statement: "",
  constraints: "",
  sampleInput: "",
  sampleOutput: "",
};

export default function QuestionManagement() {
  const [questions, setQuestions] = useState(initialQuestions);
  const [search, setSearch] = useState("");
  const [difficulty, setDifficulty] = useState("ALL");
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState(emptyForm);

  const filteredQuestions = questions.filter((question) => {
    const matchesSearch =
      question.title.toLowerCase().includes(search.toLowerCase()) ||
      question.number.toLowerCase().includes(search.toLowerCase());

    const matchesDifficulty =
      difficulty === "ALL" ||
      question.difficulty === difficulty;

    return matchesSearch && matchesDifficulty;
  });

  const openAddForm = () => {
    setEditingId(null);
    setForm({ ...emptyForm });
    setShowForm(true);
  };

  const openEditForm = (question) => {
    setEditingId(question.id);

    setForm({
      title: question.title,
      level: question.level,
      difficulty: question.difficulty,
      statement: question.statement,
      constraints: question.constraints,
      sampleInput: question.sampleInput,
      sampleOutput: question.sampleOutput,
    });

    setShowForm(true);
  };

  const closeForm = () => {
    setShowForm(false);
    setEditingId(null);
    setForm({ ...emptyForm });
  };

  const handleSave = (event) => {
    event.preventDefault();

    if (editingId !== null) {
      setQuestions((previous) =>
        previous.map((question) =>
          question.id === editingId
            ? { ...question, ...form, level: Number(form.level) }
            : question
        )
      );
    } else {
      const nextNumber =
        Math.max(
          0,
          ...questions.map((question) =>
            Number(question.number.replace("Q", "")) || 0
          )
        ) + 1;

      const newQuestion = {
        ...form,
        id: Date.now(),
        number: `Q${String(nextNumber).padStart(3, "0")}`,
        level: Number(form.level),
        assigned: false,
      };

      setQuestions((previous) => [...previous, newQuestion]);
    }

    closeForm();
  };

  const handleDelete = (question) => {
    if (question.assigned) {
      alert("This question is assigned and cannot be deleted.");
      return;
    }

    const confirmed = window.confirm(
      `Are you sure you want to delete "${question.title}"?`
    );

    if (confirmed) {
      setQuestions((previous) =>
        previous.filter((item) => item.id !== question.id)
      );
    }
  };

  return (
    <div className="question-management">

      {/* PAGE HEADER */}
      <div className="question-page-header">
        <div>
          <span className="admin-eyebrow">
            COMPETITION MANAGEMENT
          </span>
          <h1>Question Bank.</h1>
          <p>
            Create, edit and manage coding questions across levels.
          </p>
        </div>

        <button
          className="question-add-btn"
          onClick={openAddForm}
        >
          <Plus size={18} />
          Add Question
        </button>
      </div>

      {/* STATISTICS */}
      <div className="question-summary">
        <div className="question-summary-card">
          <span>Total Questions</span>
          <strong>{questions.length}</strong>
        </div>

        <div className="question-summary-card">
          <span>Easy Questions</span>
          <strong>
            {questions.filter((q) => q.difficulty === "EASY").length}
          </strong>
        </div>

        <div className="question-summary-card">
          <span>Hard Questions</span>
          <strong>
            {questions.filter((q) => q.difficulty === "HARD").length}
          </strong>
        </div>
      </div>

      {/* SEARCH AND FILTER */}
      <div className="question-toolbar">
        <div className="question-search">
          <Search size={18} />

          <input
            type="text"
            placeholder="Search by question title or ID..."
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
        </div>

        <select
          value={difficulty}
          onChange={(event) => setDifficulty(event.target.value)}
        >
          <option value="ALL">All Difficulties</option>
          <option value="EASY">Easy</option>
          <option value="HARD">Hard</option>
        </select>
      </div>

      {/* QUESTION TABLE */}
      <div className="question-table-container">
        <div className="question-table-heading">
          <div>
            <BookOpen size={20} />
            <h2>All Questions</h2>
          </div>

          <span>{filteredQuestions.length} questions</span>
        </div>

        <div className="question-table-scroll">
          <table className="question-table">
            <thead>
              <tr>
                <th>QUESTION ID</th>
                <th>TITLE</th>
                <th>LEVEL</th>
                <th>DIFFICULTY</th>
                <th>STATUS</th>
                <th>ACTIONS</th>
              </tr>
            </thead>

            <tbody>
              {filteredQuestions.map((question) => (
                <tr key={question.id}>
                  <td>{question.number}</td>

                  <td>
                    <strong>{question.title}</strong>
                  </td>

                  <td>Level {question.level}</td>

                  <td>
                    <span
                      className={`question-difficulty ${question.difficulty.toLowerCase()}`}
                    >
                      {question.difficulty}
                    </span>
                  </td>

                  <td>
                    <span
                      className={
                        question.assigned
                          ? "question-status assigned"
                          : "question-status available"
                      }
                    >
                      {question.assigned ? "Assigned" : "Available"}
                    </span>
                  </td>

                  <td>
                    <div className="question-actions">
                      <button
                        title="Edit question"
                        onClick={() => openEditForm(question)}
                      >
                        <Pencil size={16} />
                      </button>

                      <button
                        title="Delete question"
                        disabled={question.assigned}
                        onClick={() => handleDelete(question)}
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}

              {filteredQuestions.length === 0 && (
                <tr>
                  <td colSpan="6" className="question-empty">
                    No questions found. Try another search or add a question.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* ADD / EDIT FORM */}
      {showForm && (
        <div className="question-modal-overlay">
          <div className="question-modal">

            <div className="question-modal-header">
              <div>
                <span className="admin-eyebrow">
                  QUESTION MANAGEMENT
                </span>

                <h2>
                  {editingId !== null
                    ? "Edit Question"
                    : "Add New Question"}
                </h2>
              </div>

              <button
                type="button"
                className="question-close-btn"
                onClick={closeForm}
              >
                <X size={21} />
              </button>
            </div>

            <form onSubmit={handleSave}>
              <div className="question-form-grid">

                <div className="question-form-field full-width">
                  <label>Question Title</label>
                  <input
                    type="text"
                    placeholder="Enter question title"
                    value={form.title}
                    onChange={(event) =>
                      setForm({ ...form, title: event.target.value })
                    }
                    required
                  />
                </div>

                <div className="question-form-field">
                  <label>Competition Level</label>
                  <input
                    type="number"
                    min="1"
                    value={form.level}
                    onChange={(event) =>
                      setForm({ ...form, level: event.target.value })
                    }
                    required
                  />
                </div>

                <div className="question-form-field">
                  <label>Difficulty</label>
                  <select
                    value={form.difficulty}
                    onChange={(event) =>
                      setForm({ ...form, difficulty: event.target.value })
                    }
                  >
                    <option value="EASY">Easy</option>
                    <option value="HARD">Hard</option>
                  </select>
                </div>

                <div className="question-form-field full-width">
                  <label>Problem Statement</label>
                  <textarea
                    rows="4"
                    placeholder="Describe the coding problem..."
                    value={form.statement}
                    onChange={(event) =>
                      setForm({ ...form, statement: event.target.value })
                    }
                    required
                  />
                </div>

                <div className="question-form-field full-width">
                  <label>Constraints</label>
                  <textarea
                    rows="2"
                    placeholder="Enter input constraints"
                    value={form.constraints}
                    onChange={(event) =>
                      setForm({ ...form, constraints: event.target.value })
                    }
                  />
                </div>

                <div className="question-form-field">
                  <label>Sample Input</label>
                  <textarea
                    rows="3"
                    placeholder="Enter sample input"
                    value={form.sampleInput}
                    onChange={(event) =>
                      setForm({ ...form, sampleInput: event.target.value })
                    }
                    required
                  />
                </div>

                <div className="question-form-field">
                  <label>Sample Output</label>
                  <textarea
                    rows="3"
                    placeholder="Enter sample output"
                    value={form.sampleOutput}
                    onChange={(event) =>
                      setForm({ ...form, sampleOutput: event.target.value })
                    }
                    required
                  />
                </div>

              </div>

              <div className="question-form-actions">
                <button
                  type="button"
                  className="question-cancel-btn"
                  onClick={closeForm}
                >
                  Cancel
                </button>

                <button
                  type="submit"
                  className="question-save-btn"
                >
                  {editingId !== null
                    ? "Save Changes"
                    : "Add Question"}
                </button>
              </div>
            </form>

          </div>
        </div>
      )}

    </div>
  );
}