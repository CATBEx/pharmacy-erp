import { useEffect, useState } from 'react';
import { api } from '../../api/client';

interface InvoiceItem {
  productName: string;
  qty: number;
}

interface Invoice {
  id: number;
  totalAmount: string;
  saleDate: string;
  salesmanName: string | null;
  items: InvoiceItem[];
}

const PAGE_SIZE = 20;

function ItemsCell({ items }: { items: InvoiceItem[] }) {
  if (items.length === 0) return <span style={{ color: 'var(--text-muted)' }}>—</span>;
  return <span>{items.map((it) => `${it.productName} ×${it.qty}`).join(', ')}</span>;
}

export function SalesHistoryPage() {
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0); // 0-indexed
  const [loading, setLoading] = useState(false);

  // Search/date inputs are debounced before hitting the server -- see architecture-plan.md's
  // note on why this page searches server-side (bug #13) unlike Products/Purchases.
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');

  useEffect(() => {
    const id = setTimeout(() => {
      setSearch(searchInput.trim());
      setPage(0);
    }, 350);
    return () => clearTimeout(id);
  }, [searchInput]);

  useEffect(() => {
    setPage(0);
  }, [dateFrom, dateTo]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    api
      .get<{ items: Invoice[]; total: number }>('/sales', {
        params: {
          limit: PAGE_SIZE,
          offset: page * PAGE_SIZE,
          search: search || undefined,
          dateFrom: dateFrom || undefined,
          dateTo: dateTo || undefined,
        },
      })
      .then((res) => {
        if (cancelled) return;
        setInvoices(res.data.items);
        setTotal(res.data.total);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [page, search, dateFrom, dateTo]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div>
      <h1 style={{ fontSize: 22, marginBottom: 4 }}>Sales</h1>
      <p style={{ color: 'var(--text-muted)', marginBottom: 20 }}>
        Recent checkouts — see the Dashboard for revenue and profit reporting.
      </p>

      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 12, alignItems: 'flex-end' }}>
        <div style={{ flex: '1 1 240px' }}>
          <input
            placeholder="Search by salesman or product…"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            autoComplete="off"
            style={{ width: '100%' }}
          />
        </div>
        <div>
          <label style={{ fontSize: 11, color: 'var(--text-muted)', display: 'block', marginBottom: 2 }}>From</label>
          <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
        </div>
        <div>
          <label style={{ fontSize: 11, color: 'var(--text-muted)', display: 'block', marginBottom: 2 }}>To</label>
          <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
        </div>
      </div>

      <div className="card" style={{ padding: 0 }}>
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>Date</th>
                <th>Sold by</th>
                <th>Items</th>
                <th>Total</th>
              </tr>
            </thead>
            <tbody>
              {invoices.map((inv) => (
                <tr key={inv.id}>
                  <td style={{ whiteSpace: 'nowrap' }}>{new Date(inv.saleDate).toLocaleString()}</td>
                  <td>{inv.salesmanName || '—'}</td>
                  <td>
                    <ItemsCell items={inv.items} />
                  </td>
                  <td style={{ fontWeight: 600, whiteSpace: 'nowrap' }}>{inv.totalAmount}</td>
                </tr>
              ))}
              {invoices.length === 0 && (
                <tr>
                  <td colSpan={4} style={{ color: 'var(--text-muted)' }}>
                    {loading ? 'Loading…' : total === 0 && !search && !dateFrom && !dateTo ? 'No sales recorded yet.' : 'No sales match your search.'}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {total > 0 && (
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 12, gap: 10, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>
            Page {page + 1} of {totalPages} &middot; {total} sale{total === 1 ? '' : 's'}
          </span>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn-secondary btn" disabled={page === 0} onClick={() => setPage((p) => Math.max(0, p - 1))}>
              ← Prev
            </button>
            <button
              className="btn-secondary btn"
              disabled={page + 1 >= totalPages}
              onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
            >
              Next →
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
