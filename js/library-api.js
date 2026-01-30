// ============================================
// Local Library API
// ============================================

export const LibraryAPI = {
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
