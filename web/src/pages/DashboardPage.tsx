import { ChangeEvent, FormEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';

import {
  createMonitor,
  fetchMonitorChecks,
  fetchMonitors,
  pauseMonitor,
  resumeMonitor,
  runMonitor,
  updateMonitor
} from '../api';
import { useAuth } from '../context/AuthContext';
import { Logo } from '../components/Logo';

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

const defaultEditState = {
  name: '',
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
  const [actionLoading, setActionLoading] = useState<'runFailing' | 'resumePaused' | null>(null);
  const [expandedCheckId, setExpandedCheckId] = useState<number | null>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [editSubmitting, setEditSubmitting] = useState(false);
  const [importing, setImporting] = useState(false);
  const [editFormState, setEditFormState] = useState(defaultEditState);

  const showToast = (message: string, tone: Toast['tone'] = 'default') => {
    const id = Date.now();
    setToast({ id, message, tone });
    setTimeout(() => {
      setToast((current) => (current?.id === id ? null : current));
    }, 4000);
  };

  const loadMonitors = useCallback(
    async ({ background = false }: { background?: boolean } = {}) => {
      if (!user) {
        setMonitors([]);
        setError(null);
        if (!background) {
          setLoading(false);
        }
        return;
      }

      if (!background) {
        setLoading(true);
        setError(null);
      }

      try {
        const data: Monitor[] = await fetchMonitors();
        const scoped = data.filter((monitor) => monitor.owner_id === user.id);
        setMonitors(scoped);
        setError(null);
      } catch (err) {
        console.error(err);
        if (!background) {
          setError('Unable to load monitors. Please try again.');
        }
      } finally {
        if (!background) {
          setLoading(false);
        }
      }
    },
    [user]
  );

  const selectedMonitor = useMemo(
    () => monitors.find((monitor) => monitor.id === selectedMonitorId) ?? null,
    [monitors, selectedMonitorId]
  );

  const failingMonitors = useMemo(
    () => monitors.filter((monitor) => monitor.enabled && monitor.last_outcome === 'down'),
    [monitors]
  );

  const pausedMonitors = useMemo(
    () => monitors.filter((monitor) => !monitor.enabled),
    [monitors]
  );

  useEffect(() => {
    if (!user) {
      setMonitors([]);
      return;
    }

    void loadMonitors();
    const interval = setInterval(() => {
      void loadMonitors({ background: true });
    }, 15_000);
    return () => clearInterval(interval);
  }, [user, loadMonitors]);

  useEffect(() => {
    if (!selectedMonitor) {
      setIsEditing(false);
      setEditSubmitting(false);
      setEditFormState(defaultEditState);
      return;
    }

    setEditFormState({
      name: selectedMonitor.name,
      method: selectedMonitor.method,
      interval_seconds: selectedMonitor.interval_seconds,
      timeout_seconds: selectedMonitor.timeout_seconds
    });
    setIsEditing(false);
    setEditSubmitting(false);
  }, [selectedMonitor]);

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

  const handleEditSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!selectedMonitor) return;
    setEditSubmitting(true);
    try {
      const payload = {
        name: editFormState.name.trim(),
        method: editFormState.method,
        interval_seconds: Math.max(30, editFormState.interval_seconds),
        timeout_seconds: Math.min(Math.max(1, editFormState.timeout_seconds), 60)
      };
      const response = (await updateMonitor(selectedMonitor.id, payload)) as Monitor | undefined;
      const updated: Monitor = response ?? { ...selectedMonitor, ...payload };
      setMonitors((prev) =>
        prev.map((monitor) => (monitor.id === updated.id ? { ...monitor, ...updated } : monitor))
      );
      setIsEditing(false);
      showToast('Monitor updated', 'success');
      setEditFormState({
        name: updated.name,
        method: updated.method,
        interval_seconds: updated.interval_seconds,
        timeout_seconds: updated.timeout_seconds
      });
      await loadMonitors({ background: true });
    } catch (err) {
      console.error(err);
      showToast(err instanceof Error ? err.message : 'Failed to update monitor', 'error');
    } finally {
      setEditSubmitting(false);
    }
  };

  const handleMonitorClick = (monitorId: number) => {
    setSelectedMonitorId(monitorId);
    setExpandedCheckId(null);
  };

  const toggleEditMode = () => {
    if (!selectedMonitor) return;
    setEditFormState({
      name: selectedMonitor.name,
      method: selectedMonitor.method,
      interval_seconds: selectedMonitor.interval_seconds,
      timeout_seconds: selectedMonitor.timeout_seconds
    });
    setIsEditing((prev) => !prev);
    setEditSubmitting(false);
  };

  const closeDetail = () => {
    setSelectedMonitorId(null);
    setChecks([]);
    setChecksError(null);
    setChecksLoading(false);
    setExpandedCheckId(null);
  };

  const focusCreateForm = () => {
    setSelectedMonitorId(null);
    setFormState(defaultFormState);
    setTimeout(() => {
      formRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      formRef.current?.querySelector<HTMLInputElement>('input#name')?.focus();
    }, 50);
  };

  const handleRunFailingMonitors = async () => {
    if (failingMonitors.length === 0) return;
    setActionLoading('runFailing');
    try {
      await Promise.allSettled(failingMonitors.map((monitor) => runMonitor(monitor.id)));
      showToast(`Triggered health checks for ${failingMonitors.length} monitor(s)`, 'success');
      await loadMonitors();
    } catch (err) {
      console.error(err);
      showToast('Failed to trigger failing monitors', 'error');
    } finally {
      setActionLoading(null);
    }
  };

  const handleResumePausedMonitors = async () => {
    if (pausedMonitors.length === 0) return;
    setActionLoading('resumePaused');
    try {
      await Promise.allSettled(pausedMonitors.map((monitor) => resumeMonitor(monitor.id)));
      showToast(`Resumed ${pausedMonitors.length} monitor(s)`, 'success');
      await loadMonitors();
    } catch (err) {
      console.error(err);
      showToast('Unable to resume paused monitors', 'error');
    } finally {
      setActionLoading(null);
    }
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

  const exportableMonitors = useMemo(
    () =>
      monitors.map((monitor) => ({
        name: monitor.name,
        url: monitor.url,
        method: monitor.method,
        interval_seconds: monitor.interval_seconds,
        timeout_seconds: monitor.timeout_seconds,
        enabled: monitor.enabled
      })),
    [monitors]
  );

  const downloadFile = (content: string, filename: string, mimeType: string) => {
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const escapeCsv = (value: string | number | boolean) => {
    const raw =
      typeof value === 'boolean' ? String(value) : typeof value === 'number' ? String(value) : value ?? '';
    const needsQuoting = /[",\n]/.test(raw);
    return needsQuoting ? `"${raw.replace(/"/g, '""')}"` : raw;
  };

  const handleExport = (format: 'json' | 'csv') => {
    if (exportableMonitors.length === 0) {
      showToast('No monitors to export', 'error');
      return;
    }

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    if (format === 'json') {
      downloadFile(
        JSON.stringify(exportableMonitors, null, 2),
        `monitors-${timestamp}.json`,
        'application/json'
      );
      showToast('Exported monitors as JSON', 'success');
      return;
    }

    const header = 'name,url,method,interval_seconds,timeout_seconds,enabled';
    const rows = exportableMonitors.map((monitor) =>
      [
        escapeCsv(monitor.name),
        escapeCsv(monitor.url),
        escapeCsv(monitor.method),
        escapeCsv(monitor.interval_seconds),
        escapeCsv(monitor.timeout_seconds),
        escapeCsv(monitor.enabled)
      ].join(',')
    );
    downloadFile([header, ...rows].join('\n'), `monitors-${timestamp}.csv`, 'text/csv');
    showToast('Exported monitors as CSV', 'success');
  };

  const parseCsvLine = (line: string): string[] => {
    const cells: string[] = [];
    let current = '';
    let inQuotes = false;
    for (let i = 0; i < line.length; i += 1) {
      const char = line[i];
      if (char === '"') {
        if (inQuotes && line[i + 1] === '"') {
          current += '"';
          i += 1;
        } else {
          inQuotes = !inQuotes;
        }
      } else if (char === ',' && !inQuotes) {
        cells.push(current.trim());
        current = '';
      } else {
        current += char;
      }
    }
    cells.push(current.trim());
    return cells;
  };

  const parseCsvImport = (text: string) => {
    const lines = text
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean);

    if (lines.length === 0) return [];

    const headers = parseCsvLine(lines[0]).map((header) => header.toLowerCase());
    const idxName = headers.indexOf('name');
    const idxUrl = headers.indexOf('url');

    if (idxName === -1 || idxUrl === -1) {
      throw new Error('CSV must include "name" and "url" columns.');
    }

    const idxMethod = headers.indexOf('method');
    const idxInterval = headers.indexOf('interval_seconds');
    const idxTimeout = headers.indexOf('timeout_seconds');
    const idxEnabled = headers.indexOf('enabled');

    return lines.slice(1).map((line, rowIndex) => {
      const cells = parseCsvLine(line);
      const name = (cells[idxName] ?? '').trim();
      const url = (cells[idxUrl] ?? '').trim();

      if (!name || !url) {
        throw new Error(`Row ${rowIndex + 2} is missing required values.`);
      }

      const method = (idxMethod >= 0 ? cells[idxMethod] : 'GET').trim().toUpperCase() || 'GET';
      const interval = Number.parseInt(idxInterval >= 0 ? cells[idxInterval] : '', 10);
      const timeout = Number.parseInt(idxTimeout >= 0 ? cells[idxTimeout] : '', 10);
      const enabledRaw = idxEnabled >= 0 ? (cells[idxEnabled] ?? '').trim().toLowerCase() : '';

      return {
        name,
        url,
        method,
        interval_seconds: Number.isFinite(interval) && interval > 0 ? interval : 60,
        timeout_seconds: Number.isFinite(timeout) && timeout > 0 ? timeout : 10,
        enabled:
          enabledRaw === ''
            ? true
            : enabledRaw === 'true' || enabledRaw === '1' || enabledRaw === 'yes' || enabledRaw === 'y'
      };
    });
  };

  const parseJsonImport = (text: string) => {
    const payload = JSON.parse(text);
    if (!Array.isArray(payload)) {
      throw new Error('JSON import must be an array of monitors.');
    }

    return payload.map((entry, index) => {
      if (!entry || typeof entry !== 'object') {
        throw new Error(`Invalid monitor entry at index ${index}.`);
      }

      const name = typeof entry.name === 'string' ? entry.name.trim() : '';
      const url = typeof entry.url === 'string' ? entry.url.trim() : '';
      if (!name || !url) {
        throw new Error(`Monitor at index ${index} is missing "name" or "url".`);
      }

      const method =
        typeof entry.method === 'string' && entry.method.trim()
          ? entry.method.trim().toUpperCase()
          : 'GET';
      const interval = Number(entry.interval_seconds);
      const timeout = Number(entry.timeout_seconds);
      const enabledValue = entry.enabled;

      return {
        name,
        url,
        method,
        interval_seconds: Number.isFinite(interval) && interval > 0 ? interval : 60,
        timeout_seconds: Number.isFinite(timeout) && timeout > 0 ? timeout : 10,
        enabled:
          typeof enabledValue === 'boolean'
            ? enabledValue
            : enabledValue == null
            ? true
            : ['true', '1', 'yes', 'y'].includes(String(enabledValue).toLowerCase())
      };
    });
  };

  const handleImportClick = () => {
    fileInputRef.current?.click();
  };

  const handleImportFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setImporting(true);
    try {
      const text = await file.text();
      const extension = file.name.split('.').pop()?.toLowerCase();
      let records: Array<{
        name: string;
        url: string;
        method: string;
        interval_seconds: number;
        timeout_seconds: number;
        enabled: boolean;
      }> = [];

      if (extension === 'csv') {
        records = parseCsvImport(text);
      } else if (extension === 'json') {
        records = parseJsonImport(text);
      } else if (text.trim().startsWith('[')) {
        records = parseJsonImport(text);
      } else {
        throw new Error('Unsupported file format. Please use .json or .csv.');
      }

      if (records.length === 0) {
        showToast('No monitors found in the import file.', 'error');
        return;
      }

      let created = 0;
      const failures: string[] = [];

      for (const monitor of records) {
        try {
          await createMonitor({
            name: monitor.name,
            url: monitor.url,
            method: monitor.method,
            interval_seconds: monitor.interval_seconds,
            timeout_seconds: monitor.timeout_seconds,
            enabled: monitor.enabled
          });
          created += 1;
        } catch (error) {
          console.error(error);
          failures.push(monitor.name || monitor.url);
        }
      }

      if (created > 0) {
        showToast(`Imported ${created} monitor${created === 1 ? '' : 's'}`, 'success');
        await loadMonitors({ background: true });
      }

      if (failures.length > 0) {
        showToast(
          `Failed to import ${failures.length} monitor${failures.length === 1 ? '' : 's'}: ${failures.join(
            ', '
          )}`,
          'error'
        );
      }
    } catch (err) {
      console.error(err);
      showToast(err instanceof Error ? err.message : 'Import failed', 'error');
    } finally {
      setImporting(false);
      if (event.target) {
        event.target.value = '';
      }
    }
  };

  const stats = useMemo(() => {
    const total = monitors.length;
    const up = monitors.filter((m) => m.last_outcome === 'up').length;
    const down = monitors.filter((m) => m.last_outcome === 'down').length;
    const paused = monitors.filter((m) => !m.enabled).length;
    return { total, up, down, paused };
  }, [monitors]);

  return (
    <div className="app-shell">
      <header className="top-bar">
        <div className="brand">
          <Logo orientation="horizontal" size={46} />
          <p className="brand-tagline">Monitor your critical endpoints with confidence.</p>
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
                <span className="metric-label">Failing</span>
                <span className="metric-value">{stats.down}</span>
              </div>
              <div className="metric-card">
                <span className="metric-label">Paused</span>
                <span className="metric-value">{stats.paused}</span>
              </div>
            </div>
          </div>
        </div>

        <aside className="actions-card">
          <span className="summary-header">Quick Actions</span>
          <button className="action-button primary" onClick={focusCreateForm}>
            Add Monitor
          </button>
          <button
            className="action-button secondary"
            onClick={handleRunFailingMonitors}
            disabled={failingMonitors.length === 0 || actionLoading === 'runFailing'}
          >
            {actionLoading === 'runFailing' ? 'Running…' : `Run failing (${failingMonitors.length})`}
          </button>
          <button
            className="action-button ghost"
            onClick={handleResumePausedMonitors}
            disabled={pausedMonitors.length === 0 || actionLoading === 'resumePaused'}
          >
            {actionLoading === 'resumePaused' ? 'Resuming…' : `Resume paused (${pausedMonitors.length})`}
          </button>
        </aside>
      </section>

      <section className="monitor-panel">
        <div className="panel-header">
          <div>
            <h2>Active Monitors</h2>
            <p>Browse, filter, and manage uptime checks with a polished interface.</p>
          </div>
          <div
            className="panel-header-actions"
            style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap' }}
          >
            <span className="badge">{stats.total} configured</span>
            <button
              type="button"
              className="ghost-button"
              onClick={() => handleExport('json')}
              disabled={exportableMonitors.length === 0}
            >
              Export JSON
            </button>
            <button
              type="button"
              className="ghost-button"
              onClick={() => handleExport('csv')}
              disabled={exportableMonitors.length === 0}
            >
              Export CSV
            </button>
            <button
              type="button"
              className="ghost-button primary"
              onClick={handleImportClick}
              disabled={importing}
            >
              {importing ? 'Importing…' : 'Import'}
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept=".json,.csv,application/json,text/csv"
              style={{ display: 'none' }}
              onChange={handleImportFile}
            />
          </div>
        </div>

        <form className="monitor-form" onSubmit={handleSubmit} ref={formRef}>
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
                  <button className="ghost-button" onClick={toggleEditMode}>
                    {isEditing ? 'Cancel edit' : 'Edit monitor'}
                  </button>
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
              {isEditing ? (
                <form className="monitor-form" onSubmit={handleEditSubmit}>
                  <div className="form-grid">
                    <div className="input-field">
                      <label htmlFor="edit-name">Monitor Name</label>
                      <input
                        id="edit-name"
                        value={editFormState.name}
                        onChange={(event) =>
                          setEditFormState((prev) => ({ ...prev, name: event.target.value }))
                        }
                        required
                      />
                    </div>
                    <div className="input-field" style={{ gridColumn: 'span 2' }}>
                      <label htmlFor="edit-url">Target URL</label>
                      <input id="edit-url" value={selectedMonitor.url} disabled />
                    </div>
                    <div className="input-field">
                      <label htmlFor="edit-method">Method</label>
                      <select
                        id="edit-method"
                        value={editFormState.method}
                        onChange={(event) =>
                          setEditFormState((prev) => ({ ...prev, method: event.target.value }))
                        }
                      >
                        <option value="GET">GET</option>
                        <option value="HEAD">HEAD</option>
                        <option value="POST">POST</option>
                      </select>
                    </div>
                    <div className="input-field">
                      <label htmlFor="edit-interval">Interval (seconds)</label>
                      <input
                        id="edit-interval"
                        type="number"
                        min={30}
                        value={editFormState.interval_seconds}
                        onChange={(event) =>
                          setEditFormState((prev) => ({
                            ...prev,
                            interval_seconds: Number.parseInt(event.target.value, 10) || prev.interval_seconds
                          }))
                        }
                      />
                    </div>
                    <div className="input-field">
                      <label htmlFor="edit-timeout">Timeout (seconds)</label>
                      <input
                        id="edit-timeout"
                        type="number"
                        min={1}
                        max={60}
                        value={editFormState.timeout_seconds}
                        onChange={(event) =>
                          setEditFormState((prev) => ({
                            ...prev,
                            timeout_seconds: Number.parseInt(event.target.value, 10) || prev.timeout_seconds
                          }))
                        }
                      />
                    </div>
                  </div>
                  <div className="form-actions">
                    <button className="ghost-button" type="button" onClick={toggleEditMode}>
                      Cancel
                    </button>
                    <button className="pill-button primary" type="submit" disabled={editSubmitting}>
                      {editSubmitting ? 'Saving…' : 'Save changes'}
                    </button>
                  </div>
                </form>
              ) : (
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
              )}

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
