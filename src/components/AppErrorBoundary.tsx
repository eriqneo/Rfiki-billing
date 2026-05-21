import React from 'react';
import { AlertTriangle, RefreshCw, Trash2 } from 'lucide-react';

type AppErrorBoundaryProps = {
  children: React.ReactNode;
};

type AppErrorBoundaryState = {
  error: Error | null;
};

export class AppErrorBoundary extends React.Component<AppErrorBoundaryProps, AppErrorBoundaryState> {
  declare props: AppErrorBoundaryProps;

  state: AppErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error('[RAFIKI] UI crash recovered by boundary:', error, info);
  }

  private reload = () => {
    window.location.reload();
  };

  private resetLocalCache = async () => {
    try {
      localStorage.clear();
      sessionStorage.clear();
      if ('caches' in window) {
        const cacheNames = await caches.keys();
        await Promise.all(cacheNames.map(name => caches.delete(name)));
      }
      if ('serviceWorker' in navigator) {
        const registrations = await navigator.serviceWorker.getRegistrations();
        await Promise.all(registrations.map(registration => registration.unregister()));
      }
    } finally {
      window.location.reload();
    }
  };

  render() {
    if (!this.state.error) return this.props.children;

    return (
      <div className="min-h-screen bg-bg-deep px-6 py-10 text-text-main">
        <div className="mx-auto flex max-w-xl flex-col items-center rounded-[2rem] border border-red-500/20 bg-red-500/[0.04] p-8 text-center shadow-2xl">
          <div className="mb-5 flex h-14 w-14 items-center justify-center rounded-2xl border border-red-500/30 bg-red-500/10 text-red-300">
            <AlertTriangle className="h-7 w-7" />
          </div>
          <p className="text-[10px] font-black uppercase tracking-[0.3em] text-red-300">Recovery Mode</p>
          <h1 className="mt-3 text-3xl font-black uppercase tracking-tight">The app hit bad cached data</h1>
          <p className="mt-4 text-sm font-medium leading-relaxed text-text-dim">
            Refresh first. If the page still fails, clear the local app cache and reload the latest deployment.
          </p>
          <p className="mt-4 rounded-xl border border-white/10 bg-black/20 px-4 py-3 text-left text-xs font-bold text-red-100/80">
            {this.state.error.message || 'Unknown render error'}
          </p>
          <div className="mt-6 flex w-full flex-col gap-3 sm:flex-row">
            <button onClick={this.reload} className="flex flex-1 items-center justify-center gap-2 rounded-2xl border border-white/10 bg-white/5 px-5 py-4 text-[10px] font-black uppercase tracking-widest text-text-main transition-all hover:border-accent-green/40 hover:text-accent-green">
              <RefreshCw className="h-4 w-4" />
              Refresh
            </button>
            <button onClick={this.resetLocalCache} className="flex flex-1 items-center justify-center gap-2 rounded-2xl bg-accent-green px-5 py-4 text-[10px] font-black uppercase tracking-widest text-bg-deep transition-all hover:scale-[1.02]">
              <Trash2 className="h-4 w-4" />
              Clear Cache
            </button>
          </div>
        </div>
      </div>
    );
  }
}
