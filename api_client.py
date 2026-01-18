import yfinance as yf
import json
from datetime import datetime

class StockDataService:
    def __init__(self):
        """
        Initialize the StockDataService using yfinance.
        """
        pass

    def _get_info(self, ticker, key, default='-'):
        """Safely extract a key from ticker.info."""
        try:
            val = ticker.info.get(key)
            if val is None:
                return default
            return val
        except:
            return default

    def get_stock_quote(self, symbol, timeinterval="1d"):
        """
        Fetch the real-time/latest quote for a given symbol.
        """
        try:
            ticker = yf.Ticker(symbol)
            
            # Fetch 5 days of history to ensure we have recent market data for open/close/high/low
            data = ticker.history(period="5d")
            
            if data.empty:
                print(f"yfinance returned no data for {symbol}.")
                return None

            # Get the last row (most recent trading data)
            last_quote = data.iloc[-1]
            
            # Safely fetch metadata from ticker.info
            company_name = self._get_info(ticker, 'longName', default=symbol.upper())
            live_price = self._get_info(ticker, 'regularMarketPrice', default=0)
            
            # If live_price is 0 or failed, fallback to the last close from history
            if live_price == 0:
                live_price = float(last_quote['Close'])

            mkt_cap = self._get_info(ticker, 'marketCap', default='-')
            trail_pe = self._get_info(ticker, 'trailingPE', default='-')
            trail_eps = self._get_info(ticker, 'trailingEps', default='-')
            beta = self._get_info(ticker, 'beta', default='-')

            open_price = float(last_quote['Open'])
            
            # Calculate change
            change = live_price - open_price
            change_percent = (change / open_price) * 100 if open_price else 0
            
            # Safe extraction helper with rounding
            def safe_round(val, decimals=2):
                if isinstance(val, (int, float)):
                    return round(val, decimals)
                try:
                    return round(float(val), decimals)
                except (ValueError, TypeError):
                    return val

            return {
                "symbol": symbol.upper(),   
                "company_name": company_name,
                "price": safe_round(live_price),
                "change": safe_round(change),
                "change_percent": f"{safe_round(change_percent)}%",
                "volume": int(last_quote['Volume']),
                "open": safe_round(open_price),
                "close": safe_round(float(last_quote['Close'])),
                "high": safe_round(float(last_quote['High'])),
                "low": safe_round(float(last_quote['Low'])),
                "dividends": safe_round(float(last_quote['Dividends'])),
                "market_cap": mkt_cap,
                "pe_ratio": safe_round(trail_pe),
                "eps": safe_round(trail_eps),
                "beta": safe_round(beta),
                "date": str(last_quote.name.date())
            }

        except Exception as e:
            print(f"Error fetching data for {symbol}: {e}")
            return None

    def get_historical_data(self, symbol, period="1mo"):
        """
        Fetch historical data for charting.
        """
        try:
            ticker = yf.Ticker(symbol)
            
            # Determine interval based on period
            interval = "1d"
            if period in ["1d", "5d"]:
                interval = "15m"
            elif period == "1mo":
                interval = "90m"
                
            history = ticker.history(period=period, interval=interval)
            
            if history.empty:
               print(f"yfinance returned no history for {symbol}.")
               return []

            # Format data for chart consumption
            chart_data = []
            for date, row in history.iterrows():
                # Format date depending on interval
                if interval in ["1d", "5d", "1wk", "1mo", "3mo"]:
                    date_str = date.strftime('%Y-%m-%d')
                else:
                    date_str = date.strftime('%Y-%m-%d %H:%M')

                chart_data.append({
                    "date": date_str,
                    "close": round(row['Close'], 2),
                    "volume": int(row['Volume'])
                })
            return chart_data
            
        except Exception as e:
            print(f"Error fetching historical data for {symbol}: {e}")
            return []

    def get_portfolio_snapshot(self, symbols):
        """
        Get snapshots for multiple symbols.
        """
        results = {}
        for symbol in symbols:
            data = self.get_stock_quote(symbol)
            if data:
                results[symbol] = data
        return results

if __name__ == "__main__":
    service = StockDataService()
    
    # Test Single Quote
    print("--- Fetching Quote for AAPL ---")
    quote = service.get_stock_quote("AAPL")
    print(json.dumps(quote, indent=2, default=str))
    
    # Test Historical Data
    print("\n--- Fetching 5 Day History for TSLA ---")
    history = service.get_historical_data("TSLA", period="5d")
    print(f"Fetched {len(history)} data points for TSLA")
