import React from 'react';

const RADIUS = 40;
const CIRCUM = 2 * Math.PI * RADIUS; // ~251.327

export default function StatsGrid({ problems = [] }) {
  const today = new Date();
  const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;

  let todayCount = 0;
  let todaySeconds = 0;
  let totalSeconds = 0;
  let easyCount = 0;
  let mediumCount = 0;
  let hardCount = 0;
  const uniqueDates = new Set();

  problems.forEach((p) => {
    const sec = p.time_seconds || p.timeSeconds || 0;
    if (p.date === todayStr) {
      todayCount++;
      todaySeconds += sec;
    }
    totalSeconds += sec;
    if (p.difficulty === 'Easy') easyCount++;
    else if (p.difficulty === 'Medium') mediumCount++;
    else if (p.difficulty === 'Hard') hardCount++;
    if (p.date) uniqueDates.add(p.date);
  });

  const total = problems.length;

  // Calculate Streak using local midnight
  const sortedDates = Array.from(uniqueDates).sort((a, b) => b.localeCompare(a));
  let streak = 0;
  const todayRef = new Date();
  let checkDate = new Date(todayRef.getFullYear(), todayRef.getMonth(), todayRef.getDate());

  for (let i = 0; i < sortedDates.length; i++) {
    const parts = sortedDates[i].split('-');
    const pDate = new Date(parseInt(parts[0], 10), parseInt(parts[1], 10) - 1, parseInt(parts[2], 10));
    const diffDays = Math.round((checkDate - pDate) / (1000 * 60 * 60 * 24));

    if (diffDays === 0 || diffDays === 1) {
      streak++;
      checkDate = new Date(pDate);
      checkDate.setDate(checkDate.getDate() - 1);
    } else {
      break;
    }
  }

  // Today focus time string
  const todayMinutes = Math.round(todaySeconds / 60);
  const todayFocusStr = todayMinutes >= 60
    ? `${Math.floor(todayMinutes / 60)}h ${todayMinutes % 60}m`
    : `${todayMinutes}m`;

  // Avg time string
  let avgStr = '0m';
  if (total > 0) {
    const avgSecs = Math.round(totalSeconds / total);
    const avgMins = Math.round(avgSecs / 60);
    avgStr = avgMins > 0 ? `${avgMins}m` : `${avgSecs}s`;
  }

  // Ring arc calculations
  let easyDasharray = `0 ${CIRCUM}`;
  let medDasharray = `0 ${CIRCUM}`;
  let hardDasharray = `0 ${CIRCUM}`;
  let medOffset = 0;
  let hardOffset = 0;

  if (total > 0) {
    const lenEasy = (easyCount / total) * CIRCUM;
    const lenMed = (mediumCount / total) * CIRCUM;
    const lenHard = (hardCount / total) * CIRCUM;

    const activeTypes = (easyCount > 0 ? 1 : 0) + (mediumCount > 0 ? 1 : 0) + (hardCount > 0 ? 1 : 0);
    const gap = activeTypes > 1 ? 4 : 0;

    const showLenEasy = lenEasy > 0 ? Math.max(0, lenEasy - gap) : 0;
    const showLenMed = lenMed > 0 ? Math.max(0, lenMed - gap) : 0;
    const showLenHard = lenHard > 0 ? Math.max(0, lenHard - gap) : 0;

    easyDasharray = `${showLenEasy} ${CIRCUM}`;
    medDasharray = `${showLenMed} ${CIRCUM}`;
    hardDasharray = `${showLenHard} ${CIRCUM}`;

    medOffset = -lenEasy;
    hardOffset = -(lenEasy + lenMed);
  }

  return (
    <div className="card stats-grid-card" id="stats-grid-card">
      <div className="eyebrow">Statistics</div>
      <h2>Daily Performance</h2>

      {/* DSA Progress Widget matching v1_df */}
      <div className="dsa-progress-box">
        <div className="dsa-progress-header">
          <span className="dsa-progress-badge">DSA Progress</span>
        </div>
        <div className="dsa-progress-body">
          <div className="dsa-ring-wrapper">
            <svg className="dsa-ring-svg" width="110" height="110" viewBox="0 0 100 100">
              <circle className="dsa-ring-bg" strokeWidth="8" fill="transparent" r={RADIUS} cx="50" cy="50" />
              <circle
                className="dsa-ring-easy"
                id="dsa-arc-easy"
                strokeWidth="8"
                fill="transparent"
                r={RADIUS}
                cx="50"
                cy="50"
                style={{ strokeDasharray: easyDasharray, strokeDashoffset: 0 }}
              />
              <circle
                className="dsa-ring-medium"
                id="dsa-arc-medium"
                strokeWidth="8"
                fill="transparent"
                r={RADIUS}
                cx="50"
                cy="50"
                style={{ strokeDasharray: medDasharray, strokeDashoffset: `${medOffset}px` }}
              />
              <circle
                className="dsa-ring-hard"
                id="dsa-arc-hard"
                strokeWidth="8"
                fill="transparent"
                r={RADIUS}
                cx="50"
                cy="50"
                style={{ strokeDasharray: hardDasharray, strokeDashoffset: `${hardOffset}px` }}
              />
            </svg>
            <div className="dsa-ring-center">
              <span className="dsa-total-num" id="stat-total">{total}</span>
              <span className="dsa-total-line"></span>
              <span className="dsa-total-label">Solved</span>
            </div>
          </div>
          <div className="dsa-diff-list">
            <div className="diff-item">
              <div className="diff-left">
                <span className="diff-dot easy"></span>
                <span className="diff-name">Easy</span>
              </div>
              <span className="diff-val" id="stat-easy">{easyCount}</span>
            </div>
            <div className="diff-item">
              <div className="diff-left">
                <span className="diff-dot medium"></span>
                <span className="diff-name">Medium</span>
              </div>
              <span className="diff-val" id="stat-medium">{mediumCount}</span>
            </div>
            <div className="diff-item">
              <div className="diff-left">
                <span className="diff-dot hard"></span>
                <span className="diff-name">Hard</span>
              </div>
              <span className="diff-val" id="stat-hard">{hardCount}</span>
            </div>
          </div>
        </div>
      </div>

      {/* 4 Stat Boxes matching v1_df */}
      <div className="stats-grid grid-4">
        <div className="stat-box" data-accent="sage">
          <div className="stat-value" id="stat-today">{todayCount}</div>
          <div className="stat-label">Solved Today</div>
        </div>
        <div className="stat-box" data-accent="blue">
          <div className="stat-value" id="stat-time">{todayFocusStr}</div>
          <div className="stat-label">Today's Focus</div>
        </div>
        <div className="stat-box" data-accent="orange">
          <div className="stat-value" id="stat-avg">{avgStr}</div>
          <div className="stat-label">Avg Time</div>
        </div>
        <div className="stat-box" data-accent="orange-deep">
          <div className="stat-value streak" id="stat-streak">{streak}</div>
          <div className="stat-label">Streak (days)</div>
        </div>
      </div>
    </div>
  );
}
