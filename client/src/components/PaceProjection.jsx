import { useState, useEffect } from 'react';
import { useToast } from '../contexts/ToastContext';
import api from '../utils/api';

export default function PaceProjection({ problems = [] }) {
  const { showToast } = useToast();

  const [targetTotal, setTargetTotal] = useState(474);
  const [externalOffset, setExternalOffset] = useState(0);
  const [windowDays, setWindowDays] = useState(7);
  const [isWeighted, setIsWeighted] = useState(false);

  const [isEditingTarget, setIsEditingTarget] = useState(false);
  const [targetInputVal, setTargetInputVal] = useState(474);

  const [isEditingSolved, setIsEditingSolved] = useState(false);
  const [solvedInputVal, setSolvedInputVal] = useState(0);

  // Load pace settings from backend
  useEffect(() => {
    async function loadSettings() {
      try {
        const [targetRes, windowRes, weightedRes, offsetRes] = await Promise.all([
          api.get('/settings/target_total_problems').catch(() => null),
          api.get('/settings/pace_window_days').catch(() => null),
          api.get('/settings/pace_weighted_mode').catch(() => null),
          api.get('/settings/external_solved_offset').catch(() => null),
        ]);

        if (targetRes?.data?.value) {
          const t = parseInt(targetRes.data.value, 10);
          if (!isNaN(t) && t > 0) {
            setTargetTotal(t);
            setTargetInputVal(t);
          }
        }
        if (windowRes?.data?.value) {
          const w = parseInt(windowRes.data.value, 10);
          if (w === 7 || w === 14) setWindowDays(w);
        }
        if (weightedRes?.data?.value) {
          setIsWeighted(weightedRes.data.value === 'true');
        }
        if (offsetRes?.data?.value) {
          const off = parseInt(offsetRes.data.value, 10);
          if (!isNaN(off)) setExternalOffset(off);
        }
      } catch (err) {
        // use defaults
      }
    }
    loadSettings();
  }, []);

  const dbLogged = problems.length;
  const totalSolved = Math.max(0, dbLogged + (externalOffset || 0));
  const remaining = Math.max(0, targetTotal - totalSolved);
  const percent = Math.min(100, (totalSolved / Math.max(1, targetTotal)) * 100);

  // Rolling velocity calculation
  const now = new Date();
  now.setHours(23, 59, 59, 999);
  const windowStart = new Date(now);
  windowStart.setDate(windowStart.getDate() - windowDays);
  windowStart.setHours(0, 0, 0, 0);

  let countInWindow = 0;
  let weightedPointsInWindow = 0;
  let totalWeightedPointsAllTime = 0;

  problems.forEach((p) => {
    const diff = (p.difficulty || 'Medium').toLowerCase();
    let weight = 1.5;
    if (diff === 'easy') weight = 1.0;
    else if (diff === 'hard') weight = 2.5;

    totalWeightedPointsAllTime += weight;

    if (p.date) {
      const pDate = new Date(p.date + 'T00:00:00');
      if (pDate >= windowStart && pDate <= now) {
        countInWindow++;
        weightedPointsInWindow += weight;
      }
    }
  });

  const dailyVelocity = countInWindow / windowDays;
  const weeklyVelocity = dailyVelocity * 7;

  const dailyWeightedVelocity = weightedPointsInWindow / windowDays;
  const weeklyWeightedVelocity = dailyWeightedVelocity * 7;

  // Velocity display text
  const velocityValStr = isWeighted
    ? `${weeklyWeightedVelocity.toFixed(1)} pts/wk`
    : `${weeklyVelocity.toFixed(1)} / wk`;

  const perDayStr = isWeighted
    ? `${dailyWeightedVelocity.toFixed(1)} pts/day`
    : `${dailyVelocity.toFixed(1)} / day`;
  const velocityLabelStr = `${perDayStr} (${windowDays}d window${isWeighted ? ', Weighted' : ''})`;

  // Time remaining and projected completion date
  let daysRemaining = 0;
  let weeksRemaining = 0;
  let dateStr = 'N/A';
  let dateLabel = 'Est. Completion Date';
  let timeSubText = '0 days remaining';
  let timeValStr = 'N/A';

  if (totalSolved >= targetTotal) {
    timeValStr = 'Goal Met!';
    timeSubText = '0 days remaining';
    dateStr = 'Completed!';
    dateLabel = 'All target problems solved';
  } else if (!isWeighted) {
    if (dailyVelocity > 0) {
      daysRemaining = remaining / dailyVelocity;
      weeksRemaining = daysRemaining / 7;
      const estDate = new Date();
      estDate.setDate(estDate.getDate() + Math.round(daysRemaining));
      dateStr = estDate.toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
      });
      timeSubText = `${Math.round(daysRemaining)} days remaining`;
      timeValStr = `~${weeksRemaining.toFixed(1)} wks`;
    } else {
      dateStr = 'Solve to estimate';
      timeSubText = 'No recent activity';
    }
  } else {
    // Weighted mode
    const avgWeightAllTime = dbLogged > 0 ? totalWeightedPointsAllTime / dbLogged : 1.6;
    const remainingWeightedPoints = remaining * avgWeightAllTime;

    if (dailyWeightedVelocity > 0) {
      daysRemaining = remainingWeightedPoints / dailyWeightedVelocity;
      weeksRemaining = daysRemaining / 7;
      const estDate = new Date();
      estDate.setDate(estDate.getDate() + Math.round(daysRemaining));
      dateStr = estDate.toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
      });
      timeSubText = `${Math.round(daysRemaining)} days (Weighted effort)`;
      timeValStr = `~${weeksRemaining.toFixed(1)} wks`;
    } else {
      dateStr = 'Solve to estimate';
      timeSubText = 'No recent activity';
    }
  }

  async function handleSaveTargetTotal() {
    const val = parseInt(targetInputVal, 10);
    if (!isNaN(val) && val > 0) {
      setTargetTotal(val);
      setIsEditingTarget(false);
      try {
        await api.post('/settings/target_total_problems', { value: String(val) });
        showToast(`Sheet target updated to ${val} problems!`, 'success');
      } catch (err) {}
    } else {
      setIsEditingTarget(false);
      setTargetInputVal(targetTotal);
    }
  }

  async function handleSaveSolvedCount() {
    const val = parseInt(solvedInputVal, 10);
    if (!isNaN(val) && val >= 0) {
      const newOffset = val - dbLogged;
      setExternalOffset(newOffset);
      setIsEditingSolved(false);
      try {
        await api.post('/settings/external_solved_offset', { value: String(newOffset) });
        showToast(`Actual solved count set to ${val} problems!`, 'success');
      } catch (err) {}
    } else {
      setIsEditingSolved(false);
    }
  }

  async function handleToggleWindow(days) {
    setWindowDays(days);
    try {
      await api.post('/settings/pace_window_days', { value: String(days) });
    } catch (err) {}
  }

  async function handleToggleWeighted(checked) {
    setIsWeighted(checked);
    try {
      await api.post('/settings/pace_weighted_mode', { value: String(checked) });
    } catch (err) {}
  }

  return (
    <section className="wrap pace-section" id="pace-section">
      <div className="card pace-card" id="pace-projection-card">
        <div className="pace-card-header">
          <div className="pace-header-title">
            <div className="eyebrow">DSA Sheet Tracker</div>
            <h2>Pace & Completion Projection</h2>
            <p className="pace-header-summary">
              A clear view of how your current solving rhythm maps to the full sheet.
            </p>
          </div>

          <div className="pace-header-controls">
            <div className="pace-window-toggle" role="group" aria-label="Velocity Calculation Window">
              <button
                type="button"
                className={`pace-toggle-btn ${windowDays === 7 ? 'active' : ''}`}
                id="btn-pace-7d"
                onClick={() => handleToggleWindow(7)}
              >
                7 Days
              </button>
              <button
                type="button"
                className={`pace-toggle-btn ${windowDays === 14 ? 'active' : ''}`}
                id="btn-pace-14d"
                onClick={() => handleToggleWindow(14)}
              >
                14 Days
              </button>
            </div>

            <label
              className="checkbox-label pace-weighted-label"
              htmlFor="chk-pace-weighted"
              title="Weighted mode factors in Easy (1.0x), Medium (1.5x), Hard (2.5x) difficulty weights"
            >
              <input
                type="checkbox"
                id="chk-pace-weighted"
                checked={isWeighted}
                onChange={(e) => handleToggleWeighted(e.target.checked)}
              />
              <span>Smart Weighted Pace</span>
            </label>
          </div>
        </div>

        {/* Target Progress Line */}
        <div className="pace-progress-container">
          <div className="pace-progress-info">
            <div className="pace-progress-context">
              <span className="pace-progress-overline">Overall completion</span>
              <div className="pace-progress-text">
                <span className="pace-progress-title">Target progress</span>
                <span id="pace-solved-display" className="pace-count-highlight">
                  {isEditingSolved ? (
                    <input
                      type="number"
                      className="input-daily-goal"
                      style={{ width: '64px', height: '20px', fontSize: '0.8rem' }}
                      value={solvedInputVal}
                      min="0"
                      max="5000"
                      autoFocus
                      onChange={(e) => setSolvedInputVal(e.target.value)}
                      onBlur={handleSaveSolvedCount}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') handleSaveSolvedCount();
                        if (e.key === 'Escape') setIsEditingSolved(false);
                      }}
                    />
                  ) : (
                    <strong id="pace-solved-count">{totalSolved}</strong>
                  )}
                </span>
                {!isEditingSolved && (
                  <button
                    type="button"
                    className="btn-edit-goal"
                    id="btn-edit-solved-count"
                    title="Set baseline total solved problems count"
                    aria-label="Set baseline total solved problems count"
                    onClick={() => {
                      setSolvedInputVal(totalSolved);
                      setIsEditingSolved(true);
                    }}
                  >
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M12 20h9"></path>
                      <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"></path>
                    </svg>
                  </button>
                )}
                <span className="pace-divider">/</span>
                <span id="pace-target-display" className="pace-count-highlight">
                  {isEditingTarget ? (
                    <input
                      type="number"
                      className="input-daily-goal"
                      style={{ width: '64px', height: '20px', fontSize: '0.8rem' }}
                      value={targetInputVal}
                      min="1"
                      max="5000"
                      autoFocus
                      onChange={(e) => setTargetInputVal(e.target.value)}
                      onBlur={handleSaveTargetTotal}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') handleSaveTargetTotal();
                        if (e.key === 'Escape') {
                          setIsEditingTarget(false);
                          setTargetInputVal(targetTotal);
                        }
                      }}
                    />
                  ) : (
                    <strong id="pace-target-count">{targetTotal}</strong>
                  )}
                </span>
                {!isEditingTarget && (
                  <button
                    type="button"
                    className="btn-edit-goal"
                    id="btn-edit-target-total"
                    title="Set target total problems goal"
                    aria-label="Set target total problems goal"
                    onClick={() => {
                      setTargetInputVal(targetTotal);
                      setIsEditingTarget(true);
                    }}
                  >
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M12 20h9"></path>
                      <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"></path>
                    </svg>
                  </button>
                )}
                <span className="pace-subtext">
                  problems solved · <span id="pace-percent">{percent.toFixed(1)}%</span>
                </span>
              </div>
            </div>
            <div className="pace-progress-side">
              <span className="pace-remaining-badge" id="pace-remaining-badge">
                {remaining} remaining
              </span>
            </div>
          </div>
          <div className="progress-bar-bg pace-bar-bg">
            <div
              className="progress-bar-fill pace-bar-fill"
              id="pace-progress-fill"
              style={{ width: `${percent}%` }}
            ></div>
          </div>
        </div>

        {/* Pace & Projection Metrics Grid */}
        <div className="pace-metrics-grid">
          <div className="pace-metric-box pace-metric-velocity">
            <div className="pace-metric-icon">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"></polygon>
              </svg>
            </div>
            <div className="pace-metric-body">
              <div className="pace-metric-kicker">Current pace</div>
              <div className="pace-metric-val" id="pace-velocity-val">
                {velocityValStr}
              </div>
              <div className="pace-metric-label" id="pace-velocity-label">
                {velocityLabelStr}
              </div>
            </div>
          </div>

          <div className="pace-metric-box pace-metric-time">
            <div className="pace-metric-icon">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="10"></circle>
                <polyline points="12 6 12 12 16 14"></polyline>
              </svg>
            </div>
            <div className="pace-metric-body">
              <div className="pace-metric-kicker">Time remaining</div>
              <div className="pace-metric-val" id="pace-time-val">
                {timeValStr}
              </div>
              <div className="pace-metric-label" id="pace-time-label">
                {timeSubText}
              </div>
            </div>
          </div>

          <div className="pace-metric-box pace-metric-date">
            <div className="pace-metric-icon">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect>
                <line x1="16" y1="2" x2="16" y2="6"></line>
                <line x1="8" y1="2" x2="8" y2="6"></line>
                <line x1="3" y1="10" x2="21" y2="10"></line>
              </svg>
            </div>
            <div className="pace-metric-body">
              <div className="pace-metric-kicker">Finish line</div>
              <div className="pace-metric-val" id="pace-date-val">
                {dateStr}
              </div>
              <div className="pace-metric-label" id="pace-date-label">
                {dateLabel}
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
