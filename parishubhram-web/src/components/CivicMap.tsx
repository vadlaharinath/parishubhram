import { useEffect, useRef, useState } from 'react';
import * as maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { supabase } from '../lib/supabase';
import { useToast } from '../lib/toast';
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
  const { showToast } = useToast();
  const mapContainer = useRef<HTMLDivElement>(null);
  const map = useRef<maplibregl.Map | null>(null);
  const userMarker = useRef<maplibregl.Marker | null>(null);

  const [selectedWard, setSelectedWard] = useState<string | null>(null);
  const [mapLoading, setMapLoading] = useState(true);
  const [viewMode, setViewMode] = useState<'pins' | 'heatmap'>('pins');
  const [locating, setLocating] = useState(false);

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

      const clusterSource = map.current.getSource('reports-source') as maplibregl.GeoJSONSource;
      if (clusterSource) {
        clusterSource.setData(reportsGeoJson);
      }

      const heatSource = map.current.getSource('reports-heat-source') as maplibregl.GeoJSONSource;
      if (heatSource) {
        heatSource.setData(reportsGeoJson);
      }
    } catch (err) {
      console.error('Failed to load report pins:', err);
    }
  };

  // Toggle between Clustered Pins and Heatmap layers
  useEffect(() => {
    if (!map.current) return;
    const m = map.current;
    const pinLayers = ['clusters', 'cluster-count', 'unclustered-point'];
    const isHeat = viewMode === 'heatmap';

    pinLayers.forEach((layerId) => {
      if (m.getLayer(layerId)) {
        m.setLayoutProperty(layerId, 'visibility', isHeat ? 'none' : 'visible');
      }
    });
    if (m.getLayer('reports-heatmap')) {
      m.setLayoutProperty('reports-heatmap', 'visibility', isHeat ? 'visible' : 'none');
    }
  }, [viewMode]);

  // "My Area" GPS Zoom
  const handleMyArea = () => {
    if (!navigator.geolocation) {
      showToast('Geolocation is not supported by your browser.', 'error');
      return;
    }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const lng = pos.coords.longitude;
        const lat = pos.coords.latitude;
        if (map.current) {
          map.current.flyTo({ center: [lng, lat], zoom: 14, speed: 1.4 });
          if (userMarker.current) {
            userMarker.current.setLngLat([lng, lat]);
          } else {
            userMarker.current = new maplibregl.Marker({ color: '#2563eb' })
              .setLngLat([lng, lat])
              .setPopup(new maplibregl.Popup().setHTML('<strong>📍 You are here</strong>'))
              .addTo(map.current);
          }
        }
        showToast('Zoomed to your current area!', 'success');
        setLocating(false);
      },
      (err) => {
        showToast(`Could not get location: ${err.message}`, 'error');
        setLocating(false);
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
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

          // Click ward polygon → navigate to ward dashboard (unless user clicked a pin/cluster)
          map.current.on('click', 'wards-fill', (e) => {
            if (!map.current || !e.features?.length) return;
            const pinHits = map.current.queryRenderedFeatures(e.point, {
              layers: ['clusters', 'unclustered-point'],
            });
            if (pinHits.length > 0) return;

            const f = e.features[0];
            const wardId = f.properties.id;
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

        if (map.current) {
          // 1. Unclustered source for Heatmap
          map.current.addSource('reports-heat-source', {
            type: 'geojson',
            data: { type: 'FeatureCollection', features: [] },
          });

          map.current.addLayer({
            id: 'reports-heatmap',
            type: 'heatmap',
            source: 'reports-heat-source',
            layout: { visibility: 'none' },
            paint: {
              'heatmap-weight': 1,
              'heatmap-intensity': ['interpolate', ['linear'], ['zoom'], 9, 1, 15, 3],
              'heatmap-color': [
                'interpolate',
                ['linear'],
                ['heatmap-density'],
                0, 'rgba(33,102,172,0)',
                0.2, 'rgb(103,169,207)',
                0.4, 'rgb(253,219,199)',
                0.6, 'rgb(239,138,98)',
                1, 'rgb(178,24,43)',
              ],
              'heatmap-radius': ['interpolate', ['linear'], ['zoom'], 9, 20, 15, 38],
              'heatmap-opacity': 0.85,
            },
          });

          // 2. Clustered source for Pins
          map.current.addSource('reports-source', {
            type: 'geojson',
            data: { type: 'FeatureCollection', features: [] },
            cluster: true,
            clusterMaxZoom: 13,
            clusterRadius: 45,
          });

          // Cluster circles
          map.current.addLayer({
            id: 'clusters',
            type: 'circle',
            source: 'reports-source',
            filter: ['has', 'point_count'],
            paint: {
              'circle-color': [
                'step',
                ['get', 'point_count'],
                '#f59e0b',
                5, '#ef4444',
                15, '#991b1b',
              ],
              'circle-radius': ['step', ['get', 'point_count'], 18, 5, 22, 15, 28],
              'circle-stroke-width': 2.5,
              'circle-stroke-color': '#ffffff',
            },
          });

          // Cluster count label
          map.current.addLayer({
            id: 'cluster-count',
            type: 'symbol',
            source: 'reports-source',
            filter: ['has', 'point_count'],
            layout: {
              'text-field': ['get', 'point_count_abbreviated'],
              'text-size': 12,
            },
            paint: {
              'text-color': '#ffffff',
            },
          });

          // Individual unclustered pins (🔴 reported, 🟡 in_progress, 🟢 resolved)
          map.current.addLayer({
            id: 'unclustered-point',
            type: 'circle',
            source: 'reports-source',
            filter: ['!', ['has', 'point_count']],
            paint: {
              'circle-radius': 9,
              'circle-color': [
                'match',
                ['get', 'status'],
                'resolved', '#16a34a',
                'in_progress', '#d97706',
                '#dc2626',
              ],
              'circle-stroke-width': 2.5,
              'circle-stroke-color': '#ffffff',
            },
          });

          // Click cluster → zoom in smoothly
          map.current.on('click', 'clusters', async (e) => {
            if (!map.current) return;
            const features = map.current.queryRenderedFeatures(e.point, { layers: ['clusters'] });
            if (!features.length) return;
            const clusterId = features[0].properties.cluster_id;
            const source = map.current.getSource('reports-source') as maplibregl.GeoJSONSource;
            const zoom = await source.getClusterExpansionZoom(clusterId);
            const geom = features[0].geometry as any;
            map.current.easeTo({
              center: geom.coordinates,
              zoom,
            });
          });

          // Click individual pin → popup
          const reportPopup = new maplibregl.Popup();
          map.current.on('click', 'unclustered-point', (e) => {
            if (!map.current || !e.features?.length) return;
            const feat = e.features[0];
            const p = feat.properties;
            const geom = feat.geometry as any;
            const statusColor =
              p.status === 'resolved' ? '#16a34a' : p.status === 'in_progress' ? '#d97706' : '#dc2626';
            const statusText =
              p.status === 'resolved'
                ? 'CLEANED & RESOLVED'
                : p.status === 'in_progress'
                ? 'CLEANUP IN PROGRESS'
                : 'ACTIVE BLACKSPOT';

            reportPopup
              .setLngLat(geom.coordinates as [number, number])
              .setHTML(`
                <div style="font-family:sans-serif;max-width:240px;">
                  <img src="${p.resolution_photo_url || p.image_url}" style="width:100%;height:120px;object-fit:cover;border-radius:6px;margin-bottom:6px;" />
                  <div style="font-size:11px;font-weight:800;color:${statusColor};text-transform:uppercase;">
                    ● ${statusText}
                  </div>
                  <div style="font-size:13px;font-weight:700;color:#0f172a;margin-top:2px;">${p.category.replace('_', ' ').toUpperCase()}</div>
                  ${p.address ? `<div style="font-size:11px;color:#15803d;font-weight:600;margin-top:4px;">📍 ${p.address}</div>` : ''}
                </div>
              `)
              .addTo(map.current);
          });

          ['clusters', 'unclustered-point'].forEach((layer) => {
            map.current?.on('mouseenter', layer, () => {
              if (map.current) map.current.getCanvas().style.cursor = 'pointer';
            });
            map.current?.on('mouseleave', layer, () => {
              if (map.current) map.current.getCanvas().style.cursor = '';
            });
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
      userMarker.current?.remove();
      userMarker.current = null;
      map.current?.remove();
      map.current = null;
    };
  }, []);

  useEffect(() => {
    loadReports();
  }, [refreshTrigger, statusFilter, categoryFilter, searchQuery]);

  return (
    <div className="map-wrapper">
      <div className="map-header">
        <div>
          <h2 style={{ fontSize: '1.25rem', fontWeight: 700 }}>Interactive Hyderabad Ward GIS Map</h2>
          <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
            Click a ward for its dashboard. Click 🔴🟡🟢 pins for details, or toggle Heatmap.
          </p>
        </div>

        <div className="map-controls">
          <button
            type="button"
            className={`map-ctrl-btn ${viewMode === 'pins' ? 'active' : ''}`}
            onClick={() => setViewMode('pins')}
          >
            📍 Pins
          </button>
          <button
            type="button"
            className={`map-ctrl-btn ${viewMode === 'heatmap' ? 'active' : ''}`}
            onClick={() => setViewMode('heatmap')}
          >
            🔥 Heatmap
          </button>
          <button
            type="button"
            className="map-ctrl-btn"
            onClick={handleMyArea}
            disabled={locating}
          >
            {locating ? '⏳ Locating...' : '🎯 My Area'}
          </button>
          {selectedWard && <div className="selected-ward-pill">📍 {selectedWard}</div>}
        </div>
      </div>

      <div className="map-container-box">
        {mapLoading && (
          <div className="map-loading-overlay">
            <span>Loading Map &amp; Ward Boundaries...</span>
          </div>
        )}
        <div ref={mapContainer} className="map-canvas" />
      </div>
    </div>
  );
}
