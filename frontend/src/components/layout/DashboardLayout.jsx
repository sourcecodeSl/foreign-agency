import { useState } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import Sidebar from './Sidebar';
import Topbar from './Topbar';

// Header copy per route, so the topbar always reflects the current screen.
const PAGE_META = [
  { match: /^\/dashboard/, title: 'Dashboard', subtitle: 'Overview of agencies, users and activity' },
  { match: /^\/agencies\/create/, title: 'Create Agency', subtitle: 'Register a new agency and issue login credentials' },
  { match: /^\/agencies/, title: 'Agency Management', subtitle: 'Review pending, active and deactivated agencies' },
  { match: /^\/candidates\/register/, title: 'Register Candidate', subtitle: 'Capture the candidate details, then attach the documents' },
  { match: /^\/candidates\/\d+/, title: 'Candidate File', subtitle: 'Details and attached documents' },
  // Wording that holds for both readers: an agency sees its own, the admin
  // picks whose to look at. The card below carries the role-specific line.
  { match: /^\/candidates/, title: 'Candidates', subtitle: 'Registered candidate files' },
  { match: /^\/users\/types/, title: 'User Types & Roles', subtitle: 'Define the roles available across the system' },
  { match: /^\/users\/permissions/, title: 'User Permissions', subtitle: 'Assign access rights to each user type' },
  { match: /^\/users/, title: 'Users List', subtitle: 'Manage every user account in the system' },
  { match: /^\/verification\/emails/, title: 'Email Verification', subtitle: 'Track and manage email confirmations' },
];

export default function DashboardLayout() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const { pathname } = useLocation();
  const meta = PAGE_META.find((m) => m.match.test(pathname)) || { title: 'Dashboard' };

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
    </div>
  );
}
