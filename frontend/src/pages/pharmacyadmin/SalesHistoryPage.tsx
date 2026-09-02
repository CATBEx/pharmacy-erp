import { useEffect, useState } from 'react';
import { api } from '../../api/client';

interface Invoice {
  id: number;
  totalAmount: string;
  saleDate: string;
  salesmanName: string | null;
  itemCount: number;
}

export function SalesHistoryPage() {
  const [invoices, setInvoices] = useState<Invoice[]>([]);

  useEffect(() => {
    api.get<Invoice[]>('/sales').then((res) => setInvoices(res.data));
  }, []);

  return (
    <div>
      <h1 style={{ fontSize: 22, marginBottom: 4 }}>Sales</h1>
      <p style={{ color: 'var(--text-muted)', marginBottom: 20 }}>
        Recent checkouts. Full revenue/profit reporting lands in the Phase 5 dashboard.
      </p>
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
                  <td>{new Date(inv.saleDate).toLocaleString()}</td>
                  <td>{inv.salesmanName || '—'}</td>
                  <td>{inv.itemCount}</td>
                  <td style={{ fontWeight: 600 }}>{inv.totalAmount}</td>
                </tr>
              ))}
              {invoices.length === 0 && (
                <tr>
                  <td colSpan={4} style={{ color: 'var(--text-muted)' }}>
                    No sales recorded yet.
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
