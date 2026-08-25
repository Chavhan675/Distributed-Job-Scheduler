/**
 * Navigation Sidebar
 */

import React from 'react';
import { useScheduler } from '../context/SchedulerContext.tsx';
import {
  LayoutDashboard,
  Inbox,
  ListOrdered,
  Cpu,
  AlertOctagon,
  BarChart3,
  FlaskConical,
  BookOpen,
} from 'lucide-react';

export type ActiveTab =
  | 'dashboard'
  | 'queues'
  | 'jobs'
  | 'workers'
  | 'dlq'
  | 'metrics'
  | 'concurrency-lab'
  | 'docs';

interface SidebarProps {
  activeTab: ActiveTab;
  setActiveTab: (tab: ActiveTab) => void;
}

export const Sidebar: React.FC<SidebarProps> = ({ activeTab, setActiveTab }) => {
  const { jobs, deadLetters, queues, workers } = useScheduler();

  const queuedCount = jobs.filter(j => j.status === 'QUEUED' || j.status === 'RUNNING').length;
  const dlqCount = deadLetters.length;

  const navItems = [
    {
      id: 'dashboard' as ActiveTab,
      label: 'Dashboard',
      icon: LayoutDashboard,
      badge: null,
    },
    {
      id: 'queues' as ActiveTab,
      label: 'Queue Explorer',
      icon: Inbox,
      badge: queues.length,
    },
    {
      id: 'jobs' as ActiveTab,
      label: 'Job Explorer',
      icon: ListOrdered,
      badge: queuedCount > 0 ? queuedCount : null,
      badgeColor: 'bg-amber-100 text-amber-800 border-amber-200',
    },
    {
      id: 'workers' as ActiveTab,
      label: 'Worker Fleet',
      icon: Cpu,
      badge: workers.length,
    },
    {
      id: 'dlq' as ActiveTab,
      label: 'Dead Letter Queue',
      icon: AlertOctagon,
      badge: dlqCount > 0 ? dlqCount : null,
      badgeColor: 'bg-rose-100 text-rose-800 border-rose-200',
    },
    {
      id: 'metrics' as ActiveTab,
      label: 'Metrics & Analytics',
      icon: BarChart3,
      badge: null,
    },
    {
      id: 'concurrency-lab' as ActiveTab,
      label: 'Concurrency Lab',
      icon: FlaskConical,
      badge: 'LIVE TEST',
      badgeColor: 'bg-indigo-100 text-indigo-800 border-indigo-200 font-mono text-[9px]',
    },
    {
      id: 'docs' as ActiveTab,
      label: 'Architecture & Docs',
      icon: BookOpen,
      badge: null,
    },
  ];

  return (
    <aside id="main-sidebar" className="w-64 flex-shrink-0 border-r border-slate-200 bg-slate-50/70 p-4 flex flex-col justify-between">
      <div className="space-y-6">
        <div>
          <span className="px-3 text-[11px] font-bold uppercase tracking-wider text-slate-400">
            System Control
          </span>
          <nav className="mt-2 space-y-1">
            {navItems.map(item => {
              const Icon = item.icon;
              const isActive = activeTab === item.id;
              return (
                <button
                  key={item.id}
                  id={`nav-item-${item.id}`}
                  onClick={() => setActiveTab(item.id)}
                  className={`w-full flex items-center justify-between rounded-lg px-3 py-2.5 text-xs font-semibold transition-all ${
                    isActive
                      ? 'bg-white text-slate-900 shadow-xs border border-slate-200 font-bold'
                      : 'text-slate-600 hover:bg-slate-100/80 hover:text-slate-900'
                  }`}
                >
                  <div className="flex items-center gap-2.5">
                    <Icon className={`h-4 w-4 ${isActive ? 'text-indigo-600' : 'text-slate-400'}`} />
                    <span>{item.label}</span>
                  </div>
                  {item.badge !== null && (
                    <span
                      className={`rounded px-1.5 py-0.5 text-[10px] font-semibold border ${
                        item.badgeColor || 'bg-slate-100 text-slate-600 border-slate-200'
                      }`}
                    >
                      {item.badge}
                    </span>
                  )}
                </button>
              );
            })}
          </nav>
        </div>

        {/* Distributed Locking Guarantee Badge */}
        <div className="rounded-xl border border-indigo-100 bg-indigo-50/60 p-3.5">
          <div className="flex items-center gap-1.5 text-xs font-bold text-indigo-950">
            <span className="h-2 w-2 rounded-full bg-indigo-600"></span>
            <span>Atomic Row Locking</span>
          </div>
          <p className="mt-1 text-[11px] leading-relaxed text-indigo-900/80">
            Workers poll with <code className="font-mono bg-indigo-100/80 px-1 py-0.5 rounded text-[10px] text-indigo-950">SELECT FOR UPDATE SKIP LOCKED</code> guaranteeing zero duplicate execution.
          </p>
        </div>
      </div>

      {/* Cluster Footer Info */}
      <div className="border-t border-slate-200 pt-3">
        <div className="flex items-center justify-between text-[11px] text-slate-500">
          <span>Engine Status</span>
          <span className="inline-flex items-center gap-1 font-semibold text-emerald-600">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500"></span>
            Operational
          </span>
        </div>
        <p className="mt-1 text-[10px] text-slate-400">Node.js + ACID In-Memory Relational Engine</p>
      </div>
    </aside>
  );
};
