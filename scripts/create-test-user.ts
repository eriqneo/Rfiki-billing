import 'dotenv/config';
import PocketBase from 'pocketbase';

const pb = new PocketBase('https://code-rafiki.pockethost.io');

async function createTestUser() {
  try {
    // 1. Authenticate as Admin first to have permission to create users
    // (Using the credentials you confirmed earlier)
    await pb.collection('_superusers').authWithPassword(process.env.POCKETBASE_ADMIN_EMAIL!, process.env.POCKETBASE_ADMIN_PASSWORD!);
    console.log('Admin authenticated.');

    // 2. Create a test user in the 'users' collection
    const data = {
      "username": "rafiki_admin",
      "email": "test@rafiki.app",
      "emailVisibility": true,
      "password": "password123",
      "passwordConfirm": "password123",
      "name": "Rafiki Pilot",
      "role": "Admin"
    };

    try {
      const record = await pb.collection('users').create(data);
      console.log('✅ Test user created successfully!');
      console.log('Email: test@rafiki.app');
      console.log('Password: password123');
    } catch (e: any) {
      if (e.status === 400) {
        console.log('⏭  Test user already exists.');
      } else {
        throw e;
      }
    }
  } catch (error: any) {
    console.error('Error:', error.message);
  }
}

createTestUser();
