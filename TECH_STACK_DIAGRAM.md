# Tech Stack Architecture

```mermaid
graph TD
    subgraph Frontend [Frontend Layer]
        HTML[HTML5 Structure]
        CSS[CSS3 Dark Mode]
        JS[JavaScript ES6+]
        ChartJS[Chart.js Library]
        
        HTML --> CSS
        HTML --> JS
        JS --> ChartJS
    end

    subgraph Backend [Backend Layer]
        Flask[Flask Web Server]
        CORS[Flask-CORS]
        PyService[StockDataService Class]
        
        Flask --> CORS
        Flask --> PyService
    end

    subgraph Data [Data Layer]
        YF[yfinance Library]
        Yahoo[Yahoo Finance API]
        
        PyService --> YF
        YF --> Yahoo
    end

    %% Communication
    JS -- "HTTP GET /api/history" --> Flask
    Flask -- "JSON Response" --> JS
```

## Description
*   **Frontend**: Runs in the browser. Uses Vanilla JS to fetch data and Chart.js to render it.
*   **Backend**: Runs locally on port 5000. Flask handles the routing and CORS headers.
*   **Data**: Python logic (`api_client.py`) uses `yfinance` to strip and format data effectively for the UI.
