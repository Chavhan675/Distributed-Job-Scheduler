/**
 * Queue Explorer View
 */

import React, { useState } from 'react';
import { useScheduler } from '../context/SchedulerContext.tsx';
import {
  Inbox,
  Play,
  Pause,
  Plus,
  BarChart2,
  Trash2,
  Settings2,
  ArrowRight,
  ShieldAlert,
} from 'lucide-react';
import { Queue } from '../../types.ts';

interface QueueExplorerPageProps {
  onOpenNewQueue: () => void;
  onOpenNewJob: () => void;
}

export const QueueExplorerPage: React.FC<QueueExplorerPageProps> = ({ onOpenNewQueue, onOpenNewJob }) => {
  const { queues, queueStats, pauseQueue, resumeQueue, retryPolicies } = useScheduler();

  return (
    <div className="space-y-6 animate-in fade-in duration-200">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-slate-900">Queue Explorer</h1>
          <p className="text-xs text-slate-500">Manage queue configurations, priority tiers, and concurrency throttles</p>
        </div>
        <button
          onClick={onOpenNewQueue}
          className="flex items-center gap-1.5 rounded-lg bg-slate-900 px-3.5 py-2 text-xs font-bold text-white hover:bg-slate-800 shadow-sm"
        >
          <Plus className="h-3.5 w-3.5" />
          <span>Provision Queue</span>
        </button>
      </div>

      {/* Queues Table */}
      <div className="rounded-xl border border-slate-200 bg-white overflow-hidden shadow-xs">
        <table className="w-full text-left text-xs">
          <thead className="bg-slate-50/80 border-b border-slate-200 text-[11px] font-bold uppercase text-slate-500">
            <tr>
              <th className="px-5 py-3">Queue Name & Description</th>
              <th className="px-4 py-3">Priority</th>
              <th className="px-4 py-3">Concurrency Throttle</th>
              <th className="px-4 py-3">Running / Backlog</th>
              <th className="px-4 py-3">Completed / DLQ</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-5 py-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {queues.map(queue => {
              const stat = queueStats.find(s => s.queueId === queue.id);
              const running = stat?.runningCount || 0;
              const queued = stat?.queuedCount || 0;
              const completed = stat?.completedCount || 0;
              const dlq = stat?.deadLetterCount || 0;
              const policy = retryPolicies.find(p => p.id === queue.retryPolicyId);

              return (
                <tr key={queue.id} className="hover:bg-slate-50/70 transition-colors">
                  <td className="px-5 py-4">
                    <div className="flex items-center gap-2.5">
                      <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-slate-100 text-slate-700">
                        <Inbox className="h-4 w-4" />
                      </div>
                      <div>
                        <span className="font-mono font-bold text-slate-900">{queue.name}</span>
                        <p className="text-[11px] text-slate-500">{queue.description || 'No description provided'}</p>
                        {policy && (
                          <span className="inline-block mt-0.5 text-[10px] font-semibold text-purple-700">
                            Policy: {policy.name} ({policy.strategy})
                          </span>
                        )}
                      </div>
                    </div>
                  </td>

                  <td className="px-4 py-4">
                    <span
                      className={`rounded px-2 py-0.5 text-[10px] font-bold ${
                        queue.priority === 'CRITICAL'
                          ? 'bg-rose-100 text-rose-800'
                          : queue.priority === 'HIGH'
                          ? 'bg-amber-100 text-amber-800'
                          : 'bg-slate-100 text-slate-700'
                      }`}
                    >
                      {queue.priority}
                    </span>
                  </td>

                  <td className="px-4 py-4 font-mono font-semibold text-slate-800">
                    Max {queue.concurrencyLimit} workers
                  </td>

                  <td className="px-4 py-4">
                    <div className="flex items-center gap-2 font-mono">
                      <span className="font-bold text-blue-700">{running} running</span>
                      <span className="text-slate-300">/</span>
                      <span className="font-semibold text-amber-700">{queued} queued</span>
                    </div>
                  </td>

                  <td className="px-4 py-4 font-mono text-slate-600">
                    <div className="flex items-center gap-2">
                      <span className="text-emerald-700 font-semibold">{completed} ok</span>
                      <span className="text-slate-300">/</span>
                      <span className="text-rose-700 font-semibold">{dlq} dlq</span>
                    </div>
                  </td>

                  <td className="px-4 py-4">
                    <span
                      className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${
                        queue.status === 'ACTIVE'
                          ? 'bg-emerald-100 text-emerald-800'
                          : 'bg-amber-100 text-amber-800'
                      }`}
                    >
                      {queue.status}
                    </span>
                  </td>

                  <td className="px-5 py-4 text-right">
                    <div className="flex items-center justify-end gap-1.5">
                      {queue.status === 'ACTIVE' ? (
                        <button
                          onClick={() => pauseQueue(queue.id)}
                          className="flex items-center gap-1 rounded-lg border border-slate-300 bg-white px-2.5 py-1 text-xs font-semibold text-amber-700 hover:bg-amber-50"
                          title="Pause queue processing"
                        >
                          <Pause className="h-3 w-3" />
                          <span>Pause</span>
                        </button>
                      ) : (
                        <button
                          onClick={() => resumeQueue(queue.id)}
                          className="flex items-center gap-1 rounded-lg bg-emerald-600 px-2.5 py-1 text-xs font-semibold text-white hover:bg-emerald-700"
                          title="Resume queue processing"
                        >
                          <Play className="h-3 w-3" />
                          <span>Resume</span>
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
};
