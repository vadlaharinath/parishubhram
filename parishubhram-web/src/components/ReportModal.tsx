import React, { useState } from 'react';
import { supabase } from '../lib/supabase';
import { compressImage } from '../lib/imageCompressor';
import { useToast } from '../lib/toast';
import './ReportModal.css';

const RATE_LIMIT_KEY = 'parishubhram_submit_history';
const MAX_REPORTS_PER_WINDOW = 3;
const WINDOW_MS = 5 * 60 * 1000; // 5 minutes

interface ReportModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  cityId: string;
}

const CATEGORIES = [
  { id: 'garbage_dump', label: 'Garbage Dump / చెత్త కుప్ప', icon: '🗑️' },
  { id: 'overflowing_bin', label: 'Overflowing Bin / డస్ట్బిన్ నిండిపోవడం', icon: '📦' },
  { id: 'drain_overflow', label: 'Drainage Overflow / డ్రైనేజ్ లీకేజ్', icon: '🚰' },
  { id: 'construction_debris', label: 'C&D Debris / నిర్మాణ వ్యర్థాలు', icon: '🧱' },
  { id: 'plastic_waste', label: 'Plastic Dump / ప్లాస్టిక్ వ్యర్థాలు', icon: '🥤' },
  { id: 'road_damage', label: 'Pothole / రోడ్డు గుంతలు', icon: '🕳️' },
  { id: 'other', label: 'Other Issue / ఇతర సమస్య', icon: '⚠️' },
];

export default function ReportModal({ isOpen, onClose, onSuccess, cityId }: ReportModalProps) {
  const { showToast } = useToast();
  const [photo, setPhoto] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [category, setCategory] = useState('garbage_dump');
  const [severity, setSeverity] = useState('medium');
  const [description, setDescription] = useState('');
  const [location, setLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [areaName, setAreaName] = useState<string | null>(null); // 📍 Real Location Name
  const [locating, setLocating] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  if (!isOpen) return null;

  // 1. One-click GPS Location Grabber + Free Reverse Geocoding
  const handleGetLocation = () => {
    if (!navigator.geolocation) {
      showToast('Geolocation is not supported by your browser.', 'error');
      return;
    }
    setLocating(true);
    setAreaName(null);

    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const lat = Number(pos.coords.latitude.toFixed(6));
        const lng = Number(pos.coords.longitude.toFixed(6));
        setLocation({ lat, lng });

        // 🔍 Fetch real area/neighborhood name from OpenStreetMap (Free Nominatim API)
        try {
          const response = await fetch(
            `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&zoom=16&addressdetails=1`,
            { headers: { 'Accept-Language': 'en' } }
          );
          const data = await response.json();

          if (data && data.address) {
            const parts = [
              data.address.neighbourhood,
              data.address.suburb || data.address.residential || data.address.road,
              data.address.city_district || data.address.city || 'Hyderabad'
            ].filter(Boolean);

            const detected = parts.join(', ');
            setAreaName(detected || data.display_name?.split(',').slice(0, 3).join(',') || 'Hyderabad Area');
          }
        } catch (err) {
          console.warn('Could not fetch reverse geocode area:', err);
        } finally {
          setLocating(false);
        }
      },
      (err) => {
        showToast(`Location unavailable: ${err.message}`, 'error');
        setLocating(false);
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  };

  // 2. Photo capture / selection
  const handlePhotoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      setPhoto(file);
      setPhotoPreview(URL.createObjectURL(file));

      // Auto-trigger GPS when user picks photo
      if (!location) {
        handleGetLocation();
      }
    }
  };

  // 3. Form Submit Handler (with anti-spam rate limiting)
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!photo) {
      setErrorMsg('Please attach or take a photo of the garbage site.');
      return;
    }
    if (!location) {
      setErrorMsg('Please capture your GPS location.');
      return;
    }

    // Rate-limit check: max 3 reports per 5 minutes per browser
    try {
      const now = Date.now();
      const raw = localStorage.getItem(RATE_LIMIT_KEY);
      const history: number[] = raw ? JSON.parse(raw) : [];
      const recent = history.filter((ts) => now - ts < WINDOW_MS);
      if (recent.length >= MAX_REPORTS_PER_WINDOW) {
        const waitSec = Math.ceil((WINDOW_MS - (now - recent[0])) / 1000);
        setErrorMsg(`Please wait ${waitSec}s before submitting another report (spam protection).`);
        return;
      }
    } catch {
      // Ignore localStorage errors in private browsing
    }

    setSubmitting(true);
    setErrorMsg(null);

    try {
      // Step A: Compress image (8MB -> 120KB WebP)
      const compressedBlob = await compressImage(photo);

      // Step B: Upload to Supabase Storage
      const fileName = `report_${Date.now()}_${Math.random().toString(36).substring(7)}.webp`;
      const { error: uploadError } = await supabase.storage
        .from('report-images')
        .upload(fileName, compressedBlob, { contentType: 'image/webp' });

      if (uploadError) throw uploadError;

      // Step C: Get public URL
      const { data: publicUrlData } = supabase.storage
        .from('report-images')
        .getPublicUrl(fileName);

      const imageUrl = publicUrlData.publicUrl;

      // Step D: Insert Report into PostgreSQL (Trigger automatically tags ward!)
      const { error: insertError } = await supabase.from('reports').insert({
        city_id: cityId,
        location: `POINT(${location.lng} ${location.lat})`, // Longitude first for PostGIS!
        address: areaName, // <-- SAVES REAL AREA NAME (e.g. Shakthi Nagar, Moosapet)
        category,
        severity,
        description: description.trim() || null,
        image_url: imageUrl,
        status: 'reported',
      });

      if (insertError) throw insertError;

      // Record submission timestamp for client-side rate limiting
      try {
        const now = Date.now();
        const raw = localStorage.getItem(RATE_LIMIT_KEY);
        const history: number[] = raw ? JSON.parse(raw) : [];
        const updated = [...history.filter((ts) => now - ts < WINDOW_MS), now];
        localStorage.setItem(RATE_LIMIT_KEY, JSON.stringify(updated));
      } catch {
        // Ignore storage errors
      }

      // Done! Reset & notify parent
      setSubmitting(false);
      onSuccess();
      onClose();
    } catch (err: any) {
      console.error('Submission failed:', err);
      setErrorMsg(err.message || 'Failed to submit report. Please try again.');
      setSubmitting(false);
    }
  };

  return (
    <div className="modal-backdrop">
      <div className="modal-card">
        <div className="modal-header">
          <h3>📸 Report Garbage Blackspot</h3>
          <button onClick={onClose} className="modal-close-btn">✕</button>
        </div>

        <form onSubmit={handleSubmit} className="modal-form">
          {errorMsg && <div className="modal-error">{errorMsg}</div>}

          {/* Photo Upload Area */}
          <div className="form-group">
            <label className="form-label">Photo of the Waste Site *</label>
            <input
              type="file"
              accept="image/*"
              capture="environment" // Opens rear camera on mobile phones!
              id="camera-input"
              style={{ display: 'none' }}
              onChange={handlePhotoChange}
            />
            <label htmlFor="camera-input" className="photo-picker-box">
              {photoPreview ? (
                <img src={photoPreview} alt="Preview" className="photo-preview-img" />
              ) : (
                <div style={{ textAlign: 'center' }}>
                  <div style={{ fontSize: '2.5rem' }}>📷</div>
                  <div style={{ fontWeight: 600, color: 'var(--primary)', marginTop: '4px' }}>
                    Tap to Open Camera or Upload Photo
                  </div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                    Auto-compressed to 120KB WebP
                  </div>
                </div>
              )}
            </label>
          </div>

          {/* GPS Location Button + Detected Area Name */}
          <div className="form-group">
            <label className="form-label">GPS Location *</label>
            <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
              <button
                type="button"
                onClick={handleGetLocation}
                disabled={locating}
                className="gps-btn"
              >
                {locating ? '📡 Detecting Area...' : '📍 Fetch Exact GPS Coordinates'}
              </button>
              {location && (
                <span className="gps-badge">
                  ✓ {location.lat}, {location.lng}
                </span>
              )}
            </div>

            {/* 🌟 Detected Real Neighborhood Name */}
            {areaName && (
              <div style={{
                marginTop: '8px',
                padding: '8px 12px',
                background: '#f0fdf4',
                border: '1px solid #bbf7d0',
                borderRadius: '6px',
                fontSize: '0.85rem',
                color: '#166534',
                fontWeight: 600,
                display: 'flex',
                alignItems: 'center',
                gap: '6px'
              }}>
                <span>📍</span>
                <span>Detected Area: <strong>{areaName}</strong></span>
              </div>
            )}
          </div>

          {/* Issue Category */}
          <div className="form-group">
            <label className="form-label">Issue Category</label>
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              className="form-select"
            >
              {CATEGORIES.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.icon} {c.label}
                </option>
              ))}
            </select>
          </div>

          {/* Severity */}
          <div className="form-group">
            <label className="form-label">Severity Level</label>
            <div className="severity-row">
              {['low', 'medium', 'high', 'critical'].map((s) => (
                <button
                  type="button"
                  key={s}
                  onClick={() => setSeverity(s)}
                  className={`severity-pill ${severity === s ? 'active-' + s : ''}`}
                >
                  {s.toUpperCase()}
                </button>
              ))}
            </div>
          </div>

          {/* Optional Note */}
          <div className="form-group">
            <label className="form-label">Notes (Landmark / Street Details)</label>
            <input
              type="text"
              placeholder="e.g. Opposite Metro Pillar 104, near tea stall"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              maxLength={140}
              className="form-input"
            />
          </div>

          {/* Submit Button */}
          <button
            type="submit"
            disabled={submitting}
            className="submit-report-btn"
          >
            {submitting ? '🚀 Compressing & Submitting...' : '✓ Submit Report (Anonymous)'}
          </button>
        </form>
      </div>
    </div>
  );
}