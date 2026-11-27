'use client';

import { useEffect, useState, useCallback } from 'react';
import type { User } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase';
import AdminLogin from '@/components/AdminLogin';
import ZoneAnalytics from '@/components/ZoneAnalytics';
import ReportsTable from '@/components/ReportsTable';
import { AdminReport, ZoneRow } from '@/types/admin';

export default function AdminHomePage() {
  const [user, setUser] = useState<User | null>(null);
  const [authChecking, setAuthChecking] = useState(true);

  const [reports, setReports] = useState<AdminReport[]>([]);
  const [zones, setZones] = useState<ZoneRow[]>([]);
  const [dataLoading, setDataLoading] = useState(false);

  // 1. Check active Supabase Auth session & subscribe to changes
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null);
      setAuthChecking(false);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
    });

    return () => subscription.unsubscribe();
  }, []);

  // 2. Fetch reports (with ward + zone_id) and zones when authenticated
  const fetchAdminData = useCallback(async () => {
    if (!user) return;
    setDataLoading(true);
    try {
      const [{ data: reportsData, error: reportsErr }, { data: zonesData, error: zonesErr }] =
        await Promise.all([
          supabase
            .from('reports')
            .select(
              'id, category, severity, status, description, address, image_url, resolution_photo_url, resolution_note, ward_id, created_at, ward:wards(ward_number, ward_name, zone_id)'
            )
            .order('created_at', { ascending: false }),
          supabase.from('zones').select('id, name, code').order('name', { ascending: true }),
        ]);

      if (reportsErr) throw reportsErr;
      if (zonesErr) throw zonesErr;

      // Normalize joined ward object (Supabase may return array or single object)
      const normalized: AdminReport[] = (reportsData || []).map((row: any) => ({
        ...row,
        ward: Array.isArray(row.ward) ? row.ward[0] || null : row.ward || null,
      }));

      setReports(normalized);
      setZones((zonesData as ZoneRow[]) || []);
    } catch (err) {
      console.error('Failed to load admin dashboard data:', err);
    } finally {
      setDataLoading(false);
    }
  }, [user]);

  useEffect(() => {
    if (user) {
      fetchAdminData();
    }
  }, [user, fetchAdminData]);

  const handleSignOut = async () => {
    await supabase.auth.signOut();
  };

  if (authChecking) {
    return (
      <div className="center-state">
        <p>Checking official session...</p>
      </div>
    );
  }

  if (!user) {
    return <AdminLogin />;
  }

  return (
    <div>
      {/* ── Official Admin Navbar ── */}
      <nav className="admin-navbar">
        <div>
          <div className="admin-brand-title">
            <span>🧹</span> పరిశుభ్రం (Parishubhram)
            <span className="admin-brand-badge">GHMC Admin</span>
          </div>
          <div className="admin-brand-subtitle">
            Municipal Waste Accountability &amp; Dispatch Portal
          </div>
        </div>

        <div className="admin-user-bar">
          <span className="admin-user-email">👤 {user.email}</span>
          <button onClick={handleSignOut} className="admin-signout-btn">
            Sign Out
          </button>
        </div>
      </nav>

      {/* ── Main Content ── */}
      <main className="admin-container">
        {dataLoading && reports.length === 0 ? (
          <div className="center-state">
            <p>Loading GHMC reports &amp; zone analytics...</p>
          </div>
        ) : (
          <>
            <ZoneAnalytics reports={reports} zones={zones} />
            <ReportsTable reports={reports} onRefresh={fetchAdminData} />
          </>
        )}
      </main>
    </div>
  );
}
