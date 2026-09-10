import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, RequireAuth, useAuth } from './context/AuthContext';
import { ToastProvider } from './components/ui/Toast';
import DashboardLayout from './components/layout/DashboardLayout';

import Login from './pages/auth/Login';
import ForgotPassword from './pages/auth/ForgotPassword';
import VerifyPhone from './pages/auth/VerifyPhone';
import VerifyEmail from './pages/auth/VerifyEmail';
import EmailVerification from './pages/auth/EmailVerification';
import Dashboard from './pages/Dashboard';
import CreateAgency from './pages/agency/CreateAgency';
import AgencyList from './pages/agency/AgencyList';
import AgencyProfile from './pages/agency/AgencyProfile';
import UsersList from './pages/users/UsersList';
import UserTypes from './pages/users/UserTypes';
import UserPermissions from './pages/users/UserPermissions';
import CandidatesList from './pages/candidates/CandidatesList';
import RegisterCandidate from './pages/candidates/RegisterCandidate';
import CandidateDetail from './pages/candidates/CandidateDetail';

/** Sends each role to the screen it belongs on. */
function HomeRedirect() {
  const { homePath } = useAuth();

  return <Navigate to={homePath} replace />;
}

export default function App() {
  return (
    <BrowserRouter>
      <ToastProvider>
        <AuthProvider>
          <Routes>
            {/* Public */}
            <Route path="/login" element={<Login />} />
            <Route path="/forgot-password" element={<ForgotPassword />} />
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
              <Route path="/agency/profile" element={<AgencyProfile />} />
              <Route path="/candidates" element={<CandidatesList />} />
              <Route path="/candidates/register" element={<RegisterCandidate />} />
              <Route path="/candidates/:id" element={<CandidateDetail />} />
              <Route path="/users" element={<UsersList />} />
              <Route path="/users/types" element={<UserTypes />} />
              <Route path="/users/permissions" element={<UserPermissions />} />
              <Route path="/verification/emails" element={<EmailVerification />} />
            </Route>

            <Route path="/" element={<HomeRedirect />} />
            <Route path="*" element={<HomeRedirect />} />
          </Routes>
        </AuthProvider>
      </ToastProvider>
    </BrowserRouter>
  );
}
