import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  BellRing,
  CalendarClock,
  CalendarDays,
  CheckCircle2,
  ClipboardCheck,
  Clock3,
  Printer,
  UserPlus,
  Users,
} from 'lucide-react';
import type {
  DashboardStats,
  Paginated,
  ReportSummary,
  RequestListRow,
  ScheduleResponse,
} from '@vams/shared';
import { STATUS_LABELS } from '@vams/shared';
import { useAuth } from '../auth/AuthProvider';
import { api } from '../lib/api';
import { formatDate, formatTime, istToday, timeAgo, truncate } from '../lib/format';
import {
  Alert,
  Badge,
  Button,
  Card,
  EmptyState,
  LoadingBlock,
  PageHeader,
  SectionCard,
  StatusBadge,
} from '../components/ui';

export function DashboardPage() {
  const { user, can } = useAuth();
  const today = istToday();

  const statsQuery = useQuery({
    queryKey: ['stats'],
    queryFn: () => api<DashboardStats>('/requests/stats'),
  });
  const summaryQuery = useQuery({
    queryKey: ['reports', 'summary', 'dashboard', today],
    queryFn: () => api<ReportSummary>(`/reports/summary?from=${today}&to=${today}`),
    enabled: can('report:read'),
  });
  const scheduleQuery = useQuery({
    queryKey: ['reports', 'schedule', today],
    queryFn: () => api<ScheduleResponse>(`/reports/schedule?date=${today}`),
    enabled: can('report:read'),
  });
  const pendingQuery = useQuery({
    queryKey: ['requests', 'dashboard', 'pending'],
    queryFn: () =>
      api<Paginated<RequestListRow>>(
        '/requests?status=PENDING_APPROVAL&pageSize=5&page=1&sort=requestDate&dir=asc',
      ),
    enabled: can('request:decide'),
  });
  const recentQuery = useQuery({
    queryKey: ['requests', 'dashboard', 'recent'],
    queryFn: () => api<Paginated<RequestListRow>>('/requests?pageSize=6&page=1'),
  });

  const stats = statsQuery.data;
  const summary = summaryQuery.data;
  const schedule = scheduleQuery.data;
  const pending = pendingQuery.data;
  const recent = recentQuery.data;

  const cards = [
    {
      label: 'Pending approval',
      value: stats?.byStatus.PENDING_APPROVAL ?? 0,
      icon: Clock3,
      tone: 'bg-amber-50 text-amber-700',
      hint: stats?.pendingOldestDays ? `Oldest waiting ${stats.pendingOldestDays} day(s)` : 'Queue is clear',
      href: can('request:decide') ? '/queue' : '/register?status=PENDING_APPROVAL',
    },
    {
      label: "Today's appointments",
      value: stats?.todayAppointments ?? 0,
      icon: CalendarClock,
      tone: 'bg-sky-50 text-sky-700',
      hint: formatDate(today),
      href: can('report:read') ? `/print/schedule?date=${today}` : '/register?status=APPROVED',
    },
    {
      label: summary ? 'Materialized this month' : 'Materialized visits',
      value: summary?.materializedThisMonth ?? stats?.byStatus.MATERIALIZED ?? 0,
      icon: CheckCircle2,
      tone: 'bg-emerald-50 text-emerald-700',
      hint: summary ? 'Completed visits this month' : 'Completed visits on record',
      href: '/register?status=MATERIALIZED',
    },
    {
      label: 'Notification failures',
      value: stats?.notificationFailures ?? 0,
      icon: BellRing,
      tone: 'bg-rose-50 text-rose-700',
      hint: stats?.notificationsPending ? `${stats.notificationsPending} awaiting dispatch` : 'No pending sends',
      href: '/register',
    },
  ];

  return (
    <>
      <PageHeader
        title={`Good day, ${user?.name.split(' ')[0] ?? 'colleague'}`}
        description="A live view of visitor requests, today's appointments and notification health."
        actions={
          <>
            {can('request:create') ? (
              <Link to="/requests/new">
                <Button>
                  <UserPlus className="size-4" />
                  New request
                </Button>
              </Link>
            ) : null}
            {can('request:decide') && (stats?.byStatus.PENDING_APPROVAL ?? 0) > 0 ? (
              <Link to="/queue">
                <Button variant="secondary">
                  <ClipboardCheck className="size-4" />
                  Review queue
                </Button>
              </Link>
            ) : null}
          </>
        }
      />

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {cards.map((card) => (
          <Link key={card.label} to={card.href} className="group">
            <Card className="h-full p-4 transition group-hover:border-brand-200 group-hover:shadow-md">
              <div className="flex items-start justify-between">
                <span className={`flex size-9 items-center justify-center rounded-lg ${card.tone}`}>
                  <card.icon className="size-4.5" />
                </span>
                <span className="text-2xl font-bold tabular-nums tracking-tight text-slate-900">
                  {card.value}
                </span>
              </div>
              <p className="mt-3 text-[13px] font-semibold text-slate-700">{card.label}</p>
              <p className="mt-0.5 text-[11px] text-slate-400">{card.hint}</p>
            </Card>
          </Link>
        ))}
      </div>

      <div className="mt-5 grid gap-5 xl:grid-cols-3">
        <div className="space-y-5 xl:col-span-2">
          {can('request:decide') ? (
            <SectionCard
              title="Awaiting the Secretary's review"
              description="Oldest requests first â€” approve with a slot or reject with a reason."
              icon={ClipboardCheck}
              actions={
                <Link to="/queue" className="text-xs font-semibold text-brand-700 hover:underline">
                  Open queue â†’
                </Link>
              }
              bodyClassName="p-0"
            >
              {pendingQuery.isLoading ? (
                <LoadingBlock />
              ) : !pending || pending.items.length === 0 ? (
                <EmptyState
                  title="No requests awaiting approval"
                  description="New peshi entries will appear here automatically."
                  icon={CheckCircle2}
                />
              ) : (
                <div className="divide-y divide-slate-100">
                  {pending.items.map((row) => (
                    <Link
                      key={row.id}
                      to={`/requests/${row.id}`}
                      className="flex flex-wrap items-start gap-3 px-5 py-3.5 transition hover:bg-slate-50"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="text-sm font-semibold text-slate-800">{row.visitorName}</p>
                          <span className="text-[11px] text-slate-400">{row.reference}</span>
                        </div>
                        <p className="mt-0.5 text-xs text-slate-500">
                          {row.visitorDesignation ? `${row.visitorDesignation} Â· ` : ''}
                          {row.visitorOrganization ?? 'â€”'}
                        </p>
                        <p className="mt-1 text-xs text-slate-600">{truncate(row.purpose, 110)}</p>
                      </div>
                      <div className="text-right">
                        <StatusBadge status={row.status} short />
                        <p className="mt-1 text-[10px] text-slate-400">
                          Entered {timeAgo(row.requestDate)}
                        </p>
                      </div>
                    </Link>
                  ))}
                </div>
              )}
            </SectionCard>
          ) : (
            <SectionCard
              title="Latest register activity"
              description="Requests recently entered at the peshi."
              icon={Users}
              actions={
                <Link to="/register" className="text-xs font-semibold text-brand-700 hover:underline">
                  View register â†’
                </Link>
              }
              bodyClassName="p-0"
            >
              {recentQuery.isLoading ? (
                <LoadingBlock />
              ) : !recent || recent.items.length === 0 ? (
                <EmptyState
                  title="No appointment requests yet"
                  description="Enter the first request to start the register."
                  action={
                    can('request:create') ? (
                      <Link to="/requests/new">
                        <Button size="sm">New request</Button>
                      </Link>
                    ) : undefined
                  }
                />
              ) : (
                <div className="divide-y divide-slate-100">
                  {recent.items.map((row) => (
                    <Link
                      key={row.id}
                      to={`/requests/${row.id}`}
                      className="flex items-center gap-3 px-5 py-3 transition hover:bg-slate-50"
                    >
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-semibold text-slate-800">
                          {row.visitorName}
                        </p>
                        <p className="truncate text-xs text-slate-500">{truncate(row.purpose, 85)}</p>
                      </div>
                      <div className="shrink-0 text-right">
                        <StatusBadge status={row.status} short />
                        <p className="mt-1 text-[10px] text-slate-400">{timeAgo(row.requestDate)}</p>
                      </div>
                    </Link>
                  ))}
                </div>
              )}
            </SectionCard>
          )}

          <SectionCard
            title="Requests by status"
            description="All-time distribution across the four register lists."
            icon={Users}
          >
            {statsQuery.isLoading ? (
              <LoadingBlock />
            ) : (
              <div className="space-y-3">
                {Object.entries(stats?.byStatus ?? {}).map(([status, count]) => {
                  const typed = status as keyof NonNullable<DashboardStats['byStatus']>;
                  const total = stats?.totalRequests || 1;
                  const percent = Math.round((Number(count) / total) * 100);
                  return (
                    <div key={status}>
                      <div className="mb-1 flex items-center justify-between text-xs">
                        <span className="font-medium text-slate-600">{STATUS_LABELS[typed]}</span>
                        <span className="tabular-nums text-slate-500">
                          {count} Â· {percent}%
                        </span>
                      </div>
                      <div className="h-2 overflow-hidden rounded-full bg-slate-100">
                        <div
                          className={
                            typed === 'PENDING_APPROVAL'
                              ? 'h-full rounded-full bg-amber-400'
                              : typed === 'APPROVED'
                                ? 'h-full rounded-full bg-sky-500'
                                : typed === 'MATERIALIZED'
                                  ? 'h-full rounded-full bg-emerald-500'
                                  : 'h-full rounded-full bg-rose-400'
                          }
                          style={{ width: `${Math.max(2, percent)}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
                <p className="pt-1 text-[11px] text-slate-400">
                  {stats?.totalRequests ?? 0} total requests across the register.
                </p>
              </div>
            )}
          </SectionCard>
        </div>

        <div className="space-y-5">
          <SectionCard
            title="Today's schedule"
            description={formatDate(today)}
            icon={CalendarDays}
            actions={
              can('report:read') ? (
                <Link to={`/print/schedule?date=${today}`} target="_blank">
                  <Button variant="ghost" size="sm">
                    <Printer className="size-3.5" />
                    Print
                  </Button>
                </Link>
              ) : undefined
            }
            bodyClassName="p-0"
          >
            {!can('report:read') ? (
              <EmptyState
                title="Schedule visible to the Secretary's office"
                description="Your role can track individual requests from the register."
                icon={CalendarDays}
              />
            ) : scheduleQuery.isLoading ? (
              <LoadingBlock />
            ) : !schedule || schedule.items.length === 0 ? (
              <EmptyState title="No appointments today" description="Approved slots for today will appear here." />
            ) : (
              <ul className="divide-y divide-slate-100">
                {schedule.items.map((item) => (
                  <li key={item.reference} className="flex gap-3 px-5 py-3">
                    <span className="mt-0.5 w-16 shrink-0 text-xs font-bold tabular-nums text-brand-700">
                      {formatTime(item.time)}
                    </span>
                    <div className="min-w-0">
                      <p className="truncate text-[13px] font-semibold text-slate-800">
                        {item.visitorName}
                      </p>
                      <p className="truncate text-[11px] text-slate-500">
                        {item.organization ?? item.designation ?? 'â€”'}
                      </p>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </SectionCard>

          {can('report:read') && summary ? (
            <SectionCard title="Next 7 days" description="Approved appointments by date." icon={CalendarClock}>
              <div className="space-y-2">
                {summary.upcoming.map((day) => (
                  <div
                    key={day.date}
                    className="flex items-center justify-between rounded-lg border border-slate-100 bg-slate-50/60 px-3 py-2"
                  >
                    <span className="text-xs font-medium text-slate-600">{formatDate(day.date)}</span>
                    <Badge tone={day.count > 0 ? 'blue' : 'slate'}>{day.count} booked</Badge>
                  </div>
                ))}
              </div>
            </SectionCard>
          ) : null}

          {summary ? (
            <SectionCard
              title="Notification health"
              description="Delivery performance in the selected period."
              icon={BellRing}
            >
              <div className="grid grid-cols-2 gap-2 text-center">
                {[
                  { label: 'Delivered', value: summary.notifications.delivered, tone: 'text-emerald-700' },
                  { label: 'Sent', value: summary.notifications.sent, tone: 'text-sky-700' },
                  { label: 'Queued', value: summary.notifications.queued, tone: 'text-amber-700' },
                  { label: 'Failed', value: summary.notifications.failed, tone: 'text-rose-700' },
                ].map((item) => (
                  <div key={item.label} className="rounded-lg border border-slate-100 bg-white p-2.5">
                    <p className={`text-lg font-bold tabular-nums ${item.tone}`}>{item.value}</p>
                    <p className="text-[10px] uppercase tracking-wider text-slate-400">{item.label}</p>
                  </div>
                ))}
              </div>
              <div className="mt-3">
                <Alert tone={summary.notifications.successRate >= 95 ? 'success' : 'warning'}>
                  {summary.notifications.successRate}% delivery success for the period.
                </Alert>
              </div>
            </SectionCard>
          ) : null}
        </div>
      </div>

      {can('request:create') && !can('request:decide') ? (
        <p className="mt-6 text-[11px] text-slate-400">
          Tip: when a returning visitor gives their mobile number, the intake form finds their profile
          and fills the remaining fields automatically.
        </p>
      ) : null}
    </>
  );
}
