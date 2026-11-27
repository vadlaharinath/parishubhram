import { useEffect, useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { supabase } from './lib/supabase';
import CivicMap from './components/CivicMap';
import ReportModal from './components/ReportModal';
import ReportFeed from './components/ReportFeed';
import FilterBar from './components/FilterBar';
import ResolveModal from './components/ResolveModal';
import Leaderboard from './components/Leaderboard';

interface Ward {
  id: string;
  ward_number: number;
  ward_name: string;
}

export default function App() {
  const navigate = useNavigate();

  const [wards, setWards] = useState<Ward[]>([]);
  const [cityId, setCityId] = useState<string>('');
  const [reportCount, setReportCount] = useState<number>(0);
  const [resolvedCount, setResolvedCount] = useState<number>(0);
  const [loading, setLoading] = useState(true);

  // Modals state
  const [isReportModalOpen, setIsReportModalOpen] = useState(false);
  const [resolvingReportId, setResolvingReportId] = useState<string | null>(null);

  // Filters state
  const [statusFilter, setStatusFilter] = useState('all');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');

  const [refreshTrigger, setRefreshTrigger] = useState(0);

  const fetchData = async () => {
    try {
      setLoading(true);

      const { data: cityData } = await supabase
        .from('cities')
        .select('id')
        .eq('slug', 'hyderabad')
        .single();

      if (cityData) setCityId(cityData.id);

      const { data: wardsData } = await supabase
        .from('wards')
        .select('id, ward_number, ward_name')
        .order('ward_number', { ascending: true });

      setWards(wardsData || []);

      // Total Active Reports
      const { count: active } = await supabase
        .from('reports')
        .select('*', { count: 'exact', head: true })
        .eq('status', 'reported');

      setReportCount(active || 0);

      // Total Resolved
      const { count: resolved } = await supabase
        .from('reports')
        .select('*', { count: 'exact', head: true })
        .eq('status', 'resolved');

      setResolvedCount(resolved || 0);
    } catch (err) {
      console.error('Error fetching data:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();

    // Supabase Realtime WebSocket Listener for BOTH inserts and updates!
    const channel = supabase
      .channel('public:reports')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'reports' },
        () => {
          setRefreshTrigger((prev) => prev + 1);
          fetchData();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const handleReportSuccess = () => {
    alert('🎉 Report submitted successfully!');
    setRefreshTrigger((prev) => prev + 1);
    fetchData();
  };

  const handleResolveSuccess = () => {
    alert('✨ Spot marked as resolved with photo proof!');
    setRefreshTrigger((prev) => prev + 1);
    fetchData();
  };

  // ✨ Ward click handler — navigates to Ward Dashboard page
  const handleWardClick = (wardId: string, wardName: string) => {
    console.log(`Opening ward: ${wardName} (${wardId})`);
    navigate(`/ward/${wardId}`);
  };

  return (
    <div>
      {/* Navigation Header */}
      <nav className="navbar">
        <div>
          <div className="brand-title">
            <span>🧹</span> పరిశుభ్రం (Parishubhram)
          </div>
          <div className="brand-subtitle">
            Hyderabad Civic Waste Accountability Platform • GHMC
          </div>
        </div>

        <div className="navbar-right">
          <Link to="/stats" className="stats-nav-link">📊 Analytics</Link>
          <button
            onClick={() => setIsReportModalOpen(true)}
            className="report-cta-btn"
          >
            <span>📸</span> Report Garbage
          </button>
        </div>
      </nav>

      {/* Main Container */}
      <main className="container">
        {/* Quick Stats Grid */}
        <div className="stats-grid">
          <div className="stat-box">
            <div className="stat-value">{loading ? '...' : wards.length}</div>
            <div className="stat-label">GHMC Wards Covered</div>
          </div>
          <div className="stat-box">
            <div className="stat-value" style={{ color: '#dc2626' }}>
              {loading ? '...' : reportCount}
            </div>
            <div className="stat-label">Active Blackspots 🔴</div>
          </div>
          <div className="stat-box">
            <div className="stat-value" style={{ color: '#16a34a' }}>
              {loading ? '...' : resolvedCount}
            </div>
            <div className="stat-label">Spots Cleaned & Resolved 🟢</div>
          </div>
        </div>

        {/* 🔍 Filter & Search Bar */}
        <FilterBar
          statusFilter={statusFilter}
          setStatusFilter={setStatusFilter}
          categoryFilter={categoryFilter}
          setCategoryFilter={setCategoryFilter}
          searchQuery={searchQuery}
          setSearchQuery={setSearchQuery}
        />

        {/* Interactive Map — clicking a ward navigates to WardDashboard */}
        <CivicMap
          refreshTrigger={refreshTrigger}
          statusFilter={statusFilter}
          categoryFilter={categoryFilter}
          searchQuery={searchQuery}
          onWardClick={handleWardClick}
        />

        {/* 🏆 Accountability Leaderboard */}
        <Leaderboard />

        {/* Live Feed with "Mark Cleaned" Button */}
        <ReportFeed
          refreshTrigger={refreshTrigger}
          statusFilter={statusFilter}
          categoryFilter={categoryFilter}
          searchQuery={searchQuery}
          onOpenResolveModal={(id) => setResolvingReportId(id)}
        />
      </main>

      {/* Report Modal */}
      {cityId && (
        <ReportModal
          isOpen={isReportModalOpen}
          onClose={() => setIsReportModalOpen(false)}
          onSuccess={handleReportSuccess}
          cityId={cityId}
        />
      )}

      {/* Resolution Proof Modal */}
      <ResolveModal
        reportId={resolvingReportId}
        onClose={() => setResolvingReportId(null)}
        onSuccess={handleResolveSuccess}
      />
    </div>
  );
}
