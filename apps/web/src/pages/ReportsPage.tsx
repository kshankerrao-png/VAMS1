import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  BarChart3,
  CalendarDays,
  Download,
  Printer,
  Send,
  TrendingUp,
  Users,
} from 'lucide-react';
import type { ReportSummary } from '@vams/shared';
import { useAuth } from '../auth/AuthProvider';
import { api, downloadFile, errorMessage } from '../lib/api';
import { addDays, formatDate, istToday } from '../lib/format';
import { useToast } from '../components/Toast';
import {
  Alert,
  Badge,
  Button,
  Card,
  EmptyState,
  Field,
  Input,
  LoadingBlock,
  PageHeader,
  SectionCard,
} from '../components/ui';

export function ReportsPage() {
  const { can } = useAuth();
  const { notify } = useToast();
  const today = istToday();
  const [from, setFrom] = useState(`${today.slice(0, 7)}-01`);
  const [to, setTo] = useState(today);
  const [scheduleDate, setScheduleDate] = useState(today);
  const [exporting, setExporting] = useState(false);

  const summaryQuery = useQuery({
    queryKey: ['reports', 'summary', from, to],
    queryFn: () => api<ReportSummary>(`/reports/summary?from=${from}&to=${to}`),
    enabled: Boolean(from && to),
  });

  const summary = summaryQuery.data;

  const exportRegister = async () => {
    setExporting(true);
    try {
      await downloadFile(
        `/register/export?from=${from}&to=${to}`,
        `vams-register-${from}-to-${to}.csv`,
      );
      notify('Register export downloaded and audit-logged.');
    } catch (caught) {
      notify(errorMessage(caught), 'error');
    } finally {
      setExporting(false);
    }
  };

  return (
    <>
      <PageHeader
        title="Reports &amp; analytics"
        description="Operational view of requests, decisions, appointments and notification delivery."
        actions={
          <>
            {can('register:export') ? (
              <Button variant="outline" onClick={() => void exportRegister()} loading={exporting}>
                <Download className="size-4" />
                Export period
              </Button>
            ) : null}
            <Link to={`/print/schedule?date=${scheduleDate}`} target="_blank">
              <Button variant="secondary">
                <Printer className="size-4" />
                Print schedule
              </Button>
            </Link>
          </>
        }
      />

      <SectionCard title="Reporting period" icon={CalendarDays}>
        <div className="grid gap-3 sm:grid-cols-[170px_170px_1fr]">
          <Field label="From">
            <Input type="date" value={from} max={to} onChange={(event) => setFrom(event.target.value)} />
          </Field>
          <Field label="To">
            <Input type="date" value={to} min={from} max={today} onChange={(event) => setTo(event.target.value)} />
          </Field>
          <Field label="Printable daily schedule">
            <div className="flex gap-2">
              <Input
                type="date"
                value={scheduleDate}
                onChange={(event) => setScheduleDate(event.target.value)}
              />
              <Link to={`/print/schedule?date=${scheduleDate}`} target="_blank">
                <Button variant="outline">Open</Button>
              </Link>
            </div>
          </Field>
        </div>
        <div className="mt-3 flex flex-wrap gap-2 text-[11px]">
          {[
            { label: 'This month', from: `${today.slice(0, 7)}-01`, to: today },
            { label: 'Last 7 days', from: addDays(today, -6), to: today },
            { label: 'Last 30 days', from: addDays(today, -29), to: today },
          ].map((preset) => (
            <button
              key={preset.label}
              type="button"
              className="rounded-full border border-slate-200 bg-white px-3 py-1 font-semibold text-slate-600 hover:bg-slate-50"
              onClick={() => {
                setFrom(preset.from);
                setTo(preset.to);
              }}
            >
              {preset.label}
            </button>
          ))}
        </div>
      </SectionCard>

      {summaryQuery.isLoading ? (
        <LoadingBlock label="Building reportâ€¦" />
      ) : summaryQuery.isError || !summary ? (
        <div className="mt-5">
          <Alert tone="error" title="Report unavailable">
            {summaryQuery.isError ? errorMessage(summaryQuery.error) : 'No data returned.'}
          </Alert>
        </div>
      ) : (
        <div className="mt-5 space-y-5">
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {[
              { label: 'Requests in period', value: summary.totalRequests, hint: `${formatDate(from)} â€“ ${formatDate(to)}` },
              { label: 'Decisions taken', value: summary.decisions, hint: 'Approved or rejected' },
              { label: 'Appointments today', value: summary.appointmentsToday, hint: formatDate(today) },
              { label: 'Materialized this month', value: summary.materializedThisMonth, hint: 'Completed visits' },
            ].map((card) => (
              <Card key={card.label} className="p-4">
                <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">{card.label}</p>
                <p className="mt-1 text-2xl font-bold tabular-nums text-slate-900">{card.value}</p>
                <p className="mt-0.5 text-[11px] text-slate-400">{card.hint}</p>
              </Card>
            ))}
          </div>

          <div className="grid gap-5 lg:grid-cols-3">
            <SectionCard
              title="Status distribution"
              description="Requests created within the selected period."
              icon={BarChart3}
              className="lg:col-span-1"
            >
              <div className="space-y-3">
                {(
                  [
                    ['PENDING_APPROVAL', 'Pending', 'bg-amber-400'],
                    ['APPROVED', 'Approved', 'bg-sky-500'],
                    ['REJECTED', 'Rejected', 'bg-rose-400'],
                    ['MATERIALIZED', 'Materialized', 'bg-emerald-500'],
                  ] as const
                ).map(([key, label, color]) => {
                  const value = summary.byStatus[key];
                  const total = summary.totalRequests || 1;
                  return (
                    <div key={key}>
                      <div className="mb-1 flex justify-between text-xs">
                        <span className="text-slate-600">{label}</span>
                        <span className="tabular-nums text-slate-500">{value}</span>
                      </div>
                      <div className="h-2 overflow-hidden rounded-full bg-slate-100">
                        <div
                          className={`h-full rounded-full ${color}`}
                          style={{ width: `${Math.max(2, Math.round((value / total) * 100))}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            </SectionCard>

            <SectionCard
              title="Notification delivery"
              description="Across the selected period."
              icon={Send}
              className="lg:col-span-1"
            >
              <div className="mb-3 rounded-xl bg-slate-50 p-3 text-center">
                <p className="text-3xl font-bold tabular-nums text-brand-800">
                  {summary.notifications.successRate}%
                </p>
                <p className="text-[10px] uppercase tracking-wider text-slate-400">delivery success</p>
              </div>
              <ul className="space-y-1.5 text-xs">
                {[
                  ['Delivered', summary.notifications.delivered, 'text-emerald-700'],
                  ['Sent', summary.notifications.sent, 'text-sky-700'],
                  ['Queued', summary.notifications.queued, 'text-amber-700'],
                  ['Failed', summary.notifications.failed, 'text-rose-700'],
                  ['Skipped', summary.notifications.skipped, 'text-slate-500'],
                ].map(([label, value, color]) => (
                  <li key={String(label)} className="flex items-center justify-between">
                    <span className="text-slate-500">{label}</span>
                    <span className={`font-semibold tabular-nums ${color}`}>{value}</span>
                  </li>
                ))}
              </ul>
            </SectionCard>

            <SectionCard
              title="Top organizations"
              description="Most frequent visitors in the period."
              icon={Users}
              className="lg:col-span-1"
            >
              {summary.topOrganizations.length === 0 ? (
                <EmptyState title="No organization data" />
              ) : (
                <ol className="space-y-2">
                  {summary.topOrganizations.map((org, index) => (
                    <li key={org.organization} className="flex items-center gap-2">
                      <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-slate-100 text-[10px] font-bold text-slate-500">
                        {index + 1}
                      </span>
                      <span className="min-w-0 flex-1 truncate text-xs text-slate-600">
                        {org.organization}
                      </span>
                      <Badge tone="slate">{org.count}</Badge>
                    </li>
                  ))}
                </ol>
              )}
            </SectionCard>
          </div>

          <SectionCard
            title="Day-by-day activity"
            description="Requests entered and decisions recorded."
            icon={TrendingUp}
            bodyClassName="p-0"
          >
            {summary.byDay.length === 0 ? (
              <EmptyState title="No activity in this period" />
            ) : (
              <div className="max-h-96 overflow-auto">
                <table className="table-base">
                  <thead className="sticky top-0">
                    <tr>
                      <th>Date</th>
                      <th>Requests</th>
                      <th>Decisions</th>
                      <th>Activity</th>
                    </tr>
                  </thead>
                  <tbody>
                    {summary.byDay
                      .slice()
                      .reverse()
                      .map((day) => {
                        const max = Math.max(
                          1,
                          ...summary.byDay.map((item) => Math.max(item.requests, item.decisions)),
                        );
                        return (
                          <tr key={day.date}>
                            <td className="whitespace-nowrap text-xs">{formatDate(day.date)}</td>
                            <td className="text-xs tabular-nums">{day.requests}</td>
                            <td className="text-xs tabular-nums">{day.decisions}</td>
                            <td>
                              <div className="flex items-center gap-1.5">
                                <span className="h-2 rounded-full bg-brand-300" style={{ width: `${(day.requests / max) * 120}px` }} />
                                <span className="h-2 rounded-full bg-emerald-300" style={{ width: `${(day.decisions / max) * 120}px` }} />
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                  </tbody>
                </table>
              </div>
            )}
          </SectionCard>

          <div className="grid gap-5 lg:grid-cols-2">
            <SectionCard title="Upcoming appointments" description="Next seven days." icon={CalendarDays}>
              <div className="space-y-2">
                {summary.upcoming.map((day) => (
                  <div
                    key={day.date}
                    className="flex items-center justify-between rounded-lg border border-slate-100 bg-slate-50/50 px-3 py-2"
                  >
                    <span className="text-xs text-slate-600">{formatDate(day.date)}</span>
                    <Badge tone={day.count ? 'blue' : 'slate'}>{day.count} booked</Badge>
                  </div>
                ))}
              </div>
            </SectionCard>

            <SectionCard
              title="Daily schedule"
              description="Printable list for the Secretary's office."
              icon={Printer}
            >
              <p className="text-xs leading-relaxed text-slate-500">
                The daily schedule lists approved and materialized appointments for a chosen date, with
                time, visitor, organization, purpose and signature blocks.
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                <Link to={`/print/schedule?date=${today}`} target="_blank">
                  <Button variant="outline">Today Â· {formatDate(today)}</Button>
                </Link>
                <Link to={`/print/schedule?date=${addDays(today, 1)}`} target="_blank">
                  <Button variant="outline">Tomorrow</Button>
                </Link>
              </div>
              <p className="mt-3 text-[10px] text-slate-400">
                Use the browser print dialog to save the schedule as a PDF.
              </p>
            </SectionCard>
          </div>
        </div>
      )}
    </>
  );
}
