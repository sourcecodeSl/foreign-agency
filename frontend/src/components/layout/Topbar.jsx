import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { IconMenu, IconSearch, IconBell, IconChevronDown, IconLogout } from '../ui/Icons';

export default function Topbar({ onMenuClick, title, subtitle }) {
  const { admin, logout } = useAuth();
  const navigate = useNavigate();
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef(null);

  // Close the profile dropdown on any outside click.
  useEffect(() => {
    const onClickOutside = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) setMenuOpen(false);
    };
    document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
  }, []);

  const initials = (admin?.name || 'Main Admin')
    .split(' ')
    .map((w) => w[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();

  return (
    <header className="sticky top-0 z-20 border-b border-gray-200 bg-white/90 backdrop-blur">
      <div className="flex h-16 items-center gap-3 px-4 sm:px-6">
        <button
          type="button"
          onClick={onMenuClick}
          className="rounded-lg p-2 text-gray-600 hover:bg-gray-100 lg:hidden"
          aria-label="Open navigation"
        >
          <IconMenu className="h-5 w-5" />
        </button>

        <div className="min-w-0 flex-1">
          <h1 className="truncate text-lg font-semibold text-gray-900">{title}</h1>
          {subtitle && <p className="truncate text-sm text-gray-500">{subtitle}</p>}
        </div>

        {/* Global search */}
        <div className="relative hidden md:block">
          <IconSearch className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          <input
            type="search"
            placeholder="Search agencies, users..."
            className="w-64 rounded-lg border border-gray-300 bg-gray-50 py-2 pl-10 pr-3 text-sm
                       placeholder:text-gray-400 focus:border-primary-500 focus:bg-white
                       focus:outline-none focus:ring-4 focus:ring-primary-100"
          />
        </div>

        <button
          type="button"
          className="relative rounded-lg p-2 text-gray-600 hover:bg-gray-100"
          aria-label="Notifications"
        >
          <IconBell className="h-5 w-5" />
          <span className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full bg-red-500 ring-2 ring-white" />
        </button>

        {/* Profile menu */}
        <div className="relative" ref={menuRef}>
          <button
            type="button"
            onClick={() => setMenuOpen((v) => !v)}
            className="flex items-center gap-2 rounded-lg py-1.5 pl-1.5 pr-2 hover:bg-gray-100"
            aria-haspopup="menu"
            aria-expanded={menuOpen}
          >
            <span className="flex h-8 w-8 items-center justify-center rounded-full bg-primary-600 text-xs font-semibold text-white">
              {initials}
            </span>
            <span className="hidden text-left sm:block">
              <span className="block text-sm font-medium leading-tight text-gray-900">
                {admin?.name || 'Main Admin'}
              </span>
              <span className="block text-xs leading-tight text-gray-500">
                {admin?.role || 'Super Administrator'}
              </span>
            </span>
            <IconChevronDown className="h-4 w-4 text-gray-400" />
          </button>

          {menuOpen && (
            <div
              role="menu"
              className="absolute right-0 mt-2 w-56 overflow-hidden rounded-xl border border-gray-200 bg-white py-1 shadow-lg"
            >
              <div className="border-b border-gray-100 px-4 py-3">
                <p className="text-sm font-medium text-gray-900">{admin?.name || 'Main Admin'}</p>
                <p className="truncate text-xs text-gray-500">
                  {admin?.email || 'visaltheekshana555@gmail.com'}
                </p>
              </div>
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  logout();
                  navigate('/login', { replace: true });
                }}
                className="flex w-full items-center gap-2.5 px-4 py-2.5 text-sm text-red-600 hover:bg-red-50"
              >
                <IconLogout className="h-4 w-4" />
                Sign out
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
