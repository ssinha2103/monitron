import { FormEvent, useState } from 'react';
import { Link } from 'react-router-dom';

import { forgotPassword } from '../api';
import { AuthLayout } from '../components/AuthLayout';

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
    <AuthLayout
      title="Forgot password"
      subtitle="We’ll email a secure link so you can choose a new password."
      footer={<Link to="/login">Remembered it? Back to login</Link>}
    >
      <form className="auth-form" onSubmit={handleSubmit}>
        <div className="input-field">
          <label htmlFor="email">Email</label>
          <input
            id="email"
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </div>
        {error ? <div className="auth-error">{error}</div> : null}
        {message ? <div className="auth-success">{message}</div> : null}
        <button className="pill-button primary auth-submit" type="submit" disabled={loading}>
          {loading ? 'Sending…' : 'Send reset link'}
        </button>
      </form>
    </AuthLayout>
  );
}
