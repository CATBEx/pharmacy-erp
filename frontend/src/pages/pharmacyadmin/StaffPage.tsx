import { useEffect, useState, type FormEvent } from 'react';
import { api } from '../../api/client';
import { CredentialsBox } from '../../components/CredentialsBox';

interface Staff {
  id: number;
  name: string;
  email: string;
  role: 'salesman' | 'manager';
  active: boolean;
  createdAt: string;
}

interface Regenerated {
  name: string;
  email: string;
  generatedPassword: string;
}

const ROLE_LABEL: Record<string, string> = { salesman: 'Salesman', manager: 'Manager' };

export function StaffPage() {
  const [staff, setStaff] = useState<Staff[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ name: '', email: '', password: '', role: 'salesman' as 'salesman' | 'manager' });
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // Bug #15: reset password and deactivate/reactivate, both scoped per-row with an
  // inline "are you sure?" step (never a browser confirm() dialog, matching the pattern
  // already used elsewhere in the app) before the actual API call. `confirmAction` holds
  // at most one row's pending confirmation at a time.
  const [confirmAction, setConfirmAction] = useState<{ id: number; action: 'regen' | 'deactivate' } | null>(null);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  // Shown once, right after a reset -- same one-time-display contract as the pharmacy
  // creation/regeneration flows: only the bcrypt hash survives after this.
  const [regenerated, setRegenerated] = useState<Regenerated | null>(null);

  async function load() {
    const { data } = await api.get<Staff[]>('/users/staff');
    setStaff(data);
  }

  useEffect(() => {
    load();
  }, []);

  async function handleCreate(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSaving(true);
    try {
      await api.post('/users/staff', form);
      setForm({ name: '', email: '', password: '', role: 'salesman' });
      setShowForm(false);
      await load();
    } catch (err: any) {
      setError(err?.response?.data?.message || 'Failed to add staff');
    } finally {
      setSaving(false);
    }
  }

  async function regeneratePassword(s: Staff) {
    setActionError(null);
    setBusyId(s.id);
    try {
      const { data } = await api.post<{ email: string; generatedPassword: string }>(
        `/users/staff/${s.id}/regenerate-password`,
      );
      setRegenerated({ name: s.name, email: data.email, generatedPassword: data.generatedPassword });
      setConfirmAction(null);
    } catch (err: any) {
      setActionError(err?.response?.data?.message || 'Failed to reset password');
    } finally {
      setBusyId(null);
    }
  }

  async function setActive(s: Staff, active: boolean) {
    setActionError(null);
    setBusyId(s.id);
    try {
      await api.patch(`/users/staff/${s.id}`, { active });
      setConfirmAction(null);
      await load();
    } catch (err: any) {
      setActionError(err?.response?.data?.message || 'Failed to update account');
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div>
      <div className="page-header">
        <h1 style={{ fontSize: 22, margin: 0 }}>Staff</h1>
        <button className="btn" onClick={() => setShowForm((s) => !s)}>
          {showForm ? 'Cancel' : '+ Add Staff'}
        </button>
      </div>

      {regenerated && (
        <div className="card form-card" style={{ borderColor: 'var(--success)' }}>
          <h3 style={{ marginTop: 0, fontSize: 15 }}>Password reset for {regenerated.name}</h3>
          <p style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 14 }}>
            Shown once — tap the box below to copy it, then send it to them. It can't be recovered later, only reset
            again.
          </p>
          <CredentialsBox email={regenerated.email} password={regenerated.generatedPassword} />
          <button className="btn-secondary btn" style={{ width: '100%', marginTop: 12 }} onClick={() => setRegenerated(null)}>
            Done
          </button>
        </div>
      )}

      {showForm && (
        <form onSubmit={handleCreate} className="card form-card">
          <div className="form-row">
            <label>Role</label>
            <select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value as 'salesman' | 'manager' })}>
              <option value="salesman">Salesman — sells only, never sees cost/profit</option>
              <option value="manager">Manager — handles stock-in & suppliers, sees cost</option>
            </select>
          </div>
          <div className="form-row">
            <label>Name</label>
            <input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </div>
          <div className="form-row">
            <label>Email</label>
            <input
              type="email"
              required
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
            />
          </div>
          <div className="form-row">
            <label>Temporary password</label>
            <input
              required
              minLength={6}
              value={form.password}
              onChange={(e) => setForm({ ...form, password: e.target.value })}
            />
          </div>
          {error && <p className="error-text">{error}</p>}
          <button className="btn" type="submit" disabled={saving}>
            {saving ? 'Adding…' : 'Add staff'}
          </button>
        </form>
      )}

      {actionError && <p className="error-text" style={{ marginBottom: 12 }}>{actionError}</p>}

      <div className="card" style={{ padding: 0 }}>
        <div className="table-scroll">
          <table className="responsive">
            <thead>
              <tr>
                <th>Name</th>
                <th>Email</th>
                <th>Role</th>
                <th>Status</th>
                <th>Added</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {staff.map((s) => (
                <tr key={s.id} style={{ opacity: s.active ? 1 : 0.6 }}>
                  <td data-label="Name">{s.name}</td>
                  <td data-label="Email">{s.email}</td>
                  <td data-label="Role">{ROLE_LABEL[s.role]}</td>
                  <td data-label="Status">
                    <span className={`badge ${s.active ? 'badge-active' : 'badge-inactive'}`}>
                      {s.active ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                  <td data-label="Added">{new Date(s.createdAt).toLocaleDateString()}</td>
                  <td data-label="">
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', justifyContent: 'flex-end', alignItems: 'center' }}>
                      {confirmAction?.id === s.id ? (
                        <>
                          <span
                            style={{
                              fontSize: 12,
                              color: confirmAction.action === 'deactivate' ? 'var(--warning)' : 'var(--text-muted)',
                            }}
                          >
                            {confirmAction.action === 'regen' ? 'Reset password?' : 'Deactivate — they can no longer log in?'}
                          </span>
                          <button
                            className="btn"
                            disabled={busyId === s.id}
                            onClick={() => (confirmAction.action === 'regen' ? regeneratePassword(s) : setActive(s, false))}
                          >
                            {busyId === s.id ? 'Working…' : 'Yes'}
                          </button>
                          <button className="btn-secondary btn" onClick={() => setConfirmAction(null)}>
                            Cancel
                          </button>
                        </>
                      ) : (
                        <>
                          <button
                            className="btn-secondary btn"
                            onClick={() => setConfirmAction({ id: s.id, action: 'regen' })}
                          >
                            Reset password
                          </button>
                          {s.active ? (
                            <button
                              className="btn-secondary btn"
                              onClick={() => setConfirmAction({ id: s.id, action: 'deactivate' })}
                            >
                              Deactivate
                            </button>
                          ) : (
                            <button className="btn-secondary btn" disabled={busyId === s.id} onClick={() => setActive(s, true)}>
                              {busyId === s.id ? 'Working…' : 'Reactivate'}
                            </button>
                          )}
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
              {staff.length === 0 && (
                <tr>
                  <td colSpan={6} style={{ color: 'var(--text-muted)' }}>
                    No staff added yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
