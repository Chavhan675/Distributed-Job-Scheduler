/**
 * Distributed Job Scheduler Main App Component
 */

import React, { useState } from 'react';
import { SchedulerProvider } from './client/context/SchedulerContext.tsx';
import { Header } from './client/components/Header.tsx';
import { Sidebar, ActiveTab } from './client/components/Sidebar.tsx';
import { NewJobModal } from './client/components/NewJobModal.tsx';
import { NewQueueModal } from './client/components/NewQueueModal.tsx';
import { JobDetailsDrawer } from './client/components/JobDetailsDrawer.tsx';

import { DashboardPage } from './client/pages/DashboardPage.tsx';
import { QueueExplorerPage } from './client/pages/QueueExplorerPage.tsx';
import { JobExplorerPage } from './client/pages/JobExplorerPage.tsx';
import { WorkerMonitoringPage } from './client/pages/WorkerMonitoringPage.tsx';
import { DlqPage } from './client/pages/DlqPage.tsx';
import { MetricsPage } from './client/pages/MetricsPage.tsx';
import { ConcurrencyLabPage } from './client/pages/ConcurrencyLabPage.tsx';
import { DocumentationPage } from './client/pages/DocumentationPage.tsx';

function MainLayout() {
  const [activeTab, setActiveTab] = useState<ActiveTab>('dashboard');
  const [isNewJobOpen, setIsNewJobOpen] = useState<boolean>(false);
  const [isNewQueueOpen, setIsNewQueueOpen] = useState<boolean>(false);

  return (
    <div className="flex h-screen flex-col bg-slate-100/60 text-slate-900 antialiased font-sans">
      {/* Top Application Header */}
      <Header
        onOpenNewJob={() => setIsNewJobOpen(true)}
        onOpenNewQueue={() => setIsNewQueueOpen(true)}
      />

      <div className="flex flex-1 overflow-hidden">
        {/* Navigation Sidebar */}
        <Sidebar activeTab={activeTab} setActiveTab={setActiveTab} />

        {/* Dynamic Page Container */}
        <main className="flex-1 overflow-y-auto p-6 md:p-8">
          <div className="mx-auto max-w-7xl">
            {activeTab === 'dashboard' && (
              <DashboardPage
                onOpenNewJob={() => setIsNewJobOpen(true)}
                onOpenNewQueue={() => setIsNewQueueOpen(true)}
                onNavigateToTab={tab => setActiveTab(tab)}
              />
            )}
            {activeTab === 'queues' && (
              <QueueExplorerPage
                onOpenNewQueue={() => setIsNewQueueOpen(true)}
                onOpenNewJob={() => setIsNewJobOpen(true)}
              />
            )}
            {activeTab === 'jobs' && (
              <JobExplorerPage onOpenNewJob={() => setIsNewJobOpen(true)} />
            )}
            {activeTab === 'workers' && <WorkerMonitoringPage />}
            {activeTab === 'dlq' && <DlqPage />}
            {activeTab === 'metrics' && <MetricsPage />}
            {activeTab === 'concurrency-lab' && <ConcurrencyLabPage />}
            {activeTab === 'docs' && <DocumentationPage />}
          </div>
        </main>
      </div>

      {/* Global Modals & Drawers */}
      <NewJobModal isOpen={isNewJobOpen} onClose={() => setIsNewJobOpen(false)} />
      <NewQueueModal isOpen={isNewQueueOpen} onClose={() => setIsNewQueueOpen(false)} />
      <JobDetailsDrawer />
    </div>
  );
}

export default function App() {
  return (
    <SchedulerProvider>
      <MainLayout />
    </SchedulerProvider>
  );
}
