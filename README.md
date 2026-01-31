# ISBN Scanner PWA

A Progressive Web App (PWA) that scans ISBN barcodes and text using your mobile device's camera, then looks up book information from multiple library APIs.

**Live Demo:** [https://jorgen-simonsson.github.io/isbn-scanner/](https://jorgen-simonsson.github.io/isbn-scanner/)

## Features

### 📷 Dual Scanning Modes

- **Barcode Scan** - Real-time barcode scanning using the device camera. Supports EAN-13, EAN-8, and Code-128 formats commonly used for ISBN barcodes.
- **Text OCR** - Optical Character Recognition for scanning printed ISBN numbers directly from book covers or copyright pages. Useful when barcodes are damaged or unavailable.

### 🔍 Smart ISBN Extraction

The OCR mode includes intelligent ISBN extraction that can:
- Find ISBN-10 and ISBN-13 numbers in messy OCR text
- Handle common OCR errors (O→0, l→1, etc.)
- Extract ISBNs even when surrounded by other text
- Validate ISBN checksums

### 📚 Multi-Source Book Lookup

Book information is retrieved from multiple APIs in order (first successful match wins):

1. **Libris (KB)** - Swedish National Library catalog (primary source)
2. **Google Books** - Extensive international coverage with cover images
3. **Open Library** - Open-source book database
4. **OpenBD** - Japanese book database

### 📱 PWA Capabilities

- **Installable** - Add to home screen on mobile devices
- **Offline Support** - Core app functionality cached for offline use
- **Responsive Design** - Optimized for mobile devices
- **Camera Access** - Native camera integration via WebRTC

### � Install on iPhone

To add the app to your iPhone home screen:

1. Open **Safari** and navigate to the app URL
2. Tap the **Share** button (square with arrow pointing up) at the bottom of the screen
3. Scroll down and tap **"Add to Home Screen"**
4. Give the app a name (or keep "ISBN Scanner") and tap **"Add"**

The app will now appear on your home screen like a native app, with its own icon and full-screen experience.

> **Note:** This only works in Safari. Other browsers on iOS (Chrome, Firefox) do not support adding PWAs to the home screen.

### �📖 Book Information Retrieved

- Title
- Author(s)
- Publisher
- Publication date
- Page count
- Description
- Cover image (when available)
- Language

### 📜 Scan History

Recent scans are saved locally and displayed for quick reference.

## Technology Stack

### Frontend
- **HTML5** - Semantic markup with PWA meta tags
- **CSS3** - Responsive design, mobile-first approach
- **Vanilla JavaScript** - No framework dependencies, ES6+ features

### Libraries
- **[QuaggaJS 2](https://github.com/ericblade/quagga2)** (v1.8.4) - Real-time barcode scanning library
- **[Tesseract.js](https://tesseract.ocr.js/)** (v5) - OCR engine compiled to WebAssembly

### APIs
| API | Coverage | Documentation |
|-----|----------|---------------|
| Libris | Swedish books | [libris.kb.se](https://libris.kb.se/) |
| Google Books | International | [developers.google.com/books](https://developers.google.com/books) |
| Open Library | International | [openlibrary.org/developers](https://openlibrary.org/developers/api) |
| OpenBD | Japanese books | [openbd.jp](https://openbd.jp/) |

### PWA Features
- **Service Worker** - Caches static assets for offline access
- **Web App Manifest** - Enables "Add to Home Screen" functionality
- **HTTPS** - Required for camera access and PWA features

### Hosting
- **GitHub Pages** - Static site hosting with HTTPS

## Project Structure

```
isbn-scanner/
├── index.html              # Main HTML file
├── styles.css              # Responsive styles
├── sw.js                   # Service worker
├── manifest.json           # PWA manifest
├── js/                     # JavaScript modules
│   ├── app.js              # Entry point - imports and initializes
│   ├── scanner.js          # Main ISBNScanner class (camera, barcode/OCR scanning)
│   ├── ui-manager.js       # UI status messages and version display
│   ├── book-display.js     # Book info display and library place selection
│   ├── history-manager.js  # Scan history persistence and display
│   ├── pwa-manager.js      # Service worker and install prompt handling
│   ├── library-api.js      # Local library API integration
│   ├── book-apis.js        # Book API providers (Libris, Google, etc.)
│   ├── api-config.js       # API search order configuration
│   ├── isbn-utils.js       # ISBN validation and extraction utilities
│   └── version.js          # App version constant
└── icons/                  # App icons (SVG)
    ├── icon-72.svg
    ├── icon-96.svg
    ├── icon-128.svg
    ├── icon-144.svg
    ├── icon-152.svg
    ├── icon-192.svg
    ├── icon-384.svg
    └── icon-512.svg
```

### Module Overview

| Module | Purpose |
|--------|---------|
| `js/app.js` | Entry point that imports all modules and initializes the app |
| `js/scanner.js` | Main `ISBNScanner` class handling camera initialization, barcode scanning (Quagga), and OCR (Tesseract) |
| `js/ui-manager.js` | `UIManager` class for status messages and version display in the UI |
| `js/book-display.js` | `BookDisplay` class for rendering book info, library status checks, and place selection modal with "last used place" memory |
| `js/history-manager.js` | `HistoryManager` class for persisting scan history to localStorage and displaying history list |
| `js/pwa-manager.js` | `PWAManager` class for service worker registration and handling the install prompt |
| `js/library-api.js` | `LibraryAPI` object for integration with local library backend |
| `js/book-apis.js` | `BookAPIs` object with providers (Libris, Google Books, Open Library, OpenBD) |
| `js/api-config.js` | `APIConfig` for managing API search order and adding custom providers |
| `js/isbn-utils.js` | Pure functions for ISBN validation (`isValidISBN`, `validateISBN13`, `isValidISBN10`) and OCR text extraction (`extractISBN`) |
| `js/version.js` | Exports `VERSION` constant for app versioning |

## Configuration

### Changing API Search Order

The API search order can be modified by importing `APIConfig`:

```javascript
import { APIConfig } from './js/api-config.js';

APIConfig.setSearchOrder(['googleBooks', 'libris', 'openLibrary', 'openBD']);
```

### Adding a Custom API Provider

```javascript
import { APIConfig } from './js/api-config.js';

APIConfig.addProvider('myAPI', {
    name: 'My Book API',
    async search(isbn) {
        const response = await fetch(`https://api.example.com/books/${isbn}`);
        const data = await response.json();
        
        if (data) {
            return {
                found: true,
                book: {
                    title: data.title,
                    authors: data.authors,
                    publisher: data.publisher,
                    // ... other fields
                }
            };
        }
        return { found: false };
    }
});
```

### Using ISBN Utilities Standalone

The ISBN validation functions can be imported and used independently:

```javascript
import { isValidISBN, validateISBN13, isValidISBN10, extractISBN } from './js/isbn-utils.js';

// Validate any ISBN (10 or 13)
isValidISBN('978-0-13-468599-1');  // true

// Validate ISBN-13 specifically
validateISBN13('9780134685991');   // true

// Validate ISBN-10 specifically  
isValidISBN10('0-13-468599-X');    // true

// Extract ISBN from OCR text
const isbn = extractISBN('Some text ISBN: 978-0-13-468599-1 more text');
```

## Development

### Prerequisites
- A web server (for local development with camera access)
- HTTPS (required for camera access on mobile)

### Local Development

```bash
# Using Python
python -m http.server 8000

# Using Node.js
npx serve .

# Using PHP
php -S localhost:8000
```

Note: Camera access requires HTTPS. For local development, `localhost` is treated as secure.

### Deployment

Push to the `master` branch to deploy to GitHub Pages automatically.

## Browser Support

- Chrome/Edge (Desktop & Mobile)
- Safari (iOS 11+)
- Firefox (Desktop & Mobile)

Requires:
- WebRTC (getUserMedia API)
- Service Workers
- ES6+ JavaScript

## License

MIT

## Acknowledgments

- [QuaggaJS](https://github.com/ericblade/quagga2) for barcode scanning
- [Tesseract.js](https://github.com/naptha/tesseract.js) for OCR capabilities
- [Libris/KB](https://libris.kb.se) for the Swedish National Library API
- [Google Books API](https://developers.google.com/books)
- [Open Library](https://openlibrary.org)
- [OpenBD](https://openbd.jp)
