import { NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useTheme } from '../contexts/ThemeContext';

export default function AppLayout({ children }) {
  const { user, logout } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const navigate = useNavigate();

  function handleLogout() {
    logout();
    navigate('/login');
  }

  return (
    <div className="app">
      <header className="topbar">
        <div className="header-left">
          <div className="mark">DSA<span>·</span>FOCUS</div>
          <nav className="nav-tabs">
            <NavLink to="/dashboard" className={({ isActive }) => `tab-btn ${isActive ? 'active' : ''}`}>
              Dashboard
            </NavLink>
            <NavLink to="/log" className={({ isActive }) => `tab-btn ${isActive ? 'active' : ''}`}>
              Log
            </NavLink>
            <NavLink to="/journal" className={({ isActive }) => `tab-btn ${isActive ? 'active' : ''}`}>
              Journal
            </NavLink>
          </nav>
        </div>
        <div className="header-right">
          <button className="btn-icon theme-toggle" onClick={toggleTheme} title={`Switch to ${theme === 'light' ? 'dark' : 'light'} mode`}>
            {theme === 'light' ? '🌙' : '☀️'}
          </button>
          <span className="user-name">{user?.name}</span>
          {user?.role === 'admin' && (
            <NavLink to="/admin" className="btn btn-secondary btn-sm">Admin</NavLink>
          )}
          <button onClick={handleLogout} className="btn btn-secondary btn-sm">
            Logout
          </button>
        </div>
      </header>
      {children}
    </div>
  );
}
