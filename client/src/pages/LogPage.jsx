import { useState, useEffect } from 'react';
import api from '../utils/api';
import AppLayout from '../components/AppLayout';

const PLATFORMS = ['LeetCode', 'Codeforces', 'HackerRank', 'GeeksForGeeks', 'InterviewBit', 'Other'];
const DIFFICULTIES = ['Easy', 'Medium', 'Hard'];
const TOPICS = [
  'Arrays', 'Strings', 'Linked Lists', 'Stacks', 'Queues',
  'Trees', 'Graphs', 'Dynamic Programming', 'Greedy', 'Binary Search',
  'Backtracking', 'Bit Manipulation', 'Heap', 'Trie', 'Sliding Window',
  'Two Pointers', 'Math', 'Sorting', 'Recursion', 'General',
];

export default function LogPage() {
  const [problems, setProblems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [search, setSearch] = useState('');
  const [filterDifficulty, setFilterDifficulty] = useState('');
  const [filterPlatform, setFilterPlatform] = useState('');
  const [filterTopic, setFilterTopic] = useState('');
  const [sortBy, setSortBy] = useState('date');
  const [sortDir, setSortDir] = useState('desc');

  // Form state
  const [form, setForm] = useState(getEmptyForm());

  useEffect(() => {
    fetchProblems();
  }, []);

  async function fetchProblems() {
    try {
      const { data } = await api.get('/problems');
      setProblems(data);
    } catch { /* ignore */ }
    setLoading(false);
  }

  function getEmptyForm() {
    return {
      name: '', url: '', platform: 'LeetCode', difficulty: 'Medium',
      topic: 'General', notes: '', hint_used: false, independent: true,
      needs_revision: false, time_spent: '', time_seconds: 0,
      date: new Date().toISOString().split('T')[0],
    };
  }

  function handleFormChange(field, value) {
    setForm((f) => ({ ...f, [field]: value }));
  }

  function handleTimeChange(value) {
    setForm((f) => ({ ...f, time_spent: value, time_seconds: parseTimeToSeconds(value) }));
  }

  function parseTimeToSeconds(str) {
    if (!str) return 0;
    const match = str.match(/(\d+)\s*[hH]?\s*(\d*)\s*[mM]?/);
    if (!match) return 0;
    const hours = str.toLowerCase().includes('h') ? parseInt(match[1]) || 0 : 0;
    const mins = str.toLowerCase().includes('h') ? parseInt(match[2]) || 0 : parseInt(match[1]) || 0;
    return hours * 3600 + mins * 60;
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (!form.name.trim()) return;

    try {
      if (editingId) {
        await api.put(`/problems/${editingId}`, form);
      } else {
        await api.post('/problems', form);
      }
      setForm(getEmptyForm());
      setEditingId(null);
      setShowForm(false);
      fetchProblems();
    } catch { /* ignore */ }
  }

  function handleEdit(problem) {
    setForm({
      name: problem.name,
      url: problem.url || '',
      platform: problem.platform || 'LeetCode',
      difficulty: problem.difficulty || 'Medium',
      topic: problem.topic || 'General',
      notes: problem.notes || '',
      hint_used: problem.hint_used || false,
      independent: problem.independent || false,
      needs_revision: problem.needs_revision || false,
      time_spent: problem.time_spent || '',
      time_seconds: problem.time_seconds || 0,
      date: problem.date || '',
    });
    setEditingId(problem.id);
    setShowForm(true);
  }

  async function handleDelete(id) {
    if (!window.confirm('Delete this problem?')) return;
    try {
      await api.delete(`/problems/${id}`);
      fetchProblems();
    } catch { /* ignore */ }
  }

  function handleCancelEdit() {
    setForm(getEmptyForm());
    setEditingId(null);
    setShowForm(false);
  }

  // CSV Import
  async function handleCSVImport(e) {
    const file = e.target.files[0];
    if (!file) return;
    const text = await file.text();
    const lines = text.split('\n');
    const headers = lines[0].split(',').map((h) => h.trim().toLowerCase());

    for (let i = 1; i < lines.length; i++) {
      const values = lines[i].split(',');
      if (values.length < 2) continue;
      const row = {};
      headers.forEach((h, idx) => { row[h] = values[idx]?.trim() || ''; });

      await api.post('/problems', {
        name: row.name || row.problem || '',
        url: row.url || row.link || '',
        platform: row.platform || 'LeetCode',
        difficulty: row.difficulty || 'Medium',
        topic: row.topic || 'General',
        notes: row.notes || '',
        hint_used: row.hint_used === 'true' || row.hintused === 'true',
        independent: row.independent === 'true',
        needs_revision: row.needs_revision === 'true' || row.needsrevision === 'true',
        time_spent: row.time_spent || row.timespent || '0s',
        time_seconds: parseInt(row.time_seconds || row.timeseconds || '0'),
        date: row.date || new Date().toISOString().split('T')[0],
      });
    }

    e.target.value = '';
    fetchProblems();
  }

  // Filtering and sorting
  const filtered = problems
    .filter((p) => {
      if (search && !p.name.toLowerCase().includes(search.toLowerCase()) &&
          !p.topic.toLowerCase().includes(search.toLowerCase())) return false;
      if (filterDifficulty && p.difficulty !== filterDifficulty) return false;
      if (filterPlatform && p.platform !== filterPlatform) return false;
      if (filterTopic && p.topic !== filterTopic) return false;
      return true;
    })
    .sort((a, b) => {
      let cmp = 0;
      if (sortBy === 'date') cmp = (a.date || '').localeCompare(b.date || '');
      else if (sortBy === 'name') cmp = a.name.localeCompare(b.name);
      else if (sortBy === 'difficulty') {
        const order = { Easy: 0, Medium: 1, Hard: 2 };
        cmp = (order[a.difficulty] || 0) - (order[b.difficulty] || 0);
      }
      return sortDir === 'asc' ? cmp : -cmp;
    });

  function toggleSort(field) {
    if (sortBy === field) {
      setSortDir((d) => d === 'asc' ? 'desc' : 'asc');
    } else {
      setSortBy(field);
      setSortDir('desc');
    }
  }

  if (loading) return <div className="loading-screen"><div className="loading-spinner" /></div>;

  return (
    <AppLayout>
    <div className="log-page">
      {/* Toolbar */}
      <div className="log-toolbar">
        <div className="log-toolbar-left">
          <input
            type="text"
            className="search-input"
            placeholder="Search problems..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <select value={filterDifficulty} onChange={(e) => setFilterDifficulty(e.target.value)} className="filter-select">
            <option value="">All Difficulties</option>
            {DIFFICULTIES.map((d) => <option key={d} value={d}>{d}</option>)}
          </select>
          <select value={filterPlatform} onChange={(e) => setFilterPlatform(e.target.value)} className="filter-select">
            <option value="">All Platforms</option>
            {PLATFORMS.map((p) => <option key={p} value={p}>{p}</option>)}
          </select>
          <select value={filterTopic} onChange={(e) => setFilterTopic(e.target.value)} className="filter-select">
            <option value="">All Topics</option>
            {TOPICS.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
        </div>
        <div className="log-toolbar-right">
          <label className="btn btn-secondary btn-sm">
            📥 Import CSV
            <input type="file" accept=".csv" onChange={handleCSVImport} hidden />
          </label>
          <button className="btn btn-primary btn-sm" onClick={() => setShowForm(true)}>
            + Log Problem
          </button>
        </div>
      </div>

      {/* Form */}
      {showForm && (
        <div className="problem-form-card card">
          <span className="eyebrow">{editingId ? 'Edit Problem' : 'Log New Problem'}</span>
          <form onSubmit={handleSubmit} className="problem-form">
            <div className="form-row">
              <div className="form-group flex-2">
                <label>Problem Name *</label>
                <input
                  type="text"
                  value={form.name}
                  onChange={(e) => handleFormChange('name', e.target.value)}
                  placeholder="e.g. Two Sum"
                  required
                />
              </div>
              <div className="form-group flex-1">
                <label>Date</label>
                <input
                  type="date"
                  value={form.date}
                  onChange={(e) => handleFormChange('date', e.target.value)}
                />
              </div>
            </div>

            <div className="form-group">
              <label>URL</label>
              <input
                type="url"
                value={form.url}
                onChange={(e) => handleFormChange('url', e.target.value)}
                placeholder="https://leetcode.com/problems/..."
              />
            </div>

            <div className="form-row">
              <div className="form-group">
                <label>Platform</label>
                <select value={form.platform} onChange={(e) => handleFormChange('platform', e.target.value)}>
                  {PLATFORMS.map((p) => <option key={p} value={p}>{p}</option>)}
                </select>
              </div>
              <div className="form-group">
                <label>Difficulty</label>
                <select value={form.difficulty} onChange={(e) => handleFormChange('difficulty', e.target.value)}>
                  {DIFFICULTIES.map((d) => <option key={d} value={d}>{d}</option>)}
                </select>
              </div>
              <div className="form-group">
                <label>Topic</label>
                <select value={form.topic} onChange={(e) => handleFormChange('topic', e.target.value)}>
                  {TOPICS.map((t) => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>
              <div className="form-group">
                <label>Time Spent</label>
                <input
                  type="text"
                  value={form.time_spent}
                  onChange={(e) => handleTimeChange(e.target.value)}
                  placeholder="e.g. 25m or 1h 30m"
                />
              </div>
            </div>

            <div className="form-group">
              <label>Notes</label>
              <textarea
                value={form.notes}
                onChange={(e) => handleFormChange('notes', e.target.value)}
                placeholder="Approach, complexity, key insights..."
                rows={3}
              />
            </div>

            <div className="form-checkboxes">
              <label className="checkbox-label">
                <input type="checkbox" checked={form.hint_used} onChange={(e) => handleFormChange('hint_used', e.target.checked)} />
                Used Hints
              </label>
              <label className="checkbox-label">
                <input type="checkbox" checked={form.independent} onChange={(e) => handleFormChange('independent', e.target.checked)} />
                Solved Independently
              </label>
              <label className="checkbox-label">
                <input type="checkbox" checked={form.needs_revision} onChange={(e) => handleFormChange('needs_revision', e.target.checked)} />
                Needs Revision
              </label>
            </div>

            <div className="form-actions">
              <button type="submit" className="btn btn-primary">
                {editingId ? 'Update' : 'Save Problem'}
              </button>
              <button type="button" className="btn btn-secondary" onClick={handleCancelEdit}>
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Table */}
      <div className="problem-table-container card">
        <table className="problem-table">
          <thead>
            <tr>
              <th className="sortable" onClick={() => toggleSort('date')}>
                Date {sortBy === 'date' ? (sortDir === 'asc' ? '↑' : '↓') : ''}
              </th>
              <th className="sortable" onClick={() => toggleSort('name')}>
                Problem {sortBy === 'name' ? (sortDir === 'asc' ? '↑' : '↓') : ''}
              </th>
              <th>Platform</th>
              <th className="sortable" onClick={() => toggleSort('difficulty')}>
                Difficulty {sortBy === 'difficulty' ? (sortDir === 'asc' ? '↑' : '↓') : ''}
              </th>
              <th>Topic</th>
              <th>Time</th>
              <th>Flags</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr><td colSpan={8} className="empty-state">No problems logged yet. Start by clicking "+ Log Problem".</td></tr>
            ) : (
              filtered.map((p) => (
                <tr key={p.id}>
                  <td className="date-cell">{p.date}</td>
                  <td className="name-cell">
                    {p.url ? <a href={p.url} target="_blank" rel="noopener noreferrer">{p.name}</a> : p.name}
                  </td>
                  <td>{p.platform}</td>
                  <td>
                    <span className={`badge badge-${p.difficulty?.toLowerCase()}`}>{p.difficulty}</span>
                  </td>
                  <td className="topic-cell">{p.topic}</td>
                  <td className="time-cell">{p.time_spent}</td>
                  <td className="flags-cell">
                    {p.hint_used && <span className="flag" title="Used hints">💡</span>}
                    {p.independent && <span className="flag" title="Solved independently">✓</span>}
                    {p.needs_revision && <span className="flag" title="Needs revision">🔄</span>}
                  </td>
                  <td className="actions-cell">
                    <button className="btn-icon" onClick={() => handleEdit(p)} title="Edit">✏️</button>
                    <button className="btn-icon danger" onClick={() => handleDelete(p.id)} title="Delete">🗑️</button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
        <div className="table-footer">
          <span className="table-count">{filtered.length} of {problems.length} problems</span>
        </div>
      </div>
    </div>
    </AppLayout>
  );
}
