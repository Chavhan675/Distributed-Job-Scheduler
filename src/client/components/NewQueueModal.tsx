/**
 * Modal to Create a New Queue
 */

import React, { useState } from 'react';
import { useScheduler } from '../context/SchedulerContext.tsx';
import { X, Inbox, AlertTriangle } from 'lucide-react';
import { JobPriority } from '../../types.ts';

interface NewQueueModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const NewQueueModal: React.FC<NewQueueModalProps> = ({ isOpen, onClose }) => {
  const { retryPolicies, createQueue } = useScheduler();

  const [name, setName] = useState<string>('ai-inference-pipeline');
  const [description, setDescription] = useState<string>('Handles long-running batch inference computations');
  const [priority, setPriority] = useState<JobPriority>('HIGH');
  const [concurrencyLimit, setConcurrencyLimit] = useState<number>(6);
  const [retryPolicyId, setRetryPolicyId] = useState<string>(retryPolicies[0]?.id || '');
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setIsSubmitting(true);

    try {
      await createQueue({
        name: name.toLowerCase().replace(/[^a-z0-9-_]/g, '-'),
        description,
        priority,
        concurrencyLimit,
        retryPolicyId: retryPolicyId || undefined,
      });
      onClose();
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to create queue');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-xs">
      <div className="w-full max-w-lg rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl animate-in fade-in zoom-in-95">
        <div className="flex items-center justify-between border-b border-slate-100 pb-4">
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-indigo-50 text-indigo-600">
              <Inbox className="h-4 w-4" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-900">Provision New Queue</h2>
              <p className="text-xs text-slate-500">Configure priorities, concurrency boundaries, and backoff</p>
            </div>
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
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Queue Name</label>
            <input
              type="text"
              required
              className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-mono font-medium text-slate-900 focus:border-slate-900 focus:outline-none"
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="e.g. notifications-sms"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Description</label>
            <input
              type="text"
              className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-medium text-slate-800 focus:border-slate-900 focus:outline-none"
              value={description}
              onChange={e => setDescription(e.target.value)}
              placeholder="Purpose of this queue..."
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Queue Priority</label>
              <select
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-medium text-slate-800 focus:outline-none"
                value={priority}
                onChange={e => setPriority(e.target.value as JobPriority)}
              >
                <option value="LOW">LOW (0)</option>
                <option value="DEFAULT">DEFAULT (10)</option>
                <option value="HIGH">HIGH (50)</option>
                <option value="CRITICAL">CRITICAL (100)</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Concurrency Limit (Max Running)
              </label>
              <input
                type="number"
                min="1"
                max="50"
                required
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-800 focus:outline-none"
                value={concurrencyLimit}
                onChange={e => setConcurrencyLimit(parseInt(e.target.value, 10) || 5)}
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Default Retry Policy</label>
            <select
              className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-medium text-slate-800 focus:outline-none"
              value={retryPolicyId}
              onChange={e => setRetryPolicyId(e.target.value)}
            >
              <option value="">No Custom Policy (3 Fixed Retries)</option>
              {retryPolicies.map(p => (
                <option key={p.id} value={p.id}>
                  {p.name} — {p.strategy} (Max {p.maxRetries} attempts, initial {p.initialDelayMs}ms)
                </option>
              ))}
            </select>
          </div>

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
              <span>{isSubmitting ? 'Creating...' : 'Create Queue'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
