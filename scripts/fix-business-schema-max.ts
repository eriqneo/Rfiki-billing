import 'dotenv/config';
import PocketBase from 'pocketbase';

const pb = new PocketBase('https://code-rafiki.pockethost.io');

async function fixBusinessSchemaMax() {
  await pb.collection('_superusers').authWithPassword(process.env.POCKETBASE_ADMIN_EMAIL!, process.env.POCKETBASE_ADMIN_PASSWORD!);
  const col = await pb.collections.getOne('business');

  const fields = col.fields.map((f: any) => {
    if (f.name === 'logo_base64') {
      return { ...f, max: 5000000 }; // 5 million chars
    }
    return f;
  });

  await pb.collections.update(col.id, {
    fields: fields
  });
  console.log('✅ Business schema logo_base64 max limit increased to 5000000');
}

fixBusinessSchemaMax().catch(console.error);
