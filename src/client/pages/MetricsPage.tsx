/**
 * Metrics & Observability View
 */

import React from 'react';
import { useScheduler } from '../context/SchedulerContext.tsx';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  LineChart,
  Line,
} from 'recharts';
import { BarChart3, TrendingUp, Cpu, Inbox, Activity } from 'lucide-react';

const STATUS_COLORS: Record<string, string> = {
  Completed: '#10b981', // emerald-500
  Running: '#3b82f6',   // blue-500
  Queued: '#f59e0b',    // amber-500
  Scheduled: '#0ea5e9', // sky-500
  RetryPending: '#8b5cf6', // purple-500
  DeadLetter: '#ef4444',   // rose-500
};

export const MetricsPage: React.FC = () => {
  const { metrics, queueStats, workers, jobs } = useScheduler();

  // 1. Status Distribution Data
  const completedCount = jobs.filter(j => j.status === 'COMPLETED').length;
  const runningCount = jobs.filter(j => j.status === 'RUNNING').length;
  const queuedCount = jobs.filter(j => j.status === 'QUEUED').length;
  const scheduledCount = jobs.filter(j => j.status === 'SCHEDULED').length;
  const retryCount = jobs.filter(j => j.status === 'RETRY_PENDING').length;
  const dlqCount = jobs.filter(j => j.status === 'DEAD_LETTER').length;

  const statusDistribution = [
    { name: 'Completed', value: completedCount || 1, color: STATUS_COLORS.Completed },
    { name: 'Running', value: runningCount, color: STATUS_COLORS.Running },
    { name: 'Queued', value: queuedCount, color: STATUS_COLORS.Queued },
    { name: 'Scheduled', value: scheduledCount, color: STATUS_COLORS.Scheduled },
    { name: 'RetryPending', value: retryCount, color: STATUS_COLORS.RetryPending },
    { name: 'DeadLetter', value: dlqCount, color: STATUS_COLORS.DeadLetter },
  ].filter(item => item.value > 0);

  // 2. Queue Concurrency vs Backlog
  const queueBarData = queueStats.map(qs => ({
    name: qs.queueName,
    concurrencyLimit: qs.concurrencyLimit,
    running: qs.runningCount,
    backlog: qs.queuedCount,
    completed: qs.completedCount,
  }));

  // 3. Worker Fleet Load
  const workerLoadData = workers.map(w => ({
    name: w.name.split(' ')[0] || w.id,
    currentJobs: w.currentJobsCount,
    capacity: w.concurrencyLimit,
    totalProcessed: w.totalJobsProcessed,
  }));

  return (
    <div className="space-y-6 animate-in fade-in duration-200">
      {/* Header */}
      <div>
        <h1 className="text-xl font-bold tracking-tight text-slate-900">System Metrics & Analytics</h1>
        <p className="text-xs text-slate-500">Live observability, queue capacity distribution, and worker saturation</p>
      </div>

      {/* Top Metrics Row */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-xs">
          <div className="flex items-center justify-between text-slate-500">
            <span className="text-xs font-semibold">Total Jobs Processed</span>
            <TrendingUp className="h-4 w-4 text-emerald-500" />
          </div>
          <p className="mt-2 text-2xl font-bold text-slate-900">{metrics?.completedJobs || 0}</p>
          <span className="text-[10px] text-emerald-600 font-semibold">All queues lifetime</span>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-xs">
          <div className="flex items-center justify-between text-slate-500">
            <span className="text-xs font-semibold">Throughput Rate</span>
            <Activity className="h-4 w-4 text-blue-500" />
          </div>
          <p className="mt-2 text-2xl font-bold text-slate-900">{metrics?.throughputJobsPerMin || 0}</p>
          <span className="text-[10px] text-slate-500">jobs / minute</span>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-xs">
          <div className="flex items-center justify-between text-slate-500">
            <span className="text-xs font-semibold">Avg Execution Latency</span>
            <BarChart3 className="h-4 w-4 text-purple-500" />
          </div>
          <p className="mt-2 text-2xl font-bold text-slate-900">{metrics?.avgExecutionTimeMs || 0}ms</p>
          <span className="text-[10px] text-slate-500">Task compute time</span>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-xs">
          <div className="flex items-center justify-between text-slate-500">
            <span className="text-xs font-semibold">Worker Node Capacity</span>
            <Cpu className="h-4 w-4 text-indigo-500" />
          </div>
          <p className="mt-2 text-2xl font-bold text-slate-900">
            {workers.reduce((acc, w) => acc + w.currentJobsCount, 0)} / {workers.reduce((acc, w) => acc + w.concurrencyLimit, 0)}
          </p>
          <span className="text-[10px] text-indigo-600 font-semibold">Slots utilized</span>
        </div>
      </div>

      {/* Charts Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Chart 1: Queue Depth vs Concurrency Limits */}
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs">
          <div className="mb-4">
            <h3 className="text-sm font-bold text-slate-900">Queue Capacity vs Current Backlog</h3>
            <p className="text-xs text-slate-500">Comparing max concurrency limit against live queued and running jobs</p>
          </div>
          <div className="h-72 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={queueBarData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                <Bar dataKey="concurrencyLimit" fill="#e2e8f0" name="Max Concurrency Limit" />
                <Bar dataKey="running" fill="#3b82f6" name="Currently Running" />
                <Bar dataKey="backlog" fill="#f59e0b" name="Queued Backlog" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Chart 2: Job Lifecycle Status Breakdown */}
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs">
          <div className="mb-4">
            <h3 className="text-sm font-bold text-slate-900">Job Status Distribution</h3>
            <p className="text-xs text-slate-500">Proportional breakdown of all active and historical jobs</p>
          </div>
          <div className="h-72 w-full flex items-center justify-center">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={statusDistribution}
                  cx="50%"
                  cy="50%"
                  innerRadius={60}
                  outerRadius={95}
                  paddingAngle={3}
                  dataKey="value"
                >
                  {statusDistribution.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip />
                <Legend wrapperStyle={{ fontSize: 11 }} />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Chart 3: Worker Fleet Node Saturation */}
        <div className="lg:col-span-2 rounded-2xl border border-slate-200 bg-white p-5 shadow-xs">
          <div className="mb-4">
            <h3 className="text-sm font-bold text-slate-900">Worker Node Execution Load & Total Processed</h3>
            <p className="text-xs text-slate-500">Node-by-node allocation of current task slots vs total lifetime processed</p>
          </div>
          <div className="h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={workerLoadData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                <Bar dataKey="capacity" fill="#cbd5e1" name="Worker Concurrency Limit" />
                <Bar dataKey="currentJobs" fill="#6366f1" name="Active Running Tasks" />
                <Bar dataKey="totalProcessed" fill="#10b981" name="Total Completed Jobs" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>
    </div>
  );
};
