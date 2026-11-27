'use client';

import { useState } from 'react';
import { supabase } from '@/lib/supabase';
import { AdminReport } from '@/types/admin';

interface ReportsTableProps {
  reports: AdminReport[];
  onRefresh: () => void;
}

const STATUS_LABELS: Record<string, string> = {
  reported: '🔴 Reported',
  in_progress: '🟡 In Progress',
  resolved: '🟢 Resolved',
};

export default function ReportsTable({ reports, onRefresh }: ReportsTableProps) {
  // Filters
  const [statusFilter, setStatusFilter] = useState('all');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [severityFilter, setSeverityFilter] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');

  // Modal state for assigning status & resolution notes
  const [editingReport, setEditingReport] = useState<AdminReport | null>(null);
  const [newStatus, setNewStatus] = useState('reported');
  const [resolutionNote, setResolutionNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const openManageModal = (report: AdminReport) => {
    setEditingReport(report);
    setNewStatus(report.status || 'reported');
    setResolutionNote(report.resolution_note || '');
    setSaveError(null);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingReport) return;

    setSaving(true);
    setSaveError(null);

    try {
      const updatePayload: {
        status: string;
        resolution_note: string | null;
        resolved_at?: string | null;
      } = {
        status: newStatus,
        resolution_note: resolutionNote.trim() || null,
      };

      if (newStatus === 'resolved') {
        updatePayload.resolved_at = new Date().toISOString();
      } else {
        updatePayload.resolved_at = null;
      }

      const { error } = await supabase
        .from('reports')
        .update(updatePayload)
        .eq('id', editingReport.id);

      if (error) throw error;

      setEditingReport(null);
      onRefresh();
    } catch (err: unknown) {
      const msg =
        err instanceof Error
          ? err.message
          : 'Failed to update report. Check Supabase RLS update policy.';
      setSaveError(msg);
    } finally {
      setSaving(false);
    }
  };

  // Client-side filter pipeline
  const filteredReports = reports.filter((r) => {
    if (statusFilter !== 'all' && r.status !== statusFilter) return false;
    if (categoryFilter !== 'all' && r.category !== categoryFilter) return false;
    if (severityFilter !== 'all' && r.severity !== severityFilter) return false;

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const addressMatch = r.address?.toLowerCase().includes(q);
      const descMatch = r.description?.toLowerCase().includes(q);
      const wardMatch = r.ward?.ward_name?.toLowerCase().includes(q);
      const wardNumMatch = r.ward?.ward_number?.toString().includes(q);
      if (!addressMatch && !descMatch && !wardMatch && !wardNumMatch) {
        return false;
      }
    }

    return true;
  });

  return (
    <section className="section-card">
      <div className="section-header">
        <div>
          <h2 className="section-title">
            📋 All Citizen Reports ({filteredReports.length})
          </h2>
          <p className="section-subtitle">
            Filter complaints, assign cleanup status, and record official notes
          </p>
        </div>
        <button className="refresh-btn" onClick={onRefresh}>
          🔄 Refresh
        </button>
      </div>

      {/* ── Filters ── */}
      <div className="filters-bar">
        <input
          type="text"
          className="filter-input"
          placeholder="Search address, description, or ward..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
        />

        <select
          className="filter-select"
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
        >
          <option value="all">All Statuses</option>
          <option value="reported">🔴 Reported</option>
          <option value="in_progress">🟡 In Progress</option>
          <option value="resolved">🟢 Resolved</option>
        </select>

        <select
          className="filter-select"
          value={categoryFilter}
          onChange={(e) => setCategoryFilter(e.target.value)}
        >
          <option value="all">All Categories</option>
          <option value="garbage_dump">Garbage Dump</option>
          <option value="overflowing_bin">Overflowing Bin</option>
          <option value="drain_overflow">Drainage Overflow</option>
          <option value="construction_debris">C&amp;D Debris</option>
          <option value="plastic_waste">Plastic Waste</option>
          <option value="road_damage">Road Damage / Pothole</option>
          <option value="other">Other</option>
        </select>

        <select
          className="filter-select"
          value={severityFilter}
          onChange={(e) => setSeverityFilter(e.target.value)}
        >
          <option value="all">All Severities</option>
          <option value="low">Low</option>
          <option value="medium">Medium</option>
          <option value="high">High</option>
          <option value="critical">Critical</option>
        </select>
      </div>

      {/* ── Table ── */}
      {filteredReports.length === 0 ? (
        <div className="center-state" style={{ minHeight: '180px' }}>
          <p>No reports match the selected filters.</p>
        </div>
      ) : (
        <div className="table-scroll">
          <table className="reports-table">
            <thead>
              <tr>
                <th>Photo</th>
                <th>Issue &amp; Notes</th>
                <th>Ward / Location</th>
                <th>Severity</th>
                <th>Status</th>
                <th>Reported</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {filteredReports.map((r) => (
                <tr key={r.id}>
                  <td>
                    {r.image_url ? (
                      <img
                        src={r.image_url}
                        alt={r.category}
                        className="report-thumb"
                      />
                    ) : (
                      <span>—</span>
                    )}
                  </td>
                  <td>
                    <div className="issue-title">
                      {r.category.replace(/_/g, ' ').toUpperCase()}
                    </div>
                    {r.description && (
                      <div className="issue-desc" title={r.description}>
                        {r.description}
                      </div>
                    )}
                    {r.resolution_note && (
                      <div
                        className="issue-desc"
                        style={{ color: '#15803d', fontWeight: 600 }}
                        title={r.resolution_note}
                      >
                        📝 {r.resolution_note}
                      </div>
                    )}
                  </td>
                  <td>
                    <div style={{ fontWeight: 600 }}>
                      {r.ward
                        ? `Ward #${r.ward.ward_number} (${r.ward.ward_name})`
                        : 'Outside GHMC'}
                    </div>
                    {r.address && (
                      <div className="issue-desc" title={r.address}>
                        📍 {r.address}
                      </div>
                    )}
                  </td>
                  <td>
                    <span className={`badge-pill sev-${r.severity}`}>
                      {r.severity}
                    </span>
                  </td>
                  <td>
                    <span className={`badge-pill status-${r.status}`}>
                      {STATUS_LABELS[r.status] || r.status}
                    </span>
                  </td>
                  <td style={{ whiteSpace: 'nowrap', color: '#64748b' }}>
                    {new Date(r.created_at).toLocaleDateString('en-IN')}
                  </td>
                  <td>
                    <button
                      className="manage-btn"
                      onClick={() => openManageModal(r)}
                    >
                      ✏️ Manage
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* ── Manage Status & Notes Modal ── */}
      {editingReport && (
        <div className="modal-backdrop">
          <div className="modal-card">
            <div className="modal-header">
              <h3>Manage Report</h3>
              <button
                className="modal-close"
                onClick={() => setEditingReport(null)}
              >
                ✕
              </button>
            </div>

            {editingReport.image_url && (
              <img
                src={editingReport.image_url}
                alt="Report evidence"
                className="modal-preview-img"
              />
            )}

            <form onSubmit={handleSave} className="login-form">
              {saveError && <div className="login-error">⚠️ {saveError}</div>}

              <div className="form-field">
                <label htmlFor="status-select">Assign Status</label>
                <select
                  id="status-select"
                  value={newStatus}
                  onChange={(e) => setNewStatus(e.target.value)}
                >
                  <option value="reported">🔴 Reported (Pending)</option>
                  <option value="in_progress">🟡 In Progress (Team Dispatched)</option>
                  <option value="resolved">🟢 Resolved (Cleaned)</option>
                </select>
              </div>

              <div className="form-field">
                <label htmlFor="resolution-note">Official Resolution / Action Note</label>
                <textarea
                  id="resolution-note"
                  rows={3}
                  placeholder="e.g., Sanitation vehicle TS09-GHMC-104 dispatched; spot cleared at 10:30 AM."
                  value={resolutionNote}
                  onChange={(e) => setResolutionNote(e.target.value)}
                />
              </div>

              <div className="modal-actions">
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={() => setEditingReport(null)}
                >
                  Cancel
                </button>
                <button type="submit" disabled={saving} className="btn-primary">
                  {saving ? 'Saving...' : 'Save Changes'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </section>
  );
}
