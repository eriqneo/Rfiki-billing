import PocketBase from 'pocketbase';

// Run this using: npx tsx scripts/pb-migrate.ts
// IMPORTANT: Replace the credentials below with your actual PocketBase Admin credentials before running!
const pb = new PocketBase('https://code-rafiki.pockethost.io');

async function migrate() {
  try {
    console.log('Authenticating with PocketBase...');
    // Replace with your real admin email and password for code-rafiki.pockethost.io
    await pb.collection('_superusers').authWithPassword('aturaerick@gmail.com', 'dGY@SrzA86PQc5n');
    console.log('Authentication successful!');
  } catch (error: any) {
    console.error('Failed to authenticate:', error.message);
    console.log(error);
    console.error('Did you replace the admin credentials in scripts/pb-migrate.ts?');
    process.exit(1);
  }

  const collections = [
    {
      name: 'clients',
      fields: [
        { name: 'node_id', type: 'text', required: true },
        { name: 'name', type: 'text', required: true },
        { name: 'entity_type', type: 'select', values: ['INDIVIDUAL', 'COMPANY'] },
        { name: 'email', type: 'email' },
        { name: 'phone', type: 'text' },
        { name: 'agreed_price', type: 'number' },
        { name: 'deposit_paid', type: 'bool' },
        { name: 'initial_meeting', type: 'text' },
        { name: 'target_payment', type: 'text' },
        { name: 'project_tag', type: 'text' },
        { name: 'app_built', type: 'text' },
        { name: 'project_desc', type: 'text' },
        { name: 'contact_json', type: 'json' },
        { name: 'notes', type: 'text' },
      ]
    },
    {
      name: 'payments',
      fields: [
        { name: 'client_id', type: 'text', required: true },
        { name: 'amount', type: 'number', required: true },
        { name: 'method', type: 'select', values: ['Cash', 'Mpesa', 'Bank'] },
        { name: 'status', type: 'select', values: ['pending', 'completed', 'failed'] },
        { name: 'date', type: 'text' },
        { name: 'transaction_id', type: 'text' },
        { name: 'idempotency_key', type: 'text' },
      ]
    },
    {
      name: 'expenses',
      fields: [
        { name: 'date', type: 'text', required: true },
        { name: 'category', type: 'text', required: true },
        { name: 'sub_tag', type: 'text' },
        { name: 'amount', type: 'number', required: true },
        { name: 'tax_amount', type: 'number' },
        { name: 'client_id', type: 'text' },
        { name: 'description', type: 'text' },
        { name: 'receipt_img', type: 'file' },
      ]
    },
    {
      name: 'agreements',
      fields: [
        { name: 'client_id', type: 'text', required: true },
        { name: 'client_name', type: 'text' },
        { name: 'project_details', type: 'text' },
        { name: 'file_path', type: 'text' },
        { name: 'signed_date', type: 'text' },
        { name: 'created_date', type: 'text' },
        { name: 'expiry_date', type: 'text' },
        { name: 'status', type: 'select', values: ['active', 'expired', 'pending'] },
      ]
    },
    {
      name: 'meetings',
      fields: [
        { name: 'google_id', type: 'text' },
        { name: 'gcal_link', type: 'url' },
        { name: 'client_id', type: 'text' },
        { name: 'summary', type: 'text', required: true },
        { name: 'description', type: 'text' },
        { name: 'minutes', type: 'text' },
        { name: 'start_time', type: 'text', required: true },
        { name: 'end_time', type: 'text', required: true },
        { name: 'location', type: 'text' },
        { name: 'type', type: 'select', values: ['Discovery', 'Agreement Signing', 'Payment Follow-up', 'Other'] },
      ]
    },
    {
      name: 'billing_promises',
      fields: [
        { name: 'amount_due', type: 'number', required: true },
        { name: 'due_date', type: 'text', required: true },
        { name: 'client_id', type: 'text', required: true },
        { name: 'payment_method', type: 'select', values: ['Mpesa', 'Bank', 'Cash'] },
        { name: 'status', type: 'select', values: ['fulfilled', 'pending', 'broken'] },
      ]
    },
    {
      name: 'team_members',
      fields: [
        { name: 'name', type: 'text', required: true },
        { name: 'email', type: 'email', required: true },
        { name: 'role', type: 'select', values: ['Admin', 'Editor', 'Viewer'] },
        { name: 'password_hash', type: 'text' },
        { name: 'must_change_password', type: 'bool' },
        { name: 'module_permissions', type: 'json' },
      ]
    },
    {
      name: 'business',
      fields: [
        { name: 'name', type: 'text', required: true },
        { name: 'till_number', type: 'text' },
        { name: 'currency', type: 'text' },
        { name: 'logo_base64', type: 'text' },
      ]
    },
    {
      name: 'pocket_host_instances',
      fields: [
        { name: 'instance_name', type: 'text', required: true },
        { name: 'client_id', type: 'text' },
        { name: 'monthly_fee', type: 'number' },
        { name: 'billing_cycle', type: 'select', values: ['monthly', 'quarterly', 'semi-annual', 'yearly'] },
        { name: 'status', type: 'select', values: ['active', 'suspended', 'trial'] },
        { name: 'created_at', type: 'text' },
        { name: 'next_billing_date', type: 'text' },
      ]
    },
  ];

  console.log('Starting migration...');
  for (const col of collections) {
    try {
      await pb.collections.create({ name: col.name, type: 'base', schema: col.fields });
      console.log(`✅ Created collection: ${col.name}`);
    } catch (e: any) {
      if (e.status === 400) {
        console.log(`⏭  Collection already exists (or schema conflict): ${col.name}`);
      } else {
        console.error(`❌ Failed to create ${col.name}:`, e.message);
      }
    }
  }

  console.log('\n🎉 PocketBase schema setup complete.');
}

migrate().catch(console.error);
