import { useEffect, useState, type FormEvent } from 'react';
import { api } from '../../api/client';

interface Pharmacy {
  id: number;
  code: string;
  name: string;
  subscriptionStatus: 'trial' | 'active' | 'inactive';
  subscriptionExpiry: string | null;
  createdAt: string;
}

const STATUS_CLASS: Record<string, string> = {
  active: 'badge-active',
  trial: 'badge-trial',
  inactive: 'badge-inactive',
};

interface JustCreated {
  code: string;
  name: string;
  adminEmail: string;
  generatedPassword: string;
}

const EMPTY_FORM = { pharmacyName: '', address: '', phone: '', adminEmail: '' };

// Common billing cycles. The backend computes the actual expiry timestamp from
// whichever one is picked (see UpdateSubscriptionDto/PharmaciesService) -- the
// client never sends a date itself.
const DURATION_OPTIONS = [
  { days: 1, label: '1 day' },
  { days: 7, label: '7 days' },
  { days: 30, label: '30 days' },
  { days: 90, label: '90 days' },
  { days: 365, label: '1 year' },
];

function ActivateControl({ onActivate }: { onActivate: (days: number) => void }) {
  const [days, setDays] = useState(30);
  return (
    <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
      <select value={days} onChange={(e) => setDays(Number(e.target.value))}>
        {DURATION_OPTIONS.map((o) => (
          <option key={o.days} value={o.days}>
            {o.label}
          </option>
        ))}
      </select>
      <button className="btn-secondary btn" onClick={() => onActivate(days)}>
        Activate
      </button>
    </div>
  );
}

function daysLeft(p: Pick<Pharmacy, 'subscriptionExpiry'>) {
  if (!p.subscriptionExpiry) return null;
  return Math.ceil((new Date(p.subscriptionExpiry).getTime() - Date.now()) / (24 * 60 * 60 * 1000));
}

export function PharmaciesPage() {
  const [pharmacies, setPharmacies] = useState<Pharmacy[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  // Shown once, right after creation -- the password only ever exists in plaintext
  // for this one response, so this is the only chance to see/copy it.
  const [justCreated, setJustCreated] = useState<JustCreated | null>(null);
  const [copied, setCopied] = useState(false);

  async function load() {
    const { data } = await api.get<Pharmacy[]>('/pharmacies');
    setPharmacies(data);
  }

  useEffect(() => {
    load();
  }, []);

  async function handleCreate(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSaving(true);
    try {
      const { data } = await api.post('/pharmacies', form);
      setJustCreated({
        code: data.pharmacy.code,
        name: data.pharmacy.name,
        adminEmail: data.admin.email,
        generatedPassword: data.generatedPassword,
      });
      setForm(EMPTY_FORM);
      setShowForm(false);
      await load();
    } catch (err: any) {
      setError(err?.response?.data?.message || 'Failed to create pharmacy');
    } finally {
      setSaving(false);
    }
  }

  function credentialsText(jc: JustCreated) {
    return `Your Credentials\n--------------------------\nEmail: ${jc.adminEmail}\nPassword: ${jc.generatedPassword}`;
  }

  function copyCredentials() {
    if (!justCreated) return;
    navigator.clipboard?.writeText(credentialsText(justCreated));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  async function activate(p: Pharmacy, days: number) {
    await api.patch(`/pharmacies/${p.id}/subscription`, { status: 'active', days });
    await load();
  }

  async function deactivate(p: Pharmacy) {
    await api.patch(`/pharmacies/${p.id}/subscription`, { status: 'inactive' });
    await load();
  }

  return (
    <div>
      <div className="page-header">
        <h1 style={{ fontSize: 22, margin: 0 }}>Subscribing Pharmacies</h1>
        <button
          className="btn"
          onClick={() => {
            setJustCreated(null);
            setShowForm((s) => !s);
          }}
        >
          {showForm ? 'Cancel' : '+ New Pharmacy'}
        </button>
      </div>

      {justCreated && (
        <div className="card form-card" style={{ borderColor: 'var(--success)' }}>
          <h3 style={{ marginTop: 0, fontSize: 15 }}>
            {justCreated.name} created <span style={{ color: 'var(--text-muted)', fontWeight: 400 }}>({justCreated.code})</span>
          </h3>
          <p style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 14 }}>
            Shown once — tap the box below to copy it, then send it to the pharmacy owner (WhatsApp, SMS, call).
            It can't be recovered later, only reset.
          </p>
          <div
            role="button"
            tabIndex={0}
            onClick={copyCredentials}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                copyCredentials();
              }
            }}
            style={{
              fontFamily: 'monospace',
              fontSize: 14,
              lineHeight: 1.7,
              whiteSpace: 'pre-wrap',
              background: 'var(--bg)',
              border: `1px solid ${copied ? 'var(--success)' : 'var(--border)'}`,
              borderRadius: 'var(--radius)',
              padding: '14px 16px',
              cursor: 'pointer',
              userSelect: 'none',
            }}
          >
            <div style={{ fontWeight: 700, fontFamily: 'inherit' }}>Your Credentials</div>
            <div style={{ color: 'var(--text-muted)' }}>--------------------------</div>
            <div>Email: {justCreated.adminEmail}</div>
            <div>Password: {justCreated.generatedPassword}</div>
          </div>
          <div style={{ fontSize: 12, color: copied ? 'var(--success)' : 'var(--text-muted)', fontWeight: copied ? 600 : 400, marginTop: 8, textAlign: 'center' }}>
            {copied ? 'Copied ✓ — paste it into WhatsApp' : 'Tap to copy'}
          </div>
          <button className="btn-secondary btn" style={{ width: '100%', marginTop: 12 }} onClick={() => setJustCreated(null)}>
            Done
          </button>
        </div>
      )}

      {showForm && (
        <form onSubmit={handleCreate} className="card form-card">
          <div className="form-row">
            <label>Business name</label>
            <input
              required
              value={form.pharmacyName}
              onChange={(e) => setForm({ ...form, pharmacyName: e.target.value })}
            />
          </div>
          <div className="form-row">
            <label>Email (used to log in)</label>
            <input
              type="email"
              required
              value={form.adminEmail}
              onChange={(e) => setForm({ ...form, adminEmail: e.target.value })}
            />
          </div>
          <div className="form-row">
            <label>Mobile number</label>
            <input required value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
          </div>
          <div className="form-row">
            <label>Address</label>
            <input required value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} />
          </div>
          <p style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: -6, marginBottom: 14 }}>
            The login password is generated automatically — you'll see it once, right after creating the pharmacy.
          </p>
          {error && <p className="error-text">{error}</p>}
          <button className="btn" type="submit" disabled={saving}>
            {saving ? 'Creating…' : 'Create pharmacy'}
          </button>
        </form>
      )}

      <div className="card" style={{ padding: 0 }}>
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>Code</th>
                <th>Name</th>
                <th>Status</th>
                <th>Expires</th>
                <th>Created</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {pharmacies.map((p) => {
                const left = daysLeft(p);
                return (
                  <tr key={p.id}>
                    <td style={{ fontFamily: 'monospace', color: 'var(--text-muted)' }}>{p.code}</td>
                    <td>{p.name}</td>
                    <td>
                      <span className={`badge ${STATUS_CLASS[p.subscriptionStatus]}`}>{p.subscriptionStatus}</span>
                    </td>
                    <td>
                      {p.subscriptionStatus === 'active' && p.subscriptionExpiry ? (
                        <span style={{ color: left !== null && left <= 3 ? 'var(--warning)' : undefined }}>
                          {new Date(p.subscriptionExpiry).toLocaleDateString()}
                          {left !== null && (
                            <span style={{ color: 'var(--text-muted)', fontWeight: 400 }}> ({left <= 0 ? 'today' : `${left}d left`})</span>
                          )}
                        </span>
                      ) : (
                        <span style={{ color: 'var(--text-muted)' }}>—</span>
                      )}
                    </td>
                    <td>{new Date(p.createdAt).toLocaleDateString()}</td>
                    <td>
                      {p.subscriptionStatus === 'active' ? (
                        <button className="btn-secondary btn" onClick={() => deactivate(p)}>
                          Deactivate
                        </button>
                      ) : (
                        <ActivateControl onActivate={(days) => activate(p, days)} />
                      )}
                    </td>
                  </tr>
                );
              })}
              {pharmacies.length === 0 && (
                <tr>
                  <td colSpan={6} style={{ color: 'var(--text-muted)' }}>
                    No pharmacies yet.
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
