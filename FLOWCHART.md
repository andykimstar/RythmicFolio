# System Flowchart

```mermaid
sequenceDiagram
    participant User
    participant Browser as Browser (chart.html + app.js)
    participant Server as Flask Server (server.py)
    participant API as Stock Scraper (api_client.py)
    participant YF as Yahoo Finance

    User->>Browser: Enters Symbol (e.g. "AAPL") & Clicks Search
    Browser->>Server: GET /api/history/AAPL?period=1mo
    activate Server
    Server->>API: get_historical_data("AAPL")
    activate API
    API->>YF: Fetch Market Data
    YF-->>API: Return Historical Prices
    API-->>Server: Return Formatted List
    deactivate API
    Server-->>Browser: JSON Response (Dates & Close Prices)
    deactivate Server
    Browser->>Browser: Update Chart.js Instance
    Browser-->>User: Visual Graph Renders
```

## Component Interaction

1.  **User Interface**: The user interacts with the input field in `chart.html`.
2.  **Client Logic**: `app.js` listens for the click event and initiates an asynchronous `fetch` request.
3.  **Web Server**: `server.py` receives the request, handles CORS headers, and routes it to the specific API function.
4.  **Data Service**: `api_client.py` abstracts the complexity of `yfinance`. It converts the raw DataFrame into a simple list of dictionaries.
5.  **External Source**: `yfinance` connects to Yahoo's servers to pull the latest market data.
