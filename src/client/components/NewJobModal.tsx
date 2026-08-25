/**
 * Modal to Enqueue Jobs (Immediate, Delayed, Scheduled, Recurring Cron, or Batch)
 */

import React, { useState } from 'react';
import { useScheduler } from '../context/SchedulerContext.tsx';
import { X, Play, Clock, Repeat, Layers, Sparkles, AlertTriangle } from 'lucide-react';
import { JobType, JobPriority } from '../../types.ts';

interface NewJobModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const NewJobModal: React.FC<NewJobModalProps> = ({ isOpen, onClose }) => {
  const { queues, retryPolicies, createJob, createBatchJobs } = useScheduler();

  const [jobType, setJobType] = useState<JobType>('IMMEDIATE');
  const [name, setName] = useState<string>('Send Transactional Receipt');
  const [queueId, setQueueId] = useState<string>(queues[0]?.id || '');
  const [priority, setPriority] = useState<JobPriority>('DEFAULT');
  const [payloadText, setPayloadText] = useState<string>(
    JSON.stringify(
      {
        to: 'customer@enterprise.com',
        amountUsd: 149.0,
        simulatedDurationMs: 400,
      },
      null,
      2
    )
  );
  const [delaySeconds, setDelaySeconds] = useState<number>(10);
  const [scheduledAt, setScheduledAt] = useState<string>('');
  const [cronExpression, setCronExpression] = useState<string>('*/5 * * * *');
  const [retryPolicyId, setRetryPolicyId] = useState<string>('');
  const [idempotencyKey, setIdempotencyKey] = useState<string>('');
  const [batchCount, setBatchCount] = useState<number>(5);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  if (!isOpen) return null;

  // Preset payload samples
  const setSample = (type: 'email' | 'payment' | 'report' | 'chaos') => {
    if (type === 'email') {
      setName('Send Invoice Email');
      setPayloadText(JSON.stringify({ to: 'billing@client.com', invoiceId: 'INV-2026-99', simulatedDurationMs: 300 }, null, 2));
    } else if (type === 'payment') {
      setName('Capture Stripe Payment');
      setPayloadText(JSON.stringify({ amountUsd: 299.0, customerId: 'cus_98231a', simulatedDurationMs: 500 }, null, 2));
    } else if (type === 'report') {
      setName('Monthly Financial Rollup');
      setPayloadText(JSON.stringify({ timeWindowMinutes: 60, generateCsv: true, simulatedDurationMs: 600 }, null, 2));
    } else if (type === 'chaos') {
      setName('Chaos Failure Simulation Task');
      setPayloadText(JSON.stringify({ forceFail: true, failMessage: 'Simulated 3rd party API outage (500)', simulatedDurationMs: 300 }, null, 2));
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setIsSubmitting(true);

    try {
      let parsedPayload = {};
      try {
        parsedPayload = JSON.parse(payloadText);
      } catch {
        throw new Error('Payload must be valid JSON');
      }

      if (!queueId && queues.length > 0) {
        setQueueId(queues[0].id);
      }

      const targetQueueId = queueId || queues[0]?.id;
      if (!targetQueueId) {
        throw new Error('Please create at least one queue before creating jobs');
      }

      if (jobType === 'BATCH') {
        const items = Array.from({ length: batchCount }, (_, i) => ({
          ...parsedPayload,
          itemIndex: i + 1,
          batchTotal: batchCount,
        }));
        await createBatchJobs({
          queueId: targetQueueId,
          batchName: name,
          priority,
          items,
          retryPolicyId: retryPolicyId || undefined,
        });
      } else {
        await createJob({
          queueId: targetQueueId,
          name,
          type: jobType,
          priority,
          payload: parsedPayload,
          delaySeconds: jobType === 'DELAYED' ? delaySeconds : undefined,
          scheduledAt: jobType === 'SCHEDULED' && scheduledAt ? scheduledAt : undefined,
          cronExpression: jobType === 'RECURRING' ? cronExpression : undefined,
          retryPolicyId: retryPolicyId || undefined,
          idempotencyKey: idempotencyKey.trim() || undefined,
        });
      }

      onClose();
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to submit job');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-xs">
      <div className="w-full max-w-2xl rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl animate-in fade-in zoom-in-95">
        {/* Modal Header */}
        <div className="flex items-center justify-between border-b border-slate-100 pb-4">
          <div>
            <h2 className="text-lg font-bold text-slate-900">Enqueue New Background Job</h2>
            <p className="text-xs text-slate-500">Dispatch an immediate, delayed, scheduled, or recurring task</p>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {errorMsg && (
          <div className="mt-4 flex items-center gap-2 rounded-lg bg-rose-50 p-3 text-xs font-semibold text-rose-700 border border-rose-200">
            <AlertTriangle className="h-4 w-4" />
            <span>{errorMsg}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="mt-4 space-y-4">
          {/* Job Type Selector Tabs */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1.5">Job Scheduling Type</label>
            <div className="grid grid-cols-5 gap-1 rounded-xl bg-slate-100 p-1 border border-slate-200">
              {[
                { id: 'IMMEDIATE', label: 'Immediate', icon: Play },
                { id: 'DELAYED', label: 'Delayed', icon: Clock },
                { id: 'SCHEDULED', label: 'Exact Time', icon: Clock },
                { id: 'RECURRING', label: 'Recurring (Cron)', icon: Repeat },
                { id: 'BATCH', label: 'Batch Dispatch', icon: Layers },
              ].map(t => {
                const Icon = t.icon;
                const active = jobType === t.id;
                return (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => setJobType(t.id as JobType)}
                    className={`flex items-center justify-center gap-1.5 rounded-lg py-1.5 text-[11px] font-bold transition-all ${
                      active ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    <Icon className="h-3 w-3" />
                    <span>{t.label}</span>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            {/* Job Name */}
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Job Name / Task Type</label>
              <input
                type="text"
                required
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-medium text-slate-800 focus:border-slate-900 focus:outline-none"
                value={name}
                onChange={e => setName(e.target.value)}
                placeholder="e.g. Process Webhook Payload"
              />
            </div>

            {/* Target Queue */}
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Target Queue</label>
              <select
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-medium text-slate-800 focus:border-slate-900 focus:outline-none"
                value={queueId || queues[0]?.id || ''}
                onChange={e => setQueueId(e.target.value)}
              >
                {queues.map(q => (
                  <option key={q.id} value={q.id}>
                    {q.name} (Priority: {q.priority})
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Conditional Scheduling Inputs */}
          {jobType === 'DELAYED' && (
            <div className="rounded-xl bg-amber-50/70 p-3 border border-amber-200">
              <label className="block text-xs font-semibold text-amber-900 mb-1">Delay Duration (seconds)</label>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  min="1"
                  max="3600"
                  className="w-32 rounded-lg border border-amber-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-800 focus:outline-none"
                  value={delaySeconds}
                  onChange={e => setDelaySeconds(parseInt(e.target.value, 10) || 10)}
                />
                <span className="text-xs text-amber-800">Job will transition to QUEUED in {delaySeconds}s</span>
              </div>
            </div>
          )}

          {jobType === 'SCHEDULED' && (
            <div className="rounded-xl bg-blue-50/70 p-3 border border-blue-200">
              <label className="block text-xs font-semibold text-blue-900 mb-1">Execution Timestamp (UTC / Local)</label>
              <input
                type="datetime-local"
                className="rounded-lg border border-blue-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-800 focus:outline-none"
                value={scheduledAt}
                onChange={e => setScheduledAt(e.target.value)}
              />
            </div>
          )}

          {jobType === 'RECURRING' && (
            <div className="rounded-xl bg-purple-50/70 p-3 border border-purple-200">
              <label className="block text-xs font-semibold text-purple-900 mb-1">Cron Expression (5-part format)</label>
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  className="font-mono rounded-lg border border-purple-300 bg-white px-3 py-1.5 text-xs font-bold text-purple-900 focus:outline-none"
                  value={cronExpression}
                  onChange={e => setCronExpression(e.target.value)}
                  placeholder="*/5 * * * *"
                />
                <span className="text-xs text-purple-800 font-medium">e.g. */5 * * * * (Every 5 mins)</span>
              </div>
            </div>
          )}

          {jobType === 'BATCH' && (
            <div className="rounded-xl bg-indigo-50/70 p-3 border border-indigo-200">
              <label className="block text-xs font-semibold text-indigo-900 mb-1">Number of Parallel Batch Tasks</label>
              <input
                type="number"
                min="2"
                max="50"
                className="w-32 rounded-lg border border-indigo-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-800 focus:outline-none"
                value={batchCount}
                onChange={e => setBatchCount(parseInt(e.target.value, 10) || 5)}
              />
              <span className="ml-2 text-xs text-indigo-800">Will enqueue {batchCount} atomic sub-tasks</span>
            </div>
          )}

          {/* Priority & Retry Policy */}
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Priority Override</label>
              <select
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-800 focus:outline-none"
                value={priority}
                onChange={e => setPriority(e.target.value as JobPriority)}
              >
                <option value="LOW">LOW</option>
                <option value="DEFAULT">DEFAULT</option>
                <option value="HIGH">HIGH</option>
                <option value="CRITICAL">CRITICAL</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Retry Policy</label>
              <select
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-800 focus:outline-none"
                value={retryPolicyId}
                onChange={e => setRetryPolicyId(e.target.value)}
              >
                <option value="">Use Queue Default</option>
                {retryPolicies.map(p => (
                  <option key={p.id} value={p.id}>
                    {p.name} ({p.strategy})
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Idempotency Key (Optional)</label>
              <input
                type="text"
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-800 focus:outline-none"
                value={idempotencyKey}
                onChange={e => setIdempotencyKey(e.target.value)}
                placeholder="e.g. order_99482_pay"
              />
            </div>
          </div>

          {/* Payload JSON Editor */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="text-xs font-semibold text-slate-700">JSON Payload</label>
              {/* Preset Sample Buttons */}
              <div className="flex items-center gap-1.5">
                <span className="text-[10px] font-semibold text-slate-400">Load sample:</span>
                <button
                  type="button"
                  onClick={() => setSample('email')}
                  className="rounded bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-700 hover:bg-slate-200"
                >
                  Email
                </button>
                <button
                  type="button"
                  onClick={() => setSample('payment')}
                  className="rounded bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-700 hover:bg-slate-200"
                >
                  Payment
                </button>
                <button
                  type="button"
                  onClick={() => setSample('report')}
                  className="rounded bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-700 hover:bg-slate-200"
                >
                  Report
                </button>
                <button
                  type="button"
                  onClick={() => setSample('chaos')}
                  className="rounded bg-rose-100 px-2 py-0.5 text-[10px] font-semibold text-rose-800 hover:bg-rose-200"
                  title="Test retries and DLQ"
                >
                  Chaos Fail
                </button>
              </div>
            </div>
            <textarea
              rows={4}
              className="w-full font-mono text-xs rounded-lg border border-slate-300 bg-slate-900 text-slate-100 p-3 focus:outline-none focus:ring-1 focus:ring-slate-700"
              value={payloadText}
              onChange={e => setPayloadText(e.target.value)}
            />
          </div>

          {/* Submit Action */}
          <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-slate-100">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-slate-300 px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="flex items-center gap-2 rounded-lg bg-slate-900 px-5 py-2 text-xs font-bold text-white hover:bg-slate-800 disabled:opacity-50 shadow-sm"
            >
              <Play className="h-3.5 w-3.5 text-indigo-400" />
              <span>{isSubmitting ? 'Enqueuing...' : 'Dispatch to Queue'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
