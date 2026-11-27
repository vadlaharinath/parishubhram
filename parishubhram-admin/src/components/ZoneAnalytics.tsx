'use client';

import { AdminReport, ZoneRow } from '@/types/admin';

interface ZoneAnalyticsProps {
  reports: AdminReport[];
  zones: ZoneRow[];
}

export default function ZoneAnalytics({ reports, zones }: ZoneAnalyticsProps) {
  const total = reports.length;
  const openCount = reports.filter((r) => r.status === 'reported').length;
  const inProgressCount = reports.filter((r) => r.status === 'in_progress').length;
  const resolvedCount = reports.filter((r) => r.status === 'resolved').length;
  const resolutionRate = total > 0 ? Math.round((resolvedCount / total) * 100) : 0;

  // Build per-zone counts
  const zoneStats = zones.map((zone) => {
    const zoneReports = reports.filter((r) => r.ward?.zone_id === zone.id);
    const zTotal = zoneReports.length;
    const zOpen = zoneReports.filter((r) => r.status !== 'resolved').length;
    const zResolved = zoneReports.filter((r) => r.status === 'resolved').length;
    const zRate = zTotal > 0 ? Math.round((zResolved / zTotal) * 100) : 0;

    return {
      ...zone,
      total: zTotal,
      open: zOpen,
      resolved: zResolved,
      rate: zRate,
    };
  });

  // Unassigned / outside-zone reports (when wards.zone_id is null or outside GHMC)
  const unassignedReports = reports.filter((r) => !r.ward?.zone_id);
  const unassignedTotal = unassignedReports.length;
  const unassignedOpen = unassignedReports.filter((r) => r.status !== 'resolved').length;
  const unassignedResolved = unassignedReports.filter((r) => r.status === 'resolved').length;
  const unassignedRate =
    unassignedTotal > 0 ? Math.round((unassignedResolved / unassignedTotal) * 100) : 0;

  return (
    <>
      {/* ── Top Summary Cards ── */}
      <div className="stats-grid">
        <div className="stat-card">
          <div className="stat-value">{total}</div>
          <div className="stat-label">Total Citizen Reports</div>
        </div>
        <div className="stat-card">
          <div className="stat-value" style={{ color: '#dc2626' }}>
            {openCount}
          </div>
          <div className="stat-label">🔴 Pending / Reported</div>
        </div>
        <div className="stat-card">
          <div className="stat-value" style={{ color: '#d97706' }}>
            {inProgressCount}
          </div>
          <div className="stat-label">🟡 In Progress</div>
        </div>
        <div className="stat-card">
          <div className="stat-value" style={{ color: '#16a34a' }}>
            {resolvedCount} ({resolutionRate}%)
          </div>
          <div className="stat-label">🟢 Resolved</div>
        </div>
      </div>

      {/* ── Per-Zone Analytics ── */}
      <section className="section-card">
        <div className="section-header">
          <div>
            <h2 className="section-title">🏢 Zone-Wise Performance</h2>
            <p className="section-subtitle">
              Open vs resolved complaints across GHMC administrative zones
            </p>
          </div>
        </div>

        <div className="zone-grid">
          {zoneStats.map((z) => (
            <div key={z.id} className="zone-card">
              <div className="zone-card-top">
                <span className="zone-name">{z.name}</span>
                <span className="zone-code">{z.code}</span>
              </div>
              <div className="zone-counts">
                <span>
                  Total: <strong>{z.total}</strong>
                </span>
                <span>
                  Open: <strong style={{ color: '#dc2626' }}>{z.open}</strong>
                </span>
                <span>
                  Cleaned: <strong style={{ color: '#16a34a' }}>{z.resolved}</strong>
                </span>
              </div>
              <div className="zone-progress-track">
                <div
                  className="zone-progress-fill"
                  style={{ width: `${z.rate}%` }}
                />
              </div>
              <div className="zone-rate-text">{z.rate}% Resolved</div>
            </div>
          ))}

          {unassignedTotal > 0 && (
            <div className="zone-card">
              <div className="zone-card-top">
                <span className="zone-name">Unassigned / Outside Zone</span>
                <span className="zone-code">GEN</span>
              </div>
              <div className="zone-counts">
                <span>
                  Total: <strong>{unassignedTotal}</strong>
                </span>
                <span>
                  Open: <strong style={{ color: '#dc2626' }}>{unassignedOpen}</strong>
                </span>
                <span>
                  Cleaned:{' '}
                  <strong style={{ color: '#16a34a' }}>{unassignedResolved}</strong>
                </span>
              </div>
              <div className="zone-progress-track">
                <div
                  className="zone-progress-fill"
                  style={{ width: `${unassignedRate}%` }}
                />
              </div>
              <div className="zone-rate-text">{unassignedRate}% Resolved</div>
            </div>
          )}
        </div>
      </section>
    </>
  );
}
