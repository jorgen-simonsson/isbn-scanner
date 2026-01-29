// ============================================
// Local Library API
// ============================================

const LibraryAPI = {
    baseUrl: 'https://sotehus-rugged.tail21137e.ts.net',
    
    async checkBookExists(isbn) {
        try {
            const url = `${this.baseUrl}/api/books/isbn/${isbn}`;
            console.log('Checking library:', url);
            const response = await fetch(url);
            console.log('Library response status:', response.status);
            if (response.ok) {
                const book = await response.json();
                return { exists: true, book };
            } else if (response.status === 404) {
                return { exists: false };
            } else {
                throw new Error(`Library API error: ${response.status}`);
            }
        } catch (error) {
            console.error('Library check error:', error);
            return { exists: false, error: error.message };
        }
    },
    
    async getPlaces() {
        try {
            const response = await fetch(`${this.baseUrl}/api/places`);
            if (response.ok) {
                const places = await response.json();
                return { success: true, places };
            } else {
                throw new Error(`Failed to fetch places: ${response.status}`);
            }
        } catch (error) {
            console.error('Get places error:', error);
            return { success: false, error: error.message, places: [] };
        }
    },
    
    async addBook(bookData, placeId = null) {
        try {
            const response = await fetch(`${this.baseUrl}/api/books`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    isbn: bookData.isbn,
                    title: bookData.title || 'Unknown Title',
                    author: bookData.authors?.join(', ') || 'Unknown Author',
                    publisher: bookData.publisher || null,
                    publishedYear: bookData.publishedDate ? bookData.publishedDate.substring(0, 4) : null,
                    pagecount: bookData.pageCount || null,
                    placeId: placeId,
                    apiInfo: JSON.stringify(bookData)
                })
            });
            
            if (response.ok) {
                const createdBook = await response.json();
                return { success: true, book: createdBook };
            } else {
                const errorText = await response.text();
                throw new Error(`Failed to add book: ${response.status} - ${errorText}`);
            }
        } catch (error) {
            console.error('Library add error:', error);
            return { success: false, error: error.message };
        }
    }
};

// ============================================
// Book API Providers
// ============================================

const BookAPIs = {
    // Libris (Swedish National Library)
    libris: {
        name: 'Libris (KB)',
        async search(isbn) {
            const response = await fetch(`https://libris.kb.se/find.jsonld?q=${isbn}&_limit=5`, {
                headers: {
                    'Accept': 'application/ld+json'
                }
            });
            const data = await response.json();
            
            if (data.items && data.items.length > 0) {
                // Find a book item (Print, Electronic, or first item)
                const bookItem = data.items.find(item => 
                    item['@type'] === 'Print' || item['@type'] === 'Electronic'
                ) || data.items[0];
                
                if (bookItem) {
                    // Extract title
                    let title = '';
                    if (bookItem.hasTitle && bookItem.hasTitle.length > 0) {
                        const titleObj = bookItem.hasTitle[0];
                        title = titleObj.mainTitle || '';
                        if (titleObj.hasPart && titleObj.hasPart.length > 0) {
                            const part = titleObj.hasPart[0];
                            if (part.partNumber) title += ' ' + part.partNumber.join(', ');
                            if (part.partName) title += ': ' + part.partName.join(', ');
                        }
                    }
                    
                    // Helper function to extract author name from agent
                    const getAgentName = (agent) => {
                        if (!agent) return null;
                        if (agent.name) return agent.name;
                        // Handle Person with familyName/givenName
                        if (agent.familyName || agent.givenName) {
                            const parts = [agent.givenName, agent.familyName].filter(Boolean);
                            return parts.join(' ');
                        }
                        return null;
                    };
                    
                    // Extract authors - check both direct contribution and instanceOf.contribution
                    let authors = [];
                    const contributions = bookItem.instanceOf?.contribution || bookItem.contribution || [];
                    for (const contrib of contributions) {
                        // Prioritize authors (PrimaryContribution or role=author)
                        const isAuthor = contrib['@type'] === 'PrimaryContribution' ||
                            contrib.role?.some(r => 
                                r['@id']?.includes('author') || 
                                r.code === 'aut'
                            );
                        if (isAuthor) {
                            const name = getAgentName(contrib.agent);
                            if (name) authors.push(name);
                        }
                    }
                    // If no authors found with role, try responsibilityStatement
                    if (authors.length === 0 && bookItem.responsibilityStatement) {
                        authors = [bookItem.responsibilityStatement.split(',')[0].trim()];
                    }
                    
                    // Extract publisher and date
                    let publisher, publishedDate;
                    if (bookItem.publication && bookItem.publication.length > 0) {
                        const pub = bookItem.publication[0];
                        // agent.label can be a string or array
                        const label = pub.agent?.label;
                        publisher = Array.isArray(label) ? label[0] : label;
                        if (!publisher) publisher = pub.agent?.name;
                        publishedDate = pub.year || pub.date;
                    }
                    
                    // Extract page count
                    let pageCount;
                    if (bookItem.extent && bookItem.extent.length > 0) {
                        const extentLabel = bookItem.extent[0].label;
                        if (extentLabel) {
                            const match = (Array.isArray(extentLabel) ? extentLabel[0] : extentLabel).match(/(\d+)\s*s/i);
                            if (match) pageCount = parseInt(match[1]);
                        }
                    }
                    
                    // Extract language
                    let language;
                    if (bookItem.instanceOf?.language && bookItem.instanceOf.language.length > 0) {
                        language = bookItem.instanceOf.language[0].code;
                    }
                    
                    // Extract description/notes
                    let description;
                    if (bookItem.instanceOf?.hasNote && bookItem.instanceOf.hasNote.length > 0) {
                        description = bookItem.instanceOf.hasNote[0].label?.[0];
                    }
                    
                    return {
                        found: true,
                        book: {
                            title,
                            authors: authors.length > 0 ? authors : undefined,
                            publisher,
                            publishedDate,
                            pageCount,
                            description,
                            language
                        }
                    };
                }
            }
            return { found: false };
        }
    },
    
    // Google Books API
    googleBooks: {
        name: 'Google Books',
        async search(isbn) {
            const response = await fetch(`https://www.googleapis.com/books/v1/volumes?q=isbn:${isbn}`);
            const data = await response.json();
            
            if (data.totalItems > 0) {
                const vol = data.items[0].volumeInfo;
                return {
                    found: true,
                    book: {
                        title: vol.title,
                        authors: vol.authors,
                        publisher: vol.publisher,
                        publishedDate: vol.publishedDate,
                        pageCount: vol.pageCount,
                        description: vol.description,
                        imageLinks: vol.imageLinks,
                        categories: vol.categories,
                        language: vol.language
                    }
                };
            }
            return { found: false };
        }
    },
    
    // Open Library API
    openLibrary: {
        name: 'Open Library',
        async search(isbn) {
            const response = await fetch(`https://openlibrary.org/api/books?bibkeys=ISBN:${isbn}&format=json&jscmd=data`);
            const data = await response.json();
            
            const bookData = data[`ISBN:${isbn}`];
            if (bookData) {
                return {
                    found: true,
                    book: {
                        title: bookData.title,
                        authors: bookData.authors?.map(a => a.name),
                        publisher: bookData.publishers?.[0]?.name,
                        publishedDate: bookData.publish_date,
                        pageCount: bookData.number_of_pages,
                        description: bookData.notes || bookData.excerpts?.[0]?.text,
                        imageLinks: {
                            thumbnail: bookData.cover?.medium || bookData.cover?.small,
                            smallThumbnail: bookData.cover?.small
                        },
                        subjects: bookData.subjects?.map(s => s.name)
                    }
                };
            }
            return { found: false };
        }
    },
    
    // OpenBD (Japanese books)
    openBD: {
        name: 'OpenBD',
        async search(isbn) {
            const response = await fetch(`https://api.openbd.jp/v1/get?isbn=${isbn}`);
            const data = await response.json();
            
            if (data && data[0]) {
                const summary = data[0].summary;
                const onix = data[0].onix;
                return {
                    found: true,
                    book: {
                        title: summary.title,
                        authors: summary.author ? [summary.author] : undefined,
                        publisher: summary.publisher,
                        publishedDate: summary.pubdate,
                        description: onix?.CollateralDetail?.TextContent?.[0]?.Text,
                        imageLinks: {
                            thumbnail: summary.cover
                        }
                    }
                };
            }
            return { found: false };
        }
    }
};

// ============================================
// API Search Configuration
// ============================================

const APIConfig = {
    // Order in which APIs are tried (first match wins)
    searchOrder: ['libris', 'googleBooks', 'openLibrary', 'openBD'],
    
    // Get list of enabled APIs
    getEnabledAPIs() {
        return this.searchOrder.map(key => ({
            key,
            ...BookAPIs[key]
        }));
    },
    
    // Change the search order
    setSearchOrder(order) {
        this.searchOrder = order.filter(key => BookAPIs[key]);
    },
    
    // Add a custom API provider
    addProvider(key, provider) {
        if (provider.name && typeof provider.search === 'function') {
            BookAPIs[key] = provider;
        }
    }
};

// ============================================
// ISBN Scanner PWA
// ============================================

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
        const addToLibraryBtn = document.getElementById('addToLibraryBtn');
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
