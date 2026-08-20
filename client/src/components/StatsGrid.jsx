import { useState, useEffect } from 'react';
import api from '../utils/api';

export default function StatsGrid() {
  const [stats, setStats] = useState({
    totalSolved: 0,
    streak: 0,
    todayCount: 0,
    avgPerDay: 0,
    topTopic: 'N/A',
    totalTime: '0h',
  });

  useEffect(() => {
    async function fetchStats() {
      try {
        const { data: problems } = await api.get('/problems');
        calculateStats(problems);
      } catch { /* ignore */ }
    }
    fetchStats();
  }, []);

  function calculateStats(problems) {
    if (!problems || problems.length === 0) {
      setStats({ totalSolved: 0, streak: 0, todayCount: 0, avgPerDay: 0, topTopic: 'N/A', totalTime: '0h' });
      return;
    }

    const today = new Date().toISOString().split('T')[0];
    const todayCount = problems.filter((p) => p.date === today).length;

    // Calculate streak
    let streak = 0;
    const dates = [...new Set(problems.map((p) => p.date))].sort().reverse();
    const todayDate = new Date(today);

    for (let i = 0; i < dates.length; i++) {
      const expected = new Date(todayDate);
      expected.setDate(expected.getDate() - i);
      const expectedStr = expected.toISOString().split('T')[0];

      if (dates[i] === expectedStr) {
        streak++;
      } else {
        break;
      }
    }

    // Top topic
    const topicCounts = {};
    problems.forEach((p) => {
      topicCounts[p.topic] = (topicCounts[p.topic] || 0) + 1;
    });
    const topTopic = Object.entries(topicCounts).sort((a, b) => b[1] - a[1])[0]?.[0] || 'N/A';

    // Average per day
    if (dates.length > 0) {
      const first = new Date(dates[dates.length - 1]);
      const daysDiff = Math.max(1, Math.ceil((todayDate - first) / 86400000));
      var avgPerDay = (problems.length / daysDiff).toFixed(1);
    } else {
      var avgPerDay = 0;
    }

    // Total time
    const totalSeconds = problems.reduce((sum, p) => sum + (p.time_seconds || p.timeSeconds || 0), 0);
    const hours = Math.floor(totalSeconds / 3600);
    const mins = Math.floor((totalSeconds % 3600) / 60);
    const totalTime = hours > 0 ? `${hours}h ${mins}m` : `${mins}m`;

    setStats({
      totalSolved: problems.length,
      streak,
      todayCount,
      avgPerDay,
      topTopic,
      totalTime,
    });
  }

  return (
    <div className="stats-card card">
      <span className="eyebrow">Statistics</span>
      <div className="stats-grid">
        <div className="stat-box" data-accent="orange">
          <span className="stat-value">{stats.totalSolved}</span>
          <span className="stat-label">Problems Solved</span>
        </div>
        <div className="stat-box" data-accent="sage">
          <span className="stat-value">{stats.streak}</span>
          <span className="stat-label">Day Streak</span>
        </div>
        <div className="stat-box" data-accent="blue">
          <span className="stat-value">{stats.todayCount}</span>
          <span className="stat-label">Today</span>
        </div>
        <div className="stat-box" data-accent="orange-deep">
          <span className="stat-value">{stats.avgPerDay}</span>
          <span className="stat-label">Avg / Day</span>
        </div>
      </div>
      <div className="stats-footer">
        <span className="stat-meta">⏱ {stats.totalTime} total</span>
        <span className="stat-meta">📚 Top: {stats.topTopic}</span>
      </div>
    </div>
  );
}
