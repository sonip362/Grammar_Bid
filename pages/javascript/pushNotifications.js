// ─── PWA Push Notification Registration ──────────────────────
// Registers service worker and subscribes to push notifications

(function () {
    'use strict';

    // Check browser support
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
        console.log('Push notifications not supported in this browser.');
        return;
    }

    let swRegistration = null;

    // ─── Register Service Worker ─────────────────────────────
    async function registerServiceWorker() {
        try {
            swRegistration = await navigator.serviceWorker.register('/sw.js', { scope: '/' });
            console.log('✅ Service Worker registered');
            return swRegistration;
        } catch (err) {
            console.error('Service Worker registration failed:', err);
            return null;
        }
    }

    // ─── Get VAPID Public Key from Server ────────────────────
    async function getVapidKey() {
        try {
            const res = await fetch('/api/notifications/vapid-key');
            const data = await res.json();
            return data.publicKey;
        } catch (err) {
            console.error('Failed to fetch VAPID key:', err);
            return null;
        }
    }

    // ─── Convert VAPID key to Uint8Array ─────────────────────
    function urlBase64ToUint8Array(base64String) {
        const padding = '='.repeat((4 - base64String.length % 4) % 4);
        const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
        const rawData = window.atob(base64);
        const outputArray = new Uint8Array(rawData.length);
        for (let i = 0; i < rawData.length; ++i) {
            outputArray[i] = rawData.charCodeAt(i);
        }
        return outputArray;
    }

    // ─── Subscribe to Push Notifications ─────────────────────
    async function subscribeToPush() {
        if (!swRegistration) return;

        const vapidKey = await getVapidKey();
        if (!vapidKey) {
            console.warn('No VAPID key available — push disabled.');
            return;
        }

        try {
            // Check if already subscribed
            let subscription = await swRegistration.pushManager.getSubscription();

            if (!subscription) {
                // Request permission and subscribe
                subscription = await swRegistration.pushManager.subscribe({
                    userVisibleOnly: true,
                    applicationServerKey: urlBase64ToUint8Array(vapidKey)
                });
                console.log('✅ Push subscription created');
            }

            // Send subscription to our server
            const token = localStorage.getItem('gb_token');
            if (token && subscription) {
                await fetch('/api/notifications/subscribe', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${token}`
                    },
                    body: JSON.stringify({ subscription: subscription.toJSON() })
                });
                console.log('✅ Push subscription saved to server');
            }
        } catch (err) {
            if (Notification.permission === 'denied') {
                console.log('Push notifications blocked by user.');
            } else {
                console.error('Push subscription error:', err);
            }
        }
    }

    // ─── Initialize on Page Load ─────────────────────────────
    async function initPush() {
        const token = localStorage.getItem('gb_token');
        if (!token) return; // Only subscribe for logged-in users

        const reg = await registerServiceWorker();
        if (reg) {
            if (Notification.permission === 'granted') {
                subscribeToPush();
            } else if (Notification.permission === 'default') {
                // Request permission after short delay
                setTimeout(async () => {
                    const perm = await Notification.requestPermission();
                    if (perm === 'granted') {
                        subscribeToPush();
                    } else {
                        console.warn('⚠️ Push notification permission:', perm);
                    }
                }, 1500);
            } else {
                console.warn('⚠️ Push notification permission is set to DENIED in Chrome site settings.');
                console.info('💡 To fix: Click the icon to the left of "http://localhost:3000" in Chrome address bar -> Notifications -> Allow');
            }
        }
    }

    // Export global helper for manual trigger / button click
    window.enablePushNotifications = async function () {
        if (!('Notification' in window)) {
            alert('Notifications not supported in this browser.');
            return;
        }
        const perm = await Notification.requestPermission();
        if (perm === 'granted') {
            await initPush();
            alert('✅ Push notifications enabled successfully!');
        } else {
            alert('⚠️ Permission was not granted. Please allow notifications in your browser address bar settings.');
        }
    };

    // Run when DOM is ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initPush);
    } else {
        initPush();
    }
})();
