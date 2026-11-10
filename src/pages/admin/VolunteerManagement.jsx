import { useEffect, useMemo, useState } from "react";
import {
  Plus,
  Search,
  X,
  Users,
  UserCheck,
  UserX,
  Eye,
} from "lucide-react";
import {
  createAdminVolunteer,
  getAdminVolunteers,
  setAdminVolunteerActive,
} from "../../services/adminVolunteerService";
import "./volunteer.css";

const emptyForm = {
  name: "",
  username: "",
  password: "",
  assignedLab: "",
};

function statusLabel(volunteer) {
  return volunteer.isActive ? "ACTIVE" : "INACTIVE";
}

export default function VolunteerManagement() {
  const [volunteers, setVolunteers] = useState([]);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [showForm, setShowForm] = useState(false);
  const [selectedVolunteer, setSelectedVolunteer] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [updatingId, setUpdatingId] = useState(null);
  const [error, setError] = useState("");

  const loadVolunteers = async () => {
    setLoading(true);
    setError("");
    try {
      const data = await getAdminVolunteers();
      setVolunteers(data);
    } catch (loadError) {
      setError(loadError.message || "Could not load volunteers.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadVolunteers();
  }, []);

  const filteredVolunteers = useMemo(() => {
    const query = search.trim().toLowerCase();
    return volunteers.filter((volunteer) => {
      const matchesSearch = [volunteer.name, volunteer.username, volunteer.assignedLab]
        .some((value) => String(value || "").toLowerCase().includes(query));
      const matchesStatus = statusFilter === "ALL" || statusLabel(volunteer) === statusFilter;
      return matchesSearch && matchesStatus;
    });
  }, [volunteers, search, statusFilter]);

  const activeCount = volunteers.filter((volunteer) => volunteer.isActive).length;
  const inactiveCount = volunteers.length - activeCount;

  const openAddForm = () => {
    setForm({ ...emptyForm });
    setError("");
    setShowForm(true);
  };

  const closeForm = () => {
    setShowForm(false);
    setForm({ ...emptyForm });
  };

  const handleSave = async (event) => {
    event.preventDefault();
    setSaving(true);
    setError("");
    try {
      await createAdminVolunteer({
        name: form.name.trim(),
        username: form.username.trim(),
        password: form.password,
        assignedLab: form.assignedLab.trim(),
      });
      closeForm();
      await loadVolunteers();
    } catch (saveError) {
      setError(saveError.message || "Could not create the volunteer.");
    } finally {
      setSaving(false);
    }
  };

  const toggleStatus = async (volunteer) => {
    setUpdatingId(volunteer.id);
    setError("");
    try {
      await setAdminVolunteerActive(volunteer.id, !volunteer.isActive);
      await loadVolunteers();
      if (selectedVolunteer?.id === volunteer.id) {
        setSelectedVolunteer((current) => current ? { ...current, isActive: !current.isActive } : current);
      }
    } catch (updateError) {
      setError(updateError.message || "Could not update the volunteer status.");
    } finally {
      setUpdatingId(null);
    }
  };

  return (
    <div className="volunteer-management">
      <div className="volunteer-page-header">
        <div>
          <span className="admin-eyebrow">COMPETITION MANAGEMENT</span>
          <h1>Volunteer Management.</h1>
          <p>Manage volunteer accounts and competition assignments.</p>
        </div>

        <button className="volunteer-add-btn" onClick={openAddForm}>
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
            placeholder="Search name, username or assigned location..."
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
        </div>
        <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
          <option value="ALL">All Statuses</option>
          <option value="ACTIVE">Active</option>
          <option value="INACTIVE">Inactive</option>
        </select>
      </div>

      {error && <p className="volunteer-api-message" role="alert">{error}</p>}

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
                <th>ASSIGNED LOCATION</th>
                <th>STATUS</th>
                <th>ACTIONS</th>
              </tr>
            </thead>
            <tbody>
              {filteredVolunteers.map((volunteer) => {
                const status = statusLabel(volunteer);
                return (
                  <tr key={volunteer.id}>
                    <td>
                      <strong>{volunteer.name}</strong>
                      <small>{volunteer.username}</small>
                    </td>
                    <td>{volunteer.assignedLab || "—"}</td>
                    <td>
                      <span className={`volunteer-status ${status.toLowerCase()}`}>
                        {status}
                      </span>
                    </td>
                    <td>
                      <div className="volunteer-actions">
                        <button
                          type="button"
                          title="View details"
                          aria-label={`View ${volunteer.name}`}
                          onClick={() => setSelectedVolunteer(volunteer)}
                        >
                          <Eye size={15} />
                        </button>
                        <button
                          type="button"
                          title={volunteer.isActive ? "Deactivate volunteer" : "Reactivate volunteer"}
                          aria-label={volunteer.isActive ? "Deactivate volunteer" : "Reactivate volunteer"}
                          disabled={updatingId === volunteer.id}
                          onClick={() => toggleStatus(volunteer)}
                        >
                          {volunteer.isActive ? <UserX size={15} /> : <UserCheck size={15} />}
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
              {!loading && filteredVolunteers.length === 0 && (
                <tr>
                  <td colSpan="4" className="volunteer-empty">No volunteers found.</td>
                </tr>
              )}
              {loading && (
                <tr>
                  <td colSpan="4" className="volunteer-empty">Loading volunteers…</td>
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
                <span className="admin-eyebrow">VOLUNTEER ACCOUNTS</span>
                <h2>Add Volunteer</h2>
              </div>
              <button type="button" onClick={closeForm} aria-label="Close add volunteer form">
                <X size={20} />
              </button>
            </div>

            <form onSubmit={handleSave}>
              <div className="volunteer-form-field">
                <label htmlFor="volunteer-name">Full Name</label>
                <input
                  id="volunteer-name"
                  value={form.name}
                  onChange={(event) => setForm({ ...form, name: event.target.value })}
                  placeholder="Enter volunteer name"
                  required
                />
              </div>
              <div className="volunteer-form-field">
                <label htmlFor="volunteer-username">Username</label>
                <input
                  id="volunteer-username"
                  value={form.username}
                  onChange={(event) => setForm({ ...form, username: event.target.value })}
                  placeholder="Enter username"
                  autoComplete="off"
                  required
                />
              </div>
              <div className="volunteer-form-field">
                <label htmlFor="volunteer-password">Password</label>
                <input
                  id="volunteer-password"
                  type="password"
                  value={form.password}
                  onChange={(event) => setForm({ ...form, password: event.target.value })}
                  placeholder="Set an initial password"
                  autoComplete="new-password"
                  required
                />
              </div>
              <div className="volunteer-form-field">
                <label htmlFor="volunteer-location">Assigned Location</label>
                <input
                  id="volunteer-location"
                  value={form.assignedLab}
                  onChange={(event) => setForm({ ...form, assignedLab: event.target.value })}
                  placeholder="Enter physical work location"
                  required
                />
              </div>
              <div className="volunteer-form-actions">
                <button type="button" onClick={closeForm}>Cancel</button>
                <button type="submit" disabled={saving}>
                  {saving ? "Adding…" : "Add Volunteer"}
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
                <span className="admin-eyebrow">VOLUNTEER DETAILS</span>
                <h2>{selectedVolunteer.name}</h2>
              </div>
              <button type="button" onClick={() => setSelectedVolunteer(null)} aria-label="Close volunteer details">
                <X size={20} />
              </button>
            </div>
            <div className="volunteer-detail-list">
              <div><span>Username</span><strong>{selectedVolunteer.username}</strong></div>
              <div><span>Role</span><strong>{selectedVolunteer.role || "—"}</strong></div>
              <div><span>Assigned Location</span><strong>{selectedVolunteer.assignedLab || "—"}</strong></div>
              <div><span>Account Status</span><strong>{statusLabel(selectedVolunteer)}</strong></div>
              <div><span>Created</span><strong>{selectedVolunteer.createdAt || "—"}</strong></div>
              <div><span>Last Updated</span><strong>{selectedVolunteer.updatedAt || "—"}</strong></div>
            </div>
            <button className="volunteer-close-btn" onClick={() => setSelectedVolunteer(null)}>
              Close
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
