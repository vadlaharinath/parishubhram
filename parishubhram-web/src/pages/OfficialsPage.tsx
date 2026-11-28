import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import './OfficialsPage.css';

interface OfficialRow {
  id: string;
  ward_id: string | null;
  name: string;
  name_telugu: string | null;
  role: string;
  party: string | null;
  phone: string | null;
  email: string | null;
  photo_url: string | null;
  ward?: {
    id: string;
    ward_number: number;
    ward_name: string;
  } | null;
  open_reports: number;
  resolved_reports: number;
  total_reports: number;
}

const ROLE_LABELS: Record<string, string> = {
  corporator: 'Corporator',
  mla: 'MLA',
  mp: 'MP',
  commissioner: 'Zone Commissioner',
  jhi: 'Health Inspector (JHI)',
  aee: 'Asst. Engineer (AEE)',
};

export default function OfficialsPage() {
  const navigate = useNavigate();
  const [officials, setOfficials] = useState<OfficialRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [roleFilter, setRoleFilter] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState<'worst' | 'best'>('worst');

  useEffect(() => {
    const fetchOfficials = async () => {
      setLoading(true);
      try {
        const [{ data: offData }, { data: reportsData }] = await Promise.all([
          supabase
            .from('officials')
            .select('id, ward_id, name, name_telugu, role, party, phone, email, photo_url, ward:wards(id, ward_number, ward_name)')
            .eq('is_active', true),
          supabase.from('reports').select('ward_id, status'),
        ]);

        // Aggregate open/resolved counts per ward_id
        const wardCounts: Record<string, { open: number; resolved: number; total: number }> = {};
        (reportsData || []).forEach((r: any) => {
          if (!r.ward_id) return;
          if (!wardCounts[r.ward_id]) {
            wardCounts[r.ward_id] = { open: 0, resolved: 0, total: 0 };
          }
          wardCounts[r.ward_id].total++;
          if (r.status === 'resolved') wardCounts[r.ward_id].resolved++;
          else wardCounts[r.ward_id].open++;
        });

        const enriched: OfficialRow[] = (offData || []).map((o: any) => {
          const w = Array.isArray(o.ward) ? o.ward[0] || null : o.ward || null;
          const counts = (o.ward_id && wardCounts[o.ward_id]) || { open: 0, resolved: 0, total: 0 };
          return {
            ...o,
            ward: w,
            open_reports: counts.open,
            resolved_reports: counts.resolved,
            total_reports: counts.total,
          };
        });

        setOfficials(enriched);
      } catch (err) {
        console.error('Error loading officials:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchOfficials();
  }, []);

  const filtered = officials
    .filter((o) => {
      if (roleFilter !== 'all') {
        if (roleFilter === 'staff') {
          if (!['commissioner', 'jhi', 'aee'].includes(o.role)) return false;
        } else if (o.role !== roleFilter) {
          return false;
        }
      }
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const nameMatch = o.name.toLowerCase().includes(q);
        const wardMatch = o.ward?.ward_name.toLowerCase().includes(q);
        const wardNumMatch = o.ward?.ward_number.toString().includes(q);
        if (!nameMatch && !wardMatch && !wardNumMatch) return false;
      }
      return true;
    })
    .sort((a, b) => {
      if (sortBy === 'worst') {
        return b.open_reports - a.open_reports || b.total_reports - a.total_reports;
      }
      const rateA = a.total_reports > 0 ? a.resolved_reports / a.total_reports : 0;
      const rateB = b.total_reports > 0 ? b.resolved_reports / b.total_reports : 0;
      return rateB - rateA || b.resolved_reports - a.resolved_reports;
    });

  return (
    <div className="officials-page">
      <div className="officials-topbar">
        <button className="officials-back-btn" onClick={() => navigate('/')}>
          ← Back to Parishubhram
        </button>
      </div>

      <div className="officials-hero">
        <h1>🏛️ Public Accountability Directory</h1>
        <p>
          GHMC Corporators, MLAs, MPs &amp; Sanitation Officials — linked to live ward complaint counts
        </p>
      </div>

      {/* Filters & Sort */}
      <div className="officials-controls">
        <input
          type="text"
          className="officials-search"
          placeholder="Search official name, ward name, or ward #..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
        />

        <div className="officials-tabs">
          {[
            { id: 'all', label: 'All' },
            { id: 'corporator', label: 'Corporators' },
            { id: 'mla', label: 'MLAs' },
            { id: 'mp', label: 'MPs' },
            { id: 'staff', label: 'GHMC Staff' },
          ].map((t) => (
            <button
              key={t.id}
              className={`officials-tab ${roleFilter === t.id ? 'active' : ''}`}
              onClick={() => setRoleFilter(t.id)}
            >
              {t.label}
            </button>
          ))}
        </div>

        <select
          className="officials-sort"
          value={sortBy}
          onChange={(e) => setSortBy(e.target.value as 'worst' | 'best')}
        >
          <option value="worst">🚨 Most Open Complaints</option>
          <option value="best">⭐ Star Performers</option>
        </select>
      </div>

      {loading ? (
        <div className="officials-empty">
          <p>Loading public officials directory...</p>
        </div>
      ) : officials.length === 0 ? (
        <div className="officials-empty-card">
          <div style={{ fontSize: '2.5rem', marginBottom: '10px' }}>🏛️</div>
          <h3>No Officials Seeded Yet</h3>
          <p>
            Your <code>officials</code> table in Supabase is currently empty. Once you add GHMC
            Corporators, MLAs, or Health Inspectors to the <code>officials</code> table, they will
            appear here with live open/resolved counts per ward.
          </p>
        </div>
      ) : filtered.length === 0 ? (
        <div className="officials-empty">
          <p>No officials match your filter.</p>
        </div>
      ) : (
        <div className="officials-grid">
          {filtered.map((off) => {
            const rate =
              off.total_reports > 0
                ? Math.round((off.resolved_reports / off.total_reports) * 100)
                : 0;

            return (
              <div key={off.id} className="official-card">
                <div className="official-card-top">
                  <div className="official-avatar">
                    {off.photo_url ? (
                      <img src={off.photo_url} alt={off.name} />
                    ) : (
                      <span>{off.name.charAt(0).toUpperCase()}</span>
                    )}
                  </div>
                  <div className="official-info">
                    <span className="official-role-pill">
                      {ROLE_LABELS[off.role] || off.role}
                      {off.party ? ` • ${off.party}` : ''}
                    </span>
                    <h3 className="official-name">{off.name}</h3>
                    {off.name_telugu && (
                      <div className="official-telugu">{off.name_telugu}</div>
                    )}
                  </div>
                </div>

                {off.ward && (
                  <button
                    className="official-ward-link"
                    onClick={() => navigate(`/ward/${off.ward!.id}`)}
                  >
                    📍 Ward #{off.ward.ward_number} — {off.ward.ward_name} →
                  </button>
                )}

                <div className="official-metrics">
                  <div>
                    <strong style={{ color: '#dc2626' }}>{off.open_reports}</strong>
                    <span>Open 🔴</span>
                  </div>
                  <div>
                    <strong style={{ color: '#16a34a' }}>{off.resolved_reports}</strong>
                    <span>Resolved 🟢</span>
                  </div>
                  <div>
                    <strong>{rate}%</strong>
                    <span>Rate</span>
                  </div>
                </div>

                {(off.phone || off.email) && (
                  <div className="official-contact">
                    {off.phone && <span>📞 {off.phone}</span>}
                    {off.email && <span>✉️ {off.email}</span>}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
