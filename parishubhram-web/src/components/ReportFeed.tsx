import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import './ReportFeed.css';

interface Report {
  id: string;
  category: string;
  severity: string;
  description: string | null;
  address: string | null;
  image_url: string;
  resolution_photo_url: string | null;
  resolution_note: string | null;
  status: string;
  seen_count: number;
  created_at: string;
}

interface ReportFeedProps {
  refreshTrigger?: number;
  statusFilter?: string;
  categoryFilter?: string;
  searchQuery?: string;
  onOpenResolveModal: (reportId: string) => void;
}

export default function ReportFeed({
  refreshTrigger = 0,
  statusFilter = 'all',
  categoryFilter = 'all',
  searchQuery = '',
  onOpenResolveModal,
}: ReportFeedProps) {
  const [reports, setReports] = useState<Report[]>([]);
  const [loading, setLoading] = useState(true);
  const [confirmedIds, setConfirmedIds] = useState<string[]>([]);

  const getSessionId = () => {
    let session = localStorage.getItem('parishubhram_session');
    if (!session) {
      session = 'anon_' + Math.random().toString(36).substring(2) + Date.now();
      localStorage.setItem('parishubhram_session', session);
    }
    return session;
  };

  const fetchReports = async () => {
    try {
      setLoading(true);
      let query = supabase.from('reports').select('*');

      if (statusFilter !== 'all') {
        query = query.eq('status', statusFilter);
      }
      if (categoryFilter !== 'all') {
        query = query.eq('category', categoryFilter);
      }

      const { data, error } = await query.order('created_at', { ascending: false });
      if (error) throw error;

      // Filter by search query
      const filtered = (data || []).filter((r) => {
        if (!searchQuery) return true;
        const q = searchQuery.toLowerCase();
        return (
          (r.address && r.address.toLowerCase().includes(q)) ||
          (r.description && r.description.toLowerCase().includes(q))
        );
      });

      setReports(filtered);
    } catch (err) {
      console.error('Failed to fetch reports feed:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchReports();
  }, [refreshTrigger, statusFilter, categoryFilter, searchQuery]);

  const handleSeenItToo = async (reportId: string) => {
    if (confirmedIds.includes(reportId)) return;
    const sessionId = getSessionId();

    try {
      const { data, error } = await supabase.rpc('confirm_report', {
        p_report_id: reportId,
        p_user_session: sessionId,
      });

      if (error) throw error;
      if (data?.success) {
        setConfirmedIds((prev) => [...prev, reportId]);
        setReports((prev) =>
          prev.map((r) => (r.id === reportId ? { ...r, seen_count: data.seen_count } : r))
        );
      }
    } catch (err) {
      console.error('Confirmation error:', err);
    }
  };

  const formatTimeAgo = (dateStr: string) => {
    const diff = (Date.now() - new Date(dateStr).getTime()) / 1000;
    if (diff < 60) return 'Just now';
    if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
    if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
    return `${Math.floor(diff / 86400)}d ago`;
  };

  return (
    <section className="feed-wrapper">
      <div className="feed-header">
        <div>
          <h2>📢 Live Garbage Complaints & Resolution Feed</h2>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>
            Click "Seen it too" to confirm issues or "Mark Cleaned" to upload proof of resolution!
          </p>
        </div>
      </div>

      {loading ? (
        <p style={{ color: 'var(--text-muted)', padding: '20px', textAlign: 'center' }}>
          Loading active blackspots...
        </p>
      ) : reports.length === 0 ? (
        <div className="empty-feed">
          <span>✨</span>
          <p>No complaints match your filters!</p>
        </div>
      ) : (
        <div className="feed-grid">
          {reports.map((report) => (
            <div key={report.id} className="feed-card">
              {/* Photo */}
              <div className="feed-card-image-box">
                <img
                  src={report.resolution_photo_url || report.image_url}
                  alt="Report"
                  className="feed-card-img"
                />
                <span className={`status-tag status-${report.status}`}>
                  ● {report.status === 'resolved' ? 'RESOLVED 🟢' : 'ACTIVE 🔴'}
                </span>
              </div>

              {/* Card Body */}
              <div className="feed-card-body">
                <div className="feed-card-meta">
                  <span className="category-title">
                    {report.category.replace('_', ' ').toUpperCase()}
                  </span>
                  <span className="time-ago">{formatTimeAgo(report.created_at)}</span>
                </div>

                {report.address && (
                  <div className="feed-card-address">
                    📍 {report.address}
                  </div>
                )}

                {report.description && (
                  <p className="feed-card-note">"{report.description}"</p>
                )}

                {report.resolution_note && (
                  <div style={{ fontSize: '0.75rem', color: '#16a34a', fontWeight: 600 }}>
                    🌱 Resolution: {report.resolution_note}
                  </div>
                )}

                {/* Action Buttons */}
                <div className="feed-card-footer">
                  <button
                    onClick={() => handleSeenItToo(report.id)}
                    className={`seen-btn ${confirmedIds.includes(report.id) ? 'seen-btn-active' : ''}`}
                    disabled={confirmedIds.includes(report.id)}
                  >
                    👍 {confirmedIds.includes(report.id) ? 'Confirmed' : 'Seen it too'} ({report.seen_count || 0})
                  </button>

                  {report.status !== 'resolved' ? (
                    <button
                      onClick={() => onOpenResolveModal(report.id)}
                      style={{
                        background: '#dcfce7',
                        color: '#166534',
                        border: '1px solid #86efac',
                        padding: '6px 10px',
                        borderRadius: '6px',
                        fontSize: '0.75rem',
                        fontWeight: 700,
                        cursor: 'pointer',
                      }}
                    >
                      ✨ Mark Cleaned
                    </button>
                  ) : (
                    <span className="severity-tag severity-low">VERIFIED CLEAN ✓</span>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}