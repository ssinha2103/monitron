import { Navigate, Outlet, Route, Routes, useLocation, useNavigate, BrowserRouter } from 'react-router-dom';

import { AuthProvider, useAuth } from './context/AuthContext';
import DashboardPage from './pages/DashboardPage';
import AdminPage from './pages/AdminPage';
import LoginPage from './pages/LoginPage';
import RegisterPage from './pages/RegisterPage';
import ForgotPasswordPage from './pages/ForgotPasswordPage';
import ResetPasswordPage from './pages/ResetPasswordPage';

function ProtectedRoute({ admin }: { admin?: boolean }) {
  const { user, loading } = useAuth();
  const location = useLocation();

  if (loading) {
    return <div className="empty-state">Loading…</div>;
  }

  if (!user) {
    return <Navigate to="/login" replace state={{ from: location }} />;
  }

  if (admin && user.role !== 'admin') {
    return <Navigate to="/" replace />;
  }

  return <Outlet />;
}

function AppLayout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  return (
    <div className="app-frame">
      <nav className="app-nav">
        <div className="nav-left">
          <span className="nav-logo">Monitron</span>
        </div>
        <div className="nav-right">
          <button className="nav-link" onClick={() => navigate('/')}>Dashboard</button>
          {user?.role === 'admin' ? (
            <button className="nav-link" onClick={() => navigate('/admin')}>
              Admin
            </button>
          ) : null}
          <button className="nav-link" onClick={handleLogout}>
            Logout
          </button>
        </div>
      </nav>
      <main className="app-main">
        <Outlet />
      </main>
    </div>
  );
}

function AuthRoutes() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/register" element={<RegisterPage />} />
      <Route path="/forgot" element={<ForgotPasswordPage />} />
      <Route path="/reset" element={<ResetPasswordPage />} />
      <Route element={<ProtectedRoute />}>
        <Route element={<AppLayout />}>
          <Route index element={<DashboardPage />} />
          <Route element={<ProtectedRoute admin />}>
            <Route path="admin" element={<AdminPage />} />
          </Route>
        </Route>
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <AuthRoutes />
      </AuthProvider>
    </BrowserRouter>
  );
}
