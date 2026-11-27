import { useEffect, useRef, useState } from 'react';
import * as maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { supabase } from '../lib/supabase';
import './CivicMap.css';

interface CivicMapProps {
  refreshTrigger?: number;
  statusFilter?: string;
  categoryFilter?: string;
  searchQuery?: string;
  onWardClick?: (wardId: string, wardName: string) => void;
}

export default function CivicMap({
  refreshTrigger = 0,
  statusFilter = 'all',
  categoryFilter = 'all',
  searchQuery = '',
  onWardClick,
}: CivicMapProps) {
  const mapContainer = useRef<HTMLDivElement>(null);
  const map = useRef<maplibregl.Map | null>(null);
  const [selectedWard, setSelectedWard] = useState<string | null>(null);
  const [mapLoading, setMapLoading] = useState(true);

  const loadReports = async () => {
    if (!map.current) return;
    try {
      let query = supabase
        .from('reports')
        .select('id, category, severity, description, address, image_url, resolution_photo_url, lat, lng, status, created_at');

      if (statusFilter !== 'all') {
        query = query.eq('status', statusFilter);
      }
      if (categoryFilter !== 'all') {
        query = query.eq('category', categoryFilter);
      }

      const { data: reports, error } = await query.order('created_at', { ascending: false });
      if (error) throw error;

      // Filter by search query client-side
      const filtered = (reports || []).filter((r) => {
        if (!searchQuery) return true;
        const q = searchQuery.toLowerCase();
        return (
          (r.address && r.address.toLowerCase().includes(q)) ||
          (r.description && r.description.toLowerCase().includes(q))
        );
      });

      const reportsGeoJson: any = {
        type: 'FeatureCollection',
        features: filtered.map((r) => ({
          type: 'Feature',
          geometry: {
            type: 'Point',
            coordinates: [Number(r.lng), Number(r.lat)],
          },
          properties: {
            id: r.id,
            category: r.category,
            severity: r.severity,
            description: r.description,
            address: r.address,
            image_url: r.image_url,
            resolution_photo_url: r.resolution_photo_url,
            status: r.status,
          },
        })),
      };

      const source = map.current.getSource('reports-source') as maplibregl.GeoJSONSource;
      if (source) {
        source.setData(reportsGeoJson);
      }
    } catch (err) {
      console.error('Failed to load report pins:', err);
    }
  };

  useEffect(() => {
    if (!mapContainer.current || map.current) return;

    map.current = new maplibregl.Map({
      container: mapContainer.current,
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
      center: [78.4867, 17.3850],
      zoom: 10.5,
    });

    map.current.addControl(new maplibregl.NavigationControl(), 'top-right');

    map.current.on('load', async () => {
      try {
        const { data: geojsonData } = await supabase.rpc('get_wards_geojson');
        if (map.current && geojsonData) {
          map.current.addSource('ghmc-wards', {
            type: 'geojson',
            data: geojsonData,
            promoteId: 'ward_number',
          });

          map.current.addLayer({
            id: 'wards-fill',
            type: 'fill',
            source: 'ghmc-wards',
            paint: {
              'fill-color': '#15803d',
              'fill-opacity': ['case', ['boolean', ['feature-state', 'hover'], false], 0.4, 0.12],
            },
          });

          map.current.addLayer({
            id: 'wards-outline',
            type: 'line',
            source: 'ghmc-wards',
            paint: { 'line-color': '#166534', 'line-width': 1.5 },
          });

          let hoveredId: string | number | undefined = undefined;
          const wardPopup = new maplibregl.Popup({ closeButton: false, closeOnClick: false });

          map.current.on('mousemove', 'wards-fill', (e) => {
            if (!map.current || !e.features?.length) return;
            map.current.getCanvas().style.cursor = 'pointer';
            const f = e.features[0];
            if (hoveredId !== undefined) {
              map.current.setFeatureState({ source: 'ghmc-wards', id: hoveredId }, { hover: false });
            }
            hoveredId = f.properties.ward_number;
            map.current.setFeatureState({ source: 'ghmc-wards', id: hoveredId }, { hover: true });
            setSelectedWard(`Ward #${f.properties.ward_number} — ${f.properties.ward_name}`);
            wardPopup.setLngLat(e.lngLat).setHTML(`
              <div style="font-family:sans-serif;padding:2px 4px;">
                <div style="font-size:10px;font-weight:700;color:#15803d">GHMC WARD #${f.properties.ward_number}</div>
                <div style="font-size:13px;font-weight:600;color:#0f172a">${f.properties.ward_name}</div>
                <div style="font-size:10px;color:#64748b;margin-top:2px;">Click to view ward dashboard →</div>
              </div>
            `).addTo(map.current);
          });

          // ✨ NEW: Click ward polygon → navigate to ward dashboard
          map.current.on('click', 'wards-fill', (e) => {
            if (!e.features?.length) return;
            const f = e.features[0];
            const wardId = f.properties.id;      // UUID from our wards table
            const wardName = f.properties.ward_name;
            if (wardId && onWardClick) {
              onWardClick(wardId, wardName);
            }
          });

          map.current.on('mouseleave', 'wards-fill', () => {
            if (!map.current) return;
            map.current.getCanvas().style.cursor = '';
            if (hoveredId !== undefined) {
              map.current.setFeatureState({ source: 'ghmc-wards', id: hoveredId }, { hover: false });
            }
            hoveredId = undefined;
            setSelectedWard(null);
            wardPopup.remove();
          });
        }

        // Add Points Source with Dynamic Red/Green Pin Colors
        if (map.current) {
          map.current.addSource('reports-source', {
            type: 'geojson',
            data: { type: 'FeatureCollection', features: [] },
          });

          map.current.addLayer({
            id: 'reports-circles',
            type: 'circle',
            source: 'reports-source',
            paint: {
              'circle-radius': 9,
              // 🔴 Red for reported, 🟢 Green for resolved!
              'circle-color': [
                'match',
                ['get', 'status'],
                'resolved', '#16a34a',
                '#dc2626'
              ],
              'circle-stroke-width': 2.5,
              'circle-stroke-color': '#ffffff',
            },
          });

          const reportPopup = new maplibregl.Popup();
          map.current.on('click', 'reports-circles', (e) => {
            if (!map.current || !e.features?.length) return;
            const feat = e.features[0];
            const p = feat.properties;
            const geom = feat.geometry as any;

            reportPopup
              .setLngLat(geom.coordinates as [number, number])
              .setHTML(`
                <div style="font-family:sans-serif;max-width:240px;">
                  <img src="${p.resolution_photo_url || p.image_url}" style="width:100%;height:120px;object-fit:cover;border-radius:6px;margin-bottom:6px;" />
                  <div style="font-size:11px;font-weight:800;color:${p.status === 'resolved' ? '#16a34a' : '#dc2626'};text-transform:uppercase;">
                    ● ${p.status === 'resolved' ? 'CLEANED & RESOLVED' : 'ACTIVE BLACKSPOT'}
                  </div>
                  <div style="font-size:13px;font-weight:700;color:#0f172a;margin-top:2px;">${p.category.replace('_', ' ').toUpperCase()}</div>
                  ${p.address ? `<div style="font-size:11px;color:#15803d;font-weight:600;margin-top:4px;">📍 ${p.address}</div>` : ''}
                </div>
              `)
              .addTo(map.current);
          });

          map.current.on('mouseenter', 'reports-circles', () => {
            if (map.current) map.current.getCanvas().style.cursor = 'pointer';
          });
          map.current.on('mouseleave', 'reports-circles', () => {
            if (map.current) map.current.getCanvas().style.cursor = '';
          });
        }

        await loadReports();
        setMapLoading(false);
      } catch (err) {
        console.error('Map loading error:', err);
        setMapLoading(false);
      }
    });

    return () => {
      map.current?.remove();
      map.current = null;
    };
  }, []);

  // Reload pins when filters or refreshTrigger change
  useEffect(() => {
    loadReports();
  }, [refreshTrigger, statusFilter, categoryFilter, searchQuery]);

  return (
    <div className="map-wrapper">
      <div className="map-header">
        <div>
          <h2 style={{ fontSize: '1.25rem', fontWeight: 700 }}>Interactive Hyderabad Ward GIS Map</h2>
          <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
            Hover over a ward then <strong>click to open its dashboard</strong>. Click 🔴🟢 pins for details.
          </p>
        </div>
        {selectedWard && <div className="selected-ward-pill">📍 {selectedWard}</div>}
      </div>

      <div className="map-container-box">
        {mapLoading && (
          <div className="map-loading-overlay">
            <span>Loading Map & Ward Boundaries...</span>
          </div>
        )}
        <div ref={mapContainer} className="map-canvas" />
      </div>
    </div>
  );
}
