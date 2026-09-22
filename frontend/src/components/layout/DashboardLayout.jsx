import { useState } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import Sidebar from './Sidebar';
import Topbar from './Topbar';
import { useAuth } from '../../context/AuthContext';
import PdfViewerHost from '../../pages/agreements/PdfViewer';

// Header copy per route, so the topbar always reflects the current screen.
const PAGE_META = [
  { match: /^\/dashboard/, title: 'Dashboard', subtitle: 'Overview of agencies, users and activity' },
  { match: /^\/agreements\/\d+/, title: 'Employment Agreement', subtitle: 'The employer part in English, Hebrew and Sinhala' },
  { match: /^\/agreements/, title: 'Employment Agreements', subtitle: 'Agreements from foreign companies, in English, Hebrew and Sinhala' },
  { match: /^\/agency\/profile/, title: 'Agency Details', subtitle: 'Your agency details and the phone and email used to sign in' },
  { match: /^\/agencies\/create/, title: 'Create Agency', subtitle: 'Register a local or foreign company and issue its login' },
  { match: /^\/agencies/, title: 'Agency Management', subtitle: 'Review pending, active and deactivated agencies' },
  { match: /^\/candidates\/all/, title: 'Candidate List', subtitle: 'Every candidate across all agencies, and where each one stands' },
  { match: /^\/candidates\/register/, title: 'Register Candidate', subtitle: 'Capture the candidate details; documents follow once they pass' },
  { match: /^\/candidates\/\d+/, title: 'Candidate File', subtitle: 'Details and attached documents' },
  // Wording that holds for both readers: an agency sees its own, the admin
  // picks whose to look at. The card below carries the role-specific line.
  { match: /^\/candidates/, title: 'Candidates', subtitle: 'Registered candidate files' },
  { match: /^\/users\/types/, title: 'User Types & Roles', subtitle: 'Define the roles available across the system' },
  { match: /^\/users\/permissions/, title: 'User Permissions', subtitle: 'Assign access rights to each user type' },
  { match: /^\/users\/coordinators/, title: 'Coordinators & Access', subtitle: 'Add people to help run the system and choose the pages each one can open' },
  { match: /^\/users/, title: 'Users List', subtitle: 'Manage every user account in the system' },
  { match: /^\/verification\/emails/, title: 'Email Verification', subtitle: 'Track and manage email confirmations' },
  { match: /^\/no-access/, title: 'No Access Yet', subtitle: 'Waiting for the Main Admin to open pages to you' },
];

export default function DashboardLayout() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const { pathname } = useLocation();
  const { admin } = useAuth();
  let meta = PAGE_META.find((m) => m.match.test(pathname)) || { title: 'Dashboard' };
  // A foreign company reads its own details as a company's.
  if (meta.match?.test('/agency/profile') && admin?.agency?.type === 'foreign') {
    meta = { title: 'Company Details', subtitle: 'Your company details and the phone and email used to sign in' };
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <Sidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} />

      <div className="lg:pl-64">
        <Topbar
          onMenuClick={() => setSidebarOpen(true)}
          title={meta.title}
          subtitle={meta.subtitle}
        />
        <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:py-8">
          <Outlet />
        </main>
      </div>
      {/* The agreement PDFs open here, over whichever page asked. */}
      <PdfViewerHost />
    </div>
  );
}
