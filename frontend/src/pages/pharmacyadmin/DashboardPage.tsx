import { useEffect, useMemo, useRef, useState } from 'react';
import { api } from '../../api/client';
import { formatStock } from '../../utils/packSize';

interface Summary {
  cashFlowToday: number;
  cashFlowDeltaPct: number | null;
  dailyRevenue: number;
  revenueDeltaPct: number | null;
  dailyProfit: number;
  profitDeltaPct: number | null;
  profitMarginPct: number;
  inventoryValue: number;
  availableStockUnits: number;
  availableStockSkus: number;
  lowStockCount: number;
}

interface TrendPoint {
  date: string; // YYYY-MM-DD
  revenue: number;
}

interface RecentSale {
  id: number;
  totalAmount: string;
  saleDate: string;
  salesmanName: string | null;
  itemCount: number;
}

interface LowStockItem {
  id: number;
  name: string;
  qtyOnHand: number;
  piecesPerStrip: number;
  stripsPerBox: number;
  reorderLevel: number;
  unit: string;
}

const REFRESH_MS = 30_000;

function money(n: number) {
  return '৳' + Math.round(n).toLocaleString('en-IN');
}

function dateLabel(iso: string) {
  const d = new Date(iso + 'T00:00:00Z');
  const todayIso = new Date().toISOString().slice(0, 10);
  if (iso === todayIso) return 'Today';
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return `${months[d.getUTCMonth()]} ${d.getUTCDate()}`;
}

function Delta({ pct }: { pct: number | null }) {
  if (pct === null) return <span style={{ color: 'var(--text-muted)' }}>new</span>;
  const up = pct >= 0;
  return (
    <span style={{ color: up ? 'var(--success)' : 'var(--danger)', fontWeight: 600 }}>
      {up ? '▲' : '▼'} {Math.abs(pct)}%
    </span>
  );
}

function KpiTile({ label, value, sub }: { label: string; value: React.ReactNode; sub: React.ReactNode }) {
  return (
    <div className="card kpi-tile">
      <div style={{ fontSize: 12, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.03em', color: 'var(--text-muted)', marginBottom: 10 }}>
        {label}
      </div>
      <div style={{ fontSize: 24, fontWeight: 700, lineHeight: 1.1, letterSpacing: '-0.01em' }}>{value}</div>
      <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 8 }}>{sub}</div>
    </div>
  );
}

function SalesTrendChart({ points }: { points: TrendPoint[] }) {
  const [hover, setHover] = useState<number | null>(null);
  const wrapRef = useRef<HTMLDivElement>(null);

  const VB_W = 720;
  const VB_H = 260;
  const PAD_L = 44;
  const PAD_R = 8;
  const PAD_T = 12;
  const PAD_B = 24;
  const plotW = VB_W - PAD_L - PAD_R;
  const plotH = VB_H - PAD_T - PAD_B;
  const n = points.length;

  const { niceMax, xAt, yAt } = useMemo(() => {
    const maxV = Math.max(1, ...points.map((p) => p.revenue));
    let niceMax = Math.ceil(maxV / 20000) * 20000;
    if (niceMax < maxV * 1.05) niceMax += 20000;
    const xAt = (i: number) => (n <= 1 ? PAD_L + plotW / 2 : PAD_L + (plotW * i) / (n - 1));
    const yAt = (v: number) => PAD_T + plotH - (plotH * v) / niceMax;
    return { niceMax, xAt, yAt };
  }, [points, n]);

  if (n === 0) {
    return <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-muted)', fontSize: 13 }}>No sales yet.</div>;
  }

  const areaD =
    `M ${xAt(0)} ${yAt(0)}` +
    points.map((p, i) => ` L ${xAt(i)} ${yAt(p.revenue)}`).join('') +
    ` L ${xAt(n - 1)} ${yAt(0)} Z`;
  const lineD = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${xAt(i)} ${yAt(p.revenue)}`).join(' ');

  const steps = 4;
  const gridlines = Array.from({ length: steps + 1 }, (_, s) => {
    const gv = (niceMax / steps) * s;
    return { y: yAt(gv), label: gv >= 1000 ? Math.round(gv / 1000) + 'k' : String(gv) };
  });

  const labelIdx = n <= 7 ? points.map((_, i) => i) : [0, Math.floor((n - 1) / 2), n - 1];
  const colW = plotW / n;
  const last = points[n - 1];

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: -8 }}>
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--primary)' }}>{money(last.revenue)}</div>
          <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{dateLabel(last.date)}</div>
        </div>
      </div>
      <div ref={wrapRef} style={{ position: 'relative', marginTop: 10 }}>
        <svg viewBox={`0 0 ${VB_W} ${VB_H}`} preserveAspectRatio="none" style={{ width: '100%', height: 260, display: 'block', overflow: 'visible' }}>
          {gridlines.map((g, i) => (
            <g key={i}>
              <line x1={PAD_L} x2={VB_W - PAD_R} y1={g.y} y2={g.y} stroke="var(--border)" strokeWidth={1} />
              <text x={PAD_L - 8} y={g.y + 3} fontSize={11} fill="var(--text-muted)" textAnchor="end">
                {g.label}
              </text>
            </g>
          ))}

          <path d={areaD} fill="var(--primary)" opacity={0.1} />
          <path d={lineD} fill="none" stroke="var(--primary)" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
          <circle cx={xAt(n - 1)} cy={yAt(last.revenue)} r={4} fill="var(--primary)" stroke="var(--surface)" strokeWidth={2} />

          {hover !== null && (
            <>
              <line x1={xAt(hover)} x2={xAt(hover)} y1={PAD_T} y2={VB_H - PAD_B} stroke="var(--border)" strokeWidth={1} />
              <circle cx={xAt(hover)} cy={yAt(points[hover].revenue)} r={4} fill="var(--primary)" stroke="var(--surface)" strokeWidth={2} />
            </>
          )}

          {labelIdx.map((i) => (
            <text
              key={i}
              x={xAt(i)}
              y={VB_H - 4}
              fontSize={11}
              fill="var(--text-muted)"
              textAnchor={i === 0 ? 'start' : i === n - 1 ? 'end' : 'middle'}
            >
              {dateLabel(points[i].date)}
            </text>
          ))}

          {points.map((_, i) => (
            <rect
              key={i}
              x={PAD_L + colW * i}
              y={0}
              width={colW}
              height={VB_H}
              fill="transparent"
              onMouseEnter={() => setHover(i)}
              onMouseMove={() => setHover(i)}
              onMouseLeave={() => setHover(null)}
            />
          ))}
        </svg>

        {hover !== null && wrapRef.current && (
          <div
            style={{
              position: 'absolute',
              pointerEvents: 'none',
              left: `${(xAt(hover) / VB_W) * 100}%`,
              top: `${(yAt(points[hover].revenue) / VB_H) * 100}%`,
              transform: 'translate(-50%, -110%)',
              background: 'var(--text)',
              color: 'white',
              borderRadius: 6,
              padding: '8px 10px',
              fontSize: 12,
              lineHeight: 1.4,
              whiteSpace: 'nowrap',
            }}
          >
            <div style={{ fontSize: 14, fontWeight: 700 }}>{money(points[hover].revenue)}</div>
            <div style={{ color: '#d1d5db', marginTop: 1 }}>{dateLabel(points[hover].date)}</div>
          </div>
        )}
      </div>
    </div>
  );
}

export function DashboardPage() {
  const [summary, setSummary] = useState<Summary | null>(null);
  const [range, setRange] = useState<7 | 30>(7);
  const [trend, setTrend] = useState<TrendPoint[]>([]);
  const [lowStock, setLowStock] = useState<LowStockItem[]>([]);
  const [recentSales, setRecentSales] = useState<RecentSale[]>([]);
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null);

  async function loadAll() {
    const [summaryRes, lowStockRes, recentRes] = await Promise.all([
      api.get<Summary>('/dashboard/summary'),
      api.get<LowStockItem[]>('/products/low-stock'),
      api.get<RecentSale[]>('/dashboard/recent-sales'),
    ]);
    setSummary(summaryRes.data);
    setLowStock(lowStockRes.data);
    setRecentSales(recentRes.data);
    setUpdatedAt(new Date());
  }

  async function loadTrend(days: 7 | 30) {
    const res = await api.get<TrendPoint[]>('/dashboard/trend', { params: { days } });
    setTrend(res.data);
  }

  useEffect(() => {
    loadAll();
    const id = setInterval(loadAll, REFRESH_MS);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    loadTrend(range);
  }, [range]);

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 20, flexWrap: 'wrap', gap: 8 }}>
        <h1 style={{ fontSize: 22, margin: 0 }}>Dashboard</h1>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 13, color: 'var(--text-muted)' }}>
          <span style={{ width: 7, height: 7, borderRadius: '50%', background: 'var(--success)', display: 'inline-block' }} />
          Live &middot; updated {updatedAt ? updatedAt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '—'}
        </span>
      </div>

      {!summary ? (
        <p style={{ color: 'var(--text-muted)' }}>Loading…</p>
      ) : (
        <>
          <div className="kpi-row">
            <KpiTile
              label="Cash flow (today)"
              value={money(summary.cashFlowToday)}
              sub={<><Delta pct={summary.cashFlowDeltaPct} /> vs yesterday</>}
            />
            <KpiTile
              label="Daily revenue"
              value={money(summary.dailyRevenue)}
              sub={<><Delta pct={summary.revenueDeltaPct} /> vs yesterday</>}
            />
            <KpiTile
              label="Daily profit"
              value={money(summary.dailyProfit)}
              sub={<>{summary.profitMarginPct}% margin &middot; <Delta pct={summary.profitDeltaPct} /></>}
            />
            <KpiTile
              label="Inventory value"
              value={money(summary.inventoryValue)}
              sub={<>at cost &middot; {summary.availableStockSkus} SKUs</>}
            />
            <KpiTile
              label="Available stock"
              value={<>{summary.availableStockUnits.toLocaleString()} <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-muted)' }}>units</span></>}
              sub={
                summary.lowStockCount > 0 ? (
                  <span style={{ color: 'var(--warning)', fontWeight: 600 }}>{summary.lowStockCount} low &middot; reorder soon</span>
                ) : (
                  'all above reorder level'
                )
              }
            />
          </div>

          <div className="split-row">
            <section className="card split-main">
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div>
                  <h2 style={{ fontSize: 15, margin: 0 }}>Sales trend</h2>
                  <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>Daily revenue, ৳</div>
                </div>
                <div style={{ display: 'inline-flex', border: '1px solid var(--border)', borderRadius: 6, overflow: 'hidden' }}>
                  {([7, 30] as const).map((r) => (
                    <button
                      key={r}
                      onClick={() => setRange(r)}
                      style={{
                        fontFamily: 'inherit',
                        fontSize: 13,
                        fontWeight: 500,
                        border: 'none',
                        borderLeft: r === 30 ? '1px solid var(--border)' : 'none',
                        padding: '6px 14px',
                        cursor: 'pointer',
                        background: range === r ? 'var(--primary)' : 'var(--surface)',
                        color: range === r ? 'white' : 'var(--text-muted)',
                      }}
                    >
                      Last {r} days
                    </button>
                  ))}
                </div>
              </div>
              <SalesTrendChart points={trend} />
            </section>

            <section className="card split-side">
              <div>
                <h2 style={{ fontSize: 15, margin: 0 }}>Low stock</h2>
                <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>At or below reorder level</div>
              </div>
              <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 2, flex: 1 }}>
                {lowStock.length === 0 && (
                  <p style={{ color: 'var(--text-muted)', fontSize: 13 }}>Nothing below its reorder level.</p>
                )}
                {lowStock.slice(0, 6).map((p, i) => (
                  <div
                    key={p.id}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: '10px 0',
                      borderBottom: i === Math.min(lowStock.length, 6) - 1 ? 'none' : '1px solid var(--border)',
                      gap: 10,
                    }}
                  >
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 500 }}>{p.name}</div>
                      <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>
                        {formatStock(p.qtyOnHand, p.piecesPerStrip, p.stripsPerBox, p.unit)} left &middot; reorder at{' '}
                        {p.reorderLevel}
                      </div>
                    </div>
                    <span className="badge badge-inactive">Low</span>
                  </div>
                ))}
              </div>
              {lowStock.length > 6 && (
                <a
                  href="/products"
                  style={{
                    display: 'block',
                    textAlign: 'center',
                    fontSize: 13,
                    fontWeight: 600,
                    color: 'var(--primary)',
                    textDecoration: 'none',
                    marginTop: 14,
                    paddingTop: 12,
                    borderTop: '1px solid var(--border)',
                  }}
                >
                  View all {lowStock.length} low-stock items →
                </a>
              )}
            </section>
          </div>

          <section className="card" style={{ padding: 0 }}>
            <div style={{ padding: '20px 20px 4px' }}>
              <h2 style={{ fontSize: 15, margin: 0 }}>Recent sales</h2>
              <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>Latest checkouts across all salesmen</div>
            </div>
            <div className="table-scroll">
              <table style={{ marginTop: 8 }}>
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Sold by</th>
                    <th>Items</th>
                    <th>Total</th>
                  </tr>
                </thead>
                <tbody>
                  {recentSales.map((inv) => (
                    <tr key={inv.id}>
                      <td>{new Date(inv.saleDate).toLocaleString()}</td>
                      <td>{inv.salesmanName || '—'}</td>
                      <td>{inv.itemCount}</td>
                      <td style={{ fontWeight: 600 }}>{Number(inv.totalAmount).toFixed(2)}</td>
                    </tr>
                  ))}
                  {recentSales.length === 0 && (
                    <tr>
                      <td colSpan={4} style={{ color: 'var(--text-muted)' }}>
                        No sales recorded yet.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}
    </div>
  );
}
