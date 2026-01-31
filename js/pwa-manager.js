// ============================================
// PWA Manager - Service Worker and Install Prompt
// ============================================

export class PWAManager {
    constructor() {
        this.deferredPrompt = null;
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
        window.addEventListener('beforeinstallprompt', (e) => {
            e.preventDefault();
            this.deferredPrompt = e;
            
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
                this.deferredPrompt.prompt();
                const { outcome } = await this.deferredPrompt.userChoice;
                console.log('Install prompt outcome:', outcome);
                this.deferredPrompt = null;
            });
            
            promptDiv.querySelector('.dismiss-btn').addEventListener('click', () => {
                promptDiv.remove();
            });
        });
    }
    
    init() {
        this.registerServiceWorker();
        this.setupInstallPrompt();
    }
}
