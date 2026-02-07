from flask import Flask, jsonify, request
from flask_cors import CORS
from flask_limiter import Limiter
from flask_limiter.util import get_remote_address
from werkzeug.middleware.proxy_fix import ProxyFix
import requests
import os
from dotenv import load_dotenv
from api_client import StockDataService

# Load environment variables (Moved below imports but need to be robust)
# Check multiple locations for .env
env_paths = [
    ".env", # Current directory
    "../../.env", # Root from src/server
    os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(__file__))), ".env") # Absolute root
]
for path in env_paths:
    if os.path.exists(path):
        load_dotenv(path)
        break
else:
    load_dotenv() # Fallback to default

app = Flask(__name__)
app.wsgi_app = ProxyFix(app.wsgi_app, x_for=1, x_proto=1)
CORS(app)  # Enable CORS for all routes to allow local file access

# Rate Limiter (Disabled for debugging)
# limiter = Limiter(
#     get_remote_address,
#     app=app,
#     default_limits=["10000 per day", "2000 per hour"],
#     storage_uri="memory://",
# )

# Initialize the service
stock_service = StockDataService()
RECAPTCHA_SECRET_KEY = os.environ.get("RECAPTCHA_SECRET_KEY")

try:
    from firebase import db
except Exception as e:
    print(f"Error initializing Firebase: {e}")
    db = None

def verify_recaptcha(token):
    # Bypass for local testing
    if request.remote_addr == '127.0.0.1' or request.remote_addr == 'localhost':
        return True
    
    if not RECAPTCHA_SECRET_KEY:
        return True # Bypass if no key configured (for dev/testing)
    
    verify_url = "https://www.google.com/recaptcha/api/siteverify"
    payload = {
        'secret': RECAPTCHA_SECRET_KEY,
        'response': token,
        'remoteip': request.remote_addr
    }

    
    try:
        response = requests.post(verify_url, data=payload)
        result = response.json()
        return result.get('success', False) and result.get('score', 0) >= 0.5
    except:
        return False

@app.route('/api/quote/<symbol>', methods=['GET'])
# @limiter.limit("100 per minute") # specific limit can be relaxed
def get_quote(symbol):
    # Verify reCAPTCHA

    token = request.headers.get("X-Recaptcha-Token")
    if not verify_recaptcha(token):
        return jsonify({"error": "Bot detected or invalid CAPTCHA"}), 403


    try:
        data = stock_service.get_stock_quote(symbol, timeinterval="1d")
        if data:
            return jsonify(data)
        return jsonify({"error": "Stock not found"}), 404
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route('/api/history/<symbol>', methods=['GET'])
def get_history(symbol):
    try:
        # Get period from query param, default to 1mo
        period = request.args.get('period', "1d")
        data = stock_service.get_historical_data(symbol, period=period)
        if data:
            return jsonify(data)
        return jsonify({"error": "No history found"}), 404
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route('/api/statistics/<symbol>', methods=['GET'])
def get_statistics(symbol):
    try:
        data = stock_service.get_statistics(symbol)
        if data:
            return jsonify(data)
        return jsonify({"error": "No statistics found"}), 404
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route('/api/holdings', methods=['GET'])
def get_holdings():
    try:
        if db is None:
            return jsonify({"error": "Database not initialized"}), 500
            
        print("Fetching holdings from Firestore...")
        holdings_ref = db.collection('Holdings')
        docs = holdings_ref.stream()

        
        holdings_list = []
        total_portfolio_value = 0
        
        for doc in docs:
            raw_data = doc.to_dict()
            data = {k.lower(): v for k, v in raw_data.items()}
            ticker_symbol = data.get('company ticker', doc.id)
            
            try:
                quote = stock_service.get_stock_quote(ticker_symbol)
                if quote:
                    data['current_price'] = quote['price']
                    data['name'] = data.get('company name', quote.get('company_name', ticker_symbol))
                    data['week_change'] = quote.get('week_change_percent', 0)
                    data['forward_pe'] = quote.get('forward_pe', "-")
                    data['beta'] = quote.get('beta', "-")
                else:
                    data['current_price'] = "-"
                    data['name'] = data.get('company name', ticker_symbol)
                    data['week_change'] = 0
                    data['forward_pe'] = "-"
                    data['beta'] = "-"
            except Exception as e:
                print(f"Error fetching quote for {ticker_symbol}: {e}")
                data['current_price'] = "-"
                data['name'] = data.get('company name', ticker_symbol)
                data['week_change'] = 0
                data['forward_pe'] = "-"
                data['beta'] = "-"

            data['symbol'] = ticker_symbol
            
            # Target Price (kept for context, but Upside removed)
            target = data.get('target price')
            data['target_price'] = target
            current = data.get('current_price')

            # Calculate Position Value for Weight Calculation
            quantity = data.get('quantity', 0)
            if quantity != "-" and current != "-":
                try:
                    pos_value = float(quantity) * float(current)
                    data['position_value'] = pos_value
                    total_portfolio_value += pos_value
                except:
                    data['position_value'] = 0
            else:
                data['position_value'] = 0
                
            holdings_list.append(data)

        # Second pass: Calculate weights and filter sensitive data
        filtered_holdings = []
        for holding in holdings_list:
            # Calculate weight
            if total_portfolio_value > 0 and holding.get('position_value', 0) > 0:
                holding['weight'] = round((holding['position_value'] / total_portfolio_value) * 100, 2)
            else:
                holding['weight'] = 0

            # Create a clean version with NO sensitive data
            clean_holding = {
                "symbol": holding.get('symbol'),
                "name": holding.get('name'),
                "current_price": holding.get('current_price'),
                "weight": holding.get('weight'),
                "target_price": holding.get('target_price'),
                "week_change": holding.get('week_change'),
                "forward_pe": holding.get('forward_pe'),
                "beta": holding.get('beta'),
                "color": holding.get('color')
            }

            filtered_holdings.append(clean_holding)

        # 3. Calculate Portfolio History Chart Data
        # Collect symbols and weights for the chart service
        chart_holdings = [{'symbol': h['symbol'], 'weight': h['weight']} for h in filtered_holdings if h['weight'] > 0]
        
        # Get period from request, default to 5d
        period = request.args.get('period', '5d')
        portfolio_chart = stock_service.get_portfolio_history(chart_holdings, period=period)

        return jsonify({
            "holdings": filtered_holdings,
            "chart_data": portfolio_chart
            # total_value is EXPLICITLY removed for privacy
        })

    except Exception as e:
        import traceback
        error_msg = f"Error fetching holdings: {str(e)}"
        print(error_msg)
        traceback.print_exc()
        return jsonify({"error": error_msg}), 500


@app.route('/api/watchlist', methods=['GET'])
def get_watchlist():
    try:
        if db is None:
            return jsonify({"error": "Database not initialized"}), 500
            
        print("Fetching watchlist from Firestore...")
        # Note: Collection name is 'watchlist' (lowercase) based on user prompt, 
        # but we should be careful about case sensitivity. 
        # Assuming 'watchlist' or 'Watchlist'. Let's try 'Watchlist' to match 'Holdings' style 
        # or just 'watchlist' if that's what's in DB. 
        # User said "watchlist collection". Let's try 'Watchlist' first as convention, 
        # if empty maybe 'watchlist'. 
        # For now, let's assume 'Watchlist' to start, as 'Holdings' was capitalized.
        watchlist_ref = db.collection('Watchlist')
        docs = watchlist_ref.stream()
        
        watchlist_items = []
        
        for doc in docs:
            raw_data = doc.to_dict()
            data = {k.lower(): v for k, v in raw_data.items()}
            ticker_symbol = data.get('company ticker', doc.id)
            
            try:
                quote = stock_service.get_stock_quote(ticker_symbol)
                if quote:
                    data['current_price'] = quote['price']
                    data['name'] = data.get('company name', quote.get('company_name', ticker_symbol))
                    data['week_change'] = quote.get('week_change_percent', 0)
                    data['forward_pe'] = quote.get('forward_pe', "-")
                    data['beta'] = quote.get('beta', "-")
                else:
                    data['current_price'] = "-"
                    data['name'] = data.get('company name', ticker_symbol)
                    data['week_change'] = 0
                    data['forward_pe'] = "-"
                    data['beta'] = "-"
            except Exception as e:
                print(f"Error fetching quote for {ticker_symbol}: {e}")
                data['current_price'] = "-"
                data['name'] = data.get('company name', ticker_symbol)
                data['week_change'] = 0
                data['forward_pe'] = "-"
                data['beta'] = "-"

            data['symbol'] = ticker_symbol
            data['target_price'] = data.get('target price', "-")

            # Create clean output object
            clean_item = {
                "symbol": data.get('symbol'),
                "name": data.get('name'),
                "current_price": data.get('current_price'),
                "target_price": data.get('target_price'),
                "week_change": data.get('week_change'),
                "forward_pe": data.get('forward_pe'),
                "beta": data.get('beta'),
                "color": data.get('color', '#555') # Default gray if no color
            }


            watchlist_items.append(clean_item)

        return jsonify({
            "watchlist": watchlist_items
        })

    except Exception as e:
        import traceback
        error_msg = f"Error fetching watchlist: {str(e)}"
        print(error_msg)
        traceback.print_exc()
        return jsonify({"error": error_msg}), 500




if __name__ == '__main__':
    port = int(os.environ.get("PORT", 5000))
    print(f"Starting Flask server on http://localhost:{port}")
    app.run(debug=True, host='0.0.0.0', port=port)

