export const AdManager = {
    isInitialized: false,

    async initialize() {
        // Check if app is running natively on Android via Capacitor
        if (window.Capacitor && window.Capacitor.Plugins.AdMob) {
            try {
                await window.Capacitor.Plugins.AdMob.initialize();
                this.isInitialized = true;
                console.log('AdMob successfully initialized');
            } catch (e) {
                console.error('AdMob init error', e);
            }
        }
    },

    async showInterstitial() {
        if (window.Capacitor && window.Capacitor.Plugins.AdMob && this.isInitialized) {
            try {
                // Google AdMob Test Interstitial ID for Android
                const options = {
                    adId: 'ca-app-pub-3940256099942544/1033173712',
                    isTesting: true
                };
                await window.Capacitor.Plugins.AdMob.prepareInterstitial(options);
                await window.Capacitor.Plugins.AdMob.showInterstitial();
            } catch (e) {
                console.log("AdMob interstitial failed", e);
            }
        } else {
            // Fallback: Agar aap app ko web browser mein test kar rahe hain
            console.log("Web Browser: Action completed, Ad would show here on mobile.");
        }
    }
};

// Start AdMob engine as soon as the app opens
AdManager.initialize();
