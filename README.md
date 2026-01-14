# Avalanche Archiver & Dashboard

A comprehensive, automated archive for avalanche bulletins, weather data, snow profiles, and incident reports for the **Allgäu and Kleinwalsertal** regions.

---

## 🤖 Automation

The site is updated automatically **3 times per day** (06:00, 14:00, 18:00 CET) via GitHub Actions.

### Workflow: `daily-fetch.yml`
1.  **Fetch Data**: Runs `npm run fetch:all`, which executes a sequence of scripts:
    *   `fetch_daily.js`: Downloads latest avalanche bulletins (PDFs and JSON).
    *   `fetch_weather.js`: Retreives raw telemetry from local weather stations.
    *   `fetch_weather_report.js`: Archives the daily text weather report.
    *   `fetch_lawis_incidents.js`: Scrapes Lawis.at for new incident reports and images.
    *   `process_profiles.js`: Fetches wide-range snow profile data.
    *   `enrich_profiles.js`: **Translates** comments (German -> English) using Google Cloud API and parses stability tests.
2.  **Build Site**: Runs `npm run build` to generate static HTML pages.
3.  **Deploy**: Commits changes to the `master` branch, triggering a GitHub Pages deployment.

### Secrets
*   `GCP_TRANSLATE_KEY`: Required for translating avalanche problems and profile comments.

---

## 🗺️ Site Overview

### 1. **Archive Home (`/index.html`)**
The main dashboard providing a snapshot of the current status:
*   **Latest Bulletin**: Quick links to today's Allgäu/Kleinwalsertal reports.
*   **Recent Incidents**: Cards showing accidents within the last 72 hours.
*   **Latest Profiles**: A grid of snow profiles from the last 2 days.

### 2. **Snow Depth Map (`/snow-depth/index.html`)**
An interactive dashboard visualization of raw station data:
*   **Interactive Map**: Markers for all tracking stations. Clicking a marker shows a "Pin" with the station name and a link to its data.
*   **Data Cards**: Detailed 48-hour charts for Snow Height (HS), Air Temp from stations like *Warth*, *Fellhorn*, *Nebelhorn*, and *Ifen*.

### 3. **Snow Profiles (`/archive/profiles/index.html`)**
A dedicated feed of recent snow pits from Lawis.at:
*   **Smart Parsing**: Automatically extracts Snow Height (HS) even if not explicitly labeled.
*   **Stability Tests**: Visualizes ECT/CT results with colour-coded tags (Green for "No Fracture", Red for "Propagation").
*   **Translation**: Automatically translates observer comments into English.
*   **Map Integration**: View profile locations on an interactive relief map.

### 4. **Incidents (`/archive/incidents/`)**
A permanent record of avalanche accidents:
*   **Context**: Each report includes relevant weather history (charts) and nearby snow profiles from the time of the incident.
*   **PDF Archive**: Links to the official avalanche bulletin from that specific day.
*   **Translation**: Description text is translated to English.

### 5. **Weather Archive (`/archive/weather/`)**
A chronological text archive of daily mountain weather reports.

---

## 🛠️ Local Development

1.  **Install**: `npm install`
2.  **Configuration**: Create a `.env` file with your keys:
    ```env
    GOOGLE_TRANSLATE_KEY=your_key_here
    ```
3.  **Fetch Data**: `npm run fetch:all`
4.  **Build**: `npm run build`
5.  **Serve**: `npm run serve` (runs at `http://localhost:3000`)
