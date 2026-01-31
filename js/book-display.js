// ============================================
// Book Display - Show book information in UI
// ============================================

import { LibraryAPI } from './library-api.js';

export class BookDisplay {
    constructor(uiManager) {
        this.ui = uiManager;
        this.results = document.getElementById('results');
        this.currentBookData = null;
        
        this.setupLibraryButton();
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
        
        // Get last used place from localStorage
        const lastUsedPlaceId = localStorage.getItem('lastUsedPlaceId');
        
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
                // Pre-select last used place
                if (lastUsedPlaceId && place.id.toString() === lastUsedPlaceId) {
                    option.selected = true;
                }
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
        
        // Save selected place as last used for next time
        if (selectedPlaceId) {
            localStorage.setItem('lastUsedPlaceId', selectedPlaceId.toString());
        }
        
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
    
    hideResults() {
        this.results.classList.add('hidden');
    }
}
