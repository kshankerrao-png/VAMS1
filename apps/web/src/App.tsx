import { lazy, Suspense } from 'react';
import { Navigate, Outlet, Route, Routes, useLocation } from 'react-router-dom';
import type { Permission, Role } from '@vams/shared';
import { ShieldAlert } from 'lucide-react';
import { useAuth } from './auth/AuthProvider';
import { Layout } from './components/Layout';
import { Button, Card, Spinner } from './components/ui';

const LoginPage = lazy(() => import('./pages/LoginPage').then((module) => ({ default: module.LoginPage })));
const DashboardPage = lazy(() =>
  import('./pages/DashboardPage').then((module) => ({ default: module.DashboardPage })),
);
const IntakePage = lazy(() => import('./pages/IntakePage').then((module) => ({ default: module.IntakePage })));
const RegisterPage = lazy(() =>
  import('./pages/RegisterPage').then((module) => ({ default: module.RegisterPage })),
);
const QueuePage = lazy(() => import('./pages/QueuePage').then((module) => ({ default: module.QueuePage })));
const RequestDetailPage = lazy(() =>
  import('./pages/RequestDetailPage').then((module) => ({ default: module.RequestDetailPage })),
);
const ReportsPage = lazy(() =>
  import('./pages/ReportsPage').then((module) => ({ default: module.ReportsPage })),
);
const AuditPage = lazy(() => import('./pages/AuditPage').then((module) => ({ default: module.AuditPage })));
const AdminPage = lazy(() => import('./pages/AdminPage').then((module) => ({ default: module.AdminPage })));
const SchedulePrintPage = lazy(() =>
  import('./pages/SchedulePrintPage').then((module) => ({ default: module.SchedulePrintPage })),
);
const NotFoundPage = lazy(() =>
  import('./pages/NotFoundPage').then((module) => ({ default: module.NotFoundPage })),
);

export default function App() {
  return (
    <Suspense fallback={<PageFallback />}>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route element={<ProtectedRoute />}>
          <Route element={<Layout />}>
            <Route index element={<DashboardPage />} />
            <Route
              path="requests/new"
              element={
                <RequirePermission permission="request:create">
                  <IntakePage />
                </RequirePermission>
              }
            />
            <Route path="requests/:id" element={<RequestDetailPage />} />
            <Route path="register" element={<RegisterPage />} />
            <Route
              path="queue"
              element={
                <RequirePermission permission="request:decide">
                  <QueuePage />
                </RequirePermission>
              }
            />
            <Route
              path="reports"
              element={
                <RequirePermission permission="report:read">
                  <ReportsPage />
                </RequirePermission>
              }
            />
            <Route
              path="audit"
              element={
                <RequirePermission permission="audit:read" excludeRoles={['SECRETARY']}>
                  <AuditPage />
                </RequirePermission>
              }
            />
            <Route
              path="admin"
              element={
                <RequirePermission permission="admin:manage">
                  <AdminPage />
                </RequirePermission>
              }
            />
          </Route>
          <Route
            path="print/schedule"
            element={
              <RequirePermission permission="report:read">
                <SchedulePrintPage />
              </RequirePermission>
            }
          />
        </Route>
        <Route path="*" element={<NotFoundPage />} />
      </Routes>
    </Suspense>
  );
}

function PageFallback() {
  return (
    <div className="flex min-h-[60dvh] items-center justify-center">
      <div className="flex items-center gap-2.5 text-sm text-slate-500">
        <Spinner />
        Loading…
      </div>
    </div>
  );
}

function ProtectedRoute() {
  const { user, loading } = useAuth();
  const location = useLocation();

  if (loading) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-slate-100">
        <div className="flex flex-col items-center gap-3">
          <span className="flex size-12 animate-pulse items-center justify-center rounded-xl bg-brand-900 text-xs font-black text-white">
            VAMS
          </span>
          <p className="text-xs font-medium text-slate-500">Preparing your workspace…</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" replace state={{ from: location.pathname + location.search }} />;
  }

  return <Outlet />;
}

function RequirePermission({
  permission,
  children,
  excludeRoles,
}: {
  permission: Permission;
  children: React.ReactNode;
  excludeRoles?: Role[];
}) {
  const { user, can } = useAuth();
  if (!can(permission) || (user && excludeRoles?.includes(user.role))) {
    return (
      <Card className="mx-auto mt-6 max-w-lg p-8 text-center">
        <span className="mx-auto mb-4 flex size-12 items-center justify-center rounded-full bg-rose-50 text-rose-600">
          <ShieldAlert className="size-6" />
        </span>
        <h2 className="text-base font-bold text-slate-900">Access restricted</h2>
        <p className="mt-1 text-sm text-slate-500">
          Your role does not have access to this section. Contact the system administrator if you
          believe this is an error.
        </p>
        <Button className="mt-5" variant="outline" onClick={() => window.history.back()}>
          Go back
        </Button>
      </Card>
    );
  }
  return <>{children}</>;
}
