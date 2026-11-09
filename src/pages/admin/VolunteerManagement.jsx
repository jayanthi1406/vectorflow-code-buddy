import { useState } from "react";
import {
  Plus,
  Search,
  Pencil,
  Trash2,
  X,
  Users,
  UserCheck,
  UserX,
  Eye,
} from "lucide-react";
import "./volunteer.css";

const initialVolunteers = [
  {
    id: 1,
    name: "Meera Sharma",
    usn: "4VV23CS010",
    email: "meera@vvce.ac.in",
    assigned: 8,
    status: "ACTIVE",
  },
  {
    id: 2,
    name: "Arjun Rao",
    usn: "4VV23CS011",
    email: "arjun@vvce.ac.in",
    assigned: 6,
    status: "ACTIVE",
  },
  {
    id: 3,
    name: "Sneha Kumar",
    usn: "4VV23CS012",
    email: "sneha@vvce.ac.in",
    assigned: 0,
    status: "INACTIVE",
  },
];

const emptyForm = {
  name: "",
  usn: "",
  email: "",
  status: "ACTIVE",
};

export default function VolunteerManagement() {
  const [volunteers, setVolunteers] = useState(initialVolunteers);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [selectedVolunteer, setSelectedVolunteer] = useState(null);
  const [form, setForm] = useState(emptyForm);

  const filteredVolunteers = volunteers.filter((volunteer) => {
    const query = search.toLowerCase();

    const matchesSearch =
      volunteer.name.toLowerCase().includes(query) ||
      volunteer.usn.toLowerCase().includes(query) ||
      volunteer.email.toLowerCase().includes(query);

    const matchesStatus =
      statusFilter === "ALL" ||
      volunteer.status === statusFilter;

    return matchesSearch && matchesStatus;
  });

  const activeCount = volunteers.filter(
    (v) => v.status === "ACTIVE"
  ).length;

  const inactiveCount = volunteers.filter(
    (v) => v.status === "INACTIVE"
  ).length;

  const openAddForm = () => {
    setEditingId(null);
    setForm({ ...emptyForm });
    setShowForm(true);
  };

  const openEditForm = (volunteer) => {
    setEditingId(volunteer.id);
    setForm({
      name: volunteer.name,
      usn: volunteer.usn,
      email: volunteer.email,
      status: volunteer.status,
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
      setVolunteers((previous) =>
        previous.map((volunteer) =>
          volunteer.id === editingId
            ? { ...volunteer, ...form }
            : volunteer
        )
      );
    } else {
      setVolunteers((previous) => [
        ...previous,
        {
          id: Date.now(),
          ...form,
          assigned: 0,
        },
      ]);
    }

    closeForm();
  };

  const toggleStatus = (id) => {
    setVolunteers((previous) =>
      previous.map((volunteer) =>
        volunteer.id === id
          ? {
              ...volunteer,
              status:
                volunteer.status === "ACTIVE"
                  ? "INACTIVE"
                  : "ACTIVE",
            }
          : volunteer
      )
    );
  };

  const handleDelete = (volunteer) => {
    if (volunteer.assigned > 0) {
      alert(
        "Reassign this volunteer's students before deleting the account."
      );
      return;
    }

    if (window.confirm(`Delete ${volunteer.name}?`)) {
      setVolunteers((previous) =>
        previous.filter((item) => item.id !== volunteer.id)
      );
    }
  };

  return (
    <div className="volunteer-management">

      <div className="volunteer-page-header">
        <div>
          <span className="admin-eyebrow">
            COMPETITION MANAGEMENT
          </span>
          <h1>Volunteer Management.</h1>
          <p>
            Manage volunteer accounts and competition assignments.
          </p>
        </div>

        <button
          className="volunteer-add-btn"
          onClick={openAddForm}
        >
          <Plus size={18} />
          Add Volunteer
        </button>
      </div>

      <div className="volunteer-summary">
        <div>
          <Users size={21} />
          <span>Total Volunteers</span>
          <strong>{volunteers.length}</strong>
        </div>

        <div>
          <UserCheck size={21} />
          <span>Active Volunteers</span>
          <strong>{activeCount}</strong>
        </div>

        <div>
          <UserX size={21} />
          <span>Inactive Volunteers</span>
          <strong>{inactiveCount}</strong>
        </div>
      </div>

      <div className="volunteer-toolbar">
        <div className="volunteer-search">
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
          <option value="INACTIVE">Inactive</option>
        </select>
      </div>

      <div className="volunteer-table-container">
        <div className="volunteer-table-heading">
          <h2>Volunteer Directory</h2>
          <span>{filteredVolunteers.length} volunteers</span>
        </div>

        <div className="volunteer-table-scroll">
          <table className="volunteer-table">
            <thead>
              <tr>
                <th>VOLUNTEER</th>
                <th>USN</th>
                <th>ASSIGNED STUDENTS</th>
                <th>STATUS</th>
                <th>ACTIONS</th>
              </tr>
            </thead>

            <tbody>
              {filteredVolunteers.map((volunteer) => (
                <tr key={volunteer.id}>
                  <td>
                    <strong>{volunteer.name}</strong>
                    <small>{volunteer.email}</small>
                  </td>

                  <td>{volunteer.usn}</td>
                  <td>{volunteer.assigned}</td>

                  <td>
                    <span
                      className={`volunteer-status ${volunteer.status.toLowerCase()}`}
                    >
                      {volunteer.status}
                    </span>
                  </td>

                  <td>
                    <div className="volunteer-actions">
                      <button
                        title="View details"
                        onClick={() =>
                          setSelectedVolunteer(volunteer)
                        }
                      >
                        <Eye size={15} />
                      </button>

                      <button
                        title="Edit volunteer"
                        onClick={() => openEditForm(volunteer)}
                      >
                        <Pencil size={15} />
                      </button>

                      <button
                        title="Change account status"
                        onClick={() => toggleStatus(volunteer.id)}
                      >
                        {volunteer.status === "ACTIVE"
                          ? <UserX size={15} />
                          : <UserCheck size={15} />}
                      </button>

                      <button
                        title="Delete volunteer"
                        disabled={volunteer.assigned > 0}
                        onClick={() => handleDelete(volunteer)}
                      >
                        <Trash2 size={15} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}

              {filteredVolunteers.length === 0 && (
                <tr>
                  <td colSpan="5" className="volunteer-empty">
                    No volunteers found.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {showForm && (
        <div className="volunteer-modal-overlay">
          <div className="volunteer-modal">
            <div className="volunteer-modal-header">
              <div>
                <span className="admin-eyebrow">
                  VOLUNTEER ACCOUNTS
                </span>
                <h2>
                  {editingId !== null
                    ? "Edit Volunteer"
                    : "Add Volunteer"}
                </h2>
              </div>

              <button type="button" onClick={closeForm}>
                <X size={20} />
              </button>
            </div>

            <form onSubmit={handleSave}>
              <div className="volunteer-form-field">
                <label>Full Name</label>
                <input
                  value={form.name}
                  onChange={(event) =>
                    setForm({ ...form, name: event.target.value })
                  }
                  placeholder="Enter volunteer name"
                  required
                />
              </div>

              <div className="volunteer-form-field">
                <label>USN</label>
                <input
                  value={form.usn}
                  onChange={(event) =>
                    setForm({ ...form, usn: event.target.value })
                  }
                  placeholder="Enter USN"
                  required
                />
              </div>

              <div className="volunteer-form-field">
                <label>College Email</label>
                <input
                  type="email"
                  value={form.email}
                  onChange={(event) =>
                    setForm({ ...form, email: event.target.value })
                  }
                  placeholder="name@vvce.ac.in"
                  required
                />
              </div>

              <div className="volunteer-form-field">
                <label>Account Status</label>
                <select
                  value={form.status}
                  onChange={(event) =>
                    setForm({ ...form, status: event.target.value })
                  }
                >
                  <option value="ACTIVE">Active</option>
                  <option value="INACTIVE">Inactive</option>
                </select>
              </div>

              <div className="volunteer-form-actions">
                <button type="button" onClick={closeForm}>
                  Cancel
                </button>

                <button type="submit">
                  {editingId !== null
                    ? "Save Changes"
                    : "Add Volunteer"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {selectedVolunteer && (
        <div className="volunteer-modal-overlay">
          <div className="volunteer-modal">
            <div className="volunteer-modal-header">
              <div>
                <span className="admin-eyebrow">
                  VOLUNTEER DETAILS
                </span>
                <h2>{selectedVolunteer.name}</h2>
              </div>

              <button
                onClick={() => setSelectedVolunteer(null)}
              >
                <X size={20} />
              </button>
            </div>

            <div className="volunteer-detail-list">
              <div>
                <span>USN</span>
                <strong>{selectedVolunteer.usn}</strong>
              </div>

              <div>
                <span>Email</span>
                <strong>{selectedVolunteer.email}</strong>
              </div>

              <div>
                <span>Assigned Students</span>
                <strong>{selectedVolunteer.assigned}</strong>
              </div>

              <div>
                <span>Account Status</span>
                <strong>{selectedVolunteer.status}</strong>
              </div>
            </div>

            <button
              className="volunteer-close-btn"
              onClick={() => setSelectedVolunteer(null)}
            >
              Close
            </button>
          </div>
        </div>
      )}

    </div>
  );
}