
import sys
import os
import json

# Add the src/server directory to the python path so we can import the modules
sys.path.append(os.path.join(os.getcwd(), 'src', 'server'))

from api_client import StockDataService

def test_earnings_fetch():
    client = StockDataService()
    symbol = "AAPL"
    
    print(f"Fetching earnings for {symbol}...")
    try:
        earnings = client.get_earnings(symbol)
        
        with open("earnings_debug_output.txt", "w") as f:
            f.write(f"Result Type: {type(earnings)}\n")
            f.write(f"Result Length: {len(earnings)}\n")
            if earnings:
                f.write(f"First record keys: {list(earnings[0].keys())}\n")
                f.write(f"First record: {earnings[0]}\n")
            else:
                f.write("No earnings data returned.\n")
                
        print("Debug output written to earnings_debug_output.txt")
        
    except Exception as e:
        print(f"Error: {e}")

if __name__ == "__main__":
    test_earnings_fetch()
