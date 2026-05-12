import requests

URL = "https://code-rafiki.pockethost.io"
EMAIL = "aturaerick@gmail.com"
PASSWORD = "dGY@SrzA86PQc5n"

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

# Add instance_name, billing_cycle to pocket_host_instances
col = requests.get(f"{URL}/api/collections/pocket_host_instances", headers=headers).json()
fields = col["fields"]
if not any(f["name"] == "instance_name" for f in fields):
    fields.append({"name": "instance_name", "type": "text"})
if not any(f["name"] == "billing_cycle" for f in fields):
    fields.append({"name": "billing_cycle", "type": "text"})
if not any(f["name"] == "server_location" for f in fields):
    fields.append({"name": "server_location", "type": "text"})

requests.patch(f"{URL}/api/collections/pocket_host_instances", headers=headers, json={"fields": fields})
