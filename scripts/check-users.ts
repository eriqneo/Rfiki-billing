import 'dotenv/config';
import PocketBase from 'pocketbase';

const pb = new PocketBase('https://code-rafiki.pockethost.io');

async function checkUsers() {
  await pb.collection('_superusers').authWithPassword(process.env.POCKETBASE_ADMIN_EMAIL!, process.env.POCKETBASE_ADMIN_PASSWORD!);
  const coll = await pb.collections.getOne('users');
  console.log(JSON.stringify(coll.fields, null, 2));
}

checkUsers().catch(console.error);
