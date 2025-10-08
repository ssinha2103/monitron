import { FormEvent, useState } from 'react';
import { Link } from 'react-router-dom';

import { forgotPassword } from '../api';

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const result = await forgotPassword(email);
      setMessage(result.message + (result.token ? ` Reset token: ${result.token}` : ''));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to process request');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-container">
      <div className="auth-card">
        <h2>Forgot password</h2>
        <p className="auth-subtitle">Enter your email and we'll send reset instructions.</p>
        <form className="auth-form" onSubmit={handleSubmit}>
          <label htmlFor="email">Email</label>
          <input
            id="email"
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
          {error ? <div className="auth-error">{error}</div> : null}
          {message ? <div className="auth-success">{message}</div> : null}
          <button className="pill-button primary" type="submit" disabled={loading}>
            {loading ? 'Sending…' : 'Send reset link'}
          </button>
        </form>
        <div className="auth-footer">
          <Link to="/login">Back to login</Link>
        </div>
      </div>
    </div>
  );
}
