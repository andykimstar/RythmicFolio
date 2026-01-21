import pandas as pd
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

    def _get_financial_data(self, ticker, statement_type="income", freq="q"):
        """
        Fetch and transpose financial statements.
        statement_type: "income", "cash", or "balance"
        freq: "a" (annual) or "q" (quarterly)
        """
        try:
            mapping = {
                "income":  ticker.income_stmt if freq == 'a' else ticker.quarterly_income_stmt,
                "cash":    ticker.cashflow if freq == 'a' else ticker.quarterly_cashflow,
                "balance": ticker.balance_sheet if freq == 'a' else ticker.quarterly_balance_sheet
            }
            df = mapping.get(statement_type)
            # Transpose so index is dates
            return df.T.sort_index() if df is not None and not df.empty else pd.DataFrame()
        except:
            return pd.DataFrame()

    def _calc_growth(self, df, col_name, period_offset):
        """
        Calculate percentage growth.
        """
        try:
            if col_name not in df.columns:
                return "-"
            
            # Ensure we have date index sorted ascending
            series = df[col_name].dropna()
            
            if len(series) <= period_offset:
                return "-"
            
            curr = series.iloc[-1]
            prev = series.iloc[-(period_offset + 1)]
            
            if prev == 0 or prev is None or curr is None: 
                return "-"
            
            growth = ((curr - prev) / abs(prev)) * 100
            return round(growth, 2)
        except:
            return "-"

    def _get_dates(self, df, period_offset):
        """Helper to get the actual dates being compared."""
        try:
            if df.empty or len(df) <= period_offset:
                return None, None
            
            curr_date = df.index[-1].strftime('%Y-%m-%d')
            prev_date = df.index[-(period_offset + 1)].strftime('%Y-%m-%d')
            return curr_date, prev_date
        except:
            return None, None

    def get_statistics(self, symbol):
        """
        Fetch financial statistics (Growth metrics) for the UI.
        """
        try:
            ticker = yf.Ticker(symbol)
            if not ticker:
                return None

            # Fetch all needed dataframes
            q_income = self._get_financial_data(ticker, "income", "q")
            q_cash   = self._get_financial_data(ticker, "cash", "q")
            q_balance= self._get_financial_data(ticker, "balance", "q")
            
            a_income = self._get_financial_data(ticker, "income", "a")
            a_cash   = self._get_financial_data(ticker, "cash", "a")
            a_balance= self._get_financial_data(ticker, "balance", "a")

            # Mappings for yfinance fields
            # Note: Field names might vary by yfinance version/source. Using standard ones.
            # Revenue: "Total Revenue"
            # Net Income: "Net Income"
            # Expenses: "Total Expenses"
            # EBITDA: "EBITDA"
            # FCF: "Free Cash Flow"
            # Shares: "Ordinary Shares Number"

            # Offsets
            q_offset = 4 # Q vs Q-4 (YoY)
            a_offset = 1 # A vs A-1 (YoY)

            # Get Dates for validation
            q_curr_date, q_prev_date = self._get_dates(q_income, q_offset)
            a_curr_date, a_prev_date = self._get_dates(a_income, a_offset)
            
            # Print to console for server-side verification
            print(f"[{symbol}] Stats Calculation Dates:")
            print(f"  Annual:    {a_curr_date} vs {a_prev_date}")
            print(f"  Quarterly: {q_curr_date} vs {q_prev_date}")

            def get_chart_data(df, col):
                if df.empty or col not in df.columns:
                    return []
                # Return last 8 periods for charts
                series = df[col].dropna().tail(8)
                return [{"date": str(d.date()), "value": v} for d, v in series.items()]

            return {
                # Metadata
                "meta_annual_dates": f"{a_curr_date} vs {a_prev_date}",
                "meta_quarterly_dates": f"{q_curr_date} vs {q_prev_date}",

                # Charts Data
                "charts": {
                    "quarterly": {
                        "Revenue": get_chart_data(q_income, "Total Revenue"),
                        "NetIncome": get_chart_data(q_income, "Net Income"),
                        "Expenses": get_chart_data(q_income, "Total Expenses"),
                        "FreeCashFlow": get_chart_data(q_cash, "Free Cash Flow"),
                        "ShareOutstanding": get_chart_data(q_balance, "Ordinary Shares Number"),
                        "ROIC": []
                    },
                    "annual": {
                        "Revenue": get_chart_data(a_income, "Total Revenue"),
                        "NetIncome": get_chart_data(a_income, "Net Income"),
                        "Expenses": get_chart_data(a_income, "Total Expenses"),
                        "FreeCashFlow": get_chart_data(a_cash, "Free Cash Flow"),
                        "ShareOutstanding": get_chart_data(a_balance, "Ordinary Shares Number"),
                        "ROIC": []
                    }
                },

                # Quarterly YoY
                "QYoY_Revenue_Growth": self._calc_growth(q_income, "Total Revenue", q_offset),
                "QYoY_NetIncome_Growth": self._calc_growth(q_income, "Net Income", q_offset),
                "QYoY_Expense_Growth": self._calc_growth(q_income, "Total Expenses", q_offset),
                "QYoY_EBITDA_Growth": self._calc_growth(q_income, "EBITDA", q_offset),
                "QYoY_FreeCashFlow_Growth": self._calc_growth(q_cash, "Free Cash Flow", q_offset),
                "QYoY_OrdinarySharesNumber_Growth": self._calc_growth(q_balance, "Ordinary Shares Number", q_offset),
                
                # Annual YoY
                "AYoY_Revenue_Growth": self._calc_growth(a_income, "Total Revenue", a_offset),
                "AYoY_NetIncome_Growth": self._calc_growth(a_income, "Net Income", a_offset),
                "AYoY_Expense_Growth": self._calc_growth(a_income, "Total Expenses", a_offset),
                "AYoY_EBITDA_Growth": self._calc_growth(a_income, "EBITDA", a_offset),
                "AYoY_FreeCashFlow_Growth": self._calc_growth(a_cash, "Free Cash Flow", a_offset),
                "AYoY_OrdinarySharesNumber_Growth": self._calc_growth(a_balance, "Ordinary Shares Number", a_offset),
                
                # Use EBITDA growth as proxy for ROIC/check specific fields if needed
                "QYoY_ROIC_Growth": "-", 
                "AYoY_ROIC_Growth": "-"
            }

        except Exception as e:
            print(f"Error in get_statistics: {e}")
            return None

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
