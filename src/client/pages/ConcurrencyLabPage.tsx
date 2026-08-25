/**
 * Concurrency Lab & Automated Test Suite View
 */

import React, { useState } from 'react';
import {
  FlaskConical,
  Play,
  CheckCircle2,
  XCircle,
  ShieldCheck,
  Zap,
  Cpu,
  Layers,
  AlertTriangle,
  RotateCcw,
  Activity,
} from 'lucide-react';
import { ConcurrencyTestRun } from '../../types.ts';

interface TestSuiteSummary {
  total: number;
  passed: number;
  failed: number;
  durationMs: number;
}

interface TestCaseResult {
  name: string;
  category: string;
  passed: boolean;
  durationMs: number;
  message: string;
  details?: any;
}

export const ConcurrencyLabPage: React.FC = () => {
  // Automated Test Suite State
  const [suiteResults, setSuiteResults] = useState<{
    summary: TestSuiteSummary;
    results: TestCaseResult[];
  } | null>(null);
  const [isRunningSuite, setIsRunningSuite] = useState<boolean>(false);

  // Stress Race Condition Tester State
  const [stressWorkers, setStressWorkers] = useState<number>(4);
  const [stressJobs, setStressJobs] = useState<number>(30);
  const [stressQueueLimit, setStressQueueLimit] = useState<number>(8);
  const [stressResult, setStressResult] = useState<ConcurrencyTestRun | null>(null);
  const [isStressRunning, setIsStressRunning] = useState<boolean>(false);

  // Run all 8 engine tests
  const runFullTestSuite = async () => {
    setIsRunningSuite(true);
    try {
      const res = await fetch('/api/tests/run-all', { method: 'POST' });
      if (res.ok) {
        const data = await res.json();
        setSuiteResults(data);
      }
    } catch (err) {
      console.error('Failed to run test suite:', err);
    } finally {
      setIsRunningSuite(false);
    }
  };

  // Run custom race condition stress test
  const runStressTest = async () => {
    setIsStressRunning(true);
    try {
      const res = await fetch('/api/tests/stress-concurrency', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          workerCount: stressWorkers,
          jobCount: stressJobs,
          queueConcurrencyLimit: stressQueueLimit,
        }),
      });
      if (res.ok) {
        const data = await res.json();
        setStressResult(data.result);
      }
    } catch (err) {
      console.error('Failed to run stress test:', err);
    } finally {
      setIsStressRunning(false);
    }
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-200">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="flex h-6 w-6 items-center justify-center rounded bg-indigo-100 text-indigo-700">
              <FlaskConical className="h-4 w-4" />
            </span>
            <h1 className="text-xl font-bold tracking-tight text-slate-900">Concurrency Test Lab</h1>
          </div>
          <p className="mt-1 text-xs text-slate-500">
            Validate atomic row locking, multi-worker race isolation, and zero duplicate claims under heavy concurrent load
          </p>
        </div>

        <button
          onClick={runFullTestSuite}
          disabled={isRunningSuite}
          className="flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-xs font-bold text-white hover:bg-indigo-500 disabled:opacity-50 shadow-sm transition-all"
        >
          <Play className={`h-3.5 w-3.5 ${isRunningSuite ? 'animate-spin' : ''}`} />
          <span>{isRunningSuite ? 'Running Test Suite...' : 'Run Automated Test Suite'}</span>
        </button>
      </div>

      {/* Row-Level Locking Guarantee Banner */}
      <div className="rounded-2xl border border-indigo-100 bg-gradient-to-r from-indigo-50/70 to-slate-50 p-5 shadow-xs">
        <div className="flex items-center gap-2 font-bold text-slate-900 text-sm">
          <ShieldCheck className="h-5 w-5 text-indigo-600" />
          <span>Concurrency Isolation Model: SELECT FOR UPDATE SKIP LOCKED</span>
        </div>
        <p className="mt-1.5 text-xs text-slate-600 leading-relaxed max-w-3xl">
          In high-throughput distributed systems, multiple worker nodes poll the queue simultaneously. Without atomic row locking, two workers could claim the exact same job, resulting in duplicate billing charges or redundant operations. Our scheduler enforces strict row-level mutex locks during atomic claiming, ensuring <strong>exactly-once claim semantics</strong>.
        </p>
      </div>

      {/* SECTION 1: Stress Race Condition Benchmark */}
      <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-xs space-y-5">
        <div>
          <h2 className="text-base font-bold text-slate-900">Interactive Race Condition Stress Benchmark</h2>
          <p className="text-xs text-slate-500">
            Spin up multiple concurrent worker threads racing against the same queue to mathematically verify 0 duplicate claims
          </p>
        </div>

        {/* Configuration Controls */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 rounded-xl bg-slate-50 p-4 border border-slate-200 text-xs">
          <div>
            <label className="block font-semibold text-slate-700 mb-1">Concurrent Worker Nodes</label>
            <input
              type="number"
              min="1"
              max="10"
              className="w-full rounded-lg border border-slate-300 bg-white px-3 py-1.5 font-semibold text-slate-800 focus:outline-none"
              value={stressWorkers}
              onChange={e => setStressWorkers(parseInt(e.target.value, 10) || 4)}
            />
            <span className="text-[10px] text-slate-400">Independent polling workers</span>
          </div>

          <div>
            <label className="block font-semibold text-slate-700 mb-1">Batch Job Volume</label>
            <input
              type="number"
              min="10"
              max="100"
              className="w-full rounded-lg border border-slate-300 bg-white px-3 py-1.5 font-semibold text-slate-800 focus:outline-none"
              value={stressJobs}
              onChange={e => setStressJobs(parseInt(e.target.value, 10) || 30)}
            />
            <span className="text-[10px] text-slate-400">Total jobs queued simultaneously</span>
          </div>

          <div>
            <label className="block font-semibold text-slate-700 mb-1">Queue Concurrency Boundary</label>
            <input
              type="number"
              min="2"
              max="20"
              className="w-full rounded-lg border border-slate-300 bg-white px-3 py-1.5 font-semibold text-slate-800 focus:outline-none"
              value={stressQueueLimit}
              onChange={e => setStressQueueLimit(parseInt(e.target.value, 10) || 8)}
            />
            <span className="text-[10px] text-slate-400">Max concurrent active tasks</span>
          </div>
        </div>

        {/* Run Button */}
        <div className="flex items-center justify-between">
          <button
            onClick={runStressTest}
            disabled={isStressRunning}
            className="flex items-center gap-2 rounded-lg bg-slate-900 px-5 py-2.5 text-xs font-bold text-white hover:bg-slate-800 disabled:opacity-50 shadow-sm"
          >
            <Zap className={`h-4 w-4 text-indigo-400 ${isStressRunning ? 'animate-bounce' : ''}`} />
            <span>{isStressRunning ? 'Executing Stress Benchmark...' : 'Execute Race Condition Benchmark'}</span>
          </button>

          {isStressRunning && (
            <div className="flex items-center gap-2 text-xs font-semibold text-indigo-600 animate-pulse">
              <Activity className="h-4 w-4 animate-spin" />
              <span>Racing {stressWorkers} workers against {stressJobs} jobs...</span>
            </div>
          )}
        </div>

        {/* Benchmark Results Card */}
        {stressResult && (
          <div
            className={`rounded-xl border p-5 space-y-4 animate-in fade-in ${
              stressResult.status === 'PASSED'
                ? 'border-emerald-200 bg-emerald-50/50'
                : 'border-rose-200 bg-rose-50/50'
            }`}
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                {stressResult.status === 'PASSED' ? (
                  <CheckCircle2 className="h-5 w-5 text-emerald-600" />
                ) : (
                  <XCircle className="h-5 w-5 text-rose-600" />
                )}
                <div>
                  <h3 className="font-bold text-slate-900 text-sm">
                    {stressResult.status === 'PASSED'
                      ? 'Benchmark Passed: ZERO Duplicate Claims Verified!'
                      : 'Concurrency Violation Detected'}
                  </h3>
                  <p className="text-xs text-slate-600">
                    Duration: {stressResult.durationMs}ms • Throughput: {stressResult.throughputJobsPerSec} jobs/sec
                  </p>
                </div>
              </div>

              <span
                className={`rounded-full px-3 py-1 text-xs font-bold ${
                  stressResult.status === 'PASSED'
                    ? 'bg-emerald-100 text-emerald-800 border border-emerald-300'
                    : 'bg-rose-100 text-rose-800 border border-rose-300'
                }`}
              >
                {stressResult.status}
              </span>
            </div>

            {/* Results Data Grid */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
              <div className="rounded-lg bg-white p-3 border border-slate-200">
                <span className="text-slate-500 font-medium">Workers Racing:</span>
                <p className="mt-1 font-bold text-slate-900">{stressResult.concurrencyWorkers} Nodes</p>
              </div>
              <div className="rounded-lg bg-white p-3 border border-slate-200">
                <span className="text-slate-500 font-medium">Total Jobs Processed:</span>
                <p className="mt-1 font-bold text-emerald-700">{stressResult.completedJobs} / {stressResult.totalJobs}</p>
              </div>
              <div className="rounded-lg bg-white p-3 border border-slate-200">
                <span className="text-slate-500 font-medium">Duplicate Claims:</span>
                <p className="mt-1 font-bold text-slate-900">
                  {stressResult.duplicateClaimCount === 0 ? (
                    <span className="text-emerald-600">0 (Strictly Isolated)</span>
                  ) : (
                    <span className="text-rose-600">{stressResult.duplicateClaimCount} Violations</span>
                  )}
                </p>
              </div>
              <div className="rounded-lg bg-white p-3 border border-slate-200">
                <span className="text-slate-500 font-medium">System Throughput:</span>
                <p className="mt-1 font-bold text-indigo-600">{stressResult.throughputJobsPerSec} jobs / sec</p>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* SECTION 2: Automated Unit & Integration Test Suite */}
      <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-xs space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-base font-bold text-slate-900">Automated System & Reliability Test Suite</h2>
            <p className="text-xs text-slate-500">
              8 comprehensive test cases evaluating atomic claiming, queue limits, backoff math, DLQ, heartbeats, and idempotency
            </p>
          </div>
          {suiteResults && (
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold text-slate-600">
                Passed: <strong className="text-emerald-600">{suiteResults.summary.passed}</strong> / {suiteResults.summary.total}
              </span>
              <span className="text-slate-300">•</span>
              <span className="text-xs font-mono text-slate-500">{suiteResults.summary.durationMs}ms</span>
            </div>
          )}
        </div>

        {!suiteResults ? (
          <div className="rounded-xl border border-dashed border-slate-300 p-8 text-center text-xs text-slate-500">
            Click <strong>"Run Automated Test Suite"</strong> above to execute all system verification tests.
          </div>
        ) : (
          <div className="space-y-2.5">
            {suiteResults.results.map((test, idx) => (
              <div
                key={idx}
                className={`flex items-start justify-between rounded-xl border p-4 text-xs transition-all ${
                  test.passed
                    ? 'border-slate-200 bg-white hover:border-slate-300'
                    : 'border-rose-200 bg-rose-50/50'
                }`}
              >
                <div className="flex items-start gap-3">
                  {test.passed ? (
                    <CheckCircle2 className="h-4 w-4 text-emerald-600 mt-0.5" />
                  ) : (
                    <XCircle className="h-4 w-4 text-rose-600 mt-0.5" />
                  )}
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-slate-900">{test.name}</span>
                      <span className="rounded bg-slate-100 px-1.5 py-0.2 font-mono text-[9px] font-bold uppercase text-slate-600 border border-slate-200">
                        {test.category}
                      </span>
                    </div>
                    <p className="mt-1 text-slate-600 leading-relaxed text-[11px]">{test.message}</p>
                  </div>
                </div>

                <div className="flex items-center gap-2 flex-shrink-0 ml-4 font-mono text-[11px] text-slate-400">
                  <span>{test.durationMs}ms</span>
                  <span
                    className={`rounded px-1.5 py-0.5 text-[10px] font-bold ${
                      test.passed ? 'bg-emerald-100 text-emerald-800' : 'bg-rose-100 text-rose-800'
                    }`}
                  >
                    {test.passed ? 'PASSED' : 'FAILED'}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
