# Signal Capture Chrome Extension

A universal Chrome extension for capturing web content to FlowWink, MyCMS, or any compatible AI-powered CMS with signal-ingest capabilities.

## Features

### ⚡ Command Palette
- **Floating ⚡ button** on every page (bottom-right)
- **Keyboard shortcut**: `⌘⇧S` (Mac) / `Ctrl+Shift+S` (Windows)
- **Auto-detects** source: LinkedIn, X/Twitter, GitHub, Reddit, YouTube, web
- **Three actions**: Send Signal, Save as Draft, Bookmark
- **Selection-aware** — captures selected text, or falls back to main content
- **No DOM dependency** — works everywhere, never breaks

### 🔌 Remote Scraping
Admin panels can send messages to the extension via `externally_connectable`:
- `ping` — check extension is installed
- `scrape_active_tab` — grab content from current tab
- `navigate_and_scrape` — open URL in background tab, scrape, close

### 🎯 Multi-Project Support
- **Quick presets** for FlowWink and MyCMS
- **Custom configuration** for any compatible CMS
- **Project name** displayed in success messages

## Setup

### 1. Install Extension

1. Open Chrome and navigate to `chrome://extensions/`
2. Enable **Developer mode** (toggle in top-right)
3. Click **Load unpacked**
4. Select the `chrome-extension/` folder

### 2. Configure Settings

1. Click the extension icon in Chrome toolbar
2. Choose a preset (FlowWink or MyCMS) or enter custom endpoint
3. Enter your **Signal Ingest Token** from your CMS admin panel:
   - **FlowWink**: Admin → Settings → API Tokens
   - **MyCMS**: Admin → Settings → API Tokens
4. Click **Save Settings**

### 3. Get Your Token

#### FlowWink
1. Log into your FlowWink admin panel
2. Go to **Settings** → **API Tokens**
3. Find or generate **Signal Ingest Token**
4. Copy the token

#### MyCMS
1. Log into your MyCMS admin panel
2. Go to **Settings** → **API Tokens**
3. Find or generate **Signal Ingest Token**
4. Copy the token

## Usage

### Quick Capture
1. Navigate to any webpage
2. Press `⌘⇧S` (Mac) or `Ctrl+Shift+S` (Windows)
3. Or click the ⚡ button in bottom-right corner
4. Choose an action:
   - **Send Signal** — Capture for AI autopilot processing
   - **Save as Draft** — Create a content draft
   - **Bookmark** — Save to agent memory
5. Add an optional note
6. Done! Content is sent to your CMS

### Selection Mode
- Select text on any page before opening the palette
- The ⚡ button turns blue when text is selected
- Only the selected text will be captured (instead of full page)

## API Compatibility

This extension works with any CMS that implements the signal-ingest API:

### Endpoint
```
POST /functions/v1/signal-ingest
```

### Headers
```
Authorization: Bearer YOUR_TOKEN
Content-Type: application/json
```

### Request Body
```json
{
  "url": "https://example.com/article",
  "title": "Article Title",
  "content": "Article content or selected text...",
  "note": "Optional user note",
  "source_type": "web" | "linkedin" | "x" | "github" | "reddit" | "youtube"
}
```

### Response
```json
{
  "ok": true,
  "id": "uuid"
}
```

## Supported Platforms

### FlowWink
- Signals stored in `agent_activity` + `agent_memory`
- Processed by FlowPilot autonomous agent
- Token stored in `site_settings` table

### MyCMS
- Signals stored in `agent_tasks`
- Processed by autopilot system
- Token stored in `modules` table

### Custom CMS
Any CMS can be compatible by implementing the signal-ingest endpoint with the API contract above.

## Development

### File Structure
```
chrome-extension/
├── manifest.json          # Extension manifest (Manifest V3)
├── background.js          # Service worker for commands and messaging
├── content-global.js      # Content script injected on all pages
├── popup.html            # Settings popup UI
├── popup.js              # Settings popup logic
├── icons/                # Extension icons (16x16, 48x48, 128x128)
└── README.md             # This file
```

### Testing
1. Make changes to extension files
2. Go to `chrome://extensions/`
3. Click **Reload** button on the extension card
4. Test on any webpage

### Adding Icons
Place PNG icons in the `icons/` folder:
- `icon16.png` — 16x16 pixels (toolbar)
- `icon48.png` — 48x48 pixels (extension management)
- `icon128.png` — 128x128 pixels (Chrome Web Store)

## Keyboard Shortcuts

- `⌘⇧S` (Mac) / `Ctrl+Shift+S` (Windows) — Toggle palette
- `Esc` — Close palette

## Privacy

- Extension only activates when you trigger it
- No automatic tracking or data collection
- Content only sent when you explicitly capture it
- Token stored locally in Chrome storage
- No external analytics or telemetry

## Troubleshooting

### Extension not appearing
- Ensure Developer mode is enabled in `chrome://extensions/`
- Check that the extension is enabled (toggle switch)
- Reload the extension after making changes

### "Configure extension settings first" error
- Click extension icon and enter your endpoint + token
- Make sure token is correct (copy from admin panel)

### Network errors
- Check that your endpoint URL is correct
- Verify your CMS is running and accessible
- Check browser console for detailed error messages

### Keyboard shortcut not working
- Check if another extension is using `⌘⇧S` / `Ctrl+Shift+S`
- Go to `chrome://extensions/shortcuts` to customize

## License

Same as parent project (FlowWink/MyCMS)

## Support

For issues or questions:
- FlowWink: [GitHub Issues](https://github.com/magnusfroste/flowwink/issues)
- MyCMS: [GitHub Issues](https://github.com/magnusfroste/mycms-space/issues)
