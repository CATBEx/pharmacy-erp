import { useEffect, useRef, useState, type FormEvent } from 'react';
import { api } from '../../api/client';
import { formatStock, packSizeDropdownOptions, type PackSizeSuggestion } from '../../utils/packSize';

interface Product {
  id: number;
  name: string;
  unit: string;
  piecesPerStrip: number;
  stripsPerBox: number;
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

  // Packaging: 1 box = stripsPerBox strips, 1 strip = piecesPerStrip pieces. Dropdown-only, no
  // typing -- pre-filled with what other pharmacies use for this exact medicine (most-used
  // first) once one is picked from the catalog, falling back to the generic curated list.
  const [piecesPerStrip, setPiecesPerStrip] = useState(1);
  const [stripsPerBox, setStripsPerBox] = useState(1);
  const [packSuggestions, setPackSuggestions] = useState<{
    piecesPerStrip: PackSizeSuggestion[];
    stripsPerBox: PackSizeSuggestion[];
  }>({ piecesPerStrip: [], stripsPerBox: [] });

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

  async function pickSuggestion(hit: MasterHit) {
    setName(hit.name);
    setMedicineMasterId(hit.id);
    setSuggestions([]);
    // Reset to the plain curated list while the real cross-pharmacy data loads, then swap in
    // once it arrives -- avoids briefly showing the *previous* medicine's suggestions.
    setPackSuggestions({ piecesPerStrip: [], stripsPerBox: [] });
    const { data } = await api.get<{ piecesPerStrip: PackSizeSuggestion[]; stripsPerBox: PackSizeSuggestion[] }>(
      '/products/pack-size-suggestions',
      { params: { medicineMasterId: hit.id } },
    );
    setPackSuggestions(data);
    // If other pharmacies have a clear most-common value, default to it -- the admin can still
    // change it before saving, this just saves a click in the common case.
    if (data.piecesPerStrip[0]) setPiecesPerStrip(data.piecesPerStrip[0].value);
    if (data.stripsPerBox[0]) setStripsPerBox(data.stripsPerBox[0].value);
  }

  async function handleCreate(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSaving(true);
    try {
      await api.post('/products', {
        name,
        unit,
        piecesPerStrip,
        stripsPerBox,
        reorderLevel,
        medicineMasterId: medicineMasterId ?? undefined,
      });
      setName('');
      setUnit('pcs');
      setPiecesPerStrip(1);
      setStripsPerBox(1);
      setPackSuggestions({ piecesPerStrip: [], stripsPerBox: [] });
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
            <label>Pieces per strip</label>
            <select value={piecesPerStrip} onChange={(e) => setPiecesPerStrip(Number(e.target.value))}>
              {packSizeDropdownOptions(packSuggestions.piecesPerStrip).map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
            <p style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4, marginBottom: 0 }}>
              1 if sold loose (syrups, bottles, single vials) — e.g. 10 for a standard tablet strip.
            </p>
          </div>

          <div className="form-row">
            <label>Strips per box</label>
            <select value={stripsPerBox} onChange={(e) => setStripsPerBox(Number(e.target.value))}>
              {packSizeDropdownOptions(packSuggestions.stripsPerBox).map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
            <p style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4, marginBottom: 0 }}>
              Only matters for stock-in by the box — leave at 1 if you don't buy in cartons.
            </p>
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
                    {formatStock(p.qtyOnHand, p.piecesPerStrip, p.stripsPerBox, p.unit)}
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
