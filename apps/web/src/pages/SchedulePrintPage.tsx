import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, Printer } from 'lucide-react';
import type { ScheduleResponse } from '@vams/shared';
import { api, errorMessage } from '../lib/api';
import { formatDate, formatTime, istToday } from '../lib/format';
import { Button, EmptyState, Input, LoadingBlock } from '../components/ui';

export function SchedulePrintPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [date, setDate] = useState(searchParams.get('date') ?? istToday());

  const scheduleQuery = useQuery({
    queryKey: ['schedule', date],
    queryFn: () => api<ScheduleResponse>(`/reports/schedule?date=${date}`),
    enabled: Boolean(date),
  });

  const schedule = scheduleQuery.data;

  return (
    <div className="min-h-dvh bg-slate-200 px-3 py-6 print:bg-white print:p-0">
      <div className="mx-auto mb-4 flex max-w-4xl flex-wrap items-center justify-between gap-2 print:hidden">
        <Link to="/reports">
          <Button variant="outline" size="sm">
            <ArrowLeft className="size-4" />
            Back to reports
          </Button>
        </Link>
        <div className="flex items-center gap-2">
          <div className="w-40">
            <Input
              type="date"
              value={date}
              onChange={(event) => {
                setDate(event.target.value);
                setSearchParams({ date: event.target.value }, { replace: true });
              }}
            />
          </div>
          <Button onClick={() => window.print()}>
            <Printer className="size-4" />
            Print / save PDF
          </Button>
        </div>
      </div>

      {scheduleQuery.isLoading ? (
        <LoadingBlock />
      ) : scheduleQuery.isError ? (
        <div className="mx-auto max-w-4xl rounded-xl bg-white p-8 text-center text-sm text-rose-600">
          {errorMessage(scheduleQuery.error)}
        </div>
      ) : schedule ? (
        <article className="print-sheet mx-auto max-w-4xl rounded-xl border border-slate-300 bg-white p-8 shadow-lg sm:p-10">
          <header className="border-b-2 border-slate-800 pb-4 text-center">
            <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-slate-500">
              Government of Telangana
            </p>
            <h1 className="mt-1 text-lg font-bold uppercase tracking-wide text-slate-900">
              Transport, Roads &amp; Buildings Department
            </h1>
            <p className="text-xs text-slate-500">Office of the Secretary</p>
            <h2 className="mt-4 inline-block border border-slate-800 px-4 py-1 text-sm font-bold uppercase tracking-wider">
              Daily Appointment Schedule
            </h2>
          </header>

          <div className="mt-4 flex flex-wrap items-center justify-between gap-2 text-xs">
            <p>
              <span className="font-semibold text-slate-700">Date:</span> {formatDate(schedule.date)}
            </p>
            <p className="text-right">
              <span className="font-semibold text-slate-700">Venue:</span> {schedule.venue}
            </p>
          </div>

          {schedule.items.length === 0 ? (
            <div className="mt-8">
              <EmptyState
                title="No appointments scheduled"
                description="No approved or materialized appointments are recorded for this date."
              />
            </div>
          ) : (
            <table className="mt-5 w-full border-collapse text-xs">
              <thead>
                <tr className="bg-slate-100">
                  <th className="border border-slate-300 px-2 py-2 text-left font-bold">Time</th>
                  <th className="border border-slate-300 px-2 py-2 text-left font-bold">Reference</th>
                  <th className="border border-slate-300 px-2 py-2 text-left font-bold">Visitor</th>
                  <th className="border border-slate-300 px-2 py-2 text-left font-bold">
                    Designation / Organization
                  </th>
                  <th className="border border-slate-300 px-2 py-2 text-left font-bold">Purpose</th>
                  <th className="border border-slate-300 px-2 py-2 text-center font-bold">Accomp.</th>
                  <th className="border border-slate-300 px-2 py-2 text-left font-bold">Signature</th>
                </tr>
              </thead>
              <tbody>
                {schedule.items.map((item) => (
                  <tr key={item.reference} className="align-top">
                    <td className="whitespace-nowrap border border-slate-300 px-2 py-3 font-semibold">
                      {formatTime(item.time)}
                    </td>
                    <td className="whitespace-nowrap border border-slate-300 px-2 py-3 font-mono text-[10px]">
                      {item.reference}
                    </td>
                    <td className="border border-slate-300 px-2 py-3">
                      <p className="font-semibold">{item.visitorName}</p>
                      <p className="text-[10px] text-slate-500">{item.mobile}</p>
                    </td>
                    <td className="border border-slate-300 px-2 py-3">
                      <p>{item.designation ?? '--'}</p>
                      <p className="text-[10px] text-slate-500">{item.organization ?? ''}</p>
                    </td>
                    <td className="border border-slate-300 px-2 py-3">{item.purpose}</td>
                    <td className="border border-slate-300 px-2 py-3 text-center">{item.accompanyingCount}</td>
                    <td className="border border-slate-300 px-2 py-3" />
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          <footer className="mt-16 grid grid-cols-2 gap-10 text-center text-[11px]">
            <div>
              <div className="mx-auto mt-8 w-44 border-t border-slate-700 pt-1">Peshi In-charge</div>
            </div>
            <div>
              <div className="mx-auto mt-8 w-44 border-t border-slate-700 pt-1">Secretary, T,R&amp;B</div>
            </div>
          </footer>

          <p className="mt-8 border-t border-slate-200 pt-2 text-center text-[9px] uppercase tracking-wider text-slate-400">
            Generated by VAMS · {formatDate(schedule.date)} · {schedule.items.length} appointment(s)
          </p>
        </article>
      ) : null}
    </div>
  );
}
