
import requests
import json

url = "https://rythmicfolio.web.app/api/earnings/AAPL"
try:
    print(f"Fetching from {url}...")
    response = requests.get(url, timeout=10)
    print(f"Status Code: {response.status_code}")
    
    if response.status_code == 200:
        data = response.json()
        print(f"Data type: {type(data)}")
        if isinstance(data, list):
            print(f"Count: {len(data)}")
            if len(data) > 0:
                print("First record:")
                print(data[0])
                print("Keys:", list(data[0].keys()))
            else:
                print("Empty list returned.")
        else:
            print("Data returned is not a list:", data)
    else:
        print("Error fetching data:", response.text)

except Exception as e:
    print(f"Request failed: {e}")
