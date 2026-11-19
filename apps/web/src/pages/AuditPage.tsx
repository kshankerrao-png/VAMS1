import { useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Filter, RotateCcw, ShieldCheck } from 'lucide-react';
import type { AuditEntry, AuditVerification, Paginated } from '@vams/shared';
import { AUDIT_ACTIONS } from '@vams/shared';
import { api, errorMessage } from '../lib/api';
import { formatDateTime } from '../lib/format';
import { useToast } from '../components/Toast';
import {
  Alert,
  Badge,
  Button,
  EmptyState,
  Input,
  LoadingBlock,
  PageHeader,
  Pagination,
  SectionCard,
  Select,
} from '../components/ui';

const ENTITY_TYPES = [
  'appointment_request',
  'notification',
  'user',
  'notification_template',
  'app_settings',
  'register',
  'audit_log',
];

export function AuditPage() {
  const { notify } = useToast();
  const [draft, setDraft] = useState({ actor: '', action: '', entityType: '', from: '', to: '' });
  const [filters, setFilters] = useState(draft);
  const [page, setPage] = useState(1);
  const [verification, setVerification] = useState<AuditVerification | null>(null);

  const params = new URLSearchParams({ page: String(page), pageSize: '25' });
  if (filters.actor) params.set('actor', filters.actor);
  if (filters.action) params.set('action', filters.action);
  if (filters.entityType) params.set('entityType', filters.entityType);
  if (filters.from) params.set('from', filters.from);
  if (filters.to) params.set('to', filters.to);

  const auditQuery = useQuery({
    queryKey: ['audit', params.toString()],
    queryFn: () => api<Paginated<AuditEntry>>(`/audit?${params.toString()}`),
  });

  const verifyMutation = useMutation({
    mutationFn: () => api<AuditVerification>('/audit/verify'),
    onSuccess: (result) => {
      setVerification(result);
      notify(result.valid ? 'Audit chain verified.' : 'Audit chain verification failed.', result.valid ? 'success' : 'error');
    },
    onError: (caught) => notify(errorMessage(caught), 'error'),
  });

  const data = auditQuery.data;

  const applyFilters = (event: React.FormEvent) => {
    event.preventDefault();
    setPage(1);
    setFilters(draft);
  };

  const reset = () => {
    const empty = { actor: '', action: '', entityType: '', from: '', to: '' };
    setDraft(empty);
    setFilters(empty);
    setPage(1);
  };

  return (
    <>
      <PageHeader
        title="Audit log"
        description="Append-only, hash-chained record of every sign-in, decision, notification and configuration change."
        actions={
          <Button onClick={() => verifyMutation.mutate()} loading={verifyMutation.isPending}>
            <ShieldCheck className="size-4" />
            Verify chain
          </Button>
        }
      />

      {verification ? (
        <div className="mb-4">
          <Alert tone={verification.valid ? 'success' : 'error'} title={verification.message}>
            {verification.valid
              ? 'Each entry matches its predecessor. No tampering detected.'
              : `Mismatch found at sequence ${verification.brokenAtSeq}. Investigate immediately.`}
          </Alert>
        </div>
      ) : null}

      <SectionCard
        title="Search the log"
        description="Filter by actor, action, entity or IST date range."
        icon={Filter}
        actions={
          <Button variant="ghost" size="sm" onClick={reset}>
            <RotateCcw className="size-3.5" />
            Reset
          </Button>
        }
      >
        <form onSubmit={applyFilters} className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <label className="block">
            <span className="label-base">Actor</span>
            <Input
              value={draft.actor}
              onChange={(event) => setDraft({ ...draft, actor: event.target.value })}
              placeholder="Name"
            />
          </label>
          <label className="block">
            <span className="label-base">Action</span>
            <Select
              value={draft.action}
              onChange={(event) => setDraft({ ...draft, action: event.target.value })}
            >
              <option value="">All actions</option>
              {AUDIT_ACTIONS.map((action) => (
                <option key={action} value={action}>
                  {action.replace(/_/g, ' ').toLowerCase()}
                </option>
              ))}
            </Select>
          </label>
          <label className="block">
            <span className="label-base">Entity</span>
            <Select
              value={draft.entityType}
              onChange={(event) => setDraft({ ...draft, entityType: event.target.value })}
            >
              <option value="">All entities</option>
              {ENTITY_TYPES.map((entity) => (
                <option key={entity} value={entity}>
                  {entity.replace(/_/g, ' ')}
                </option>
              ))}
            </Select>
          </label>
          <label className="block">
            <span className="label-base">From</span>
            <Input
              type="date"
              value={draft.from}
              onChange={(event) => setDraft({ ...draft, from: event.target.value })}
            />
          </label>
          <label className="block">
            <span className="label-base">To</span>
            <Input
              type="date"
              value={draft.to}
              onChange={(event) => setDraft({ ...draft, to: event.target.value })}
            />
          </label>
          <div className="sm:col-span-2 lg:col-span-5">
            <Button type="submit" variant="secondary" size="sm">
              Apply filters
            </Button>
          </div>
        </form>
      </SectionCard>

      <div className="mt-5">
        <SectionCard
          title="Audit entries"
          description={data ? `${data.total} entr${data.total === 1 ? 'y' : 'ies'} across the chain` : 'Loading…'}
          bodyClassName="p-0"
        >
          {auditQuery.isLoading ? (
            <LoadingBlock />
          ) : !data || data.items.length === 0 ? (
            <EmptyState title="No audit entries match these filters" />
          ) : (
            <div className="overflow-x-auto">
              <table className="table-base min-w-[760px]">
                <thead>
                  <tr>
                    <th>Seq</th>
                    <th>Time</th>
                    <th>Actor</th>
                    <th>Action</th>
                    <th>Entity</th>
                    <th>Source</th>
                    <th>Details</th>
                  </tr>
                </thead>
                <tbody>
                  {data.items.map((entry) => (
                    <tr key={entry.id}>
                      <td className="text-[10px] tabular-nums text-slate-400">#{entry.seq}</td>
                      <td className="whitespace-nowrap text-[11px]">{formatDateTime(entry.createdAt)}</td>
                      <td className="text-xs font-medium">{entry.actorName}</td>
                      <td>
                        <Badge tone={entry.action.includes('FAILED') ? 'red' : entry.action.includes('APPROVED') || entry.action.includes('DELIVERED') ? 'green' : 'slate'}>
                          {entry.action.replace(/_/g, ' ').toLowerCase()}
                        </Badge>
                      </td>
                      <td className="text-[11px] text-slate-500">
                        {entry.entityType}
                        {entry.entityId ? (
                          <span className="block max-w-[140px] truncate font-mono text-[10px] text-slate-400">
                            {entry.entityId}
                          </span>
                        ) : null}
                      </td>
                      <td className="text-[10px] text-slate-400">{entry.ip ?? '—'}</td>
                      <td>
                        {entry.before || entry.after ? (
                          <details>
                            <summary className="cursor-pointer text-[10px] font-semibold text-brand-700">
                              View
                            </summary>
                            <pre className="mt-1 max-h-48 w-72 overflow-auto rounded bg-slate-50 p-2 text-[10px] text-slate-500">
                              {JSON.stringify({ before: entry.before, after: entry.after }, null, 2)}
                            </pre>
                          </details>
                        ) : (
                          <span className="text-[10px] text-slate-300">—</span>
                        )}
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
              onPage={setPage}
            />
          ) : null}
        </SectionCard>
      </div>
    </>
  );
}
