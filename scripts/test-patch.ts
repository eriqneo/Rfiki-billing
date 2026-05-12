import 'dotenv/config';
import PocketBase from 'pocketbase';

const pb = new PocketBase('https://code-rafiki.pockethost.io');

async function testPatch() {
  await pb.collection('_superusers').authWithPassword(process.env.POCKETBASE_ADMIN_EMAIL!, process.env.POCKETBASE_ADMIN_PASSWORD!);
  try {
    await pb.collection('business').update('uey1fjit1fww0ux', {
      name: 'Test Name',
      till_number: '12345',
      currency: 'USD',
      logo_base64: 'test_base64'
    });
    console.log('✅ Success');
  } catch (e: any) {
    console.error('❌ Failed:', e.response);
  }
}

testPatch().catch(console.error);
