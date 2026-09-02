import { useEffect, useMemo, useRef, useState } from 'react';
import { api } from '../../api/client';
import { formatStock } from '../../utils/packSize';

interface Product {
  id: number;
  name: string;
  unit: string;
  piecesPerStrip: number;
  stripsPerBox: number;
  qtyOnHand: number;
  // From the shared catalog via medicineMasterId -- null for a product with no catalog link
  // (bug #12) -- shown so a salesman can tell "the Square one" from "the Beximco one".
  genericName: string | null;
  manufacturerName: string | null;
}

interface CartLine {
  productId: number;
  name: string;
  detail: string; // generic · manufacturer, for display only
  unit: string;
  qtyOnHand: number;
  piecesPerStrip: number;
  // Piece/Strip only here (not Box) -- a whole box is never sold to a walk-in customer, that
  // level only matters at stock-in (see PurchasesPage).
  unitMode: 'piece' | 'strip';
  // Bug #14: starts blank ('') so the user has to type a value rather than notice-and-clear a
  // pre-filled 1 -- same string-typed pattern already used for saleAmount/Box/Strip/Pcs elsewhere.
  count: string;
  // Total price charged for this line (bug #12), not per-unit -- the backend divides by qty and
  // stores the per-unit sale price for FIFO/profit bookkeeping; this is simply what the customer
  // is being charged for this item, whatever quantity is in the row.
  saleAmount: string;
}

function lineQty(line: CartLine) {
  const count = Number(line.count) || 0;
  return line.unitMode === 'strip' ? count * line.piecesPerStrip : count;
}

function lineMax(line: CartLine) {
  return line.unitMode === 'strip' ? Math.max(1, Math.floor(line.qtyOnHand / line.piecesPerStrip)) : Math.max(1, line.qtyOnHand);
}

export function SalesPOS() {
  const [products, setProducts] = useState<Product[]>([]);
  const [query, setQuery] = useState('');
  const [cart, setCart] = useState<CartLine[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const searchRef = useRef<HTMLInputElement>(null);
  const priceRefs = useRef<Record<number, HTMLInputElement | null>>({});

  async function loadProducts() {
    const { data } = await api.get<Product[]>('/products');
    setProducts(data);
  }

  useEffect(() => {
    loadProducts();
    searchRef.current?.focus();
  }, []);

  const suggestions = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (q.length < 1) return [];
    return products.filter((p) => p.name.toLowerCase().includes(q)).slice(0, 8);
  }, [query, products]);

  const total = cart.reduce((sum, line) => sum + (Number(line.saleAmount) || 0), 0);

  function addToCart(p: Product) {
    setError(null);
    setSuccess(null);
    setCart((prev) => {
      const existing = prev.find((l) => l.productId === p.id);
      if (existing) {
        return prev.map((l) => (l.productId === p.id ? { ...l, count: String((Number(l.count) || 0) + 1) } : l));
      }
      // Default to Strip when the product has one (medicine sells by the strip most of the
      // time -- see architecture-plan.md); products with no strip packaging just sell by piece.
      const unitMode: 'piece' | 'strip' = p.piecesPerStrip > 1 ? 'strip' : 'piece';
      return [
        ...prev,
        {
          productId: p.id,
          name: p.name,
          detail: [p.genericName, p.manufacturerName].filter(Boolean).join(' · '),
          unit: p.unit,
          qtyOnHand: p.qtyOnHand,
          piecesPerStrip: p.piecesPerStrip,
          unitMode,
          count: '',
          saleAmount: '',
        },
      ];
    });
    setQuery('');
    // Focus the price field of the row just added, so the cashier can type the price
    // immediately without touching the mouse.
    setTimeout(() => priceRefs.current[p.id]?.focus(), 0);
  }

  function handleSearchKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter' && suggestions.length > 0) {
      e.preventDefault();
      addToCart(suggestions[0]);
    }
  }

  function handlePriceKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter') {
      e.preventDefault();
      searchRef.current?.focus();
    }
  }

  function updateLine(productId: number, patch: Partial<CartLine>) {
    setCart((prev) => prev.map((l) => (l.productId === productId ? { ...l, ...patch } : l)));
  }

  function removeLine(productId: number) {
    setCart((prev) => prev.filter((l) => l.productId !== productId));
  }

  async function completeSale() {
    setError(null);
    if (cart.length === 0) return;
    const missingQty = cart.find((l) => !l.count || Number(l.count) <= 0);
    if (missingQty) {
      setError(`Enter a quantity for "${missingQty.name}"`);
      return;
    }
    const missingPrice = cart.find((l) => !l.saleAmount || Number(l.saleAmount) <= 0);
    if (missingPrice) {
      setError(`Enter a total price for "${missingPrice.name}"`);
      return;
    }
    setSaving(true);
    try {
      await api.post('/sales', {
        items: cart.map((l) => ({ productId: l.productId, qty: lineQty(l), saleAmount: l.saleAmount })),
      });
      setSuccess(`Sale completed — ${total.toFixed(2)} total`);
      setCart([]);
      await loadProducts(); // refresh stock levels
      searchRef.current?.focus();
    } catch (err: any) {
      setError(err?.response?.data?.message || 'Failed to complete sale');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="pos-page">
      <h1 style={{ fontSize: 22, marginBottom: 16 }}>Sell</h1>

      <div style={{ position: 'relative', marginBottom: 20 }}>
        <input
          ref={searchRef}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={handleSearchKeyDown}
          placeholder="Search a product and press Enter…"
          autoComplete="off"
          style={{ width: '100%', fontSize: 16, padding: '12px 14px' }}
        />
        {suggestions.length > 0 && (
          <div
            className="card"
            style={{ position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 10, padding: 4, marginTop: 4 }}
          >
            {suggestions.map((p) => (
              <div
                key={p.id}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => addToCart(p)}
                style={{
                  padding: '10px 12px',
                  cursor: 'pointer',
                  borderRadius: 6,
                  display: 'flex',
                  justifyContent: 'space-between',
                  gap: 10,
                  fontSize: 14,
                }}
              >
                <span>
                  <span>{p.name}</span>
                  {(p.genericName || p.manufacturerName) && (
                    <div style={{ color: 'var(--text-muted)', fontSize: 12 }}>
                      {[p.genericName, p.manufacturerName].filter(Boolean).join(' · ')}
                    </div>
                  )}
                </span>
                <span style={{ color: p.qtyOnHand <= 0 ? 'var(--danger)' : 'var(--text-muted)', whiteSpace: 'nowrap' }}>
                  {formatStock(p.qtyOnHand, p.piecesPerStrip, p.stripsPerBox, p.unit)} left
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="card" style={{ padding: 0, marginBottom: 16 }}>
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>Product</th>
                <th style={{ width: 90 }}>Qty</th>
                <th style={{ width: 120 }}>Total price</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {cart.map((line) => (
                <tr key={line.productId}>
                  <td>
                    <div>{line.name}</div>
                    {line.detail && <div style={{ color: 'var(--text-muted)', fontSize: 12 }}>{line.detail}</div>}
                  </td>
                  <td>
                    {line.piecesPerStrip > 1 ? (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                        <div style={{ display: 'flex', gap: 3 }}>
                          {(['strip', 'piece'] as const).map((mode) => (
                            <button
                              key={mode}
                              type="button"
                              className="btn-secondary btn"
                              onClick={() => updateLine(line.productId, { unitMode: mode, count: '' })}
                              style={{
                                padding: '2px 8px',
                                fontSize: 11,
                                ...(line.unitMode === mode
                                  ? { background: 'var(--primary)', color: 'white', borderColor: 'var(--primary)' }
                                  : {}),
                              }}
                            >
                              {mode === 'strip' ? 'Strip' : 'Pcs'}
                            </button>
                          ))}
                        </div>
                        <input
                          type="number"
                          min={1}
                          max={lineMax(line)}
                          placeholder="0"
                          value={line.count}
                          onChange={(e) => updateLine(line.productId, { count: e.target.value })}
                          style={{ width: 70 }}
                        />
                        {line.unitMode === 'strip' && (
                          <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>= {lineQty(line)} pcs</span>
                        )}
                      </div>
                    ) : (
                      <input
                        type="number"
                        min={1}
                        max={line.qtyOnHand}
                        placeholder="0"
                        value={line.count}
                        onChange={(e) => updateLine(line.productId, { count: e.target.value })}
                        style={{ width: 70 }}
                      />
                    )}
                  </td>
                  <td>
                    <input
                      ref={(el) => {
                        priceRefs.current[line.productId] = el;
                      }}
                      type="text"
                      inputMode="decimal"
                      placeholder="0.00"
                      value={line.saleAmount}
                      onChange={(e) => updateLine(line.productId, { saleAmount: e.target.value })}
                      onKeyDown={handlePriceKeyDown}
                      style={{ width: 100 }}
                    />
                  </td>
                  <td>
                    <button className="btn-secondary btn" onClick={() => removeLine(line.productId)} style={{ padding: '4px 10px' }}>
                      ✕
                    </button>
                  </td>
                </tr>
              ))}
              {cart.length === 0 && (
                <tr>
                  <td colSpan={4} style={{ color: 'var(--text-muted)' }}>
                    Search above to add items.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
        <div style={{ fontSize: 20, fontWeight: 700 }}>Total: {total.toFixed(2)}</div>
        <button className="btn" disabled={cart.length === 0 || saving} onClick={completeSale} style={{ fontSize: 16, padding: '12px 24px' }}>
          {saving ? 'Completing…' : 'Complete Sale'}
        </button>
      </div>

      {error && <p className="error-text" style={{ marginTop: 12 }}>{error}</p>}
      {success && <p style={{ color: 'var(--success)', marginTop: 12, fontWeight: 600 }}>{success}</p>}
    </div>
  );
}
