import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, RequireAuth, useAuth } from './context/AuthContext';
import { canOpen } from './lib/access';
import { ToastProvider } from './components/ui/Toast';
import DashboardLayout from './components/layout/DashboardLayout';

import Login from './pages/auth/Login';
import ForgotPassword from './pages/auth/ForgotPassword';
import VerifyPhone from './pages/auth/VerifyPhone';
import VerifyEmail from './pages/auth/VerifyEmail';
import EmailVerification from './pages/auth/EmailVerification';
import Dashboard from './pages/Dashboard';
import NoAccess from './pages/NoAccess';
import CreateAgency from './pages/agency/CreateAgency';
import AgencyList from './pages/agency/AgencyList';
import AgencyProfile from './pages/agency/AgencyProfile';
import UsersList from './pages/users/UsersList';
import UserTypes from './pages/users/UserTypes';
import UserPermissions from './pages/users/UserPermissions';
import Coordinators from './pages/users/Coordinators';
import CandidatesList from './pages/candidates/CandidatesList';
import RegisterCandidate from './pages/candidates/RegisterCandidate';
import CandidateDetail from './pages/candidates/CandidateDetail';

/** Sends each role to the screen it belongs on. */
function HomeRedirect() {
  const { homePath } = useAuth();

  return <Navigate to={homePath} replace />;
}

/**
 * Holds a coordinator to the pages the Main Admin opened to them; everyone
 * else passes. The API enforces the same rule either way.
 */
function PageGate({ page, children }) {
  const { admin, homePath } = useAuth();

  return canOpen(admin, page) ? children : <Navigate to={homePath} replace />;
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
              {/* `page` is what a coordinator needs opened; null is never opened to one. */}
              <Route path="/dashboard" element={<PageGate page="dashboard"><Dashboard /></PageGate>} />
              <Route path="/agencies" element={<PageGate page="agencies"><AgencyList /></PageGate>} />
              <Route path="/agencies/create" element={<PageGate page="agencies.create"><CreateAgency /></PageGate>} />
              <Route path="/agency/profile" element={<PageGate page={null}><AgencyProfile /></PageGate>} />
              <Route path="/candidates" element={<PageGate page="candidates"><CandidatesList /></PageGate>} />
              <Route path="/candidates/register" element={<PageGate page={null}><RegisterCandidate /></PageGate>} />
              <Route path="/candidates/:id" element={<PageGate page="candidates"><CandidateDetail /></PageGate>} />
              <Route path="/users" element={<PageGate page={null}><UsersList /></PageGate>} />
              <Route path="/users/types" element={<PageGate page={null}><UserTypes /></PageGate>} />
              <Route path="/users/permissions" element={<PageGate page={null}><UserPermissions /></PageGate>} />
              <Route path="/users/coordinators" element={<PageGate page={null}><Coordinators /></PageGate>} />
              <Route path="/verification/emails" element={<PageGate page="verification"><EmailVerification /></PageGate>} />
              <Route path="/no-access" element={<NoAccess />} />
            </Route>

            <Route path="/" element={<HomeRedirect />} />
            <Route path="*" element={<HomeRedirect />} />
          </Routes>
        </AuthProvider>
      </ToastProvider>
    </BrowserRouter>
  );
}
