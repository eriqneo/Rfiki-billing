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

# Get users
users = requests.get(f"{URL}/api/collections/users/records", headers=headers).json().get("items", [])
admin = next((u for u in users if u["email"] == "admin@rafiki.app"), None)

if admin:
    print(f"Found admin ID {admin['id']}, resetting password to admin123")
    r = requests.patch(f"{URL}/api/collections/users/records/{admin['id']}", headers=headers, json={"password": "admin123", "passwordConfirm": "admin123"})
    print("Result:", r.status_code, r.text)
else:
    print("admin@rafiki.app not found")
