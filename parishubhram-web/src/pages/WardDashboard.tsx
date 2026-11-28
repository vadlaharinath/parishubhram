import { useEffect, useState, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import * as maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { supabase } from '../lib/supabase';
import { useToast } from '../lib/toast';
import './WardDashboard.css';

interface WardOfficial {
  id: string;
  name: string;
  role: string;
  party: string | null;
  phone: string | null;
  email: string | null;
}

// ─── Type Definitions ──────────────────────────────────────────────────────
interface WardDetail {
  id: string;
  ward_number: number;
  ward_name: string;
  zone_name: string;
  total_reports: number;
  open_reports: number;
  resolved_reports: number;
  resolution_rate: number;
}

interface WardReport {
  id: string;
  category: string;
  severity: string;
  status: string;
  image_url: string | null;
  description: string | null;
  created_at: string;
}

// ─── Category & Severity display helpers ──────────────────────────────────
const CATEGORY_ICONS: Record<string, string> = {
  garbage_dump: '🗑️',
  overflowing_bin: '📦',
  drain_overflow: '🚰',
  construction_debris: '🧱',
  plastic_waste: '🥤',
  road_damage: '🕳️',
  other: '⚠️',
};

const SEVERITY_COLORS: Record<string, string> = {
  low: '#22c55e',
  medium: '#f59e0b',
  high: '#ef4444',
  critical: '#7c3aed',
};

function formatCategory(cat: string) {
  return cat.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

function timeAgo(dateStr: string) {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

// ─── Main Component ────────────────────────────────────────────────────────
export default function WardDashboard() {
  const { wardId } = useParams<{ wardId: string }>();
  const navigate = useNavigate();
  const { showToast } = useToast();

  const [ward, setWard] = useState<WardDetail | null>(null);
  const [reports, setReports] = useState<WardReport[]>([]);
  const [officials, setOfficials] = useState<WardOfficial[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Mini-map ref
  const miniMapRef = useRef<HTMLDivElement>(null);
  const miniMapInstance = useRef<maplibregl.Map | null>(null);

  // ── Fetch ward data ──
  useEffect(() => {
    if (!wardId) return;

    const fetchWard = async () => {
      setLoading(true);
      setError(null);
      try {
        // 1. Get ward detail stats via RPC
        const { data: detail, error: detailErr } = await supabase.rpc('get_ward_detail', {
          p_ward_id: wardId,
        });
        if (detailErr) throw detailErr;
        setWard(detail as WardDetail);

        // 2. Get last 20 reports for this ward
        const { data: reportData, error: reportErr } = await supabase
          .from('reports')
          .select('id, category, severity, status, image_url, description, created_at')
          .eq('ward_id', wardId)
          .order('created_at', { ascending: false })
          .limit(20);

        if (reportErr) throw reportErr;
        setReports(reportData || []);

        // 3. Get responsible officials for this ward (if seeded)
        const { data: offData } = await supabase
          .from('officials')
          .select('id, name, role, party, phone, email')
          .eq('ward_id', wardId)
          .eq('is_active', true);
        setOfficials((offData as WardOfficial[]) || []);
      } catch (err: any) {
        setError(err.message || 'Failed to load ward data');
      } finally {
        setLoading(false);
      }
    };

    fetchWard();
  }, [wardId]);

  // ── Initialize mini-map after ward loads ──
  useEffect(() => {
    if (!ward || !wardId) return;

    // Wait for DOM to fully paint before MapLibre measures the container
    const timer = setTimeout(() => {
      if (!miniMapRef.current) return;

      // Destroy previous instance if it exists
      if (miniMapInstance.current) {
        miniMapInstance.current.remove();
        miniMapInstance.current = null;
      }

      const map = new maplibregl.Map({
        container: miniMapRef.current,
        style: {
          version: 8,
          sources: {
            osm: {
              type: 'raster',
              tiles: ['https://tile.openstreetmap.org/{z}/{x}/{y}.png'],
              tileSize: 256,
              attribution: '© OpenStreetMap contributors',
            },
          },
          layers: [{ id: 'osm-tiles', type: 'raster', source: 'osm' }],
        },
        center: [78.4867, 17.385],
        zoom: 11,
        interactive: false,
      });

      miniMapInstance.current = map;

      map.on('load', async () => {
        // Force resize so MapLibre knows the actual canvas size
        map.resize();

        const { data: geoData, error: geoErr } = await supabase.rpc('get_ward_boundary', {
          p_ward_id: wardId,
        });

        if (geoErr) {
          console.error('Ward boundary SQL error:', geoErr.message);
          return;
        }

        if (!geoData) {
          console.warn('No boundary returned for ward:', wardId);
          return;
        }

        const geojson = typeof geoData === 'string' ? JSON.parse(geoData) : geoData;
        const features = geojson?.features ?? [];

        console.log(`Mini-map: ${features.length} feature(s) for ward ${wardId}`);

        if (features.length === 0) {
          console.warn('GeoJSON has 0 features — geom might be NULL in DB for this ward');
          return;
        }

        map.addSource('ward-boundary', { type: 'geojson', data: geojson });

        map.addLayer({
          id: 'ward-fill',
          type: 'fill',
          source: 'ward-boundary',
          paint: { 'fill-color': '#15803d', 'fill-opacity': 0.4 },
        });

        map.addLayer({
          id: 'ward-outline',
          type: 'line',
          source: 'ward-boundary',
          paint: { 'line-color': '#166534', 'line-width': 2.5 },
        });

        // Fit camera to the ward boundary
        const bounds = new maplibregl.LngLatBounds();
        const geom = features[0].geometry;
        const rings = geom.type === 'MultiPolygon'
          ? geom.coordinates.flatMap((p: any) => p[0])
          : geom.type === 'Polygon'
          ? geom.coordinates[0]
          : [];

        rings.forEach((coord: [number, number]) => bounds.extend(coord));

        if (!bounds.isEmpty()) {
          map.fitBounds(bounds, { padding: 24, maxZoom: 15, duration: 0 });
        }
      });
    }, 400); // 400ms gives React + CSS grid time to fully lay out

    return () => {
      clearTimeout(timer);
      if (miniMapInstance.current) {
        miniMapInstance.current.remove();
        miniMapInstance.current = null;
      }
    };
  }, [ward, wardId]);

  // ── Loading / Error States ──
  if (loading) {
    return (
      <div className="ward-loading">
        <div className="ward-spinner" />
        <p>Loading ward data...</p>
      </div>
    );
  }

  if (error || !ward) {
    return (
      <div className="ward-error">
        <span>❌</span>
        <p>{error || 'Ward not found'}</p>
        <button onClick={() => navigate('/')}>← Back to Map</button>
      </div>
    );
  }

  // ── Render ──
  const resolutionPercent = ward.resolution_rate;
  const progressColor = resolutionPercent >= 70 ? '#22c55e' : resolutionPercent >= 40 ? '#f59e0b' : '#ef4444';

  return (
    <div className="ward-dashboard-page">
      {/* ── Back Navigation ── */}
      <button className="ward-back-btn" onClick={() => navigate('/')}>
        ← Back to Parishubhram
      </button>

      {/* ── Ward Hero Card ── */}
      <div className="ward-hero">
        <div className="ward-hero-info">
          <div className="ward-hero-badge">Ward #{ward.ward_number}</div>
          <h1 className="ward-hero-name">{ward.ward_name}</h1>
          <p className="ward-hero-zone">
            🏢 {ward.zone_name && ward.zone_name !== 'Unknown' ? `${ward.zone_name} Zone • ` : ''}GHMC
          </p>
        </div>

        {/* Share Button */}
        <button
          className="ward-share-btn"
          onClick={() => {
            navigator.clipboard.writeText(window.location.href);
            showToast('Ward URL copied to clipboard!', 'success');
          }}
        >
          🔗 Share Ward
        </button>
      </div>

      <div className="ward-content-grid">
        {/* ── Left Column: Stats + Mini Map ── */}
        <div className="ward-left-col">
          {/* Stats Cards */}
          <div className="ward-stats-row">
            <div className="ward-stat-card ward-stat-total">
              <div className="ward-stat-num">{ward.total_reports}</div>
              <div className="ward-stat-lbl">Total Reports</div>
            </div>
            <div className="ward-stat-card ward-stat-open">
              <div className="ward-stat-num">{ward.open_reports}</div>
              <div className="ward-stat-lbl">🔴 Still Open</div>
            </div>
            <div className="ward-stat-card ward-stat-resolved">
              <div className="ward-stat-num">{ward.resolved_reports}</div>
              <div className="ward-stat-lbl">🟢 Resolved</div>
            </div>
          </div>

          {/* Resolution Rate Progress Bar */}
          <div className="ward-resolution-card">
            <div className="ward-resolution-header">
              <span>Resolution Rate</span>
              <span className="ward-resolution-pct" style={{ color: progressColor }}>
                {resolutionPercent}%
              </span>
            </div>
            <div className="ward-progress-track">
              <div
                className="ward-progress-fill"
                style={{ width: `${resolutionPercent}%`, backgroundColor: progressColor }}
              />
            </div>
            <p className="ward-resolution-note">
              {resolutionPercent >= 70
                ? '✅ Great — most complaints resolved!'
                : resolutionPercent >= 40
                ? '⚠️ Moderate — several complaints still pending'
                : ward.total_reports === 0
                ? '📭 No complaints filed for this ward yet'
                : '🚨 Low — most complaints unresolved'}
            </p>
          </div>

          {/* Responsible Official / Corporator Card */}
          <div className="ward-resolution-card">
            <div className="ward-resolution-header">
              <span>🏛️ Responsible Official</span>
              <button
                onClick={() => navigate('/officials')}
                style={{
                  background: 'none',
                  border: 'none',
                  color: 'var(--primary)',
                  fontSize: '0.78rem',
                  fontWeight: 700,
                  cursor: 'pointer',
                }}
              >
                All Officials →
              </button>
            </div>
            {officials.length === 0 ? (
              <p className="ward-resolution-note">
                Corporator / sanitation official details not yet linked for this ward.
              </p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {officials.map((off) => (
                  <div key={off.id} style={{ fontSize: '0.85rem' }}>
                    <div style={{ fontWeight: 700, color: 'var(--text-main)' }}>
                      {off.name}{' '}
                      <span style={{ fontSize: '0.72rem', color: 'var(--primary)' }}>
                        ({off.role.toUpperCase()}
                        {off.party ? ` • ${off.party}` : ''})
                      </span>
                    </div>
                    {off.phone && (
                      <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                        📞 {off.phone}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Mini Map */}
          <div className="ward-minimap-card">
            <h3>Ward Boundary</h3>
            <div ref={miniMapRef} className="ward-minimap" />
          </div>
        </div>

        {/* ── Right Column: Recent Reports ── */}
        <div className="ward-right-col">
          <h2 className="ward-reports-heading">
            Recent Complaints
            <span className="ward-reports-count">{reports.length}</span>
          </h2>

          {reports.length === 0 ? (
            <div className="ward-no-reports">
              <span>🎉</span>
              <p>No complaints for this ward yet!</p>
              <small>Be the first to report an issue</small>
            </div>
          ) : (
            <div className="ward-reports-list">
              {reports.map((r) => (
                <div
                  key={r.id}
                  className={`ward-report-item ${r.status === 'resolved' ? 'ward-report-resolved' : ''}`}
                >
                  {/* Photo thumbnail */}
                  {r.image_url && (
                    <img
                      src={r.image_url}
                      alt="Report"
                      className="ward-report-thumb"
                      onError={(e) => {
                        (e.target as HTMLImageElement).style.display = 'none';
                      }}
                    />
                  )}

                  <div className="ward-report-body">
                    <div className="ward-report-top">
                      <span className="ward-report-category">
                        {CATEGORY_ICONS[r.category] || '⚠️'} {formatCategory(r.category)}
                      </span>
                      <span
                        className="ward-report-severity"
                        style={{ color: SEVERITY_COLORS[r.severity] || '#64748b' }}
                      >
                        ● {r.severity}
                      </span>
                    </div>

                    {r.description && (
                      <p className="ward-report-desc">{r.description}</p>
                    )}

                    <div className="ward-report-footer">
                      <span
                        className={`ward-report-status ${r.status === 'resolved' ? 'status-resolved' : 'status-open'}`}
                      >
                        {r.status === 'resolved' ? '🟢 Resolved' : '🔴 Open'}
                      </span>
                      <span className="ward-report-time">{timeAgo(r.created_at)}</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
