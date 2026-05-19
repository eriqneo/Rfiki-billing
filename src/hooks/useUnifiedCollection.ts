import { useLiveQuery } from 'dexie-react-hooks';
import { usePbCollection } from './usePbCollection';
import { useEffect, useMemo } from 'react';
import { db } from '../db/db';

const MIRRORED_COLLECTIONS = new Set([
  'expenses',
  'payments',
  'agreements',
  'billing_promises',
  'meetings',
  'team_members',
  'business',
  'clients',
  'pocket_host_instances',
  'quotations',
  'quotation_templates',
  'invoices',
]);

function normalizePocketBaseRecord(record: any) {
  const { id, collectionId, collectionName, created, updated, expand, ...rest } = record;
  return {
    ...rest,
    pb_id: id,
    synced: true,
  };
}

async function findExistingLocalRecord(table: any, collectionName: string, record: any) {
  const byPbId = await table.where('pb_id').equals(record.id).first();
  if (byPbId) return byPbId;

  if (collectionName === 'invoices' && record.invoice_number) {
    return table.where('invoice_number').equals(record.invoice_number).first();
  }
  if (collectionName === 'quotations' && record.quote_number) {
    return table.where('quote_number').equals(record.quote_number).first();
  }
  if (collectionName === 'clients' && record.node_id) {
    return table.where('node_id').equals(record.node_id).first();
  }
  if (collectionName === 'pocket_host_instances' && record.instance_name) {
    return table.where('instance_name').equals(record.instance_name).first();
  }
  if (collectionName === 'payments' && record.idempotency_key) {
    return table.where('idempotency_key').equals(record.idempotency_key).first();
  }

  return null;
}

export function useUnifiedCollection<T>(collectionName: string, dexieFetcher: () => any) {
  const isPb = import.meta.env.VITE_AUTH_MODE === 'pocketbase';
  const { records: pbRecords, isLoading: pbLoading } = usePbCollection<T>(collectionName);
  const dexieRecords = useLiveQuery(dexieFetcher);

  useEffect(() => {
    if (!isPb || !MIRRORED_COLLECTIONS.has(collectionName) || !pbRecords?.length) return;

    let cancelled = false;

    const mirrorCloudToDexie = async () => {
      const table = (db as any)[collectionName];
      if (!table) return;

      for (const record of pbRecords as any[]) {
        if (cancelled || !record?.id) return;

        const existing = await findExistingLocalRecord(table, collectionName, record);
        const localData = normalizePocketBaseRecord(record);

        if (existing?.synced === false) continue;
        if (existing?.id) {
          await table.update(existing.id, localData);
        } else {
          await table.add(localData);
        }
      }
    };

    mirrorCloudToDexie().catch(error => {
      console.error(`[LOCAL-MIRROR] Failed to mirror ${collectionName}:`, error);
    });

    return () => {
      cancelled = true;
    };
  }, [collectionName, isPb, pbRecords]);
  
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
