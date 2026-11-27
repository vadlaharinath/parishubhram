import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, PieChart, Pie, Cell, Legend,
  LineChart, Line,
} from 'recharts';
import { supabase } from '../lib/supabase';
import './StatsPage.css';

// ─── Types ─────────────────────────────────────────────────────────────────
interface Report {
  id: string;
  category: string;
  severity: string;
  status: string;
  created_at: string;
  ward_id: string | null;
}

interface CategoryStat { name: string; count: number; }
interface StatusStat   { name: string; value: number; color: string; }
interface TrendPoint   { month: string; reported: number; resolved: number; }
interface SeverityStat { name: string; count: number; }

// ─── Constants ──────────────────────────────────────────────────────────────
const CATEGORY_LABELS: Record<string, string> = {
  garbage_dump:        'Garbage Dump',
  overflowing_bin:     'Overflow Bin',
  drain_overflow:      'Drain Overflow',
  construction_debris: 'C&D Debris',
  plastic_waste:       'Plastic Waste',
  road_damage:         'Pothole',
  other:               'Other',
};

const SEVERITY_COLORS: Record<string, string> = {
  low:      '#22c55e',
  medium:   '#f59e0b',
  high:     '#ef4444',
  critical: '#7c3aed',
};

const PIE_COLORS = ['#dc2626', '#16a34a'];

const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

// ─── Helpers ────────────────────────────────────────────────────────────────
function getMonthKey(dateStr: string) {
  const d = new Date(dateStr);
  return `${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
}

// ─── Custom Tooltip for recharts ────────────────────────────────────────────
const CustomBarTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="chart-tooltip">
      <p className="chart-tooltip-label">{label}</p>
      {payload.map((p: any) => (
        <p key={p.name} style={{ color: p.fill || p.color }}>
          {p.name}: <strong>{p.value}</strong>
        </p>
      ))}
    </div>
  );
};

// ─── CSV Export Helper ───────────────────────────────────────────────────────
function exportToCSV(reports: Report[]) {
  const headers = ['ID', 'Category', 'Severity', 'Status', 'Ward ID', 'Date'];
  const rows = reports.map((r) => [
    r.id,
    CATEGORY_LABELS[r.category] || r.category,
    r.severity,
    r.status,
    r.ward_id || 'Outside GHMC',
    new Date(r.created_at).toLocaleDateString('en-IN'),
  ]);

  const csvContent = [
    headers.join(','),
    ...rows.map((row) => row.map((cell) => `"${cell}"`).join(',')),
  ].join('\n');

  // Create a temporary <a> tag to trigger download
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `parishubhram_reports_${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

// ─── Main Component ──────────────────────────────────────────────────────────
export default function StatsPage() {
  const navigate = useNavigate();
  const [reports, setReports]           = useState<Report[]>([]);
  const [loading, setLoading]           = useState(true);
  const [exporting, setExporting]       = useState(false);

  // Derived chart data
  const [categoryData, setCategoryData] = useState<CategoryStat[]>([]);
  const [statusData, setStatusData]     = useState<StatusStat[]>([]);
  const [trendData, setTrendData]       = useState<TrendPoint[]>([]);
  const [severityData, setSeverityData] = useState<SeverityStat[]>([]);

  useEffect(() => {
    const fetchAll = async () => {
      setLoading(true);
      const { data, error } = await supabase
        .from('reports')
        .select('id, category, severity, status, created_at, ward_id')
        .order('created_at', { ascending: true });

      if (error) { console.error(error); setLoading(false); return; }
      const all = data as Report[];
      setReports(all);

      // ── 1. Category Bar Chart ──
      const catMap: Record<string, number> = {};
      all.forEach((r) => { catMap[r.category] = (catMap[r.category] || 0) + 1; });
      setCategoryData(
        Object.entries(catMap)
          .map(([k, v]) => ({ name: CATEGORY_LABELS[k] || k, count: v }))
          .sort((a, b) => b.count - a.count)
      );

      // ── 2. Status Pie Chart ──
      const active   = all.filter((r) => r.status !== 'resolved').length;
      const resolved = all.filter((r) => r.status === 'resolved').length;
      setStatusData([
        { name: '🔴 Active',   value: active,   color: '#dc2626' },
        { name: '🟢 Resolved', value: resolved, color: '#16a34a' },
      ]);

      // ── 3. Monthly Trend Line Chart (last 6 months) ──
      const monthMap: Record<string, { reported: number; resolved: number }> = {};
      all.forEach((r) => {
        const mk = getMonthKey(r.created_at);
        if (!monthMap[mk]) monthMap[mk] = { reported: 0, resolved: 0 };
        if (r.status === 'resolved') monthMap[mk].resolved++;
        else monthMap[mk].reported++;
      });
      const trend = Object.entries(monthMap)
        .slice(-6)
        .map(([month, v]) => ({ month, ...v }));
      setTrendData(trend);

      // ── 4. Severity Bar Chart ──
      const sevMap: Record<string, number> = {};
      all.forEach((r) => { sevMap[r.severity] = (sevMap[r.severity] || 0) + 1; });
      setSeverityData(
        ['low', 'medium', 'high', 'critical']
          .filter((s) => sevMap[s])
          .map((s) => ({
            name: s.charAt(0).toUpperCase() + s.slice(1),
            count: sevMap[s] || 0,
          }))
      );

      setLoading(false);
    };

    fetchAll();
  }, []);

  const handleExport = () => {
    setExporting(true);
    exportToCSV(reports);
    setTimeout(() => setExporting(false), 1000);
  };

  const totalReports   = reports.length;
  const totalResolved  = reports.filter((r) => r.status === 'resolved').length;
  const totalActive    = totalReports - totalResolved;
  const resolutionRate = totalReports > 0
    ? Math.round((totalResolved / totalReports) * 100)
    : 0;

  if (loading) {
    return (
      <div className="stats-loading">
        <div className="stats-spinner" />
        <p>Loading analytics...</p>
      </div>
    );
  }

  return (
    <div className="stats-page">
      {/* ── Header ── */}
      <div className="stats-topbar">
        <button className="stats-back-btn" onClick={() => navigate('/')}>
          ← Back to Parishubhram
        </button>
        <button
          className="stats-export-btn"
          onClick={handleExport}
          disabled={exporting || reports.length === 0}
        >
          {exporting ? '⏳ Preparing...' : '📥 Download CSV'}
        </button>
      </div>

      <div className="stats-hero">
        <h1>📊 City-Wide Analytics</h1>
        <p>Hyderabad GHMC · Parishubhram Open Data Dashboard</p>
      </div>

      {/* ── Summary Stats ── */}
      <div className="stats-summary-grid">
        <div className="stats-summary-card">
          <div className="stats-summary-num">{totalReports}</div>
          <div className="stats-summary-lbl">Total Reports Filed</div>
        </div>
        <div className="stats-summary-card">
          <div className="stats-summary-num" style={{ color: '#dc2626' }}>{totalActive}</div>
          <div className="stats-summary-lbl">🔴 Active Blackspots</div>
        </div>
        <div className="stats-summary-card">
          <div className="stats-summary-num" style={{ color: '#16a34a' }}>{totalResolved}</div>
          <div className="stats-summary-lbl">🟢 Spots Resolved</div>
        </div>
        <div className="stats-summary-card">
          <div
            className="stats-summary-num"
            style={{ color: resolutionRate >= 70 ? '#16a34a' : resolutionRate >= 40 ? '#d97706' : '#dc2626' }}
          >
            {resolutionRate}%
          </div>
          <div className="stats-summary-lbl">Resolution Rate</div>
        </div>
      </div>

      {/* ── Charts Grid ── */}
      <div className="stats-charts-grid">

        {/* Chart 1: Complaints by Category */}
        <div className="chart-card chart-card-wide">
          <h2 className="chart-title">🗑️ Complaints by Category</h2>
          <p className="chart-subtitle">Which type of waste problem is reported most?</p>
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={categoryData} margin={{ top: 10, right: 20, left: 0, bottom: 40 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
              <XAxis
                dataKey="name"
                tick={{ fontSize: 11, fill: '#64748b' }}
                angle={-30}
                textAnchor="end"
                interval={0}
              />
              <YAxis tick={{ fontSize: 12, fill: '#64748b' }} allowDecimals={false} />
              <Tooltip content={<CustomBarTooltip />} />
              <Bar dataKey="count" name="Reports" fill="#15803d" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Chart 2: Active vs Resolved Pie */}
        <div className="chart-card">
          <h2 className="chart-title">📈 Resolution Status</h2>
          <p className="chart-subtitle">Active vs cleaned-up blackspots</p>
          {totalReports === 0 ? (
            <div className="chart-empty">No data yet</div>
          ) : (
            <ResponsiveContainer width="100%" height={260}>
              <PieChart>
                <Pie
                  data={statusData}
                  cx="50%"
                  cy="45%"
                  outerRadius={90}
                  dataKey="value"
                  label={({ name, percent = 0 }) =>
                    `${name} ${(percent * 100).toFixed(0)}%`
                  }
                  labelLine={false}
                >
                  {statusData.map((_entry, i) => (
                    <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                  ))}
                </Pie>
                <Legend />
                <Tooltip formatter={(val) => [`${val} reports`]} />
              </PieChart>
            </ResponsiveContainer>
          )}
        </div>

        {/* Chart 3: Monthly Trend */}
        <div className="chart-card chart-card-wide">
          <h2 className="chart-title">📅 Monthly Trend</h2>
          <p className="chart-subtitle">New reports vs resolved spots over time</p>
          {trendData.length < 2 ? (
            <div className="chart-empty">
              📭 Need more data across multiple months to show trend
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={260}>
              <LineChart data={trendData} margin={{ top: 10, right: 20, left: 0, bottom: 10 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="month" tick={{ fontSize: 12, fill: '#64748b' }} />
                <YAxis tick={{ fontSize: 12, fill: '#64748b' }} allowDecimals={false} />
                <Tooltip content={<CustomBarTooltip />} />
                <Legend />
                <Line
                  type="monotone"
                  dataKey="reported"
                  name="🔴 Reported"
                  stroke="#dc2626"
                  strokeWidth={2.5}
                  dot={{ r: 4 }}
                />
                <Line
                  type="monotone"
                  dataKey="resolved"
                  name="🟢 Resolved"
                  stroke="#16a34a"
                  strokeWidth={2.5}
                  dot={{ r: 4 }}
                />
              </LineChart>
            </ResponsiveContainer>
          )}
        </div>

        {/* Chart 4: Severity Breakdown */}
        <div className="chart-card">
          <h2 className="chart-title">⚠️ Severity Breakdown</h2>
          <p className="chart-subtitle">How critical are the reported issues?</p>
          {severityData.length === 0 ? (
            <div className="chart-empty">No data yet</div>
          ) : (
            <ResponsiveContainer width="100%" height={260}>
              <BarChart
                data={severityData}
                layout="vertical"
                margin={{ top: 10, right: 30, left: 20, bottom: 10 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" horizontal={false} />
                <XAxis type="number" tick={{ fontSize: 12 }} allowDecimals={false} />
                <YAxis dataKey="name" type="category" tick={{ fontSize: 13, fontWeight: 600 }} width={70} />
                <Tooltip content={<CustomBarTooltip />} />
                <Bar dataKey="count" name="Reports" radius={[0, 4, 4, 0]}>
                  {severityData.map((_entry, i) => (
                    <Cell
                      key={i}
                      fill={SEVERITY_COLORS[severityData[i].name.toLowerCase()] || '#64748b'}
                    />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>

      </div>

      {/* ── Open Data Notice ── */}
      <div className="stats-opendata-banner">
        <span>🌐</span>
        <div>
          <strong>Open Data Initiative</strong>
          <p>All Parishubhram data is available for public download. Use the CSV export above for your own analysis, journalism, or civic projects.</p>
        </div>
        <button
          className="stats-export-btn"
          onClick={handleExport}
          disabled={exporting || reports.length === 0}
        >
          {exporting ? '⏳ Preparing...' : '📥 Download CSV'}
        </button>
      </div>
    </div>
  );
}
