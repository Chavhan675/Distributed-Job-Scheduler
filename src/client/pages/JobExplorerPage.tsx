/**
 * Job Explorer View
 */

import React, { useState } from 'react';
import { useScheduler } from '../context/SchedulerContext.tsx';
import {
  Search,
  Filter,
  Plus,
  RefreshCw,
  Clock,
  CheckCircle2,
  AlertOctagon,
  Ban,
  ArrowRight,
  Sparkles,
} from 'lucide-react';
import { JobStatus, JobPriority, JobType } from '../../types.ts';

interface JobExplorerPageProps {
  onOpenNewJob: () => void;
}

export const JobExplorerPage: React.FC<JobExplorerPageProps> = ({ onOpenNewJob }) => {
  const { jobs, queues, setSelectedJobId, retryJob, cancelJob } = useScheduler();

  const [searchQuery, setSearchQuery] = useState<string>('');
  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [queueFilter, setQueueFilter] = useState<string>('ALL');
  const [priorityFilter, setPriorityFilter] = useState<string>('ALL');
  const [typeFilter, setTypeFilter] = useState<string>('ALL');

  // Filter jobs
  const filteredJobs = jobs.filter(job => {
    if (statusFilter !== 'ALL' && job.status !== statusFilter) return false;
    if (queueFilter !== 'ALL' && job.queueId !== queueFilter) return false;
    if (priorityFilter !== 'ALL' && job.priority !== priorityFilter) return false;
    if (typeFilter !== 'ALL' && job.type !== typeFilter) return false;
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      const matchName = job.name.toLowerCase().includes(q);
      const matchId = job.id.toLowerCase().includes(q);
      const matchQueue = job.queueId.toLowerCase().includes(q);
      if (!matchName && !matchId && !matchQueue) return false;
    }
    return true;
  });

  const getStatusBadge = (status: JobStatus) => {
    switch (status) {
      case 'COMPLETED':
        return <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2.5 py-0.5 text-[10px] font-bold text-emerald-800 border border-emerald-200"><CheckCircle2 className="h-2.5 w-2.5" /> Completed</span>;
      case 'RUNNING':
        return <span className="inline-flex items-center gap-1 rounded-full bg-blue-100 px-2.5 py-0.5 text-[10px] font-bold text-blue-800 border border-blue-200 animate-pulse"><RefreshCw className="h-2.5 w-2.5 animate-spin" /> Running</span>;
      case 'CLAIMED':
        return <span className="inline-flex items-center gap-1 rounded-full bg-indigo-100 px-2.5 py-0.5 text-[10px] font-bold text-indigo-800 border border-indigo-200">Claimed</span>;
      case 'QUEUED':
        return <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2.5 py-0.5 text-[10px] font-bold text-amber-800 border border-amber-200">Queued</span>;
      case 'SCHEDULED':
        return <span className="inline-flex items-center gap-1 rounded-full bg-sky-100 px-2.5 py-0.5 text-[10px] font-bold text-sky-800 border border-sky-200"><Clock className="h-2.5 w-2.5" /> Scheduled</span>;
      case 'RETRY_PENDING':
        return <span className="inline-flex items-center gap-1 rounded-full bg-purple-100 px-2.5 py-0.5 text-[10px] font-bold text-purple-800 border border-purple-200"><RefreshCw className="h-2.5 w-2.5" /> Retry Pending</span>;
      case 'DEAD_LETTER':
        return <span className="inline-flex items-center gap-1 rounded-full bg-rose-100 px-2.5 py-0.5 text-[10px] font-bold text-rose-800 border border-rose-200"><AlertOctagon className="h-2.5 w-2.5" /> Dead Letter</span>;
      case 'CANCELLED':
        return <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2.5 py-0.5 text-[10px] font-bold text-slate-800 border border-slate-200"><Ban className="h-2.5 w-2.5" /> Cancelled</span>;
      default:
        return <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-800">{status}</span>;
    }
  };

  return (
    <div className="space-y-5 animate-in fade-in duration-200">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-slate-900">Job Explorer</h1>
          <p className="text-xs text-slate-500">Track and inspect background jobs across all lifecycle transitions</p>
        </div>
        <button
          onClick={onOpenNewJob}
          className="flex items-center gap-1.5 rounded-lg bg-slate-900 px-3.5 py-2 text-xs font-bold text-white hover:bg-slate-800 shadow-sm"
        >
          <Plus className="h-3.5 w-3.5 text-indigo-300" />
          <span>Enqueue Job</span>
        </button>
      </div>

      {/* Filter Controls Bar */}
      <div className="space-y-3 rounded-xl border border-slate-200 bg-white p-4 shadow-xs">
        <div className="flex flex-col md:flex-row items-center gap-3">
          {/* Search Box */}
          <div className="relative flex-1 w-full">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
            <input
              type="text"
              placeholder="Search by job name, ID, or queue..."
              className="w-full rounded-lg border border-slate-300 bg-slate-50/50 pl-9 pr-3 py-2 text-xs font-medium text-slate-800 focus:bg-white focus:border-slate-900 focus:outline-none"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
            />
          </div>

          {/* Queue Filter */}
          <div className="flex items-center gap-1.5 w-full md:w-auto">
            <span className="text-xs font-semibold text-slate-500">Queue:</span>
            <select
              className="rounded-lg border border-slate-300 bg-white px-2.5 py-2 text-xs font-semibold text-slate-800 focus:outline-none"
              value={queueFilter}
              onChange={e => setQueueFilter(e.target.value)}
            >
              <option value="ALL">All Queues</option>
              {queues.map(q => (
                <option key={q.id} value={q.id}>
                  {q.name}
                </option>
              ))}
            </select>
          </div>

          {/* Type Filter */}
          <div className="flex items-center gap-1.5 w-full md:w-auto">
            <span className="text-xs font-semibold text-slate-500">Type:</span>
            <select
              className="rounded-lg border border-slate-300 bg-white px-2.5 py-2 text-xs font-semibold text-slate-800 focus:outline-none"
              value={typeFilter}
              onChange={e => setTypeFilter(e.target.value)}
            >
              <option value="ALL">All Types</option>
              <option value="IMMEDIATE">IMMEDIATE</option>
              <option value="DELAYED">DELAYED</option>
              <option value="SCHEDULED">SCHEDULED</option>
              <option value="RECURRING">RECURRING</option>
              <option value="BATCH">BATCH</option>
            </select>
          </div>
        </div>

        {/* Status Filter Chips */}
        <div className="flex items-center gap-1.5 overflow-x-auto pt-2 border-t border-slate-100 text-xs">
          <span className="font-semibold text-slate-400 text-[11px] mr-1">Status:</span>
          {[
            'ALL',
            'QUEUED',
            'RUNNING',
            'SCHEDULED',
            'COMPLETED',
            'RETRY_PENDING',
            'DEAD_LETTER',
            'CANCELLED',
          ].map(st => {
            const active = statusFilter === st;
            return (
              <button
                key={st}
                onClick={() => setStatusFilter(st)}
                className={`rounded-lg px-2.5 py-1 text-[11px] font-bold transition-colors ${
                  active
                    ? 'bg-slate-900 text-white shadow-xs'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                {st}
              </button>
            );
          })}
        </div>
      </div>

      {/* Jobs Table */}
      <div className="rounded-xl border border-slate-200 bg-white overflow-hidden shadow-xs">
        <table className="w-full text-left text-xs">
          <thead className="bg-slate-50/80 border-b border-slate-200 text-[11px] font-bold uppercase text-slate-500">
            <tr>
              <th className="px-5 py-3">Job Name & ID</th>
              <th className="px-4 py-3">Queue</th>
              <th className="px-4 py-3">Type</th>
              <th className="px-4 py-3">Priority</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Attempts</th>
              <th className="px-4 py-3">Worker Node</th>
              <th className="px-4 py-3">Timestamp</th>
              <th className="px-5 py-3 text-right">Inspect</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {filteredJobs.length === 0 ? (
              <tr>
                <td colSpan={9} className="px-5 py-8 text-center text-slate-400 italic">
                  No jobs found matching the selected filters.
                </td>
              </tr>
            ) : (
              filteredJobs.map(job => (
                <tr
                  key={job.id}
                  onClick={() => setSelectedJobId(job.id)}
                  className="hover:bg-slate-50/80 cursor-pointer transition-colors group"
                >
                  <td className="px-5 py-3.5">
                    <div className="flex items-center gap-2">
                      <div>
                        <span className="font-semibold text-slate-900 group-hover:text-indigo-600">
                          {job.name}
                        </span>
                        <p className="font-mono text-[10px] text-slate-400">{job.id}</p>
                      </div>
                    </div>
                  </td>

                  <td className="px-4 py-3.5 font-mono font-medium text-slate-700">
                    {job.queueId}
                  </td>

                  <td className="px-4 py-3.5">
                    <span className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-[10px] font-semibold text-slate-700 border border-slate-200">
                      {job.type}
                    </span>
                  </td>

                  <td className="px-4 py-3.5">
                    <span
                      className={`rounded px-1.5 py-0.5 text-[10px] font-bold ${
                        job.priority === 'CRITICAL'
                          ? 'bg-rose-100 text-rose-800'
                          : job.priority === 'HIGH'
                          ? 'bg-amber-100 text-amber-800'
                          : 'bg-slate-100 text-slate-700'
                      }`}
                    >
                      {job.priority}
                    </span>
                  </td>

                  <td className="px-4 py-3.5">{getStatusBadge(job.status)}</td>

                  <td className="px-4 py-3.5 font-mono text-slate-700">
                    <span className={job.attempts > 1 ? 'text-purple-700 font-bold' : ''}>
                      {job.attempts}
                    </span>
                    <span className="text-slate-400">/{job.maxRetries}</span>
                  </td>

                  <td className="px-4 py-3.5 font-mono text-[11px] text-slate-600">
                    {job.workerId ? (
                      <span className="font-semibold text-slate-800">{job.workerId}</span>
                    ) : (
                      <span className="text-slate-400 italic">—</span>
                    )}
                  </td>

                  <td className="px-4 py-3.5 text-[11px] text-slate-500 font-mono">
                    {new Date(job.createdAt).toLocaleTimeString()}
                  </td>

                  <td className="px-5 py-3.5 text-right">
                    <button
                      onClick={e => {
                        e.stopPropagation();
                        setSelectedJobId(job.id);
                      }}
                      className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-900 group-hover:text-indigo-600"
                    >
                      <ArrowRight className="h-4 w-4" />
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};
