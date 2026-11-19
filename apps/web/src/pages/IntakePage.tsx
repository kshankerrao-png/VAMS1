import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  AlertTriangle,
  Building2,
  CheckCircle2,
  History,
  Mail,
  Phone,
  Search,
  UserPlus,
  UserRound,
} from 'lucide-react';
import type {
  AppointmentRequestDetail,
  DuplicateWarning,
  VisitorHistoryItem,
  VisitorLookupMatch,
  VisitorLookupResponse,
  VisitorProfile,
} from '@vams/shared';
import { api, errorMessage, fieldErrors } from '../lib/api';
import { formatDate, formatTime } from '../lib/format';
import { useDebounced } from '../lib/hooks';
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
  Select,
  StatusBadge,
  Textarea,
} from '../components/ui';

interface FormState {
  visitorId: string | null;
  visitorName: string;
  designation: string;
  organization: string;
  address: string;
  mobile: string;
  email: string;
  purpose: string;
  accompanyingCount: string;
  accompanyingNames: string;
  documentsReference: string;
  remarks: string;
}

const EMPTY_FORM: FormState = {
  visitorId: null,
  visitorName: '',
  designation: '',
  organization: '',
  address: '',
  mobile: '',
  email: '',
  purpose: '',
  accompanyingCount: '0',
  accompanyingNames: '',
  documentsReference: '',
  remarks: '',
};

function mobileForInput(mobile: string): string {
  return mobile.replace(/^\+91/, '');
}

export function IntakePage() {
  const navigate = useNavigate();
  const { notify } = useToast();
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [lookupTerm, setLookupTerm] = useState('');
  const [matchNotice, setMatchNotice] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  const debouncedLookup = useDebounced(lookupTerm, 300);
  const debouncedMobile = useDebounced(form.mobile, 400);
  const debouncedEmail = useDebounced(form.email, 400);

  const lookupQuery = useQuery({
    queryKey: ['visitor-lookup', debouncedLookup],
    queryFn: () =>
      api<VisitorLookupResponse>(`/visitors/lookup?q=${encodeURIComponent(debouncedLookup)}`),
    enabled: debouncedLookup.trim().length >= 2,
  });

  const historyQuery = useQuery({
    queryKey: ['visitor', form.visitorId],
    queryFn: () =>
      api<{ visitor: VisitorProfile; history: VisitorHistoryItem[] }>(
        `/visitors/${form.visitorId}`,
      ),
    enabled: Boolean(form.visitorId),
  });

  const duplicateQuery = useQuery({
    queryKey: ['duplicates', debouncedMobile, debouncedEmail],
    queryFn: () =>
      api<DuplicateWarning>(
        `/requests/duplicates?mobile=${encodeURIComponent(debouncedMobile)}&email=${encodeURIComponent(debouncedEmail)}`,
      ),
    enabled: debouncedMobile.replace(/\D/g, '').length >= 10 || debouncedEmail.includes('@'),
  });

  useEffect(() => {
    const profile = lookupQuery.data?.autoFillProfile;
    if (!profile || form.visitorId) return;
    setForm((current) => applyProfile(current, profile));
    setMatchNotice(profile.name);
  }, [lookupQuery.data, form.visitorId]);

  const selectedVisitor = historyQuery.data?.visitor ?? null;

  const set = (key: keyof FormState) => (
    event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>,
  ) => {
    setForm((current) => ({ ...current, [key]: event.target.value }));
    setErrors((current) => ({ ...current, [key]: '' }));
  };

  const chooseProfile = (match: VisitorLookupMatch) => {
    setForm((current) => applyProfile(current, match));
    setMatchNotice(match.name);
    setLookupTerm('');
  };

  const clearProfile = () => {
    setForm({ ...EMPTY_FORM });
    setMatchNotice(null);
    setLookupTerm('');
    setErrors({});
    setSubmitError(null);
  };

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setSaving(true);
    setSubmitError(null);
    setErrors({});
    try {
      const created = await api<AppointmentRequestDetail>('/requests', {
        method: 'POST',
        body: {
          visitorId: form.visitorId ?? undefined,
          visitorName: form.visitorName,
          designation: form.designation,
          organization: form.organization,
          address: form.address,
          mobile: form.mobile,
          email: form.email,
          purpose: form.purpose,
          accompanyingCount: Number(form.accompanyingCount || 0),
          accompanyingNames: form.accompanyingNames,
          documentsReference: form.documentsReference,
          remarks: form.remarks,
        },
      });
      notify(`Request ${created.reference} saved and sent to the Secretary's queue.`);
      navigate(`/requests/${created.id}`);
    } catch (caught) {
      setSubmitError(errorMessage(caught));
      setErrors(fieldErrors(caught));
    } finally {
      setSaving(false);
    }
  };

  const matches = lookupQuery.data?.matches ?? [];
  const history = historyQuery.data?.history ?? [];
  const duplicates = duplicateQuery.data;
  const errorCount = useMemo(
    () => Object.values(errors).filter(Boolean).length,
    [errors],
  );

  return (
    <>
      <PageHeader
        title="New appointment request"
        description="Enter the visitor's particulars. Typing a known name, mobile, email, designation or organisation finds previous visits and fills the form."
        actions={
          <Link to="/register">
            <Button variant="outline">View register</Button>
          </Link>
        }
      />

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_340px]">
        <div className="space-y-5">
          <SectionCard
            title="Find an existing visitor"
            description="Search by name, mobile, email, designation or organisation."
            icon={Search}
          >
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
              <input
                value={lookupTerm}
                onChange={(event) => setLookupTerm(event.target.value)}
                placeholder="e.g. Ramesh Kumar, 98765 43210, nhaa.gov.in"
                className="input-base pl-9"
                aria-label="Search existing visitors"
              />
            </div>

            {matchNotice ? (
              <Alert tone="success" title={`Returning visitor matched: ${matchNotice}`} className="mt-3">
                Details have been filled from the visitor's stored profile. You can edit any field
                before saving.
                <button
                  type="button"
                  className="ml-2 font-semibold underline underline-offset-2"
                  onClick={clearProfile}
                >
                  Start a new record instead
                </button>
              </Alert>
            ) : null}

            {lookupQuery.isFetching && lookupTerm.length >= 2 ? (
              <p className="mt-2 text-xs text-slate-400">Searching visitor history...</p>
            ) : null}

            {lookupTerm.trim().length >= 2 && !lookupQuery.isFetching ? (
              matches.length === 0 ? (
                <div className="mt-3 rounded-lg border border-dashed border-slate-300 bg-slate-50 px-3.5 py-3 text-xs text-slate-500">
                  No matching visitor found. Continue filling the form to create a new record.
                </div>
              ) : (
                <ul className="mt-3 divide-y divide-slate-100 overflow-hidden rounded-lg border border-slate-200">
                  {matches.map((match) => (
                    <li key={match.id} className="flex flex-wrap items-center gap-3 bg-white px-3.5 py-2.5">
                      <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-brand-50 text-[11px] font-bold text-brand-700">
                        {match.name.slice(0, 1).toUpperCase()}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="text-[13px] font-semibold text-slate-800">{match.name}</p>
                        <p className="truncate text-[11px] text-slate-500">
                          {[match.designation, match.organization].filter(Boolean).join(' · ') ||
                            'No designation recorded'}
                        </p>
                        <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[10px] text-slate-400">
                          <span className="inline-flex items-center gap-1">
                            <Phone className="size-3" />
                            {match.mobile}
                          </span>
                          <span className="inline-flex items-center gap-1">
                            <Mail className="size-3" />
                            {match.email}
                          </span>
                          <span>{match.requestCount} previous request(s)</span>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        {match.matchFields.slice(0, 2).map((field) => (
                          <Badge key={field} tone="blue" className="capitalize">
                            {field}
                          </Badge>
                        ))}
                        <Button size="sm" variant="secondary" onClick={() => chooseProfile(match)}>
                          Use profile
                        </Button>
                      </div>
                    </li>
                  ))}
                </ul>
              )
            ) : null}
          </SectionCard>

          <form onSubmit={submit} className="space-y-5">
            <SectionCard
              title="Visitor details"
              description="Replaces the details on the paper appointment slip."
              icon={UserRound}
            >
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Name of the visitor" required error={errors.visitorName}>
                  <Input
                    value={form.visitorName}
                    onChange={set('visitorName')}
                    placeholder="Full name as per ID"
                    autoComplete="name"
                  />
                </Field>
                <Field label="Designation" error={errors.designation}>
                  <Input
                    value={form.designation}
                    onChange={set('designation')}
                    placeholder="e.g. Chief Engineer"
                  />
                </Field>
                <Field label="Organization" error={errors.organization}>
                  <Input
                    value={form.organization}
                    onChange={set('organization')}
                    placeholder="Department / company"
                    autoComplete="organization"
                  />
                </Field>
                <Field label="Address" error={errors.address}>
                  <Input
                    value={form.address}
                    onChange={set('address')}
                    placeholder="Office or residential address"
                    autoComplete="street-address"
                  />
                </Field>
                <Field label="Mobile number" required error={errors.mobile} hint="10-digit Indian mobile number">
                  <Input
                    value={form.mobile}
                    onChange={set('mobile')}
                    onBlur={() => {
                      if (!form.visitorId && form.mobile.replace(/\D/g, '').length >= 3) {
                        setLookupTerm(form.mobile);
                      }
                    }}
                    placeholder="98765 43210"
                    inputMode="tel"
                    autoComplete="tel"
                  />
                </Field>
                <Field label="Email ID" required error={errors.email} hint="Confirmation is sent to this address">
                  <Input
                    type="email"
                    value={form.email}
                    onChange={set('email')}
                    onBlur={() => {
                      if (!form.visitorId && form.email.includes('@')) {
                        setLookupTerm(form.email);
                      }
                    }}
                    placeholder="name@example.com"
                    autoComplete="email"
                  />
                </Field>
              </div>

              {duplicates?.hasDuplicate ? (
                <Alert tone="warning" title="This visitor already has an open request" className="mt-4">
                  <span className="block">
                    {duplicates.requests
                      .map(
                        (request) =>
                          `${request.reference} (${request.status.replace('_', ' ').toLowerCase()})`,
                      )
                      .join(', ')}
                  </span>
                  <span className="mt-1 block text-xs">
                    You can still save this request -- the existing record will be linked to the same
                    visitor profile.
                  </span>
                </Alert>
              ) : null}
            </SectionCard>

            <SectionCard
              title="Visit particulars"
              description="Purpose, accompanying persons and documents to carry."
              icon={History}
            >
              <div className="space-y-4">
                <Field label="Purpose of visit / particulars" required error={errors.purpose}>
                  <Textarea
                    value={form.purpose}
                    onChange={set('purpose')}
                    placeholder="Describe the matter to be discussed with the Secretary"
                    rows={4}
                  />
                </Field>
                <div className="grid gap-4 sm:grid-cols-[140px_1fr]">
                  <Field label="Persons accompanying" error={errors.accompanyingCount}>
                    <Select value={form.accompanyingCount} onChange={set('accompanyingCount')}>
                      {Array.from({ length: 11 }, (_, index) => (
                        <option key={index} value={String(index)}>
                          {index}
                        </option>
                      ))}
                    </Select>
                  </Field>
                  <Field label="Names of accompanying persons" error={errors.accompanyingNames}>
                    <Input
                      value={form.accompanyingNames}
                      onChange={set('accompanyingNames')}
                      placeholder="Names, separated by commas"
                    />
                  </Field>
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field
                    label="Documents for reference"
                    error={errors.documentsReference}
                    hint="Carry originals; mention file references if any"
                  >
                    <Input
                      value={form.documentsReference}
                      onChange={set('documentsReference')}
                      placeholder="e.g. DPR Vol I & II"
                    />
                  </Field>
                  <Field label="Remarks" error={errors.remarks}>
                    <Input
                      value={form.remarks}
                      onChange={set('remarks')}
                      placeholder="Internal note for the peshi"
                    />
                  </Field>
                </div>
              </div>
            </SectionCard>

            {submitError ? (
              <Alert tone="error" title="The request could not be saved">
                <p>{submitError}</p>
                {errorCount > 0 ? (
                  <p className="mt-1 text-xs">Please correct the highlighted fields and try again.</p>
                ) : null}
              </Alert>
            ) : null}

            <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-sm">
              <p className="text-[11px] text-slate-500">
                Saving sends the request to <span className="font-semibold">Pending Approval</span> for
                the Secretary.
              </p>
              <div className="flex items-center gap-2">
                <Button type="button" variant="outline" onClick={clearProfile}>
                  Clear form
                </Button>
                <Button type="submit" loading={saving}>
                  <UserPlus className="size-4" />
                  Save request
                </Button>
              </div>
            </div>
          </form>

          {form.visitorId ? (
            <SectionCard
              title="Previous visits"
              description={
                selectedVisitor
                  ? `${selectedVisitor.name} · ${selectedVisitor.requestCount} request(s) on record`
                  : 'Loading visit history...'
              }
              icon={History}
              bodyClassName="p-0"
            >
              {historyQuery.isLoading ? (
                <LoadingBlock />
              ) : history.length === 0 ? (
                <EmptyState title="No earlier visits" description="This is the visitor's first request." />
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
                        <th>Decided by</th>
                      </tr>
                    </thead>
                    <tbody>
                      {history.map((item) => (
                        <tr key={item.id}>
                          <td className="font-mono text-[11px] text-slate-500">{item.reference}</td>
                          <td className="whitespace-nowrap">{formatDate(item.requestDate.slice(0, 10))}</td>
                          <td className="max-w-xs">{item.purpose}</td>
                          <td>
                            <StatusBadge status={item.status} short />
                          </td>
                          <td className="whitespace-nowrap">
                            {item.assignedDate
                              ? `${formatDate(item.assignedDate)} · ${formatTime(item.assignedTime)}`
                              : '--'}
                          </td>
                          <td>{item.decidedByName ?? '--'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </SectionCard>
          ) : null}
        </div>

        <aside className="space-y-5">
          <Card className="p-4">
            <div className="flex items-center gap-2">
              <span className="flex size-8 items-center justify-center rounded-lg bg-brand-50 text-brand-700">
                <UserRound className="size-4" />
              </span>
              <div>
                <p className="text-xs font-bold text-slate-800">
                  {form.visitorId ? 'Linked visitor profile' : 'New visitor record'}
                </p>
                <p className="text-[10px] text-slate-400">
                  {form.visitorId ? 'Saving will update this profile' : 'Saved on first request'}
                </p>
              </div>
            </div>

            <div className="mt-3 space-y-2 text-xs">
              <p className="text-[13px] font-semibold text-slate-800">
                {form.visitorName || 'Visitor name not entered'}
              </p>
              {form.designation ? <p className="text-slate-500">{form.designation}</p> : null}
              {form.organization ? (
                <p className="flex items-start gap-1.5 text-slate-500">
                  <Building2 className="mt-0.5 size-3.5 shrink-0 text-slate-400" />
                  {form.organization}
                </p>
              ) : null}
              {form.mobile ? (
                <p className="flex items-center gap-1.5 text-slate-500">
                  <Phone className="size-3.5 text-slate-400" />
                  {form.mobile}
                </p>
              ) : null}
              {form.email ? (
                <p className="flex items-center gap-1.5 break-all text-slate-500">
                  <Mail className="size-3.5 shrink-0 text-slate-400" />
                  {form.email}
                </p>
              ) : null}
              {selectedVisitor ? (
                <p className="border-t border-slate-100 pt-2 text-[11px] text-slate-400">
                  Last visit: {selectedVisitor.lastVisitDate ? formatDate(selectedVisitor.lastVisitDate) : '--'}
                </p>
              ) : null}
            </div>

            {form.visitorId ? (
              <Button variant="outline" size="sm" className="mt-3 w-full" onClick={clearProfile}>
                Unlink profile
              </Button>
            ) : null}
          </Card>

          <Card className="p-4">
            <p className="text-xs font-bold text-slate-800">Intake checklist</p>
            <ul className="mt-2 space-y-2 text-[11px] text-slate-500">
              {[
                'Name, mobile and email are mandatory.',
                'Mobile and email must be correct -- confirmations are sent there.',
                "Confirm the visitor's designation before saving.",
                'Mention documents the visitor must carry.',
              ].map((item) => (
                <li key={item} className="flex items-start gap-1.5">
                  <CheckCircle2 className="mt-0.5 size-3.5 shrink-0 text-emerald-500" />
                  {item}
                </li>
              ))}
            </ul>
          </Card>

          {duplicates ? (
            <Card className="p-4">
              <p className="flex items-center gap-1.5 text-xs font-bold text-slate-800">
                <AlertTriangle className="size-4 text-amber-500" />
                Duplicate check
              </p>
              <p className="mt-1 text-[11px] text-slate-500">
                {duplicates.hasDuplicate
                  ? `${duplicates.requests.length} open request(s) found for this visitor.`
                  : 'No open request found for the entered contact details.'}
              </p>
            </Card>
          ) : null}
        </aside>
      </div>
    </>
  );
}

function applyProfile(current: FormState, profile: VisitorLookupMatch): FormState {
  return {
    ...current,
    visitorId: profile.id,
    visitorName: profile.name,
    designation: profile.designation ?? '',
    organization: profile.organization ?? '',
    address: profile.address ?? '',
    mobile: mobileForInput(profile.mobile),
    email: profile.email,
  };
}
