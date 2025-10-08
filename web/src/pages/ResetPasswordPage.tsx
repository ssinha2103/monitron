import { FormEvent, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';

import { resetPassword } from '../api';

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
    <div className="auth-container">
      <div className="auth-card">
        <h2>Reset password</h2>
        <p className="auth-subtitle">Enter the token from your email and choose a new password.</p>
        <form className="auth-form" onSubmit={handleSubmit}>
          <label htmlFor="token">Reset token</label>
          <input id="token" value={token} onChange={(e) => setToken(e.target.value)} required />
          <label htmlFor="password">New password</label>
          <input
            id="password"
            type="password"
            autoComplete="new-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
          {error ? <div className="auth-error">{error}</div> : null}
          {message ? <div className="auth-success">{message}</div> : null}
          <button className="pill-button primary" type="submit" disabled={loading}>
            {loading ? 'Updating…' : 'Update password'}
          </button>
        </form>
        <div className="auth-footer">
          <Link to="/login">Back to login</Link>
        </div>
      </div>
    </div>
  );
}
