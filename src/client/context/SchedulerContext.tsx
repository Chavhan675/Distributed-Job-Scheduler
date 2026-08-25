/**
 * Frontend Global State & Real-Time Sync Context
 */

import React, { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';
import {
  Project,
  Queue,
  Job,
  Worker,
  DeadLetterEntry,
  SystemMetrics,
  QueueStatistics,
  RetryPolicy,
} from '../../types.ts';

interface SchedulerContextType {
  projects: Project[];
  selectedProject: Project | null;
  setSelectedProject: (p: Project | null) => void;
  queues: Queue[];
  jobs: Job[];
  totalJobsCount: number;
  workers: Worker[];
  deadLetters: DeadLetterEntry[];
  metrics: SystemMetrics | null;
  queueStats: QueueStatistics[];
  retryPolicies: RetryPolicy[];
  isLoading: boolean;
  isAutoRefresh: boolean;
  setIsAutoRefresh: (val: boolean) => void;
  refreshData: () => Promise<void>;
  createJob: (data: any) => Promise<Job>;
  createBatchJobs: (data: any) => Promise<any>;
  createQueue: (data: any) => Promise<Queue>;
  pauseQueue: (queueId: string) => Promise<void>;
  resumeQueue: (queueId: string) => Promise<void>;
  retryJob: (jobId: string) => Promise<void>;
  cancelJob: (jobId: string) => Promise<void>;
  retryDlq: (dlqId: string) => Promise<void>;
  purgeDlq: (dlqId: string) => Promise<void>;
  spawnWorker: (name: string, concurrencyLimit?: number) => Promise<void>;
  pauseWorker: (workerId: string) => Promise<void>;
  resumeWorker: (workerId: string) => Promise<void>;
  terminateWorker: (workerId: string) => Promise<void>;
  reapStaleWorkers: () => Promise<any>;
  selectedJobId: string | null;
  setSelectedJobId: (id: string | null) => void;
  toastMessage: string | null;
  showToast: (msg: string) => void;
}

const SchedulerContext = createContext<SchedulerContextType | undefined>(undefined);

export const SchedulerProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [projects, setProjects] = useState<Project[]>([]);
  const [selectedProject, setSelectedProject] = useState<Project | null>(null);
  const [queues, setQueues] = useState<Queue[]>([]);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [totalJobsCount, setTotalJobsCount] = useState<number>(0);
  const [workers, setWorkers] = useState<Worker[]>([]);
  const [deadLetters, setDeadLetters] = useState<DeadLetterEntry[]>([]);
  const [metrics, setMetrics] = useState<SystemMetrics | null>(null);
  const [queueStats, setQueueStats] = useState<QueueStatistics[]>([]);
  const [retryPolicies, setRetryPolicies] = useState<RetryPolicy[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isAutoRefresh, setIsAutoRefresh] = useState<boolean>(true);
  const [selectedJobId, setSelectedJobId] = useState<string | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const showToast = useCallback((msg: string) => {
    setToastMessage(msg);
    setTimeout(() => {
      setToastMessage(prev => (prev === msg ? null : prev));
    }, 3500);
  }, []);

  const safeJsonFetch = async <T = any>(url: string, init?: RequestInit): Promise<T | null> => {
    try {
      const res = await fetch(url, init);
      if (!res.ok) return null;
      const contentType = res.headers.get('content-type') || '';
      if (!contentType.includes('application/json')) {
        return null;
      }
      return (await res.json()) as T;
    } catch {
      return null;
    }
  };

  const refreshData = useCallback(async () => {
    try {
      // 1. Fetch Projects & Policies
      const [pData, polData] = await Promise.all([
        safeJsonFetch<{ projects: Project[] }>('/api/projects'),
        safeJsonFetch<{ policies: RetryPolicy[] }>('/api/queues/retry-policies'),
      ]);

      if (pData?.projects) {
        setProjects(pData.projects);
        if (!selectedProject && pData.projects.length > 0) {
          setSelectedProject(pData.projects[0]);
        }
      }
      if (polData?.policies) {
        setRetryPolicies(polData.policies);
      }

      // 2. Fetch Queues, Jobs, Workers, DLQ, Metrics with correct query params
      const projectParam = selectedProject?.id ? `projectId=${encodeURIComponent(selectedProject.id)}` : '';
      const queuesUrl = projectParam ? `/api/queues?${projectParam}` : '/api/queues';
      const jobsUrl = projectParam ? `/api/jobs?${projectParam}&limit=100` : '/api/jobs?limit=100';
      const dlqUrl = projectParam ? `/api/dlq?${projectParam}` : '/api/dlq';

      const [qData, jData, wData, dlqData, mData, qsData] = await Promise.all([
        safeJsonFetch<{ queues: Queue[] }>(queuesUrl),
        safeJsonFetch<{ jobs: Job[]; total: number }>(jobsUrl),
        safeJsonFetch<{ workers: Worker[] }>('/api/workers'),
        safeJsonFetch<{ entries: DeadLetterEntry[] }>(dlqUrl),
        safeJsonFetch<{ metrics: SystemMetrics }>('/api/metrics/system'),
        safeJsonFetch<{ stats: QueueStatistics[] }>('/api/metrics/queues'),
      ]);

      if (qData?.queues) {
        setQueues(qData.queues);
      }
      if (jData?.jobs) {
        setJobs(jData.jobs);
        setTotalJobsCount(jData.total || jData.jobs.length);
      }
      if (wData?.workers) {
        setWorkers(wData.workers);
      }
      if (dlqData?.entries) {
        setDeadLetters(dlqData.entries);
      }
      if (mData?.metrics) {
        setMetrics(mData.metrics);
      }
      if (qsData?.stats) {
        setQueueStats(qsData.stats);
      }
    } catch (err) {
      console.error('Failed refreshing scheduler data:', err);
    } finally {
      setIsLoading(false);
    }
  }, [selectedProject]);

  useEffect(() => {
    refreshData();
  }, [refreshData]);

  // Real-time polling loop (every 2.5s)
  useEffect(() => {
    if (!isAutoRefresh) return;
    const interval = setInterval(() => {
      refreshData();
    }, 2500);
    return () => clearInterval(interval);
  }, [isAutoRefresh, refreshData]);

  // Actions
  const createJob = async (data: any): Promise<Job> => {
    const res = await fetch('/api/jobs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    const result = await res.json();
    if (!res.ok) throw new Error(result.error?.message || 'Failed to create job');
    showToast(result.isDuplicate ? 'Idempotent request: returned existing job' : `Job "${result.job.name}" queued!`);
    await refreshData();
    return result.job;
  };

  const createBatchJobs = async (data: any): Promise<any> => {
    const res = await fetch('/api/jobs/batch', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    const result = await res.json();
    if (!res.ok) throw new Error(result.error?.message || 'Failed to submit batch');
    showToast(`Batch created: ${result.totalCreated} jobs submitted.`);
    await refreshData();
    return result;
  };

  const createQueue = async (data: any): Promise<Queue> => {
    const res = await fetch('/api/queues', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...data, projectId: data.projectId || selectedProject?.id }),
    });
    const result = await res.json();
    if (!res.ok) throw new Error(result.error?.message || 'Failed to create queue');
    showToast(`Queue "${result.queue.name}" created!`);
    await refreshData();
    return result.queue;
  };

  const pauseQueue = async (queueId: string) => {
    await fetch(`/api/queues/${queueId}/pause`, { method: 'POST' });
    showToast('Queue paused');
    await refreshData();
  };

  const resumeQueue = async (queueId: string) => {
    await fetch(`/api/queues/${queueId}/resume`, { method: 'POST' });
    showToast('Queue resumed');
    await refreshData();
  };

  const retryJob = async (jobId: string) => {
    await fetch(`/api/jobs/${jobId}/retry`, { method: 'POST' });
    showToast('Job manually requeued');
    await refreshData();
  };

  const cancelJob = async (jobId: string) => {
    await fetch(`/api/jobs/${jobId}/cancel`, { method: 'POST' });
    showToast('Job cancelled');
    await refreshData();
  };

  const retryDlq = async (dlqId: string) => {
    await fetch(`/api/dlq/${dlqId}/retry`, { method: 'POST' });
    showToast('Replayed job from Dead Letter Queue');
    await refreshData();
  };

  const purgeDlq = async (dlqId: string) => {
    await fetch(`/api/dlq/${dlqId}`, { method: 'DELETE' });
    showToast('Dead Letter entry purged');
    await refreshData();
  };

  const spawnWorker = async (name: string, concurrencyLimit?: number) => {
    await fetch('/api/workers', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, concurrencyLimit: concurrencyLimit || 4 }),
    });
    showToast(`Spawned worker "${name}"`);
    await refreshData();
  };

  const pauseWorker = async (workerId: string) => {
    await fetch(`/api/workers/${workerId}/pause`, { method: 'POST' });
    showToast('Worker paused');
    await refreshData();
  };

  const resumeWorker = async (workerId: string) => {
    await fetch(`/api/workers/${workerId}/resume`, { method: 'POST' });
    showToast('Worker resumed');
    await refreshData();
  };

  const terminateWorker = async (workerId: string) => {
    await fetch(`/api/workers/${workerId}`, { method: 'DELETE' });
    showToast('Worker terminated');
    await refreshData();
  };

  const reapStaleWorkers = async () => {
    const res = await fetch('/api/workers/reap-stale', { method: 'POST' });
    const data = await res.json();
    showToast(
      data.staleWorkersCount > 0
        ? `Reaped ${data.staleWorkersCount} dead workers & recovered ${data.recoveredJobsCount} jobs`
        : 'All workers are healthy and sending heartbeats'
    );
    await refreshData();
    return data;
  };

  return (
    <SchedulerContext.Provider
      value={{
        projects,
        selectedProject,
        setSelectedProject,
        queues,
        jobs,
        totalJobsCount,
        workers,
        deadLetters,
        metrics,
        queueStats,
        retryPolicies,
        isLoading,
        isAutoRefresh,
        setIsAutoRefresh,
        refreshData,
        createJob,
        createBatchJobs,
        createQueue,
        pauseQueue,
        resumeQueue,
        retryJob,
        cancelJob,
        retryDlq,
        purgeDlq,
        spawnWorker,
        pauseWorker,
        resumeWorker,
        terminateWorker,
        reapStaleWorkers,
        selectedJobId,
        setSelectedJobId,
        toastMessage,
        showToast,
      }}
    >
      {children}
    </SchedulerContext.Provider>
  );
};

export const useScheduler = () => {
  const context = useContext(SchedulerContext);
  if (!context) {
    throw new Error('useScheduler must be used within a SchedulerProvider');
  }
  return context;
};
