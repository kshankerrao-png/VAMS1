import { useEffect, useState } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  BarChart3,
  BookOpen,
  Building2,
  ClipboardCheck,
  KeyRound,
  LayoutDashboard,
  LogOut,
  Menu,
  Settings,
  ShieldCheck,
  UserPlus,
  X,
} from 'lucide-react';
import type { DashboardStats, Permission, Role } from '@vams/shared';
import { ROLE_LABELS } from '@vams/shared';
import { useAuth } from '../auth/AuthProvider';
import { api, errorMessage, fieldErrors } from '../lib/api';
import { cn, initials } from '../lib/format';
import { Alert, Button, Field, Input, Modal } from './ui';
import { useToast } from './Toast';

interface NavItem {
  to: string;
  label: string;
  icon: typeof LayoutDashboard;
  permission?: Permission;
  hiddenFor?: Role[];
  end?: boolean;
  badge?: number;
}

export function Layout() {
  const { user, can, logout } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [passwordOpen, setPasswordOpen] = useState(false);

  const stats = useQuery({
    queryKey: ['stats'],
    queryFn: () => api<DashboardStats>('/requests/stats'),
    enabled: Boolean(user),
    staleTime: 30_000,
  });

  useEffect(() => {
    setMobileOpen(false);
    setMenuOpen(false);
  }, [location.pathname]);

  if (!user) return null;

  const navigation: NavItem[] = [
    { to: '/', label: 'Dashboard', icon: LayoutDashboard, end: true },
    { to: '/requests/new', label: 'New Request', icon: UserPlus, permission: 'request:create' },
    {
      to: '/queue',
      label: 'Pending Queue',
      icon: ClipboardCheck,
      permission: 'request:decide',
      badge: stats.data?.byStatus.PENDING_APPROVAL,
    },
    { to: '/register', label: 'Register', icon: BookOpen },
    { to: '/reports', label: 'Reports', icon: BarChart3, permission: 'report:read' },
    {
      to: '/audit',
      label: 'Audit Log',
      icon: ShieldCheck,
      permission: 'audit:read',
      hiddenFor: ['SECRETARY'],
    },
    { to: '/admin', label: 'Administration', icon: Settings, permission: 'admin:manage' },
  ];

  const visible = navigation.filter(
    (item) =>
      (!item.permission || can(item.permission)) && !item.hiddenFor?.includes(user.role),
  );

  const handleLogout = async () => {
    await logout();
    navigate('/login', { replace: true });
  };

  const sidebar = (
    <div className="flex h-full flex-col bg-brand-900 text-brand-50">
      <div className="flex items-center gap-3 border-b border-white/10 px-5 py-5">
        <img
          src="/logo.png"
          alt="Government of Telangana emblem"
          className="size-11 shrink-0 object-contain"
        />
        <div className="min-w-0">
          <p className="truncate text-base font-bold text-white">VAMS</p>
          <p className="truncate text-[10px] uppercase tracking-[0.14em] text-brand-200">
            T,R&amp;B Department
          </p>
        </div>
      </div>

      <nav className="flex-1 space-y-0.5 overflow-y-auto px-3 py-4">
        <p className="px-3 pb-2 text-[10px] font-bold uppercase tracking-[0.16em] text-brand-300">
          Workspace
        </p>
        {visible.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.end}
            className={({ isActive }) =>
              cn(
                'group flex items-center gap-2.5 rounded-lg px-3 py-2.5 text-[13px] font-medium transition',
                isActive
                  ? 'bg-white text-brand-900 shadow-sm'
                  : 'text-brand-100/90 hover:bg-white/10 hover:text-white',
              )
            }
          >
            {({ isActive }) => (
              <>
                <item.icon className={cn('size-4.5', isActive ? 'text-brand-700' : 'text-brand-300')} />
                <span className="flex-1">{item.label}</span>
                {item.badge ? (
                  <span
                    className={cn(
                      'rounded-full px-1.5 py-0.5 text-[10px] font-bold',
                      isActive ? 'bg-amber-100 text-amber-800' : 'bg-amber-400 text-brand-950',
                    )}
                  >
                    {item.badge}
                  </span>
                ) : null}
              </>
            )}
          </NavLink>
        ))}
      </nav>

      <div className="border-t border-white/10 px-5 py-4">
        <p className="text-[11px] font-semibold text-brand-100">{user.name}</p>
        <p className="mt-0.5 text-[10px] uppercase tracking-wider text-brand-300">
          {ROLE_LABELS[user.role]}
        </p>
      </div>
    </div>
  );

  return (
    <div className="min-h-dvh min-w-0 overflow-x-hidden bg-slate-100">
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 lg:block">{sidebar}</aside>

      {mobileOpen ? (
        <div className="fixed inset-0 z-50 lg:hidden">
          <button
            type="button"
            aria-label="Close navigation"
            className="absolute inset-0 bg-slate-950/50"
            onClick={() => setMobileOpen(false)}
          />
          <div className="relative h-full w-72 max-w-[85vw] shadow-2xl">
            <button
              type="button"
              onClick={() => setMobileOpen(false)}
              className="absolute -right-11 top-3 rounded-lg bg-white/10 p-2 text-white"
              aria-label="Close menu"
            >
              <X className="size-5" />
            </button>
            {sidebar}
          </div>
        </div>
      ) : null}

      <div className="lg:pl-64">
        <header className="sticky top-0 z-20 border-b border-slate-200 bg-white/90 backdrop-blur">
          <div className="flex h-14 items-center gap-3 px-4 sm:px-6">
            <button
              type="button"
              className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 lg:hidden"
              onClick={() => setMobileOpen(true)}
              aria-label="Open navigation"
            >
              <Menu className="size-5" />
            </button>
            <div className="flex min-w-0 items-center gap-2 sm:hidden">
              <img
                src="/logo.png"
                alt="Government of Telangana emblem"
                className="size-8 shrink-0 object-contain"
              />
              <span className="truncate text-sm font-bold text-slate-800">VAMS</span>
            </div>
            <div className="hidden min-w-0 items-center gap-2 text-xs text-slate-500 sm:flex">
              <Building2 className="size-4 shrink-0 text-brand-600" />
              <span className="truncate font-semibold text-slate-700">
                Transport, Roads &amp; Buildings Department
              </span>
              <span className="hidden text-slate-300 md:inline">/</span>
              <span className="hidden md:inline">Office of the Secretary</span>
            </div>
            <div className="ml-auto flex items-center gap-2">
              <span className="hidden rounded-full bg-emerald-50 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider text-emerald-700 ring-1 ring-inset ring-emerald-200 sm:inline">
                Secure session
              </span>
              <div className="relative">
                <button
                  type="button"
                  onClick={() => setMenuOpen((open) => !open)}
                  className="flex items-center gap-2 rounded-full border border-slate-200 bg-white py-1 pl-1 pr-2.5 transition hover:bg-slate-50"
                  aria-haspopup="menu"
                  aria-expanded={menuOpen}
                >
                  <span className="flex size-7 items-center justify-center rounded-full bg-brand-700 text-[11px] font-bold text-white">
                    {initials(user.name)}
                  </span>
                  <span className="hidden text-left sm:block">
                    <span className="block text-xs font-semibold leading-tight text-slate-800">
                      {user.name}
                    </span>
                    <span className="block text-[10px] leading-tight text-slate-500">
                      {ROLE_LABELS[user.role]}
                    </span>
                  </span>
                </button>
                {menuOpen ? (
                  <>
                    <button
                      type="button"
                      className="fixed inset-0 z-10 cursor-default"
                      aria-label="Close user menu"
                      onClick={() => setMenuOpen(false)}
                    />
                    <div
                      role="menu"
                      className="absolute right-0 z-20 mt-2 w-56 overflow-hidden rounded-xl border border-slate-200 bg-white py-1 shadow-xl"
                    >
                      <div className="border-b border-slate-100 px-4 py-3">
                        <p className="text-xs font-semibold text-slate-800">{user.name}</p>
                        <p className="mt-0.5 text-[11px] text-slate-500">@{user.username}</p>
                      </div>
                      <button
                        type="button"
                        role="menuitem"
                        className="flex w-full items-center gap-2 px-4 py-2 text-left text-xs text-slate-600 hover:bg-slate-50"
                        onClick={() => {
                          setMenuOpen(false);
                          setPasswordOpen(true);
                        }}
                      >
                        <KeyRound className="size-3.5" />
                        Change password
                      </button>
                      <button
                        type="button"
                        role="menuitem"
                        className="flex w-full items-center gap-2 px-4 py-2 text-left text-xs text-rose-600 hover:bg-rose-50"
                        onClick={() => void handleLogout()}
                      >
                        <LogOut className="size-3.5" />
                        Sign out
                      </button>
                    </div>
                  </>
                ) : null}
              </div>
            </div>
          </div>
        </header>

        <main className="mx-auto w-full min-w-0 max-w-7xl px-3 py-5 sm:px-6 lg:py-8">
          {user.mustChangePassword ? (
            <Alert tone="warning" title="Password change required" className="mb-5">
              Your account is using a temporary password.{' '}
              <button
                type="button"
                className="font-semibold underline underline-offset-2"
                onClick={() => setPasswordOpen(true)}
              >
                Change it now
              </button>{' '}
              to continue securely.
            </Alert>
          ) : null}
          <Outlet />
          <footer className="mt-10 border-t border-slate-200 pt-4 text-[11px] text-slate-400">
            VAMS · Transport, Roads &amp; Buildings Department · All actions are audit-logged.
          </footer>
        </main>
      </div>

      <ChangePasswordModal open={passwordOpen} onClose={() => setPasswordOpen(false)} />
    </div>
  );
}

function ChangePasswordModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { refresh } = useAuth();
  const { notify } = useToast();
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [fieldError, setFieldError] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) {
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      setError(null);
      setFieldError({});
    }
  }, [open]);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    setFieldError({});
    if (newPassword !== confirmPassword) {
      setFieldError({ confirmPassword: 'Passwords do not match' });
      return;
    }
    setSaving(true);
    try {
      await api('/auth/change-password', {
        method: 'POST',
        body: { currentPassword, newPassword },
      });
      await refresh();
      notify('Password updated successfully.');
      onClose();
    } catch (caught) {
      setError(errorMessage(caught));
      setFieldError(fieldErrors(caught));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Change password"
      description="Use at least 12 characters with upper and lower case letters and a number."
    >
      <form onSubmit={submit} className="space-y-4">
        {error ? <Alert tone="error">{error}</Alert> : null}
        <Field label="Current password" required error={fieldError.currentPassword}>
          <Input
            type="password"
            autoComplete="current-password"
            value={currentPassword}
            onChange={(event) => setCurrentPassword(event.target.value)}
          />
        </Field>
        <Field
          label="New password"
          required
          error={fieldError.newPassword}
          hint="Minimum 12 characters."
        >
          <Input
            type="password"
            autoComplete="new-password"
            value={newPassword}
            onChange={(event) => setNewPassword(event.target.value)}
          />
        </Field>
        <Field label="Confirm new password" required error={fieldError.confirmPassword}>
          <Input
            type="password"
            autoComplete="new-password"
            value={confirmPassword}
            onChange={(event) => setConfirmPassword(event.target.value)}
          />
        </Field>
        <div className="flex justify-end gap-2 pt-1">
          <Button type="button" variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" loading={saving}>
            Update password
          </Button>
        </div>
      </form>
    </Modal>
  );
}


