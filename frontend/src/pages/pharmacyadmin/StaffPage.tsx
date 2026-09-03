import { useEffect, useState, type FormEvent } from 'react';
import { api } from '../../api/client';

interface Staff {
  id: number;
  name: string;
  email: string;
  role: 'salesman' | 'manager';
  active: boolean;
  createdAt: string;
}

const ROLE_LABEL: Record<string, string> = { salesman: 'Salesman', manager: 'Manager' };

export function StaffPage() {
  const [staff, setStaff] = useState<Staff[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ name: '', email: '', password: '', role: 'salesman' as 'salesman' | 'manager' });
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

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

  return (
    <div>
      <div className="page-header">
        <h1 style={{ fontSize: 22, margin: 0 }}>Staff</h1>
        <button className="btn" onClick={() => setShowForm((s) => !s)}>
          {showForm ? 'Cancel' : '+ Add Staff'}
        </button>
      </div>

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

      <div className="card" style={{ padding: 0 }}>
        <div className="table-scroll">
          <table className="responsive">
            <thead>
              <tr>
                <th>Name</th>
                <th>Email</th>
                <th>Role</th>
                <th>Added</th>
              </tr>
            </thead>
            <tbody>
              {staff.map((s) => (
                <tr key={s.id}>
                  <td data-label="Name">{s.name}</td>
                  <td data-label="Email">{s.email}</td>
                  <td data-label="Role">{ROLE_LABEL[s.role]}</td>
                  <td data-label="Added">{new Date(s.createdAt).toLocaleDateString()}</td>
                </tr>
              ))}
              {staff.length === 0 && (
                <tr>
                  <td colSpan={4} style={{ color: 'var(--text-muted)' }}>
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
