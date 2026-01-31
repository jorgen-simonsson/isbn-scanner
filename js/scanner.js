// ============================================
// ISBN Scanner PWA - Main Scanner Class (Refactored)
// ============================================

/* global Quagga, Tesseract */

import { APIConfig } from './api-config.js';
import { isValidISBN, isValidISBN10, extractISBN } from './isbn-utils.js';
import { UIManager } from './ui-manager.js';
import { BookDisplay } from './book-display.js';
import { HistoryManager } from './history-manager.js';
import { PWAManager } from './pwa-manager.js';

export class ISBNScanner {
    constructor() {
        // Initialize managers
        this.ui = new UIManager();
        this.bookDisplay = new BookDisplay(this.ui);
        this.history = new HistoryManager((isbn) => this.handleHistoryClick(isbn));
        this.pwa = new PWAManager();
        
        // Scanner elements
        this.video = document.getElementById('video');
        this.canvas = document.getElementById('canvas');
        this.ctx = this.canvas.getContext('2d');
        this.captureBtn = document.getElementById('captureBtn');
        this.barcodeMode = document.getElementById('barcodeMode');
        this.textMode = document.getElementById('textMode');
        this.isbnInput = document.getElementById('isbnInput');
        this.searchBtn = document.getElementById('searchBtn');
        
        // Scanner state
        this.currentMode = 'barcode';
        this.isScanning = false;
        this.stream = null;
        this.tesseractWorker = null;
        this.lastScannedISBN = null;
        this.scanCooldown = false;
        
        this.init();
    }

    async init() {
        this.ui.displayVersion();
        this.setupEventListeners();
        
        // Check for camera support
        if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
            this.ui.setStatus('Camera not supported on this device/browser', 'error');
            return;
        }
        
        // Check if running on HTTPS or localhost (required for camera)
        const isSecure = location.protocol === 'https:' || location.hostname === 'localhost' || location.hostname === '127.0.0.1';
        if (!isSecure) {
            this.ui.setStatus('Camera requires HTTPS. Please use a secure connection.', 'error');
            return;
        }
        
        // Start in barcode mode
        if (this.currentMode === 'barcode') {
            await this.startBarcodeScanning();
        } else {
            await this.startCamera();
        }
        
        this.pwa.init();
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
    
    handleHistoryClick(isbn) {
        this.isbnInput.value = isbn;
        this.lookupBook(isbn);
    }

    // ========== Camera Management ==========
    
    async startCamera() {
        try {
            this.ui.setStatus('Starting camera...', 'loading');
            
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
            
            await new Promise((resolve, reject) => {
                this.video.onloadedmetadata = () => {
                    this.canvas.width = this.video.videoWidth;
                    this.canvas.height = this.video.videoHeight;
                    resolve();
                };
                this.video.onerror = reject;
                setTimeout(() => resolve(), 5000);
            });
            
            await this.video.play();
            this.ui.setStatus('Camera ready. Tap "Capture Text" to scan ISBN.', 'success');
        } catch (error) {
            console.error('Camera error:', error);
            let msg = 'Camera error: ' + error.message;
            if (error.name === 'NotAllowedError') {
                msg = 'Camera access denied. Please allow camera access in your browser settings and reload.';
            } else if (error.name === 'NotFoundError') {
                msg = 'No camera found on this device.';
            }
            this.ui.setStatus(msg, 'error');
        }
    }

    async setMode(mode) {
        if (this.currentMode === mode) return;
        
        this.currentMode = mode;
        
        // Update UI
        this.barcodeMode.classList.toggle('active', mode === 'barcode');
        this.textMode.classList.toggle('active', mode === 'text');
        this.captureBtn.classList.toggle('hidden', mode === 'barcode');
        
        await this.stopAllMedia();
        
        if (mode === 'barcode') {
            await this.startBarcodeScanning();
        } else {
            await this.startCamera();
        }
    }
    
    async stopAllMedia() {
        if (this.isScanning) {
            try {
                Quagga.offDetected();
                Quagga.stop();
            } catch (e) {
                console.log('Quagga stop:', e);
            }
            this.isScanning = false;
        }
        
        if (this.stream) {
            this.stream.getTracks().forEach(track => track.stop());
            this.stream = null;
        }
        
        this.video.srcObject = null;
        this.video.style.display = 'block';
        
        // Remove Quagga-created elements
        const viewport = this.video.parentElement.querySelector('.viewport');
        if (viewport) viewport.remove();
        const quaggaVideo = this.video.parentElement.querySelector('video:not(#video)');
        if (quaggaVideo) quaggaVideo.remove();
        const quaggaCanvas = this.video.parentElement.querySelectorAll('canvas:not(#canvas)');
        quaggaCanvas.forEach(c => c.remove());
    }

    // ========== Barcode Scanning ==========
    
    async startBarcodeScanning() {
        if (this.isScanning) return;
        
        if (typeof Quagga === 'undefined') {
            this.ui.setStatus('Barcode scanner library not loaded. Try refreshing the page.', 'error');
            return false;
        }
        
        this.ui.setStatus('Starting barcode scanner...', 'loading');
        
        const scannerContainer = this.video.parentElement;
        
        return new Promise((resolve) => {
            Quagga.init({
                inputStream: {
                    name: "Live",
                    type: "LiveStream",
                    target: scannerContainer,
                    constraints: {
                        facingMode: "environment",
                        width: { ideal: 1280 },
                        height: { ideal: 720 }
                    }
                },
                decoder: {
                    readers: ["ean_reader", "ean_8_reader", "code_128_reader"],
                    multiple: false
                },
                locate: true,
                locator: { patchSize: "medium", halfSample: true },
                frequency: 10
            }, (err) => {
                if (err) {
                    console.error('Quagga init error:', err);
                    this.ui.setStatus('Barcode scanner failed: ' + (err.message || err) + '. Try Text OCR mode.', 'error');
                    resolve(false);
                    return;
                }
                
                this.video.style.display = 'block';
                
                Quagga.onDetected((result) => {
                    if (this.scanCooldown || !this.isScanning) return;
                    
                    const code = result.codeResult.code;
                    console.log('Barcode detected:', code);
                    
                    if (isValidISBN(code)) {
                        this.scanCooldown = true;
                        this.lastScannedISBN = code;
                        
                        if (navigator.vibrate) {
                            navigator.vibrate(100);
                        }
                        
                        this.lookupBook(code);
                        
                        setTimeout(() => {
                            this.scanCooldown = false;
                        }, 2000);
                    }
                });
                
                Quagga.start();
                this.isScanning = true;
                this.ui.setStatus('Point camera at ISBN barcode', 'success');
                resolve(true);
            });
        });
    }

    // ========== OCR Scanning ==========
    
    async captureForOCR() {
        this.ui.setStatus('<span class="spinner"></span>Processing image with OCR...', 'loading');
        
        this.ctx.drawImage(this.video, 0, 0, this.canvas.width, this.canvas.height);
        const imageData = this.canvas.toDataURL('image/png');
        
        try {
            if (!this.tesseractWorker) {
                this.tesseractWorker = await Tesseract.createWorker('eng');
            }
            
            const result = await this.tesseractWorker.recognize(imageData);
            const text = result.data.text;
            
            console.log('OCR Result:', text);
            
            const isbn = extractISBN(text);
            
            if (isbn) {
                this.ui.setStatus(`Found ISBN: ${isbn}`, 'success');
                
                if (navigator.vibrate) {
                    navigator.vibrate(100);
                }
                
                this.lookupBook(isbn);
            } else {
                this.ui.setStatus('No ISBN found in image. Try again with clearer text.', 'error');
            }
        } catch (error) {
            console.error('OCR error:', error);
            this.ui.setStatus('OCR processing failed. Please try again.', 'error');
        }
    }

    // ========== Book Lookup ==========
    
    async manualSearch() {
        const isbn = this.isbnInput.value.replace(/[\s\-]/g, '');
        
        if (!isbn) {
            this.ui.setStatus('Please enter an ISBN', 'error');
            return;
        }
        
        if (!isValidISBN(isbn) && !isValidISBN10(isbn)) {
            this.ui.setStatus('Invalid ISBN format', 'error');
            return;
        }
        
        this.lookupBook(isbn);
    }

    async lookupBook(isbn) {
        this.ui.setStatus('<span class="spinner"></span>Looking up book...', 'loading');
        this.bookDisplay.hideResults();
        
        const apis = APIConfig.getEnabledAPIs();
        
        for (const api of apis) {
            try {
                console.log(`Trying ${api.name}...`);
                this.ui.setStatus(`<span class="spinner"></span>Searching ${api.name}...`, 'loading');
                
                const result = await api.search(isbn);
                
                if (result.found) {
                    console.log(`Found in ${api.name}:`, result.book);
                    await this.bookDisplay.displayBook(result.book, isbn, api.name);
                    this.history.save(result.book, isbn);
                    this.ui.setStatus(`Book found via ${api.name}!`, 'success');
                    return;
                }
            } catch (error) {
                console.error(`${api.name} error:`, error);
            }
        }
        
        this.ui.setStatus(`No book found for ISBN: ${isbn}`, 'error');
    }
}
