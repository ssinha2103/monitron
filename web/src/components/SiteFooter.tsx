import clsx from 'clsx';
import { type FormEvent, useState } from 'react';
import { Link } from 'react-router-dom';

import { Logo } from './Logo';

type InternalLink = {
  label: string;
  to: string;
  description?: string;
};

type ExternalLink = {
  label: string;
  href: string;
  description?: string;
};

type FooterLink = InternalLink | ExternalLink;

type LinkGroup = {
  heading: string;
  links: FooterLink[];
};

type SocialLink = {
  label: string;
  href: string;
};

type Highlight = {
  label: string;
  value: string;
  detail: string;
};

type SiteFooterProps = {
  className?: string;
};

const linkGroups: LinkGroup[] = [
  {
    heading: 'Product',
    links: [
      { label: 'Overview', to: '/', description: 'Why Monitron' },
      { label: 'Dashboard', to: '/app', description: 'Manage uptime & alerts' },
      { label: 'Status', href: 'https://status.monitron.dev', description: 'Live platform health' }
    ]
  },
  {
    heading: 'Company',
    links: [
      { label: 'Start trial', to: '/register', description: '15-day premium access' },
      { label: 'Sign in', to: '/login' },
      {
        label: 'Contact sales',
        href: 'mailto:sudarshansinha21@gmail.com',
        description: 'Volume & enterprise plans'
      }
    ]
  },
  {
    heading: 'Resources',
    links: [
      { label: 'Documentation', href: 'https://docs.monitron.dev', description: 'Guides & API reference' },
      { label: 'Changelog', href: 'https://changelog.monitron.dev', description: 'Latest releases' },
      { label: 'Privacy & GDPR', href: 'https://privacy.monitron.dev', description: 'Security & compliance' }
    ]
  },
  {
    heading: 'Integrations',
    links: [
      { label: 'Slack', href: 'https://docs.monitron.dev/integrations/slack' },
      { label: 'PagerDuty', href: 'https://docs.monitron.dev/integrations/pagerduty' },
      { label: 'Opsgenie', href: 'https://docs.monitron.dev/integrations/opsgenie' }
    ]
  }
];

const socialLinks: SocialLink[] = [
  { label: 'GitHub', href: 'https://github.com/monitron-labs' },
  { label: 'LinkedIn', href: 'https://www.linkedin.com/company/monitron' },
  { label: 'Twitter / X', href: 'https://twitter.com/monitronops' }
];

const highlights: Highlight[] = [
  { label: 'Global probes', value: '12 regions', detail: 'Multi-continent coverage' },
  { label: 'Median response', value: '< 3 min', detail: 'Triage & first reply' },
  { label: 'Customer NPS', value: '63', detail: 'April 2025 survey' }
];

const isExternalLink = (link: FooterLink): link is ExternalLink => 'href' in link;

export function SiteFooter({ className }: SiteFooterProps) {
  const year = new Date().getFullYear();
  const [email, setEmail] = useState('');
  const [status, setStatus] = useState<'idle' | 'success' | 'error'>('idle');
  const [feedback, setFeedback] = useState('');

  const handleNewsletterSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const trimmed = email.trim();
    const isValidEmail = /\S+@\S+\.\S+/.test(trimmed);

    if (!isValidEmail) {
      setStatus('error');
      setFeedback('Enter a valid work email to join the release notes.');
      return;
    }

    setStatus('success');
    setFeedback('Thanks for subscribing! We will reach out shortly.');
    setEmail('');
  };

  return (
    <footer className={clsx('site-footer', className)}>
      <div className="footer-row">
        <div className="footer-brand">
          <Logo size={32} />
          <p>
            Stay ahead of incidents with unified uptime, cron, and alerting built for modern ops teams. Configure
            monitors in minutes and keep stakeholders informed every step of the way.
          </p>
          <div className="footer-actions">
            <Link to="/register" className="footer-button primary">
              Start for free
            </Link>
            <a className="footer-button" href="mailto:sudarshansinha21@gmail.com">
              Talk to support
            </a>
          </div>
          <ul className="footer-highlights">
            {highlights.map((item) => (
              <li key={item.label}>
                <span className="footer-highlight-label">{item.label}</span>
                <span className="footer-highlight-value">{item.value}</span>
                <span className="footer-highlight-detail">{item.detail}</span>
              </li>
            ))}
          </ul>
        </div>

        <nav className="footer-groups" aria-label="Footer navigation">
          {linkGroups.map((group) => (
            <div key={group.heading} className="footer-group">
              <span className="footer-heading">{group.heading}</span>
              <ul>
                {group.links.map((link) => (
                  <li key={link.label}>
                    {isExternalLink(link) ? (
                      <a href={link.href} target="_blank" rel="noopener noreferrer">
                        {link.label}
                      </a>
                    ) : (
                      <Link to={link.to}>{link.label}</Link>
                    )}
                    {link.description ? <span className="footer-link-detail">{link.description}</span> : null}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </nav>

        <div className="footer-contact">
          <span className="footer-heading">Stay in touch</span>
          <p>
            Need a custom quote or want to migrate a large set of monitors? Drop us a note and our team will respond
            within one business day.
          </p>
          <a className="footer-contact-link" href="mailto:sudarshansinha21@gmail.com">
            sudarshansinha21@gmail.com
          </a>
          <a className="footer-contact-link" href="mailto:sudarshansinha21@gmail.com">
            Security outreach — sudarshansinha21@gmail.com
          </a>
          <form className="footer-newsletter" onSubmit={handleNewsletterSubmit}>
            <label htmlFor="footer-news-email">Join the monthly release notes</label>
            <div className="footer-input">
              <input
                id="footer-news-email"
                type="email"
                placeholder="you@company.com"
                value={email}
                onChange={(event) => {
                  setEmail(event.target.value);
                  if (status !== 'idle') {
                    setStatus('idle');
                    setFeedback('');
                  }
                }}
                aria-describedby="footer-news-feedback"
                required
              />
              <button type="submit" className="footer-submit">
                Subscribe
              </button>
            </div>
            <p
              id="footer-news-feedback"
              className={clsx('footer-feedback', {
                'is-error': status === 'error',
                'is-success': status === 'success'
              })}
              aria-live="polite"
            >
              {feedback || 'We send a curated update once a month—no spam.'}
            </p>
          </form>
          <div className="footer-social" aria-label="Social links">
            {socialLinks.map((social) => (
              <a key={social.label} href={social.href} target="_blank" rel="noopener noreferrer">
                {social.label}
              </a>
            ))}
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
          <a href="mailto:sudarshansinha21@gmail.com">Legal</a>
        </div>
      </div>
    </footer>
  );
}
