import PocketBase from 'pocketbase';

const pb = new PocketBase('https://code-rafiki.pockethost.io');

// Collections that regular authenticated users should be able to read & write
const OPEN_COLLECTIONS = [
  'clients',
  'payments', 
  'expenses',
  'agreements',
  'meetings',
  'billing_promises',
  'team_members',
  'business',
  'pocket_host_instances',
];

async function setCollectionRules() {
  await pb.collection('_superusers').authWithPassword('aturaerick@gmail.com', 'dGY@SrzA86PQc5n');
  console.log('✅ Admin authenticated\n');

  for (const name of OPEN_COLLECTIONS) {
    try {
      const col = await pb.collections.getOne(name);

      await pb.collections.update(col.id, {
        listRule:   '@request.auth.id != ""',
        viewRule:   '@request.auth.id != ""',
        createRule: '@request.auth.id != ""',
        updateRule: '@request.auth.id != ""',
        deleteRule: '@request.auth.id != ""',
      });

      console.log(`✅ Rules set for: ${name}`);
    } catch (e: any) {
      console.error(`❌ Failed for ${name}: ${e.message}`);
    }
  }

  console.log('\n🎉 All collection rules updated. Regular users can now read and write.');
}

setCollectionRules().catch(console.error);
