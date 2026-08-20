import { useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';

/**
 * Handles the Google OAuth callback redirect.
 * Receives token from URL params, stores it, and redirects to dashboard.
 */
export default function AuthCallbackPage() {
  const [searchParams] = useSearchParams();
  const { handleGoogleCallback } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    const token = searchParams.get('token');
    if (token) {
      handleGoogleCallback(token);
      navigate('/dashboard', { replace: true });
    } else {
      navigate('/login?error=auth_failed', { replace: true });
    }
  }, [searchParams, handleGoogleCallback, navigate]);

  return (
    <div className="loading-screen">
      <div className="loading-spinner" />
      <p>Completing sign in...</p>
    </div>
  );
}
