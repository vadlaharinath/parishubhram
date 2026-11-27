import React, { useState } from 'react';
import { supabase } from '../lib/supabase';
import { compressImage } from '../lib/imageCompressor';
import './ResolveModal.css';

interface ResolveModalProps {
  reportId: string | null;
  onClose: () => void;
  onSuccess: () => void;
}

export default function ResolveModal({ reportId, onClose, onSuccess }: ResolveModalProps) {
  const [photo, setPhoto] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [note, setNote] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  if (!reportId) return null;

  const handlePhotoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      setPhoto(file);
      setPreview(URL.createObjectURL(file));
    }
  };

  const handleResolveSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!photo) {
      setErrorMsg('Please upload an after-cleanup photo as proof!');
      return;
    }

    setSubmitting(true);
    setErrorMsg(null);

    try {
      // 1. Compress after photo
      const compressedBlob = await compressImage(photo);

      // 2. Upload to Supabase Storage
      const fileName = `cleanup_${Date.now()}_${Math.random().toString(36).substring(7)}.webp`;
      const { error: uploadError } = await supabase.storage
        .from('report-images')
        .upload(fileName, compressedBlob, { contentType: 'image/webp' });

      if (uploadError) throw uploadError;

      const { data: publicUrlData } = supabase.storage
        .from('report-images')
        .getPublicUrl(fileName);

      // 3. Call RPC function
      const { error: rpcError } = await supabase.rpc('mark_report_resolved', {
        p_report_id: reportId,
        p_resolution_photo_url: publicUrlData.publicUrl,
        p_resolution_note: note.trim() || 'Cleaned up by community / municipal sanitarians',
      });

      if (rpcError) throw rpcError;

      setSubmitting(false);
      onSuccess();
      onClose();
    } catch (err: any) {
      console.error('Resolve error:', err);
      setErrorMsg(err.message || 'Failed to resolve report.');
      setSubmitting(false);
    }
  };

  return (
    <div className="modal-backdrop">
      <div className="modal-card">
        <div className="modal-header">
          <h3>✨ Verify Cleanup (శుభ్రం చేయబడింది)</h3>
          <button onClick={onClose} className="modal-close-btn">✕</button>
        </div>

        <form onSubmit={handleResolveSubmit} className="modal-form">
          <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>
            Upload an "After Photo" to verify that this garbage blackspot has been cleared!
          </p>

          {errorMsg && <div className="modal-error">{errorMsg}</div>}

          {/* After Photo Upload */}
          <div className="form-group">
            <label className="form-label">After-Cleanup Photo Proof *</label>
            <input
              type="file"
              accept="image/*"
              capture="environment"
              id="cleanup-photo-input"
              style={{ display: 'none' }}
              onChange={handlePhotoChange}
            />
            <label htmlFor="cleanup-photo-input" className="photo-picker-box">
              {preview ? (
                <img src={preview} alt="Cleaned preview" className="photo-preview-img" />
              ) : (
                <div style={{ textAlign: 'center' }}>
                  <div style={{ fontSize: '2.5rem' }}>🌱</div>
                  <div style={{ fontWeight: 600, color: '#16a34a', marginTop: '4px' }}>
                    Tap to upload Cleaned Area Photo
                  </div>
                </div>
              )}
            </label>
          </div>

          {/* Note */}
          <div className="form-group">
            <label className="form-label">Resolution Note (Optional)</label>
            <input
              type="text"
              placeholder="e.g. Cleared by GHMC sanitary team on Wednesday morning"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              className="form-input"
            />
          </div>

          <button
            type="submit"
            disabled={submitting}
            className="submit-report-btn"
            style={{ background: '#16a34a' }}
          >
            {submitting ? 'Verifying...' : '✓ Confirm & Mark as Resolved 🟢'}
          </button>
        </form>
      </div>
    </div>
  );
}