/**
 * Main System Dashboard View
 */

import React from 'react';
import { useScheduler } from '../context/SchedulerContext.tsx';
import {
  Activity,
  CheckCircle2,
  AlertOctagon,
  Cpu,
  Clock,
  Zap,
  ArrowUpRight,
  TrendingUp,
  Inbox,
  Flame,
  ShieldCheck,
  Play,
} from 'lucide-react';

interface DashboardPageProps {
  onOpenNewJob: () => void;
  onOpenNewQueue: () => void;
  onNavigateToTab: (tab: any) => void;
}

export const DashboardPage: React.FC<DashboardPageProps> = ({
  onOpenNewJob,
  onOpenNewQueue,
  onNavigateToTab,
}) => {
  const { metrics, queueStats, jobs, workers, deadLetters, setSelectedJobId, createJob } = useScheduler();

  const totalQueued = metrics?.queuedJobs || 0;
  const totalRunning = metrics?.runningJobs || 0;
  const totalCompleted = metrics?.completedJobs || 0;
  const totalFailed = metrics?.failedJobs || 0;
  const dlqCount = metrics?.deadLetterCount || 0;
  const throughput = metrics?.throughputJobsPerMin || 0;
  const avgDuration = metrics?.avgExecutionTimeMs || 0;

  // Quick Chaos / Test Dispatch
  const dispatchDemoJob = async () => {
    await createJob({
      name: 'Simulated Order Processing Task',
      type: 'IMMEDIATE',
      priority: 'HIGH',
      payload: { customer: 'Acme Corp', amount: 890, simulatedDurationMs: 400 },
    });
  };

  const dispatchChaosJob = async () => {
    await createJob({
      name: 'Chaos Simulation (Will Fail & Retry)',
      type: 'IMMEDIATE',
      priority: 'CRITICAL',
      payload: { forceFail: true, failMessage: 'Simulated downstream payment network 503 error' },
    });
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-200">
      {/* Top Banner / System Health Statement */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 rounded-2xl border border-slate-200 bg-gradient-to-r from-slate-900 via-slate-800 to-indigo-950 p-6 text-white shadow-md">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <span className="inline-flex h-2.5 w-2.5 rounded-full bg-emerald-400 animate-pulse"></span>
            <span className="text-xs font-mono font-semibold uppercase tracking-widest text-indigo-300">
              Cluster Status: Optimal
            </span>
          </div>
          <h1 className="text-xl font-bold tracking-tight">Distributed Job Scheduler Engine</h1>
          <p className="text-xs text-slate-300 max-w-xl">
            Atomic job claiming with row-level locking, fair priority dispatching, exponential backoff retries, and dead letter isolation.
          </p>
        </div>

        <div className="flex items-center gap-2.5 flex-wrap">
          <button
            onClick={dispatchDemoJob}
            className="flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3.5 py-2 text-xs font-bold text-white hover:bg-indigo-500 shadow-sm transition-all"
          >
            <Play className="h-3.5 w-3.5" />
            <span>Dispatch Test Task</span>
          </button>

          <button
            onClick={dispatchChaosJob}
            className="flex items-center gap-1.5 rounded-lg bg-rose-600/80 px-3.5 py-2 text-xs font-bold text-white hover:bg-rose-600 shadow-sm transition-all"
            title="Spawns a job designed to fail, test backoff retries, and trigger DLQ"
          >
            <Flame className="h-3.5 w-3.5" />
            <span>Simulate Chaos Failure</span>
          </button>
        </div>
      </div>

      {/* KPI Stats Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3.5">
        {/* Active Running */}
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-xs">
          <div className="flex items-center justify-between text-slate-500">
            <span className="text-xs font-semibold">Running</span>
            <Activity className="h-4 w-4 text-blue-500 animate-spin" />
          </div>
          <p className="mt-2 text-2xl font-bold tracking-tight text-slate-900">{totalRunning}</p>
          <span className="text-[10px] font-semibold text-blue-600">Active in worker threads</span>
        </div>

        {/* Queued Depth */}
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-xs">
          <div className="flex items-center justify-between text-slate-500">
            <span className="text-xs font-semibold">Queued Backlog</span>
            <Inbox className="h-4 w-4 text-amber-500" />
          </div>
          <p className="mt-2 text-2xl font-bold tracking-tight text-slate-900">{totalQueued}</p>
          <span className="text-[10px] font-semibold text-amber-600">Awaiting worker claim</span>
        </div>

        {/* Completed */}
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-xs">
          <div className="flex items-center justify-between text-slate-500">
            <span className="text-xs font-semibold">Completed</span>
            <CheckCircle2 className="h-4 w-4 text-emerald-500" />
          </div>
          <p className="mt-2 text-2xl font-bold tracking-tight text-slate-900">{totalCompleted}</p>
          <span className="text-[10px] font-semibold text-emerald-600">Successfully executed</span>
        </div>

        {/* Dead Letter Queue */}
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-xs">
          <div className="flex items-center justify-between text-slate-500">
            <span className="text-xs font-semibold">Dead Letter (DLQ)</span>
            <AlertOctagon className="h-4 w-4 text-rose-500" />
          </div>
          <p className="mt-2 text-2xl font-bold tracking-tight text-slate-900">{dlqCount}</p>
          <span className="text-[10px] font-semibold text-rose-600">Retries exhausted</span>
        </div>

        {/* Throughput */}
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-xs">
          <div className="flex items-center justify-between text-slate-500">
            <span className="text-xs font-semibold">Throughput</span>
            <TrendingUp className="h-4 w-4 text-indigo-500" />
          </div>
          <p className="mt-2 text-2xl font-bold tracking-tight text-slate-900">{throughput}</p>
          <span className="text-[10px] font-semibold text-slate-500">jobs / minute</span>
        </div>

        {/* Avg Latency */}
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-xs">
          <div className="flex items-center justify-between text-slate-500">
            <span className="text-xs font-semibold">Avg Duration</span>
            <Clock className="h-4 w-4 text-purple-500" />
          </div>
          <p className="mt-2 text-2xl font-bold tracking-tight text-slate-900">{avgDuration}ms</p>
          <span className="text-[10px] font-semibold text-slate-500">Worker execution time</span>
        </div>
      </div>

      {/* Main Two Column Section: Queue Utilization & Recent Activity */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left 2 Cols: Queues Overview */}
        <div className="lg:col-span-2 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-sm font-bold text-slate-900">Queue Capacity & Real-Time Depth</h2>
              <p className="text-xs text-slate-500">Concurrency limits and backlog across provisioned queues</p>
            </div>
            <button
              onClick={() => onNavigateToTab('queues')}
              className="flex items-center gap-1 text-xs font-semibold text-indigo-600 hover:text-indigo-800"
            >
              <span>View all queues</span>
              <ArrowUpRight className="h-3.5 w-3.5" />
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
            {queueStats.map(stat => {
              const utilPercent = Math.min(
                100,
                Math.round((stat.runningCount / (stat.concurrencyLimit || 1)) * 100)
              );
              return (
                <div
                  key={stat.queueId}
                  className="rounded-xl border border-slate-200 bg-white p-4 shadow-xs hover:border-slate-300 transition-all"
                >
                  <div className="flex items-start justify-between">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-xs font-bold text-slate-900">{stat.queueName}</span>
                        <span
                          className={`rounded px-1.5 py-0.2 text-[9px] font-bold ${
                            stat.priority === 'CRITICAL'
                              ? 'bg-rose-100 text-rose-800'
                              : stat.priority === 'HIGH'
                              ? 'bg-amber-100 text-amber-800'
                              : 'bg-slate-100 text-slate-700'
                          }`}
                        >
                          {stat.priority}
                        </span>
                      </div>
                      <span className="text-[11px] text-slate-400">Limit: {stat.concurrencyLimit} concurrent</span>
                    </div>

                    <span
                      className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${
                        stat.status === 'ACTIVE'
                          ? 'bg-emerald-100 text-emerald-800'
                          : 'bg-amber-100 text-amber-800'
                      }`}
                    >
                      {stat.status}
                    </span>
                  </div>

                  {/* Utilization Bar */}
                  <div className="mt-3">
                    <div className="flex justify-between text-[11px] font-medium text-slate-600 mb-1">
                      <span>Running: {stat.runningCount} / {stat.concurrencyLimit}</span>
                      <span>{utilPercent}% Utilized</span>
                    </div>
                    <div className="h-2 w-full rounded-full bg-slate-100 overflow-hidden">
                      <div
                        className={`h-full transition-all duration-300 ${
                          utilPercent > 80 ? 'bg-amber-500' : 'bg-indigo-600'
                        }`}
                        style={{ width: `${utilPercent}%` }}
                      />
                    </div>
                  </div>

                  {/* Queue Metric Badges */}
                  <div className="mt-3 flex items-center justify-between border-t border-slate-100 pt-2.5 text-[11px] text-slate-500">
                    <span>Backlog: <strong className="text-slate-800">{stat.queuedCount}</strong></span>
                    <span>Done: <strong className="text-emerald-700">{stat.completedCount}</strong></span>
                    <span>DLQ: <strong className="text-rose-700">{stat.deadLetterCount}</strong></span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Right 1 Col: Live Job Activity Stream */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-sm font-bold text-slate-900">Recent Job Stream</h2>
              <p className="text-xs text-slate-500">Click any job for execution telemetry</p>
            </div>
            <button
              onClick={() => onNavigateToTab('jobs')}
              className="flex items-center gap-1 text-xs font-semibold text-indigo-600 hover:text-indigo-800"
            >
              <span>Explorer</span>
              <ArrowUpRight className="h-3.5 w-3.5" />
            </button>
          </div>

          <div className="rounded-xl border border-slate-200 bg-white p-3 space-y-2 max-h-[460px] overflow-y-auto shadow-xs">
            {jobs.slice(0, 10).map(job => (
              <div
                key={job.id}
                onClick={() => setSelectedJobId(job.id)}
                className="group flex items-center justify-between rounded-lg p-2.5 hover:bg-slate-50 cursor-pointer border border-transparent hover:border-slate-200 transition-all"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="truncate text-xs font-semibold text-slate-800 group-hover:text-indigo-600">
                      {job.name}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 mt-0.5 text-[10px] text-slate-400 font-mono">
                    <span>{job.queueId}</span>
                    <span>•</span>
                    <span>Att: {job.attempts}/{job.maxRetries}</span>
                  </div>
                </div>

                <div className="ml-2 flex-shrink-0">
                  <span
                    className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${
                      job.status === 'COMPLETED'
                        ? 'bg-emerald-100 text-emerald-800'
                        : job.status === 'RUNNING'
                        ? 'bg-blue-100 text-blue-800 animate-pulse'
                        : job.status === 'QUEUED'
                        ? 'bg-amber-100 text-amber-800'
                        : job.status === 'DEAD_LETTER'
                        ? 'bg-rose-100 text-rose-800'
                        : 'bg-purple-100 text-purple-800'
                    }`}
                  >
                    {job.status}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};
