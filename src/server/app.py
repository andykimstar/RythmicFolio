from flask import Flask, jsonify, request
from flask_cors import CORS
from flask_limiter import Limiter
from flask_limiter.util import get_remote_address
from werkzeug.middleware.proxy_fix import ProxyFix
import requests
import os
from dotenv import load_dotenv
from api_client import StockDataService
from firebase import db


# Load environment variables
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

# Initialize Rate Limiter
limiter = Limiter(
    get_remote_address,
    app=app,
    default_limits=["200 per day", "50 per hour"],
    storage_uri="memory://",
)

# Initialize the service
stock_service = StockDataService()
RECAPTCHA_SECRET_KEY = os.environ.get("RECAPTCHA_SECRET_KEY")

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
@limiter.limit("10 per minute")
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
        holdings_ref = db.collection('holdings')
        docs = holdings_ref.stream()
        
        holdings_list = []
        for doc in docs:
            data = doc.to_dict()
            symbol = doc.id # Assuming symbol is the document ID
            
            # Fetch live price for each holding
            quote = stock_service.get_stock_quote(symbol)
            if quote:
                data['current_price'] = quote['price']
                data['symbol'] = symbol
                # Calculate upside if target_price exists
                if 'target_price' in data:
                    try:
                        target = float(data['target_price'])
                        current = float(quote['price'])
                        upside = ((target - current) / current) * 100
                        data['upside'] = round(upside, 2)
                    except:
                        data['upside'] = "-"
                holdings_list.append(data)
            else:
                # If quote fails, still add with available data
                data['symbol'] = symbol
                data['current_price'] = "-"
                data['upside'] = "-"
                holdings_list.append(data)

        return jsonify(holdings_list)
    except Exception as e:
        print(f"Error fetching holdings: {e}")
        return jsonify({"error": str(e)}), 500

if __name__ == '__main__':

    port = int(os.environ.get("PORT", 5000))
    print(f"Starting Flask server on http://localhost:{port}")
    app.run(debug=True, host='0.0.0.0', port=port)
