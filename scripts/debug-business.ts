import PocketBase from 'pocketbase';

const pb = new PocketBase('https://code-rafiki.pockethost.io');

async function debugBusiness() {
  await pb.collection('_superusers').authWithPassword('aturaerick@gmail.com', 'dGY@SrzA86PQc5n');
  const col = await pb.collections.getOne('business');
  console.log(JSON.stringify(col, null, 2));
}

debugBusiness().catch(console.error);
