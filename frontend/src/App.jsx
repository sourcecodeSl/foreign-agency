import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, RequireAuth } from './context/AuthContext';
import { ToastProvider } from './components/ui/Toast';
import DashboardLayout from './components/layout/DashboardLayout';

import Login from './pages/auth/Login';
import VerifyPhone from './pages/auth/VerifyPhone';
import VerifyEmail from './pages/auth/VerifyEmail';
import EmailVerification from './pages/auth/EmailVerification';
import Dashboard from './pages/Dashboard';
import CreateAgency from './pages/agency/CreateAgency';
import AgencyList from './pages/agency/AgencyList';
import UsersList from './pages/users/UsersList';
import UserTypes from './pages/users/UserTypes';
import UserPermissions from './pages/users/UserPermissions';

export default function App() {
  return (
    <BrowserRouter>
      <ToastProvider>
        <AuthProvider>
          <Routes>
            {/* Public */}
            <Route path="/login" element={<Login />} />
            <Route path="/verify-phone" element={<VerifyPhone />} />
            <Route path="/verify-email" element={<VerifyEmail />} />

            {/* Protected dashboard */}
            <Route
              element={
                <RequireAuth>
                  <DashboardLayout />
                </RequireAuth>
              }
            >
              <Route path="/dashboard" element={<Dashboard />} />
              <Route path="/agencies" element={<AgencyList />} />
              <Route path="/agencies/create" element={<CreateAgency />} />
              <Route path="/users" element={<UsersList />} />
              <Route path="/users/types" element={<UserTypes />} />
              <Route path="/users/permissions" element={<UserPermissions />} />
              <Route path="/verification/emails" element={<EmailVerification />} />
            </Route>

            <Route path="/" element={<Navigate to="/dashboard" replace />} />
            <Route path="*" element={<Navigate to="/dashboard" replace />} />
          </Routes>
        </AuthProvider>
      </ToastProvider>
    </BrowserRouter>
  );
}
