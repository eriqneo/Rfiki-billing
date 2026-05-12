import PocketBase from 'pocketbase';

const pb = new PocketBase('https://code-rafiki.pockethost.io');

async function updateBusinessSchema() {
  await pb.collection('_superusers').authWithPassword('aturaerick@gmail.com', 'dGY@SrzA86PQc5n');
  const col = await pb.collections.getOne('business');

  await pb.collections.update(col.id, {
    fields: [
      ...col.fields,
      { name: 'name', type: 'text' },
      { name: 'till_number', type: 'text' },
      { name: 'currency', type: 'text' },
      { name: 'logo_base64', type: 'editor' } // use editor or text for large base64
    ]
  });
  console.log('✅ Business schema updated');
}

updateBusinessSchema().catch(console.error);
