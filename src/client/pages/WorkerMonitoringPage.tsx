/**
 * Worker Monitoring & Fleet Control View
 */

import React, { useState } from 'react';
import { useScheduler } from '../context/SchedulerContext.tsx';
import {
  Cpu,
  Plus,
  Play,
  Pause,
  Trash2,
  Activity,
  Server,
  ShieldAlert,
  Zap,
  CheckCircle2,
} from 'lucide-react';

export const WorkerMonitoringPage: React.FC = () => {
  const {
    workers,
    spawnWorker,
    pauseWorker,
    resumeWorker,
    terminateWorker,
    reapStaleWorkers,
  } = useScheduler();

  const [newWorkerName, setNewWorkerName] = useState<string>('Node Worker [Worker-Delta]');
  const [concurrency, setConcurrency] = useState<number>(4);
  const [isSpawning, setIsSpawning] = useState<boolean>(false);

  const handleSpawn = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSpawning(true);
    try {
      await spawnWorker(newWorkerName, concurrency);
      setNewWorkerName(`Node Worker [Worker-${Date.now().toString().slice(-4)}]`);
    } finally {
      setIsSpawning(false);
    }
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-200">
      {/* Header & Controls */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-slate-900">Worker Fleet & Heartbeat Monitor</h1>
          <p className="text-xs text-slate-500">
            Real-time topology, heartbeat health, process IDs, and automatic stale worker failover
          </p>
        </div>

        <div className="flex items-center gap-2">
          {/* Stale Worker Reaper Trigger */}
          <button
            onClick={() => reapStaleWorkers()}
            className="flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 shadow-xs"
            title="Scan cluster for workers whose heartbeats exceeded timeout"
          >
            <ShieldAlert className="h-3.5 w-3.5 text-amber-600" />
            <span>Trigger Stale Reaper</span>
          </button>
        </div>
      </div>

      {/* Spawn New Worker Card */}
      <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-xs">
        <h2 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-3">Scale Worker Pool</h2>
        <form onSubmit={handleSpawn} className="flex flex-col sm:flex-row items-center gap-3">
          <div className="flex-1 w-full">
            <input
              type="text"
              required
              className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-medium text-slate-800 focus:border-slate-900 focus:outline-none"
              value={newWorkerName}
              onChange={e => setNewWorkerName(e.target.value)}
              placeholder="Worker Name"
            />
          </div>

          <div className="flex items-center gap-2 w-full sm:w-auto">
            <span className="text-xs font-semibold text-slate-500">Concurrency:</span>
            <input
              type="number"
              min="1"
              max="20"
              className="w-20 rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-800 focus:outline-none"
              value={concurrency}
              onChange={e => setConcurrency(parseInt(e.target.value, 10) || 4)}
            />
          </div>

          <button
            type="submit"
            disabled={isSpawning}
            className="flex items-center justify-center gap-1.5 rounded-lg bg-slate-900 px-4 py-2 text-xs font-bold text-white hover:bg-slate-800 disabled:opacity-50 shadow-sm w-full sm:w-auto"
          >
            <Plus className="h-3.5 w-3.5" />
            <span>{isSpawning ? 'Spawning...' : 'Spawn Worker'}</span>
          </button>
        </form>
      </div>

      {/* Workers Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {workers.map(worker => {
          const isDead = worker.status === 'DEAD';
          const isBusy = worker.status === 'BUSY';
          const isPaused = worker.status === 'PAUSED';

          return (
            <div
              key={worker.id}
              className={`rounded-2xl border bg-white p-5 shadow-xs transition-all ${
                isDead
                  ? 'border-rose-300 bg-rose-50/30'
                  : isBusy
                  ? 'border-indigo-200'
                  : 'border-slate-200'
              }`}
            >
              {/* Card Header */}
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-2.5">
                  <div
                    className={`flex h-9 w-9 items-center justify-center rounded-xl ${
                      isDead
                        ? 'bg-rose-100 text-rose-700'
                        : isBusy
                        ? 'bg-indigo-100 text-indigo-700'
                        : 'bg-slate-100 text-slate-700'
                    }`}
                  >
                    <Cpu className="h-5 w-5" />
                  </div>
                  <div>
                    <h3 className="font-bold text-slate-900 text-sm leading-tight">{worker.name}</h3>
                    <p className="font-mono text-[11px] text-slate-400">
                      PID {worker.pid} • {worker.hostname}
                    </p>
                  </div>
                </div>

                <span
                  className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${
                    isDead
                      ? 'bg-rose-100 text-rose-800 border border-rose-200'
                      : isBusy
                      ? 'bg-blue-100 text-blue-800 border border-blue-200 animate-pulse'
                      : isPaused
                      ? 'bg-amber-100 text-amber-800 border border-amber-200'
                      : 'bg-emerald-100 text-emerald-800 border border-emerald-200'
                  }`}
                >
                  {worker.status}
                </span>
              </div>

              {/* Heartbeat & Metrics */}
              <div className="mt-4 space-y-2 text-xs">
                <div className="flex justify-between text-slate-600">
                  <span>Current Load:</span>
                  <span className="font-mono font-bold text-slate-900">
                    {worker.currentJobsCount} / {worker.concurrencyLimit} active jobs
                  </span>
                </div>

                {/* Progress bar */}
                <div className="h-1.5 w-full rounded-full bg-slate-100 overflow-hidden">
                  <div
                    className="h-full bg-indigo-600 transition-all duration-300"
                    style={{
                      width: `${Math.min(
                        100,
                        (worker.currentJobsCount / (worker.concurrencyLimit || 1)) * 100
                      )}%`,
                    }}
                  />
                </div>

                <div className="flex justify-between text-[11px] text-slate-500 pt-1">
                  <span>Total Processed: <strong className="text-slate-800">{worker.totalJobsProcessed}</strong></span>
                  <span className="text-emerald-700 font-semibold">{worker.successfulJobs} ok</span>
                  <span className="text-rose-700 font-semibold">{worker.failedJobs} failed</span>
                </div>

                <div className="flex items-center justify-between border-t border-slate-100 pt-2 text-[11px] text-slate-400">
                  <div className="flex items-center gap-1.5">
                    <span className={`h-2 w-2 rounded-full ${isDead ? 'bg-rose-500' : 'bg-emerald-500 animate-ping'}`}></span>
                    <span>Pulse: {new Date(worker.lastHeartbeat).toLocaleTimeString()}</span>
                  </div>
                  <span className="font-mono text-[10px]">timeout: {worker.heartbeatTimeoutMs / 1000}s</span>
                </div>
              </div>

              {/* Actions */}
              <div className="mt-4 flex items-center justify-end gap-1.5 border-t border-slate-100 pt-3">
                {!isDead && (
                  <>
                    {isPaused ? (
                      <button
                        onClick={() => resumeWorker(worker.id)}
                        className="flex items-center gap-1 rounded-lg bg-emerald-50 px-2.5 py-1 text-xs font-bold text-emerald-700 hover:bg-emerald-100"
                      >
                        <Play className="h-3 w-3" />
                        <span>Resume</span>
                      </button>
                    ) : (
                      <button
                        onClick={() => pauseWorker(worker.id)}
                        className="flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs font-bold text-amber-700 hover:bg-amber-50"
                      >
                        <Pause className="h-3 w-3" />
                        <span>Pause</span>
                      </button>
                    )}
                  </>
                )}

                <button
                  onClick={() => terminateWorker(worker.id)}
                  className="flex items-center gap-1 rounded-lg bg-rose-50 px-2.5 py-1 text-xs font-bold text-rose-700 hover:bg-rose-100"
                  title="Gracefully drain and stop worker"
                >
                  <Trash2 className="h-3 w-3" />
                  <span>Terminate</span>
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
