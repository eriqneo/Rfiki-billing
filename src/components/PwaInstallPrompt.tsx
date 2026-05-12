import { useEffect, useMemo, useState } from 'react';
import { Download, Smartphone, X } from 'lucide-react';
import { hasHandledPwaInstallPrompt, markPwaInstallPromptHandled } from '../lib/storagePolicy';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
}

function isStandaloneApp() {
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    (window.navigator as any).standalone === true
  );
}

function isIosDevice() {
  return /iphone|ipad|ipod/i.test(window.navigator.userAgent);
}

export function PwaInstallPrompt() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [isVisible, setIsVisible] = useState(false);
  const isIos = useMemo(() => isIosDevice(), []);

  useEffect(() => {
    if (isStandaloneApp() || hasHandledPwaInstallPrompt()) return;

    const handleBeforeInstallPrompt = (event: Event) => {
      event.preventDefault();
      setDeferredPrompt(event as BeforeInstallPromptEvent);
      setIsVisible(true);
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);

    const fallbackTimer = window.setTimeout(() => {
      if (!isStandaloneApp() && !hasHandledPwaInstallPrompt()) {
        setIsVisible(true);
      }
    }, 1400);

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
      window.clearTimeout(fallbackTimer);
    };
  }, []);

  const dismiss = () => {
    markPwaInstallPromptHandled();
    setIsVisible(false);
  };

  const installApp = async () => {
    if (!deferredPrompt) {
      return;
    }

    await deferredPrompt.prompt();
    await deferredPrompt.userChoice;
    markPwaInstallPromptHandled();
    setDeferredPrompt(null);
    setIsVisible(false);
  };

  if (!isVisible || isStandaloneApp()) return null;

  return (
    <div className="fixed inset-x-4 bottom-36 z-[75] md:inset-x-auto md:left-6 md:bottom-6 md:w-[400px]">
      <div className="glass-panel rounded-2xl border-accent-green/20 bg-bg-deep/95 p-5 shadow-[0_18px_60px_rgba(0,0,0,0.45)] backdrop-blur-xl">
        <div className="flex items-start gap-4">
          <div className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-accent-green/25 bg-accent-green/10 text-accent-green">
            <Smartphone className="h-5 w-5" />
          </div>

          <div className="min-w-0 flex-1">
            <div className="flex items-start justify-between gap-3">
              <h2 className="text-xs font-black uppercase tracking-[0.18em] text-text-main">
                Install Rafiki
              </h2>
              <button
                type="button"
                onClick={dismiss}
                className="rounded-lg p-1 text-text-dim transition-colors hover:bg-white/5 hover:text-text-main"
                aria-label="Dismiss install prompt"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <p className="mt-3 text-xs font-medium leading-relaxed text-text-dim">
              Add Rafiki to this device for an app-like experience with offline access and seamless sync.
            </p>

            {deferredPrompt ? (
              <button
                type="button"
                onClick={installApp}
                className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl bg-accent-green px-4 py-3 text-[10px] font-black uppercase tracking-[0.18em] text-bg-deep transition-transform active:scale-[0.98]"
              >
                <Download className="h-4 w-4" />
                Install App
              </button>
            ) : (
              <div className="mt-4 rounded-xl border border-white/10 bg-white/[0.03] p-3 text-[10px] font-bold uppercase leading-relaxed tracking-[0.12em] text-text-dim">
                {isIos ? 'Open Share, then choose Add to Home Screen.' : 'Use your browser menu, then choose Install App.'}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
