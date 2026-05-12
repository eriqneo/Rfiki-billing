import { useState, useEffect, useCallback, useRef } from 'react';
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

export function useSync() {
  const [isSyncing, setIsSyncing] = useState(false);
  const isSyncingRef = useRef(false);
  const [isOnline, setIsOnline] = useState(navigator.onLine);

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
    if (!navigator.onLine || isSyncingRef.current) return;

    // Process legacy syncQueue
    const legacyQueue = await db.syncQueue.toArray();
    
    // Process new pending_sync
    const pendingSync = await db.pending_sync.toArray();

    if (legacyQueue.length === 0 && pendingSync.length === 0) return;

    isSyncingRef.current = true;
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

      // Process legacy items
      for (const item of legacyQueue) {
        try {
          await new Promise(resolve => setTimeout(resolve, 100)); 
          
          if (import.meta.env.VITE_AUTH_MODE === 'pocketbase' && pb.authStore.isValid) {
            const collectionName = PB_COLLECTIONS[item.entity];
            if (collectionName) {
              // @ts-ignore
              const localData = await db[item.entity].get(item.entityId);
              
              if (localData) {
                const { id, pb_id, synced, ...pbData } = localData as any;

                if (item.operation === 'CREATE') {
                  try {
                    const record = await pb.collection(collectionName).create(pbData);
                    // @ts-ignore
                    await db[item.entity].update(item.entityId, { pb_id: record.id, synced: true });
                  } catch (err) {
                    console.error(`PB Create failed for ${item.entity}:`, err);
                  }
                } else if (item.operation === 'UPDATE' && pb_id) {
                  try {
                    await pb.collection(collectionName).update(pb_id, pbData);
                    // @ts-ignore
                    await db[item.entity].update(item.entityId, { synced: true });
                  } catch (err) {
                    console.error(`PB Update failed for ${item.entity}:`, err);
                  }
                } else if (item.operation === 'DELETE' && pb_id) {
                  try {
                    await pb.collection(collectionName).delete(pb_id);
                  } catch (err) {
                    console.error(`PB Delete failed for ${item.entity}:`, err);
                  }
                }
              }
            }
          } else {
            // Non-PocketBase mode or not logged in
            if (item.operation !== 'DELETE') {
              // @ts-ignore
              await db[item.entity].update(item.entityId, { synced: true });
            }
          }
          await db.syncQueue.delete(item.id!);
        } catch (error) {
          console.error(`Failed to sync item ${item.id}:`, error);
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
      isSyncingRef.current = false;
      setIsSyncing(false);
    }
  }, []);

  useEffect(() => {
    if (isOnline) {
      processSyncQueue();
    }
  }, [isOnline, processSyncQueue]);

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
    await db[entity].delete(id);
    await db.syncQueue.add({
      entity: entity as any,
      entityId: id,
      operation: 'DELETE',
      timestamp: Date.now()
    });
    if (navigator.onLine) processSyncQueue();
  };

  return { isSyncing, isOnline, addEntity, updateEntity, deleteEntity };
}
