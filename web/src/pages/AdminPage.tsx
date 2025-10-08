import { useEffect, useState } from 'react';

import { ApiUser, fetchUsers, updateUser } from '../api';
import { useAuth } from '../context/AuthContext';

export default function AdminPage() {
  const { user } = useAuth();
  const [users, setUsers] = useState<ApiUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadUsers = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchUsers();
      setUsers(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load users');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadUsers();
  }, []);

  const handleRoleToggle = async (target: ApiUser) => {
    const newRole = target.role === 'admin' ? 'user' : 'admin';
    await updateUser(target.id, { role: newRole });
    await loadUsers();
  };

  const handleStatusToggle = async (target: ApiUser) => {
    await updateUser(target.id, { is_active: !target.is_active });
    await loadUsers();
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
      </header>

      {loading ? (
        <div className="empty-state">Loading users…</div>
      ) : error ? (
        <div className="empty-state">{error}</div>
      ) : (
        <div className="admin-table">
          <div className="admin-row admin-row-header">
            <span>Email</span>
            <span>Name</span>
            <span>Role</span>
            <span>Status</span>
            <span>Created</span>
            <span>Actions</span>
          </div>
          {users.map((item) => (
            <div key={item.id} className="admin-row">
              <span>{item.email}</span>
              <span>{item.full_name ?? '—'}</span>
              <span>{item.role}</span>
              <span>{item.is_active ? 'Active' : 'Suspended'}</span>
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
          ))}
        </div>
      )}
    </div>
  );
}
