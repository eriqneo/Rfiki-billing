import PocketBase from 'pocketbase';

const pb = new PocketBase('https://code-rafiki.pockethost.io');

async function checkBusiness() {
  await pb.collection('_superusers').authWithPassword('aturaerick@gmail.com', 'dGY@SrzA86PQc5n');
  const coll = await pb.collections.getOne('business');
  console.log(JSON.stringify(coll.fields, null, 2));
}

checkBusiness().catch(console.error);
