import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { useAuth } from './auth/AuthContext';
import { Layout } from './components/Layout';
import { Spinner } from './components/ui';
import { ChannelsPage } from './pages/ChannelsPage';
import { DashboardPage } from './pages/DashboardPage';
import { LoginPage } from './pages/LoginPage';
import { ProgramsPage } from './pages/ProgramsPage';
import { RegionsPage } from './pages/RegionsPage';
import { SchedulePage } from './pages/schedule/SchedulePage';
import { UsersPage } from './pages/UsersPage';

export function App() {
  const { admin, isSuper } = useAuth();
  const location = useLocation();

  // Sessiya tekshirilmoqda (cookie orqali /me)
  if (admin === undefined) {
    return (
      <div className="center-screen">
        <Spinner />
      </div>
    );
  }

  // Kirilmagan — faqat login sahifasi
  if (admin === null) {
    return (
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="*" element={<Navigate to="/login" replace state={{ from: location.pathname }} />} />
      </Routes>
    );
  }

  return (
    <Routes>
      <Route path="/login" element={<Navigate to={(location.state as { from?: string })?.from ?? '/'} replace />} />
      <Route element={<Layout />}>
        <Route index element={<DashboardPage />} />
        <Route path="schedule" element={<SchedulePage />} />
        <Route path="programs" element={<ProgramsPage />} />
        <Route path="channels" element={<ChannelsPage />} />
        {/* Faqat SUPER_ADMIN (backend ham 403 qaytaradi) */}
        {isSuper && <Route path="regions" element={<RegionsPage />} />}
        {isSuper && <Route path="users" element={<UsersPage />} />}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}
