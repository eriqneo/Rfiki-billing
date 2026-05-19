import { useState, useEffect, useCallback } from 'react';
import { pb } from '../lib/pocketbase';
import { getPocketBaseRateLimitState, isPocketBaseRateLimited, notePocketBaseRateLimit } from '../lib/pocketbaseRateLimit';

const CACHE_KEY_PREFIX = 'rafiki_pb_cache_';
const AUTO_REFETCH_INTERVAL_MS = 60000;
const COLLECTION_REFRESH_COOLDOWN_MS = 20000;
const collectionRefreshTimes = new Map<string, number>();

function canRefreshCollection() {
  return (
    import.meta.env.VITE_AUTH_MODE === 'pocketbase' &&
    navigator.onLine &&
    document.visibilityState !== 'hidden' &&
    pb.authStore.isValid &&
    !getPocketBaseRateLimitState().isPaused
  );
}

export function usePbCollection<T>(collectionName: string) {
  // Seed initial state from localStorage cache for instant render (no flicker)
  const [records, setRecords] = useState<T[]>(() => {
    try {
      const cached = localStorage.getItem(CACHE_KEY_PREFIX + collectionName);
      return cached ? JSON.parse(cached) : [];
    } catch {
      return [];
    }
  });
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<any>(null);
  const [authRevision, setAuthRevision] = useState(0);

  const updateRecords = useCallback((newRecords: T[]) => {
    setRecords(newRecords);
    try {
      localStorage.setItem(CACHE_KEY_PREFIX + collectionName, JSON.stringify(newRecords));
    } catch { /* storage quota exceeded — ignore */ }
  }, [collectionName]);

  const refetch = useCallback(async (options: { silent?: boolean } = {}) => {
    if (import.meta.env.VITE_AUTH_MODE !== 'pocketbase' || !pb.authStore.isValid) {
      return [];
    }
    if (getPocketBaseRateLimitState().isPaused) return records;

    const now = Date.now();
    const lastRefresh = collectionRefreshTimes.get(collectionName) || 0;
    if (options.silent && now - lastRefresh < COLLECTION_REFRESH_COOLDOWN_MS) {
      return records;
    }

    if (!options.silent) setIsLoading(true);
    try {
      const data = await pb.collection(collectionName).getFullList();
      collectionRefreshTimes.set(collectionName, Date.now());
      const next = data as unknown as T[];
      updateRecords(next);
      setError(null);
      return next;
    } catch (err) {
      if (isPocketBaseRateLimited(err)) notePocketBaseRateLimit(undefined, (err as any)?.response);
      console.error(`Refetch failed for ${collectionName}:`, err);
      setError(err);
      return [];
    } finally {
      if (!options.silent) setIsLoading(false);
    }
  }, [collectionName, records, updateRecords]);

  const upsertRecord = useCallback((record: T) => {
    setRecords((prev) => {
      const recordId = (record as any).id;
      const exists = prev.some((item: any) => item.id === recordId);
      const next = exists
        ? prev.map((item: any) => item.id === recordId ? record : item)
        : [record, ...prev];
      try {
        localStorage.setItem(CACHE_KEY_PREFIX + collectionName, JSON.stringify(next));
      } catch { /* ignore */ }
      return next;
    });
  }, [collectionName]);

  const removeRecord = useCallback((id: string | number) => {
    setRecords((prev) => {
      const next = prev.filter((item: any) => item.id !== id);
      try {
        localStorage.setItem(CACHE_KEY_PREFIX + collectionName, JSON.stringify(next));
      } catch { /* ignore */ }
      return next;
    });
  }, [collectionName]);

  useEffect(() => {
    const unsubscribeAuth = pb.authStore.onChange(() => {
      setAuthRevision(revision => revision + 1);
    });
    return () => unsubscribeAuth();
  }, []);

  useEffect(() => {
    if (import.meta.env.VITE_AUTH_MODE !== 'pocketbase' || !pb.authStore.isValid) {
      setIsLoading(false);
      return;
    }

    let isMounted = true;

    // 1. Initial fetch
    const fetchInitial = async () => {
      if (getPocketBaseRateLimitState().isPaused) {
        setIsLoading(false);
        return;
      }

      try {
        const data = await pb.collection(collectionName).getFullList();
        collectionRefreshTimes.set(collectionName, Date.now());
        if (isMounted) updateRecords(data as unknown as T[]);
        setIsLoading(false);
      } catch (err) {
        if (isPocketBaseRateLimited(err)) notePocketBaseRateLimit(undefined, (err as any)?.response);
        if (isMounted) {
          console.error(`Initial fetch failed for ${collectionName}:`, err);
          setError(err);
          setIsLoading(false);
        }
      }
    };

    fetchInitial();

    // 2. Subscribe to real-time changes
    const subscribe = async () => {
      try {
        await pb.collection(collectionName).subscribe('*', (event) => {
          if (!isMounted) return;

          setRecords((prev) => {
            let next: T[];
            if (event.action === 'create') {
              if (prev.some((r: any) => r.id === event.record.id)) return prev;
              next = [event.record as unknown as T, ...prev];
            } else if (event.action === 'update') {
              next = prev.map((r: any) =>
                r.id === event.record.id ? (event.record as unknown as T) : r
              );
            } else if (event.action === 'delete') {
              next = prev.filter((r: any) => r.id !== event.record.id);
            } else {
              return prev;
            }
            // Write-through on every real-time event
            try {
              localStorage.setItem(CACHE_KEY_PREFIX + collectionName, JSON.stringify(next));
            } catch { /* ignore */ }
            return next;
          });
        });
      } catch (err) {
        console.error(`Subscription failed for ${collectionName}:`, err);
      }
    };

    subscribe();

    return () => {
      isMounted = false;
      pb.collection(collectionName).unsubscribe('*');
    };
  }, [collectionName, updateRecords, authRevision]);

  useEffect(() => {
    if (import.meta.env.VITE_AUTH_MODE !== 'pocketbase') return;

    const wakeRefresh = () => {
      if (canRefreshCollection()) refetch({ silent: true });
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') wakeRefresh();
    };

    const unsubscribeAuth = pb.authStore.onChange(() => wakeRefresh());

    window.addEventListener('online', wakeRefresh);
    window.addEventListener('focus', wakeRefresh);
    window.addEventListener('pageshow', wakeRefresh);
    document.addEventListener('visibilitychange', handleVisibilityChange);

    const interval = window.setInterval(() => {
      if (canRefreshCollection()) refetch({ silent: true });
    }, AUTO_REFETCH_INTERVAL_MS);

    return () => {
      unsubscribeAuth();
      window.removeEventListener('online', wakeRefresh);
      window.removeEventListener('focus', wakeRefresh);
      window.removeEventListener('pageshow', wakeRefresh);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.clearInterval(interval);
    };
  }, [refetch]);

  return { records, isLoading, error, refetch, upsertRecord, removeRecord };
}
