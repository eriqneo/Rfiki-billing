import { useState } from 'react';
import { ShieldCheck, X } from 'lucide-react';
import { acceptStorageNotice, hasAcceptedStorageNotice } from '../lib/storagePolicy';

export function StorageNotice() {
  const [isVisible, setIsVisible] = useState(() => !hasAcceptedStorageNotice());

  if (!isVisible) return null;

  const handleAccept = () => {
    acceptStorageNotice();
    setIsVisible(false);
  };

  return (
    <div className="fixed inset-x-4 bottom-4 z-[80] md:inset-x-auto md:right-6 md:bottom-6 md:w-[420px]">
      <div className="glass-panel rounded-2xl border-accent-green/20 bg-bg-deep/95 p-5 shadow-[0_18px_60px_rgba(0,0,0,0.45)] backdrop-blur-xl">
        <div className="flex items-start gap-4">
          <div className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-accent-green/25 bg-accent-green/10 text-accent-green">
            <ShieldCheck className="h-5 w-5" />
          </div>

          <div className="min-w-0 flex-1">
            <div className="flex items-start justify-between gap-3">
              <h2 className="text-xs font-black uppercase tracking-[0.18em] text-text-main">
                Essential Storage
              </h2>
              <button
                type="button"
                onClick={handleAccept}
                className="rounded-lg p-1 text-text-dim transition-colors hover:bg-white/5 hover:text-text-main"
                aria-label="Dismiss storage notice"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <p className="mt-3 text-xs font-medium leading-relaxed text-text-dim">
              Rafiki does not set marketing cookies. It uses essential browser storage for secure sign-in, offline sync, preferences, and cached app data.
            </p>

            <button
              type="button"
              onClick={handleAccept}
              className="mt-4 w-full rounded-xl bg-accent-green px-4 py-3 text-[10px] font-black uppercase tracking-[0.18em] text-bg-deep transition-transform active:scale-[0.98]"
            >
              Got it
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
