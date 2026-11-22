import { useEffect, useMemo, useRef, useState } from "react";
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
  getAdminVolunteerDetails,
  getAdminVolunteers,
  resetAdminVolunteerPassword,
  setAdminVolunteerActive,
  updateAdminVolunteer,
} from "../../services/adminVolunteerService";
import "./volunteer.css";

const emptyForm = { name: "", username: "", password: "", assignedLab: "" };

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
  const [editForm, setEditForm] = useState({ name: "", assignedLab: "" });
  const [newPassword, setNewPassword] = useState("");
  const [loading, setLoading] = useState(true);
  const [listLoadFailed, setListLoadFailed] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [detailSaving, setDetailSaving] = useState(false);
  const [passwordSaving, setPasswordSaving] = useState(false);
  const [updatingId, setUpdatingId] = useState(null);
  const [error, setError] = useState("");
  const [detailError, setDetailError] = useState("");
  const [success, setSuccess] = useState("");
  const [detailSuccess, setDetailSuccess] = useState("");
  const [editing, setEditing] = useState(false);
  const [resettingPassword, setResettingPassword] = useState(false);
  const detailRequestId = useRef(0);

  const loadVolunteers = async () => {
    setLoading(true);
    setError("");
    try {
      setVolunteers(await getAdminVolunteers());
      setListLoadFailed(false);
    } catch (loadError) {
      setListLoadFailed(true);
      setError(loadError.message || "Could not load volunteers.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadVolunteers();
  }, []);

  const openVolunteerDetails = async (volunteer) => {
    const requestId = ++detailRequestId.current;
    setSelectedVolunteer(volunteer);
    setDetailLoading(true);
    setDetailError("");
    setDetailSuccess("");
    setEditing(false);
    setResettingPassword(false);
    try {
      const result = await getAdminVolunteerDetails(volunteer.id);
      if (detailRequestId.current === requestId) {
        setSelectedVolunteer(result.volunteer);
        setEditForm({ name: result.volunteer.name || "", assignedLab: result.volunteer.assignedLab || "" });
      }
    } catch (loadError) {
      if (detailRequestId.current === requestId) {
        setDetailError(loadError.message || "Could not load volunteer details.");
      }
    } finally {
      if (detailRequestId.current === requestId) setDetailLoading(false);
    }
  };

  const closeDetails = () => {
    detailRequestId.current += 1;
    setSelectedVolunteer(null);
    setDetailError("");
    setDetailSuccess("");
  };

  const retryDetails = () => {
    if (selectedVolunteer?.id) openVolunteerDetails(selectedVolunteer);
  };

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
    setSuccess("");
    setShowForm(true);
  };

  const closeForm = () => {
    if (saving) return;
    setShowForm(false);
    setForm({ ...emptyForm });
  };

  const handleSave = async (event) => {
    event.preventDefault();
    if (saving) return;
    setSaving(true);
    setError("");
    setSuccess("");
    try {
      await createAdminVolunteer({
        name: form.name.trim(),
        username: form.username.trim(),
        password: form.password,
        assignedLab: form.assignedLab.trim(),
      });
      setShowForm(false);
      setForm({ ...emptyForm });
      setSuccess("Volunteer created successfully.");
      await loadVolunteers();
    } catch (saveError) {
      setError(saveError.message || "Could not create the volunteer.");
    } finally {
      setSaving(false);
    }
  };

  const handleUpdate = async (event) => {
    event.preventDefault();
    if (!selectedVolunteer || detailSaving) return;
    setDetailSaving(true);
    setDetailError("");
    setDetailSuccess("");
    try {
      const result = await updateAdminVolunteer(selectedVolunteer.id, {
        name: editForm.name.trim(),
        assignedLab: editForm.assignedLab.trim(),
      });
      setSelectedVolunteer(result.volunteer);
      setEditForm({ name: result.volunteer.name || "", assignedLab: result.volunteer.assignedLab || "" });
      setEditing(false);
      setDetailSuccess(result.message || "Volunteer details updated successfully.");
      await loadVolunteers();
    } catch (updateError) {
      setDetailError(updateError.message || "Could not update volunteer details.");
    } finally {
      setDetailSaving(false);
    }
  };

  const handlePasswordReset = async (event) => {
    event.preventDefault();
    if (!selectedVolunteer || passwordSaving) return;
    setPasswordSaving(true);
    setDetailError("");
    setDetailSuccess("");
    try {
      const result = await resetAdminVolunteerPassword(selectedVolunteer.id, newPassword);
      setSelectedVolunteer(result.volunteer);
      setNewPassword("");
      setResettingPassword(false);
      setDetailSuccess(result.message || "Volunteer password reset successfully.");
    } catch (resetError) {
      setDetailError(resetError.message || "Could not reset the volunteer password.");
    } finally {
      setPasswordSaving(false);
    }
  };

  const toggleStatus = async (volunteer) => {
    if (updatingId !== null) return;
    setUpdatingId(volunteer.id);
    setError("");
    setSuccess("");
    try {
      const result = await setAdminVolunteerActive(volunteer.id, !volunteer.isActive);
      setSuccess(result.message || `Volunteer ${volunteer.isActive ? "deactivated" : "reactivated"} successfully.`);
      await loadVolunteers();
      if (selectedVolunteer?.id === volunteer.id) {
        setSelectedVolunteer(result.volunteer);
        setDetailSuccess(result.message || "Volunteer status updated successfully.");
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
        <div><Users size={21} /><span>Total Volunteers</span><strong>{volunteers.length}</strong></div>
        <div><UserCheck size={21} /><span>Active Volunteers</span><strong>{activeCount}</strong></div>
        <div><UserX size={21} /><span>Inactive Volunteers</span><strong>{inactiveCount}</strong></div>
      </div>

      <div className="volunteer-toolbar">
        <div className="volunteer-search">
          <Search size={18} />
          <input type="text" placeholder="Search name, username or assigned location..." value={search} onChange={(event) => setSearch(event.target.value)} />
        </div>
        <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
          <option value="ALL">All Statuses</option>
          <option value="ACTIVE">Active</option>
          <option value="INACTIVE">Inactive</option>
        </select>
      </div>

      {error && !showForm && <p className="volunteer-api-message" role="alert">{error}</p>}
      {success && <p className="volunteer-api-message" role="status">{success}</p>}

      <div className="volunteer-table-container">
        <div className="volunteer-table-heading"><h2>Volunteer Directory</h2><span>{filteredVolunteers.length} volunteers</span></div>
        <div className="volunteer-table-scroll">
          <table className="volunteer-table">
            <thead><tr><th>VOLUNTEER</th><th>ASSIGNED LOCATION</th><th>STATUS</th><th>ACTIONS</th></tr></thead>
            <tbody>
              {filteredVolunteers.map((volunteer) => {
                const status = statusLabel(volunteer);
                return (
                  <tr key={volunteer.id}>
                    <td><strong>{volunteer.name}</strong><small>{volunteer.username}</small></td>
                    <td>{volunteer.assignedLab || "—"}</td>
                    <td><span className={`volunteer-status ${status.toLowerCase()}`}>{status}</span></td>
                    <td>
                      <div className="volunteer-actions">
        <button type="button" title="View details" aria-label={`View ${volunteer.name}`} disabled={detailSaving || passwordSaving} onClick={() => openVolunteerDetails(volunteer)}><Eye size={15} /></button>
                        <button type="button" title={volunteer.isActive ? "Deactivate volunteer" : "Reactivate volunteer"} aria-label={volunteer.isActive ? "Deactivate volunteer" : "Reactivate volunteer"} disabled={updatingId !== null} onClick={() => toggleStatus(volunteer)}>
                          {volunteer.isActive ? <UserX size={15} /> : <UserCheck size={15} />}
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
              {!loading && filteredVolunteers.length === 0 && <tr><td colSpan="4" className="volunteer-empty">No volunteers found.</td></tr>}
              {loading && <tr><td colSpan="4" className="volunteer-empty">Loading volunteers…</td></tr>}
            </tbody>
          </table>
        </div>
        {!loading && listLoadFailed && <button className="volunteer-close-btn" type="button" onClick={loadVolunteers}>Retry loading volunteers</button>}
      </div>

      {showForm && (
        <div className="volunteer-modal-overlay">
          <div className="volunteer-modal">
            <div className="volunteer-modal-header"><div><span className="admin-eyebrow">VOLUNTEER ACCOUNTS</span><h2>Add Volunteer</h2></div><button type="button" onClick={closeForm} aria-label="Close add volunteer form"><X size={20} /></button></div>
            {error && <p className="volunteer-api-message" role="alert">{error}</p>}
            <form onSubmit={handleSave}>
              <div className="volunteer-form-field"><label htmlFor="volunteer-name">Full Name</label><input id="volunteer-name" value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} placeholder="Enter volunteer name" required minLength={2} /></div>
              <div className="volunteer-form-field"><label htmlFor="volunteer-username">Username</label><input id="volunteer-username" value={form.username} onChange={(event) => setForm({ ...form, username: event.target.value })} placeholder="Enter username" autoComplete="off" required minLength={3} /></div>
              <div className="volunteer-form-field"><label htmlFor="volunteer-password">Password</label><input id="volunteer-password" type="password" value={form.password} onChange={(event) => setForm({ ...form, password: event.target.value })} placeholder="Set an initial password" autoComplete="new-password" required minLength={8} /></div>
              <div className="volunteer-form-field"><label htmlFor="volunteer-location">Assigned Location</label><input id="volunteer-location" value={form.assignedLab} onChange={(event) => setForm({ ...form, assignedLab: event.target.value })} placeholder="Enter physical work location" /></div>
              <div className="volunteer-form-actions"><button type="button" onClick={closeForm} disabled={saving}>Cancel</button><button type="submit" disabled={saving}>{saving ? "Adding…" : "Add Volunteer"}</button></div>
            </form>
          </div>
        </div>
      )}

      {selectedVolunteer && (
        <div className="volunteer-modal-overlay">
          <div className="volunteer-modal">
            <div className="volunteer-modal-header"><div><span className="admin-eyebrow">VOLUNTEER DETAILS</span><h2>{selectedVolunteer.name}</h2></div><button type="button" onClick={closeDetails} aria-label="Close volunteer details" disabled={detailSaving || passwordSaving}><X size={20} /></button></div>
            {detailLoading && <p className="volunteer-empty">Loading volunteer details…</p>}
            {detailError && <p className="volunteer-api-message" role="alert">{detailError}</p>}
            {detailError && <button className="volunteer-close-btn" type="button" onClick={retryDetails} disabled={detailLoading}>Retry details</button>}
            {detailSuccess && <p className="volunteer-api-message" role="status">{detailSuccess}</p>}
            {!detailLoading && !detailError && (
              <>
                <div className="volunteer-detail-list">
                  <div><span>Username</span><strong>{selectedVolunteer.username}</strong></div>
                  <div><span>Role</span><strong>{selectedVolunteer.role || "—"}</strong></div>
                  <div><span>Assigned Location</span><strong>{selectedVolunteer.assignedLab || "—"}</strong></div>
                  <div><span>Account Status</span><strong>{statusLabel(selectedVolunteer)}</strong></div>
                  <div><span>Created</span><strong>{selectedVolunteer.createdAt || "—"}</strong></div>
                  <div><span>Last Updated</span><strong>{selectedVolunteer.updatedAt || "—"}</strong></div>
                </div>
                {!editing && !resettingPassword && <div className="volunteer-form-actions"><button type="button" onClick={() => { setEditForm({ name: selectedVolunteer.name || "", assignedLab: selectedVolunteer.assignedLab || "" }); setEditing(true); setDetailError(""); }}>Edit details</button><button type="button" onClick={() => { setNewPassword(""); setResettingPassword(true); setDetailError(""); }}>Reset password</button></div>}
                {editing && <form onSubmit={handleUpdate}>
                  <div className="volunteer-form-field"><label htmlFor="edit-volunteer-name">Full Name</label><input id="edit-volunteer-name" value={editForm.name} onChange={(event) => setEditForm({ ...editForm, name: event.target.value })} required minLength={2} /></div>
                  <div className="volunteer-form-field"><label htmlFor="edit-volunteer-location">Assigned Location</label><input id="edit-volunteer-location" value={editForm.assignedLab} onChange={(event) => setEditForm({ ...editForm, assignedLab: event.target.value })} maxLength={100} /></div>
                  <div className="volunteer-form-actions"><button type="button" onClick={() => setEditing(false)} disabled={detailSaving}>Cancel</button><button type="submit" disabled={detailSaving}>{detailSaving ? "Saving…" : "Save changes"}</button></div>
                </form>}
                {resettingPassword && <form onSubmit={handlePasswordReset}>
                  <div className="volunteer-form-field"><label htmlFor="reset-volunteer-password">New Password</label><input id="reset-volunteer-password" type="password" value={newPassword} onChange={(event) => setNewPassword(event.target.value)} autoComplete="new-password" required minLength={8} /></div>
                  <div className="volunteer-form-actions"><button type="button" onClick={() => setResettingPassword(false)} disabled={passwordSaving}>Cancel</button><button type="submit" disabled={passwordSaving}>{passwordSaving ? "Resetting…" : "Reset password"}</button></div>
                </form>}
              </>
            )}
            <button className="volunteer-close-btn" onClick={closeDetails} disabled={detailSaving || passwordSaving}>Close</button>
          </div>
        </div>
      )}
    </div>
  );
}
