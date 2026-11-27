import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import './Leaderboard.css';

// ── Types ──────────────────────────────────────────────────────────────────
interface LeaderboardRow {
  ward_id: string;
  ward_number: number;
  ward_name: string;
  zone_name: string;
  open_reports: number;
  total_reports: number;
  resolution_rate: number;
}

// ── Component ──────────────────────────────────────────────────────────────
export default function Leaderboard() {
  const navigate = useNavigate();
  const [rows, setRows] = useState<LeaderboardRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchLeaderboard = async () => {
      setLoading(true);
      const { data, error } = await supabase.rpc('get_accountability_leaderboard');
      if (!error && data) {
        setRows(data as LeaderboardRow[]);
      }
      setLoading(false);
    };
    fetchLeaderboard();
  }, []);

  if (loading) {
    return (
      <div className="lb-loading">
        <div className="ward-spinner" />
      </div>
    );
  }

  if (rows.length === 0) {
    return (
      <div className="lb-empty">
        <span>🎉</span>
        <p>No complaints yet across all wards!</p>
      </div>
    );
  }

  return (
    <div className="lb-wrapper">
      <div className="lb-header">
        <h2 className="lb-title">🏆 Accountability Leaderboard</h2>
        <p className="lb-subtitle">Wards ranked by most open (unresolved) complaints</p>
      </div>

      <div className="lb-table-wrapper">
        <table className="lb-table">
          <thead>
            <tr>
              <th>#</th>
              <th>Ward</th>
              <th>Zone</th>
              <th>🔴 Open</th>
              <th>Total</th>
              <th>Resolution %</th>
              <th>Action</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, idx) => {
              const isWorst = idx === 0;
              const rateColor =
                row.resolution_rate >= 70
                  ? '#16a34a'
                  : row.resolution_rate >= 40
                  ? '#d97706'
                  : '#dc2626';

              return (
                <tr key={row.ward_id} className={isWorst ? 'lb-row-worst' : ''}>
                  <td className="lb-rank">
                    {idx === 0 ? '🚨' : idx === 1 ? '⚠️' : idx + 1}
                  </td>
                  <td className="lb-ward-name">
                    <span className="lb-ward-num">W{row.ward_number}</span>
                    {row.ward_name}
                  </td>
                  <td className="lb-zone">{row.zone_name}</td>
                  <td className="lb-open">
                    <span className="lb-open-badge">{row.open_reports}</span>
                  </td>
                  <td className="lb-total">{row.total_reports}</td>
                  <td className="lb-rate">
                    <div className="lb-rate-wrap">
                      <div className="lb-mini-track">
                        <div
                          className="lb-mini-fill"
                          style={{
                            width: `${row.resolution_rate}%`,
                            backgroundColor: rateColor,
                          }}
                        />
                      </div>
                      <span style={{ color: rateColor, fontWeight: 700, fontSize: '0.8rem' }}>
                        {row.resolution_rate}%
                      </span>
                    </div>
                  </td>
                  <td>
                    <button
                      className="lb-view-btn"
                      onClick={() => navigate(`/ward/${row.ward_id}`)}
                    >
                      View →
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
