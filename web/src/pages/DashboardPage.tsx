import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';

import {
  createMonitor,
  fetchMonitorChecks,
  fetchMonitors,
  pauseMonitor,
  resumeMonitor,
  runMonitor
} from '../api';
import { useAuth } from '../context/AuthContext';

type Monitor = {
  id: number;
  name: string;
  url: string;
  method: string;
  interval_seconds: number;
  timeout_seconds: number;
  enabled: boolean;
  owner_id?: number | null;
  last_checked_at: string | null;
  last_status_code: number | null;
  last_latency_ms: number | null;
  last_outcome: 'up' | 'down' | null;
  consecutive_failures: number;
  next_run_at: string;
};

type MonitorCheck = {
  id: number;
  monitor_id: number;
  occurred_at: string;
  outcome: string;
  status_code: number | null;
  latency_ms: number | null;
  error_message: string | null;
};

const defaultFormState = {
  name: '',
  url: '',
  method: 'GET',
  interval_seconds: 60,
  timeout_seconds: 10
};

type Toast = {
  id: number;
  message: string;
  tone?: 'default' | 'success' | 'error';
};

function ensureUtcSuffix(value: string): string {
  if (value.endsWith('Z') || /[+-]\d{2}:\d{2}$/.test(value)) {
    return value;
  }
  return `${value}Z`;
}

function parseDate(dateString: string | null): Date | null {
  if (!dateString) return null;
  const normalized = ensureUtcSuffix(dateString);
  const parsed = new Date(normalized);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function formatRelativeTime(dateString: string | null): string {
  const parsed = parseDate(dateString);
  if (!parsed) return 'Not yet checked';
  const diffMs = Date.now() - parsed.getTime();
  if (diffMs < 0) return 'Scheduled';

  const seconds = Math.floor(diffMs / 1000);
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

function formatDateTime(dateString: string | null): string {
  const parsed = parseDate(dateString);
  if (!parsed) return '—';
  return parsed.toLocaleString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  });
}

function classNames(...tokens: Array<string | false | null | undefined>): string {
  return tokens.filter(Boolean).join(' ');
}

export default function DashboardPage() {
  const { user } = useAuth();
  const [monitors, setMonitors] = useState<Monitor[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [formState, setFormState] = useState(defaultFormState);
  const [toast, setToast] = useState<Toast | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selectedMonitorId, setSelectedMonitorId] = useState<number | null>(null);
  const [checks, setChecks] = useState<MonitorCheck[]>([]);
  const [checksLoading, setChecksLoading] = useState(false);
  const [checksError, setChecksError] = useState<string | null>(null);
  const [runPending, setRunPending] = useState(false);
  const [expandedCheckId, setExpandedCheckId] = useState<number | null>(null);

  const showToast = (message: string, tone: Toast['tone'] = 'default') => {
    const id = Date.now();
    setToast({ id, message, tone });
    setTimeout(() => {
      setToast((current) => (current?.id === id ? null : current));
    }, 4000);
  };

  const loadMonitors = useCallback(async () => {
    setLoading(true);
    try {
      const data: Monitor[] = await fetchMonitors();
      setMonitors(data);
    } catch (err) {
      console.error(err);
      setError('Unable to load monitors. Please try again.');
    } finally {
      setLoading(false);
    }
  }, []);

  const selectedMonitor = useMemo(
    () => monitors.find((monitor) => monitor.id === selectedMonitorId) ?? null,
    [monitors, selectedMonitorId]
  );

  useEffect(() => {
    void loadMonitors();
    const interval = setInterval(() => {
      void loadMonitors();
    }, 15_000);
    return () => clearInterval(interval);
  }, [loadMonitors]);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      await createMonitor(formState);
      showToast('Monitor created', 'success');
      setFormState(defaultFormState);
      await loadMonitors();
    } catch (err) {
      console.error(err);
      showToast(err instanceof Error ? err.message : 'Failed to create monitor', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  const handleMonitorClick = (monitorId: number) => {
    setSelectedMonitorId(monitorId);
    setExpandedCheckId(null);
  };

  const closeDetail = () => {
    setSelectedMonitorId(null);
    setChecks([]);
    setChecksError(null);
    setChecksLoading(false);
    setExpandedCheckId(null);
  };

  useEffect(() => {
    if (selectedMonitorId == null) return;
    const loadChecks = async () => {
      setChecksLoading(true);
      setChecksError(null);
      try {
        const data: MonitorCheck[] = await fetchMonitorChecks(selectedMonitorId);
        setChecks(data);
        setExpandedCheckId(data.length > 0 ? data[0].id : null);
      } catch (err) {
        console.error(err);
        setChecksError('Unable to load recent check results.');
      } finally {
        setChecksLoading(false);
      }
    };
    void loadChecks();
  }, [selectedMonitorId]);

  const handlePause = async (monitorId: number, enabled: boolean) => {
    try {
      if (enabled) {
        await pauseMonitor(monitorId);
        showToast('Monitor paused', 'success');
      } else {
        await resumeMonitor(monitorId);
        showToast('Monitor resumed', 'success');
      }
      await loadMonitors();
    } catch (err) {
      console.error(err);
      showToast(err instanceof Error ? err.message : 'Action failed', 'error');
    }
  };

  const triggerManualRun = async () => {
    if (!selectedMonitorId || !selectedMonitor?.enabled) {
      showToast('Monitor is paused', 'error');
      return;
    }
    setRunPending(true);
    try {
      const result = await runMonitor(selectedMonitorId);
      showToast('Check executed', 'success');
      setChecks((prev) => [result, ...prev]);
      setExpandedCheckId(result.id);
      await loadMonitors();
    } catch (err) {
      console.error(err);
      showToast(err instanceof Error ? err.message : 'Failed to run check', 'error');
    } finally {
      setRunPending(false);
    }
  };

  const stats = useMemo(() => {
    const total = monitors.length;
    const up = monitors.filter((m) => m.last_outcome === 'up').length;
    const down = monitors.filter((m) => m.last_outcome === 'down').length;
    return { total, up, down };
  }, [monitors]);

  return (
    <div className="app-shell">
      <header className="top-bar">
        <div className="brand">
          <div className="brand-icon">M</div>
          <div>
            <h1 style={{ fontSize: '24px' }}>Monitron Control Center</h1>
            <p>Monitor your critical endpoints with confidence.</p>
          </div>
        </div>
        <div className="top-actions">
          <span className="pill-button" style={{ pointerEvents: 'none', opacity: 0.75 }}>
            {user?.full_name ?? user?.email}
          </span>
        </div>
      </header>

      <section className="dashboard-grid">
        <div className="summary-card">
          <span className="summary-header">Monitoring Studio</span>
          <div className="summary-body">
            <div>
              <h2>Uptime Explorer</h2>
              <p>
                Track key services across your stack. Automate response when downtime
                strikes and keep your team informed.
              </p>
            </div>
            <div className="metrics-row">
              <div className="metric-card">
                <span className="metric-label">Total Monitors</span>
                <span className="metric-value">{stats.total}</span>
              </div>
              <div className="metric-card">
                <span className="metric-label">Healthy</span>
                <span className="metric-value">{stats.up}</span>
              </div>
              <div className="metric-card">
                <span className="metric-label">Investigate</span>
                <span className="metric-value">{stats.down}</span>
              </div>
            </div>
          </div>
        </div>

        <aside className="actions-card">
          <span className="summary-header">Quick Actions</span>
          <button className="action-button primary" onClick={() => setSelectedMonitorId(null)}>
            Add Monitor
          </button>
          <button className="action-button secondary" disabled>
            Import from JSON
          </button>
          <button className="action-button ghost" disabled>
            Download Report
          </button>
        </aside>
      </section>

      <section className="monitor-panel">
        <div className="panel-header">
          <div>
            <h2>Active Monitors</h2>
            <p>Browse, filter, and manage uptime checks with a polished interface.</p>
          </div>
          <span className="badge">{stats.total} configured</span>
        </div>

        <form className="monitor-form" onSubmit={handleSubmit}>
          <div className="form-grid">
            <div className="input-field">
              <label htmlFor="name">Monitor Name</label>
              <input
                id="name"
                placeholder="API Gateway"
                value={formState.name}
                onChange={(event) => setFormState((prev) => ({ ...prev, name: event.target.value }))}
                required
              />
            </div>
            <div className="input-field" style={{ gridColumn: 'span 2' }}>
              <label htmlFor="url">Target URL</label>
              <input
                id="url"
                placeholder="https://api.example.com/health"
                value={formState.url}
                onChange={(event) => setFormState((prev) => ({ ...prev, url: event.target.value }))}
                required
                type="url"
              />
            </div>
            <div className="input-field">
              <label htmlFor="method">Method</label>
              <select
                id="method"
                value={formState.method}
                onChange={(event) => setFormState((prev) => ({ ...prev, method: event.target.value }))}
              >
                <option value="GET">GET</option>
                <option value="HEAD">HEAD</option>
                <option value="POST">POST</option>
              </select>
            </div>
            <div className="input-field">
              <label htmlFor="interval_seconds">Interval (seconds)</label>
              <input
                id="interval_seconds"
                type="number"
                min={30}
                value={formState.interval_seconds}
                onChange={(event) =>
                  setFormState((prev) => ({
                    ...prev,
                    interval_seconds: Number(event.target.value)
                  }))
                }
              />
            </div>
            <div className="input-field">
              <label htmlFor="timeout_seconds">Timeout (seconds)</label>
              <input
                id="timeout_seconds"
                type="number"
                min={1}
                max={60}
                value={formState.timeout_seconds}
                onChange={(event) =>
                  setFormState((prev) => ({
                    ...prev,
                    timeout_seconds: Number(event.target.value)
                  }))
                }
              />
            </div>
          </div>
          <div className="form-actions">
            <button
              className="ghost-button"
              type="button"
              onClick={() => setFormState(defaultFormState)}
            >
              Reset
            </button>
            <button className="pill-button primary" type="submit" disabled={submitting}>
              {submitting ? 'Creating…' : 'Save Monitor'}
            </button>
          </div>
        </form>

        <div className="form-divider" />

        {error ? <div className="empty-state">{error}</div> : null}

        {loading ? (
          <div className="empty-state">Loading monitors...</div>
        ) : monitors.length === 0 ? (
          <div className="empty-state">
            No monitors yet. Add your first URL to start uptime tracking.
          </div>
        ) : (
          <div className="monitor-list">
            <AnimatePresence>
              {monitors.map((monitor) => (
                <motion.div
                  key={monitor.id}
                  className="monitor-card"
                  layout
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -8 }}
                  transition={{ duration: 0.18 }}
                  onClick={() => handleMonitorClick(monitor.id)}
                >
                  <div className="monitor-info">
                    <button
                      type="button"
                      className="monitor-name-button"
                      onClick={(event) => {
                        event.stopPropagation();
                        handleMonitorClick(monitor.id);
                      }}
                    >
                      <span className="name">{monitor.name}</span>
                      <span className="view-link">View details</span>
                    </button>
                    <span className="url">{monitor.url}</span>
                    <span className="status-chip-row">
                      <span
                        className={classNames(
                          'status-chip',
                          !monitor.enabled
                            ? 'paused'
                            : monitor.last_outcome === 'up'
                            ? 'up'
                            : monitor.last_outcome === 'down'
                            ? 'down'
                            : 'idle'
                        )}
                      >
                        {!monitor.enabled
                          ? 'Paused'
                          : monitor.last_outcome === 'up'
                          ? 'Operational'
                          : monitor.last_outcome === 'down'
                          ? 'Down'
                          : 'Pending'}
                      </span>
                    </span>
                  </div>
                  <div className="monitor-meta">
                    <span>Last check</span>
                    <strong>
                      {!monitor.enabled && monitor.last_checked_at == null
                        ? 'Paused'
                        : formatRelativeTime(monitor.last_checked_at)}
                    </strong>
                  </div>
                  <div className="monitor-meta">
                    <span>Latency</span>
                    <strong>
                      {monitor.last_latency_ms != null ? `${monitor.last_latency_ms} ms` : '—'}
                    </strong>
                    {monitor.last_status_code && <span>HTTP {monitor.last_status_code}</span>}
                  </div>
                  <div className="actions">
                    <button
                      className="ghost-button"
                      onClick={(event) => {
                        event.stopPropagation();
                        void handlePause(monitor.id, monitor.enabled);
                      }}
                    >
                      {monitor.enabled ? 'Pause' : 'Resume'}
                    </button>
                  </div>
                </motion.div>
              ))}
            </AnimatePresence>
          </div>
        )}
      </section>

      <AnimatePresence>
        {toast ? (
          <motion.div
            className="toast"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 20 }}
            style={{
              background:
                toast.tone === 'success'
                  ? 'linear-gradient(135deg, #1f6b44, #2d9a65)'
                  : toast.tone === 'error'
                  ? 'linear-gradient(135deg, #a12f2f, #d25454)'
                  : undefined
            }}
          >
            {toast.message}
          </motion.div>
        ) : null}
      </AnimatePresence>

      <AnimatePresence>
        {selectedMonitor ? (
          <motion.div
            className="detail-modal-backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={closeDetail}
          >
            <motion.div
              className="detail-modal"
              initial={{ opacity: 0, y: 24 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 24 }}
              onClick={(event) => event.stopPropagation()}
            >
              <header className="detail-header">
                <div>
                  <h3>{selectedMonitor.name}</h3>
                  <p>{selectedMonitor.url}</p>
                </div>
                <div className="detail-actions">
                  <button
                    className="ghost-button"
                    onClick={triggerManualRun}
                    disabled={runPending || !selectedMonitor.enabled}
                  >
                    {runPending ? 'Running...' : 'Run check now'}
                  </button>
                  <button className="ghost-button" onClick={closeDetail}>
                    Close
                  </button>
                </div>
              </header>
              <div className="detail-grid">
                <div className="detail-metric">
                  <span className="metric-label">Status</span>
                  <span
                    className={classNames(
                      'status-chip',
                      !selectedMonitor.enabled
                        ? 'paused'
                        : selectedMonitor.last_outcome === 'up'
                        ? 'up'
                        : selectedMonitor.last_outcome === 'down'
                        ? 'down'
                        : 'idle'
                    )}
                  >
                    {!selectedMonitor.enabled
                      ? 'Paused'
                      : selectedMonitor.last_outcome === 'up'
                      ? 'Operational'
                      : selectedMonitor.last_outcome === 'down'
                      ? 'Down'
                      : 'Pending'}
                  </span>
                </div>
                <div className="detail-metric">
                  <span className="metric-label">Last check</span>
                  <strong>
                    {!selectedMonitor.enabled && selectedMonitor.last_checked_at == null
                      ? 'Paused'
                      : formatDateTime(selectedMonitor.last_checked_at)}
                  </strong>
                </div>
                <div className="detail-metric">
                  <span className="metric-label">Latency</span>
                  <strong>
                    {selectedMonitor.last_latency_ms != null
                      ? `${selectedMonitor.last_latency_ms} ms`
                      : '—'}
                  </strong>
                </div>
                <div className="detail-metric">
                  <span className="metric-label">Next run</span>
                  <strong>
                    {!selectedMonitor.enabled ? 'Paused' : formatDateTime(selectedMonitor.next_run_at)}
                  </strong>
                </div>
              </div>

              <div className="detail-section">
                <h4>Recent Checks</h4>
                {checksLoading ? (
                  <div className="empty-state">Loading recent checks...</div>
                ) : checksError ? (
                  <div className="empty-state">{checksError}</div>
                ) : checks.length === 0 ? (
                  <div className="empty-state">No check history yet. Please wait for the next run.</div>
                ) : (
                  <div className="check-log">
                    {checks.map((entry) => (
                      <div
                        key={entry.id}
                        className={classNames('check-log-row', expandedCheckId === entry.id && 'active')}
                        onClick={() =>
                          setExpandedCheckId((current) => (current === entry.id ? null : entry.id))
                        }
                      >
                        <div className="check-row-heading">
                          <span className="check-outcome">{entry.outcome.toUpperCase()}</span>
                          <span className="check-time">{formatDateTime(entry.occurred_at)}</span>
                        </div>
                        <div className="check-meta">
                          <span>
                            {entry.latency_ms != null ? `${entry.latency_ms} ms` : '—'} ·{' '}
                            {entry.status_code != null ? `HTTP ${entry.status_code}` : 'No response'}
                          </span>
                          {entry.error_message ? (
                            <span className="check-error">{entry.error_message}</span>
                          ) : null}
                        </div>
                        {expandedCheckId === entry.id ? (
                          <div className="check-details">
                            <div>
                              <span className="detail-label">Recorded:</span> {formatDateTime(entry.occurred_at)}
                            </div>
                            <div>
                              <span className="detail-label">Latency:</span>{' '}
                              {entry.latency_ms != null ? `${entry.latency_ms} ms` : '—'}
                            </div>
                            <div>
                              <span className="detail-label">Status:</span>{' '}
                              {entry.status_code != null ? `HTTP ${entry.status_code}` : 'No response'}
                            </div>
                            {entry.error_message ? (
                              <div>
                                <span className="detail-label">Error:</span> {entry.error_message}
                              </div>
                            ) : null}
                          </div>
                        ) : null}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </motion.div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}
