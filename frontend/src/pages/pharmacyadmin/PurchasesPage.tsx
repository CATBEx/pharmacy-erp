import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { api } from '../../api/client';
import { formatStock, toPieces } from '../../utils/packSize';

interface Product {
  id: number;
  name: string;
  unit: string;
  piecesPerStrip: number;
  stripsPerBox: number;
  // From the shared catalog via medicineMasterId -- null for a product with no catalog link.
  genericName: string | null;
  manufacturerName: string | null;
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
  // purchaseAmount is the TOTAL paid for the whole batch (bug #9), not per-unit -- the backend
  // divides by qty and stores the per-unit cost, same as it always has internally.
  const [form, setForm] = useState({ supplierId: '', purchaseAmount: '', batchNumber: '' });

  // Searchable product picker (type to filter the pharmacy's own product list, click/pick to
  // select) -- replaces the old plain <select>, which was unusable once a pharmacy has more
  // than a screenful of products.
  const [productQuery, setProductQuery] = useState('');
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);

  // Box / Strip / Pcs -- three combinable integer inputs instead of one plain quantity field,
  // converted to a single piece count using the selected product's own pack size (see
  // architecture-plan.md's pack/piece conversion feature). Backend still stores one plain piece
  // count, unchanged.
  const [box, setBox] = useState('');
  const [strip, setStrip] = useState('');
  const [pcs, setPcs] = useState('');

  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // Search box over the purchase history (bug #11) -- matches the linked product's name/generic/
  // manufacturer, same fields the Products page search matches.
  const [historyQuery, setHistoryQuery] = useState('');

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

  function productById(id: number) {
    return products.find((p) => p.id === id);
  }

  const productSuggestions = useMemo(() => {
    const q = productQuery.trim().toLowerCase();
    if (!q) return [];
    return products.filter((p) => p.name.toLowerCase().includes(q)).slice(0, 8);
  }, [productQuery, products]);

  const filteredPurchases = useMemo(() => {
    const q = historyQuery.trim().toLowerCase();
    if (!q) return purchases;
    return purchases.filter((p) => {
      const prod = productById(p.productId);
      return [prod?.name, prod?.genericName, prod?.manufacturerName].some((f) => f?.toLowerCase().includes(q));
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [historyQuery, purchases, products]);

  function pickProduct(p: Product) {
    setSelectedProduct(p);
    setProductQuery(p.name);
  }

  const totalPieces = selectedProduct
    ? toPieces(Number(box) || 0, Number(strip) || 0, Number(pcs) || 0, selectedProduct.piecesPerStrip, selectedProduct.stripsPerBox)
    : 0;

  async function handleCreate(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (!selectedProduct) {
      setError('Select a product from the list');
      return;
    }
    if (totalPieces <= 0) {
      setError('Enter a quantity (Box, Strip, and/or Pcs)');
      return;
    }
    setSaving(true);
    try {
      await api.post('/purchases', {
        productId: selectedProduct.id,
        supplierId: form.supplierId ? Number(form.supplierId) : undefined,
        qty: totalPieces,
        purchaseAmount: form.purchaseAmount,
        batchNumber: form.batchNumber || undefined,
      });
      setForm({ supplierId: '', purchaseAmount: '', batchNumber: '' });
      setProductQuery('');
      setSelectedProduct(null);
      setBox('');
      setStrip('');
      setPcs('');
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
          <div className="form-row" style={{ position: 'relative' }}>
            <label>Product</label>
            <input
              required
              placeholder="Search your products…"
              value={productQuery}
              onChange={(e) => {
                setProductQuery(e.target.value);
                setSelectedProduct(null); // typing again means it's no longer the previously picked match
              }}
              autoComplete="off"
            />
            {productQuery && !selectedProduct && productSuggestions.length > 0 && (
              <div
                className="card"
                style={{ position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 10, padding: 4, maxHeight: 220, overflowY: 'auto' }}
              >
                {productSuggestions.map((p) => (
                  <div
                    key={p.id}
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => pickProduct(p)}
                    style={{ padding: '8px 10px', cursor: 'pointer', borderRadius: 6, fontSize: 13 }}
                  >
                    <div>{p.name}</div>
                    {(p.genericName || p.manufacturerName) && (
                      <div style={{ color: 'var(--text-muted)', fontSize: 12 }}>
                        {[p.genericName, p.manufacturerName].filter(Boolean).join(' · ')}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
            {selectedProduct && (
              <span style={{ fontSize: 12, color: 'var(--success)' }}>
                {[selectedProduct.genericName, selectedProduct.manufacturerName].filter(Boolean).join(' · ')}
                {(selectedProduct.genericName || selectedProduct.manufacturerName) && ' — '}
                {selectedProduct.piecesPerStrip > 1 || selectedProduct.stripsPerBox > 1
                  ? `${selectedProduct.piecesPerStrip} pcs/strip, ${selectedProduct.stripsPerBox} strips/box`
                  : 'Not tracked in packs — enter Pcs'}
              </span>
            )}
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
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              {([
                ['Box', box, setBox],
                ['Strip', strip, setStrip],
                ['Pcs', pcs, setPcs],
              ] as const).map(([label, value, setValue]) => (
                <div key={label}>
                  <input
                    type="number"
                    inputMode="numeric"
                    min={0}
                    placeholder="0"
                    value={value}
                    onChange={(e) => setValue(e.target.value)}
                    style={{ width: 70 }}
                  />
                  <div style={{ fontSize: 11, color: 'var(--text-muted)', textAlign: 'center', marginTop: 2 }}>{label}</div>
                </div>
              ))}
            </div>
            <p style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 8, marginBottom: 0 }}>
              = <strong>{totalPieces}</strong> pieces total
            </p>
          </div>

          <div className="form-row">
            <label>Purchase Amount (total paid)</label>
            <input
              type="text"
              inputMode="decimal"
              required
              placeholder="e.g. 1500.00"
              value={form.purchaseAmount}
              onChange={(e) => setForm({ ...form, purchaseAmount: e.target.value })}
            />
            {totalPieces > 0 && Number(form.purchaseAmount) > 0 && (
              <p style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4, marginBottom: 0 }}>
                ≈ {(Number(form.purchaseAmount) / totalPieces).toFixed(2)} per piece
              </p>
            )}
          </div>

          <div className="form-row">
            <label>Batch number (optional)</label>
            <input
              value={form.batchNumber}
              onChange={(e) => setForm({ ...form, batchNumber: e.target.value })}
              placeholder="Auto-generated if left blank"
            />
          </div>

          {error && <p className="error-text">{error}</p>}
          <button className="btn" type="submit" disabled={saving}>
            {saving ? 'Saving…' : 'Record purchase'}
          </button>
        </form>
      )}

      <input
        placeholder="Search history by product, generic, or manufacturer…"
        value={historyQuery}
        onChange={(e) => setHistoryQuery(e.target.value)}
        autoComplete="off"
        style={{ width: '100%', marginBottom: 12 }}
      />

      <div className="card" style={{ padding: 0 }}>
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>Product</th>
                <th>Generic</th>
                <th>Manufacturer</th>
                <th>Qty</th>
                <th>Unit price</th>
                <th>Batch</th>
                <th>Date</th>
              </tr>
            </thead>
            <tbody>
              {filteredPurchases.map((p) => {
                const prod = productById(p.productId);
                return (
                  <tr key={p.id}>
                    <td>{prod?.name ?? `#${p.productId}`}</td>
                    <td>{prod?.genericName ?? '—'}</td>
                    <td>{prod?.manufacturerName ?? '—'}</td>
                    <td>{prod ? formatStock(p.qty, prod.piecesPerStrip, prod.stripsPerBox, prod.unit) : p.qty}</td>
                    <td>{p.purchasePrice}</td>
                    <td>{p.batchNumber || '—'}</td>
                    <td>{new Date(p.purchaseDate).toLocaleDateString()}</td>
                  </tr>
                );
              })}
              {filteredPurchases.length === 0 && (
                <tr>
                  <td colSpan={7} style={{ color: 'var(--text-muted)' }}>
                    {purchases.length === 0 ? 'No stock recorded yet.' : 'No purchases match your search.'}
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
