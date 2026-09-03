import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { api } from '../../api/client';
import { formatStock, sortedSuggestions, type PackSizeSuggestion } from '../../utils/packSize';

interface Product {
  id: number;
  name: string;
  unit: string;
  piecesPerStrip: number;
  stripsPerBox: number;
  reorderLevel: number;
  active: boolean;
  medicineMasterId: number | null;
  // Generic/manufacturer come from the shared catalog via medicineMasterId -- null for a product
  // typed in fresh with no catalog link (bug #10).
  genericName: string | null;
  form: string | null;
  manufacturerName: string | null;
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
  // Search box over the already-loaded product list (bug #10) -- matches name, generic name, and
  // manufacturer, since staff often know the drug before they know which brand they carry.
  const [query, setQuery] = useState('');
  const filteredProducts = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return products;
    return products.filter((p) =>
      [p.name, p.genericName, p.manufacturerName].some((f) => f?.toLowerCase().includes(q)),
    );
  }, [query, products]);
  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState('');
  // Unit: dropdown of common presets + a "Custom…" choice that reveals a free-text input (bug #6).
  // unitChoice is 'pcs' | 'bottle' | 'box' | 'custom'; customUnit only matters when it's 'custom'.
  const [unitChoice, setUnitChoice] = useState('pcs');
  const [customUnit, setCustomUnit] = useState('');
  const unit = unitChoice === 'custom' ? customUnit.trim() : unitChoice;
  const [reorderLevel, setReorderLevel] = useState(10);
  const [medicineMasterId, setMedicineMasterId] = useState<number | null>(null);
  const [suggestions, setSuggestions] = useState<MasterHit[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Packaging: 1 box = stripsPerBox strips, 1 strip = piecesPerStrip pieces. Free-typed number
  // inputs (bug #7); pre-filled with the most-used live cross-pharmacy value once a catalog match
  // is picked, and every reported value stays available afterward as a tappable suggestion chip.
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
    // Include strength in the saved name (bug #4) -- the catalog can hold several strength
    // variants of the same medicine name (e.g. Napa 500mg vs Napa Extra 665mg), so the bare name
    // alone isn't enough to tell products apart in the list.
    setName(hit.strength ? `${hit.name} (${hit.strength})` : hit.name);
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
    if (!unit) {
      setError('Enter a custom unit, or pick one from the list');
      return;
    }
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
      setUnitChoice('pcs');
      setCustomUnit('');
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
            <select value={unitChoice} onChange={(e) => setUnitChoice(e.target.value)}>
              <option value="pcs">Pcs</option>
              <option value="bottle">Bottle</option>
              <option value="box">Box</option>
              <option value="custom">Custom…</option>
            </select>
            {unitChoice === 'custom' && (
              <input
                required
                autoFocus
                value={customUnit}
                onChange={(e) => setCustomUnit(e.target.value)}
                placeholder="e.g. vial, sachet, tube"
                style={{ marginTop: 6 }}
              />
            )}
          </div>

          <div className="form-row">
            <label>Pieces per strip</label>
            <input
              type="number"
              min={1}
              value={piecesPerStrip}
              onChange={(e) => setPiecesPerStrip(Math.max(1, Number(e.target.value)))}
              style={{ width: 100 }}
            />
            {sortedSuggestions(packSuggestions.piecesPerStrip).length > 0 && (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 6 }}>
                {sortedSuggestions(packSuggestions.piecesPerStrip).map((s) => (
                  <button
                    key={s.value}
                    type="button"
                    className="btn-secondary btn"
                    onClick={() => setPiecesPerStrip(s.value)}
                    style={{ padding: '3px 10px', fontSize: 12 }}
                  >
                    {s.value} — used by {s.pharmacyCount} pharmac{s.pharmacyCount === 1 ? 'y' : 'ies'}
                  </button>
                ))}
              </div>
            )}
            <p style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 6, marginBottom: 0 }}>
              1 if sold loose (syrups, bottles, single vials) — e.g. 10 for a standard tablet strip.
            </p>
          </div>

          <div className="form-row">
            <label>Strips per box</label>
            <input
              type="number"
              min={1}
              value={stripsPerBox}
              onChange={(e) => setStripsPerBox(Math.max(1, Number(e.target.value)))}
              style={{ width: 100 }}
            />
            {sortedSuggestions(packSuggestions.stripsPerBox).length > 0 && (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 6 }}>
                {sortedSuggestions(packSuggestions.stripsPerBox).map((s) => (
                  <button
                    key={s.value}
                    type="button"
                    className="btn-secondary btn"
                    onClick={() => setStripsPerBox(s.value)}
                    style={{ padding: '3px 10px', fontSize: 12 }}
                  >
                    {s.value} — used by {s.pharmacyCount} pharmac{s.pharmacyCount === 1 ? 'y' : 'ies'}
                  </button>
                ))}
              </div>
            )}
            <p style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 6, marginBottom: 0 }}>
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

      <input
        placeholder="Search by name, generic, or manufacturer…"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        autoComplete="off"
        style={{ width: '100%', marginBottom: 12 }}
      />

      <div className="card" style={{ padding: 0 }}>
        <div className="table-scroll">
          <table className="responsive">
            <thead>
              <tr>
                <th>Name</th>
                <th>Generic</th>
                <th>Manufacturer</th>
                <th>Unit</th>
                <th>Pcs/Strip</th>
                <th>Strips/Box</th>
                <th>On hand</th>
                <th>Reorder level</th>
              </tr>
            </thead>
            <tbody>
              {filteredProducts.map((p) => (
                <tr key={p.id}>
                  <td data-label="Name">{p.name}</td>
                  <td data-label="Generic">{p.genericName ?? '—'}</td>
                  <td data-label="Manufacturer">{p.manufacturerName ?? '—'}</td>
                  <td data-label="Unit">{p.unit}</td>
                  <td data-label="Pcs/Strip">{p.piecesPerStrip}</td>
                  <td data-label="Strips/Box">{p.stripsPerBox}</td>
                  <td
                    data-label="On hand"
                    style={{ color: p.qtyOnHand <= p.reorderLevel ? 'var(--danger)' : undefined, fontWeight: 600 }}
                  >
                    {formatStock(p.qtyOnHand, p.piecesPerStrip, p.stripsPerBox, p.unit)}
                  </td>
                  <td data-label="Reorder level">{p.reorderLevel}</td>
                </tr>
              ))}
              {filteredProducts.length === 0 && (
                <tr>
                  <td colSpan={8} style={{ color: 'var(--text-muted)' }}>
                    {products.length === 0 ? 'No products yet.' : 'No products match your search.'}
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
