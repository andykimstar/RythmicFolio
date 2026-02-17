import requests
import json

def check_api():
    urls = [
        "https://rythmicfolio.web.app/api/quote/AAPL",
        "https://rythmicfolio.web.app/api/earnings/AAPL",
        "https://rythmicfolio.web.app/api/recommendation/AAPL",
        "https://rythmicfolio.web.app/api/calendar/AAPL"
    ]
    
    for url in urls:
        print(f"\nChecking: {url}")
        try:
            r = requests.get(url)
            print(f"Status: {r.status_code}")
            if r.status_code == 200:
                data = r.json()
                if "quote" in url:
                    targets = {k: data.get(k) for k in ["target_low", "target_median", "target_high", "target_mean"]}
                    print(f"Target Prices: {targets}")
                elif "earnings" in url:
                    print(f"Earnings records: {len(data)}")
                elif "recommendation" in url:
                    print(f"Rec records: {len(data)}")
                elif "calendar" in url:
                     print(f"Calendar events: {list(data.keys())}")
        except Exception as e:
            print(f"Error: {e}")

if __name__ == "__main__":
    check_api()
