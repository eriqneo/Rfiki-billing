import 'dotenv/config';
import PocketBase from 'pocketbase';

const pb = new PocketBase('https://code-rafiki.pockethost.io');

async function patchUsersSchema() {
  try {
    await pb.collection('_superusers').authWithPassword(process.env.POCKETBASE_ADMIN_EMAIL!, process.env.POCKETBASE_ADMIN_PASSWORD!);
    console.log('Admin authenticated.');

    // 1. Add custom fields to the 'users' auth collection
    // Using the 'fields+' operator to append fields safely
    await pb.collections.update('users', {
      fields: [
        // We have to include the existing default fields or use 'fields+' if supported
        // But 'fields' is safer if we know what we are doing.
        // Actually, let's try 'fields+' first as it's cleaner for PB 0.23+
        { name: 'role', type: 'select', values: ['Admin', 'Editor', 'Viewer'] },
        { name: 'module_permissions', type: 'json' }
      ]
    });
    console.log('✅ Users collection schema updated.');

    // 2. Update the test user
    const testUser = await pb.collection('users').getFirstListItem('email="test@rafiki.app"');
    await pb.collection('users').update(testUser.id, {
      role: 'Admin',
      module_permissions: []
    });
    console.log('✅ Test user updated to Admin role.');

  } catch (error: any) {
    console.error('Error:', error.message);
    if (error.data) console.log(JSON.stringify(error.data, null, 2));
  }
}

patchUsersSchema();
