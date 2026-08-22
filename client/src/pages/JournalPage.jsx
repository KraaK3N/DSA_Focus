import { useState, useEffect, useRef, useCallback } from 'react';
import AppLayout from '../components/AppLayout';
import { useToast } from '../contexts/ToastContext';
import api from '../utils/api';

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
];
const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

export default function JournalPage() {
  const { showToast } = useToast();

  const [journals, setJournals] = useState([]);
  const [problems, setProblems] = useState([]);
  const [loading, setLoading] = useState(true);

  const [viewMode, setViewMode] = useState('grid'); // 'grid' | 'deck'
  const [deckFilter, setDeckFilter] = useState('all'); // 'all' | 'entries'
  const [deckIndex, setDeckIndex] = useState(0);

  const [currentYear, setCurrentYear] = useState(() => new Date().getFullYear());
  const [currentMonth, setCurrentMonth] = useState(() => new Date().getMonth());

  // Modal State
  const [modalOpen, setModalOpen] = useState(false);
  const [activeDate, setActiveDate] = useState('');
  const [entryTitle, setEntryTitle] = useState('');
  const [entryContent, setEntryContent] = useState('');
  const [activeEntryId, setActiveEntryId] = useState(null);
  const [draftSaved, setDraftSaved] = useState(false);

  const dragStartXRef = useRef(null);
  const isDraggingRef = useRef(false);

  useEffect(() => {
    fetchData();
  }, []);

  async function fetchData() {
    setLoading(true);
    try {
      const [jRes, pRes] = await Promise.all([
        api.get('/journals').catch(() => ({ data: [] })),
        api.get('/problems').catch(() => ({ data: [] })),
      ]);
      if (Array.isArray(jRes.data)) setJournals(jRes.data);
      if (Array.isArray(pRes.data)) setProblems(pRes.data);
    } catch (err) {
      showToast('Failed to load journal entries', 'error');
    } finally {
      setLoading(false);
    }
  }

  function getTodayDateStr() {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }

  // ─── Modal Open / Close / Save ───────────────────────────
  function openModalForDate(dateStr) {
    const targetDate = dateStr || getTodayDateStr();
    const existing = journals.find((j) => j.date === targetDate);

    setActiveDate(targetDate);
    if (existing) {
      setActiveEntryId(existing.id);
      setEntryTitle(existing.title || '');
      setEntryContent(existing.content || '');
    } else {
      setActiveEntryId(null);
      setEntryTitle('');
      setEntryContent('');
    }
    setDraftSaved(false);
    setModalOpen(true);
  }

  async function handleSaveEntry(e) {
    if (e) e.preventDefault();
    if (!activeDate) return;

    const payload = {
      id: activeEntryId || undefined,
      date: activeDate,
      title: entryTitle.trim(),
      content: entryContent.trim(),
      timestamp: Date.now(),
    };

    try {
      const res = await api.post('/journals', payload);
      if (res.data?.journal) {
        showToast(`Journal entry saved for ${activeDate} ✓`, 'success');
        setJournals((prev) => {
          const filtered = prev.filter((j) => j.date !== activeDate);
          return [res.data.journal, ...filtered];
        });
        setModalOpen(false);
      }
    } catch (err) {
      showToast('Failed to save journal entry', 'error');
    }
  }

  async function handleDeleteEntry() {
    if (!activeEntryId) return;
    if (window.confirm('Delete this journal entry?')) {
      try {
        await api.delete(`/journals/${activeEntryId}`);
        showToast('Journal entry deleted', 'info');
        setJournals((prev) => prev.filter((j) => j.id !== activeEntryId));
        setModalOpen(false);
      } catch (err) {
        showToast('Failed to delete journal entry', 'error');
      }
    }
  }

  // ─── Month Navigation ────────────────────────────────────
  function handlePrevMonth() {
    if (currentMonth === 0) {
      setCurrentMonth(11);
      setCurrentYear((y) => y - 1);
    } else {
      setCurrentMonth((m) => m - 1);
    }
    setDeckIndex(0);
  }

  function handleNextMonth() {
    if (currentMonth === 11) {
      setCurrentMonth(0);
      setCurrentYear((y) => y + 1);
    } else {
      setCurrentMonth((m) => m + 1);
    }
    setDeckIndex(0);
  }

  function handleGoToToday() {
    const today = new Date();
    setCurrentYear(today.getFullYear());
    setCurrentMonth(today.getMonth());
    setDeckIndex(today.getDate() - 1);
  }

  // ─── Calendar Data Computation ───────────────────────────
  const daysInMonth = new Date(currentYear, currentMonth + 1, 0).getDate();
  const firstDayIndex = new Date(currentYear, currentMonth, 1).getDay(); // 0 is Sun
  const todayStr = getTodayDateStr();

  const journalMap = {};
  journals.forEach((j) => {
    if (j.date) {
      if (!journalMap[j.date]) journalMap[j.date] = [];
      journalMap[j.date].push(j);
    }
  });

  const problemsMap = {};
  problems.forEach((p) => {
    if (p.date) {
      problemsMap[p.date] = (problemsMap[p.date] || 0) + 1;
    }
  });

  // Build deck cards data
  let allDeckCards = [];
  for (let day = 1; day <= daysInMonth; day++) {
    const dateStr = `${currentYear}-${String(currentMonth + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    const dayObj = new Date(currentYear, currentMonth, day);
    const entries = journalMap[dateStr] || [];
    const isToday = dateStr === todayStr;
    allDeckCards.push({ day, dateStr, dayObj, entries, isToday });
  }

  if (deckFilter === 'entries') {
    allDeckCards = allDeckCards.filter((c) => c.entries.length > 0);
  }

  const activeCard = allDeckCards[deckIndex] || null;

  // Compute ambient glow
  let glowColor1 = 'rgba(223, 79, 41, 0.22)';
  let glowColor2 = 'rgba(16, 185, 129, 0.08)';
  if (activeCard) {
    if (activeCard.isToday) {
      glowColor1 = 'rgba(223, 79, 41, 0.38)';
      glowColor2 = 'rgba(247, 148, 29, 0.22)';
    } else if (activeCard.entries.length > 0) {
      glowColor1 = 'rgba(16, 185, 129, 0.32)';
      glowColor2 = 'rgba(59, 130, 246, 0.15)';
    } else {
      glowColor1 = 'rgba(99, 102, 241, 0.18)';
      glowColor2 = 'rgba(15, 23, 42, 0.12)';
    }
  }

  // ─── Deck Drag / Swipe ───────────────────────────────────
  function handlePointerDown(e) {
    dragStartXRef.current = e.clientX;
    isDraggingRef.current = false;
  }

  function handlePointerMove(e) {
    if (dragStartXRef.current !== null) {
      if (Math.abs(e.clientX - dragStartXRef.current) > 10) {
        isDraggingRef.current = true;
      }
    }
  }

  function handlePointerUp(e) {
    if (dragStartXRef.current !== null) {
      const diff = e.clientX - dragStartXRef.current;
      if (Math.abs(diff) > 45) {
        if (diff < 0) {
          setDeckIndex((prev) => Math.min(allDeckCards.length - 1, prev + 1));
        } else {
          setDeckIndex((prev) => Math.max(0, prev - 1));
        }
      }
      dragStartXRef.current = null;
    }
  }

  // Formatted date string for modal subtitle
  let modalDateFormatted = activeDate;
  if (activeDate) {
    const parts = activeDate.split('-');
    if (parts.length === 3) {
      const d = new Date(parseInt(parts[0], 10), parseInt(parts[1], 10) - 1, parseInt(parts[2], 10));
      modalDateFormatted = d.toLocaleDateString('en-US', {
        weekday: 'long',
        month: 'long',
        day: 'numeric',
        year: 'numeric',
      });
    }
  }

  const wordCount = entryContent ? entryContent.trim().split(/\s+/).filter(Boolean).length : 0;

  return (
    <AppLayout>
      <section className="wrap journal-section" id="journal-view">
        {/* Header Card matching v1_df */}
        <div className="card journal-header-card">
          <div className="journal-title-bar">
            <div>
              <div className="eyebrow">Personal Notepad & Reflection</div>
              <h2>Daily Journal & Scratchpad</h2>
            </div>
            <button
              type="button"
              className="btn primary journal-new-btn"
              id="btn-open-journal-modal"
              onClick={() => openModalForDate(getTodayDateStr())}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 20h9"></path>
                <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"></path>
              </svg>
              <span>What's on your mind?</span>
            </button>
          </div>
        </div>

        {/* Calendar View Card matching v1_df */}
        <div className="card journal-calendar-card">
          <div className="calendar-header-bar">
            <div className="calendar-title">
              <h3 id="journal-view-title">{viewMode === 'grid' ? 'Calendar View' : 'Cards Deck View'}</h3>
              <p className="sub-text" id="journal-view-subtext">
                Click on any date to write or view thoughts for that day
              </p>
            </div>
            <div className="calendar-controls">
              <button
                type="button"
                className="btn btn-icon secondary"
                id="btn-prev-month"
                aria-label="Previous Month"
                onClick={handlePrevMonth}
              >
                ‹
              </button>
              <div className="calendar-month-display" id="calendar-month-year">
                {MONTH_NAMES[currentMonth]} {currentYear}
              </div>
              <button
                type="button"
                className="btn btn-icon secondary"
                id="btn-next-month"
                aria-label="Next Month"
                onClick={handleNextMonth}
              >
                ›
              </button>

              <div className="view-toggle-pill-group" role="group" aria-label="Switch view">
                <button
                  type="button"
                  id="btn-view-grid"
                  className={`toggle-pill-btn ${viewMode === 'grid' ? 'active' : ''}`}
                  onClick={() => setViewMode('grid')}
                  title="Grid Calendar View"
                >
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <rect x="3" y="3" width="7" height="7"></rect>
                    <rect x="14" y="3" width="7" height="7"></rect>
                    <rect x="14" y="14" width="7" height="7"></rect>
                    <rect x="3" y="14" width="7" height="7"></rect>
                  </svg>
                  <span>Grid</span>
                </button>
                <button
                  type="button"
                  id="btn-view-deck"
                  className={`toggle-pill-btn ${viewMode === 'deck' ? 'active' : ''}`}
                  onClick={() => setViewMode('deck')}
                  title="Cards Deck View"
                >
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <rect x="2" y="6" width="20" height="12" rx="2"></rect>
                    <path d="M12 12h.01"></path>
                  </svg>
                  <span>Cards</span>
                </button>
              </div>

              <button
                type="button"
                className="btn secondary sm"
                id="btn-calendar-today"
                onClick={handleGoToToday}
              >
                Today
              </button>
            </div>
          </div>

          {/* ─── Grid View matching v1_df ───────────────────────── */}
          {viewMode === 'grid' && (
            <div id="journal-calendar-grid-body" className="journal-calendar-grid-body">
              <div className="calendar-weekdays">
                <span>Sun</span>
                <span>Mon</span>
                <span>Tue</span>
                <span>Wed</span>
                <span>Thu</span>
                <span>Fri</span>
                <span>Sat</span>
              </div>

              <div className="calendar-grid" id="calendar-grid">
                {/* Empty cells before month start */}
                {Array.from({ length: firstDayIndex }).map((_, idx) => (
                  <div key={`empty-${idx}`} className="calendar-day empty"></div>
                ))}

                {/* Days of month */}
                {Array.from({ length: daysInMonth }).map((_, idx) => {
                  const day = idx + 1;
                  const dateStr = `${currentYear}-${String(currentMonth + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
                  const isToday = dateStr === todayStr;
                  const entries = journalMap[dateStr] || [];
                  const solvedCount = problemsMap[dateStr] || 0;

                  return (
                    <div
                      key={dateStr}
                      className={`calendar-day ${isToday ? 'today' : ''} ${entries.length > 0 ? 'has-entry' : ''}`}
                      onClick={() => openModalForDate(dateStr)}
                    >
                      <span className="day-number">{day}</span>
                      <div className="day-indicators">
                        {entries.length > 0 && <span className="entry-dot" title="Journal reflection written"></span>}
                        {solvedCount > 0 && (
                          <span className="solved-badge" title={`${solvedCount} problem${solvedCount > 1 ? 's' : ''} solved`}>
                            {solvedCount}✓
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* ─── 3D Cover-Flow Deck View matching v1_df ────────── */}
          {viewMode === 'deck' && (
            <div id="journal-deck-container" className="journal-deck-container" aria-label="3D Card Deck Journal View">
              {/* Ambient glow backdrop */}
              <div
                id="deck-ambient-glow"
                className="deck-ambient-glow"
                aria-hidden="true"
                style={{
                  background: `radial-gradient(circle at 50% 45%, ${glowColor1} 0%, ${glowColor2} 55%, transparent 75%)`,
                }}
              ></div>

              {/* Toolbar */}
              <div className="deck-toolbar">
                <div className="deck-filter-pills" role="group" aria-label="Filter cards">
                  <button
                    type="button"
                    className={`deck-filter-btn ${deckFilter === 'all' ? 'active' : ''}`}
                    onClick={() => {
                      setDeckFilter('all');
                      setDeckIndex(0);
                    }}
                  >
                    All Days
                  </button>
                  <button
                    type="button"
                    className={`deck-filter-btn ${deckFilter === 'entries' ? 'active' : ''}`}
                    onClick={() => {
                      setDeckFilter('entries');
                      setDeckIndex(0);
                    }}
                  >
                    With Entries
                  </button>
                </div>
                <span id="deck-counter-badge" className="deck-counter-badge" aria-live="polite">
                  Day {allDeckCards.length > 0 ? deckIndex + 1 : 0} of {allDeckCards.length}
                </span>
              </div>

              {/* 3D Stage Wrapper */}
              <div className="deck-stage-wrapper">
                <button
                  type="button"
                  className="deck-arrow-btn prev"
                  id="btn-deck-prev"
                  aria-label="Previous card"
                  disabled={deckIndex === 0}
                  onClick={() => setDeckIndex((prev) => Math.max(0, prev - 1))}
                >
                  ‹
                </button>

                {/* 3D Viewport with drag */}
                <div
                  id="deck-cards-viewport"
                  className="deck-cards-viewport"
                  onPointerDown={handlePointerDown}
                  onPointerMove={handlePointerMove}
                  onPointerUp={handlePointerUp}
                >
                  <div id="deck-cards-track" className="deck-cards-track">
                    {allDeckCards.map((card, i) => {
                      const offset = i - deckIndex;
                      const absOffset = Math.abs(offset);
                      const dir = offset > 0 ? 1 : -1;

                      // Exact 3D physics transforms from v1_df
                      const translateX = offset * 140;
                      const translateZ = -absOffset * 80;
                      const rotateY = -dir * Math.min(20, absOffset * 10);
                      const scale = Math.max(0.72, 1 - absOffset * 0.07);
                      const opacity = Math.max(0, 1 - absOffset * 0.25);
                      const zIndex = Math.round(100 - absOffset * 10);

                      const dayOfWeek = DAY_NAMES[card.dayObj.getDay()];
                      const monthName = MONTH_NAMES[currentMonth];
                      const hasEntry = card.entries.length > 0;
                      const latest = hasEntry ? card.entries[0] : null;
                      const wordCountNum = latest?.content ? latest.content.trim().split(/\s+/).filter(Boolean).length : 0;

                      return (
                        <div
                          key={card.dateStr}
                          className={`journal-deck-card ${absOffset === 0 ? 'active-card' : ''} ${card.isToday ? 'today-card' : ''}`}
                          style={{
                            transform: `translate(-50%, -50%) translateX(${translateX}px) translateZ(${translateZ}px) rotateY(${rotateY}deg) scale(${scale})`,
                            opacity,
                            zIndex,
                            filter: absOffset > 0.5 ? `blur(${absOffset * 0.5}px)` : 'none',
                          }}
                          onClick={() => {
                            if (!isDraggingRef.current) {
                              setDeckIndex(i);
                              openModalForDate(card.dateStr);
                            }
                          }}
                        >
                          <div className="card-header-row">
                            <div className="card-date-group">
                              <span className="card-date-num">{card.day}</span>
                              <span className="card-date-month">{monthName.substring(0, 3)}</span>
                            </div>
                            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '2px' }}>
                              <span className="card-day-weekday">{dayOfWeek.substring(0, 3)}</span>
                              {card.isToday ? (
                                <span className="card-status-tag is-today">TODAY</span>
                              ) : hasEntry ? (
                                <span className="card-status-tag has-entry">WRITTEN</span>
                              ) : (
                                <span className="card-status-tag is-empty">EMPTY</span>
                              )}
                            </div>
                          </div>

                          {hasEntry ? (
                            <>
                              <div className="card-body-content">
                                <div className="card-entry-title">{latest.title || 'Journal Reflection'}</div>
                                <div className="card-entry-snippet">{latest.content || ''}</div>
                              </div>
                              <div className="card-footer-row">
                                <span className="card-word-count">
                                  {wordCountNum} {wordCountNum === 1 ? 'word' : 'words'}
                                </span>
                                <button
                                  type="button"
                                  className="btn secondary card-action-btn"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    openModalForDate(card.dateStr);
                                  }}
                                >
                                  ✏️ Open Note
                                </button>
                              </div>
                            </>
                          ) : (
                            <>
                              <div className="card-body-content">
                                <div className="card-empty-prompt">
                                  <span className="empty-icon">✍️</span>
                                  <p>No entry for this day.<br />Tap to write reflection.</p>
                                </div>
                              </div>
                              <div className="card-footer-row">
                                <span className="card-word-count">Empty day</span>
                                <button
                                  type="button"
                                  className="btn primary card-action-btn"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    openModalForDate(card.dateStr);
                                  }}
                                >
                                  + Write Note
                                </button>
                              </div>
                            </>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>

                <button
                  type="button"
                  className="deck-arrow-btn next"
                  id="btn-deck-next"
                  aria-label="Next card"
                  disabled={deckIndex >= allDeckCards.length - 1}
                  onClick={() => setDeckIndex((prev) => Math.min(allDeckCards.length - 1, prev + 1))}
                >
                  ›
                </button>
              </div>

              {/* Pagination Dots */}
              <div id="deck-pagination-bar" className="deck-pagination-bar" role="tablist">
                {allDeckCards.map((card, i) => (
                  <button
                    key={card.dateStr}
                    type="button"
                    className={`deck-page-dot ${i === deckIndex ? 'active' : ''} ${card.entries.length > 0 ? 'has-entry' : ''}`}
                    onClick={() => setDeckIndex(i)}
                    title={`Day ${card.day}`}
                  ></button>
                ))}
              </div>
            </div>
          )}
        </div>
      </section>

      {/* ─── Centered Journal Modal ("What's on your mind?") ─────── */}
      {modalOpen && (
        <>
          <div
            id="journal-modal-backdrop"
            className="modal-backdrop active"
            onClick={() => setModalOpen(false)}
          ></div>
          <div id="journal-modal" className="modal-backdrop active" role="dialog" aria-modal="true">
            <div className="scratchpad-modal-card notes-modal-card">
              <button
                type="button"
                className="scratchpad-close-btn"
                id="btn-close-journal-modal"
                aria-label="Close modal"
                onClick={() => setModalOpen(false)}
              >
                ✕
              </button>

              <div className="notes-modal-header">
                <div>
                  <h3 className="notes-modal-heading" id="journal-modal-title">
                    What's on your mind?
                  </h3>
                  <div className="notes-modal-subtitle" id="journal-modal-date">
                    {modalDateFormatted}
                  </div>
                </div>
              </div>

              <form id="journal-form" onSubmit={handleSaveEntry} style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginTop: '8px' }}>
                <div className="notes-modal-body" style={{ marginTop: 0 }}>
                  <input
                    type="text"
                    id="journal-title"
                    className="notes-modal-title-input"
                    placeholder="Title (optional)..."
                    value={entryTitle}
                    onChange={(e) => setEntryTitle(e.target.value)}
                  />
                  <textarea
                    id="journal-content"
                    className="notes-modal-textarea"
                    placeholder="Pour down your thoughts, DSA reflections, breakthroughs, or end-of-day recap..."
                    value={entryContent}
                    autoFocus
                    onChange={(e) => setEntryContent(e.target.value)}
                  ></textarea>
                </div>

                <div className="notes-modal-footer-meta">
                  <div className="scratchpad-meta">
                    <span id="scratchpad-word-count" className="word-count-badge">
                      {wordCount} {wordCount === 1 ? 'word' : 'words'}
                    </span>
                    {draftSaved && (
                      <span className="draft-indicator" id="scratchpad-draft-indicator">
                        Draft saved
                      </span>
                    )}
                  </div>
                  <div className="scratchpad-actions">
                    {activeEntryId && (
                      <button
                        type="button"
                        className="btn danger"
                        id="btn-delete-journal"
                        onClick={handleDeleteEntry}
                      >
                        Delete
                      </button>
                    )}
                    <button
                      type="button"
                      className="btn secondary"
                      id="btn-cancel-journal"
                      onClick={() => setModalOpen(false)}
                    >
                      Cancel
                    </button>
                    <button type="submit" className="btn primary glow" id="btn-save-journal">
                      Save Entry
                    </button>
                  </div>
                </div>
              </form>
            </div>
          </div>
        </>
      )}
    </AppLayout>
  );
}
