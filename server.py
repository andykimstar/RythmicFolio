from flask import Flask, jsonify, request
from flask_cors import CORS
from api_client import StockDataService

app = Flask(__name__)
CORS(app)  # Enable CORS for all routes to allow local file access

# Initialize the service
stock_service = StockDataService()

@app.route('/api/quote/<symbol>', methods=['GET'])
def get_quote(symbol):
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

if __name__ == '__main__':
    print("Starting Flask server on http://localhost:5000")
    app.run(debug=True, port=5000)
