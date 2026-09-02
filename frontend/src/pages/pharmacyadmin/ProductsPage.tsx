import { useEffect, useRef, useState, type FormEvent } from 'react';
import { api } from '../../api/client';

interface Product {
  id: number;
  name: string;
  unit: string;
  reorderLevel: number;
  active: boolean;
  medicineMasterId: number | null;
  qtyOnHand: number;
}

interface MasterHit {
  id: number;
  name: string;
  genericName: string | null;
  strength: string | null;
  form: string | null;
  manufacturerName: string | null;
}

export function ProductsPage() {
  const [products, setProducts] = useState<Product[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState('');
  const [unit, setUnit] = useState('pcs');
  const [reorderLevel, setReorderLevel] = useState(10);
  const [medicineMasterId, setMedicineMasterId] = useState<number | null>(null);
  const [suggestions, setSuggestions] = useState<MasterHit[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  async function load() {
    const { data } = await api.get<Product[]>('/products');
    setProducts(data);
  }

  useEffect(() => {
    load();
  }, []);

  function onNameChange(value: string) {
    setName(value);
    setMedicineMasterId(null); // typing again means it's no longer the previously picked match
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (value.trim().length < 2) {
      setSuggestions([]);
      return;
    }
    debounceRef.current = setTimeout(async () => {
      const { data } = await api.get<MasterHit[]>('/medicine-master/search', { params: { q: value } });
      setSuggestions(data);
    }, 250);
  }

  function pickSuggestion(hit: MasterHit) {
    setName(hit.name);
    setMedicineMasterId(hit.id);
    setSuggestions([]);
  }

  async function handleCreate(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSaving(true);
    try {
      await api.post('/products', {
        name,
        unit,
        reorderLevel,
        medicineMasterId: medicineMasterId ?? undefined,
      });
      setName('');
      setUnit('pcs');
      setReorderLevel(10);
      setMedicineMasterId(null);
      setShowForm(false);
      await load();
    } catch (err: any) {
      setError(err?.response?.data?.message || 'Failed to add product');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div>
      <div className="page-header">
        <h1 style={{ fontSize: 22, margin: 0 }}>Products</h1>
        <button className="btn" onClick={() => setShowForm((s) => !s)}>
          {showForm ? 'Cancel' : '+ Add Product'}
        </button>
      </div>

      {showForm && (
        <form onSubmit={handleCreate} className="card form-card">
          <div className="form-row" style={{ position: 'relative' }}>
            <label>Medicine name</label>
            <input
              required
              placeholder="Search catalog or type a new name…"
              value={name}
              onChange={(e) => onNameChange(e.target.value)}
              autoComplete="off"
            />
            {suggestions.length > 0 && (
              <div
                className="card"
                style={{
                  position: 'absolute',
                  top: '100%',
                  left: 0,
                  right: 0,
                  zIndex: 10,
                  padding: 4,
                  maxHeight: 220,
                  overflowY: 'auto',
                }}
              >
                {suggestions.map((hit) => (
                  <div
                    key={hit.id}
                    onClick={() => pickSuggestion(hit)}
                    style={{ padding: '8px 10px', cursor: 'pointer', borderRadius: 6, fontSize: 13 }}
                    onMouseDown={(e) => e.preventDefault()}
                  >
                    <div style={{ fontWeight: 600 }}>{hit.name}</div>
                    <div style={{ color: 'var(--text-muted)' }}>
                      {[hit.genericName, hit.strength, hit.form, hit.manufacturerName].filter(Boolean).join(' · ')}
                    </div>
                  </div>
                ))}
              </div>
            )}
            {medicineMasterId && (
              <span style={{ fontSize: 12, color: 'var(--success)' }}>Linked to catalog entry</span>
            )}
          </div>

          <div className="form-row">
            <label>Unit</label>
            <input value={unit} onChange={(e) => setUnit(e.target.value)} placeholder="pcs, box, bottle…" />
          </div>

          <div className="form-row">
            <label>Reorder level (low-stock threshold)</label>
            <input
              type="number"
              min={0}
              value={reorderLevel}
              onChange={(e) => setReorderLevel(Number(e.target.value))}
            />
          </div>

          {error && <p className="error-text">{error}</p>}
          <button className="btn" type="submit" disabled={saving}>
            {saving ? 'Adding…' : 'Add product'}
          </button>
        </form>
      )}

      <div className="card" style={{ padding: 0 }}>
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>Name</th>
                <th>Unit</th>
                <th>On hand</th>
                <th>Reorder level</th>
              </tr>
            </thead>
            <tbody>
              {products.map((p) => (
                <tr key={p.id}>
                  <td>{p.name}</td>
                  <td>{p.unit}</td>
                  <td style={{ color: p.qtyOnHand <= p.reorderLevel ? 'var(--danger)' : undefined, fontWeight: 600 }}>
                    {p.qtyOnHand}
                  </td>
                  <td>{p.reorderLevel}</td>
                </tr>
              ))}
              {products.length === 0 && (
                <tr>
                  <td colSpan={4} style={{ color: 'var(--text-muted)' }}>
                    No products yet.
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
