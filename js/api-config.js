// ============================================
// API Search Configuration
// ============================================

import { BookAPIs } from './book-apis.js';

export const APIConfig = {
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
