import { useState, useEffect, useCallback } from 'react';
import { db, type Expense, type Payment, type Agreement, type PaymentPromise, type Meeting, type TeamMember, type BusinessProfile, type Client, type PocketHostInstance } from '../db/db';
import { googleCalendarService } from '../services/googleCalendarService';
import { pb } from '../lib/pocketbase';

const PB_COLLECTIONS: Record<string, string> = {
  expenses: 'expenses',
  payments: 'payments',
  agreements: 'agreements',
  billing_promises: 'billing_promises',
  meetings: 'meetings',
  team_members: 'team_members',
  business: 'business',
  clients: 'clients',
  pocket_host_instances: 'pocket_host_instances'
};

const SYNCABLE_COLLECTIONS = Object.keys(PB_COLLECTIONS) as Array<keyof EntityMap>;
const AUTO_SYNC_INTERVAL_MS = 15000;

let globalSyncInFlight = false;
let globalSweepInFlight = false;

type EntityMap = {
  expenses: Expense;
  payments: Payment;
  agreements: Agreement;
  billing_promises: PaymentPromise;
  meetings: Meeting;
  team_members: TeamMember;
  business: BusinessProfile;
  clients: Client;
  pocket_host_instances: PocketHostInstance;
};

type SyncCollection = keyof EntityMap;
type RebuildSyncQueueOptions = {
  verifyCloud?: boolean;
  collections?: SyncCollection[];
};

function stripLocalFields(record: any) {
  const { id, pb_id, synced, file_blob, ...pbData } = record;
  if (pbData.name && !pbData.instance_name) {
    pbData.instance_name = pbData.name;
  }
  if (pbData.renewal_date && !pbData.next_billing_date) {
    pbData.next_billing_date = pbData.renewal_date;
  }
  if (!pbData.billing_cycle) {
    pbData.billing_cycle = 'monthly';
  }
  if (!pbData.status) {
    pbData.status = 'active';
  }
  return pbData;
}

function normalizeHostName(record: any) {
  return String(record?.instance_name || record?.name || '').trim().toLowerCase();
}

function findStableRemoteMatch(localData: any, remoteRecords: any[]) {
  return remoteRecords.find((record) => {
    if (localData.node_id && record.node_id === localData.node_id) return true;
    const localHostName = normalizeHostName(localData);
    const remoteHostName = normalizeHostName(record);
    if (localHostName && remoteHostName && localHostName === remoteHostName) return true;
    if (localData.idempotency_key && record.idempotency_key === localData.idempotency_key) return true;
    if (localData.transaction_id && record.transaction_id === localData.transaction_id) return true;
    if (
      localData.client_id &&
      localData.due_date &&
      localData.amount_due !== undefined &&
      record.client_id === localData.client_id &&
      record.due_date === localData.due_date &&
      Number(record.amount_due) === Number(localData.amount_due)
    ) return true;
    if (
      localData.client_id &&
      localData.client_name &&
      localData.project_details &&
      record.client_id === localData.client_id &&
      record.client_name === localData.client_name &&
      record.project_details === localData.project_details
    ) return true;
    if (
      localData.date &&
      localData.description &&
      localData.amount !== undefined &&
      record.date === localData.date &&
      record.description === localData.description &&
      Number(record.amount) === Number(localData.amount)
    ) return true;
    if (
      localData.start_time &&
      localData.summary &&
      record.start_time === localData.start_time &&
      record.summary === localData.summary
    ) return true;
    if (localData.name && localData.till_number && record.name === localData.name) return true;
    return false;
  });
}

export function useSync() {
  const [isSyncing, setIsSyncing] = useState(false);
  const [isOnline, setIsOnline] = useState(navigator.onLine);

  const rebuildSyncQueue = useCallback(async (options: RebuildSyncQueueOptions = {}) => {
    if (globalSweepInFlight) return 0;
    globalSweepInFlight = true;
    let queued = 0;

    try {
      const existingQueue = await db.syncQueue.toArray();
      const hasQueuedItem = new Set(existingQueue.map(item => `${item.entity}:${item.entityId}`));

      const collections = options.collections || SYNCABLE_COLLECTIONS;

      for (const col of collections) {
        try {
          // @ts-ignore - Dexie dynamic table access
          const allRecords = await db[col].toArray();
          const missingCloudId = allRecords.filter((r: any) => r.id && !r.pb_id).length;
          const unsynced = allRecords.filter((r: any) => r.id && r.synced === false).length;
          console.log(`[AUDIT] ${col}: Total=${allRecords.length}, Unsynced=${unsynced}, Missing-PBID=${missingCloudId}`);

          let remoteRecords: any[] | null = null;
          if (
            options.verifyCloud &&
            import.meta.env.VITE_AUTH_MODE === 'pocketbase' &&
            navigator.onLine &&
            pb.authStore.isValid
          ) {
            try {
              remoteRecords = await pb.collection(PB_COLLECTIONS[col]).getFullList({ requestKey: `audit-${col}` });
              console.log(`[AUDIT-CLOUD] ${col}: Remote=${remoteRecords.length}`);
            } catch (error) {
              console.error(`[AUDIT-CLOUD-ERROR] Failed to inspect ${col}:`, error);
            }
          }

          const recordsNeedingSync = allRecords.filter((record: any) =>
            record.id && (
              !record.pb_id ||
              record.synced === false ||
              (
                remoteRecords &&
                !remoteRecords.some((remote) => remote.id === record.pb_id) &&
                !findStableRemoteMatch(record, remoteRecords)
              )
            )
          );

          for (const record of recordsNeedingSync) {
            const key = `${col}:${record.id}`;
            if (hasQueuedItem.has(key)) continue;

            if (record.synced !== false) {
              // @ts-ignore - Dexie dynamic table access
              await db[col].update(record.id, { synced: false });
            }

            await db.syncQueue.add({
              entity: col as any,
              entityId: record.id,
              operation: record.pb_id ? 'UPDATE' : 'CREATE',
              timestamp: Date.now()
            });
            hasQueuedItem.add(key);
            queued++;
          }
        } catch (e) {
          console.error(`[AUDIT-ERROR] Failed to audit ${col}:`, e);
        }
      }
    } finally {
      globalSweepInFlight = false;
    }

    return queued;
  }, []);

  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  const processSyncQueue = useCallback(async () => {
    console.log(`[SYNC-ENTRY] Online: ${navigator.onLine}, Busy: ${globalSyncInFlight}, Auth: ${pb.authStore.isValid}`);
    const summary = { processed: 0, failed: 0 };
    if (!navigator.onLine || globalSyncInFlight) return summary;

    await rebuildSyncQueue();

    // Process legacy syncQueue
    const legacyQueue = await db.syncQueue.toArray();

    // Process new pending_sync
    const pendingSync = await db.pending_sync.toArray();

    if (legacyQueue.length === 0 && pendingSync.length === 0) return summary;

    globalSyncInFlight = true;
    setIsSyncing(true);

    try {
      /*
      // Temporarily disabled: Process Google Calendar pending items
      for (const item of pendingSync) {
        if (item.entity === 'meetings' && item.operation === 'CREATE') {
          try {
            const meetingData = JSON.parse(item.payload!);
            const result = await googleCalendarService.scheduleMeeting(meetingData, item.entity_id);
            if (result.synced) {
               await db.pending_sync.delete(item.id!);
            }
          } catch (error: any) {
            if (error.message === 'GOOGLE_AUTH_REQUIRED' || error.message === 'NETWORK_ERROR') {
              console.warn(`[SYNC] Postponed sync for meeting ${item.id} due to ${error.message}`);
            } else {
              console.error(`Failed to sync meeting ${item.id}:`, error);
            }
          }
        }
      }
      */

      const remoteCache = new Map<string, any[]>();

      const getRemoteRecords = async (collectionName: string) => {
        if (!remoteCache.has(collectionName)) {
          const records = await pb.collection(collectionName).getFullList({ requestKey: `sync-${collectionName}` });
          remoteCache.set(collectionName, records);
        }
        return remoteCache.get(collectionName)!;
      };

      // Process legacy items
      for (const item of legacyQueue) {
        let syncedSuccessfully = false;

        try {
          await new Promise(resolve => setTimeout(resolve, 100));

          if (import.meta.env.VITE_AUTH_MODE === 'pocketbase' && pb.authStore.isValid) {
            const collectionName = PB_COLLECTIONS[item.entity];
            if (collectionName) {
              // @ts-ignore
              const localData = await db[item.entity].get(item.entityId);

              if (localData) {
                const pbData = stripLocalFields(localData);
                const pbId = (localData as any).pb_id;

                try {
                  if (item.operation === 'DELETE') {
                    if (pbId) await pb.collection(collectionName).delete(pbId);
                  } else if (pbId) {
                    try {
                      await pb.collection(collectionName).update(pbId, pbData);
                    } catch (updateError: any) {
                      const remoteRecords = await getRemoteRecords(collectionName);
                      const remoteMatch = findStableRemoteMatch(localData, remoteRecords);
                      const record = remoteMatch
                        ? await pb.collection(collectionName).update(remoteMatch.id, pbData)
                        : await pb.collection(collectionName).create(pbData);
                      remoteCache.set(
                        collectionName,
                        remoteMatch
                          ? remoteRecords.map((remoteRecord) => remoteRecord.id === record.id ? record : remoteRecord)
                          : [...remoteRecords, record]
                      );
                      // @ts-ignore
                      await db[item.entity].update(item.entityId, { pb_id: record.id });
                    }
                    // @ts-ignore
                    await db[item.entity].update(item.entityId, { synced: true });
                  } else {
                    const remoteRecords = await getRemoteRecords(collectionName);
                    const remoteMatch = findStableRemoteMatch(localData, remoteRecords);
                    const record = remoteMatch
                      ? await pb.collection(collectionName).update(remoteMatch.id, pbData)
                      : await pb.collection(collectionName).create(pbData);
                    remoteCache.set(
                      collectionName,
                      remoteMatch
                        ? remoteRecords.map((remoteRecord) => remoteRecord.id === record.id ? record : remoteRecord)
                        : [...remoteRecords, record]
                    );

                    // @ts-ignore
                    await db[item.entity].update(item.entityId, { pb_id: record.id, synced: true });
                  }
                  syncedSuccessfully = true;
                } catch (err) {
                  console.error(`PB sync failed for ${item.entity}:`, err);
                  summary.failed++;
                }
              } else if (item.operation === 'DELETE') {
                syncedSuccessfully = true;
              }
            }
          } else if (import.meta.env.VITE_AUTH_MODE !== 'pocketbase') {
            // Local-only mode: mark as synced immediately
            if (item.operation !== 'DELETE') {
              // @ts-ignore
              await db[item.entity].update(item.entityId, { synced: true });
            }
            syncedSuccessfully = true;
          } else {
            // PocketBase mode but not logged in: skip this item for now
            console.warn(`[SYNC] Postponed sync for ${item.entity} #${item.entityId} - User not authenticated`);
            continue;
          }

          if (syncedSuccessfully) {
            await db.syncQueue.delete(item.id!);
            summary.processed++;
            console.log(`[SYNC] Successfully synced ${item.entity} #${item.entityId}`);
          }
        } catch (error) {
          console.error(`[SYNC] Failed to sync item ${item.id}:`, error);
          summary.failed++;
        }
      }

      /*
      // Temporarily disabled: Refresh meetings from Google if online
      try {
        await googleCalendarService.fetchMeetings();
      } catch (e) {
        console.warn('Silent fail for calendar fetch during sync');
      }
      */
    } finally {
      globalSyncInFlight = false;
      setIsSyncing(false);
    }
    return summary;
  }, [rebuildSyncQueue]);

  useEffect(() => {
    if (isOnline) {
      processSyncQueue();
    }
  }, [isOnline, processSyncQueue]);

  useEffect(() => {
    const unsubscribe = pb.authStore.onChange(() => {
      if (navigator.onLine) processSyncQueue();
    });

    const interval = window.setInterval(() => {
      if (navigator.onLine) processSyncQueue();
    }, AUTO_SYNC_INTERVAL_MS);

    return () => {
      unsubscribe();
      window.clearInterval(interval);
    };
  }, [processSyncQueue]);

  const addEntity = async <T extends keyof EntityMap>(entity: T, data: Omit<EntityMap[T], 'id' | 'synced'>) => {
    // @ts-ignore - dynamic table access
    const id = await db[entity].add({ ...data, synced: false });
    await db.syncQueue.add({
      entity: entity as any,
      entityId: id as number,
      operation: 'CREATE',
      timestamp: Date.now()
    });
    if (navigator.onLine) processSyncQueue();
    return id;
  };

  const updateEntity = async <T extends keyof EntityMap>(entity: T, id: number, data: Partial<EntityMap[T]>) => {
    // @ts-ignore - dynamic table access
    await db[entity].update(id, { ...data, synced: false });
    await db.syncQueue.add({
      entity: entity as any,
      entityId: id,
      operation: 'UPDATE',
      timestamp: Date.now()
    });
    if (navigator.onLine) processSyncQueue();
  };

  const deleteEntity = async <T extends keyof EntityMap>(entity: T, id: number) => {
    // @ts-ignore - dynamic table access
    const existingRecord = await db[entity].get(id);

    if (
      import.meta.env.VITE_AUTH_MODE === 'pocketbase' &&
      navigator.onLine &&
      pb.authStore.isValid &&
      existingRecord?.pb_id
    ) {
      await pb.collection(PB_COLLECTIONS[entity]).delete(existingRecord.pb_id);
    }

    // @ts-ignore - dynamic table access
    await db[entity].delete(id);

    if (!navigator.onLine && existingRecord?.pb_id) {
      await db.syncQueue.add({
        entity: entity as any,
        entityId: id,
        operation: 'DELETE',
        timestamp: Date.now()
      });
    }
  };

  return { isSyncing, isOnline, addEntity, updateEntity, deleteEntity, processSyncQueue, rebuildSyncQueue };
}
