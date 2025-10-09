import { FormEvent, useEffect, useMemo, useState } from 'react';

import {
  AdminInvitePayload,
  AdminOverview,
  ApiUser,
  createUser,
  fetchAdminOverview,
  fetchUsers,
  updateUser
} from '../api';
import { useAuth } from '../context/AuthContext';

export default function AdminPage() {
  const { user } = useAuth();
  const [users, setUsers] = useState<ApiUser[]>([]);
  const [overview, setOverview] = useState<AdminOverview | null>(null);
  const [overviewError, setOverviewError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState<'all' | 'admin' | 'user'>('all');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'inactive'>('all');
  const [toast, setToast] = useState<string | null>(null);
  const [showInvite, setShowInvite] = useState(false);
  const [inviteForm, setInviteForm] = useState({ email: '', full_name: '', role: 'user', password: '' });
  const [inviteSubmitting, setInviteSubmitting] = useState(false);
  const [inviteError, setInviteError] = useState<string | null>(null);

  const refreshUsers = async () => {
    const data = await fetchUsers();
    setUsers(data);
  };

  const refreshOverview = async () => {
    try {
      const data = await fetchAdminOverview();
      setOverview(data);
      setOverviewError(null);
    } catch (err) {
      setOverview(null);
      setOverviewError(err instanceof Error ? err.message : 'Unable to load overview');
    }
  };

  const initialize = async () => {
    setLoading(true);
    setError(null);
    try {
      const usersResp = await fetchUsers();
      setUsers(usersResp);
      await refreshOverview();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load admin data');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void initialize();
  }, []);

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), 4000);
    return () => clearTimeout(timer);
  }, [toast]);

  const handleRoleToggle = async (target: ApiUser) => {
    try {
      const newRole = target.role === 'admin' ? 'user' : 'admin';
      await updateUser(target.id, { role: newRole });
      await Promise.all([refreshUsers(), refreshOverview()]);
      setToast(`Updated ${target.email} to ${newRole}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to update role');
    }
  };

  const handleStatusToggle = async (target: ApiUser) => {
    try {
      await updateUser(target.id, { is_active: !target.is_active });
      await Promise.all([refreshUsers(), refreshOverview()]);
      setToast(`${target.email} is now ${target.is_active ? 'deactivated' : 'active'}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to update status');
    }
  };

  const filteredUsers = useMemo(() => {
    const term = search.trim().toLowerCase();
    return users.filter((item) => {
      const matchesSearch =
        term.length === 0 ||
        item.email.toLowerCase().includes(term) ||
        (item.full_name ?? '').toLowerCase().includes(term);
      const matchesRole = roleFilter === 'all' || item.role === roleFilter;
      const matchesStatus =
        statusFilter === 'all' ||
        (statusFilter === 'active' ? item.is_active : !item.is_active);
      return matchesSearch && matchesRole && matchesStatus;
    });
  }, [users, search, roleFilter, statusFilter]);

  const resetInviteState = () => {
    setInviteForm({ email: '', full_name: '', role: 'user', password: '' });
    setInviteError(null);
  };

  const handleInviteSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setInviteSubmitting(true);
    setInviteError(null);
    try {
      const payload: AdminInvitePayload = {
        email: inviteForm.email.trim(),
        role: inviteForm.role as 'user' | 'admin'
      };
      if (inviteForm.full_name.trim()) {
        payload.full_name = inviteForm.full_name.trim();
      }
      if (inviteForm.password.trim()) {
        payload.password = inviteForm.password.trim();
      }
      const response = await createUser(payload);
      await Promise.all([refreshUsers(), refreshOverview()]);
      setToast(
        response.temporary_password
          ? `Invited ${payload.email} · Temporary password: ${response.temporary_password}`
          : `Invited ${payload.email}`
      );
      setShowInvite(false);
      resetInviteState();
    } catch (err) {
      setInviteError(err instanceof Error ? err.message : 'Unable to create user');
    } finally {
      setInviteSubmitting(false);
    }
  };

  if (user?.role !== 'admin') {
    return <div className="empty-state">Admin access required.</div>;
  }

  return (
    <div className="admin-page">
      <header className="admin-header">
        <div>
          <h2>Team Directory</h2>
          <p>Manage roles and activation state for workspace members.</p>
        </div>
        <div className="admin-toolbar">
          <div className="admin-search">
            <input
              type="search"
              placeholder="Search by name or email"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
          </div>
          <div className="admin-filters">
            <select value={roleFilter} onChange={(event) => setRoleFilter(event.target.value as typeof roleFilter)}>
              <option value="all">All roles</option>
              <option value="admin">Admins</option>
              <option value="user">Users</option>
            </select>
            <select
              value={statusFilter}
              onChange={(event) => setStatusFilter(event.target.value as typeof statusFilter)}
            >
              <option value="all">All statuses</option>
              <option value="active">Active</option>
              <option value="inactive">Suspended</option>
            </select>
          </div>
          <button className="pill-button primary" onClick={() => setShowInvite(true)}>
            Invite teammate
          </button>
        </div>
      </header>

      {overview ? (
        <section className="admin-overview-grid">
          <div className="admin-metric-card">
            <span className="admin-metric-label">Total members</span>
            <strong>{overview.users.total}</strong>
            <small>{overview.users.active} active · {overview.users.admins} admins</small>
          </div>
          <div className="admin-metric-card">
            <span className="admin-metric-label">New this week</span>
            <strong>{overview.users.new_last_7_days}</strong>
            <small>Last sync {new Date(overview.generated_at).toLocaleTimeString()}</small>
          </div>
          <div className="admin-metric-card">
            <span className="admin-metric-label">Monitors</span>
            <strong>{overview.monitors.total}</strong>
            <small>
              {overview.monitors.active} active · {overview.monitors.paused} paused
            </small>
          </div>
          <div className="admin-metric-card">
            <span className="admin-metric-label">Health</span>
            <strong>{overview.monitors.failing}</strong>
            <small>
              Failing monitors · avg latency{' '}
              {overview.monitors.avg_latency_ms != null ? `${overview.monitors.avg_latency_ms}ms` : '—'}
            </small>
          </div>
          <div className="admin-metric-card">
            <span className="admin-metric-label">Checks (24h)</span>
            <strong>{overview.activity.checks_last_24h}</strong>
            <small>{overview.activity.incidents_last_24h} incidents logged</small>
          </div>
        </section>
      ) : overviewError ? (
        <div className="admin-alert">{overviewError}</div>
      ) : null}

      {loading ? (
        <div className="empty-state">Loading users…</div>
      ) : error ? (
        <div className="empty-state">{error}</div>
      ) : (
        <div className="admin-content-grid">
          <section className="admin-table-section">
            <div className="admin-table">
              <div className="admin-row admin-row-header">
                <span>Email</span>
                <span>Name</span>
                <span>Role</span>
                <span>Status</span>
                <span>Created</span>
                <span>Actions</span>
              </div>
              {filteredUsers.length === 0 ? (
                <div className="empty-state">No users match the current filters.</div>
              ) : (
                filteredUsers.map((item) => (
                  <div key={item.id} className="admin-row">
                    <span>{item.email}</span>
                    <span>{item.full_name ?? '—'}</span>
                    <span>
                      <span className={`admin-chip ${item.role === 'admin' ? 'chip-admin' : 'chip-user'}`}>
                        {item.role}
                      </span>
                    </span>
                    <span>
                      <span className={`admin-chip ${item.is_active ? 'chip-success' : 'chip-danger'}`}>
                        {item.is_active ? 'Active' : 'Suspended'}
                      </span>
                    </span>
                    <span>{new Date(item.created_at).toLocaleDateString()}</span>
                    <span className="admin-actions">
                      <button
                        className="ghost-button"
                        disabled={item.id === user.id}
                        onClick={() => handleRoleToggle(item)}
                      >
                        {item.role === 'admin' ? 'Make user' : 'Promote to admin'}
                      </button>
                      <button
                        className="ghost-button"
                        disabled={item.id === user.id}
                        onClick={() => handleStatusToggle(item)}
                      >
                        {item.is_active ? 'Deactivate' : 'Activate'}
                      </button>
                    </span>
                  </div>
                ))
              )}
            </div>
          </section>
          <aside className="admin-sidepanels">
            <div className="admin-panel">
              <div className="admin-panel-heading">
                <h3>Top failing monitors</h3>
                <p>Sorted by consecutive failures.</p>
              </div>
              {overview && overview.top_failing_monitors.length > 0 ? (
                <ul className="admin-panel-list">
                  {overview.top_failing_monitors.map((monitor) => (
                    <li key={monitor.id}>
                      <div className="admin-list-primary">
                        <span>{monitor.name}</span>
                        <span className="admin-chip chip-danger">{monitor.consecutive_failures} fails</span>
                      </div>
                      <div className="admin-list-secondary">
                        <span>{monitor.owner_email ?? 'Unassigned'}</span>
                        <span>{monitor.last_outcome ?? 'unknown'}</span>
                      </div>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="admin-muted">All monitors are healthy.</p>
              )}
            </div>
            <div className="admin-panel">
              <div className="admin-panel-heading">
                <h3>Recent signups</h3>
                <p>Five most recent members.</p>
              </div>
              {overview && overview.recent_users.length > 0 ? (
                <ul className="admin-panel-list">
                  {overview.recent_users.map((member) => (
                    <li key={member.id}>
                      <div className="admin-list-primary">
                        <span>{member.full_name ?? member.email}</span>
                        <span className="admin-chip chip-neutral">
                          {new Date(member.created_at).toLocaleDateString()}
                        </span>
                      </div>
                      <div className="admin-list-secondary">
                        <span>{member.email}</span>
                        <span>{member.role}</span>
                      </div>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="admin-muted">No user activity yet.</p>
              )}
            </div>
          </aside>
        </div>
      )}

      {toast ? <div className="toast">{toast}</div> : null}

      {showInvite ? (
        <div className="admin-modal-backdrop" role="dialog" aria-modal="true">
          <div className="admin-modal">
            <header>
              <h3>Invite teammate</h3>
              <p>Create a new workspace member and optionally set their first password.</p>
            </header>
            <form className="admin-modal-form" onSubmit={handleInviteSubmit}>
              <div className="input-field">
                <label htmlFor="invite-email">Email</label>
                <input
                  id="invite-email"
                  type="email"
                  required
                  value={inviteForm.email}
                  onChange={(event) => setInviteForm((prev) => ({ ...prev, email: event.target.value }))}
                />
              </div>
              <div className="input-field">
                <label htmlFor="invite-name">Full name</label>
                <input
                  id="invite-name"
                  value={inviteForm.full_name}
                  onChange={(event) => setInviteForm((prev) => ({ ...prev, full_name: event.target.value }))}
                />
              </div>
              <div className="input-field">
                <label htmlFor="invite-role">Role</label>
                <select
                  id="invite-role"
                  value={inviteForm.role}
                  onChange={(event) => setInviteForm((prev) => ({ ...prev, role: event.target.value }))}
                >
                  <option value="user">User</option>
                  <option value="admin">Admin</option>
                </select>
              </div>
              <div className="input-field">
                <label htmlFor="invite-password">Temporary password (optional)</label>
                <input
                  id="invite-password"
                  type="text"
                  placeholder="Leave blank to auto-generate"
                  value={inviteForm.password}
                  onChange={(event) => setInviteForm((prev) => ({ ...prev, password: event.target.value }))}
                />
              </div>
              {inviteError ? <div className="admin-error">{inviteError}</div> : null}
              <div className="admin-modal-actions">
                <button
                  type="button"
                  className="ghost-button"
                  onClick={() => {
                    setShowInvite(false);
                    resetInviteState();
                  }}
                >
                  Cancel
                </button>
                <button className="pill-button primary" type="submit" disabled={inviteSubmitting}>
                  {inviteSubmitting ? 'Inviting…' : 'Send invite'}
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </div>
  );
}
