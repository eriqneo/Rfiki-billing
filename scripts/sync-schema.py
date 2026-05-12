import requests
import json
import time

URL = "https://code-rafiki.pockethost.io"
EMAIL = "aturaerick@gmail.com"
PASSWORD = "dGY@SrzA86PQc5n"

def get_token():
    for _ in range(5):
        try:
            resp = requests.post(f"{URL}/api/collections/_superusers/auth-with-password", json={"identity": EMAIL, "password": PASSWORD})
            if resp.status_code == 200:
                return resp.json()["token"]
        except Exception as e:
            time.sleep(2)
    raise Exception("Failed to get token")

token = get_token()
headers = {"Authorization": token, "Content-Type": "application/json"}

schemas = {
    "clients": [
      { "name": "node_id", "type": "text" },
      { "name": "name", "type": "text" },
      { "name": "entity_type", "type": "text" },
      { "name": "email", "type": "text" },
      { "name": "phone", "type": "text" },
      { "name": "agreed_price", "type": "number" },
      { "name": "deposit_paid", "type": "bool" },
      { "name": "initial_meeting", "type": "text" },
      { "name": "target_payment", "type": "text" },
      { "name": "project_tag", "type": "text" },
      { "name": "app_built", "type": "text" },
      { "name": "project_desc", "type": "text" },
      { "name": "contact_json", "type": "json" },
      { "name": "notes", "type": "text" }
    ],
    "agreements": [
      { "name": "client_id", "type": "text" },
      { "name": "client_name", "type": "text" },
      { "name": "project_details", "type": "text" },
      { "name": "file_path", "type": "text" },
      { "name": "signed_date", "type": "text" },
      { "name": "created_date", "type": "text" },
      { "name": "expiry_date", "type": "text" },
      { "name": "status", "type": "text" }
    ],
    "payments": [
      { "name": "client_id", "type": "text" },
      { "name": "amount", "type": "number" },
      { "name": "method", "type": "text" },
      { "name": "status", "type": "text" },
      { "name": "date", "type": "text" },
      { "name": "transaction_id", "type": "text" },
      { "name": "idempotency_key", "type": "text" }
    ],
    "expenses": [
      { "name": "description", "type": "text" },
      { "name": "amount", "type": "number" },
      { "name": "tax_amount", "type": "number" },
      { "name": "category", "type": "text" },
      { "name": "sub_tag", "type": "text" },
      { "name": "client_id", "type": "text" },
      { "name": "date", "type": "text" }
    ],
    "pocket_host_instances": [
      { "name": "name", "type": "text" },
      { "name": "url", "type": "text" },
      { "name": "client_id", "type": "text" },
      { "name": "monthly_fee", "type": "number" },
      { "name": "status", "type": "text" },
      { "name": "renewal_date", "type": "text" }
    ],
    "billing_promises": [
      { "name": "client_id", "type": "text" },
      { "name": "amount", "type": "number" },
      { "name": "due_date", "type": "text" },
      { "name": "notes", "type": "text" },
      { "name": "status", "type": "text" },
      { "name": "created_at", "type": "text" }
    ]
}

def sync():
    collections = requests.get(f"{URL}/api/collections?perPage=500", headers=headers).json()["items"]
    for col_name, fields in schemas.items():
        col = next((c for c in collections if c["name"] == col_name), None)
        if not col:
            print(f"Collection {col_name} not found")
            continue
        
        existing_names = {f["name"] for f in col.get("fields", [])}
        changed = False
        new_fields = col.get("fields", [])
        
        for f in fields:
            if f["name"] not in existing_names:
                new_fields.append(f)
                changed = True
                
        if changed:
            resp = requests.patch(f"{URL}/api/collections/{col['id']}", headers=headers, json={"fields": new_fields})
            if resp.status_code == 200:
                print(f"✅ Updated schema for {col_name}")
            else:
                print(f"❌ Failed to update {col_name}: {resp.text}")
        else:
            print(f"ℹ️ Schema already up to date for {col_name}")

sync()
