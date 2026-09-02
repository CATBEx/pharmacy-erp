import { useEffect, useState, type FormEvent } from 'react';
import { api } from '../../api/client';

interface Supplier {
  id: number;
  name: string;
  contact: string | null;
  totalPurchased: number;
  totalPaid: number;
  balance: number;
}

interface LedgerEntry {
  type: 'purchase' | 'payment';
  id: number;
  amount: string;
  date: string;
  note: string | null;
}

export function SuppliersPage() {
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ name: '', contact: '' });
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const [ledgerFor, setLedgerFor] = useState<Supplier | null>(null);
  const [ledger, setLedger] = useState<LedgerEntry[]>([]);
  const [paymentAmount, setPaymentAmount] = useState('');

  async function load() {
    const { data } = await api.get<Supplier[]>('/suppliers');
    setSuppliers(data);
  }

  useEffect(() => {
    load();
  }, []);

  async function handleCreate(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSaving(true);
    try {
      await api.post('/suppliers', { name: form.name, contact: form.contact || undefined });
      setForm({ name: '', contact: '' });
      setShowForm(false);
      await load();
    } catch (err: any) {
      setError(err?.response?.data?.message || 'Failed to add supplier');
    } finally {
      setSaving(false);
    }
  }

  async function openLedger(s: Supplier) {
    setLedgerFor(s);
    const { data } = await api.get<LedgerEntry[]>(`/suppliers/${s.id}/ledger`);
    setLedger(data);
  }

  async function recordPayment(e: FormEvent) {
    e.preventDefault();
    if (!ledgerFor || !paymentAmount) return;
    await api.post(`/suppliers/${ledgerFor.id}/payments`, { amount: paymentAmount });
    setPaymentAmount('');
    await load();
    await openLedger(ledgerFor);
  }

  return (
    <div>
      <div className="page-header">
        <h1 style={{ fontSize: 22, margin: 0 }}>Suppliers</h1>
        <button className="btn" onClick={() => setShowForm((s) => !s)}>
          {showForm ? 'Cancel' : '+ Add Supplier'}
        </button>
      </div>

      {showForm && (
        <form onSubmit={handleCreate} className="card form-card">
          <div className="form-row">
            <label>Name</label>
            <input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </div>
          <div className="form-row">
            <label>Contact (optional)</label>
            <input value={form.contact} onChange={(e) => setForm({ ...form, contact: e.target.value })} />
          </div>
          {error && <p className="error-text">{error}</p>}
          <button className="btn" type="submit" disabled={saving}>
            {saving ? 'Adding…' : 'Add supplier'}
          </button>
        </form>
      )}

      <div className="suppliers-row">
        <div className="card suppliers-table" style={{ padding: 0 }}>
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Contact</th>
                  <th>Balance owed</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {suppliers.map((s) => (
                  <tr key={s.id}>
                    <td>{s.name}</td>
                    <td>{s.contact || '—'}</td>
                    <td style={{ fontWeight: 600, color: s.balance > 0 ? 'var(--warning)' : 'var(--success)' }}>
                      {s.balance.toFixed(2)}
                    </td>
                    <td>
                      <button className="btn-secondary btn" onClick={() => openLedger(s)}>
                        Ledger
                      </button>
                    </td>
                  </tr>
                ))}
                {suppliers.length === 0 && (
                  <tr>
                    <td colSpan={4} style={{ color: 'var(--text-muted)' }}>
                      No suppliers yet.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {ledgerFor && (
          <div className="card suppliers-ledger">
            <h3 style={{ marginTop: 0, fontSize: 15 }}>{ledgerFor.name} — Ledger</h3>
            <form onSubmit={recordPayment} style={{ display: 'flex', gap: 6, marginBottom: 14 }}>
              <input
                type="text"
                inputMode="decimal"
                placeholder="Payment amount"
                value={paymentAmount}
                onChange={(e) => setPaymentAmount(e.target.value)}
                style={{ flex: 1 }}
              />
              <button className="btn" type="submit">
                Pay
              </button>
            </form>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxHeight: 320, overflowY: 'auto' }}>
              {ledger.map((entry) => (
                <div
                  key={`${entry.type}-${entry.id}`}
                  style={{ fontSize: 13, display: 'flex', justifyContent: 'space-between' }}
                >
                  <span>
                    {entry.type === 'purchase' ? 'Stock purchased' : 'Payment made'}
                    <br />
                    <span style={{ color: 'var(--text-muted)' }}>{new Date(entry.date).toLocaleDateString()}</span>
                  </span>
                  <span style={{ color: entry.type === 'purchase' ? 'var(--warning)' : 'var(--success)' }}>
                    {entry.type === 'purchase' ? '+' : '-'}
                    {entry.amount}
                  </span>
                </div>
              ))}
              {ledger.length === 0 && <p style={{ color: 'var(--text-muted)', fontSize: 13 }}>No activity yet.</p>}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
