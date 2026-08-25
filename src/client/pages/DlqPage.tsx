/**
 * Dead Letter Queue (DLQ) Inspector View
 */

import React from 'react';
import { useScheduler } from '../context/SchedulerContext.tsx';
import {
  AlertOctagon,
  RefreshCw,
  Trash2,
  Terminal,
  ShieldCheck,
  AlertTriangle,
  ArrowRight,
} from 'lucide-react';

export const DlqPage: React.FC = () => {
  const { deadLetters, retryDlq, purgeDlq, setSelectedJobId } = useScheduler();

  return (
    <div className="space-y-6 animate-in fade-in duration-200">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2">
            <span className="flex h-6 w-6 items-center justify-center rounded bg-rose-100 text-rose-700">
              <AlertOctagon className="h-4 w-4" />
            </span>
            <h1 className="text-xl font-bold tracking-tight text-slate-900">Dead Letter Queue (DLQ)</h1>
          </div>
          <p className="mt-1 text-xs text-slate-500">
            Quarantine vault for jobs that failed and completely exhausted all configured retry backoff attempts
          </p>
        </div>
      </div>

      {/* Info Notice */}
      <div className="rounded-xl border border-rose-100 bg-rose-50/50 p-4 text-xs text-rose-900">
        <div className="flex items-center gap-2 font-bold mb-1">
          <AlertTriangle className="h-4 w-4 text-rose-600" />
          <span>Failure Isolation Mechanism</span>
        </div>
        <p className="text-[11px] text-rose-800 leading-relaxed">
          Jobs entering the DLQ are halted from consuming further worker compute. Operators can inspect error traces, review execution payloads, and 1-click replay tasks once upstream dependencies or bugfixes are deployed.
        </p>
      </div>

      {/* DLQ Cards Table */}
      {deadLetters.length === 0 ? (
        <div className="rounded-2xl border border-slate-200 bg-white p-12 text-center shadow-xs">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-emerald-100 text-emerald-600 mb-3">
            <ShieldCheck className="h-6 w-6" />
          </div>
          <h3 className="text-sm font-bold text-slate-900">Dead Letter Queue is Empty</h3>
          <p className="mt-1 text-xs text-slate-500">
            Zero poisoned or exhausted tasks detected. All jobs are succeeding or within normal retry windows.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {deadLetters.map(entry => (
            <div
              key={entry.id}
              className="rounded-xl border border-rose-200 bg-white p-5 shadow-xs transition-all hover:border-rose-300"
            >
              {/* Header */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-100 pb-3">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-slate-900 text-sm">{entry.jobName}</span>
                    <span className="rounded bg-rose-100 px-2 py-0.5 font-mono text-[10px] font-bold text-rose-800">
                      {entry.totalAttempts} Attempts Failed
                    </span>
                  </div>
                  <p className="font-mono text-[11px] text-slate-400 mt-0.5">
                    Job ID: {entry.jobId} • Queue: {entry.queueId}
                  </p>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    onClick={() => retryDlq(entry.id)}
                    className="flex items-center gap-1.5 rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-bold text-white hover:bg-slate-800 shadow-xs"
                  >
                    <RefreshCw className="h-3.5 w-3.5 text-indigo-300" />
                    <span>Replay Job</span>
                  </button>

                  <button
                    onClick={() => purgeDlq(entry.id)}
                    className="flex items-center gap-1 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-rose-700 hover:bg-rose-50"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                    <span>Purge</span>
                  </button>
                </div>
              </div>

              {/* Error Reason */}
              <div className="mt-3">
                <span className="text-[11px] font-bold uppercase tracking-wider text-rose-700">Failure Reason:</span>
                <p className="mt-1 font-mono text-xs text-rose-900 bg-rose-50 p-2.5 rounded-lg border border-rose-200 whitespace-pre-wrap">
                  {entry.failureReason}
                </p>
              </div>

              {/* Payload Preview */}
              <div className="mt-3">
                <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Captured Payload:</span>
                <pre className="mt-1 font-mono text-xs rounded-lg bg-slate-900 text-slate-200 p-3 overflow-x-auto border border-slate-800">
                  {JSON.stringify(entry.payload, null, 2)}
                </pre>
              </div>

              {/* Footer info */}
              <div className="mt-3 flex items-center justify-between text-[11px] text-slate-400 pt-2 border-t border-slate-100">
                <span>Failed at: {new Date(entry.failedAt).toLocaleString()}</span>
                <span>Last Worker Node: <strong className="font-mono text-slate-700">{entry.lastWorkerId}</strong></span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
