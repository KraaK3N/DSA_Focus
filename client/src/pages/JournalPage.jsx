import { useState, useEffect, useRef } from 'react';
import api from '../utils/api';
import AppLayout from '../components/AppLayout';

export default function JournalPage() {
  const [journals, setJournals] = useState([]);
  const [loading, setLoading] = useState(true);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [showEditor, setShowEditor] = useState(false);
  const [editingJournal, setEditingJournal] = useState(null);
  const [viewMode, setViewMode] = useState('deck'); // deck | calendar
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0]);

  useEffect(() => {
    fetchJournals();
  }, []);

  async function fetchJournals() {
    try {
      const { data } = await api.get('/journals');
      setJournals(data);
    } catch { /* ignore */ }
    setLoading(false);
  }

  function handleNew() {
    setEditingJournal({
      title: '',
      content: '',
      date: new Date().toISOString().split('T')[0],
    });
    setShowEditor(true);
  }

  function handleEdit(journal) {
    setEditingJournal({ ...journal });
    setShowEditor(true);
  }

  async function handleSave(journal) {
    try {
      await api.post('/journals', journal);
      setShowEditor(false);
      setEditingJournal(null);
      fetchJournals();
    } catch { /* ignore */ }
  }

  async function handleDelete(id) {
    if (!window.confirm('Delete this journal entry?')) return;
    try {
      await api.delete(`/journals/${id}`);
      fetchJournals();
      if (currentIndex >= journals.length - 1) {
        setCurrentIndex(Math.max(0, currentIndex - 1));
      }
    } catch { /* ignore */ }
  }

  function navigateDeck(dir) {
    const newIndex = currentIndex + dir;
    if (newIndex >= 0 && newIndex < journals.length) {
      setCurrentIndex(newIndex);
    }
  }

  if (loading) return <div className="loading-screen"><div className="loading-spinner" /></div>;

  return (
    <AppLayout>
      <div className="journal-page">
        <div className="journal-toolbar">
          <div className="journal-toolbar-left">
            <button
              className={`btn btn-sm ${viewMode === 'deck' ? 'btn-primary' : 'btn-secondary'}`}
              onClick={() => setViewMode('deck')}
            >
              🃏 Deck
            </button>
            <button
              className={`btn btn-sm ${viewMode === 'calendar' ? 'btn-primary' : 'btn-secondary'}`}
              onClick={() => setViewMode('calendar')}
            >
              📅 Calendar
            </button>
          </div>
          <button className="btn btn-primary btn-sm" onClick={handleNew}>
            + New Entry
          </button>
        </div>

        {viewMode === 'deck' ? (
          <DeckView
            journals={journals}
            currentIndex={currentIndex}
            onNavigate={navigateDeck}
            onEdit={handleEdit}
            onDelete={handleDelete}
          />
        ) : (
          <CalendarView
            journals={journals}
            selectedDate={selectedDate}
            onSelectDate={setSelectedDate}
            onEdit={handleEdit}
            onNew={handleNew}
          />
        )}

        {showEditor && (
          <JournalEditor
            journal={editingJournal}
            onSave={handleSave}
            onClose={() => { setShowEditor(false); setEditingJournal(null); }}
          />
        )}
      </div>
    </AppLayout>
  );
}

/* ─── 3D Deck View ───────────────────────── */
function DeckView({ journals, currentIndex, onNavigate, onEdit, onDelete }) {
  const trackRef = useRef(null);
  const [dragStartX, setDragStartX] = useState(null);

  function handlePointerDown(e) {
    setDragStartX(e.clientX);
  }

  function handlePointerUp(e) {
    if (dragStartX === null) return;
    const diff = e.clientX - dragStartX;
    if (Math.abs(diff) > 50) {
      onNavigate(diff > 0 ? -1 : 1);
    }
    setDragStartX(null);
  }

  if (journals.length === 0) {
    return (
      <div className="deck-empty">
        <p>No journal entries yet.</p>
        <p className="muted">Create your first entry to see it here in the 3D deck.</p>
      </div>
    );
  }

  return (
    <div className="deck-container">
      <div className="deck-viewport"
        onPointerDown={handlePointerDown}
        onPointerUp={handlePointerUp}
        ref={trackRef}
      >
        <div className="deck-track">
          {journals.map((j, idx) => {
            const offset = idx - currentIndex;
            const isActive = idx === currentIndex;
            const style = getCardStyle(offset);

            return (
              <div
                key={j.id}
                className={`deck-card ${isActive ? 'active' : ''}`}
                style={style}
                onClick={() => isActive && onEdit(j)}
              >
                <div className="deck-card-date">{j.date}</div>
                <h3 className="deck-card-title">{j.title || 'Untitled'}</h3>
                <p className="deck-card-preview">
                  {(j.content || '').slice(0, 120)}{(j.content || '').length > 120 ? '...' : ''}
                </p>
                {isActive && (
                  <div className="deck-card-actions">
                    <button className="btn btn-sm btn-secondary" onClick={(e) => { e.stopPropagation(); onEdit(j); }}>Edit</button>
                    <button className="btn btn-sm btn-secondary danger-text" onClick={(e) => { e.stopPropagation(); onDelete(j.id); }}>Delete</button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      <div className="deck-nav">
        <button className="deck-arrow-btn" onClick={() => onNavigate(-1)} disabled={currentIndex === 0}>
          ←
        </button>
        <span className="deck-counter">{currentIndex + 1} / {journals.length}</span>
        <button className="deck-arrow-btn" onClick={() => onNavigate(1)} disabled={currentIndex >= journals.length - 1}>
          →
        </button>
      </div>
    </div>
  );
}

function getCardStyle(offset) {
  const absOffset = Math.abs(offset);
  if (absOffset > 3) return { display: 'none' };

  return {
    transform: `translateX(${offset * 60}%) translateZ(${-absOffset * 100}px) rotateY(${offset * -8}deg)`,
    opacity: absOffset > 2 ? 0.3 : absOffset > 1 ? 0.6 : absOffset > 0 ? 0.85 : 1,
    zIndex: 10 - absOffset,
    pointerEvents: offset === 0 ? 'auto' : 'none',
  };
}

/* ─── Calendar View ──────────────────────── */
function CalendarView({ journals, selectedDate, onSelectDate, onEdit, onNew }) {
  const [monthOffset, setMonthOffset] = useState(0);

  const today = new Date();
  const viewDate = new Date(today.getFullYear(), today.getMonth() + monthOffset, 1);
  const year = viewDate.getFullYear();
  const month = viewDate.getMonth();
  const monthName = viewDate.toLocaleDateString('en', { month: 'long', year: 'numeric' });

  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  // Journal dates in this month
  const journalDates = new Set(
    journals
      .filter((j) => j.date && j.date.startsWith(`${year}-${String(month + 1).padStart(2, '0')}`))
      .map((j) => j.date)
  );

  const days = [];
  for (let i = 0; i < firstDay; i++) days.push(null);
  for (let d = 1; d <= daysInMonth; d++) days.push(d);

  const selectedJournals = journals.filter((j) => j.date === selectedDate);

  return (
    <div className="calendar-container">
      <div className="calendar-card card">
        <div className="calendar-header">
          <button className="btn-icon" onClick={() => setMonthOffset((m) => m - 1)}>←</button>
          <h3 className="calendar-month">{monthName}</h3>
          <button className="btn-icon" onClick={() => setMonthOffset((m) => m + 1)}>→</button>
        </div>

        <div className="calendar-grid">
          {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((d) => (
            <div key={d} className="calendar-day-header">{d}</div>
          ))}
          {days.map((day, idx) => {
            if (day === null) return <div key={`e-${idx}`} className="calendar-cell empty" />;
            const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
            const hasEntry = journalDates.has(dateStr);
            const isSelected = dateStr === selectedDate;
            const isToday = dateStr === today.toISOString().split('T')[0];

            return (
              <div
                key={dateStr}
                className={`calendar-cell ${hasEntry ? 'has-entry' : ''} ${isSelected ? 'selected' : ''} ${isToday ? 'today' : ''}`}
                onClick={() => onSelectDate(dateStr)}
              >
                <span className="calendar-day-num">{day}</span>
                {hasEntry && <span className="calendar-dot" />}
              </div>
            );
          })}
        </div>
      </div>

      <div className="calendar-entries card">
        <div className="calendar-entries-header">
          <h3>{selectedDate}</h3>
          <button className="btn btn-primary btn-sm" onClick={onNew}>+ Entry</button>
        </div>
        {selectedJournals.length === 0 ? (
          <p className="muted">No entries for this date.</p>
        ) : (
          selectedJournals.map((j) => (
            <div key={j.id} className="calendar-entry" onClick={() => onEdit(j)}>
              <h4>{j.title || 'Untitled'}</h4>
              <p>{(j.content || '').slice(0, 150)}</p>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

/* ─── Journal Editor Modal ───────────────── */
function JournalEditor({ journal, onSave, onClose }) {
  const [title, setTitle] = useState(journal?.title || '');
  const [content, setContent] = useState(journal?.content || '');
  const [date, setDate] = useState(journal?.date || new Date().toISOString().split('T')[0]);

  function handleSubmit(e) {
    e.preventDefault();
    onSave({
      id: journal?.id,
      title,
      content,
      date,
      timestamp: journal?.timestamp || Date.now(),
      updatedAt: Date.now(),
    });
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content journal-editor" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>{journal?.id ? 'Edit Entry' : 'New Journal Entry'}</h2>
          <button className="btn-icon" onClick={onClose}>✕</button>
        </div>
        <form onSubmit={handleSubmit} className="journal-form">
          <div className="form-row">
            <div className="form-group flex-2">
              <label>Title</label>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="What did you learn today?"
                autoFocus
              />
            </div>
            <div className="form-group">
              <label>Date</label>
              <input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
              />
            </div>
          </div>
          <div className="form-group">
            <label>Content</label>
            <textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder="Reflect on your progress, breakthroughs, or challenges..."
              rows={12}
              className="journal-textarea"
            />
          </div>
          <div className="form-actions">
            <button type="submit" className="btn btn-primary">Save</button>
            <button type="button" className="btn btn-secondary" onClick={onClose}>Cancel</button>
          </div>
        </form>
      </div>
    </div>
  );
}
