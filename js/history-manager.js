// ============================================
// History Manager - Scan history persistence
// ============================================

export class HistoryManager {
    constructor(onItemClick) {
        this.historyList = document.getElementById('historyList');
        this.onItemClick = onItemClick;
        this.load();
    }
    
    save(book, isbn) {
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
        this.load();
    }
    
    load() {
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
                if (this.onItemClick) {
                    this.onItemClick(isbn);
                }
            });
        });
    }
    
    clear() {
        localStorage.removeItem('isbnHistory');
        this.load();
    }
}
