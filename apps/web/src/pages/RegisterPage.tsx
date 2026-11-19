import { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ArrowDownUp,
  BookOpen,
  ChevronDown,
  Download,
  Filter,
  Pencil,
  RotateCcw,
  Search,
} from 'lucide-react';
import type { DashboardStats, Paginated, RequestListRow, VisitorProfile } from '@vams/shared';
import { REQUEST_STATUSES, STATUS_SHORT_LABELS } from '@vams/shared';
import { useAuth } from '../auth/AuthProvider';
import { api, downloadFile, errorMessage } from '../lib/api';
import { formatDate, formatDateTime, formatTime, truncate } from '../lib/format';
import { useToast } from '../components/Toast';
import {
  Badge,
  Button,
  EmptyState,
  Input,
  LoadingBlock,
  Modal,
  PageHeader,
  Pagination,
  SectionCard,
  Select,
  StatusBadge,
} from '../components/ui';

type SortColumn = 'requestDate' | 'assignedDate' | 'visitorName' | 'status' | 'decisionAt';

const SORT_LABELS: Record<SortColumn, string> = {
  requestDate: 'Requested',
  assignedDate: 'Appointment',
  visitorName: 'Visitor',
  status: 'Status',
  decisionAt: 'Decision',
};

export function RegisterPage() {
  const { can } = useAuth();
  const navigate = useNavigate();
  const { notify } = useToast();
  const [searchParams, setSearchParams] = useSearchParams();
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [editingVisitorId, setEditingVisitorId] = useState<string | null>(null);

  const sort = (searchParams.get('sort') as SortColumn | null) ?? 'requestDate';
  const dir = (searchParams.get('dir') as 'asc' | 'desc' | null) ?? 'desc';
  const statusFilter = searchParams.get('status') ?? '';

  const update = (patch: Record<string, string | undefined>) => {
    const next = new URLSearchParams(searchParams);
    for (const [key, value] of Object.entries(patch)) {
      if (value === undefined || value === '') next.delete(key);
      else next.set(key, value);
    }
    if (!('page' in patch)) next.set('page', '1');
    setSearchParams(next, { replace: true });
  };

  const queryString = searchParams.toString();
  const listQuery = useQuery({
    queryKey: ['requests', 'register', queryString],
    queryFn: () => api<Paginated<RequestListRow>>(`/requests?${queryString}`),
  });
  const statsQuery = useQuery({
    queryKey: ['stats'],
    queryFn: () => api<DashboardStats>('/requests/stats'),
  });

  const data = listQuery.data;
  const stats = statsQuery.data;

  const toggleSort = (column: SortColumn) => {
    if (sort === column) {
      update({ dir: dir === 'asc' ? 'desc' : 'asc' });
    } else {
      update({ sort: column, dir: column === 'visitorName' ? 'asc' : 'desc' });
    }
  };

  const exportCsv = async () => {
    const params = new URLSearchParams(searchParams);
    params.delete('page');
    params.delete('pageSize');
    setExporting(true);
    try {
      await downloadFile(
        `/register/export?${params.toString()}`,
        `vams-register-${new Date().toISOString().slice(0, 10)}.csv`,
      );
      notify('Register export downloaded. The export is recorded in the audit log.');
    } catch (caught) {
      notify(errorMessage(caught), 'error');
    } finally {
      setExporting(false);
    }
  };

  const resetFilters = () => {
    setSearchParams(new URLSearchParams(), { replace: true });
  };

  return (
    <>
      <PageHeader
        title="Visitor appointment register"
        description="Search and filter the complete register. Click any row to open the request, decision trail and delivery status."
        actions={
          <>
            {can('register:export') ? (
              <Button variant="outline" onClick={() => void exportCsv()} loading={exporting}>
                <Download className="size-4" />
                Export CSV
              </Button>
            ) : null}
            {can('request:create') ? (
              <Link to="/requests/new">
                <Button>New request</Button>
              </Link>
            ) : null}
          </>
        }
      />

      <SectionCard
        title="Filters"
        description="Combine any filters; results update immediately."
        icon={Filter}
        actions={
          <>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setFiltersOpen((open) => !open)}
            >
              <ChevronDown className={`size-3.5 transition ${filtersOpen ? 'rotate-180' : ''}`} />
              {filtersOpen ? 'Hide advanced' : 'Advanced'}
            </Button>
            <Button variant="ghost" size="sm" onClick={resetFilters}>
              <RotateCcw className="size-3.5" />
              Reset
            </Button>
          </>
        }
      >
        <form
          className="space-y-3"
          onSubmit={(event) => {
            event.preventDefault();
            const form = new FormData(event.currentTarget);
            update({
              q: String(form.get('q') ?? ''),
              organization: String(form.get('organization') ?? ''),
              mobile: String(form.get('mobile') ?? ''),
            });
          }}
        >
          <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_180px_170px_170px_auto]">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
              <input
                name="q"
                defaultValue={searchParams.get('q') ?? ''}
                key={`q-${searchParams.get('q') ?? ''}`}
                placeholder="Search name, mobile, email, purpose or reference"
                className="input-base pl-9"
                aria-label="Search register"
              />
            </div>
            <Select
              value={statusFilter}
              onChange={(event) => update({ status: event.target.value })}
              aria-label="Filter by status"
            >
              <option value="">All statuses</option>
              {REQUEST_STATUSES.map((status) => (
                <option key={status} value={status}>
                  {STATUS_SHORT_LABELS[status]}
                  {stats ? ` (${stats.byStatus[status]})` : ''}
                </option>
              ))}
            </Select>
            <div className="relative">
              <input
                name="organization"
                defaultValue={searchParams.get('organization') ?? ''}
                key={`org-${searchParams.get('organization') ?? ''}`}
                placeholder="Organization"
                className="input-base"
                aria-label="Filter by organization"
              />
            </div>
            <div className="relative">
              <input
                name="mobile"
                defaultValue={searchParams.get('mobile') ?? ''}
                key={`mobile-${searchParams.get('mobile') ?? ''}`}
                placeholder="Mobile number"
                className="input-base"
                aria-label="Filter by mobile number"
              />
            </div>
            <Button type="submit" variant="secondary">
              Apply
            </Button>
          </div>

          {filtersOpen ? (
            <div className="grid gap-3 border-t border-slate-100 pt-3 sm:grid-cols-2 lg:grid-cols-4">
              <label className="block text-xs">
                <span className="label-base">Visitor name</span>
                <Input
                  defaultValue={searchParams.get('name') ?? ''}
                  key={`name-${searchParams.get('name') ?? ''}`}
                  onBlur={(event) => update({ name: event.target.value })}
                  placeholder="Exact or partial"
                />
              </label>
              <label className="block text-xs">
                <span className="label-base">Designation</span>
                <Input
                  defaultValue={searchParams.get('designation') ?? ''}
                  key={`desig-${searchParams.get('designation') ?? ''}`}
                  onBlur={(event) => update({ designation: event.target.value })}
                  placeholder="e.g. Chief Engineer"
                />
              </label>
              <label className="block text-xs">
                <span className="label-base">Email</span>
                <Input
                  defaultValue={searchParams.get('email') ?? ''}
                  key={`email-${searchParams.get('email') ?? ''}`}
                  onBlur={(event) => update({ email: event.target.value })}
                  placeholder="name@example.com"
                />
              </label>
              <label className="block text-xs">
                <span className="label-base">Entered by</span>
                <Input
                  defaultValue={searchParams.get('enteredBy') ?? ''}
                  key={`entered-${searchParams.get('enteredBy') ?? ''}`}
                  onBlur={(event) => update({ enteredBy: event.target.value })}
                  placeholder="Staff name"
                />
              </label>
              <div className="grid grid-cols-2 gap-2">
                <label className="block text-xs">
                  <span className="label-base">Requested from</span>
                  <Input
                    type="date"
                    defaultValue={searchParams.get('from') ?? ''}
                    key={`from-${searchParams.get('from') ?? ''}`}
                    onChange={(event) => update({ from: event.target.value })}
                  />
                </label>
                <label className="block text-xs">
                  <span className="label-base">Requested to</span>
                  <Input
                    type="date"
                    defaultValue={searchParams.get('to') ?? ''}
                    key={`to-${searchParams.get('to') ?? ''}`}
                    onChange={(event) => update({ to: event.target.value })}
                  />
                </label>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <label className="block text-xs">
                  <span className="label-base">Appointment from</span>
                  <Input
                    type="date"
                    defaultValue={searchParams.get('assignedFrom') ?? ''}
                    key={`af-${searchParams.get('assignedFrom') ?? ''}`}
                    onChange={(event) => update({ assignedFrom: event.target.value })}
                  />
                </label>
                <label className="block text-xs">
                  <span className="label-base">Appointment to</span>
                  <Input
                    type="date"
                    defaultValue={searchParams.get('assignedTo') ?? ''}
                    key={`at-${searchParams.get('assignedTo') ?? ''}`}
                    onChange={(event) => update({ assignedTo: event.target.value })}
                  />
                </label>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <label className="block text-xs">
                  <span className="label-base">Decided from</span>
                  <Input
                    type="date"
                    defaultValue={searchParams.get('decidedFrom') ?? ''}
                    key={`df-${searchParams.get('decidedFrom') ?? ''}`}
                    onChange={(event) => update({ decidedFrom: event.target.value })}
                  />
                </label>
                <label className="block text-xs">
                  <span className="label-base">Decided to</span>
                  <Input
                    type="date"
                    defaultValue={searchParams.get('decidedTo') ?? ''}
                    key={`dt-${searchParams.get('decidedTo') ?? ''}`}
                    onChange={(event) => update({ decidedTo: event.target.value })}
                  />
                </label>
              </div>
            </div>
          ) : null}
        </form>

        <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-slate-100 pt-3">
          <button
            type="button"
            onClick={() => update({ status: '' })}
            className={`rounded-full px-3 py-1 text-[11px] font-semibold ring-1 ring-inset transition ${
              statusFilter === ''
                ? 'bg-brand-700 text-white ring-brand-700'
                : 'bg-white text-slate-600 ring-slate-200 hover:bg-slate-50'
            }`}
          >
            All
          </button>
          {REQUEST_STATUSES.map((status) => (
            <button
              key={status}
              type="button"
              onClick={() => update({ status })}
              className={`rounded-full px-3 py-1 text-[11px] font-semibold ring-1 ring-inset transition ${
                statusFilter === status
                  ? 'bg-brand-700 text-white ring-brand-700'
                  : 'bg-white text-slate-600 ring-slate-200 hover:bg-slate-50'
              }`}
            >
              {STATUS_SHORT_LABELS[status]}
              {stats ? <span className="ml-1 tabular-nums opacity-70">{stats.byStatus[status]}</span> : null}
            </button>
          ))}
        </div>
      </SectionCard>

      <div className="mt-5">
        <SectionCard
          title="Register"
          description={
            data
              ? `${data.total} record(s) match the current filters`
              : 'Loading register records...'
          }
          icon={BookOpen}
          bodyClassName="p-0"
        >
          {listQuery.isLoading ? (
            <LoadingBlock />
          ) : listQuery.isError ? (
            <div className="p-5">
              <EmptyState title="The register could not be loaded" description={errorMessage(listQuery.error)} />
            </div>
          ) : !data || data.items.length === 0 ? (
            <EmptyState
              title="No records match these filters"
              description="Try clearing the search or widening the date range."
              action={
                <Button variant="outline" size="sm" onClick={resetFilters}>
                  Reset filters
                </Button>
              }
            />
          ) : (
            <div className="overflow-x-auto">
              <table className="table-base">
                <thead>
                  <tr>
                    <th>Reference</th>
                    {(Object.keys(SORT_LABELS) as SortColumn[]).map((column) => (
                      <th key={column} className={column === 'requestDate' || column === 'visitorName' ? '' : ''}>
                        <button
                          type="button"
                          onClick={() => toggleSort(column)}
                          className="inline-flex items-center gap-1 hover:text-slate-700"
                        >
                          {SORT_LABELS[column]}
                          <ArrowDownUp
                            className={`size-3 ${sort === column ? 'text-brand-600' : 'text-slate-300'}`}
                          />
                        </button>
                      </th>
                    ))}
                    <th>Organization</th>
                    <th>Purpose</th>
                    <th>Notifications</th>
                  </tr>
                </thead>
                <tbody>
                  {data.items.map((row) => (
                    <tr
                      key={row.id}
                      className="cursor-pointer"
                      onClick={() => navigate(`/requests/${row.id}`)}
                    >
                      <td>
                        <Link
                          to={`/requests/${row.id}`}
                          className="font-mono text-[11px] font-semibold text-brand-700 hover:underline"
                          onClick={(event) => event.stopPropagation()}
                        >
                          {row.reference}
                        </Link>
                      </td>
                      <td className="whitespace-nowrap text-xs">{formatDate(row.requestDay)}</td>
                      <td className="whitespace-nowrap text-xs">
                        {row.assignedDate ? (
                          <span>
                            {formatDate(row.assignedDate)}
                            <span className="block text-[10px] text-slate-400">
                              {formatTime(row.assignedTime)}
                            </span>
                          </span>
                        ) : (
                          <span className="text-slate-300">--</span>
                        )}
                      </td>
                      <td>
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <span className="block text-[13px] font-semibold text-slate-800">
                              {row.visitorName}
                            </span>
                            <span className="text-[10px] text-slate-400">
                              {row.visitorDesignation ?? '--'}
                            </span>
                          </div>
                          {can('visitor:update') ? (
                            <button
                              type="button"
                              title="Edit visitor details"
                              aria-label={`Edit ${row.visitorName}`}
                              className="rounded p-1 text-slate-400 transition hover:bg-slate-100 hover:text-brand-700"
                              onClick={(event) => {
                                event.stopPropagation();
                                setEditingVisitorId(row.visitorId);
                              }}
                            >
                              <Pencil className="size-3.5" />
                            </button>
                          ) : null}
                        </div>
                      </td>
                      <td>
                        <StatusBadge status={row.status} short />
                        {row.decidedByName ? (
                          <span className="mt-1 block text-[10px] text-slate-400">
                            by {row.decidedByName}
                          </span>
                        ) : null}
                      </td>
                      <td className="whitespace-nowrap text-xs">
                        {row.decisionAt ? formatDateTime(row.decisionAt) : '--'}
                      </td>
                      <td className="max-w-[190px] text-xs text-slate-500">
                        {row.visitorOrganization ?? '--'}
                      </td>
                      <td className="max-w-[280px] text-xs text-slate-600">{truncate(row.purpose, 90)}</td>
                      <td>
                        <div className="flex flex-wrap items-center gap-1">
                          {row.notificationSummary.failed > 0 ? (
                            <Badge tone="red">{row.notificationSummary.failed} failed</Badge>
                          ) : null}
                          {row.notificationSummary.pending > 0 ? (
                            <Badge tone="amber">{row.notificationSummary.pending} queued</Badge>
                          ) : null}
                          {row.notificationSummary.delivered > 0 ? (
                            <Badge tone="green">{row.notificationSummary.delivered} delivered</Badge>
                          ) : null}
                          {row.notificationSummary.total === 0 ? (
                            <span className="text-[10px] text-slate-300">--</span>
                          ) : null}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {data && data.total > 0 ? (
            <Pagination
              page={data.page}
              totalPages={data.totalPages}
              total={data.total}
              pageSize={data.pageSize}
              onPage={(next) => update({ page: String(next) })}
            />
          ) : null}
        </SectionCard>
      </div>

      <VisitorEditDialog
        visitorId={editingVisitorId}
        onClose={() => setEditingVisitorId(null)}
      />
    </>
  );
}

function VisitorEditDialog({
  visitorId,
  onClose,
}: {
  visitorId: string | null;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const { notify } = useToast();

  const detailQuery = useQuery({
    queryKey: ['visitor', visitorId],
    queryFn: () => api<{ visitor: VisitorProfile; history: unknown[] }>(`/visitors/${visitorId}`),
    enabled: Boolean(visitorId),
  });

  const mutation = useMutation({
    mutationFn: (values: Record<string, string>) =>
      api<VisitorProfile>(`/visitors/${visitorId}`, { method: 'PATCH', body: values }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['requests'] });
      void queryClient.invalidateQueries({ queryKey: ['stats'] });
      if (visitorId) void queryClient.invalidateQueries({ queryKey: ['visitor', visitorId] });
      notify('Visitor details updated.');
      onClose();
    },
  });

  const visitor = detailQuery.data?.visitor;

  return (
    <Modal
      open={Boolean(visitorId)}
      onClose={onClose}
      title="Edit visitor details"
      description="Changes apply to this visitor's profile and every request linked to it."
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button
            type="submit"
            form="visitor-edit-form"
            loading={mutation.isPending}
            disabled={!visitor}
          >
            Save changes
          </Button>
        </>
      }
    >
      {detailQuery.isLoading ? (
        <LoadingBlock label="Loading visitor..." />
      ) : detailQuery.isError ? (
        <p className="text-xs text-rose-600">{errorMessage(detailQuery.error)}</p>
      ) : visitor ? (
        <form
          id="visitor-edit-form"
          key={visitor.updatedAt}
          className="space-y-3"
          onSubmit={(event) => {
            event.preventDefault();
            const form = new FormData(event.currentTarget);
            const values = Object.fromEntries(
              [...form.entries()].map(([key, value]) => [key, String(value)]),
            );
            mutation.mutate(values);
          }}
        >
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block text-xs">
              <span className="label-base">Visitor name *</span>
              <Input name="name" defaultValue={visitor.name} required maxLength={120} />
            </label>
            <label className="block text-xs">
              <span className="label-base">Designation</span>
              <Input name="designation" defaultValue={visitor.designation ?? ''} maxLength={120} />
            </label>
            <label className="block text-xs">
              <span className="label-base">Organization</span>
              <Input name="organization" defaultValue={visitor.organization ?? ''} maxLength={160} />
            </label>
            <label className="block text-xs">
              <span className="label-base">Mobile number *</span>
              <Input
                name="mobile"
                type="tel"
                defaultValue={visitor.mobile}
                required
                placeholder="+919876543210"
              />
            </label>
            <label className="block text-xs">
              <span className="label-base">Email *</span>
              <Input name="email" type="email" defaultValue={visitor.email} required />
            </label>
            <label className="block text-xs sm:col-span-2">
              <span className="label-base">Address</span>
              <Input name="address" defaultValue={visitor.address ?? ''} maxLength={300} />
            </label>
          </div>
          {mutation.isError ? (
            <p className="text-xs text-rose-600">{errorMessage(mutation.error)}</p>
          ) : null}
        </form>
      ) : null}
    </Modal>
  );
}
