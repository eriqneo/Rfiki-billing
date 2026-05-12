import { db } from '../src/db/db';

async function checkSyncQueue() {
  const queue = await db.syncQueue.toArray();
  console.log('--- SYNC QUEUE STATUS ---');
  console.log('Total items in queue:', queue.length);
  queue.forEach(item => {
    console.log(`[${item.operation}] Entity: ${item.entity}, ID: ${item.entityId}`);
  });
  
  const expenses = await db.expenses.toArray();
  const unsyncedExpenses = expenses.filter(e => !e.synced);
  console.log('Unsynced Expenses:', unsyncedExpenses.length);

  const ph = await db.pocket_host_instances.toArray();
  const unsyncedPh = ph.filter(p => !p.synced);
  console.log('Unsynced PH Instances:', unsyncedPh.length);
}

checkSyncQueue().catch(console.error);
