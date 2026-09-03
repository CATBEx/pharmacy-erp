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
  items: InvoiceItem[];
}

function ItemsCell({ items }: { items: InvoiceItem[] }) {
  if (items.length === 0) return <span style={{ color: 'var(--text-muted)' }}>—</span>;
  return <span>{items.map((it) => `${it.productName} ×${it.qty}`).join(', ')}</span>;
}

// Bug #18: a salesman's own sales, plain chronological list -- confirmed with the user
// as no search box, no date filters, no pagination (unlike SalesHistoryPage, which is
// the pharmacy_admin/manager version with all three). Backed by GET /sales/mine, which
// is force-scoped server-side to the logged-in salesman's own invoices only -- there's
// no way for this page to ever show anyone else's sales, or the pharmacy's totals.
export function MySalesPage() {
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    api
      .get<{ items: Invoice[]; total: number }>('/sales/mine')
      .then((res) => {
        if (!cancelled) setInvoices(res.data.items);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div>
      <h1 style={{ fontSize: 22, marginBottom: 4 }}>My Sales</h1>
      <p style={{ color: 'var(--text-muted)', marginBottom: 20 }}>Your most recent checkouts.</p>

      <div className="card" style={{ padding: 0 }}>
        <div className="table-scroll">
          <table className="responsive">
            <thead>
              <tr>
                <th>Date</th>
                <th>Items</th>
                <th>Total</th>
              </tr>
            </thead>
            <tbody>
              {invoices.map((inv) => (
                <tr key={inv.id}>
                  <td data-label="Date" style={{ whiteSpace: 'nowrap' }}>
                    {new Date(inv.saleDate).toLocaleString()}
                  </td>
                  <td data-label="Items">
                    <ItemsCell items={inv.items} />
                  </td>
                  <td data-label="Total" style={{ fontWeight: 600, whiteSpace: 'nowrap' }}>
                    {inv.totalAmount}
                  </td>
                </tr>
              ))}
              {invoices.length === 0 && (
                <tr>
                  <td colSpan={3} style={{ color: 'var(--text-muted)' }}>
                    {loading ? 'Loading…' : "You haven't recorded any sales yet."}
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
