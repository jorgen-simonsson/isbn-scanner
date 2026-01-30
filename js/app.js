// ============================================
// ISBN Scanner PWA - Entry Point
// ============================================

import { ISBNScanner } from './scanner.js';

// Export modules for external access if needed
export { LibraryAPI } from './library-api.js';
export { BookAPIs } from './book-apis.js';
export { APIConfig } from './api-config.js';
export { isValidISBN, isValidISBN10, validateISBN13, extractISBN } from './isbn-utils.js';
export { ISBNScanner } from './scanner.js';

// Initialize app when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    new ISBNScanner();
});
