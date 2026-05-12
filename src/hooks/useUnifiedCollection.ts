import { useLiveQuery } from 'dexie-react-hooks';
import { usePbCollection } from './usePbCollection';
import { useMemo } from 'react';

export function useUnifiedCollection<T>(collectionName: string, dexieFetcher: () => any) {
  const isPb = import.meta.env.VITE_AUTH_MODE === 'pocketbase';
  const { records: pbRecords, isLoading: pbLoading } = usePbCollection<T>(collectionName);
  const dexieRecords = useLiveQuery(dexieFetcher);
  
  const mergedData = useMemo(() => {
    if (!isPb) return dexieRecords;
    if (!pbRecords) return dexieRecords;
    if (!dexieRecords) return pbRecords;

    // 1. Create a map of PB records for fast lookup
    const dataMap = new Map();
    pbRecords.forEach((r: any) => {
      const id = r.id || r.pb_id;
      dataMap.set(id, r);
    });

    // 2. Process Dexie records: unsynced changes should OVERRIDE PB records
    dexieRecords.forEach((r: any) => {
      if (r.synced === false) {
        if (r.pb_id) {
          // Optimistic Update: Replace cloud version with local version
          dataMap.set(r.pb_id, r);
        } else {
          // Optimistic Create: Add new local record
          dataMap.set(`local-${r.id}`, r);
        }
      }
    });
    
    return Array.from(dataMap.values());
  }, [isPb, pbRecords, dexieRecords]);

  return {
    data: mergedData,
    isLoading: isPb ? (pbLoading && (!dexieRecords || dexieRecords.length === 0)) : (dexieRecords === undefined)
  };
}
