// ISBN Scanner PWA
class ISBNScanner {
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
        
        this.init();
    }

    async init() {
        this.loadHistory();
        this.setupEventListeners();
        
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
        
        this.setStatus('Starting barcode scanner...', 'loading');
        
        // Hide the original video element - Quagga creates its own
        this.video.style.display = 'none';
        
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

            Quagga.onDetected((result) => {
                if (this.scanCooldown) return;
                
                const code = result.codeResult.code;
                console.log('Barcode detected:', code);
                
                // Check if it's a valid ISBN (10 or 13 digits starting with 978 or 979)
                if (this.isValidISBN(code)) {
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
            const isbn = this.extractISBN(text);
            
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

    extractISBN(text) {
        console.log('Raw OCR text:', text);
        
        // Normalize the text - keep original for pattern matching
        const normalizedText = text
            .toUpperCase()
            .replace(/[Il|]/g, '1')      // Common OCR mistakes: I, l, | -> 1
            .replace(/[Oo]/g, '0')        // O -> 0 in number context
            .replace(/[Ss]/g, '5')        // S -> 5 in number context  
            .replace(/[Bb]/g, '8')        // B -> 8 in number context
            .replace(/[Zz]/g, '2')        // Z -> 2 in number context
            .replace(/\n/g, ' ');         // Newlines to spaces
        
        // Strategy 1: Look for "ISBN" keyword followed by numbers
        const isbnLabelPatterns = [
            /ISBN[-:\s]*(?:13)?[-:\s]*((?:97[89])[-\s.\d]{10,17})/gi,
            /ISBN[-:\s]*(?:10)?[-:\s]*(\d[-\s.\d]{9,12}[X\d])/gi,
            /ISBN\s*[:=]?\s*(\d[\d\s\-\.]{9,16}[\dX])/gi
        ];
        
        for (const pattern of isbnLabelPatterns) {
            const matches = text.matchAll(pattern);
            for (const match of matches) {
                const candidate = match[1].replace(/[\s\-\.]/g, '');
                console.log('ISBN label match candidate:', candidate);
                if (candidate.length === 13 && this.validateISBN13(candidate)) {
                    return candidate;
                }
                if (candidate.length === 10 && this.isValidISBN10(candidate)) {
                    return candidate;
                }
            }
        }
        
        // Strategy 2: Look for 978/979 prefix (ISBN-13)
        // Handle cases where digits might be stuck to other text
        const isbn13Patterns = [
            // Standard with possible separators
            /(97[89])[-\s.]?(\d)[-\s.]?(\d{2})[-\s.]?(\d{5})[-\s.]?(\d)/g,
            // Compact - 13 digits starting with 978/979
            /(97[89]\d{10})/g,
            // With text around it - extract 978/979 followed by 10 more digits
            /(?:^|[^\d])(97[89])(\d{10})(?:[^\d]|$)/g,
            // Broken by OCR - might have spaces/chars between
            /(97[89])[\s\-\.oO]*(\d)[\s\-\.oO]*(\d)[\s\-\.oO]*(\d)[\s\-\.oO]*(\d)[\s\-\.oO]*(\d)[\s\-\.oO]*(\d)[\s\-\.oO]*(\d)[\s\-\.oO]*(\d)[\s\-\.oO]*(\d)[\s\-\.oO]*(\d)/g
        ];
        
        for (const pattern of isbn13Patterns) {
            const matches = normalizedText.matchAll(pattern);
            for (const match of matches) {
                // Join all capture groups and clean
                const candidate = match.slice(1).join('').replace(/[\s\-\.]/g, '');
                const digits = candidate.replace(/[^\d]/g, '');
                console.log('ISBN-13 pattern candidate:', digits);
                if (digits.length === 13 && this.validateISBN13(digits)) {
                    return digits;
                }
            }
        }
        
        // Strategy 3: Find any sequence of 13 digits that validates as ISBN-13
        const allDigitSequences = normalizedText.replace(/[^\d\s]/g, ' ').match(/\d[\d\s]{11,20}\d/g) || [];
        for (const seq of allDigitSequences) {
            const digits = seq.replace(/\s/g, '');
            if (digits.length >= 13) {
                // Try to find a valid ISBN-13 within
                for (let i = 0; i <= digits.length - 13; i++) {
                    const candidate = digits.substring(i, i + 13);
                    if ((candidate.startsWith('978') || candidate.startsWith('979')) && this.validateISBN13(candidate)) {
                        console.log('Found ISBN-13 in sequence:', candidate);
                        return candidate;
                    }
                }
            }
        }
        
        // Strategy 4: ISBN-10 (10 digits, last can be X)
        const isbn10Patterns = [
            /(\d)[-\s.]?(\d{2})[-\s.]?(\d{5})[-\s.]?([\dX])/gi,
            /(\d{9}[\dX])/gi,
            /(?:^|[^\dX])(\d{9})([\dX])(?:[^\dX]|$)/gi
        ];
        
        for (const pattern of isbn10Patterns) {
            const matches = text.toUpperCase().matchAll(pattern);
            for (const match of matches) {
                const candidate = match.slice(1).join('').replace(/[\s\-\.]/g, '').toUpperCase();
                const clean = candidate.replace(/[^\dX]/g, '');
                console.log('ISBN-10 pattern candidate:', clean);
                if (clean.length === 10 && this.isValidISBN10(clean)) {
                    return clean;
                }
            }
        }
        
        // Strategy 5: Brute force - find any 10 or 13 digit number and validate
        const allNumbers = text.match(/\d+/g) || [];
        // Also try concatenating adjacent numbers
        const concatenated = allNumbers.join('');
        
        // Look for ISBN-13 in concatenated
        for (let i = 0; i <= concatenated.length - 13; i++) {
            const candidate = concatenated.substring(i, i + 13);
            if ((candidate.startsWith('978') || candidate.startsWith('979')) && this.validateISBN13(candidate)) {
                console.log('Found ISBN-13 in concatenated numbers:', candidate);
                return candidate;
            }
        }
        
        // Look for ISBN-10 in concatenated
        for (let i = 0; i <= concatenated.length - 10; i++) {
            const candidate = concatenated.substring(i, i + 10);
            if (this.isValidISBN10(candidate)) {
                console.log('Found ISBN-10 in concatenated numbers:', candidate);
                return candidate;
            }
        }
        
        // Strategy 6: Handle completely mangled text - extract all digits and try combinations
        const justDigits = normalizedText.replace(/[^\d]/g, '');
        if (justDigits.length >= 13) {
            // Sliding window for ISBN-13
            for (let i = 0; i <= justDigits.length - 13; i++) {
                const candidate = justDigits.substring(i, i + 13);
                if ((candidate.startsWith('978') || candidate.startsWith('979')) && this.validateISBN13(candidate)) {
                    console.log('Found ISBN-13 via sliding window:', candidate);
                    return candidate;
                }
            }
        }
        
        console.log('No valid ISBN found in text');
        return null;
    }

    isValidISBN(code) {
        // Remove any hyphens or spaces
        const cleaned = code.replace(/[\s\-]/g, '');
        
        // Check for ISBN-13
        if (cleaned.length === 13 && /^\d{13}$/.test(cleaned)) {
            // Should start with 978 or 979 for books
            if (cleaned.startsWith('978') || cleaned.startsWith('979')) {
                return this.validateISBN13(cleaned);
            }
        }
        
        // Check for ISBN-10
        if (cleaned.length === 10) {
            return this.isValidISBN10(cleaned);
        }
        
        return false;
    }

    validateISBN13(isbn) {
        let sum = 0;
        for (let i = 0; i < 13; i++) {
            const digit = parseInt(isbn[i]);
            sum += (i % 2 === 0) ? digit : digit * 3;
        }
        return sum % 10 === 0;
    }

    isValidISBN10(code) {
        const cleaned = code.replace(/[\s\-]/g, '').toUpperCase();
        
        if (cleaned.length !== 10) return false;
        if (!/^\d{9}[\dX]$/.test(cleaned)) return false;
        
        let sum = 0;
        for (let i = 0; i < 9; i++) {
            sum += parseInt(cleaned[i]) * (10 - i);
        }
        
        const lastChar = cleaned[9];
        sum += lastChar === 'X' ? 10 : parseInt(lastChar);
        
        return sum % 11 === 0;
    }

    async manualSearch() {
        const isbn = this.isbnInput.value.replace(/[\s\-]/g, '');
        
        if (!isbn) {
            this.setStatus('Please enter an ISBN', 'error');
            return;
        }
        
        if (!this.isValidISBN(isbn) && !this.isValidISBN10(isbn)) {
            this.setStatus('Invalid ISBN format', 'error');
            return;
        }
        
        this.lookupBook(isbn);
    }

    async lookupBook(isbn) {
        this.setStatus('<span class="spinner"></span>Looking up book...', 'loading');
        this.results.classList.add('hidden');
        
        try {
            // Try Google Books API
            const response = await fetch(`https://www.googleapis.com/books/v1/volumes?q=isbn:${isbn}`);
            const data = await response.json();
            
            if (data.totalItems > 0) {
                const book = data.items[0].volumeInfo;
                this.displayBook(book, isbn);
                this.saveToHistory(book, isbn);
                this.setStatus('Book found!', 'success');
            } else {
                // Try Open Library as fallback
                const olResponse = await fetch(`https://openlibrary.org/api/books?bibkeys=ISBN:${isbn}&format=json&jscmd=data`);
                const olData = await olResponse.json();
                
                if (olData[`ISBN:${isbn}`]) {
                    const book = this.convertOpenLibraryFormat(olData[`ISBN:${isbn}`]);
                    this.displayBook(book, isbn);
                    this.saveToHistory(book, isbn);
                    this.setStatus('Book found!', 'success');
                } else {
                    this.setStatus(`No book found for ISBN: ${isbn}`, 'error');
                }
            }
        } catch (error) {
            console.error('API error:', error);
            this.setStatus('Error looking up book. Please try again.', 'error');
        }
    }

    convertOpenLibraryFormat(olBook) {
        return {
            title: olBook.title,
            authors: olBook.authors?.map(a => a.name),
            publisher: olBook.publishers?.[0]?.name,
            publishedDate: olBook.publish_date,
            pageCount: olBook.number_of_pages,
            description: olBook.notes,
            imageLinks: {
                thumbnail: olBook.cover?.medium || olBook.cover?.small
            }
        };
    }

    displayBook(book, isbn) {
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

// Initialize app when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    new ISBNScanner();
});
