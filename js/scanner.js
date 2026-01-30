// ============================================
// ISBN Scanner PWA - Main Scanner Class
// ============================================

import { LibraryAPI } from './library-api.js';
import { APIConfig } from './api-config.js';
import { isValidISBN, isValidISBN10, extractISBN } from './isbn-utils.js';
import { VERSION } from './version.js';

export class ISBNScanner {
    constructor() {
        this.video = document.getElementById('video');
        this.canvas = document.getElementById('canvas');
        this.ctx = this.canvas.getContext('2d');
        this.captureBtn = document.getElementById('captureBtn');
        this.barcodeMode = document.getElementById('barcodeMode');
        this.textMode = document.getElementById('textMode');
        this.isbnInput = document.getElementById('isbnInput');
        this.searchBtn = document.getElementById('searchBtn');
        this.status = document.getElementById('status');
        this.results = document.getElementById('results');
        this.historyList = document.getElementById('historyList');
        
        this.currentMode = 'barcode';
        this.isScanning = false;
        this.stream = null;
        this.tesseractWorker = null;
        this.lastScannedISBN = null;
        this.scanCooldown = false;
        this.currentBookData = null;
        this.quaggaInitialized = false;
        
        this.init();
    }

    async init() {
        this.displayVersion();
        this.loadHistory();
        this.setupEventListeners();
        this.setupLibraryButton();
        
        // Check for camera support
        if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
            this.setStatus('Camera not supported on this device/browser', 'error');
            return;
        }
        
        // Check if running on HTTPS or localhost (required for camera)
        const isSecure = location.protocol === 'https:' || location.hostname === 'localhost' || location.hostname === '127.0.0.1';
        if (!isSecure) {
            this.setStatus('Camera requires HTTPS. Please use a secure connection.', 'error');
            return;
        }
        
        // Start in barcode mode - Quagga handles its own video
        if (this.currentMode === 'barcode') {
            await this.startBarcodeScanning();
        } else {
            await this.startCamera();
        }
        
        this.registerServiceWorker();
        this.setupInstallPrompt();
    }

    setupEventListeners() {
        this.captureBtn.addEventListener('click', () => this.captureForOCR());
        this.barcodeMode.addEventListener('click', () => this.setMode('barcode'));
        this.textMode.addEventListener('click', () => this.setMode('text'));
        this.searchBtn.addEventListener('click', () => this.manualSearch());
        this.isbnInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') this.manualSearch();
        });
    }

    async startCamera() {
        try {
            this.setStatus('Starting camera...', 'loading');
            
            // Stop any existing streams first
            if (this.stream) {
                this.stream.getTracks().forEach(track => track.stop());
                this.stream = null;
            }
            
            const constraints = {
                video: {
                    facingMode: { ideal: 'environment' },
                    width: { ideal: 1280 },
                    height: { ideal: 720 }
                },
                audio: false
            };
            
            this.stream = await navigator.mediaDevices.getUserMedia(constraints);
            this.video.srcObject = this.stream;
            this.video.style.display = 'block';
            
            // Wait for video to be ready
            await new Promise((resolve, reject) => {
                this.video.onloadedmetadata = () => {
                    this.canvas.width = this.video.videoWidth;
                    this.canvas.height = this.video.videoHeight;
                    resolve();
                };
                this.video.onerror = reject;
                setTimeout(() => resolve(), 5000); // Timeout fallback
            });
            
            await this.video.play();
            this.setStatus('Camera ready. Tap "Capture Text" to scan ISBN.', 'success');
        } catch (error) {
            console.error('Camera error:', error);
            let msg = 'Camera error: ' + error.message;
            if (error.name === 'NotAllowedError') {
                msg = 'Camera access denied. Please allow camera access in your browser settings and reload.';
            } else if (error.name === 'NotFoundError') {
                msg = 'No camera found on this device.';
            }
            this.setStatus(msg, 'error');
        }
    }

    async setMode(mode) {
        if (this.currentMode === mode) return;
        
        this.currentMode = mode;
        
        // Update UI
        this.barcodeMode.classList.toggle('active', mode === 'barcode');
        this.textMode.classList.toggle('active', mode === 'text');
        this.captureBtn.classList.toggle('hidden', mode === 'barcode');
        
        // Stop current scanning/camera
        await this.stopAllMedia();
        
        if (mode === 'barcode') {
            await this.startBarcodeScanning();
        } else {
            await this.startCamera();
        }
    }
    
    async stopAllMedia() {
        // Stop Quagga if running
        if (this.isScanning) {
            try {
                Quagga.stop();
            } catch (e) {
                console.log('Quagga stop:', e);
            }
            this.isScanning = false;
        }
        
        // Stop direct camera stream
        if (this.stream) {
            this.stream.getTracks().forEach(track => track.stop());
            this.stream = null;
        }
        
        // Clear video
        this.video.srcObject = null;
        this.video.style.display = 'block';
        
        // Remove any Quagga-created elements
        const quaggaVideo = this.video.parentElement.querySelector('video:not(#video)');
        if (quaggaVideo) quaggaVideo.remove();
        const quaggaCanvas = this.video.parentElement.querySelectorAll('canvas');
        quaggaCanvas.forEach(c => { if (c.id !== 'canvas') c.remove(); });
    }

    async startBarcodeScanning() {
        if (this.isScanning) return;
        
        // Check if Quagga is available
        if (typeof Quagga === 'undefined') {
            this.setStatus('Barcode scanner library not loaded. Try refreshing the page.', 'error');
            return false;
        }
        
        this.setStatus('Starting barcode scanner...', 'loading');
        
        // Hide the original video element - Quagga creates its own
        this.video.style.display = 'none';
        
        // Set up the onDetected handler only once
        if (!this.quaggaInitialized) {
            Quagga.onDetected((result) => {
                if (this.scanCooldown || !this.isScanning) return;
                
                const code = result.codeResult.code;
                console.log('Barcode detected:', code);
                
                // Check if it's a valid ISBN (10 or 13 digits starting with 978 or 979)
                if (isValidISBN(code)) {
                    this.scanCooldown = true;
                    this.lastScannedISBN = code;
                    
                    // Vibrate on successful scan
                    if (navigator.vibrate) {
                        navigator.vibrate(100);
                    }
                    
                    this.lookupBook(code);
                    
                    // Reset cooldown after 2 seconds
                    setTimeout(() => {
                        this.scanCooldown = false;
                    }, 2000);
                }
            });
            this.quaggaInitialized = true;
        }
        
        return new Promise((resolve) => {
            Quagga.init({
                inputStream: {
                    name: "Live",
                    type: "LiveStream",
                    target: this.video.parentElement, // Target container, not video
                    constraints: {
                        facingMode: "environment",
                        width: { min: 640, ideal: 1280, max: 1920 },
                        height: { min: 480, ideal: 720, max: 1080 }
                    }
                },
                decoder: {
                    readers: [
                        "ean_reader",
                        "ean_8_reader",
                        "code_128_reader"
                    ],
                    multiple: false
                },
                locate: true,
                locator: {
                    patchSize: "medium",
                    halfSample: true
                },
                frequency: 10
            }, (err) => {
                if (err) {
                    console.error('Quagga init error:', err);
                    this.setStatus('Barcode scanner failed: ' + (err.message || err) + '. Try Text OCR mode.', 'error');
                    this.video.style.display = 'block';
                    resolve(false);
                    return;
                }
                
                Quagga.start();
                this.isScanning = true;
                this.setStatus('Point camera at ISBN barcode', 'success');
                resolve(true);
            });
        });
    }

    async captureForOCR() {
        this.setStatus('<span class="spinner"></span>Processing image with OCR...', 'loading');
        
        // Capture frame from video
        this.ctx.drawImage(this.video, 0, 0, this.canvas.width, this.canvas.height);
        const imageData = this.canvas.toDataURL('image/png');
        
        try {
            // Initialize Tesseract worker if not already done
            if (!this.tesseractWorker) {
                this.tesseractWorker = await Tesseract.createWorker('eng');
            }
            
            const result = await this.tesseractWorker.recognize(imageData);
            const text = result.data.text;
            
            console.log('OCR Result:', text);
            
            // Extract ISBN from text
            const isbn = extractISBN(text);
            
            if (isbn) {
                this.setStatus(`Found ISBN: ${isbn}`, 'success');
                
                if (navigator.vibrate) {
                    navigator.vibrate(100);
                }
                
                this.lookupBook(isbn);
            } else {
                this.setStatus('No ISBN found in image. Try again with clearer text.', 'error');
            }
        } catch (error) {
            console.error('OCR error:', error);
            this.setStatus('OCR processing failed. Please try again.', 'error');
        }
    }

    async manualSearch() {
        const isbn = this.isbnInput.value.replace(/[\s\-]/g, '');
        
        if (!isbn) {
            this.setStatus('Please enter an ISBN', 'error');
            return;
        }
        
        if (!isValidISBN(isbn) && !isValidISBN10(isbn)) {
            this.setStatus('Invalid ISBN format', 'error');
            return;
        }
        
        this.lookupBook(isbn);
    }

    async lookupBook(isbn) {
        this.setStatus('<span class="spinner"></span>Looking up book...', 'loading');
        this.results.classList.add('hidden');
        
        const apis = APIConfig.getEnabledAPIs();
        
        for (const api of apis) {
            try {
                console.log(`Trying ${api.name}...`);
                this.setStatus(`<span class="spinner"></span>Searching ${api.name}...`, 'loading');
                
                const result = await api.search(isbn);
                
                if (result.found) {
                    console.log(`Found in ${api.name}:`, result.book);
                    this.displayBook(result.book, isbn, api.name);
                    this.saveToHistory(result.book, isbn);
                    this.setStatus(`Book found via ${api.name}!`, 'success');
                    return;
                }
            } catch (error) {
                console.error(`${api.name} error:`, error);
                // Continue to next API
            }
        }
        
        // No API found the book
        this.setStatus(`No book found for ISBN: ${isbn}`, 'error');
    }

    async displayBook(book, isbn, source = '') {
        document.getElementById('bookTitle').textContent = book.title || 'Unknown Title';
        document.getElementById('bookAuthors').textContent = book.authors?.join(', ') || 'Unknown Author';
        document.getElementById('bookPublisher').textContent = book.publisher ? `Publisher: ${book.publisher}` : '';
        document.getElementById('bookDate').textContent = book.publishedDate ? `Published: ${book.publishedDate}` : '';
        document.getElementById('bookISBN').textContent = `ISBN: ${isbn}`;
        document.getElementById('bookPages').textContent = book.pageCount ? `${book.pageCount} pages` : '';
        document.getElementById('bookDescription').textContent = book.description || 'No description available.';
        
        const coverImg = document.getElementById('bookCover');
        if (book.imageLinks?.thumbnail) {
            coverImg.src = book.imageLinks.thumbnail.replace('http:', 'https:');
            coverImg.classList.remove('hidden');
        } else if (book.imageLinks?.smallThumbnail) {
            coverImg.src = book.imageLinks.smallThumbnail.replace('http:', 'https:');
            coverImg.classList.remove('hidden');
        } else {
            coverImg.src = 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" width="128" height="192" viewBox="0 0 128 192"><rect fill="%23ddd" width="128" height="192"/><text fill="%23999" font-family="sans-serif" font-size="14" x="50%" y="50%" text-anchor="middle">No Cover</text></svg>';
        }
        
        this.results.classList.remove('hidden');
        this.results.scrollIntoView({ behavior: 'smooth' });
        
        // Check library and show add button
        await this.checkLibraryAndShowButton(book, isbn);
    }
    
    async checkLibraryAndShowButton(book, isbn) {
        const libraryStatus = document.getElementById('libraryStatus');
        const addToLibraryBtn = document.getElementById('addToLibraryBtn');
        
        // Reset state
        libraryStatus.textContent = 'Checking library...';
        libraryStatus.className = 'library-status checking';
        addToLibraryBtn.classList.add('hidden');
        
        // Store current book data for adding later
        this.currentBookData = { ...book, isbn };
        
        const result = await LibraryAPI.checkBookExists(isbn);
        
        if (result.exists) {
            libraryStatus.textContent = '✓ Already in your library';
            libraryStatus.className = 'library-status in-library';
            addToLibraryBtn.classList.add('hidden');
        } else {
            if (result.error) {
                libraryStatus.textContent = '⚠ Could not check library';
                libraryStatus.className = 'library-status error';
            } else {
                libraryStatus.textContent = 'Not in your library';
                libraryStatus.className = 'library-status not-in-library';
            }
            addToLibraryBtn.classList.remove('hidden');
        }
    }
    
    async addToLibrary() {
        const libraryStatus = document.getElementById('libraryStatus');
        
        if (!this.currentBookData) {
            libraryStatus.textContent = 'No book data available';
            libraryStatus.className = 'library-status error';
            return;
        }
        
        // Show place selector modal
        await this.showPlaceSelector();
    }
    
    async showPlaceSelector() {
        const modal = document.getElementById('placeSelectorModal');
        const placeSelect = document.getElementById('placeSelect');
        const placeLoading = document.getElementById('placeLoading');
        const placeError = document.getElementById('placeError');
        
        // Reset and show modal
        modal.classList.remove('hidden');
        placeSelect.classList.add('hidden');
        placeLoading.classList.remove('hidden');
        placeError.classList.add('hidden');
        placeSelect.innerHTML = '';
        
        // Fetch places
        const result = await LibraryAPI.getPlaces();
        placeLoading.classList.add('hidden');
        
        if (result.success && result.places.length > 0) {
            // Add default option
            const defaultOption = document.createElement('option');
            defaultOption.value = '';
            defaultOption.textContent = '-- Select a location --';
            placeSelect.appendChild(defaultOption);
            
            // Add places
            result.places.forEach(place => {
                const option = document.createElement('option');
                option.value = place.id;
                option.textContent = place.descr;
                placeSelect.appendChild(option);
            });
            
            placeSelect.classList.remove('hidden');
        } else if (result.places.length === 0) {
            placeError.textContent = 'No locations found. Add locations in your library first.';
            placeError.classList.remove('hidden');
        } else {
            placeError.textContent = result.error || 'Failed to load locations';
            placeError.classList.remove('hidden');
        }
    }
    
    hidePlaceSelector() {
        const modal = document.getElementById('placeSelectorModal');
        modal.classList.add('hidden');
    }
    
    async confirmAddToLibrary() {
        const placeSelect = document.getElementById('placeSelect');
        const addToLibraryBtn = document.getElementById('addToLibraryBtn');
        const libraryStatus = document.getElementById('libraryStatus');
        const confirmBtn = document.getElementById('confirmAddBtn');
        
        const selectedPlaceId = placeSelect.value ? parseInt(placeSelect.value) : null;
        
        // Disable confirm button and show loading
        confirmBtn.disabled = true;
        confirmBtn.textContent = 'Adding...';
        
        const result = await LibraryAPI.addBook(this.currentBookData, selectedPlaceId);
        
        // Hide modal
        this.hidePlaceSelector();
        
        // Reset confirm button
        confirmBtn.disabled = false;
        confirmBtn.textContent = 'Add Book';
        
        if (result.success) {
            libraryStatus.textContent = '✓ Added to your library!';
            libraryStatus.className = 'library-status in-library';
            addToLibraryBtn.classList.add('hidden');
            
            // Vibrate on success
            if (navigator.vibrate) {
                navigator.vibrate([100, 50, 100]);
            }
        } else {
            libraryStatus.textContent = `✗ Failed to add: ${result.error}`;
            libraryStatus.className = 'library-status error';
            addToLibraryBtn.disabled = false;
            addToLibraryBtn.textContent = '📚 Add to Library';
        }
    }

    saveToHistory(book, isbn) {
        let history = JSON.parse(localStorage.getItem('isbnHistory') || '[]');
        
        // Remove if already exists
        history = history.filter(item => item.isbn !== isbn);
        
        // Add to beginning
        history.unshift({
            isbn: isbn,
            title: book.title,
            cover: book.imageLinks?.thumbnail || book.imageLinks?.smallThumbnail,
            timestamp: Date.now()
        });
        
        // Keep only last 20 items
        history = history.slice(0, 20);
        
        localStorage.setItem('isbnHistory', JSON.stringify(history));
        this.loadHistory();
    }

    loadHistory() {
        const history = JSON.parse(localStorage.getItem('isbnHistory') || '[]');
        
        if (history.length === 0) {
            this.historyList.innerHTML = '<p style="color: #999; text-align: center;">No recent scans</p>';
            return;
        }
        
        this.historyList.innerHTML = history.map(item => `
            <div class="history-item" data-isbn="${item.isbn}">
                <img src="${item.cover || 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" width="40" height="60"><rect fill="%23ddd" width="40" height="60"/></svg>'}" alt="">
                <div class="info">
                    <div class="title">${item.title}</div>
                    <div class="isbn">${item.isbn}</div>
                </div>
            </div>
        `).join('');
        
        // Add click handlers
        this.historyList.querySelectorAll('.history-item').forEach(item => {
            item.addEventListener('click', () => {
                const isbn = item.dataset.isbn;
                this.isbnInput.value = isbn;
                this.lookupBook(isbn);
            });
        });
    }
    
    setupLibraryButton() {
        const addToLibraryBtn = document.getElementById('addToLibraryBtn');
        if (addToLibraryBtn) {
            addToLibraryBtn.addEventListener('click', () => this.addToLibrary());
        }
        
        // Setup modal buttons
        const cancelAddBtn = document.getElementById('cancelAddBtn');
        const confirmAddBtn = document.getElementById('confirmAddBtn');
        const modalBackdrop = document.querySelector('.modal-backdrop');
        
        if (cancelAddBtn) {
            cancelAddBtn.addEventListener('click', () => this.hidePlaceSelector());
        }
        if (confirmAddBtn) {
            confirmAddBtn.addEventListener('click', () => this.confirmAddToLibrary());
        }
        if (modalBackdrop) {
            modalBackdrop.addEventListener('click', () => this.hidePlaceSelector());
        }
    }

    displayVersion() {
        const versionEl = document.getElementById('appVersion');
        if (versionEl) {
            versionEl.textContent = `v${VERSION}`;
        }
    }

    setStatus(message, type = '') {
        this.status.innerHTML = message;
        this.status.className = 'status ' + type;
    }

    async registerServiceWorker() {
        if ('serviceWorker' in navigator) {
            try {
                const registration = await navigator.serviceWorker.register('sw.js');
                console.log('Service Worker registered:', registration);
            } catch (error) {
                console.error('Service Worker registration failed:', error);
            }
        }
    }

    setupInstallPrompt() {
        let deferredPrompt;
        
        window.addEventListener('beforeinstallprompt', (e) => {
            e.preventDefault();
            deferredPrompt = e;
            
            // Show install prompt
            const promptDiv = document.createElement('div');
            promptDiv.className = 'install-prompt';
            promptDiv.innerHTML = `
                <span>📱 Install ISBN Scanner for quick access!</span>
                <button class="install-btn">Install</button>
                <button class="dismiss-btn">✕</button>
            `;
            document.body.appendChild(promptDiv);
            
            promptDiv.querySelector('.install-btn').addEventListener('click', async () => {
                promptDiv.remove();
                deferredPrompt.prompt();
                const { outcome } = await deferredPrompt.userChoice;
                console.log('Install prompt outcome:', outcome);
                deferredPrompt = null;
            });
            
            promptDiv.querySelector('.dismiss-btn').addEventListener('click', () => {
                promptDiv.remove();
            });
        });
    }
}
