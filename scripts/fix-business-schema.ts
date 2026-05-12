import 'dotenv/config';
import PocketBase from 'pocketbase';

const pb = new PocketBase('https://code-rafiki.pockethost.io');

async function fixBusinessSchema() {
  await pb.collection('_superusers').authWithPassword(process.env.POCKETBASE_ADMIN_EMAIL!, process.env.POCKETBASE_ADMIN_PASSWORD!);
  const col = await pb.collections.getOne('business');

  // Filter out logo_base64 and add it back as text
  const fields = col.fields.filter((f: any) => f.name !== 'logo_base64');
  (fields as any).push({ name: 'logo_base64', type: 'text' });

  await pb.collections.update(col.id, {
    fields: fields
  });
  console.log('✅ Business schema logo_base64 recreated as plain text');
}

fixBusinessSchema().catch(console.error);
