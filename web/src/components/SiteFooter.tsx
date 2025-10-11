import clsx from 'clsx';
import { Link } from 'react-router-dom';

import { Logo } from './Logo';

type SiteFooterProps = {
  className?: string;
};

export function SiteFooter({ className }: SiteFooterProps) {
  const year = new Date().getFullYear();

  return (
    <footer className={clsx('site-footer', className)}>
      <div className="footer-row">
        <div className="footer-brand">
          <Logo size={32} />
          <p>Stay ahead of incidents with unified uptime, cron, and alerting built for modern ops teams.</p>
        </div>
        <div className="footer-groups">
          <div className="footer-group">
            <span className="footer-heading">Product</span>
            <Link to="/">Overview</Link>
            <Link to="/app">Dashboard</Link>
            <a href="https://status.monitron.dev" target="_blank" rel="noreferrer">
              Status
            </a>
          </div>
          <div className="footer-group">
            <span className="footer-heading">Company</span>
            <Link to="/register">Start trial</Link>
            <Link to="/login">Sign in</Link>
            <a href="mailto:support@monitron.dev">Support</a>
          </div>
          <div className="footer-group">
            <span className="footer-heading">Resources</span>
            <a href="https://docs.monitron.dev" target="_blank" rel="noreferrer">
              Docs
            </a>
            <a href="https://changelog.monitron.dev" target="_blank" rel="noreferrer">
              Changelog
            </a>
            <a href="https://privacy.monitron.dev" target="_blank" rel="noreferrer">
              Privacy
            </a>
          </div>
        </div>
      </div>
      <div className="footer-meta">
        <span>© {year} Monitron Labs. All rights reserved.</span>
        <div className="footer-meta-links">
          <a href="https://terms.monitron.dev" target="_blank" rel="noreferrer">
            Terms
          </a>
          <a href="https://security.monitron.dev" target="_blank" rel="noreferrer">
            Security
          </a>
          <a href="mailto:legal@monitron.dev">Legal</a>
        </div>
      </div>
    </footer>
  );
}
