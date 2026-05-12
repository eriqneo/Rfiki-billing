import 'dotenv/config';
import PocketBase from 'pocketbase';

const pb = new PocketBase('https://code-rafiki.pockethost.io');

async function debugBusiness() {
  await pb.collection('_superusers').authWithPassword(process.env.POCKETBASE_ADMIN_EMAIL!, process.env.POCKETBASE_ADMIN_PASSWORD!);
  const col = await pb.collections.getOne('business');
  console.log(JSON.stringify(col, null, 2));
}

debugBusiness().catch(console.error);
