import { useState, useEffect, useRef, useCallback } from 'react';
import api from '../utils/api';

const RADIUS = 96;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS; // ~603.185

const MOTIVATIONAL_QUOTES = [
  "Take a hint. Don't waste another 30 minutes.",
  "Progress beats perfection.",
  "Pattern recognition comes from repetition.",
  "Learn, implement, move on.",
  "Interviews reward speed of recognition.",
  "Stay focused and trust the process.",
  "Small daily improvements over time lead to stunning results."
];

function playBellSound() {
  try {
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    if (!AudioContext) return;
    const ctx = new AudioContext();
    const now = ctx.currentTime;

    const frequencies = [880, 1200, 1500, 2000];
    const gains = [0.25, 0.1, 0.05, 0.02];

    frequencies.forEach((freq, idx) => {
      const osc = ctx.createOscillator();
      const gainNode = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, now);
      gainNode.gain.setValueAtTime(gains[idx], now);
      gainNode.gain.exponentialRampToValueAtTime(0.00001, now + 2.0);
      osc.connect(gainNode);
      gainNode.connect(ctx.destination);
      osc.start(now);
      osc.stop(now + 2.0);
    });
  } catch (e) {
    // ignore audio errors
  }
}

export default function Timer() {
  const defaultFocus = 20 * 60;
  const defaultBreak = 5 * 60;

  const [timeLeft, setTimeLeft] = useState(defaultFocus);
  const [totalDuration, setTotalDuration] = useState(defaultFocus);
  const [lastSetDuration, setLastSetDuration] = useState(defaultFocus);
  const [isRunning, setIsRunning] = useState(false);
  const [isBreak, setIsBreak] = useState(false);
  const [isPomodoro, setIsPomodoro] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [quote, setQuote] = useState(MOTIVATIONAL_QUOTES[0]);

  const intervalRef = useRef(null);
  const startTimeRef = useRef(null);
  const timeLeftAtStartRef = useRef(0);
  const syncIntervalRef = useRef(null);

  // Restore timer state from backend on mount
  useEffect(() => {
    async function restore() {
      try {
        const { data } = await api.get('/timer');
        if (data) {
          const lsd = data.lastSetDuration || defaultFocus;
          const tot = data.totalDuration || lsd;
          const brk = Boolean(data.isBreak);
          setLastSetDuration(lsd);
          setTotalDuration(tot);
          setIsBreak(brk);

          if (data.isRunning && data.savedAt) {
            const elapsed = Math.floor((Date.now() - data.savedAt) / 1000);
            const remaining = data.timeLeft - elapsed;
            if (remaining > 0) {
              setTimeLeft(remaining);
              startTimeRef.current = Date.now();
              timeLeftAtStartRef.current = remaining;
              setIsRunning(true);
            } else {
              setTimeLeft(0);
            }
          } else {
            setTimeLeft(typeof data.timeLeft === 'number' ? data.timeLeft : lsd);
          }
        }
      } catch (err) {
        // use defaults
      }
    }
    restore();
  }, []);

  // Sync to backend
  const pushToBackend = useCallback(async () => {
    try {
      await api.post('/timer', {
        timeLeft,
        totalDuration,
        lastSetDuration,
        isRunning,
        isBreak,
      });
    } catch (err) {
      // ignore
    }
  }, [timeLeft, totalDuration, lastSetDuration, isRunning, isBreak]);

  const triggerAlert = useCallback(() => {
    playBellSound();
    document.body.classList.add('flash');
    setTimeout(() => document.body.classList.remove('flash'), 500);

    const randomQuote = MOTIVATIONAL_QUOTES[Math.floor(Math.random() * MOTIVATIONAL_QUOTES.length)];
    setQuote(randomQuote);
    setShowModal(true);

    if (isPomodoro) {
      // Auto-switch between Focus and Break
      if (!isBreak) {
        setIsBreak(true);
        setTimeLeft(defaultBreak);
        setTotalDuration(defaultBreak);
      } else {
        setIsBreak(false);
        setTimeLeft(lastSetDuration);
        setTotalDuration(lastSetDuration);
      }
    }
  }, [isPomodoro, isBreak, defaultBreak, lastSetDuration]);

  // Main tick loop
  useEffect(() => {
    if (isRunning) {
      if (!startTimeRef.current) {
        startTimeRef.current = Date.now();
        timeLeftAtStartRef.current = timeLeft;
      }

      intervalRef.current = setInterval(() => {
        const secondsElapsed = Math.floor((Date.now() - startTimeRef.current) / 1000);
        const newTimeLeft = timeLeftAtStartRef.current - secondsElapsed;
        setTimeLeft(newTimeLeft);

        if (newTimeLeft <= 0) {
          clearInterval(intervalRef.current);
          setIsRunning(false);
          triggerAlert();
        }
      }, 500);

      clearInterval(syncIntervalRef.current);
      syncIntervalRef.current = setInterval(pushToBackend, 5000);
      pushToBackend();

      return () => {
        clearInterval(intervalRef.current);
        clearInterval(syncIntervalRef.current);
      };
    } else {
      startTimeRef.current = null;
      clearInterval(intervalRef.current);
      clearInterval(syncIntervalRef.current);
    }
  }, [isRunning, triggerAlert, pushToBackend]);

  function toggle() {
    if (isRunning) {
      setIsRunning(false);
      pushToBackend();
    } else {
      if (timeLeft <= 0) {
        const dur = isBreak ? defaultBreak : lastSetDuration;
        setTimeLeft(dur);
        setTotalDuration(dur);
      }
      startTimeRef.current = Date.now();
      timeLeftAtStartRef.current = timeLeft <= 0 ? (isBreak ? defaultBreak : lastSetDuration) : timeLeft;
      setIsRunning(true);
    }
  }

  function reset() {
    setIsRunning(false);
    startTimeRef.current = null;
    const resetTo = isBreak ? defaultBreak : lastSetDuration;
    setTimeLeft(resetTo);
    setTotalDuration(resetTo);
    pushToBackend();
  }

  function adjustTime(seconds) {
    const prev = timeLeft;
    const nextTime = Math.max(60, prev + seconds);
    setTimeLeft(nextTime);

    if (isRunning) {
      timeLeftAtStartRef.current = Math.max(60, timeLeftAtStartRef.current + seconds);
    }

    setTotalDuration((td) => Math.max(60, td + seconds));
    if (!isBreak) {
      setLastSetDuration((lsd) => Math.max(60, lsd + seconds));
    }
    pushToBackend();
  }

  // Calculate formatted text
  const isNegative = timeLeft < 0;
  const absSeconds = Math.abs(timeLeft);
  const m = Math.floor(absSeconds / 60).toString().padStart(2, '0');
  const s = (absSeconds % 60).toString().padStart(2, '0');
  const displayTime = `${isNegative ? '-' : ''}${m}:${s}`;

  // SVG ring stroke dashoffset
  const percent = totalDuration > 0 ? Math.max(0, timeLeft) / totalDuration : 1;
  const offset = CIRCUMFERENCE - (percent * CIRCUMFERENCE);

  return (
    <>
      <div className="card timer-card">
        <div className="timer-header">
          <div>
            <div className={`eyebrow ${isBreak ? 'break' : 'focus'}`} id="session-indicator">
              {isBreak ? 'Break Session' : 'Focus Session'}
            </div>
            <h2>Timer</h2>
          </div>
          <label className="toggle-pomodoro" title="Auto-switch 20m Focus / 5m Break">
            <input
              type="checkbox"
              id="pomodoro-toggle"
              checked={isPomodoro}
              onChange={(e) => setIsPomodoro(e.target.checked)}
            />
            <span className="toggle-slider"></span>
            <span className="toggle-label">Pomodoro</span>
          </label>
        </div>

        <div className="timer-display-container">
          <svg className="progress-ring" width="220" height="220" viewBox="0 0 220 220">
            <circle
              className="progress-ring__bg"
              strokeWidth="6"
              fill="transparent"
              r="96"
              cx="110"
              cy="110"
            />
            <circle
              className="progress-ring__circle"
              id="timer-ring"
              strokeWidth="6"
              fill="transparent"
              r="96"
              cx="110"
              cy="110"
              style={{
                strokeDasharray: CIRCUMFERENCE,
                strokeDashoffset: offset,
              }}
            />
          </svg>
          <div className="time-text" id="countdown-display">
            {displayTime}
          </div>
        </div>

        <div className="timer-controls">
          <button
            type="button"
            className="btn icon-btn"
            id="btn-sub-5"
            title="Sub 5 minutes"
            onClick={() => adjustTime(-5 * 60)}
          >
            −5m
          </button>
          <button
            type="button"
            className={`btn primary large ${isRunning ? 'active' : ''}`}
            id="btn-start-pause"
            onClick={toggle}
          >
            {isRunning ? 'Pause' : timeLeft < totalDuration && timeLeft > 0 ? 'Resume' : 'Start'}
          </button>
          <button
            type="button"
            className="btn secondary large"
            id="btn-reset-timer"
            onClick={reset}
          >
            Reset
          </button>
          <button
            type="button"
            className="btn icon-btn"
            id="btn-add-5"
            title="Add 5 minutes"
            onClick={() => adjustTime(5 * 60)}
          >
            +5m
          </button>
        </div>
      </div>

      {/* Notification Modal matching v1_df */}
      {showModal && (
        <div id="notification-modal" className="modal" role="dialog" aria-modal="true">
          <div className="modal-content">
            <div className="modal-icon">
              <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="var(--accent-primary, #d94a26)" strokeWidth="2">
                <circle cx="12" cy="12" r="10"></circle>
                <polyline points="12 6 12 12 16 14"></polyline>
              </svg>
            </div>
            <h2>Time's Up!</h2>
            <p id="motivational-quote">"{quote}"</p>
            <p className="sub-text">Either take a hint or move on to the next step.</p>
            <button
              type="button"
              className="btn primary"
              id="btn-close-modal"
              onClick={() => setShowModal(false)}
            >
              Continue
            </button>
          </div>
        </div>
      )}
    </>
  );
}
