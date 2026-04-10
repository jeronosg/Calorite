# 🔥 Calorite

A lightweight, privacy-first calorie and nutrition tracker that runs entirely in the browser. No server, no account, no data ever leaves your device — everything is stored in `localStorage`.

---

## Features

### Daily Tracking
- Log meals with calories, protein, carbs, and fat
- Progress bars for each macro against your daily goals
- Water intake tracker (glass-by-glass)
- Navigate between days with the date arrows

### Multiple Ways to Add a Meal
| Method | How it works |
|---|---|
| **Manual Entry** | Type in the name and macro values yourself |
| **Ask AI** | Describe your meal in plain text — Gemini estimates the macros |
| **Photo** | Take or upload a photo of your meal — Gemini Vision estimates the macros |
| **Scan Barcode** | Camera scan or manual entry — looks up nutrition from Open Food Facts |
| **Meal Library** | Pick a saved meal template you've created |

### Meal Library
- Create reusable meal templates with saved macro values
- Quick-pick panel inside the Add Meal form auto-fills all fields
- One-tap **Log** button adds a saved meal directly to the day
- Full edit and delete support

### Weekly Insights
- **Streak** — consecutive days with at least one meal logged (glows when active)
- **Avg kcal/day** — average across past completed days (today excluded so partial logging doesn't skew results)
- **Days on target** — how many past days you stayed within your calorie goal
- **Avg protein** — weekly protein average

### Weight Tracker
- Log your weight in lbs or kg (one entry per day)
- Line chart of your last 10 entries
- Entries list with delete support
- Unit preference remembers your last logged unit

### Charts
- **Weekly Calories** bar chart — bars turn green on days you hit your goal
- **Today's Macros** donut chart — protein, carbs, fat breakdown with percentages

### Data Management
- **Export** — download all data as a JSON file
- **Import** — restore from a previously exported JSON file (merges with existing data)
- **Share via Link** — generates a compressed URL you can open on another device
- **Erase All** — permanently delete everything with a confirmation step

---

## Tech Stack

| Layer | Technology |
|---|---|
| **Frontend** | Vanilla HTML, CSS, JavaScript — no framework, no build step |
| **Charts** | [Chart.js 4.4.0](https://www.chartjs.org/) via CDN |
| **AI** | [Google Gemini API](https://aistudio.google.com/) — text and vision |
| **Barcode lookup** | Native `BarcodeDetector` API + [Open Food Facts](https://world.openfoodfacts.org/) (free, no key needed) |
| **Storage** | Browser `localStorage` |
| **Compression** | Native `CompressionStream` / `DecompressionStream` for share links |
| **Deployment** | Any static file host (GitHub Pages, DreamHost, Netlify, etc.) |

---

## Project Structure

```
Calorite/
├── index.html        # App shell — all HTML, modals, and script tags
├── css/
│   └── style.css     # Dark theme, layout, all component styles
├── js/
│   ├── storage.js    # All localStorage reads/writes and data helpers
│   ├── ai.js         # Gemini API integration (text + vision estimation)
│   ├── charts.js     # Chart.js wrappers (weekly bar, macro donut, weight line)
│   ├── barcode.js    # BarcodeDetector scanning + Open Food Facts lookup
│   └── app.js        # Main application logic and UI wiring
└── .htaccess         # Apache cache-control headers (for DreamHost/Apache hosts)
```

### localStorage Keys

| Key | Contents |
|---|---|
| `calorite_days` | Daily meal logs and water counts, keyed by `YYYY-MM-DD` |
| `calorite_goals` | Daily calorie and macro goals |
| `calorite_ai` | Gemini model selection and API key |
| `calorite_weight` | Weight log entries (date, value, unit) |
| `calorite_library` | Saved meal templates |

---

## Getting Started

### Running Locally

No build step required — just open the file:

```bash
git clone https://github.com/jeronosg/calorite.git
cd calorite
open index.html   # macOS
# or double-click index.html in your file explorer
```

### Deploying

Upload the entire folder to any static host. All paths are relative so no configuration is needed.

**Apache / DreamHost:** The included `.htaccess` sets `no-cache` headers on `.js` and `.css` files so browsers always fetch the latest version when you redeploy.

---

## AI Setup (Optional)

The AI estimation features require a free Google Gemini API key.

1. Go to [aistudio.google.com/apikey](https://aistudio.google.com/apikey) and create a key
2. Open Calorite → **Settings (⚙)** → **AI Provider** tab
3. Paste your key and choose a model

> Your API key is stored only in your browser's `localStorage` and is sent directly to Google's API. It never touches any other server.

### Available Models

| Model | Notes |
|---|---|
| `gemini-3-flash-preview` | Default — fast and accurate for food estimation |
| `gemini-2.0-flash` | Stable alternative |
| `gemini-1.5-flash` | Lightweight option |
| `gemini-1.5-pro` | Most capable, slower |

---

## Development Notes

### Adding a New Feature

1. **Data** — add storage functions to `js/storage.js` and export them in the `return {}` block
2. **UI** — add HTML to `index.html` (modals go in the `<!-- MODALS -->` section)
3. **Logic** — wire event listeners in `js/app.js` using the `$('id')` shorthand and null-guard pattern (`if ($('id')) { ... }`)
4. **Styles** — add CSS to `css/style.css`
5. **Version bump** — increment `?v=N` on all `<script>` and `<link>` tags in `index.html` to bust server cache on redeploy

### Coding Conventions

- `$('id')` is a shorthand for `document.getElementById('id')` defined at the top of `app.js`
- All dynamic element visibility uses `element.style.display` directly — never CSS class toggling — to avoid server cache issues
- Null-guard all event listeners that may not exist on the page: `if ($('btn-x')) { $('btn-x').addEventListener(...) }`
- Dates are stored and compared as `YYYY-MM-DD` strings via `Storage.dateKey(date)`
- All `render()` calls update the full page — individual section renderers (`renderSummary`, `renderMealList`, etc.) can be called independently when only part of the UI needs refreshing

---

## License

[MIT](LICENSE)
