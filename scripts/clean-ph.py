import os
import requests

URL = "https://code-rafiki.pockethost.io"
EMAIL = os.environ["POCKETBASE_ADMIN_EMAIL"]
PASSWORD = os.environ["POCKETBASE_ADMIN_PASSWORD"]

def get_token():
    for _ in range(5):
        try:
            resp = requests.post(f"{URL}/api/collections/_superusers/auth-with-password", json={"identity": EMAIL, "password": PASSWORD})
            if resp.status_code == 200:
                return resp.json()["token"]
        except:
            pass
    return None

token = get_token()
headers = {"Authorization": token, "Content-Type": "application/json"}

r = requests.get(f"{URL}/api/collections/pocket_host_instances/records?perPage=1000", headers=headers).json()
items = r.get("items", [])

to_delete = []
seen_names = set()

for i in items:
    name = i.get("instance_name") or i.get("name") or ""
    if not name:
        to_delete.append(i["id"]) # completely blank
    else:
        if name in seen_names:
            to_delete.append(i["id"]) # duplicate
        else:
            seen_names.add(name)

print(f"Deleting {len(to_delete)} duplicate/blank records...")

for count, pid in enumerate(to_delete):
    requests.delete(f"{URL}/api/collections/pocket_host_instances/records/{pid}", headers=headers)
    if count % 50 == 0:
        print(f"Deleted {count}/{len(to_delete)}")

print("Done cleaning!")
