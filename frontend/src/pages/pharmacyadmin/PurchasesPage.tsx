import { useEffect, useState, type FormEvent } from 'react';
import { api } from '../../api/client';

interface Product {
  id: number;
  name: string;
  unit: string;
}
interface Supplier {
  id: number;
  name: string;
}
interface Purchase {
  id: number;
  productId: number;
  supplierId: number | null;
  qty: number;
  purchasePrice: string;
  batchNumber: string | null;
  purchaseDate: string;
}

export function PurchasesPage() {
  const [purchases, setPurchases] = useState<Purchase[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({
    productId: '',
    supplierId: '',
    qty: '',
    purchasePrice: '',
    batchNumber: '',
  });
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function loadAll() {
    const [p, prod, sup] = await Promise.all([
      api.get<Purchase[]>('/purchases'),
      api.get<Product[]>('/products'),
      api.get<Supplier[]>('/suppliers'),
    ]);
    setPurchases(p.data);
    setProducts(prod.data);
    setSuppliers(sup.data);
  }

  useEffect(() => {
    loadAll();
  }, []);

  function productName(id: number) {
    return products.find((p) => p.id === id)?.name ?? `#${id}`;
  }

  async function handleCreate(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSaving(true);
    try {
      await api.post('/purchases', {
        productId: Number(form.productId),
        supplierId: form.supplierId ? Number(form.supplierId) : undefined,
        qty: Number(form.qty),
        purchasePrice: form.purchasePrice,
        batchNumber: form.batchNumber || undefined,
      });
      setForm({ productId: '', supplierId: '', qty: '', purchasePrice: '', batchNumber: '' });
      setShowForm(false);
      await loadAll();
    } catch (err: any) {
      setError(err?.response?.data?.message || 'Failed to record purchase');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div>
      <div className="page-header">
        <h1 style={{ fontSize: 22, margin: 0 }}>Stock-in (Purchases)</h1>
        <button className="btn" onClick={() => setShowForm((s) => !s)}>
          {showForm ? 'Cancel' : '+ Record Purchase'}
        </button>
      </div>

      {showForm && (
        <form onSubmit={handleCreate} className="card form-card">
          <div className="form-row">
            <label>Product</label>
            <select
              required
              value={form.productId}
              onChange={(e) => setForm({ ...form, productId: e.target.value })}
            >
              <option value="">Select a product…</option>
              {products.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </div>

          <div className="form-row">
            <label>Supplier (optional)</label>
            <select value={form.supplierId} onChange={(e) => setForm({ ...form, supplierId: e.target.value })}>
              <option value="">None</option>
              {suppliers.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </div>

          <div className="form-row">
            <label>Quantity received</label>
            <input
              type="number"
              min={1}
              required
              value={form.qty}
              onChange={(e) => setForm({ ...form, qty: e.target.value })}
            />
          </div>

          <div className="form-row">
            <label>Purchase price (per unit)</label>
            <input
              type="text"
              inputMode="decimal"
              required
              placeholder="e.g. 1.20"
              value={form.purchasePrice}
              onChange={(e) => setForm({ ...form, purchasePrice: e.target.value })}
            />
          </div>

          <div className="form-row">
            <label>Batch number (optional)</label>
            <input value={form.batchNumber} onChange={(e) => setForm({ ...form, batchNumber: e.target.value })} />
          </div>

          {error && <p className="error-text">{error}</p>}
          <button className="btn" type="submit" disabled={saving}>
            {saving ? 'Saving…' : 'Record purchase'}
          </button>
        </form>
      )}

      <div className="card" style={{ padding: 0 }}>
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>Product</th>
                <th>Qty</th>
                <th>Unit price</th>
                <th>Batch</th>
                <th>Date</th>
              </tr>
            </thead>
            <tbody>
              {purchases.map((p) => (
                <tr key={p.id}>
                  <td>{productName(p.productId)}</td>
                  <td>{p.qty}</td>
                  <td>{p.purchasePrice}</td>
                  <td>{p.batchNumber || '—'}</td>
                  <td>{new Date(p.purchaseDate).toLocaleDateString()}</td>
                </tr>
              ))}
              {purchases.length === 0 && (
                <tr>
                  <td colSpan={5} style={{ color: 'var(--text-muted)' }}>
                    No stock recorded yet.
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
