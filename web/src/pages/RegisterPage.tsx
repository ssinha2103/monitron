import { FormEvent, useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';

import { useAuth } from '../context/AuthContext';
import { AuthLayout } from '../components/AuthLayout';

export default function RegisterPage() {
  const navigate = useNavigate();
  const { register, user, loading: authLoading } = useAuth();
  const [form, setForm] = useState({ email: '', password: '', fullName: '' });
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!authLoading && user) {
      navigate('/app', { replace: true });
    }
  }, [authLoading, user, navigate]);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setLoading(true);
    setError(null);
    try {
      await register({ email: form.email, password: form.password, full_name: form.fullName });
      navigate('/app');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to register');
    } finally {
      setLoading(false);
    }
  };

  if (authLoading || user) {
    return (
      <AuthLayout title="Create account" subtitle="Monitor uptime, cron jobs, and incidents with a collaborative toolkit.">
        <div className="empty-state">Redirecting…</div>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout
      title="Create account"
      subtitle="Monitor uptime, cron jobs, and incidents with a collaborative toolkit."
      footer={
        <div className="auth-footer-single">
          Already have an account? <Link to="/login">Sign in</Link>
        </div>
      }
    >
      <form className="auth-form" onSubmit={handleSubmit}>
        <div className="input-field">
          <label htmlFor="fullName">Full name</label>
          <input
            id="fullName"
            value={form.fullName}
            onChange={(e) => setForm((prev) => ({ ...prev, fullName: e.target.value }))}
          />
        </div>
        <div className="input-field">
          <label htmlFor="email">Email</label>
          <input
            id="email"
            type="email"
            autoComplete="email"
            required
            value={form.email}
            onChange={(e) => setForm((prev) => ({ ...prev, email: e.target.value }))}
          />
        </div>
        <div className="input-field">
          <label htmlFor="password">Password</label>
          <input
            id="password"
            type="password"
            autoComplete="new-password"
            required
            value={form.password}
            onChange={(e) => setForm((prev) => ({ ...prev, password: e.target.value }))}
          />
        </div>
        {error ? <div className="auth-error">{error}</div> : null}
        <button className="pill-button primary auth-submit" type="submit" disabled={loading}>
          {loading ? 'Creating…' : 'Create account'}
        </button>
      </form>
    </AuthLayout>
  );
}
