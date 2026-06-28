# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Development

This is a **no-build, vanilla JS PWA** — no npm, no bundler, no transpilation. Files are served directly.

### Running locally

Camera requires HTTPS or `localhost`. Any of these work:

```bash
python -m http.server 8000
npx serve .
php -S localhost:8000
```

Open `http://localhost:8000`. There are no tests.

### Deployment

Push to `master` — GitHub Pages deploys automatically. Live at https://jorgen-simonsson.github.io/isbn-scanner/

## Architecture

The app is a single-page PWA with ES module imports. `index.html` loads Quagga and Tesseract from CDN as globals, then loads `js/app.js` as a module which boots the app.

**Module responsibilities:**

- `js/app.js` — Entry point: imports `ISBNScanner` and instantiates it on `DOMContentLoaded`
- `js/scanner.js` — `ISBNScanner` class: owns camera lifecycle, Quagga (barcode) and Tesseract (OCR) sessions, mode switching, and the book lookup loop
- `js/api-config.js` — `APIConfig`: ordered list of enabled book APIs; iterates them until first hit
- `js/book-apis.js` — `BookAPIs`: one entry per provider (Libris, Google Books, Open Library, OpenBD), each with a `search(isbn)` method
- `js/library-api.js` — `LibraryAPI`: talks to a private home library backend at a Tailscale URL (`sotehus-rugged.tail21137e.ts.net`); checks existence, fetches places, adds books
- `js/book-display.js` — `BookDisplay`: renders book card, checks library, manages the place-selector modal; persists last-used place to `localStorage`
- `js/history-manager.js` — `HistoryManager`: persists scan history to `localStorage`
- `js/isbn-utils.js` — Pure functions: `isValidISBN`, `validateISBN13`, `isValidISBN10`, `extractISBN` (OCR error correction included)
- `js/ui-manager.js` — `UIManager`: sets status messages and displays version
- `js/pwa-manager.js` — `PWAManager`: service worker registration and install prompt
- `js/version.js` — Exports `VERSION` string

**Service worker (`sw.js`):** Cache-first strategy for static assets; `CACHE_NAME` includes a version number — bump it when deploying changes that must bypass stale caches. API calls to googleapis.com and openlibrary.org bypass the cache.

**Book lookup flow:** `ISBNScanner.lookupBook(isbn)` → `APIConfig.getEnabledAPIs()` → tries each in order (default: Libris → Google Books → Open Library → OpenBD) → first `result.found` wins → `BookDisplay.displayBook()` + `HistoryManager.save()`

## Key constraints

- **HTTPS required** for camera (`getUserMedia`) and service workers; `localhost`/`127.0.0.1` are exempt
- **Quagga and Tesseract are CDN globals** (`/* global Quagga, Tesseract */`) — not imported as modules
- **Library backend is private** (Tailscale network); `LibraryAPI` calls will fail gracefully outside that network — the UI shows a warning but doesn't block scanning
- When bumping the app version, update both `js/version.js` (`VERSION`) and the `CACHE_NAME` in `sw.js`
