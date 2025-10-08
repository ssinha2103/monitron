import { FormEvent, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';

import { resetPassword } from '../api';
import { AuthLayout } from '../components/AuthLayout';

export default function ResetPasswordPage() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const tokenFromQuery = params.get('token') ?? '';

  const [token, setToken] = useState(tokenFromQuery);
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const result = await resetPassword(token, password);
      setMessage(result.message);
      setTimeout(() => navigate('/login'), 2000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to reset password');
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthLayout
      title="Reset password"
      subtitle="Paste the reset token we emailed you and choose a new password."
      footer={<Link to="/login">Back to login</Link>}
    >
      <form className="auth-form" onSubmit={handleSubmit}>
        <div className="input-field">
          <label htmlFor="token">Reset token</label>
          <input id="token" value={token} onChange={(e) => setToken(e.target.value)} required />
        </div>
        <div className="input-field">
          <label htmlFor="password">New password</label>
          <input
            id="password"
            type="password"
            autoComplete="new-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
        </div>
        {error ? <div className="auth-error">{error}</div> : null}
        {message ? <div className="auth-success">{message}</div> : null}
        <button className="pill-button primary auth-submit" type="submit" disabled={loading}>
          {loading ? 'Updating…' : 'Update password'}
        </button>
      </form>
    </AuthLayout>
  );
}
