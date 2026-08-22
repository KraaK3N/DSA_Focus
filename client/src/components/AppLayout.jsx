import { useState, useEffect } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useTheme } from '../contexts/ThemeContext';
import { useToast } from '../contexts/ToastContext';
import api from '../utils/api';

export default function AppLayout({ children }) {
  const { user, logout } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const { showToast } = useToast();
  const navigate = useNavigate();

  const [dailyGoal, setDailyGoal] = useState(10);
  const [todaySolved, setTodaySolved] = useState(0);
  const [isEditingGoal, setIsEditingGoal] = useState(false);
  const [goalInputVal, setGoalInputVal] = useState(10);

  useEffect(() => {
    async function loadGoalAndProgress() {
      try {
        const [goalRes, probRes] = await Promise.all([
          api.get('/settings/daily_goal').catch(() => null),
          api.get('/problems').catch(() => null),
        ]);

        if (goalRes?.data?.value) {
          const val = parseInt(goalRes.data.value, 10);
          if (!isNaN(val) && val > 0) {
            setDailyGoal(val);
            setGoalInputVal(val);
          }
        }

        if (probRes?.data && Array.isArray(probRes.data)) {
          const today = new Date();
          const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
          const count = probRes.data.filter((p) => p.date === todayStr).length;
          setTodaySolved(count);
        }
      } catch (err) {
        // ignore
      }
    }

    loadGoalAndProgress();
  }, []);

  async function handleSaveGoal() {
    const val = parseInt(goalInputVal, 10);
    if (!isNaN(val) && val > 0) {
      setDailyGoal(val);
      setIsEditingGoal(false);
      try {
        await api.post('/settings/daily_goal', { value: String(val) });
        showToast(`Daily goal updated to ${val} problems!`, 'success');
      } catch (err) {
        // ignore
      }
    } else {
      setIsEditingGoal(false);
      setGoalInputVal(dailyGoal);
    }
  }

  function handleLogout() {
    logout();
    navigate('/login');
  }

  const progressPercent = Math.min((todaySolved / Math.max(1, dailyGoal)) * 100, 100);

  return (
    <div className="app">
      {/* Top Bar matching v1_df */}
      <header className="topbar">
        <div className="wrap header-wrap">
          <div className="header-left">
            <div className="mark">DSA<span>·</span>FOCUS</div>
            <nav className="nav-tabs" role="tablist">
              <NavLink
                to="/dashboard"
                className={({ isActive }) => `tab-btn ${isActive ? 'active' : ''}`}
                role="tab"
              >
                Dashboard
              </NavLink>
              <NavLink
                to="/log"
                className={({ isActive }) => `tab-btn ${isActive ? 'active' : ''}`}
                role="tab"
              >
                Log
              </NavLink>
              <NavLink
                to="/journal"
                className={({ isActive }) => `tab-btn ${isActive ? 'active' : ''}`}
                role="tab"
              >
                Journal
              </NavLink>
            </nav>
          </div>

          <div className="header-right">
            {/* Daily Goal Widget matching v1_df */}
            <div className="progress-container">
              <div className="progress-info">
                <span>
                  Daily Goal{' '}
                  <button
                    type="button"
                    className="btn-edit-goal"
                    id="btn-edit-goal"
                    title="Set daily goal"
                    aria-label="Set daily goal"
                    onClick={() => setIsEditingGoal(true)}
                  >
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M12 20h9"></path>
                      <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"></path>
                    </svg>
                  </button>
                </span>
                <span id="progress-text" className="font-mono">
                  {isEditingGoal ? (
                    <input
                      type="number"
                      className="input-daily-goal"
                      style={{ width: '45px', height: '18px', fontSize: '0.75rem' }}
                      value={goalInputVal}
                      min="1"
                      max="100"
                      autoFocus
                      onChange={(e) => setGoalInputVal(e.target.value)}
                      onBlur={handleSaveGoal}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') handleSaveGoal();
                        if (e.key === 'Escape') {
                          setIsEditingGoal(false);
                          setGoalInputVal(dailyGoal);
                        }
                      }}
                    />
                  ) : (
                    `${todaySolved}/${dailyGoal}`
                  )}
                </span>
              </div>
              <div className="progress-bar-bg">
                <div
                  className="progress-bar-fill"
                  id="daily-progress"
                  style={{ width: `${progressPercent}%` }}
                ></div>
              </div>
            </div>

            {/* Theme Toggle Pill matching v1_df */}
            <button
              type="button"
              className="btn-theme-pill"
              id="btn-theme-toggle"
              aria-label="Toggle dark mode"
              title="Toggle theme"
              onClick={toggleTheme}
            >
              {theme === 'dark' ? (
                <svg className="theme-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="12" cy="12" r="5"></circle>
                  <line x1="12" y1="1" x2="12" y2="3"></line>
                  <line x1="12" y1="21" x2="12" y2="23"></line>
                  <line x1="4.22" y1="4.22" x2="5.64" y2="5.64"></line>
                  <line x1="18.36" y1="18.36" x2="19.78" y2="19.78"></line>
                  <line x1="1" y1="12" x2="3" y2="12"></line>
                  <line x1="21" y1="12" x2="23" y2="12"></line>
                  <line x1="4.22" y1="19.78" x2="5.64" y2="18.36"></line>
                  <line x1="18.36" y1="5.64" x2="19.78" y2="4.22"></line>
                </svg>
              ) : (
                <svg className="theme-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"></path>
                </svg>
              )}
              <span className="theme-text">{theme === 'dark' ? 'Light' : 'Dark'}</span>
            </button>

            {/* User Profile Info & Actions */}
            {user && (
              <div className="header-user-group">
                <div className="user-pill" title={user.email}>
                  {user.avatar_url ? (
                    <img src={user.avatar_url} alt="" className="user-avatar-sm" />
                  ) : (
                    <span className="user-avatar-fallback">
                      {(user.name || user.email || 'U')[0]}
                    </span>
                  )}
                  <span className="user-name-text">{user.name || user.email?.split('@')[0]}</span>
                </div>
                {user.role === 'admin' && (
                  <NavLink to="/admin" className="btn secondary btn-header-action">
                    Admin
                  </NavLink>
                )}
                <button
                  type="button"
                  onClick={handleLogout}
                  className="btn secondary btn-header-action"
                  title="Sign out"
                >
                  Logout
                </button>
              </div>
            )}
          </div>
        </div>
      </header>

      {/* Page Content */}
      {children}

      {/* Footer matching v1_df */}
      <footer>
        <div className="wrap footer-wrap">
          <div>
            <p className="big">DSA Focus Dashboard</p>
            <p>Designed for distraction-free, highly analytical practice sessions. Store data locally and synced to your secure cloud database.</p>
          </div>
          <div className="shortcuts-bar">
            <div className="shortcut"><kbd>Space</kbd> Start/Pause</div>
            <div className="shortcut"><kbd>R</kbd> Reset</div>
            <div className="shortcut"><kbd>N</kbd> New Problem</div>
            <div className="shortcut"><kbd>Ctrl</kbd>+<kbd>S</kbd> Save</div>
          </div>
        </div>
      </footer>
    </div>
  );
}
