import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';

interface AuthLayoutProps {
  title: string;
  subtitle: string;
  children: ReactNode;
  footer?: ReactNode;
}

export function AuthLayout({ title, subtitle, children, footer }: AuthLayoutProps) {
  return (
    <div className="auth-shell">
      <div className="auth-hero">
        <div className="auth-hero-content">
          <span className="hero-badge">Monitron</span>
          <h1>Monitor smarter, sleep better.</h1>
          <p>
            Real-time uptime, resilient cron monitoring, and lightning-fast alerts — presented in a calm, focused
            workspace built for reliable teams.
          </p>
          <ul className="hero-list">
            <li>
              <span className="hero-icon">⚡</span>
              <div>
                <strong>Latency insights</strong>
                <span>Visualise response times from every region.</span>
              </div>
            </li>
            <li>
              <span className="hero-icon">🔔</span>
              <div>
                <strong>Instant notifications</strong>
                <span>Stay ahead of outages with email, Slack, and more.</span>
              </div>
            </li>
            <li>
              <span className="hero-icon">🤝</span>
              <div>
                <strong>Team ready</strong>
                <span>Invite teammates, assign roles, and collaborate.</span>
              </div>
            </li>
          </ul>
          <div className="hero-meta">
            <span className="metric">
              <strong>30s</strong>
              <small>fastest probe interval</small>
            </span>
            <span className="metric">
              <strong>∞</strong>
              <small>projects per workspace</small>
            </span>
            <span className="metric">
              <strong>99.9%</strong>
              <small>platform uptime</small>
            </span>
          </div>
        </div>
      </div>
      <div className="auth-card">
        <div className="auth-heading">
          <h2>{title}</h2>
          <p>{subtitle}</p>
        </div>
        <div className="auth-form-wrapper">{children}</div>
        {footer ? <div className="auth-footer">{footer}</div> : null}
        <div className="auth-backlink">
          <Link to="/">← Back to home</Link>
        </div>
      </div>
    </div>
  );
}
