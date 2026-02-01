from flask import Flask, jsonify, request
from flask_cors import CORS
from flask_limiter import Limiter
from flask_limiter.util import get_remote_address
from werkzeug.middleware.proxy_fix import ProxyFix
import requests
import os
from dotenv import load_dotenv
from api_client import StockDataService

# Load environment variables
load_dotenv()

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

if __name__ == '__main__':
    print("Starting Flask server on http://localhost:5000")
    app.run(debug=True, port=5000)
