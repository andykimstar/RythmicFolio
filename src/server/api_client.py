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
            if pd.isna(growth):
                return "-"
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
                series = df[col].dropna()
                # Further filter out any NaN values that might have survived or been introduced
                data = [{"date": str(d.date()), "value": v} for d, v in series.tail(8).items() if not pd.isna(v)]
                return data

            # Helper for Margin (EBIT / Revenue)
            def get_margin_data(df):
                try:
                    s = (df["EBIT"] / df["Total Revenue"]) * 100
                    return [{"date": str(d.date()), "value": v} for d, v in s.dropna().tail(8).items() if not pd.isna(v)]
                except: return []

            def get_margin_growth(df, offset):
                try:
                    s = df["EBIT"] / df["Total Revenue"]
                    if s.empty or len(s) <= offset: return "-"
                    curr = s.iloc[-1]; prev = s.iloc[-(offset+1)]
                    if not prev: return "-"
                    res = ((curr - prev) / abs(prev)) * 100
                    if pd.isna(res): return "-"
                    return round(res, 2)
                except: return "-"

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
                        "OperatingMargin": get_margin_data(q_income)
                    },
                    "annual": {
                        "Revenue": get_chart_data(a_income, "Total Revenue"),
                        "NetIncome": get_chart_data(a_income, "Net Income"),
                        "Expenses": get_chart_data(a_income, "Total Expenses"),
                        "FreeCashFlow": get_chart_data(a_cash, "Free Cash Flow"),
                        "ShareOutstanding": get_chart_data(a_balance, "Ordinary Shares Number"),
                        "OperatingMargin": get_margin_data(a_income)
                    }
                },

                # Quarterly YoY
                "QYoY_Revenue_Growth": self._calc_growth(q_income, "Total Revenue", q_offset),
                "QYoY_NetIncome_Growth": self._calc_growth(q_income, "Net Income", q_offset),
                "QYoY_Expense_Growth": self._calc_growth(q_income, "Total Expenses", q_offset),
                "QYoY_EBITDA_Growth": self._calc_growth(q_income, "EBITDA", q_offset),
                "QYoY_FreeCashFlow_Growth": self._calc_growth(q_cash, "Free Cash Flow", q_offset),
                "QYoY_OrdinarySharesNumber_Growth": self._calc_growth(q_balance, "Ordinary Shares Number", q_offset),
                "QYoY_OperatingMargin_Growth": get_margin_growth(q_income, q_offset),
                
                # Annual YoY
                "AYoY_Revenue_Growth": self._calc_growth(a_income, "Total Revenue", a_offset),
                "AYoY_NetIncome_Growth": self._calc_growth(a_income, "Net Income", a_offset),
                "AYoY_Expense_Growth": self._calc_growth(a_income, "Total Expenses", a_offset),
                "AYoY_EBITDA_Growth": self._calc_growth(a_income, "EBITDA", a_offset),
                "AYoY_FreeCashFlow_Growth": self._calc_growth(a_cash, "Free Cash Flow", a_offset),
                "AYoY_OrdinarySharesNumber_Growth": self._calc_growth(a_balance, "Ordinary Shares Number", a_offset),
                "AYoY_OperatingMargin_Growth": get_margin_growth(a_income, a_offset)
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
            
            # Fetch 1 week of history to calculate weekly change
            data = ticker.history(period="1wk")
            
            if data.empty:
                print(f"yfinance returned no data for {symbol}.")
                return None

            # last_quote is today, first_quote is the start of the week
            last_quote = data.iloc[-1]
            first_quote = data.iloc[0]
            
            # Safely fetch metadata from ticker.info
            company_name = self._get_info(ticker, 'longName', default=symbol.upper())
            live_price = self._get_info(ticker, 'regularMarketPrice', default=0)
            
            # If live_price is 0 or failed, fallback to the last close from history
            if live_price == 0:
                live_price = float(last_quote['Close'])

            # Calculate 1-week change
            week_start_price = float(first_quote['Close'])
            week_change = live_price - week_start_price
            week_change_percent = (week_change / week_start_price) * 100 if week_start_price else 0

            mkt_cap = self._get_info(ticker, 'marketCap', default='-')
            forward_pe = self._get_info(ticker, 'forwardPE', default=None)
            trailing_pe = self._get_info(ticker, 'trailingPE', default=None)
            
            # Use trailing PE as the primary "PE Ratio", fallback to forward if trailing is missing
            pe_ratio = trailing_pe if trailing_pe else forward_pe
            if pe_ratio is None: pe_ratio = '-'

            if forward_pe is None: forward_pe = '-' # Reset to dash for display if still None

            trail_eps = self._get_info(ticker, 'trailingEps', default='-')
            beta = self._get_info(ticker, 'beta', default='-')

            # Analyst Price Targets
            target_low = self._get_info(ticker, 'targetLowPrice', default=None)
            target_median = self._get_info(ticker, 'targetMedianPrice', default=None)
            target_high = self._get_info(ticker, 'targetHighPrice', default=None)
            target_mean = self._get_info(ticker, 'targetMeanPrice', default=None)

            open_price = float(last_quote['Open'])
            
            # Calculate daily change
            change = live_price - open_price
            change_percent = (change / open_price) * 100 if open_price else 0
            
            # Safe extraction helper with rounding
            def safe_round(val, decimals=2):
                if isinstance(val, (int, float)):
                    if pd.isna(val): return "-"
                    return round(val, decimals)
                try:
                    fval = float(val)
                    if pd.isna(fval): return "-"
                    return round(fval, decimals)
                except (ValueError, TypeError):
                    return val

            return {
                "symbol": symbol.upper(),   
                "company_name": company_name,
                "price": safe_round(live_price),
                "change": safe_round(change),
                "change_percent": f"{safe_round(change_percent)}%",
                "week_change_percent": safe_round(week_change_percent),
                "volume": int(last_quote['Volume']),

                "open": safe_round(open_price),
                "close": safe_round(float(last_quote['Close'])),
                "high": safe_round(float(last_quote['High'])),
                "low": safe_round(float(last_quote['Low'])),
                "dividends": safe_round(float(last_quote['Dividends'])),
                "market_cap": mkt_cap,
                "forward_pe": safe_round(forward_pe),
                "pe_ratio": safe_round(pe_ratio), # Explicitly return pe_ratio for frontend
                "eps": safe_round(trail_eps),
                "beta": safe_round(beta),
                
                "target_low": safe_round(target_low),
                "target_median": safe_round(target_median),
                "target_high": safe_round(target_high),
                "target_mean": safe_round(target_mean),

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
            interval = "1d" # default
            if period == "1d":
                interval = "5m" # More granular for 1 day
            elif period == "5d":
                interval = "15m"
            elif period == "1mo":
                interval = "1d" # Daily is cleaner for 1 month
                
            history = ticker.history(period=period, interval=interval)
            
            if history.empty:
               print(f"yfinance returned no history for {symbol}.")
               return []

            # Format data for chart consumption
            chart_data = []
            for date, row in history.iterrows():
                # Format date depending on interval
                # If interval is minutes/hours, include time. Otherwise date only.
                if "m" in interval or "h" in interval:
                     date_str = date.strftime('%Y-%m-%d %H:%M')
                else:
                     date_str = date.strftime('%Y-%m-%d')

                chart_data.append({
                    "date": date_str,
                    "close": round(row['Close'], 2),
                    "volume": int(row['Volume'])
                })
            return chart_data
            
        except Exception as e:
            print(f"Error fetching historical data for {symbol}: {e}")
            return []

    def get_earnings(self, symbol):
        """
        Fetch earnings history for a given symbol.
        """
        try:
            ticker = yf.Ticker(symbol)
            
            # Try earnings_history property first (legacy/compat)
            df = None
            try:
                df = ticker.earnings_history
            except:
                pass

            # Fallback to earnings_dates (newer yfinance)
            if df is None or df.empty:
                try:
                    df = ticker.earnings_dates
                    if df is not None and not df.empty:
                        # Only take past dates for history? 
                        # Actually earnings_dates includes future. 
                        # We can filter or let frontend handle.
                        # But frontend expects historical list.
                        # Sorting by date descending usually.
                        pass
                except:
                    pass

            if df is not None and not df.empty:
                # Convert index (dates) to string and columns to dict
                df = df.reset_index()
                
                # Standardize Date Column
                # Could be 'index' (from reset_index on named index), 'Date', 'Earnings Date'
                date_col = None
                for col in df.columns:
                    c_lower = str(col).lower()
                    if 'date' in c_lower or col == 'index':
                        date_col = col
                        break
                
                if date_col:
                    df = df.rename(columns={date_col: 'date'})
                else:
                    # Fallback: assume first column is date if it looks like it
                    df = df.rename(columns={df.columns[0]: 'date'})

                # Rename columns to match frontend expectations camelCase
                # Standard yfinance columns: "EPS Estimate", "Reported EPS", "Surprise(%)"
                rename_map = {
                    'EPS Estimate': 'epsEstimate',
                    'Reported EPS': 'epsActual',
                    'Surprise(%)': 'surprise',
                    'Surprise': 'surprise'
                }
                df = df.rename(columns=rename_map)

                # Filter: Only keep rows with Actual EPS (History)
                if 'epsActual' in df.columns:
                    df = df[df['epsActual'].notna()]

                # Format Date
                if 'date' in df.columns:
                    if pd.api.types.is_datetime64_any_dtype(df['date']):
                        df['date'] = df['date'].dt.strftime('%Y-%m-%d')
                
                # Filter rows where epsActual is present (for history chart)
                # But frontend handles future/past. 
                # Ideally we return all. 
                # Note: valid records should have at least epsEstimate or epsActual
                
                # Replace NaN with None for JSON serialization
                df = df.where(pd.notnull(df), None)

                return df.to_dict(orient='records')
            return []
        except Exception as e:
            print(f"Error fetching earnings for {symbol}: {e}")
            return []

    def get_calendar(self, symbol):
        """
        Fetch calendar events for a given symbol.
        """
        try:
            ticker = yf.Ticker(symbol)
            cal = ticker.calendar
            if cal is not None:
                # Calendar can be a dict or a DataFrame depending on yfinance version
                if isinstance(cal, pd.DataFrame):
                    df = cal.copy()
                    # Format index if it's dates
                    if pd.api.types.is_datetime64_any_dtype(df.index):
                        df.index = df.index.strftime('%Y-%m-%d')
                    # Format all datetime columns
                    for col in df.columns:
                        if pd.api.types.is_datetime64_any_dtype(df[col]):
                            df[col] = df[col].dt.strftime('%Y-%m-%d')
                    return df.to_dict()
                
                # If it's a dict, handle datetime objects
                if isinstance(cal, dict):
                    serializable_cal = {}
                    for k, v in cal.items():
                        if isinstance(v, list):
                            new_list = []
                            for item in v:
                                if hasattr(item, 'strftime'):
                                    new_list.append(item.strftime('%Y-%m-%d'))
                                else:
                                    new_list.append(item)
                            serializable_cal[k] = new_list
                        elif hasattr(v, 'strftime'):
                            serializable_cal[k] = v.strftime('%Y-%m-%d')
                        else:
                            serializable_cal[k] = v
                    return serializable_cal
            return {}
        except Exception as e:
            print(f"Error fetching calendar for {symbol}: {e}")
            return {}

    def get_recommendation(self, symbol):
        """
        Fetch recommendations summary for a given symbol.
        """
        try:
            ticker = yf.Ticker(symbol)
            df = ticker.recommendations_summary
            if df is not None and not df.empty:
                # Ensure we handle any potential datetime objects
                df = df.reset_index()
                if 'index' in df.columns:
                    # If index was just row numbers, we can drop it
                    if df['index'].dtype == 'int64':
                        df = df.drop(columns=['index'])
                    else:
                        df = df.rename(columns={'index': 'date'})
                
                for col in df.columns:
                    if pd.api.types.is_datetime64_any_dtype(df[col]):
                        df[col] = df[col].dt.strftime('%Y-%m-%d')
                        
                return df.to_dict(orient='records')
            return []
        except Exception as e:
            print(f"Error fetching recommendation for {symbol}: {e}")
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

    def get_portfolio_history(self, holdings, period="5d"):
        """
        Calculate the normalized weighted performance of the portfolio over the specified period.
        holdings: List of dicts with 'symbol' and 'weight' (0-100).
        period: Timeframe (1d, 5d, 1mo, 3mo, 6mo, ytd, 1y).
        """
        try:
            # 1. Determine Interval
            interval = "1d"
            date_format = '%Y-%m-%d'
            
            if period == "1d":
                interval = "5m"
                date_format = '%Y-%m-%d %H:%M'
            elif period == "5d":
                interval = "15m"
                date_format = '%Y-%m-%d %H:%M'
            
            # 2. Fetch history for all symbols
            series_list = []
            
            for h in holdings:
                sym = h['symbol']
                weight = h['weight']
                ticker = yf.Ticker(sym)
                df = ticker.history(period=period, interval=interval)
                
                if not df.empty:
                    # Normalize to % change from start
                    start_price = df['Close'].iloc[0]
                    # Avoid division by zero
                    if start_price == 0: start_price = 1

                    # calculate percent change series
                    pct_series = ((df['Close'] - start_price) / start_price) * 100
                    
                    # Apply weight immediately
                    weighted_series = pct_series * (weight / 100.0)
                    weighted_series.name = sym
                    series_list.append(weighted_series)

            if not series_list:
                return []

            # 3. Align Dates using Pandas (robust concat)
            # Concatenate all series on the index (Date)
            portfolio_df = pd.concat(series_list, axis=1)
            
            # Forward fill missing data (if one stock has a gap but others don't)
            # Then backward fill for any start gaps
            portfolio_df = portfolio_df.ffill().bfill()
            
            # Sum rows to get total weighted return
            portfolio_df['total_return'] = portfolio_df.sum(axis=1)
            
            # 4. Convert to list of dicts
            portfolio_data = []
            for date, val in portfolio_df['total_return'].items():
                portfolio_data.append({
                    "date": date.strftime(date_format),
                    "value": round(val, 2)
                })

            return portfolio_data

        except Exception as e:
            print(f"Error calculating portfolio history: {e}")
            return []

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

    # Test New Methods
    print("\n--- Fetching Earnings for NVDA ---")
    earnings = service.get_earnings("NVDA")
    print(f"Fetched {len(earnings)} earnings records")
    if earnings: print(json.dumps(earnings[:2], indent=2))

    print("\n--- Fetching Calendar for MSFT ---")
    calendar = service.get_calendar("MSFT")
    print(json.dumps(calendar, indent=2))

    print("\n--- Fetching Recommendations for GOOGL ---")
    recs = service.get_recommendation("GOOGL")
    if recs: print(json.dumps(recs[:2], indent=2))
