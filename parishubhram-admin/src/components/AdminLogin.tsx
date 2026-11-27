'use client';

import { useState } from 'react';
import { supabase } from '@/lib/supabase';

export default function AdminLogin() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setErrorMsg(null);

    try {
      const { error } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });

      if (error) throw error;
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : 'Invalid email or password';
      setErrorMsg(message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-page">
      <div className="login-card">
        <div className="login-header">
          <div className="login-icon">🧹</div>
          <h1>పరిశుభ్రం • GHMC Admin</h1>
          <p>Official Municipal Waste Management Portal</p>
        </div>

        <form onSubmit={handleLogin} className="login-form">
          {errorMsg && <div className="login-error">⚠️ {errorMsg}</div>}

          <div className="form-field">
            <label htmlFor="admin-email">Official Email</label>
            <input
              id="admin-email"
              type="email"
              required
              placeholder="official@ghmc.gov.in"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>

          <div className="form-field">
            <label htmlFor="admin-password">Password</label>
            <input
              id="admin-password"
              type="password"
              required
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>

          <button type="submit" disabled={loading} className="login-btn">
            {loading ? 'Signing in...' : 'Sign In to Dashboard'}
          </button>
        </form>

        <div className="login-hint">
          <strong>Setup tip:</strong> Create an official user in{' '}
          <code>Supabase Dashboard → Authentication → Users → Add user</code>{' '}
          with email &amp; password.
        </div>
      </div>
    </div>
  );
}
