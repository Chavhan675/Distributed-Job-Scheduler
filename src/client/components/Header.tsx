/**
 * Top Application Header
 */

import React from 'react';
import { useScheduler } from '../context/SchedulerContext.tsx';
import {
  Layers,
  Activity,
  Plus,
  RefreshCw,
  Cpu,
  CheckCircle2,
  AlertTriangle,
  Flame,
  Zap,
} from 'lucide-react';

interface HeaderProps {
  onOpenNewJob: () => void;
  onOpenNewQueue: () => void;
}

export const Header: React.FC<HeaderProps> = ({ onOpenNewJob, onOpenNewQueue }) => {
  const {
    projects,
    selectedProject,
    setSelectedProject,
    workers,
    metrics,
    isAutoRefresh,
    setIsAutoRefresh,
    refreshData,
    toastMessage,
  } = useScheduler();

  const activeWorkers = workers.filter(w => w.status === 'IDLE' || w.status === 'BUSY');

  return (
    <header id="main-header" className="sticky top-0 z-30 flex items-center justify-between border-b border-slate-200 bg-white/90 px-6 py-3.5 backdrop-blur-md">
      {/* Toast Notification Banner */}
      {toastMessage && (
        <div
          id="toast-notification"
          className="fixed top-4 right-6 z-50 flex items-center gap-2.5 rounded-lg border border-slate-900 bg-slate-900 px-4 py-2.5 text-sm font-medium text-white shadow-xl animate-in fade-in slide-in-from-top-2"
        >
          <Zap className="h-4 w-4 text-emerald-400" />
          <span>{toastMessage}</span>
        </div>
      )}

      {/* Left: Brand & Project Switcher */}
      <div className="flex items-center gap-6">
        <div className="flex items-center gap-2.5">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-slate-900 text-white shadow-sm">
            <Layers className="h-5 w-5 text-indigo-400" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-semibold text-slate-900 tracking-tight">KinetiQ</span>
              <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-mono font-semibold uppercase text-slate-600 border border-slate-200">
                v2.4 Distributed
              </span>
            </div>
            <p className="text-xs text-slate-500">Distributed Job & Queue Engine</p>
          </div>
        </div>

        <div className="h-6 w-px bg-slate-200" />

        {/* Project Selector */}
        <div className="flex items-center gap-2">
          <span className="text-xs font-medium text-slate-500">Project:</span>
          <select
            id="project-selector"
            className="rounded-lg border border-slate-300 bg-slate-50 px-3 py-1.5 text-xs font-semibold text-slate-800 focus:border-slate-900 focus:bg-white focus:outline-none"
            value={selectedProject?.id || ''}
            onChange={e => {
              const p = projects.find(proj => proj.id === e.target.value);
              setSelectedProject(p || null);
            }}
          >
            {projects.map(p => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Right: Telemetry Indicators & Quick Actions */}
      <div className="flex items-center gap-3">
        {/* Workers Node Indicator */}
        <div className="flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-medium text-slate-700">
          <span className="relative flex h-2 w-2">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75"></span>
            <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500"></span>
          </span>
          <Cpu className="h-3.5 w-3.5 text-slate-500" />
          <span>
            <strong className="font-semibold text-slate-900">{activeWorkers.length}</strong> / {workers.length} Workers Active
          </span>
        </div>

        {/* Live Auto-Refresh Toggle */}
        <button
          id="btn-toggle-refresh"
          onClick={() => setIsAutoRefresh(!isAutoRefresh)}
          className={`flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors ${
            isAutoRefresh
              ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
              : 'border-slate-300 bg-white text-slate-600 hover:bg-slate-50'
          }`}
          title="Toggle live 2.5s polling sync"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${isAutoRefresh ? 'animate-spin' : ''}`} style={{ animationDuration: '4s' }} />
          <span>{isAutoRefresh ? 'Live Sync' : 'Paused'}</span>
        </button>

        {/* Refresh manual */}
        <button
          id="btn-manual-refresh"
          onClick={() => refreshData()}
          className="rounded-lg border border-slate-300 bg-white p-1.5 text-slate-600 hover:bg-slate-50 transition-colors"
          title="Manual refresh"
        >
          <RefreshCw className="h-3.5 w-3.5" />
        </button>

        {/* Quick Action: New Queue */}
        <button
          id="btn-open-new-queue"
          onClick={onOpenNewQueue}
          className="flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-800 hover:bg-slate-50 hover:border-slate-400 transition-all shadow-xs"
        >
          <Plus className="h-3.5 w-3.5" />
          <span>New Queue</span>
        </button>

        {/* Quick Action: New Job */}
        <button
          id="btn-open-new-job"
          onClick={onOpenNewJob}
          className="flex items-center gap-1.5 rounded-lg bg-slate-900 px-3.5 py-1.5 text-xs font-semibold text-white hover:bg-slate-800 transition-all shadow-sm"
        >
          <Plus className="h-3.5 w-3.5 text-indigo-300" />
          <span>Enqueue Job</span>
        </button>
      </div>
    </header>
  );
};
