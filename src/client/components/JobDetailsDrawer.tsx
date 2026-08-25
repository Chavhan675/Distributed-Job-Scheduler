/**
 * Job Details Inspection Drawer
 * 
 * Inspects Job state, parameters, correlation IDs, DAG dependencies,
 * execution logs, retry audit history, and domain event stream.
 */

import React, { useState, useEffect } from 'react';
import { useScheduler } from '../context/SchedulerContext.tsx';
import { Job, JobExecution, JobEvent } from '../../types.ts';
import {
  X,
  RefreshCw,
  Ban,
  Clock,
  CheckCircle2,
  AlertOctagon,
  AlertTriangle,
  Cpu,
  Terminal,
  Copy,
  Check,
  GitFork,
  Radio,
  Tag,
} from 'lucide-react';

export const JobDetailsDrawer: React.FC = () => {
  const { selectedJobId, setSelectedJobId, retryJob, cancelJob } = useScheduler();
  const [job, setJob] = useState<Job | null>(null);
  const [executions, setExecutions] = useState<JobExecution[]>([]);
  const [events, setEvents] = useState<JobEvent[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [copied, setCopied] = useState<boolean>(false);
  const [activeTab, setActiveTab] = useState<'overview' | 'executions' | 'events'>('overview');

  useEffect(() => {
    if (!selectedJobId) {
      setJob(null);
      setExecutions([]);
      setEvents([]);
      return;
    }

    let isMounted = true;
    const fetchDetails = async () => {
      setIsLoading(true);
      try {
        const res = await fetch(`/api/jobs/${selectedJobId}`);
        const contentType = res.headers.get('content-type') || '';
        if (res.ok && contentType.includes('application/json')) {
          const data = await res.json();
          if (isMounted) {
            setJob(data.job);
            setExecutions(data.executions || []);
            setEvents(data.events || []);
          }
        }
      } catch (err) {
        console.error('Failed fetching job details:', err);
      } finally {
        if (isMounted) setIsLoading(false);
      }
    };

    fetchDetails();
    const interval = setInterval(fetchDetails, 2000);
    return () => {
      isMounted = false;
      clearInterval(interval);
    };
  }, [selectedJobId]);

  if (!selectedJobId) return null;

  const copyPayload = () => {
    if (job) {
      navigator.clipboard.writeText(JSON.stringify(job.payload, null, 2));
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'COMPLETED':
        return <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-bold text-emerald-800 border border-emerald-200"><CheckCircle2 className="h-3 w-3" /> Completed</span>;
      case 'RUNNING':
        return <span className="inline-flex items-center gap-1 rounded-full bg-blue-100 px-2.5 py-0.5 text-xs font-bold text-blue-800 border border-blue-200 animate-pulse"><RefreshCw className="h-3 w-3 animate-spin" /> Running</span>;
      case 'CLAIMED':
        return <span className="inline-flex items-center gap-1 rounded-full bg-indigo-100 px-2.5 py-0.5 text-xs font-bold text-indigo-800 border border-indigo-200">Claimed</span>;
      case 'QUEUED':
        return <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-bold text-amber-800 border border-amber-200">Queued</span>;
      case 'SCHEDULED':
        return <span className="inline-flex items-center gap-1 rounded-full bg-sky-100 px-2.5 py-0.5 text-xs font-bold text-sky-800 border border-sky-200"><Clock className="h-3 w-3" /> Scheduled</span>;
      case 'RETRY_PENDING':
        return <span className="inline-flex items-center gap-1 rounded-full bg-purple-100 px-2.5 py-0.5 text-xs font-bold text-purple-800 border border-purple-200"><RefreshCw className="h-3 w-3" /> Retry Pending</span>;
      case 'DEAD_LETTER':
        return <span className="inline-flex items-center gap-1 rounded-full bg-rose-100 px-2.5 py-0.5 text-xs font-bold text-rose-800 border border-rose-200"><AlertOctagon className="h-3 w-3" /> Dead Letter</span>;
      case 'CANCELLED':
        return <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-bold text-slate-800 border border-slate-200"><Ban className="h-3 w-3" /> Cancelled</span>;
      default:
        return <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-bold text-slate-800">{status}</span>;
    }
  };

  return (
    <div className="fixed inset-y-0 right-0 z-50 flex w-full max-w-2xl flex-col border-l border-slate-200 bg-white shadow-2xl animate-in slide-in-from-right duration-200">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-slate-200 p-5 bg-slate-50/70">
        <div>
          <div className="flex items-center gap-2">
            <span className="font-mono text-xs font-bold text-slate-400">ID: {job?.id}</span>
            {job && getStatusBadge(job.status)}
          </div>
          <h2 className="mt-1 text-base font-bold text-slate-900">{job?.name || 'Job Details'}</h2>
        </div>
        <button
          onClick={() => setSelectedJobId(null)}
          className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-200 hover:text-slate-700 transition-colors"
        >
          <X className="h-5 w-5" />
        </button>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-slate-200 px-5 bg-white text-xs font-bold text-slate-600">
        <button
          onClick={() => setActiveTab('overview')}
          className={`py-3 px-4 border-b-2 transition-colors ${
            activeTab === 'overview' ? 'border-indigo-600 text-indigo-600' : 'border-transparent hover:text-slate-900'
          }`}
        >
          Overview & Payload
        </button>
        <button
          onClick={() => setActiveTab('executions')}
          className={`py-3 px-4 border-b-2 transition-colors flex items-center gap-1.5 ${
            activeTab === 'executions' ? 'border-indigo-600 text-indigo-600' : 'border-transparent hover:text-slate-900'
          }`}
        >
          <span>Executions</span>
          <span className="rounded-full bg-slate-100 px-1.5 py-0.2 text-[10px]">{executions.length}</span>
        </button>
        <button
          onClick={() => setActiveTab('events')}
          className={`py-3 px-4 border-b-2 transition-colors flex items-center gap-1.5 ${
            activeTab === 'events' ? 'border-indigo-600 text-indigo-600' : 'border-transparent hover:text-slate-900'
          }`}
        >
          <span>Event Trail (Audit)</span>
          <span className="rounded-full bg-indigo-50 px-1.5 py-0.2 text-[10px] text-indigo-700">{events.length}</span>
        </button>
      </div>

      {/* Drawer Body */}
      <div className="flex-1 overflow-y-auto p-5 space-y-6">
        {/* Quick Action Toolbar */}
        {job && (
          <div className="flex items-center justify-between rounded-xl bg-slate-100 p-2.5 border border-slate-200">
            <div className="flex items-center gap-2">
              {(job.status === 'DEAD_LETTER' || job.status === 'COMPLETED' || job.status === 'CANCELLED' || job.status === 'FAILED') && (
                <button
                  onClick={() => retryJob(job.id)}
                  className="flex items-center gap-1.5 rounded-lg bg-white px-3 py-1.5 text-xs font-bold text-slate-800 border border-slate-300 hover:bg-slate-50 shadow-xs"
                >
                  <RefreshCw className="h-3.5 w-3.5 text-indigo-600" />
                  <span>Requeue Job</span>
                </button>
              )}
              {job.status !== 'COMPLETED' && job.status !== 'CANCELLED' && (
                <button
                  onClick={() => cancelJob(job.id)}
                  className="flex items-center gap-1.5 rounded-lg bg-rose-50 px-3 py-1.5 text-xs font-bold text-rose-700 border border-rose-200 hover:bg-rose-100"
                >
                  <Ban className="h-3.5 w-3.5" />
                  <span>Cancel Job</span>
                </button>
              )}
            </div>

            {job.correlationId && (
              <div className="flex items-center gap-1 text-[11px] font-mono text-slate-500">
                <Tag className="h-3 w-3" />
                <span className="font-semibold text-slate-700">Corr:</span> {job.correlationId}
              </div>
            )}
          </div>
        )}

        {/* OVERVIEW TAB */}
        {activeTab === 'overview' && job && (
          <div className="space-y-6">
            {/* Metadata Card */}
            <div className="rounded-xl border border-slate-200 bg-white p-4 space-y-3 shadow-xs">
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400">Execution Metadata</h3>
              <div className="grid grid-cols-2 gap-3 text-xs">
                <div>
                  <span className="text-slate-500">Queue:</span>
                  <p className="font-semibold text-slate-800">{job.queueId}</p>
                </div>
                <div>
                  <span className="text-slate-500">Priority:</span>
                  <p className="font-semibold text-slate-800">{job.priority}</p>
                </div>
                <div>
                  <span className="text-slate-500">Attempts:</span>
                  <p className="font-semibold text-slate-800">
                    {job.attempts} / {job.maxRetries} max retries
                  </p>
                </div>
                <div>
                  <span className="text-slate-500">Worker Node:</span>
                  <p className="font-mono text-slate-800 font-semibold">{job.workerId || 'None (Unassigned)'}</p>
                </div>
                <div>
                  <span className="text-slate-500">Execution Timeout:</span>
                  <p className="font-semibold text-slate-800">{(job.timeoutMs || 30000) / 1000}s</p>
                </div>
                <div>
                  <span className="text-slate-500">Created:</span>
                  <p className="font-mono text-[11px] text-slate-700">{new Date(job.createdAt).toLocaleString()}</p>
                </div>
                {job.completedAt && (
                  <div>
                    <span className="text-slate-500">Completed:</span>
                    <p className="font-mono text-[11px] text-slate-700">{new Date(job.completedAt).toLocaleString()}</p>
                  </div>
                )}
                {job.nextRunAt && (
                  <div>
                    <span className="text-slate-500">Next Scheduled Run:</span>
                    <p className="font-mono text-[11px] text-indigo-700 font-semibold">{new Date(job.nextRunAt).toLocaleString()}</p>
                  </div>
                )}
                {job.idempotencyKey && (
                  <div className="col-span-2">
                    <span className="text-slate-500">Idempotency Key:</span>
                    <p className="font-mono text-[11px] text-slate-700">{job.idempotencyKey}</p>
                  </div>
                )}
              </div>
            </div>

            {/* DAG Dependencies Section if defined */}
            {job.dependencies && job.dependencies.length > 0 && (
              <div className="rounded-xl border border-indigo-100 bg-indigo-50/40 p-4 space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5 font-bold text-xs text-indigo-900">
                    <GitFork className="h-4 w-4 text-indigo-600" />
                    <span>DAG Workflow Dependencies</span>
                  </div>
                  <span className="text-[10px] font-bold uppercase rounded-full bg-indigo-100 px-2 py-0.5 text-indigo-800">
                    Status: {job.dependencyStatus || 'WAITING'}
                  </span>
                </div>
                <div className="space-y-1 mt-2">
                  {job.dependencies.map((depId, idx) => (
                    <div key={idx} className="flex items-center justify-between rounded-lg bg-white p-2 border border-indigo-100 text-xs font-mono">
                      <span className="text-slate-700">Parent Job: {depId}</span>
                      <button
                        onClick={() => setSelectedJobId(depId)}
                        className="text-[11px] text-indigo-600 hover:underline font-sans font-bold"
                      >
                        Inspect Parent &rarr;
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Error Message banner if failed */}
            {job.error && (
              <div className="rounded-xl border border-rose-200 bg-rose-50 p-3.5 text-xs text-rose-800">
                <div className="flex items-center gap-1.5 font-bold mb-1">
                  <AlertTriangle className="h-4 w-4 text-rose-600" />
                  <span>Execution Error</span>
                </div>
                <p className="font-mono text-[11px] bg-rose-100/70 p-2 rounded border border-rose-200 whitespace-pre-wrap">
                  {job.error}
                </p>
              </div>
            )}

            {/* Payload JSON */}
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400">Job Payload</h3>
                <button
                  onClick={copyPayload}
                  className="flex items-center gap-1 text-[11px] font-semibold text-slate-600 hover:text-slate-900"
                >
                  {copied ? <Check className="h-3 w-3 text-emerald-600" /> : <Copy className="h-3 w-3" />}
                  <span>{copied ? 'Copied' : 'Copy JSON'}</span>
                </button>
              </div>
              <pre className="font-mono text-xs rounded-xl bg-slate-900 text-slate-200 p-3.5 overflow-x-auto border border-slate-800">
                {JSON.stringify(job.payload, null, 2)}
              </pre>
            </div>

            {/* Result JSON (if completed) */}
            {job.result && (
              <div>
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-1.5">Execution Output Result</h3>
                <pre className="font-mono text-xs rounded-xl bg-emerald-950/40 text-emerald-300 p-3.5 overflow-x-auto border border-emerald-800/40">
                  {JSON.stringify(job.result, null, 2)}
                </pre>
              </div>
            )}

            {/* Retry History */}
            {job.retryHistory && job.retryHistory.length > 0 && (
              <div className="space-y-2">
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400">Retry Audit Log</h3>
                <div className="space-y-2">
                  {job.retryHistory.map((r, i) => (
                    <div key={i} className="rounded-xl border border-purple-100 bg-purple-50/50 p-3 text-xs">
                      <div className="flex items-center justify-between font-semibold text-purple-900">
                        <span>Attempt #{r.attempt} ({r.strategy} Backoff)</span>
                        <span className="font-mono text-[11px]">Delay: {r.delayMs}ms</span>
                      </div>
                      <p className="mt-1 text-[11px] text-purple-800 font-mono">{r.error}</p>
                      <p className="mt-1 text-[10px] text-purple-600">
                        Next run scheduled for: {new Date(r.nextRetryAt).toLocaleTimeString()}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* EXECUTIONS TAB */}
        {activeTab === 'executions' && (
          <div className="space-y-4">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400">Execution Attempt History</h3>
            {executions.length === 0 ? (
              <div className="rounded-xl border border-dashed border-slate-200 p-6 text-center text-xs text-slate-400">
                No execution attempts recorded yet
              </div>
            ) : (
              executions.map((exec) => (
                <div key={exec.id} className="rounded-xl border border-slate-200 bg-white p-4 space-y-3 shadow-xs">
                  <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-slate-800 text-xs">Attempt #{exec.attemptNumber}</span>
                      <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${
                        exec.status === 'SUCCESS' ? 'bg-emerald-100 text-emerald-800' : 'bg-rose-100 text-rose-800'
                      }`}>
                        {exec.status}
                      </span>
                    </div>
                    <span className="text-[11px] font-mono text-slate-500">
                      Duration: {exec.durationMs ? `${exec.durationMs}ms` : 'In progress'}
                    </span>
                  </div>

                  <div className="grid grid-cols-2 gap-2 text-xs text-slate-600">
                    <div>
                      <span className="text-slate-400">Worker ID:</span>
                      <p className="font-mono text-[11px] text-slate-800 font-semibold">{exec.workerId}</p>
                    </div>
                    <div>
                      <span className="text-slate-400">Started:</span>
                      <p className="font-mono text-[11px] text-slate-700">{new Date(exec.startedAt).toLocaleTimeString()}</p>
                    </div>
                  </div>

                  {exec.logs && exec.logs.length > 0 && (
                    <div className="rounded-lg bg-slate-950 p-3 font-mono text-[11px] text-emerald-400 space-y-1">
                      <div className="flex items-center gap-1 text-[10px] text-slate-400 border-b border-slate-800 pb-1 mb-1">
                        <Terminal className="h-3 w-3" />
                        <span>Execution Logs</span>
                      </div>
                      {exec.logs.map((log, lIdx) => (
                        <p key={lIdx}>{log}</p>
                      ))}
                    </div>
                  )}
                </div>
              ))
            )}
          </div>
        )}

        {/* EVENTS TAB (AUDIT TRAIL) */}
        {activeTab === 'events' && (
          <div className="space-y-3">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400">Domain Event Stream</h3>
            {events.length === 0 ? (
              <div className="rounded-xl border border-dashed border-slate-200 p-6 text-center text-xs text-slate-400">
                No events recorded for this job yet
              </div>
            ) : (
              <div className="space-y-2">
                {events.map((evt) => (
                  <div key={evt.id} className="rounded-xl border border-slate-200 bg-white p-3 text-xs space-y-1 shadow-xs">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="rounded-md bg-indigo-50 px-2 py-0.5 text-[10px] font-bold text-indigo-700 border border-indigo-100">
                          {evt.eventType}
                        </span>
                        <span className="font-mono text-[10px] text-slate-400">
                          {new Date(evt.timestamp).toLocaleTimeString()}
                        </span>
                      </div>
                      {evt.workerId && (
                        <span className="font-mono text-[10px] text-slate-500">Worker: {evt.workerId}</span>
                      )}
                    </div>
                    <p className="text-slate-800 font-medium">{evt.message}</p>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
