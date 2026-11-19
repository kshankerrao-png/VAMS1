import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CalendarClock, CheckCircle2, Clock, LogIn, XCircle } from 'lucide-react';
import type { AppointmentRequestDetail, SlotAvailability } from '@vams/shared';
import { api, errorMessage } from '../lib/api';
import { addDays, formatDate, formatTime, istToday } from '../lib/format';
import { useToast } from './Toast';
import { Alert, Button, Field, Input, Modal, Textarea } from './ui';

interface DecisionTarget {
  id: string;
  reference: string;
  visitorName: string;
  visitorMobile: string;
  visitorEmail: string;
  purpose: string;
  status: string;
  assignedDate?: string | null;
  assignedTime?: string | null;
}

function useInvalidateRequests() {
  const queryClient = useQueryClient();
  return (id: string) => {
    void queryClient.invalidateQueries({ queryKey: ['requests'] });
    void queryClient.invalidateQueries({ queryKey: ['request', id] });
    void queryClient.invalidateQueries({ queryKey: ['stats'] });
    void queryClient.invalidateQueries({ queryKey: ['reports'] });
  };
}

export function ApproveDialog({
  open,
  onClose,
  request,
  mode = 'approve',
}: {
  open: boolean;
  onClose: () => void;
  request: DecisionTarget;
  mode?: 'approve' | 'reschedule';
}) {
  const { notify } = useToast();
  const invalidate = useInvalidateRequests();
  const [date, setDate] = useState(request.assignedDate ?? addDays(istToday(), 1));
  const [time, setTime] = useState(request.assignedTime ?? '10:30');
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | null>(null);
  const idempotencyKey = useMemo(() => crypto.randomUUID(), [open, request.id]);

  useEffect(() => {
    if (!open) return;
    setDate(request.assignedDate ?? addDays(istToday(), 1));
    setTime(request.assignedTime ?? '10:30');
    setNote('');
    setError(null);
  }, [open, request.id, request.assignedDate, request.assignedTime]);

  const slotQuery = useQuery({
    queryKey: ['slot', request.id, date, time],
    queryFn: () =>
      api<SlotAvailability>(
        `/requests/${request.id}/slot-check?date=${encodeURIComponent(date)}&time=${encodeURIComponent(time)}`,
      ),
    enabled: open && Boolean(date) && Boolean(time),
  });

  const slot = slotQuery.data;
  const slotFull = Boolean(slot && slot.capacity !== null && slot.booked >= slot.capacity);
  const inPast = Boolean(
    date && time && Date.parse(`${date}T${time}:00+05:30`) <= Date.now(),
  );
  const endpoint = mode === 'approve' ? 'approve' : 'reschedule';

  const mutation = useMutation({
    mutationFn: () =>
      api<AppointmentRequestDetail>(`/requests/${request.id}/${endpoint}`, {
        method: 'POST',
        headers: mode === 'approve' ? { 'Idempotency-Key': idempotencyKey } : {},
        body: {
          assignedDate: date,
          assignedTime: time,
          ...(mode === 'approve' ? { note } : { reason: note }),
        },
      }),
    onSuccess: (updated) => {
      invalidate(request.id);
      notify(
        mode === 'approve'
          ? `Approved. Confirmations queued for ${updated.visitorName}.`
          : `Appointment moved to ${formatDate(date)} at ${formatTime(time)}.`,
      );
      onClose();
    },
    onError: (caught) => setError(errorMessage(caught)),
  });

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={mode === 'approve' ? 'Approve appointment' : 'Reschedule appointment'}
      description={`${request.reference} · ${request.visitorName}`}
      footer={
        <>
          <Button variant="outline" className="flex-1 sm:flex-none" onClick={onClose}>
            Cancel
          </Button>
          <Button
            className="flex-1 sm:flex-none"
            onClick={() => mutation.mutate()}
            loading={mutation.isPending}
            disabled={!date || !time || inPast || slotFull}
          >
            <CheckCircle2 className="size-4" />
            {mode === 'approve' ? 'Approve & notify' : 'Save new slot'}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        {error ? <Alert tone="error">{error}</Alert> : null}

        <div className="rounded-lg border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-xs text-slate-600">
          <p>
            <span className="font-semibold text-slate-700">Purpose:</span> {request.purpose}
          </p>
          <p className="mt-1 break-all text-[11px] text-slate-500">
            Confirmations will be sent to {request.visitorEmail} and {request.visitorMobile}.
          </p>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Appointment date" required>
            <Input type="date" min={istToday()} value={date} onChange={(event) => setDate(event.target.value)} />
          </Field>
          <Field label="Appointment time" required hint="24-hour format">
            <Input type="time" value={time} onChange={(event) => setTime(event.target.value)} />
          </Field>
        </div>

        {inPast ? (
          <Alert tone="error" title="That slot is in the past">
            Choose a future date and time. The server will reject past slots.
          </Alert>
        ) : slotFull ? (
          <Alert tone="error" title="Slot capacity reached">
            {slot?.booked} appointment(s) already booked with a limit of {slot?.capacity}. Pick another
            time.
          </Alert>
        ) : slot && slot.booked > 0 ? (
          <Alert tone="warning" title="Another appointment is booked at this time">
            {slot.booked} existing appointment(s)
            {slot.capacity !== null ? ` · capacity ${slot.capacity}` : ' · no capacity limit configured'}.
            You can still approve if the Secretary is comfortable with the overlap.
          </Alert>
        ) : null}

        <Field
          label={mode === 'approve' ? 'Internal note (optional)' : 'Reason for reschedule (optional)'}
          hint="Visible to staff on the request record; it is not sent to the visitor."
        >
          <Textarea
            rows={2}
            value={note}
            onChange={(event) => setNote(event.target.value)}
            placeholder={
              mode === 'approve'
                ? 'e.g. Ask the branch to bring the latest sanction file.'
                : 'Internal note about the change'
            }
          />
        </Field>

        <Alert tone="info">
          {mode === 'approve'
            ? 'Approving locks the decision and queues one Email and one WhatsApp confirmation. Delivery is tracked per channel.'
            : 'The visitor is not automatically re-notified after a reschedule in this version. Inform the peshi to call the visitor.'}
        </Alert>
      </div>
    </Modal>
  );
}

export function RejectDialog({
  open,
  onClose,
  request,
}: {
  open: boolean;
  onClose: () => void;
  request: DecisionTarget;
}) {
  const { notify } = useToast();
  const invalidate = useInvalidateRequests();
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setReason('');
    setError(null);
  }, [open, request.id]);

  const mutation = useMutation({
    mutationFn: () =>
      api<AppointmentRequestDetail>(`/requests/${request.id}/reject`, {
        method: 'POST',
        body: { reason },
      }),
    onSuccess: () => {
      invalidate(request.id);
      notify(`Request ${request.reference} rejected.`);
      onClose();
    },
    onError: (caught) => setError(errorMessage(caught)),
  });

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Reject appointment request"
      description={`${request.reference} · ${request.visitorName}`}
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="danger" onClick={() => mutation.mutate()} loading={mutation.isPending}>
            <XCircle className="size-4" />
            Reject request
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        {error ? <Alert tone="error">{error}</Alert> : null}
        <div className="rounded-lg border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-xs text-slate-600">
          <p>
            <span className="font-semibold text-slate-700">Purpose:</span> {request.purpose}
          </p>
        </div>
        <Field
          label="Reason for rejection"
          hint="Recorded in the audit trail. Share wording with the visitor separately if needed."
        >
          <Textarea
            rows={3}
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            placeholder="e.g. Please route this request through the works division."
          />
        </Field>
        <Alert tone="warning">
          Rejection is final in this version. The visitor is not automatically notified; the peshi
          should communicate the decision.
        </Alert>
      </div>
    </Modal>
  );
}

export function MaterializeDialog({
  open,
  onClose,
  request,
}: {
  open: boolean;
  onClose: () => void;
  request: DecisionTarget;
}) {
  const { notify } = useToast();
  const invalidate = useInvalidateRequests();
  const [timeIn, setTimeIn] = useState('10:15');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setTimeIn('10:15');
    setError(null);
  }, [open, request.id]);

  const mutation = useMutation({
    mutationFn: () =>
      api<AppointmentRequestDetail>(`/requests/${request.id}/materialize`, {
        method: 'POST',
        body: { timeIn },
      }),
    onSuccess: () => {
      invalidate(request.id);
      notify('Visit marked as materialized.');
      onClose();
    },
    onError: (caught) => setError(errorMessage(caught)),
  });

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Mark appointment as materialized"
      description={`${request.reference} · ${request.visitorName}`}
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={() => mutation.mutate()} loading={mutation.isPending}>
            <LogIn className="size-4" />
            Mark materialized
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        {error ? <Alert tone="error">{error}</Alert> : null}
        <Alert tone="info">
          Scheduled for {formatDate(request.assignedDate)} at {formatTime(request.assignedTime)}. Record
          the actual time the visitor arrived, if available.
        </Alert>
        <Field label="Time in" hint="24-hour format; defaults to the current office time on the server">
          <Input type="time" value={timeIn} onChange={(event) => setTimeIn(event.target.value)} />
        </Field>
      </div>
    </Modal>
  );
}

export function PendingSummary({ request }: { request: DecisionTarget }) {
  return (
    <div className="flex items-center gap-2 text-[11px] text-slate-400">
      <Clock className="size-3.5" />
      <span>Awaiting decision</span>
      {request.assignedDate ? (
        <>
          <CalendarClock className="ml-2 size-3.5" />
          <span>
            {formatDate(request.assignedDate)} · {formatTime(request.assignedTime)}
          </span>
        </>
      ) : null}
    </div>
  );
}
