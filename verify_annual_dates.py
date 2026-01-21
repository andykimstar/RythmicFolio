import yfinance as yf
import pandas as pd

def show_dates(symbol):
    print(f"\n[{symbol}] ANNUAL FINANCIAL DATES:")
    ticker = yf.Ticker(symbol)
    
    # Fetch Annual Income Statement
    df = ticker.income_stmt
    if df.empty:
        print("No annual data found.")
        return

    # Transpose to get dates as rows
    df_T = df.T.sort_index()
    
    # Show the dates
    print(df_T.index)
    
    if len(df_T) >= 2:
        current_date = df_T.index[-1].date()
        previous_date = df_T.index[-2].date()
        print(f"\nCalculation will compare:")
        print(f"Current Period:  {current_date}")
        print(f"Previous Period: {previous_date}")
        print(f"Type: Annual Fiscal Year (Not TTM)")
    else:
        print("Not enough data for comparison.")

show_dates("AAPL")
show_dates("NVDA")
