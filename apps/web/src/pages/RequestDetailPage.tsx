import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ArrowLeft,
  Building2,
  CalendarClock,
  CheckCircle2,
  ClipboardList,
  Clock3,
  FileText,
  History,
  LogIn,
  Mail,
  MapPin,
  MessageCircle,
  Phone,
  Printer,
  RotateCw,
  Send,
  ShieldCheck,
  UserRound,
  XCircle,
} from 'lucide-react';
import type { AppointmentRequestDetail, NotificationRecord } from '@vams/shared';
import { useAuth } from '../auth/AuthProvider';
import { api, errorMessage } from '../lib/api';
import {
  formatDate,
  formatDateTime,
  formatTime,
  isSlotInPast,
  timeAgo,
  truncate,
} from '../lib/format';
import { useToast } from '../components/Toast';
import {
  Alert,
  Badge,
  Button,
  Card,
  EmptyState,
  LoadingBlock,
  NotificationBadge,
  PageHeader,
  SectionCard,
  StatusBadge,
} from '../components/ui';
import {
  ApproveDialog,
  MaterializeDialog,
  RejectDialog,
} from '../components/DecisionDialogs';

const ACTION_LABELS: Record<string, string> = {
  REQUEST_CREATED: 'Request created',
  REQUEST_APPROVED: 'Appointment approved',
  REQUEST_REJECTED: 'Appointment rejected',
  REQUEST_RESCHEDULED: 'Appointment rescheduled',
  REQUEST_MATERIALIZED: 'Visit materialized',
  NOTIFICATION_QUEUED: 'Notification queued',
  NOTIFICATION_SENT: 'Notification sent',
  NOTIFICATION_DELIVERED: 'Notification delivered',
  NOTIFICATION_FAILED: 'Notification failed',
  NOTIFICATION_SKIPPED: 'Notification skipped',
  NOTIFICATION_RESENT: 'Notification resent',
};

function actionLabel(action: string): string {
  return (
    ACTION_LABELS[action] ??
    action
      .toLowerCase()
      .replace(/_/g, ' ')
      .replace(/^\w/, (character) => character.toUpperCase())
  );
}

export function RequestDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { can } = useAuth();
  const { notify } = useToast();
  const [dialog, setDialog] = useState<'approve' | 'reject' | 'reschedule' | 'materialize' | null>(null);
  const [showAllAudits, setShowAllAudits] = useState(false);

  const detailQuery = useQuery({
    queryKey: ['request', id],
    queryFn: () => api<AppointmentRequestDetail>(`/requests/${id}`),
    enabled: Boolean(id),
  });

  const notificationAction = useMutation({
    mutationFn: ({ notificationId, action }: { notificationId: string; action: 'resend' | 'simulate-delivery' }) =>
      api(`/notifications/${notificationId}/${action}`, { method: 'POST' }),
    onSuccess: (_data, variables) => {
      void queryClient.invalidateQueries({ queryKey: ['request', id] });
      void queryClient.invalidateQueries({ queryKey: ['stats'] });
      notify(variables.action === 'resend' ? 'Notification re-queued.' : 'Delivery simulated.');
    },
    onError: (caught) => notify(errorMessage(caught), 'error'),
  });

  if (detailQuery.isLoading) return <LoadingBlock label="Loading request…" />;

  if (detailQuery.isError || !detailQuery.data) {
    return (
      <Card className="mx-auto mt-8 max-w-xl p-8 text-center">
        <p className="text-base font-bold text-slate-900">Request unavailable</p>
        <p className="mt-1 text-sm text-slate-500">
          {detailQuery.isError ? errorMessage(detailQuery.error) : 'This request could not be found.'}
        </p>
        <Button className="mt-5" variant="outline" onClick={() => navigate('/register')}>
          Back to register
        </Button>
      </Card>
    );
  }

  const request = detailQuery.data;
  const canDecide = can('request:decide') && request.status === 'PENDING_APPROVAL';
  const canSchedule = can('request:schedule') && request.status === 'APPROVED';
  const slotPassed =
    request.status === 'APPROVED' &&
    isSlotInPast(request.assignedDate, request.assignedTime);
  const canMaterialize = can('request:materialize') && slotPassed;
  const audits = showAllAudits ? request.audits : request.audits.slice(0, 8);
  const target = {
    id: request.id,
    reference: request.reference,
    visitorName: request.visitorName,
    visitorMobile: request.visitorMobile,
    visitorEmail: request.visitorEmail,
    purpose: request.purpose,
    status: request.status,
    assignedDate: request.assignedDate,
    assignedTime: request.assignedTime,
  };

  return (
    <>
      <PageHeader
        title={request.visitorName}
        description={`${request.reference} · Requested ${formatDateTime(request.requestDate)}`}
        breadcrumb={
          <Link
            to="/register"
            className="mb-2 inline-flex items-center gap-1 text-xs font-semibold text-brand-700 hover:underline"
          >
            <ArrowLeft className="size-3.5" />
            Back to register
          </Link>
        }
        actions={
          <>
            <Button variant="outline" className="no-print" onClick={() => window.print()}>
              <Printer className="size-4" />
              Print
            </Button>
            <StatusBadge status={request.status} />
          </>
        }
      />

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="space-y-5">
          <SectionCard title="Visit particulars" icon={ClipboardList}>
            <div className="grid gap-4 text-sm sm:grid-cols-2">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Purpose of visit</p>
                <p className="mt-1 whitespace-pre-wrap text-[13px] leading-relaxed text-slate-700">
                  {request.purpose}
                </p>
              </div>
              <div className="space-y-3">
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                    Persons accompanying
                  </p>
                  <p className="mt-0.5 text-[13px] text-slate-700">
                    {request.accompanyingCount > 0
                      ? `${request.accompanyingCount}${request.accompanyingNames ? ` — ${request.accompanyingNames}` : ''}`
                      : 'None'}
                  </p>
                </div>
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                    Documents for reference
                  </p>
                  <p className="mt-0.5 text-[13px] text-slate-700">{request.documentsReference ?? '—'}</p>
                </div>
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Remarks</p>
                  <p className="mt-0.5 text-[13px] text-slate-700">{request.remarks ?? '—'}</p>
                </div>
              </div>
            </div>
          </SectionCard>

          <SectionCard
            title="Appointment"
            description="Slot assignment and decision details."
            icon={CalendarClock}
          >
            {request.status === 'REJECTED' ? (
              <Alert tone="error" title={`Rejected by ${request.decidedByName ?? 'Secretary'}`}>
                {request.rejectionReason ?? 'No reason recorded.'}
                <span className="mt-1 block text-[11px] opacity-80">
                  Decision recorded {formatDateTime(request.decisionAt)}
                </span>
              </Alert>
            ) : request.status === 'PENDING_APPROVAL' ? (
              <Alert tone="warning" title="Awaiting the Secretary's decision">
                The request is in the pending queue. No slot has been assigned yet.
              </Alert>
            ) : (
              <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
                <div className="rounded-xl border border-brand-100 bg-brand-50/60 p-4">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-brand-600">
                    Assigned slot
                  </p>
                  <p className="mt-1 text-lg font-bold text-brand-900">
                    {formatDate(request.assignedDate)}
                  </p>
                  <p className="text-sm font-semibold text-brand-700">
                    {formatTime(request.assignedTime)}
                  </p>
                  <p className="mt-2 text-[11px] text-brand-700/70">
                    {request.slotAvailability.booked} other appointment(s) at this time
                    {request.slotAvailability.capacity !== null
                      ? ` · capacity ${request.slotAvailability.capacity}`
                      : ''}
                  </p>
                </div>
                <div className="space-y-2 text-[13px]">
                  <DetailRow label="Approved by" value={request.decidedByName ?? '—'} />
                  <DetailRow label="Decision time" value={formatDateTime(request.decisionAt)} />
                  <DetailRow label="Entered by" value={request.enteredByName} />
                  {request.decisionNote ? (
                    <DetailRow label="Decision note" value={request.decisionNote} />
                  ) : null}
                  {request.materializedAt ? (
                    <>
                      <DetailRow label="Materialized at" value={formatDateTime(request.materializedAt)} />
                      <DetailRow label="Time in" value={formatTime(request.timeIn)} />
                    </>
                  ) : null}
                </div>
              </div>
            )}

            {request.status === 'APPROVED' && request.slotAvailability.capacity !== null ? (
              <div className="mt-4">
                <Alert
                  tone={request.slotAvailability.available ? 'info' : 'warning'}
                  title={
                    request.slotAvailability.available
                      ? 'Slot within capacity'
                      : 'Slot capacity exceeded'
                  }
                >
                  {request.slotAvailability.booked} booked of {request.slotAvailability.capacity} allowed.
                </Alert>
              </div>
            ) : null}
          </SectionCard>

          <SectionCard
            title="Notifications"
            description="Delivery status per channel. Failures can be retried without changing the decision."
            icon={Send}
            bodyClassName="p-0"
          >
            {request.notifications.length === 0 ? (
              <EmptyState
                title="No notifications yet"
                description="Confirmations are queued automatically when the Secretary approves the appointment."
              />
            ) : (
              <div className="overflow-x-auto">
                <table className="table-base">
                  <thead>
                    <tr>
                      <th>Channel</th>
                      <th>Recipient</th>
                      <th>Status</th>
                      <th>Attempts</th>
                      <th>Updated</th>
                      <th>Error</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {request.notifications.map((notification) => (
                      <NotificationRowView
                        key={notification.id}
                        notification={notification}
                        canManage={can('notification:resend')}
                        busy={notificationAction.isPending}
                        onResend={() =>
                          notificationAction.mutate({
                            notificationId: notification.id,
                            action: 'resend',
                          })
                        }
                        onSimulate={() =>
                          notificationAction.mutate({
                            notificationId: notification.id,
                            action: 'simulate-delivery',
                          })
                        }
                      />
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </SectionCard>

          <SectionCard
            title="Visitor history"
            description="All requests from this visitor, newest first."
            icon={History}
            bodyClassName="p-0"
          >
            {request.history.length === 0 ? (
              <EmptyState title="First request from this visitor" />
            ) : (
              <div className="overflow-x-auto">
                <table className="table-base">
                  <thead>
                    <tr>
                      <th>Reference</th>
                      <th>Requested</th>
                      <th>Purpose</th>
                      <th>Status</th>
                      <th>Appointment</th>
                    </tr>
                  </thead>
                  <tbody>
                    {request.history.map((item) => (
                      <tr key={item.id} className={item.id === request.id ? 'bg-brand-50/40' : ''}>
                        <td>
                          <Link
                            to={`/requests/${item.id}`}
                            className="font-mono text-[11px] font-semibold text-brand-700 hover:underline"
                          >
                            {item.reference}
                          </Link>
                          {item.id === request.id ? (
                            <span className="ml-1.5 text-[9px] font-bold uppercase text-brand-500">
                              current
                            </span>
                          ) : null}
                        </td>
                        <td className="whitespace-nowrap text-xs">
                          {formatDate(item.requestDate.slice(0, 10))}
                        </td>
                        <td className="max-w-xs text-xs">{truncate(item.purpose, 90)}</td>
                        <td>
                          <StatusBadge status={item.status} short />
                        </td>
                        <td className="whitespace-nowrap text-xs">
                          {item.assignedDate
                            ? `${formatDate(item.assignedDate)} · ${formatTime(item.assignedTime)}`
                            : '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </SectionCard>

          <SectionCard
            title="Audit trail"
            description="Every action is hash-chained and cannot be edited."
            icon={ShieldCheck}
            actions={
              request.audits.length > 8 ? (
                <Button variant="ghost" size="sm" onClick={() => setShowAllAudits((value) => !value)}>
                  {showAllAudits ? 'Show recent' : `Show all ${request.audits.length}`}
                </Button>
              ) : undefined
            }
          >
            {audits.length === 0 ? (
              <EmptyState title="No audit entries" />
            ) : (
              <ol className="space-y-3">
                {audits.map((entry) => (
                  <li key={entry.id} className="flex gap-3">
                    <span className="mt-1 flex size-6 shrink-0 items-center justify-center rounded-full bg-slate-100 text-slate-400">
                      <Clock3 className="size-3.5" />
                    </span>
                    <div className="min-w-0 flex-1 border-b border-slate-100 pb-2.5">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="text-[13px] font-semibold text-slate-800">
                          {actionLabel(entry.action)}
                        </p>
                        <span className="text-[10px] text-slate-400">
                          {entry.actorName} · {formatDateTime(entry.createdAt)}
                        </span>
                      </div>
                      {entry.before || entry.after ? (
                        <details className="mt-1">
                          <summary className="cursor-pointer text-[10px] font-medium text-slate-400 hover:text-slate-600">
                            View change details
                          </summary>
                          <pre className="mt-1 max-h-40 overflow-auto rounded bg-slate-50 p-2 text-[10px] text-slate-500">
                            {JSON.stringify({ before: entry.before, after: entry.after }, null, 2)}
                          </pre>
                        </details>
                      ) : null}
                    </div>
                  </li>
                ))}
              </ol>
            )}
          </SectionCard>
        </div>

        <aside className="space-y-5">
          <SectionCard title="Actions" icon={CheckCircle2}>
            <div className="space-y-2">
              {canDecide ? (
                <>
                  <Button className="w-full" onClick={() => setDialog('approve')}>
                    <CheckCircle2 className="size-4" />
                    Approve &amp; assign slot
                  </Button>
                  <Button
                    variant="outline"
                    className="w-full text-rose-600"
                    onClick={() => setDialog('reject')}
                  >
                    <XCircle className="size-4" />
                    Reject request
                  </Button>
                </>
              ) : null}
              {canSchedule ? (
                <>
                  <Button variant="secondary" className="w-full" onClick={() => setDialog('reschedule')}>
                    <RotateCw className="size-4" />
                    Reschedule
                  </Button>
                  {canMaterialize ? (
                    <Button className="w-full" onClick={() => setDialog('materialize')}>
                      <LogIn className="size-4" />
                      Mark materialized
                    </Button>
                  ) : null}
                </>
              ) : null}
              {!canDecide && !canSchedule ? (
                <p className="rounded-lg bg-slate-50 px-3 py-2 text-[11px] leading-relaxed text-slate-500">
                  {request.status === 'PENDING_APPROVAL'
                    ? 'Only the Secretary can approve or reject this request.'
                    : request.status === 'APPROVED'
                      ? 'The appointment is confirmed. Changes are restricted to the Secretary.'
                      : 'This request is final. Its record remains available for audit and reporting.'}
                </p>
              ) : null}
              {request.status === 'APPROVED' && !slotPassed && can('request:materialize') ? (
                <p className="text-[10px] leading-relaxed text-slate-400">
                  “Mark materialized” becomes available after the assigned slot.
                </p>
              ) : null}
            </div>
          </SectionCard>

          <Card className="p-4">
            <div className="flex items-center gap-2">
              <span className="flex size-9 items-center justify-center rounded-full bg-brand-50 text-brand-700">
                <UserRound className="size-4" />
              </span>
              <div className="min-w-0">
                <p className="truncate text-sm font-bold text-slate-900">{request.visitor.name}</p>
                <p className="truncate text-[11px] text-slate-500">
                  {request.visitor.designation ?? 'No designation'}
                </p>
              </div>
            </div>
            <dl className="mt-3 space-y-2 text-[12px]">
              <IconRow icon={Building2} value={request.visitor.organization ?? '—'} />
              <IconRow icon={Phone} value={request.visitor.mobile} />
              <IconRow icon={Mail} value={request.visitor.email} />
              <IconRow icon={MapPin} value={request.visitor.address ?? '—'} />
            </dl>
            <div className="mt-3 border-t border-slate-100 pt-2 text-[11px] text-slate-400">
              <p>{request.visitor.requestCount} request(s) on record</p>
              <p>
                Last visit:{' '}
                {request.visitor.lastVisitDate ? formatDate(request.visitor.lastVisitDate) : '—'}
              </p>
            </div>
          </Card>

          <Card className="p-4">
            <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Record</p>
            <dl className="mt-2 space-y-1.5 text-[12px]">
              <DetailRow label="Reference" value={request.reference} />
              <DetailRow label="Entered by" value={request.enteredByName} />
              <DetailRow label="Entered on" value={formatDateTime(request.requestDate)} />
              <DetailRow label="Last updated" value={timeAgo(request.updatedAt)} />
            </dl>
          </Card>

          <Card className="p-4">
            <p className="flex items-center gap-1.5 text-[11px] font-semibold text-slate-600">
              <FileText className="size-3.5 text-slate-400" />
              Confirmation message
            </p>
            <div className="mt-2 space-y-1 text-[11px] text-slate-500">
              <p>Email: {request.visitorEmail}</p>
              <p>WhatsApp: {request.visitor.mobile}</p>
              <p className="text-slate-400">
                Uses the active templates configured by the administrator.
              </p>
            </div>
          </Card>
        </aside>
      </div>

      {dialog === 'approve' ? (
        <ApproveDialog open onClose={() => setDialog(null)} request={target} />
      ) : null}
      {dialog === 'reject' ? (
        <RejectDialog open onClose={() => setDialog(null)} request={target} />
      ) : null}
      {dialog === 'reschedule' ? (
        <ApproveDialog open mode="reschedule" onClose={() => setDialog(null)} request={target} />
      ) : null}
      {dialog === 'materialize' ? (
        <MaterializeDialog open onClose={() => setDialog(null)} request={target} />
      ) : null}
    </>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="text-slate-400">{label}</dt>
      <dd className="text-right font-medium text-slate-700">{value}</dd>
    </div>
  );
}

function IconRow({ icon: Icon, value }: { icon: typeof Phone; value: string }) {
  return (
    <div className="flex items-start gap-2 text-slate-600">
      <Icon className="mt-0.5 size-3.5 shrink-0 text-slate-400" />
      <span className="break-words">{value}</span>
    </div>
  );
}

function NotificationRowView({
  notification,
  canManage,
  busy,
  onResend,
  onSimulate,
}: {
  notification: NotificationRecord;
  canManage: boolean;
  busy: boolean;
  onResend: () => void;
  onSimulate: () => void;
}) {
  const isEmail = notification.channel === 'EMAIL';
  return (
    <tr>
      <td>
        <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-700">
          {isEmail ? <Mail className="size-3.5 text-slate-400" /> : <MessageCircle className="size-3.5 text-emerald-500" />}
          {isEmail ? 'Email' : 'WhatsApp'}
        </span>
      </td>
      <td className="max-w-[220px] break-all text-xs">{notification.recipient || '—'}</td>
      <td>
        <NotificationBadge status={notification.status} />
      </td>
      <td className="text-xs tabular-nums">
        {notification.attempt}/{notification.maxAttempts}
      </td>
      <td className="whitespace-nowrap text-[11px] text-slate-500">
        {formatDateTime(notification.updatedAt)}
      </td>
      <td className="max-w-[220px] text-[11px] text-rose-600">
        {notification.errorMessage ? truncate(notification.errorMessage, 90) : '—'}
      </td>
      <td>
        {canManage ? (
          <div className="no-print flex flex-wrap justify-end gap-1">
            <Button variant="ghost" size="sm" onClick={onResend} disabled={busy || !notification.recipient}>
              <RotateCw className="size-3" />
              Resend
            </Button>
            {notification.status !== 'DELIVERED' && notification.recipient ? (
              <Button variant="ghost" size="sm" onClick={onSimulate} disabled={busy}>
                <Badge tone="slate">Demo</Badge>
              </Button>
            ) : null}
          </div>
        ) : null}
      </td>
    </tr>
  );
}
