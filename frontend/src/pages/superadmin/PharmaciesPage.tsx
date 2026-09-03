import { useEffect, useState, type FormEvent } from 'react';
import { api } from '../../api/client';
import { IconClose } from '../../components/icons';

interface Pharmacy {
  id: number;
  code: string;
  name: string;
  address: string | null;
  phone: string | null;
  subscriptionStatus: 'trial' | 'active' | 'inactive';
  subscriptionExpiry: string | null;
  createdAt: string;
}

interface StaffMember {
  id: number;
  role: 'pharmacy_admin' | 'manager' | 'salesman';
  name: string;
  email: string;
  active: boolean;
  createdAt: string;
}

interface PharmacyDetails extends Pharmacy {
  admin: StaffMember | null;
  staff: StaffMember[];
}

const STATUS_CLASS: Record<string, string> = {
  active: 'badge-active',
  trial: 'badge-trial',
  inactive: 'badge-inactive',
};

const ROLE_LABEL: Record<string, string> = {
  pharmacy_admin: 'Admin',
  manager: 'Manager',
  salesman: 'Salesman',
};

interface JustCreated {
  code: string;
  name: string;
  adminEmail: string;
  generatedPassword: string;
}

interface Credentials {
  email: string;
  generatedPassword: string;
}

const EMPTY_FORM = { pharmacyName: '', address: '', phone: '', adminEmail: '' };

// Quick-pick shortcuts for the common cases -- clicking one just fills the day
// count below, it doesn't submit by itself. The number field is always free-typed,
// so any custom day count works too, not just these. The backend computes the
// actual expiry timestamp from that number (see UpdateSubscriptionDto/PharmaciesService)
// -- the client never sends a date itself.
const QUICK_DAYS = [1, 7, 30, 90, 365];

function ActivateControl({ onActivate }: { onActivate: (days: number) => void }) {
  const [days, setDays] = useState(30);
  return (
    <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
      <div style={{ display: 'flex', gap: 3 }}>
        {QUICK_DAYS.map((d) => (
          <button
            key={d}
            type="button"
            onClick={() => setDays(d)}
            className="btn-secondary btn"
            style={{
              padding: '4px 7px',
              fontSize: 12,
              ...(days === d
                ? { background: 'var(--primary)', color: 'var(--on-primary)', borderColor: 'var(--primary)' }
                : {}),
            }}
          >
            {d}
          </button>
        ))}
      </div>
      <input
        type="number"
        min={1}
        value={days}
        onChange={(e) => setDays(Math.max(1, Number(e.target.value) || 1))}
        style={{ width: 60 }}
      />
      <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>days</span>
      <button className="btn" onClick={() => onActivate(days)}>
        Activate
      </button>
    </div>
  );
}

// The "tap the box to copy" credentials block -- used both right after a pharmacy
// is created and after a super admin regenerates a lost password. Only ever shown
// once per generated password: only the bcrypt hash survives after this render.
function CredentialsBox({ email, password }: { email: string; password: string }) {
  const [copied, setCopied] = useState(false);
  const text = `Your Credentials\n--------------------------\nEmail: ${email}\nPassword: ${password}`;

  function copy() {
    navigator.clipboard?.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div>
      <div
        role="button"
        tabIndex={0}
        onClick={copy}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            copy();
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
        <div>Email: {email}</div>
        <div>Password: {password}</div>
      </div>
      <div
        style={{
          fontSize: 12,
          color: copied ? 'var(--success)' : 'var(--text-muted)',
          fontWeight: copied ? 600 : 400,
          marginTop: 8,
          textAlign: 'center',
        }}
      >
        {copied ? 'Copied ✓ — paste it into WhatsApp' : 'Tap to copy'}
      </div>
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

  // "View Details" side panel -- id of the row it's open for, plus its fetched
  // details (name/address/phone/admin/staff aren't in the table row, only in
  // GET /pharmacies/:id).
  const [detailsForId, setDetailsForId] = useState<number | null>(null);
  const [details, setDetails] = useState<PharmacyDetails | null>(null);
  const [detailsLoading, setDetailsLoading] = useState(false);
  const [confirmRegen, setConfirmRegen] = useState(false);
  const [regenerating, setRegenerating] = useState(false);
  const [regenerated, setRegenerated] = useState<Credentials | null>(null);

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

  async function activate(p: Pharmacy, days: number) {
    await api.patch(`/pharmacies/${p.id}/subscription`, { status: 'active', days });
    await load();
  }

  async function deactivate(p: Pharmacy) {
    await api.patch(`/pharmacies/${p.id}/subscription`, { status: 'inactive' });
    await load();
  }

  async function openDetails(p: Pharmacy) {
    setJustCreated(null);
    setDetailsForId(p.id);
    setDetails(null);
    setConfirmRegen(false);
    setRegenerated(null);
    setDetailsLoading(true);
    try {
      const { data } = await api.get<PharmacyDetails>(`/pharmacies/${p.id}`);
      setDetails(data);
    } finally {
      setDetailsLoading(false);
    }
  }

  function closeDetails() {
    setDetailsForId(null);
    setDetails(null);
    setConfirmRegen(false);
    setRegenerated(null);
  }

  async function regeneratePassword() {
    if (!detailsForId) return;
    setRegenerating(true);
    try {
      const { data } = await api.post<Credentials>(`/pharmacies/${detailsForId}/regenerate-password`);
      setRegenerated(data);
      setConfirmRegen(false);
    } finally {
      setRegenerating(false);
    }
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
          <CredentialsBox email={justCreated.adminEmail} password={justCreated.generatedPassword} />
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

      <div className="split-row">
        <div className="split-main card" style={{ padding: 0 }}>
          <div className="table-scroll">
            <table className="responsive">
              <thead>
                <tr>
                  <th>Code</th>
                  <th>Name</th>
                  <th>Status</th>
                  <th>Expires</th>
                  <th>Created</th>
                  <th></th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {pharmacies.map((p) => {
                  const left = daysLeft(p);
                  return (
                    <tr key={p.id} style={detailsForId === p.id ? { background: 'var(--bg)' } : undefined}>
                      <td data-label="Code" style={{ fontFamily: 'monospace', color: 'var(--text-muted)' }}>
                        {p.code}
                      </td>
                      <td data-label="Name">{p.name}</td>
                      <td data-label="Status">
                        <span className={`badge ${STATUS_CLASS[p.subscriptionStatus]}`}>{p.subscriptionStatus}</span>
                      </td>
                      <td data-label="Expires">
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
                      <td data-label="Created">{new Date(p.createdAt).toLocaleDateString()}</td>
                      <td data-label="">
                        {p.subscriptionStatus === 'active' ? (
                          <button className="btn-secondary btn" onClick={() => deactivate(p)}>
                            Deactivate
                          </button>
                        ) : (
                          <ActivateControl onActivate={(days) => activate(p, days)} />
                        )}
                      </td>
                      <td data-label="">
                        <button className="btn-secondary btn" onClick={() => openDetails(p)}>
                          Details
                        </button>
                      </td>
                    </tr>
                  );
                })}
                {pharmacies.length === 0 && (
                  <tr>
                    <td colSpan={7} style={{ color: 'var(--text-muted)' }}>
                      No pharmacies yet.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {detailsForId !== null && (
          <div className="split-side card">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <h3 style={{ marginTop: 0, marginBottom: 4, fontSize: 15 }}>
                {details ? details.name : 'Loading…'}
                {details && (
                  <span style={{ color: 'var(--text-muted)', fontWeight: 400 }}> ({details.code})</span>
                )}
              </h3>
              <button
                className="btn-secondary btn"
                style={{ padding: '2px 9px', fontSize: 13 }}
                onClick={closeDetails}
                aria-label="Close details"
              >
                <IconClose size={14} />
              </button>
            </div>

            {detailsLoading && <p style={{ color: 'var(--text-muted)', fontSize: 13 }}>Loading…</p>}

            {details && (
              <>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 13, marginTop: 10 }}>
                  <div>
                    <span style={{ color: 'var(--text-muted)' }}>Status: </span>
                    <span className={`badge ${STATUS_CLASS[details.subscriptionStatus]}`}>{details.subscriptionStatus}</span>
                    {details.subscriptionStatus === 'active' && details.subscriptionExpiry && (
                      <span style={{ color: 'var(--text-muted)' }}>
                        {' '}
                        — expires {new Date(details.subscriptionExpiry).toLocaleDateString()}
                      </span>
                    )}
                  </div>
                  <div>
                    <span style={{ color: 'var(--text-muted)' }}>Address: </span>
                    {details.address || '—'}
                  </div>
                  <div>
                    <span style={{ color: 'var(--text-muted)' }}>Phone: </span>
                    {details.phone || '—'}
                  </div>
                  <div>
                    <span style={{ color: 'var(--text-muted)' }}>Admin login: </span>
                    {details.admin?.email || '—'}
                  </div>
                  <div>
                    <span style={{ color: 'var(--text-muted)' }}>Created: </span>
                    {new Date(details.createdAt).toLocaleDateString()}
                  </div>
                </div>

                <div style={{ marginTop: 16 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 6 }}>
                    Staff {details.staff.length > 0 && `(${details.staff.length})`}
                  </div>
                  {details.staff.length === 0 ? (
                    <p style={{ color: 'var(--text-muted)', fontSize: 13 }}>No managers or salesmen added yet.</p>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                      {details.staff.map((s) => (
                        <div key={s.id} style={{ fontSize: 13, display: 'flex', justifyContent: 'space-between' }}>
                          <span>
                            {s.name}
                            <br />
                            <span style={{ color: 'var(--text-muted)' }}>{s.email}</span>
                          </span>
                          <span style={{ color: 'var(--text-muted)' }}>{ROLE_LABEL[s.role]}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div style={{ marginTop: 18, paddingTop: 14, borderTop: '1px solid var(--border)' }}>
                  <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 6 }}>Admin password</div>

                  {regenerated ? (
                    <div>
                      <p style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 0, marginBottom: 10 }}>
                        Shown once — tap the box below to copy it, then send it to the pharmacy owner. It can't be
                        recovered later, only reset again.
                      </p>
                      <CredentialsBox email={regenerated.email} password={regenerated.generatedPassword} />
                    </div>
                  ) : confirmRegen ? (
                    <div>
                      <p style={{ fontSize: 12, color: 'var(--warning)', marginTop: 0, marginBottom: 10 }}>
                        This immediately invalidates their current password. Continue?
                      </p>
                      <div style={{ display: 'flex', gap: 8 }}>
                        <button className="btn" onClick={regeneratePassword} disabled={regenerating}>
                          {regenerating ? 'Generating…' : 'Yes, regenerate'}
                        </button>
                        <button className="btn-secondary btn" onClick={() => setConfirmRegen(false)}>
                          Cancel
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div>
                      <p style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 0, marginBottom: 10 }}>
                        Lost their password? Generate a new one to relay to them.
                      </p>
                      <button
                        className="btn-secondary btn"
                        onClick={() => setConfirmRegen(true)}
                        disabled={!details.admin}
                      >
                        Regenerate password
                      </button>
                    </div>
                  )}
                </div>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
