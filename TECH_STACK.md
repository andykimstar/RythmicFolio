# Tech Stack & Workflow

## Technology Stack

### Frontend (User Interface)
*   **HTML5**: Semantic structure for the Dashboard (`index.html`) and Charting interface (`chart.html`).
*   **CSS3**: Custom "Dark Mode" design system.
    *   **Variables**: Used for consistent color palettes (e.g., `--bg-app`, `--primary-color`).
    *   **Flexbox & Grid**: For responsive layout management.
    *   **No Frameworks**: Pure vanilla CSS for maximum control and performance.
*   **JavaScript (ES6+)**: Client-side logic to handle events and API communication.
*   **Chart.js**: External library (via CDN) used for rendering interactive, responsive stock price graphs.

### Backend (API & Data)
*   **Python 3**: Core programming language for data fetching.
*   **Flask**: Lightweight web server to create a REST API.
    *   **Flask-CORS**: Middleware to allow the frontend (running on `file://` or localhost) to communicate with the backend.
*   **yfinance**: Python library to fetch real-time and historical stock data from Yahoo Finance.

## Development Workflow

1.  **Design & Prototyping**
    *   Created a high-fidelity static dashboard (`index.html`) with a premium aesthetic.
    *   Defined a cohesive color story (Dark backgrounds with Green/Red financial accents).

2.  **Data Logic Implementation**
    *   Built `api_client.py` to handle `yfinance` calls.
    *   Implemented methods to fetch current quotes and historical data (1 month, 5 days, etc.).

3.  **API Layer Creation**
    *   Developed `server.py` using Flask to expose the Python logic to the web.
    *   Created endpoints:
        *   `GET /api/quote/<symbol>`: Returns current price info.
        *   `GET /api/history/<symbol>`: Returns historical data for charting.

4.  **Frontend Integration**
    *   Built `chart.html` as a dedicated analysis page.
    *   Wrote `app.js` to bridge the HTML UI and the Python Backend.
    *   Implemented `fetch()` calls to the Flask server (`http://localhost:5000`).
    *   Parsed the JSON response to populate the Chart.js dataset dynamically.

5.  **Usage Cycle**
    *   User enters a symbol (e.g., "TSLA") in `chart.html`.
    *   `app.js` sends a request to the local Flask server.
    *   `server.py` calls `yfinance` to get fresh data.
    *   Data flows back to the browser and updates the chart instantly.
