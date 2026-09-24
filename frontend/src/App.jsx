import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, RequireAuth, useAuth } from './context/AuthContext';
import { canOpen } from './lib/access';
import { ToastProvider } from './components/ui/Toast';
import TopLoader from './components/ui/TopLoader';
import DashboardLayout from './components/layout/DashboardLayout';

import Login from './pages/auth/Login';
import ForgotPassword from './pages/auth/ForgotPassword';
import Register from './pages/auth/Register';
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
import CandidateList from './pages/candidates/CandidateList';
import CompanyCandidates from './pages/candidates/CompanyCandidates';
import RegisterCandidate from './pages/candidates/RegisterCandidate';
import CandidateDetail from './pages/candidates/CandidateDetail';
import Appearance from './pages/settings/Appearance';
import { AppearanceProvider } from './context/AppearanceContext';
import Agreements from './pages/agreements/Agreements';
import AgreementEditor from './pages/agreements/AgreementEditor';
import EmployerAgreement from './pages/agreements/EmployerAgreement';

/**
 * A foreign company reads the candidates local agencies registered for its
 * test; everybody else reads the files of one agency.
 */
function CandidatesHome() {
  const { admin } = useAuth();

  return admin?.agency?.type === 'foreign' ? <CompanyCandidates /> : <CandidatesList />;
}

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

/**
 * The agreements: the Main Admin, a coordinator the page is opened to, a
 * foreign company (its own), and a local agency (those sent to it). The API
 * holds each to its own too.
 */
function AgreementsGate({ children }) {
  const { admin, homePath } = useAuth();
  const allowed =
    admin?.roleSlug === 'main_admin' ||
    (admin?.roleSlug === 'coordinator' && canOpen(admin, 'agreements')) ||
    Boolean(admin?.agency);

  return allowed ? children : <Navigate to={homePath} replace />;
}

/** A foreign company's own login: the employer part of the agreement is theirs to submit. */
function ForeignCompanyGate({ children }) {
  const { admin, homePath } = useAuth();

  return admin?.agency?.type === 'foreign' ? children : <Navigate to={homePath} replace />;
}

export default function App() {
  return (
    <BrowserRouter>
      <ToastProvider>
        <TopLoader />
        <AuthProvider>
          {/* The signed-in person's own look, on every screen. */}
          <AppearanceProvider>
            <Routes>
              {/* Public */}
              <Route path="/login" element={<Login />} />
              <Route path="/forgot-password" element={<ForgotPassword />} />
              {/* An agency applies for itself; the admin approves and issues the login. */}
              <Route path="/register" element={<Register />} />
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
                <Route path="/candidates" element={<PageGate page="candidates"><CandidatesHome /></PageGate>} />
                <Route path="/candidates/all" element={<PageGate page="candidates"><CandidateList /></PageGate>} />
                {/* One company's own candidates, where its results are recorded. */}
                <Route path="/companies/candidates" element={<PageGate page="companies"><CompanyCandidates /></PageGate>} />
                <Route path="/candidates/register" element={<PageGate page="candidates"><RegisterCandidate /></PageGate>} />
                <Route path="/candidates/:id" element={<PageGate page="candidates"><CandidateDetail /></PageGate>} />
                <Route path="/users" element={<PageGate page={null}><UsersList /></PageGate>} />
                <Route path="/users/types" element={<PageGate page={null}><UserTypes /></PageGate>} />
                <Route path="/users/permissions" element={<PageGate page={null}><UserPermissions /></PageGate>} />
                <Route path="/users/coordinators" element={<PageGate page={null}><Coordinators /></PageGate>} />
                <Route path="/verification/emails" element={<PageGate page="verification"><EmailVerification /></PageGate>} />
                <Route path="/agreements" element={<AgreementsGate><Agreements /></AgreementsGate>} />
                <Route path="/agreements/:id" element={<AgreementsGate><AgreementEditor /></AgreementsGate>} />
                <Route path="/employer-agreement" element={<ForeignCompanyGate><EmployerAgreement /></ForeignCompanyGate>} />
                <Route path="/no-access" element={<NoAccess />} />
                {/* Every login sets its own look, whatever pages it is given. */}
                <Route path="/settings/appearance" element={<Appearance />} />
              </Route>

              <Route path="/" element={<HomeRedirect />} />
              <Route path="*" element={<HomeRedirect />} />
            </Routes>
          </AppearanceProvider>
        </AuthProvider>
      </ToastProvider>
    </BrowserRouter>
  );
}
