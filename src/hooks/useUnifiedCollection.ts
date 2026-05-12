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

    // Merge logic: Take all PB records, then add local records that are explicitly marked as unsynced.
    // This provides a clean optimistic UI for new creations.
    const pbIds = new Set(pbRecords.map((r: any) => r.id || r.pb_id));
    const localOnly = dexieRecords.filter((r: any) => r.synced === false && (!r.pb_id || !pbIds.has(r.pb_id)));
    
    return [...pbRecords, ...localOnly];
  }, [isPb, pbRecords, dexieRecords]);

  return {
    data: mergedData,
    isLoading: isPb ? (pbLoading && (!dexieRecords || dexieRecords.length === 0)) : (dexieRecords === undefined)
  };
}
