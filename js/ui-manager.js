// ============================================
// UI Manager - Status, Version, and General UI
// ============================================

import { VERSION } from './version.js';

export class UIManager {
    constructor() {
        this.status = document.getElementById('status');
    }
    
    setStatus(message, type = '') {
        this.status.innerHTML = message;
        this.status.className = 'status ' + type;
    }
    
    displayVersion() {
        const versionEl = document.getElementById('appVersion');
        if (versionEl) {
            versionEl.textContent = `v${VERSION}`;
        }
    }
}
