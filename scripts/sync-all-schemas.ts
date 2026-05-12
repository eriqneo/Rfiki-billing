import 'dotenv/config';
import PocketBase from 'pocketbase';

const pb = new PocketBase('https://code-rafiki.pockethost.io');

async function syncAllSchemas() {
  await pb.collection('_superusers').authWithPassword(process.env.POCKETBASE_ADMIN_EMAIL!, process.env.POCKETBASE_ADMIN_PASSWORD!);

  const schemas = {
    clients: [
      { name: 'node_id', type: 'text' },
      { name: 'name', type: 'text' },
      { name: 'entity_type', type: 'text' },
      { name: 'email', type: 'text' },
      { name: 'phone', type: 'text' },
      { name: 'agreed_price', type: 'number' },
      { name: 'deposit_paid', type: 'bool' },
      { name: 'initial_meeting', type: 'text' },
      { name: 'target_payment', type: 'text' },
      { name: 'project_tag', type: 'text' },
      { name: 'app_built', type: 'text' },
      { name: 'project_desc', type: 'text' },
      { name: 'contact_json', type: 'json' },
      { name: 'notes', type: 'text' }
    ],
    agreements: [
      { name: 'client_id', type: 'text' },
      { name: 'client_name', type: 'text' },
      { name: 'project_details', type: 'text' },
      { name: 'file_path', type: 'text' },
      { name: 'signed_date', type: 'text' },
      { name: 'created_date', type: 'text' },
      { name: 'expiry_date', type: 'text' },
      { name: 'status', type: 'text' }
    ],
    payments: [
      { name: 'client_id', type: 'text' },
      { name: 'amount', type: 'number' },
      { name: 'method', type: 'text' },
      { name: 'status', type: 'text' },
      { name: 'date', type: 'text' },
      { name: 'transaction_id', type: 'text' },
      { name: 'idempotency_key', type: 'text' }
    ],
    expenses: [
      { name: 'description', type: 'text' },
      { name: 'amount', type: 'number' },
      { name: 'tax_amount', type: 'number' },
      { name: 'category', type: 'text' },
      { name: 'sub_tag', type: 'text' },
      { name: 'client_id', type: 'text' },
      { name: 'date', type: 'text' }
    ],
    pocket_host_instances: [
      { name: 'name', type: 'text' },
      { name: 'url', type: 'text' },
      { name: 'client_id', type: 'text' },
      { name: 'monthly_fee', type: 'number' },
      { name: 'status', type: 'text' },
      { name: 'renewal_date', type: 'text' }
    ],
    billing_promises: [
      { name: 'client_id', type: 'text' },
      { name: 'amount', type: 'number' },
      { name: 'due_date', type: 'text' },
      { name: 'notes', type: 'text' },
      { name: 'status', type: 'text' },
      { name: 'created_at', type: 'text' }
    ]
  };

  for (const [colName, fieldsToEnsure] of Object.entries(schemas)) {
    try {
      const col = await pb.collections.getOne(colName);
      const existingNames = new Set(col.fields.map((f: any) => f.name));
      let changed = false;
      
      const newFields = [...col.fields];
      
      for (const f of fieldsToEnsure) {
        if (!existingNames.has(f.name)) {
          newFields.push(f as any);
          changed = true;
        }
      }

      if (changed) {
        await pb.collections.update(col.id, { fields: newFields });
        console.log(`✅ Updated schema for ${colName}`);
      } else {
        console.log(`ℹ️ Schema already up to date for ${colName}`);
      }
    } catch (e: any) {
      console.error(`❌ Failed to update ${colName}:`, e.response || e);
    }
  }
}

syncAllSchemas().catch(console.error);
