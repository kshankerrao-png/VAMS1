import { useState } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import { Eye, EyeOff, Lock, ShieldCheck, User, Users } from 'lucide-react';
import { useAuth } from '../auth/AuthProvider';
import { errorMessage } from '../lib/api';
import { Alert, Button, Field, Input } from '../components/ui';

const DEMO_ACCOUNTS = [
  { username: 'peshi', password: 'Peshi@123456', label: 'Peshi Staff', detail: 'Intake & register' },
  { username: 'secretary', password: 'Secretary@123', label: 'Secretary, T,R&B', detail: 'Review & approve' },
  { username: 'admin', password: 'Admin@123456', label: 'Administrator', detail: 'Users & configuration' },
];

export function LoginPage() {
  const { user, loading, login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  if (!loading && user) {
    const from = (location.state as { from?: string } | null)?.from;
    return <Navigate to={from && from !== '/login' ? from : '/'} replace />;
  }

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await login(username, password);
      navigate('/', { replace: true });
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="grid min-h-dvh bg-slate-100 lg:grid-cols-[1.05fr_1fr]">
      <section className="relative hidden overflow-hidden bg-brand-900 px-12 py-12 text-white lg:flex lg:flex-col">
        <div className="absolute -right-24 -top-24 size-80 rounded-full bg-brand-700/40 blur-2xl" />
        <div className="absolute -bottom-28 -left-16 size-80 rounded-full bg-brand-600/20 blur-3xl" />
        <div className="relative flex items-center gap-4">
          <img
            src="/logo.png"
            alt="Government of Telangana emblem"
            className="size-16 shrink-0 object-contain"
          />
          <div>
            <p className="text-lg font-bold leading-snug sm:text-xl">
              Transport, Roads &amp; Buildings Department
            </p>
            <p className="mt-1 text-[11px] uppercase tracking-[0.18em] text-brand-300">
              Government of Telangana · Office of the Secretary
            </p>
          </div>
        </div>

        <div className="relative mt-20 max-w-lg">
          <p className="mb-3 inline-flex rounded-full bg-white/10 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-brand-100 ring-1 ring-white/15">
            Visitors Appointment Management System
          </p>
          <h1 className="text-3xl font-bold leading-tight tracking-tight">
            Appointments, reviewed and confirmed without the paper trail.
          </h1>
          <p className="mt-4 text-sm leading-relaxed text-brand-100/85">
            A single register for every visitor request — from peshi intake and returning-visitor
            lookup to the Secretary's approval, slot assignment and instant Email and WhatsApp
            confirmation.
          </p>

          <div className="mt-10 space-y-4">
            {[
              {
                icon: Users,
                title: 'Returning visitors recognised instantly',
                detail: 'Auto-fill from any identifier and see full visit history.',
              },
              {
                icon: ShieldCheck,
                title: 'Role-based, audit-logged decisions',
                detail: 'Approval controls stay with the Secretary; every action is traceable.',
              },
              {
                icon: Lock,
                title: 'Confirmed on Email and WhatsApp',
                detail: 'Delivery is tracked per channel, with retries and manual resend.',
              },
            ].map((item) => (
              <div key={item.title} className="flex items-start gap-3">
                <span className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-lg bg-white/10 ring-1 ring-white/15">
                  <item.icon className="size-4 text-brand-100" />
                </span>
                <div>
                  <p className="text-[13px] font-semibold text-white">{item.title}</p>
                  <p className="text-xs text-brand-200/80">{item.detail}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        <p className="relative mt-auto text-[10px] uppercase tracking-[0.16em] text-brand-300/70">
          Internal system · Authorised staff only
        </p>
      </section>

      <section className="flex items-center justify-center px-4 py-10 sm:px-8">
        <div className="w-full max-w-md">
          <div className="mb-7 flex items-center gap-3 lg:hidden">
            <img
              src="/logo.png"
              alt="Government of Telangana emblem"
              className="size-12 shrink-0 object-contain"
            />
            <div className="min-w-0">
              <p className="text-base font-bold text-slate-900">VAMS</p>
              <p className="text-sm font-semibold leading-snug text-slate-700">
                Transport, Roads &amp; Buildings Department
              </p>
              <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-500">
                Government of Telangana
              </p>
            </div>
          </div>

          <h2 className="text-xl font-bold tracking-tight text-slate-900">Sign in to VAMS</h2>
          <p className="mt-1 text-sm text-slate-500">
            Use your department-issued credentials to continue.
          </p>

          <form onSubmit={submit} className="mt-6 space-y-4">
            {error ? <Alert tone="error">{error}</Alert> : null}
            <Field label="Username" htmlFor="username" required>
              <div className="relative">
                <User className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
                <Input
                  id="username"
                  name="username"
                  autoComplete="username"
                  className="pl-9"
                  placeholder="e.g. peshi"
                  value={username}
                  onChange={(event) => setUsername(event.target.value)}
                  required
                />
              </div>
            </Field>
            <Field label="Password" htmlFor="password" required>
              <div className="relative">
                <Lock className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
                <Input
                  id="password"
                  name="password"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="current-password"
                  className="pl-9 pr-10"
                  placeholder="Enter your password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((value) => !value)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-slate-400 hover:text-slate-600"
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                >
                  {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                </button>
              </div>
            </Field>
            <Button type="submit" className="w-full" loading={submitting}>
              Sign in
            </Button>
          </form>

          <div className="mt-7 rounded-xl border border-dashed border-slate-300 bg-white/70 p-3.5">
            <p className="mb-2 text-[10px] font-bold uppercase tracking-[0.16em] text-slate-400">
              Demo accounts
            </p>
            <div className="space-y-1">
              {DEMO_ACCOUNTS.map((account) => (
                <button
                  key={account.username}
                  type="button"
                  onClick={() => {
                    setUsername(account.username);
                    setPassword(account.password);
                  }}
                  className="flex w-full items-center justify-between gap-2 rounded-lg px-2 py-1.5 text-left transition hover:bg-slate-100"
                >
                  <span>
                    <span className="block text-xs font-semibold text-slate-700">{account.label}</span>
                    <span className="block text-[10px] text-slate-400">{account.detail}</span>
                  </span>
                  <span className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-[10px] text-slate-500">
                    {account.username}
                  </span>
                </button>
              ))}
            </div>
          </div>

          <p className="mt-5 text-center text-[11px] text-slate-400">
            Sessions expire after 30 minutes of inactivity. All sign-ins are recorded in the audit log.
          </p>
        </div>
      </section>
    </div>
  );
}
