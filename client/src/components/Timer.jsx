import { useState, useEffect, useRef, useCallback } from 'react';
import api from '../utils/api';

const RADIUS = 96;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

export default function Timer() {
  const [timeLeft, setTimeLeft] = useState(1200);
  const [totalDuration, setTotalDuration] = useState(1200);
  const [lastSetDuration, setLastSetDuration] = useState(1200);
  const [isRunning, setIsRunning] = useState(false);
  const [isBreak, setIsBreak] = useState(false);

  const intervalRef = useRef(null);
  const startTimeRef = useRef(null);
  const timeLeftAtStartRef = useRef(0);
  const syncIntervalRef = useRef(null);

  // Restore timer state from backend
  useEffect(() => {
    async function restore() {
      try {
        const { data } = await api.get('/timer');
        setLastSetDuration(data.lastSetDuration || 1200);
        setTotalDuration(data.totalDuration || 1200);
        setIsBreak(data.isBreak || false);

        if (data.isRunning && data.savedAt) {
          const elapsed = Math.floor((Date.now() - data.savedAt) / 1000);
          const remaining = Math.max(0, data.timeLeft - elapsed);
          setTimeLeft(remaining);
          if (remaining > 0) {
            startTimeRef.current = Date.now();
            timeLeftAtStartRef.current = remaining;
            setIsRunning(true);
          }
        } else {
          setTimeLeft(data.timeLeft || 1200);
        }
      } catch {
        // Backend not available, use defaults
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
    } catch { /* ignore */ }
  }, [timeLeft, totalDuration, lastSetDuration, isRunning, isBreak]);

  // Timer tick
  useEffect(() => {
    if (isRunning) {
      if (!startTimeRef.current) {
        startTimeRef.current = Date.now();
        timeLeftAtStartRef.current = timeLeft;
      }

      intervalRef.current = setInterval(() => {
        const elapsed = Math.floor((Date.now() - startTimeRef.current) / 1000);
        const newTimeLeft = timeLeftAtStartRef.current - elapsed;
        setTimeLeft(Math.max(0, newTimeLeft));

        if (newTimeLeft <= 0) {
          clearInterval(intervalRef.current);
          setIsRunning(false);
          playBell();
        }
      }, 500);

      // Sync every 5s
      syncIntervalRef.current = setInterval(pushToBackend, 5000);
      pushToBackend();

      return () => {
        clearInterval(intervalRef.current);
        clearInterval(syncIntervalRef.current);
      };
    } else {
      startTimeRef.current = null;
    }
  }, [isRunning]);

  // Sync on pause/stop
  useEffect(() => {
    if (!isRunning && timeLeft < (lastSetDuration)) {
      pushToBackend();
    }
  }, [isRunning]);

  function toggle() {
    if (isRunning) {
      setIsRunning(false);
      clearInterval(intervalRef.current);
      clearInterval(syncIntervalRef.current);
      pushToBackend();
    } else {
      startTimeRef.current = Date.now();
      timeLeftAtStartRef.current = timeLeft;
      setIsRunning(true);
    }
  }

  function reset() {
    setIsRunning(false);
    clearInterval(intervalRef.current);
    clearInterval(syncIntervalRef.current);
    startTimeRef.current = null;
    setTimeLeft(lastSetDuration);
    setTotalDuration(lastSetDuration);
    setIsBreak(false);
    pushToBackend();
  }

  function adjustTime(delta) {
    if (isRunning) return;
    const newTime = Math.max(60, timeLeft + delta);
    setTimeLeft(newTime);
    setTotalDuration(newTime);
    setLastSetDuration(newTime);
  }

  function toggleBreak() {
    if (isRunning) return;
    const newIsBreak = !isBreak;
    setIsBreak(newIsBreak);
    const dur = newIsBreak ? 5 * 60 : lastSetDuration;
    setTimeLeft(dur);
    setTotalDuration(dur);
  }

  // Format time
  const minutes = Math.floor(Math.max(0, timeLeft) / 60);
  const seconds = Math.max(0, timeLeft) % 60;
  const display = `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;

  // Ring progress
  const progress = totalDuration > 0 ? timeLeft / totalDuration : 1;
  const offset = CIRCUMFERENCE * (1 - progress);

  return (
    <div className="timer-card card">
      <span className={`eyebrow ${isBreak ? 'break' : 'focus'}`}>
        {isBreak ? 'Break Session' : 'Focus Session'}
      </span>

      <div className="timer-ring-container">
        <svg width="220" height="220" viewBox="0 0 220 220" className="timer-svg">
          <circle
            cx="110" cy="110" r={RADIUS}
            fill="none"
            stroke="var(--hair)"
            strokeWidth="5"
          />
          <circle
            cx="110" cy="110" r={RADIUS}
            fill="none"
            stroke={isBreak ? 'var(--success)' : 'var(--accent)'}
            strokeWidth="5"
            strokeDasharray={CIRCUMFERENCE}
            strokeDashoffset={offset}
            strokeLinecap="round"
            transform="rotate(-90 110 110)"
            className="timer-ring-progress"
          />
        </svg>
        <div className="timer-display">
          <span className="time-text">{display}</span>
        </div>
      </div>

      <div className="timer-controls">
        <button className="btn btn-secondary btn-sm" onClick={() => adjustTime(-5 * 60)} disabled={isRunning}>
          −5
        </button>
        <button className={`btn btn-primary ${isRunning ? 'active' : ''}`} onClick={toggle}>
          {isRunning ? 'Pause' : timeLeft < totalDuration ? 'Resume' : 'Start'}
        </button>
        <button className="btn btn-secondary btn-sm" onClick={() => adjustTime(5 * 60)} disabled={isRunning}>
          +5
        </button>
      </div>

      <div className="timer-actions">
        <button className="btn btn-secondary btn-sm" onClick={reset}>Reset</button>
        <button className={`btn btn-sm ${isBreak ? 'btn-break' : 'btn-secondary'}`} onClick={toggleBreak} disabled={isRunning}>
          {isBreak ? '☕ Break' : '🎯 Focus'}
        </button>
      </div>
    </div>
  );
}

function playBell() {
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
  } catch { /* ignore */ }
}
