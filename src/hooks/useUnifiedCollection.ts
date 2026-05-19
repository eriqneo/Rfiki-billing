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

function normalizeKeyPart(value: unknown) {
  return String(value || '').trim().toLowerCase();
}

function normalizeAmount(value: unknown) {
  return Number(value || 0).toFixed(2);
}

function getStableCollectionKey(collectionName: string, record: any) {
  if (!record) return '';

  if (collectionName === 'pocket_host_instances') {
    const hostName = normalizeKeyPart(record.instance_name || record.name);
    return hostName ? `host:${hostName}` : '';
  }

  if (collectionName === 'payments') {
    const idempotencyKey = normalizeKeyPart(record.idempotency_key);
    if (idempotencyKey) return `payment:idempotency:${idempotencyKey}`;

    const transactionId = normalizeKeyPart(record.transaction_id);
    if (transactionId) return `payment:transaction:${transactionId}`;

    const clientId = normalizeKeyPart(record.client_id);
    const date = normalizeKeyPart(record.date);
    const amount = normalizeAmount(record.amount);
    const quoteNumber = normalizeKeyPart(record.quote_number);
    const milestone = normalizeKeyPart(record.billing_milestone_title);
    if (clientId && date && amount) {
      return `payment:fallback:${clientId}:${date}:${amount}:${quoteNumber}:${milestone}`;
    }
  }

  if (collectionName === 'clients' && record.node_id) return `client:${normalizeKeyPart(record.node_id)}`;
  if (collectionName === 'quotations' && record.quote_number) return `quote:${normalizeKeyPart(record.quote_number)}`;
  if (collectionName === 'invoices' && record.invoice_number) return `invoice:${normalizeKeyPart(record.invoice_number)}`;
  if (collectionName === 'billing_promises') {
    const clientId = normalizeKeyPart(record.client_id);
    const quoteNumber = normalizeKeyPart(record.quote_number);
    const milestone = normalizeKeyPart(record.milestone_title);
    const dueDate = normalizeKeyPart(record.due_date);
    const amount = normalizeAmount(record.amount_due);
    if (clientId && quoteNumber && milestone) {
      return `promise:${clientId}:${quoteNumber}:${milestone}:${dueDate}:${amount}`;
    }
  }

  return '';
}

function recordFreshness(record: any) {
  const updated = Date.parse(record?.updated || record?.created_at || record?.date || '');
  return Number.isFinite(updated) ? updated : 0;
}

function choosePreferredRecord(current: any, incoming: any) {
  if (!current) return incoming;
  if (incoming?.synced === false && current?.synced !== false) return incoming;
  if (current?.synced === false && incoming?.synced !== false) return current;
  if (recordFreshness(incoming) > recordFreshness(current)) return incoming;
  return current;
}

function dedupeBusinessRecords<T>(collectionName: string, records: T[] | undefined) {
  if (!records) return records;

  const byStableKey = new Map<string, any>();
  const fallbackRecords: any[] = [];

  for (const record of records as any[]) {
    const stableKey = getStableCollectionKey(collectionName, record);
    if (!stableKey) {
      fallbackRecords.push(record);
      continue;
    }

    byStableKey.set(stableKey, choosePreferredRecord(byStableKey.get(stableKey), record));
  }

  return [...fallbackRecords, ...Array.from(byStableKey.values())] as T[];
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
  if (collectionName === 'payments' && record.transaction_id) {
    return table.where('transaction_id').equals(record.transaction_id).first();
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
    if (!isPb) return dedupeBusinessRecords(collectionName, dexieRecords);
    if (!pbRecords) return dedupeBusinessRecords(collectionName, dexieRecords);
    if (!dexieRecords) return dedupeBusinessRecords(collectionName, pbRecords);

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
    
    return dedupeBusinessRecords(collectionName, Array.from(dataMap.values()));
  }, [isPb, pbRecords, dexieRecords]);

  return {
    data: mergedData,
    isLoading: isPb ? (pbLoading && (!dexieRecords || dexieRecords.length === 0)) : (dexieRecords === undefined)
  };
}
