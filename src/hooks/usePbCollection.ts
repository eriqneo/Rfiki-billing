import { useState, useEffect } from 'react';
import { pb } from '../lib/pocketbase';

const CACHE_KEY_PREFIX = 'rafiki_pb_cache_';

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

  useEffect(() => {
    if (import.meta.env.VITE_AUTH_MODE !== 'pocketbase' || !pb.authStore.isValid) {
      setIsLoading(false);
      return;
    }

    let isMounted = true;

    const updateRecords = (newRecords: T[]) => {
      if (!isMounted) return;
      setRecords(newRecords);
      // Write-through cache — persist to localStorage for instant next load
      try {
        localStorage.setItem(CACHE_KEY_PREFIX + collectionName, JSON.stringify(newRecords));
      } catch { /* storage quota exceeded — ignore */ }
    };

    // 1. Initial fetch
    const fetchInitial = async () => {
      try {
        const data = await pb.collection(collectionName).getFullList();
        updateRecords(data as unknown as T[]);
        setIsLoading(false);
      } catch (err) {
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
  }, [collectionName]);

  return { records, isLoading, error };
}
