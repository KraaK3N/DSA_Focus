import { useState, useEffect } from 'react';
import api from '../utils/api';
import AppLayout from '../components/AppLayout';

export default function AdminPage() {
  const [users, setUsers] = useState([]);
  const [analytics, setAnalytics] = useState(null);
  const [pagination, setPagination] = useState({ page: 1, pages: 1, total: 0 });
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchAll();
  }, []);

  async function fetchAll() {
    setLoading(true);
    await Promise.all([fetchUsers(), fetchAnalytics()]);
    setLoading(false);
  }

  async function fetchUsers(page = 1, searchTerm = search) {
    try {
      const { data } = await api.get(`/admin/users?page=${page}&search=${searchTerm}`);
      setUsers(data.users);
      setPagination(data.pagination);
    } catch { /* ignore */ }
  }

  async function fetchAnalytics() {
    try {
      const { data } = await api.get('/admin/analytics');
      setAnalytics(data);
    } catch { /* ignore */ }
  }

  async function handleToggleActive(user) {
    try {
      await api.patch(`/admin/users/${user.id}`, { is_active: !user.is_active });
      fetchUsers(pagination.page);
    } catch { /* ignore */ }
  }

  async function handleChangeRole(user) {
    const newRole = user.role === 'admin' ? 'user' : 'admin';
    try {
      await api.patch(`/admin/users/${user.id}`, { role: newRole });
      fetchUsers(pagination.page);
    } catch { /* ignore */ }
  }

  async function handleDelete(user) {
    if (!window.confirm(`Delete user "${user.name}" and all their data? This cannot be undone.`)) return;
    try {
      await api.delete(`/admin/users/${user.id}`);
      fetchUsers(pagination.page);
      fetchAnalytics();
    } catch { /* ignore */ }
  }

  function handleSearch(e) {
    e.preventDefault();
    fetchUsers(1, search);
  }

  if (loading) return <AppLayout><div className="loading-screen"><div className="loading-spinner" /></div></AppLayout>;

  return (
    <AppLayout>
      <div className="admin-page">
        {/* Analytics Cards */}
        {analytics && (
          <div className="admin-analytics">
            <div className="analytics-card card">
              <span className="analytics-value">{analytics.totalUsers}</span>
              <span className="analytics-label">Total Users</span>
            </div>
            <div className="analytics-card card">
              <span className="analytics-value">{analytics.activeUsers7d}</span>
              <span className="analytics-label">Active (7d)</span>
            </div>
            <div className="analytics-card card">
              <span className="analytics-value">{analytics.totalProblems}</span>
              <span className="analytics-label">Total Problems</span>
            </div>
            <div className="analytics-card card">
              <span className="analytics-value">{analytics.problemsToday}</span>
              <span className="analytics-label">Problems Today</span>
            </div>
            <div className="analytics-card card">
              <span className="analytics-value">{analytics.problemsThisWeek}</span>
              <span className="analytics-label">Problems (7d)</span>
            </div>
          </div>
        )}

        {/* Top Topics */}
        {analytics?.topTopics?.length > 0 && (
          <div className="admin-topics card">
            <span className="eyebrow">Top Topics</span>
            <div className="topics-chart">
              {analytics.topTopics.slice(0, 6).map((t) => (
                <div key={t.topic} className="topic-bar-row">
                  <span className="topic-name">{t.topic}</span>
                  <div className="topic-bar">
                    <div
                      className="topic-bar-fill"
                      style={{ width: `${(t.count / analytics.topTopics[0].count) * 100}%` }}
                    />
                  </div>
                  <span className="topic-count">{t.count}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* User Management */}
        <div className="admin-users card">
          <div className="admin-users-header">
            <span className="eyebrow">User Management</span>
            <form onSubmit={handleSearch} className="admin-search">
              <input
                type="text"
                placeholder="Search by name or email..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="search-input"
              />
              <button type="submit" className="btn btn-secondary btn-sm">Search</button>
            </form>
          </div>

          <table className="problem-table admin-table">
            <thead>
              <tr>
                <th>User</th>
                <th>Provider</th>
                <th>Role</th>
                <th>Problems</th>
                <th>Journals</th>
                <th>Status</th>
                <th>Joined</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.id}>
                  <td>
                    <div className="user-info">
                      {u.avatar_url && <img src={u.avatar_url} alt="" className="user-avatar" />}
                      <div>
                        <div className="user-name-cell">{u.name}</div>
                        <div className="user-email-cell">{u.email}</div>
                      </div>
                    </div>
                  </td>
                  <td><span className="badge badge-provider">{u.provider}</span></td>
                  <td><span className={`badge ${u.role === 'admin' ? 'badge-admin' : 'badge-user'}`}>{u.role}</span></td>
                  <td>{u.problems_count}</td>
                  <td>{u.journals_count}</td>
                  <td>
                    <span className={`badge ${u.is_active ? 'badge-active' : 'badge-inactive'}`}>
                      {u.is_active ? 'Active' : 'Disabled'}
                    </span>
                  </td>
                  <td className="date-cell">{u.created_at?.split('T')[0]}</td>
                  <td className="actions-cell">
                    <button className="btn-icon" onClick={() => handleToggleActive(u)} title={u.is_active ? 'Disable' : 'Enable'}>
                      {u.is_active ? '🚫' : '✅'}
                    </button>
                    <button className="btn-icon" onClick={() => handleChangeRole(u)} title="Toggle admin">
                      👑
                    </button>
                    <button className="btn-icon danger" onClick={() => handleDelete(u)} title="Delete">
                      🗑️
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {/* Pagination */}
          {pagination.pages > 1 && (
            <div className="admin-pagination">
              <button
                className="btn btn-secondary btn-sm"
                disabled={pagination.page === 1}
                onClick={() => fetchUsers(pagination.page - 1)}
              >
                ← Prev
              </button>
              <span className="pagination-info">
                Page {pagination.page} of {pagination.pages} ({pagination.total} users)
              </span>
              <button
                className="btn btn-secondary btn-sm"
                disabled={pagination.page >= pagination.pages}
                onClick={() => fetchUsers(pagination.page + 1)}
              >
                Next →
              </button>
            </div>
          )}
        </div>
      </div>
    </AppLayout>
  );
}
