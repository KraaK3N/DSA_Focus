import { useState, useEffect, useRef } from 'react';
import Papa from 'papaparse';
import AppLayout from '../components/AppLayout';
import { useToast } from '../contexts/ToastContext';
import api from '../utils/api';

const PLATFORMS = ['LeetCode', 'Codeforces', 'HackerRank', 'GeeksForGeeks', 'InterviewBit', 'Other'];
const DIFFICULTIES = ['Easy', 'Medium', 'Hard'];

export default function LogPage() {
  const { showToast } = useToast();
  const fileInputRef = useRef(null);

  const [problems, setProblems] = useState([]);
  const [loading, setLoading] = useState(true);

  // Filters
  const [search, setSearch] = useState('');
  const [filterDifficulty, setFilterDifficulty] = useState('All');
  const [filterRevision, setFilterRevision] = useState('All');

  // Notes Modal state
  const [notesModalData, setNotesModalData] = useState(null); // { problemId, name, notes }

  // Quick Edit Modal state
  const [editModalData, setEditModalData] = useState(null); // problem object or null

  // Conflict Resolution Modal state
  const [conflictState, setConflictState] = useState(null);
  const [hideIdentical, setHideIdentical] = useState(false);
  const [applyAllOption, setApplyAllOption] = useState(false);

  useEffect(() => {
    fetchProblems();
  }, []);

  async function fetchProblems() {
    setLoading(true);
    try {
      const { data } = await api.get('/problems');
      if (Array.isArray(data)) {
        setProblems(data);
      }
    } catch (err) {
      showToast('Failed to load problems from server', 'error');
    } finally {
      setLoading(false);
    }
  }

  // ─── Filter & Search ─────────────────────────────────────
  const filteredProblems = problems.filter((p) => {
    if (search) {
      const q = search.toLowerCase();
      const matchName = (p.name || '').toLowerCase().includes(q);
      const matchPlat = (p.platform || '').toLowerCase().includes(q);
      const matchTopic = (p.topic || '').toLowerCase().includes(q);
      if (!matchName && !matchPlat && !matchTopic) return false;
    }
    if (filterDifficulty !== 'All' && p.difficulty !== filterDifficulty) {
      return false;
    }
    if (filterRevision === 'Yes' && !p.needs_revision && !p.needsRevision) {
      return false;
    }
    if (filterRevision === 'No' && (p.needs_revision || p.needsRevision)) {
      return false;
    }
    return true;
  });

  // ─── Delete Problem ──────────────────────────────────────
  async function handleDeleteProblem(p) {
    if (window.confirm(`Are you sure you want to remove "${p.name}"?`)) {
      try {
        await api.delete(`/problems/${p.id}`);
        showToast(`Deleted "${p.name}"`, 'info');
        setProblems((prev) => prev.filter((item) => item.id !== p.id));
      } catch (err) {
        showToast('Failed to delete problem', 'error');
      }
    }
  }

  // ─── Notes Modal Save ────────────────────────────────────
  async function handleSaveNotes() {
    if (!notesModalData) return;
    const { problemId, notes } = notesModalData;
    const target = problems.find((p) => p.id === problemId);
    if (!target) return;

    const updated = { ...target, notes };
    try {
      await api.put(`/problems/${problemId}`, updated);
      showToast(`Notes updated for "${target.name}" ✓`, 'success');
      setProblems((prev) => prev.map((p) => (p.id === problemId ? updated : p)));
      setNotesModalData(null);
    } catch (err) {
      showToast('Failed to update notes', 'error');
    }
  }

  // ─── Quick Edit Modal Save ───────────────────────────────
  async function handleSaveQuickEdit(e) {
    e.preventDefault();
    if (!editModalData || !editModalData.name.trim()) return;

    try {
      await api.put(`/problems/${editModalData.id}`, editModalData);
      showToast(`Updated entry "${editModalData.name}" ✓`, 'success');
      setProblems((prev) => prev.map((p) => (p.id === editModalData.id ? editModalData : p)));
      setEditModalData(null);
    } catch (err) {
      showToast('Failed to update problem', 'error');
    }
  }

  // ─── Export CSV ──────────────────────────────────────────
  function handleExportCSV() {
    if (problems.length === 0) {
      showToast('No problems to export', 'info');
      return;
    }

    const headers = [
      'Date',
      'Problem Name',
      'Problem URL',
      'Platform',
      'Difficulty',
      'Topic',
      'Time Spent',
      'Time Seconds',
      'Used Hint?',
      'Solved Independently?',
      'Needs Revision?',
      'Notes',
    ];

    const rows = problems.map((p) => [
      p.date || '',
      p.name || '',
      p.url || '',
      p.platform || '',
      p.difficulty || 'Medium',
      p.topic || '',
      p.time_spent || p.timeSpent || '',
      p.time_seconds || p.timeSeconds || 0,
      p.hint_used || p.hintUsed ? 'Yes' : 'No',
      p.independent ? 'Yes' : 'No',
      p.needs_revision || p.needsRevision ? 'Yes' : 'No',
      `"${(p.notes || '').replace(/"/g, '""')}"`,
    ]);

    const csvContent = [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const today = new Date().toISOString().split('T')[0];
    link.href = URL.createObjectURL(blob);
    link.download = `dsa_problems_export_${today}.csv`;
    link.click();
    URL.revokeObjectURL(link.href);
    showToast('CSV export downloaded', 'success');
  }

  // ─── Import CSV with Conflict Resolution ─────────────────
  function handleCSVFileSelect(e) {
    const file = e.target.files?.[0];
    if (!file) return;

    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: (results) => {
        processImportedRows(results.data);
        if (fileInputRef.current) fileInputRef.current.value = '';
      },
      error: () => {
        showToast('Failed to parse CSV file', 'error');
        if (fileInputRef.current) fileInputRef.current.value = '';
      },
    });
  }

  function processImportedRows(rows) {
    if (!rows || rows.length === 0) {
      showToast('Uploaded CSV is empty', 'info');
      return;
    }

    const stagedNonConflicts = [];
    const rawConflicts = [];

    const existingMap = new Map();
    problems.forEach((p) => {
      const key = (p.name || '').trim().toLowerCase();
      if (key) existingMap.set(key, p);
    });

    rows.forEach((row) => {
      const name = (row['Problem Name'] || row.name || row.Problem || row.problem || '').trim();
      if (!name) return;

      const date = row['Date'] || row.date || new Date().toISOString().split('T')[0];
      const url = row['Problem URL'] || row.url || row.Link || row.link || '';
      const platform = row['Platform'] || row.platform || 'LeetCode';
      const difficulty = row['Difficulty'] || row.difficulty || 'Medium';
      const topic = row['Topic'] || row.topic || 'General';
      const timeSpent = row['Time Spent'] || row.time_spent || row.timeSpent || '0m';
      const timeSeconds = parseInt(row['Time Seconds'] || row.time_seconds || '0', 10) || 0;
      const hintUsed = /^(yes|true|1)$/i.test(String(row['Used Hint?'] || row.hint_used || ''));
      const independent = !/^(no|false|0)$/i.test(String(row['Solved Independently?'] || row.independent || 'true'));
      const needsRevision = /^(yes|true|1)$/i.test(String(row['Needs Revision?'] || row.needs_revision || ''));
      const notes = (row['Notes'] || row.notes || '').trim();

      const importedObj = {
        name,
        date,
        url,
        platform,
        difficulty,
        topic,
        time_spent: timeSpent,
        time_seconds: timeSeconds,
        hint_used: hintUsed,
        independent,
        needs_revision: needsRevision,
        notes,
      };

      const existingMatch = existingMap.get(name.toLowerCase());
      if (existingMatch) {
        // Compare fields to see if diff exists
        const diffFields = [];
        const fields = ['date', 'platform', 'difficulty', 'topic', 'url', 'notes'];
        fields.forEach((f) => {
          const str1 = String(existingMatch[f] || '').trim().toLowerCase();
          const str2 = String(importedObj[f] || '').trim().toLowerCase();
          if (str1 !== str2) diffFields.push(f);
        });

        rawConflicts.push({
          existing: existingMatch,
          imported: importedObj,
          diffFields,
          status: 'pending',
        });
      } else {
        stagedNonConflicts.push(importedObj);
      }
    });

    if (rawConflicts.length > 0) {
      setConflictState({
        staged: stagedNonConflicts,
        queue: rawConflicts,
        totalCount: rawConflicts.length,
        index: 0,
        history: [],
        resolutions: [],
        isFinished: false,
      });
    } else {
      commitImportBatch(stagedNonConflicts, []);
    }
  }

  // ─── Conflict Resolution Handlers ────────────────────────
  function resolveConflict(decision, applyToAll = false) {
    if (!conflictState) return;
    const { queue, index, history, resolutions } = conflictState;
    const current = queue[index];

    if (applyToAll) {
      const remainingResolutions = [...resolutions];
      for (let i = index; i < queue.length; i++) {
        remainingResolutions.push({ item: queue[i], decision });
      }
      setConflictState((prev) => ({
        ...prev,
        index: queue.length,
        resolutions: remainingResolutions,
        isFinished: true,
      }));
      return;
    }

    const nextIndex = index + 1;
    const nextHistory = [...history, { index, decision }];
    const nextResolutions = [...resolutions, { item: current, decision }];

    setConflictState((prev) => ({
      ...prev,
      index: nextIndex,
      history: nextHistory,
      resolutions: nextResolutions,
      isFinished: nextIndex >= queue.length,
    }));
  }

  function handleUndoConflict() {
    if (!conflictState || conflictState.history.length === 0) return;
    const nextHistory = [...conflictState.history];
    nextHistory.pop();
    const nextResolutions = [...conflictState.resolutions];
    nextResolutions.pop();

    setConflictState((prev) => ({
      ...prev,
      index: Math.max(0, prev.index - 1),
      history: nextHistory,
      resolutions: nextResolutions,
      isFinished: false,
    }));
  }

  async function handleFinalizeImport() {
    if (!conflictState) return;
    const { staged, resolutions } = conflictState;

    const toInsert = [...staged];
    const toUpdate = [];

    resolutions.forEach(({ item, decision }) => {
      if (decision === 'replace') {
        toUpdate.push({ ...item.imported, id: item.existing.id });
      } else if (decision === 'keep_both') {
        toInsert.push(item.imported);
      }
      // 'keep_existing' and 'skip' do nothing
    });

    setConflictState(null);
    await commitImportBatch(toInsert, toUpdate);
  }

  async function commitImportBatch(toInsert, toUpdate) {
    try {
      const promises = [
        ...toInsert.map((p) => api.post('/problems', p)),
        ...toUpdate.map((p) => api.put(`/problems/${p.id}`, p)),
      ];
      await Promise.all(promises);
      showToast(`Import complete: ${toInsert.length} added, ${toUpdate.length} updated`, 'success');
      fetchProblems();
    } catch (err) {
      showToast('Error saving imported records', 'error');
    }
  }

  // ─── Diff Render Helpers ─────────────────────────────────
  function renderFieldRow(label, val1, val2, isDiff) {
    if (hideIdentical && !isDiff) return null;
    return (
      <div className={`conflict-field-row ${isDiff ? 'is-diff' : ''}`}>
        <span className="conflict-field-label">{label}</span>
        <span className="conflict-field-val">{String(val1 || '—')}</span>
      </div>
    );
  }

  return (
    <AppLayout>
      <section className="wrap log-section" id="log-view">
        <div className="card spreadsheet-card">
          <div className="spreadsheet-header">
            <div>
              <div className="eyebrow">Tracker</div>
              <h2>Solved Problem Spreadsheet</h2>
            </div>
            <div className="spreadsheet-actions">
              <input
                type="file"
                ref={fileInputRef}
                id="csv-file-input"
                accept=".csv"
                className="hidden"
                onChange={handleCSVFileSelect}
              />
              <button
                type="button"
                className="btn secondary"
                id="btn-import-csv"
                onClick={() => fileInputRef.current?.click()}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                  <polyline points="17 8 12 3 7 8"></polyline>
                  <line x1="12" y1="3" x2="12" y2="15"></line>
                </svg>
                <span>Import CSV</span>
              </button>
              <button
                type="button"
                className="btn secondary"
                id="btn-export-csv"
                onClick={handleExportCSV}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                  <polyline points="7 10 12 15 17 10"></polyline>
                  <line x1="12" y1="15" x2="12" y2="3"></line>
                </svg>
                <span>Export CSV</span>
              </button>
            </div>
          </div>

          {/* Filters matching v1_df */}
          <div className="spreadsheet-filters">
            <div className="filter-group search-group">
              <label htmlFor="filter-search">Search</label>
              <input
                type="text"
                id="filter-search"
                placeholder="Search by name, platform, topic..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            <div className="filter-group">
              <label htmlFor="filter-difficulty">Difficulty</label>
              <select
                id="filter-difficulty"
                value={filterDifficulty}
                onChange={(e) => setFilterDifficulty(e.target.value)}
              >
                <option value="All">All Difficulties</option>
                <option value="Easy">Easy</option>
                <option value="Medium">Medium</option>
                <option value="Hard">Hard</option>
              </select>
            </div>
            <div className="filter-group">
              <label htmlFor="filter-revision">Revision Required?</label>
              <select
                id="filter-revision"
                value={filterRevision}
                onChange={(e) => setFilterRevision(e.target.value)}
              >
                <option value="All">All</option>
                <option value="Yes">Needs Revision</option>
                <option value="No">No Revision</option>
              </select>
            </div>
          </div>

          {/* Table matching v1_df */}
          <div className="table-container">
            <table className="spreadsheet-table">
              <thead>
                <tr>
                  <th style={{ width: '110px' }}>Date</th>
                  <th>Problem Name</th>
                  <th style={{ width: '100px' }}>Platform</th>
                  <th style={{ width: '100px' }}>Difficulty</th>
                  <th>Topic</th>
                  <th style={{ width: '110px' }}>Time Spent</th>
                  <th style={{ width: '80px' }}>Hint?</th>
                  <th style={{ width: '80px' }}>Solo?</th>
                  <th style={{ width: '90px' }}>Revise?</th>
                  <th>Notes</th>
                  <th style={{ width: '130px' }}>Actions</th>
                </tr>
              </thead>
              <tbody id="spreadsheet-body">
                {filteredProblems.map((p) => (
                  <tr key={p.id}>
                    <td>{p.date}</td>
                    <td className="problem-name-cell">
                      {p.url ? (
                        <a href={p.url} target="_blank" rel="noopener noreferrer" className="problem-link">
                          {p.name}
                        </a>
                      ) : (
                        <span>{p.name}</span>
                      )}
                    </td>
                    <td><span className="badge platform">{p.platform}</span></td>
                    <td>
                      <span className={`badge diff-${(p.difficulty || 'medium').toLowerCase()}`}>
                        {p.difficulty}
                      </span>
                    </td>
                    <td>{p.topic}</td>
                    <td className="font-mono">{p.time_spent || p.timeSpent || '0m'}</td>
                    <td>{p.hint_used || p.hintUsed ? '💡' : '—'}</td>
                    <td>{p.independent ? '✓' : '✗'}</td>
                    <td>{p.needs_revision || p.needsRevision ? '🔄' : '—'}</td>
                    <td>
                      {p.notes ? (
                        <button
                          type="button"
                          className="btn-note-preview"
                          title="Click to view notes"
                          onClick={() => setNotesModalData({ problemId: p.id, name: p.name, notes: p.notes })}
                        >
                          📝 {p.notes.slice(0, 24)}{p.notes.length > 24 ? '…' : ''}
                        </button>
                      ) : (
                        <button
                          type="button"
                          className="btn-add-note"
                          onClick={() => setNotesModalData({ problemId: p.id, name: p.name, notes: '' })}
                        >
                          + note
                        </button>
                      )}
                    </td>
                    <td className="actions-cell">
                      <button
                        type="button"
                        className="btn-action edit"
                        title="Edit problem"
                        onClick={() =>
                          setEditModalData({
                            id: p.id,
                            name: p.name,
                            url: p.url || '',
                            platform: p.platform || 'LeetCode',
                            difficulty: p.difficulty || 'Medium',
                            topic: p.topic || 'General',
                            notes: p.notes || '',
                            hint_used: p.hint_used || p.hintUsed || false,
                            independent: p.independent !== false,
                            needs_revision: p.needs_revision || p.needsRevision || false,
                            date: p.date || new Date().toISOString().split('T')[0],
                            time_spent: p.time_spent || p.timeSpent || '0m',
                            time_seconds: p.time_seconds || p.timeSeconds || 0,
                          })
                        }
                      >
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <path d="M12 20h9"></path>
                          <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"></path>
                        </svg>
                      </button>
                      <button
                        type="button"
                        className="btn-action delete"
                        title="Delete problem"
                        onClick={() => handleDeleteProblem(p)}
                      >
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <polyline points="3 6 5 6 21 6"></polyline>
                          <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                        </svg>
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            {filteredProblems.length === 0 && !loading && (
              <p className="empty-state" id="spreadsheet-empty">
                No matching problems found.
              </p>
            )}
          </div>
        </div>
      </section>

      {/* ─── Notes Modal matching v1_df ───────────────────────── */}
      {notesModalData && (
        <>
          <div
            id="notes-sidebar-backdrop"
            className="modal-backdrop active"
            onClick={() => setNotesModalData(null)}
          ></div>
          <div id="notes-sidebar" className="modal-backdrop active" role="dialog" aria-modal="true">
            <div className="scratchpad-modal-card notes-modal-card">
              <button
                type="button"
                id="notes-sidebar-close"
                className="scratchpad-close-btn"
                aria-label="Close notes"
                onClick={() => setNotesModalData(null)}
              >
                ✕
              </button>
              <div className="notes-modal-header">
                <h3 className="notes-modal-heading">Save Notes</h3>
                <span className="notes-sidebar-subtitle">{notesModalData.name}</span>
              </div>
              <div className="notes-modal-body">
                <textarea
                  id="notes-modal-textarea"
                  className="notes-modal-textarea"
                  placeholder="Write your thoughts, patterns, or reminders..."
                  value={notesModalData.notes}
                  autoFocus
                  onChange={(e) => setNotesModalData((prev) => ({ ...prev, notes: e.target.value }))}
                ></textarea>
              </div>
              <div className="notes-modal-footer">
                <button
                  type="button"
                  id="notes-modal-cancel"
                  className="btn secondary"
                  onClick={() => setNotesModalData(null)}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  id="notes-modal-save"
                  className="btn primary glow"
                  onClick={handleSaveNotes}
                >
                  Save
                </button>
              </div>
            </div>
          </div>
        </>
      )}

      {/* ─── Quick Edit Problem Modal matching v1_df ─────────── */}
      {editModalData && (
        <>
          <div
            id="quick-edit-modal-backdrop"
            className="modal-backdrop active"
            onClick={() => setEditModalData(null)}
          ></div>
          <div id="quick-edit-modal" className="modal-backdrop active" role="dialog" aria-modal="true">
            <div className="scratchpad-modal-card notes-modal-card quick-edit-modal-card">
              <button
                type="button"
                id="quick-edit-modal-close"
                className="scratchpad-close-btn"
                aria-label="Close modal"
                onClick={() => setEditModalData(null)}
              >
                ✕
              </button>
              <div className="notes-modal-header">
                <div>
                  <div className="scratchpad-badge">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                      <path d="M12 20h9"></path>
                      <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"></path>
                    </svg>
                    Quick Edit Entry
                  </div>
                  <h3 className="notes-modal-heading">Edit Problem Log</h3>
                </div>
              </div>

              <form id="quick-edit-form" className="quick-edit-form" onSubmit={handleSaveQuickEdit}>
                <div className="form-row">
                  <div className="form-group">
                    <label htmlFor="qe-date">Date Solved</label>
                    <input
                      type="date"
                      id="qe-date"
                      required
                      value={editModalData.date}
                      onChange={(e) => setEditModalData((prev) => ({ ...prev, date: e.target.value }))}
                    />
                  </div>
                  <div className="form-group">
                    <label htmlFor="qe-time">Time Spent</label>
                    <input
                      type="text"
                      id="qe-time"
                      placeholder="e.g. 20m 15s or 0m"
                      value={editModalData.time_spent}
                      onChange={(e) => setEditModalData((prev) => ({ ...prev, time_spent: e.target.value }))}
                    />
                  </div>
                </div>

                <div className="form-group">
                  <label htmlFor="qe-name">Problem Name</label>
                  <input
                    type="text"
                    id="qe-name"
                    placeholder="e.g. Two Sum"
                    required
                    value={editModalData.name}
                    onChange={(e) => setEditModalData((prev) => ({ ...prev, name: e.target.value }))}
                  />
                </div>

                <div className="form-group">
                  <label htmlFor="qe-url">Problem Link (URL)</label>
                  <input
                    type="text"
                    id="qe-url"
                    placeholder="https://leetcode.com/problems/..."
                    value={editModalData.url}
                    onChange={(e) => setEditModalData((prev) => ({ ...prev, url: e.target.value }))}
                  />
                </div>

                <div className="form-row">
                  <div className="form-group">
                    <label htmlFor="qe-platform">Platform</label>
                    <input
                      type="text"
                      id="qe-platform"
                      placeholder="LeetCode, HackerRank..."
                      required
                      value={editModalData.platform}
                      onChange={(e) => setEditModalData((prev) => ({ ...prev, platform: e.target.value }))}
                    />
                  </div>
                  <div className="form-group">
                    <label htmlFor="qe-difficulty">Difficulty</label>
                    <select
                      id="qe-difficulty"
                      value={editModalData.difficulty}
                      onChange={(e) => setEditModalData((prev) => ({ ...prev, difficulty: e.target.value }))}
                    >
                      <option value="Easy">Easy</option>
                      <option value="Medium">Medium</option>
                      <option value="Hard">Hard</option>
                    </select>
                  </div>
                </div>

                <div className="form-group">
                  <label htmlFor="qe-topic">Topic</label>
                  <input
                    type="text"
                    id="qe-topic"
                    placeholder="e.g. Binary Search, DP"
                    value={editModalData.topic}
                    onChange={(e) => setEditModalData((prev) => ({ ...prev, topic: e.target.value }))}
                  />
                </div>

                <div className="form-checkboxes">
                  <label className="checkbox-label" htmlFor="qe-hint">
                    <input
                      type="checkbox"
                      id="qe-hint"
                      checked={editModalData.hint_used}
                      onChange={(e) => setEditModalData((prev) => ({ ...prev, hint_used: e.target.checked }))}
                    />
                    Used Hint?
                  </label>
                  <label className="checkbox-label" htmlFor="qe-independent">
                    <input
                      type="checkbox"
                      id="qe-independent"
                      checked={editModalData.independent}
                      onChange={(e) => setEditModalData((prev) => ({ ...prev, independent: e.target.checked }))}
                    />
                    Solved Independently?
                  </label>
                  <label className="checkbox-label" htmlFor="qe-revision">
                    <input
                      type="checkbox"
                      id="qe-revision"
                      checked={editModalData.needs_revision}
                      onChange={(e) => setEditModalData((prev) => ({ ...prev, needs_revision: e.target.checked }))}
                    />
                    Needs Revision?
                  </label>
                </div>

                <div className="form-group">
                  <label htmlFor="qe-notes">Notes & Key Takeaways</label>
                  <textarea
                    id="qe-notes"
                    rows="3"
                    placeholder="Approaches, complexities, edge cases..."
                    value={editModalData.notes}
                    onChange={(e) => setEditModalData((prev) => ({ ...prev, notes: e.target.value }))}
                  ></textarea>
                </div>

                <div className="notes-modal-footer">
                  <button
                    type="button"
                    id="qe-cancel"
                    className="btn secondary"
                    onClick={() => setEditModalData(null)}
                  >
                    Cancel
                  </button>
                  <button type="submit" id="qe-save" className="btn primary glow">
                    Save Changes
                  </button>
                </div>
              </form>
            </div>
          </div>
        </>
      )}

      {/* ─── Conflict Resolution Modal matching v1_df ────────── */}
      {conflictState && (
        <div id="conflict-modal" className="modal" role="dialog" aria-modal="true">
          <div className="modal-content conflict-modal-content">
            {!conflictState.isFinished ? (
              <div id="conflict-active-view">
                <div className="conflict-header">
                  <div className="conflict-title-group">
                    <span className="conflict-icon">
                      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="var(--accent-primary)" strokeWidth="2">
                        <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"></polygon>
                      </svg>
                    </span>
                    <div>
                      <div className="eyebrow conflict-eyebrow">Duplicate Resolution</div>
                      <h2 className="conflict-title">Import Conflict Detected</h2>
                    </div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span className="conflict-diff-count-badge" aria-live="polite">
                      {conflictState.queue[conflictState.index]?.diffFields?.length || 0} fields differ
                    </span>
                    <span className="conflict-counter-badge font-mono" aria-live="polite">
                      Conflict {conflictState.index + 1} of {conflictState.totalCount}
                    </span>
                    <button
                      type="button"
                      className="conflict-close-btn"
                      title="Cancel Import"
                      onClick={() => setConflictState(null)}
                    >
                      ✕
                    </button>
                  </div>
                </div>

                {/* Progress bar track */}
                <div className="conflict-progress-track">
                  <div
                    className="conflict-progress-bar"
                    style={{
                      width: `${Math.round((conflictState.index / conflictState.totalCount) * 100)}%`,
                    }}
                  ></div>
                </div>

                <div className="conflict-subtitle-bar">
                  <p className="conflict-subtitle">
                    Found {conflictState.totalCount} duplicate problem entries. Choose which version to keep.
                  </p>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <label
                      className="checkbox-label"
                      style={{ fontSize: '0.76rem', color: 'var(--text-muted)', cursor: 'pointer' }}
                    >
                      <input
                        type="checkbox"
                        checked={hideIdentical}
                        onChange={(e) => setHideIdentical(e.target.checked)}
                      />
                      <span>Hide identical</span>
                    </label>
                    {conflictState.history.length > 0 && (
                      <button
                        type="button"
                        className="btn-conflict-undo"
                        title="Undo last decision"
                        onClick={handleUndoConflict}
                      >
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <path d="M3 7v6h6"></path>
                          <path d="M21 17a9 9 0 0 0-9-9 9 9 0 0 0-6 2.3L3 13"></path>
                        </svg>
                        <span>Undo Last</span>
                      </button>
                    )}
                  </div>
                </div>

                {/* Side by side comparison */}
                {conflictState.queue[conflictState.index] && (
                  <div className="conflict-comparison-grid">
                    {/* Left: Existing DB Record */}
                    <div className="conflict-card conflict-card-existing">
                      <div className="conflict-card-header">
                        <span className="conflict-card-tag existing-tag">
                          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <ellipse cx="12" cy="5" rx="9" ry="3"></ellipse>
                            <path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3"></path>
                            <path d="M21 19c0 1.66-4 3-9 3s-9-1.34-9-3"></path>
                          </svg>
                          Existing in Database
                        </span>
                      </div>
                      <div className="conflict-card-details">
                        {renderFieldRow('Name', conflictState.queue[conflictState.index].existing.name, conflictState.queue[conflictState.index].imported.name, false)}
                        {renderFieldRow('Date', conflictState.queue[conflictState.index].existing.date, conflictState.queue[conflictState.index].imported.date, conflictState.queue[conflictState.index].diffFields.includes('date'))}
                        {renderFieldRow('Platform', conflictState.queue[conflictState.index].existing.platform, conflictState.queue[conflictState.index].imported.platform, conflictState.queue[conflictState.index].diffFields.includes('platform'))}
                        {renderFieldRow('Difficulty', conflictState.queue[conflictState.index].existing.difficulty, conflictState.queue[conflictState.index].imported.difficulty, conflictState.queue[conflictState.index].diffFields.includes('difficulty'))}
                        {renderFieldRow('Topic', conflictState.queue[conflictState.index].existing.topic, conflictState.queue[conflictState.index].imported.topic, conflictState.queue[conflictState.index].diffFields.includes('topic'))}
                        {renderFieldRow('URL', conflictState.queue[conflictState.index].existing.url, conflictState.queue[conflictState.index].imported.url, conflictState.queue[conflictState.index].diffFields.includes('url'))}
                        {renderFieldRow('Notes', conflictState.queue[conflictState.index].existing.notes, conflictState.queue[conflictState.index].imported.notes, conflictState.queue[conflictState.index].diffFields.includes('notes'))}
                      </div>
                    </div>

                    <div className="conflict-vs-divider">VS</div>

                    {/* Right: Imported CSV Record */}
                    <div className="conflict-card conflict-card-imported">
                      <div className="conflict-card-header">
                        <span className="conflict-card-tag imported-tag">
                          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
                            <polyline points="14 2 14 8 20 8"></polyline>
                          </svg>
                          Imported from CSV
                        </span>
                      </div>
                      <div className="conflict-card-details">
                        {renderFieldRow('Name', conflictState.queue[conflictState.index].imported.name, conflictState.queue[conflictState.index].existing.name, false)}
                        {renderFieldRow('Date', conflictState.queue[conflictState.index].imported.date, conflictState.queue[conflictState.index].existing.date, conflictState.queue[conflictState.index].diffFields.includes('date'))}
                        {renderFieldRow('Platform', conflictState.queue[conflictState.index].imported.platform, conflictState.queue[conflictState.index].existing.platform, conflictState.queue[conflictState.index].diffFields.includes('platform'))}
                        {renderFieldRow('Difficulty', conflictState.queue[conflictState.index].imported.difficulty, conflictState.queue[conflictState.index].existing.difficulty, conflictState.queue[conflictState.index].diffFields.includes('difficulty'))}
                        {renderFieldRow('Topic', conflictState.queue[conflictState.index].imported.topic, conflictState.queue[conflictState.index].existing.topic, conflictState.queue[conflictState.index].diffFields.includes('topic'))}
                        {renderFieldRow('URL', conflictState.queue[conflictState.index].imported.url, conflictState.queue[conflictState.index].existing.url, conflictState.queue[conflictState.index].diffFields.includes('url'))}
                        {renderFieldRow('Notes', conflictState.queue[conflictState.index].imported.notes, conflictState.queue[conflictState.index].existing.notes, conflictState.queue[conflictState.index].diffFields.includes('notes'))}
                      </div>
                    </div>
                  </div>
                )}

                {/* Actions */}
                <div className="conflict-actions-bar">
                  <button
                    type="button"
                    className="btn conflict-btn btn-keep-existing"
                    onClick={() => resolveConflict('keep_existing', applyAllOption)}
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <ellipse cx="12" cy="5" rx="9" ry="3"></ellipse>
                      <path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3"></path>
                      <path d="M21 19c0 1.66-4 3-9 3s-9-1.34-9-3"></path>
                    </svg>
                    <span>Keep Existing</span>
                  </button>
                  <button
                    type="button"
                    className="btn conflict-btn btn-replace-imported"
                    onClick={() => resolveConflict('replace', applyAllOption)}
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <polyline points="23 4 23 10 17 10"></polyline>
                      <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"></path>
                    </svg>
                    <span>Replace with Imported</span>
                  </button>
                  <button
                    type="button"
                    className="btn conflict-btn btn-keep-both"
                    onClick={() => resolveConflict('keep_both', applyAllOption)}
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
                      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
                    </svg>
                    <span>Keep Both</span>
                  </button>
                </div>

                {/* Batch controls */}
                <div className="conflict-batch-footer">
                  <div className="conflict-batch-left">
                    <label className="checkbox-label conflict-apply-all-label">
                      <input
                        type="checkbox"
                        checked={applyAllOption}
                        onChange={(e) => setApplyAllOption(e.target.checked)}
                      />
                      <span>Apply this choice to all remaining conflicts</span>
                    </label>
                    <button
                      type="button"
                      className="btn btn-batch btn-skip-now"
                      onClick={() => resolveConflict('skip', false)}
                    >
                      Skip for now
                    </button>
                  </div>
                  <div className="conflict-batch-buttons">
                    <button
                      type="button"
                      className="btn btn-batch"
                      onClick={() => resolveConflict('keep_existing', true)}
                    >
                      Skip All (Keep Existing)
                    </button>
                    <button
                      type="button"
                      className="btn btn-batch"
                      onClick={() => resolveConflict('replace', true)}
                    >
                      Replace All (Use Imported)
                    </button>
                    <button
                      type="button"
                      className="btn btn-batch"
                      onClick={() => resolveConflict('keep_both', true)}
                    >
                      Keep All (Save Both)
                    </button>
                    <button
                      type="button"
                      className="btn btn-batch btn-batch-cancel"
                      onClick={() => setConflictState(null)}
                    >
                      Cancel Import
                    </button>
                  </div>
                </div>
              </div>
            ) : (
              /* Summary View matching v1_df */
              <div id="conflict-summary-view">
                <div className="conflict-header">
                  <div className="conflict-title-group">
                    <span className="conflict-icon success-icon">
                      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="var(--color-easy)" strokeWidth="2">
                        <polyline points="20 6 9 17 4 12"></polyline>
                      </svg>
                    </span>
                    <div>
                      <div className="eyebrow conflict-eyebrow">Import Summary</div>
                      <h2 className="conflict-title">Conflict Resolution Complete</h2>
                    </div>
                  </div>
                  <button
                    type="button"
                    className="conflict-close-btn"
                    onClick={() => setConflictState(null)}
                  >
                    ✕
                  </button>
                </div>

                <div className="summary-body">
                  <p className="summary-total-text">
                    Resolved {conflictState.resolutions.length} of {conflictState.totalCount} conflicts
                  </p>
                  <div className="summary-breakdown-grid">
                    <div className="summary-card">
                      <span className="summary-card-val font-mono">
                        {conflictState.resolutions.filter((r) => r.decision === 'keep_existing').length}
                      </span>
                      <span className="summary-card-lbl">Kept Existing</span>
                    </div>
                    <div className="summary-card">
                      <span className="summary-card-val font-mono">
                        {conflictState.resolutions.filter((r) => r.decision === 'replace').length}
                      </span>
                      <span className="summary-card-lbl">Replaced</span>
                    </div>
                    <div className="summary-card">
                      <span className="summary-card-val font-mono">
                        {conflictState.resolutions.filter((r) => r.decision === 'keep_both').length}
                      </span>
                      <span className="summary-card-lbl">Kept Both</span>
                    </div>
                    <div className="summary-card">
                      <span className="summary-card-val font-mono">
                        {conflictState.resolutions.filter((r) => r.decision === 'skip').length}
                      </span>
                      <span className="summary-card-lbl">Skipped</span>
                    </div>
                  </div>

                  <div className="summary-actions-bar">
                    <button
                      type="button"
                      className="btn primary"
                      onClick={handleFinalizeImport}
                    >
                      Finish & Commit Import
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </AppLayout>
  );
}
