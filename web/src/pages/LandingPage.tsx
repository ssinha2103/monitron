import { Link } from 'react-router-dom';

const analyticsMock = [
  { label: 'Monitors online', value: '328', trend: '+12 this week' },
  { label: 'Incidents resolved', value: '96%', trend: 'Avg MTTR 11m' },
  { label: 'Cron success rate', value: '99.3%', trend: '1.2k runs / day' },
  { label: 'Alert destinations', value: '45', trend: 'Slack · Email · PagerDuty' }
];

export default function LandingPage() {
  return (
    <div className="landing-shell">
      <aside className="landing-sidebar">
        <div className="brand-mark">Monitron</div>
        <nav>
          <a className="nav-pill active">Overview</a>
          <a className="nav-pill">Analytics</a>
          <a className="nav-pill">Integrations</a>
          <a className="nav-pill">Pricing</a>
          <a className="nav-pill">Docs</a>
        </nav>
      </aside>
      <main className="landing-main">
        <header className="landing-header">
          <div>
            <h1>Reliable monitoring for ambitious teams.</h1>
            <p>
              Keep APIs and cron jobs healthy with multi-region checks, intelligent alerting, and collaborative
              tooling that keeps everyone in sync.
            </p>
          </div>
          <div className="landing-cta">
            <Link className="pill-button primary" to="/login">
              Get started →
            </Link>
            <Link className="pill-button" to="/register">
              Create account
            </Link>
          </div>
        </header>

        <section className="landing-grid">
          <div className="hero-card">
            <div className="hero-card-header">
              <span className="hero-dot" />
              <strong>Global status</strong>
            </div>
            <p className="hero-card-copy">
              Monitor uptime from six continents, drill into latency per region, and spot anomalies before they become
              customer-facing outages.
            </p>
            <div className="hero-visual">
              <div className="hero-ring" />
              <div className="hero-ring ring-2" />
              <div className="hero-pulse" />
            </div>
            <div className="hero-card-footer">
              <span>Latency baseline: 184ms</span>
              <span>Probe regions: 12</span>
            </div>
          </div>

          <div className="snapshot-card">
            <h3>Today&apos;s snapshot</h3>
            <div className="snapshot-grid">
              {analyticsMock.map((item) => (
                <div key={item.label} className="snapshot-tile">
                  <span className="snapshot-label">{item.label}</span>
                  <strong className="snapshot-value">{item.value}</strong>
                  <span className="snapshot-trend">{item.trend}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="chart-card">
            <h3>Response time trend</h3>
            <div className="chart-canvas">
              <div className="chart-line" />
              <div className="chart-peak" style={{ left: '25%' }} />
              <div className="chart-peak peak-green" style={{ left: '60%' }} />
              <div className="chart-peak" style={{ left: '82%' }} />
            </div>
            <div className="chart-legend">
              <span><span className="legend-dot" /> API latency</span>
              <span><span className="legend-dot legend-secondary" /> Cron runtime</span>
            </div>
          </div>

          <div className="infocard">
            <h3>Integrate in minutes</h3>
            <p>
              Send a heartbeat from any language, configure alerts with a visual builder, and connect Slack, Teams,
              PagerDuty, Opsgenie, or custom webhooks.
            </p>
            <div className="code-preview">
              <span>$ curl https://api.monitron.dev/heartbeat/xyz</span>
              <span>&gt; Monitor updated • 202ms</span>
            </div>
          </div>
        </section>

        <footer className="landing-footer">
          <span>© {new Date().getFullYear()} Monitron Labs</span>
          <div className="footer-links">
            <Link to="/login">Login</Link>
            <Link to="/register">Sign up</Link>
            <a href="#docs">Docs</a>
          </div>
        </footer>
      </main>
    </div>
  );
}
