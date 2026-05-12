import 'dotenv/config';
import PocketBase from 'pocketbase';

const pb = new PocketBase('https://code-rafiki.pockethost.io');

async function addNameFieldToUsers() {
  await pb.collection('_superusers').authWithPassword(process.env.POCKETBASE_ADMIN_EMAIL!, process.env.POCKETBASE_ADMIN_PASSWORD!);
  const col = await pb.collections.getOne('users');

  // Check if name field already exists
  const hasName = col.fields.some((f: any) => f.name === 'name');
  if (hasName) {
    console.log('ℹ️  name field already exists');
  } else {
    const fields = [
      ...col.fields,
      { name: 'name', type: 'text', required: false, max: 150 }
    ];
    await pb.collections.update(col.id, { fields });
    console.log('✅ Added name field to users collection');
  }

  // Ensure Admins can update other users (for the admin UI), 
  // and each user can update themselves
  await pb.collections.update(col.id, {
    updateRule: '@request.auth.id != ""',
  });

  console.log('✅ updateRule set: any authenticated user can update user records');
  console.log('\n🎉 Done. User names will now persist in PocketBase across all browsers and devices.');
}

addNameFieldToUsers().catch(console.error);
