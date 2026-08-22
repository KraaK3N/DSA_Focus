import { useState, useEffect } from 'react';
import AppLayout from '../components/AppLayout';
import Timer from '../components/Timer';
import Scratchpad from '../components/Scratchpad';
import StatsGrid from '../components/StatsGrid';
import PaceProjection from '../components/PaceProjection';
import { useToast } from '../contexts/ToastContext';
import api from '../utils/api';

const DEFAULT_FORM = {
  name: '',
  url: '',
  platform: '',
  difficulty: 'Medium',
  topic: '',
  notes: '',
  hint_used: false,
  independent: true,
  needs_revision: false,
};

export default function DashboardPage() {
  const { showToast } = useToast();
  const [problems, setProblems] = useState([]);
  const [formData, setFormData] = useState(DEFAULT_FORM);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetchProblems();
  }, []);

  async function fetchProblems() {
    try {
      const { data } = await api.get('/problems');
      if (Array.isArray(data)) {
        setProblems(data);
      }
    } catch (err) {
      // ignore
    }
  }

  function handleFormChange(field, val) {
    setFormData((prev) => ({ ...prev, [field]: val }));
  }

  function handleClear() {
    setFormData(DEFAULT_FORM);
    showToast('Form cleared', 'info');
  }

  async function handleSaveProblem(e) {
    e.preventDefault();
    if (!formData.name.trim()) {
      showToast('Please enter a problem name', 'error');
      return;
    }

    setSaving(true);
    try {
      const today = new Date();
      const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;

      const payload = {
        name: formData.name.trim(),
        url: formData.url.trim(),
        platform: formData.platform.trim() || 'Other',
        difficulty: formData.difficulty || 'Medium',
        topic: formData.topic.trim() || 'General',
        notes: formData.notes.trim(),
        hint_used: Boolean(formData.hint_used),
        independent: Boolean(formData.independent),
        needs_revision: Boolean(formData.needs_revision),
        date: todayStr,
        time_spent: '0m',
        time_seconds: 0,
      };

      const res = await api.post('/problems', payload);
      if (res.data?.problem) {
        showToast(`Saved problem "${formData.name}" ✓`, 'success');
        setFormData(DEFAULT_FORM);
        fetchProblems();
      }
    } catch (err) {
      showToast(err.response?.data?.error || 'Failed to save problem', 'error');
    } finally {
      setSaving(false);
    }
  }

  return (
    <AppLayout>
      {/* Main 3-Column Dashboard matching v1_df */}
      <main className="wrap dashboard" id="dashboard-view">
        {/* Left Panel: Problem Form */}
        <aside className="panel left-panel">
          <div className="card problem-form" id="problem-form-card">
            <div className="eyebrow">Workspace</div>
            <h2>Current Problem</h2>
            <form id="problem-form" autoComplete="off" onSubmit={handleSaveProblem}>
              <div className="form-group">
                <label htmlFor="p-name">Problem Name</label>
                <input
                  type="text"
                  id="p-name"
                  placeholder="e.g. Two Sum"
                  required
                  value={formData.name}
                  onChange={(e) => handleFormChange('name', e.target.value)}
                />
              </div>
              <div className="form-group">
                <label htmlFor="p-url">Problem Link (URL)</label>
                <input
                  type="text"
                  id="p-url"
                  placeholder="e.g. https://leetcode.com/problems/..."
                  value={formData.url}
                  onChange={(e) => handleFormChange('url', e.target.value)}
                />
              </div>
              <div className="form-row">
                <div className="form-group">
                  <label htmlFor="p-platform">Platform</label>
                  <input
                    type="text"
                    id="p-platform"
                    placeholder="LeetCode, etc."
                    required
                    value={formData.platform}
                    onChange={(e) => handleFormChange('platform', e.target.value)}
                  />
                </div>
                <div className="form-group">
                  <label htmlFor="p-difficulty">Difficulty</label>
                  <select
                    id="p-difficulty"
                    value={formData.difficulty}
                    onChange={(e) => handleFormChange('difficulty', e.target.value)}
                  >
                    <option value="Easy">Easy</option>
                    <option value="Medium">Medium</option>
                    <option value="Hard">Hard</option>
                  </select>
                </div>
              </div>
              <div className="form-group">
                <label htmlFor="p-topic">Topic</label>
                <input
                  type="text"
                  id="p-topic"
                  placeholder="e.g. Binary Search, DP"
                  value={formData.topic}
                  onChange={(e) => handleFormChange('topic', e.target.value)}
                />
              </div>
              <div className="form-group">
                <label htmlFor="p-notes">Notes</label>
                <textarea
                  id="p-notes"
                  placeholder="Approaches, complexities, edge cases..."
                  value={formData.notes}
                  onChange={(e) => handleFormChange('notes', e.target.value)}
                ></textarea>
              </div>
              <div className="form-checkboxes">
                <label className="checkbox-label" htmlFor="p-hint">
                  <input
                    type="checkbox"
                    id="p-hint"
                    checked={formData.hint_used}
                    onChange={(e) => handleFormChange('hint_used', e.target.checked)}
                  />
                  Used Hint?
                </label>
                <label className="checkbox-label" htmlFor="p-independent">
                  <input
                    type="checkbox"
                    id="p-independent"
                    checked={formData.independent}
                    onChange={(e) => handleFormChange('independent', e.target.checked)}
                  />
                  Solved Independently?
                </label>
                <label className="checkbox-label" htmlFor="p-revision">
                  <input
                    type="checkbox"
                    id="p-revision"
                    checked={formData.needs_revision}
                    onChange={(e) => handleFormChange('needs_revision', e.target.checked)}
                  />
                  Needs Revision?
                </label>
              </div>
              <div className="form-actions">
                <button type="submit" className="btn primary" id="btn-save-problem" disabled={saving}>
                  {saving ? 'Saving...' : 'Save Problem'}
                </button>
                <button type="button" className="btn secondary" id="btn-clear-form" onClick={handleClear}>
                  Clear
                </button>
              </div>
            </form>
          </div>
        </aside>

        {/* Center Panel: Timer + Scratchpad */}
        <section className="panel center-panel">
          <Timer />
          <Scratchpad />
        </section>

        {/* Right Panel: Statistics */}
        <aside className="panel right-panel">
          <StatsGrid problems={problems} />
        </aside>
      </main>

      {/* Pace & Completion Projection Section matching v1_df */}
      <PaceProjection problems={problems} />
    </AppLayout>
  );
}
