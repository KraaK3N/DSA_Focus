import { useState, useEffect } from 'react';
import api from '../utils/api';

export default function Scratchpad() {
  const [content, setContent] = useState('');
  const [saved, setSaved] = useState(true);
  const saveTimeoutRef = { current: null };

  useEffect(() => {
    async function load() {
      try {
        const { data } = await api.get('/settings/scratchpad');
        if (data.value) setContent(data.value);
      } catch { /* ignore */ }
    }
    load();
  }, []);

  function handleChange(e) {
    setContent(e.target.value);
    setSaved(false);

    // Auto-save after 1s of inactivity
    clearTimeout(saveTimeoutRef.current);
    saveTimeoutRef.current = setTimeout(async () => {
      try {
        await api.post('/settings/scratchpad', { value: e.target.value });
        setSaved(true);
      } catch { /* ignore */ }
    }, 1000);
  }

  function handleClear() {
    setContent('');
    api.post('/settings/scratchpad', { value: '' }).catch(() => {});
    setSaved(true);
  }

  return (
    <div className="scratchpad-card card">
      <div className="scratchpad-header">
        <span className="eyebrow">Scratchpad</span>
        <div className="scratchpad-actions">
          <span className={`save-indicator ${saved ? 'saved' : 'unsaved'}`}>
            {saved ? '✓ Saved' : '● Unsaved'}
          </span>
          <button className="btn btn-secondary btn-xs" onClick={handleClear}>
            Clear
          </button>
        </div>
      </div>
      <textarea
        className="scratchpad-textarea"
        value={content}
        onChange={handleChange}
        placeholder="What's on your mind? Jot pseudo-code, complexity notes, or ideas..."
        spellCheck={false}
      />
    </div>
  );
}
