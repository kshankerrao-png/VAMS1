import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { CheckCircle2, ClipboardCheck, Clock3, Mail, Phone, XCircle } from 'lucide-react';
import type { DashboardStats, Paginated, RequestListRow } from '@vams/shared';
import { api } from '../lib/api';
import { formatDate, timeAgo, truncate } from '../lib/format';
import {
  Badge,
  Button,
  EmptyState,
  LoadingBlock,
  PageHeader,
  Pagination,
  SectionCard,
  StatusBadge,
} from '../components/ui';
import { ApproveDialog, RejectDialog } from '../components/DecisionDialogs';

export function QueuePage() {
  const [page, setPage] = useState(1);
  const [approveTarget, setApproveTarget] = useState<RequestListRow | null>(null);
  const [rejectTarget, setRejectTarget] = useState<RequestListRow | null>(null);

  const queueQuery = useQuery({
    queryKey: ['requests', 'queue', page],
    queryFn: () =>
      api<Paginated<RequestListRow>>(
        `/requests?status=PENDING_APPROVAL&page=${page}&pageSize=8&sort=requestDate&dir=asc`,
      ),
  });

  const statsQuery = useQuery({
    queryKey: ['stats'],
    queryFn: () => api<DashboardStats>('/requests/stats'),
  });

  const data = queueQuery.data;
  const stats = statsQuery.data;

  return (
    <>
      <PageHeader
        title="Pending approval queue"
        description="Review each request and assign a slot. Oldest requests are shown first."
        actions={
          <>
            <Badge tone="amber">{stats?.byStatus.PENDING_APPROVAL ?? 0} pending</Badge>
            <Link to="/register?status=PENDING_APPROVAL">
              <Button variant="outline">Open in register</Button>
            </Link>
          </>
        }
      />

      {stats && stats.pendingOldestDays > 2 ? (
        <p className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-3.5 py-2 text-xs text-amber-800">
          The oldest pending request has been waiting {stats.pendingOldestDays} days.
        </p>
      ) : null}

      <SectionCard
        title="Requests awaiting a decision"
        description={
          data ? `${data.total} request(s) in the queue` : 'Loading the queue...'
        }
        icon={ClipboardCheck}
        bodyClassName="p-0"
      >
        {queueQuery.isLoading ? (
          <LoadingBlock />
        ) : !data || data.items.length === 0 ? (
          <EmptyState
            title="The queue is clear"
            description="New requests entered at the peshi will appear here for review."
            icon={CheckCircle2}
          />
        ) : (
          <div className="divide-y divide-slate-100">
            {data.items.map((row) => (
              <div key={row.id} className="px-5 py-4">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <Link
                        to={`/requests/${row.id}`}
                        className="text-sm font-bold text-slate-900 hover:text-brand-700"
                      >
                        {row.visitorName}
                      </Link>
                      <span className="font-mono text-[10px] text-slate-400">{row.reference}</span>
                      <StatusBadge status={row.status} short />
                    </div>
                    <p className="mt-0.5 text-xs text-slate-500">
                      {[row.visitorDesignation, row.visitorOrganization].filter(Boolean).join(' · ') || '--'}
                    </p>
                    <p className="mt-2 max-w-3xl text-[13px] leading-relaxed text-slate-700">
                      {truncate(row.purpose, 220)}
                    </p>
                    <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-slate-400">
                      <span className="inline-flex items-center gap-1">
                        <Phone className="size-3" />
                        {row.visitorMobile}
                      </span>
                      <span className="inline-flex items-center gap-1">
                        <Mail className="size-3" />
                        {row.visitorEmail}
                      </span>
                      <span>Entered by {row.enteredByName}</span>
                      <span className="inline-flex items-center gap-1">
                        <Clock3 className="size-3" />
                        {timeAgo(row.requestDate)}
                      </span>
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <Link to={`/requests/${row.id}`}>
                      <Button variant="outline" size="sm">
                        Review
                      </Button>
                    </Link>
                    <Button size="sm" onClick={() => setApproveTarget(row)}>
                      <CheckCircle2 className="size-3.5" />
                      Approve
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="text-rose-600 hover:bg-rose-50"
                      onClick={() => setRejectTarget(row)}
                    >
                      <XCircle className="size-3.5" />
                      Reject
                    </Button>
                  </div>
                </div>
                {row.requestDay ? (
                  <p className="mt-2 text-[10px] text-slate-400">Requested on {formatDate(row.requestDay)}</p>
                ) : null}
              </div>
            ))}
          </div>
        )}
        {data && data.total > 0 ? (
          <Pagination
            page={data.page}
            totalPages={data.totalPages}
            total={data.total}
            pageSize={data.pageSize}
            onPage={setPage}
          />
        ) : null}
      </SectionCard>

      {approveTarget ? (
        <ApproveDialog
          open={Boolean(approveTarget)}
          onClose={() => setApproveTarget(null)}
          request={{
            id: approveTarget.id,
            reference: approveTarget.reference,
            visitorName: approveTarget.visitorName,
            visitorMobile: approveTarget.visitorMobile,
            visitorEmail: approveTarget.visitorEmail,
            purpose: approveTarget.purpose,
            status: approveTarget.status,
            assignedDate: approveTarget.assignedDate,
            assignedTime: approveTarget.assignedTime,
          }}
        />
      ) : null}

      {rejectTarget ? (
        <RejectDialog
          open={Boolean(rejectTarget)}
          onClose={() => setRejectTarget(null)}
          request={{
            id: rejectTarget.id,
            reference: rejectTarget.reference,
            visitorName: rejectTarget.visitorName,
            visitorMobile: rejectTarget.visitorMobile,
            visitorEmail: rejectTarget.visitorEmail,
            purpose: rejectTarget.purpose,
            status: rejectTarget.status,
            assignedDate: rejectTarget.assignedDate,
            assignedTime: rejectTarget.assignedTime,
          }}
        />
      ) : null}
    </>
  );
}

