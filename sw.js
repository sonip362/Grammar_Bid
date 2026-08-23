// ─── Grammar Bid Service Worker ──────────────────────────────
// Handles push notifications and notification click events

self.addEventListener('push', function (event) {
    let data = { title: 'Grammar Bid', body: 'You have a new notification!' };

    try {
        if (event.data) {
            data = event.data.json();
        }
    } catch (e) {
        // fallback to default
    }

    const options = {
        body: data.body || '',
        icon: '/assets/icons/icon-192x192.png',
        badge: '/assets/icons/icon-192x192.png',
        vibrate: [100, 50, 100],
        data: {
            url: data.url || '/',
            dateOfArrival: Date.now()
        },
        actions: data.actions || []
    };

    event.waitUntil(
        self.registration.showNotification(data.title || 'Grammar Bid', options)
    );
});

// ─── Notification Click Handler ──────────────────────────────
self.addEventListener('notificationclick', function (event) {
    event.notification.close();

    const targetUrl = event.notification.data && event.notification.data.url
        ? event.notification.data.url
        : '/';

    event.waitUntil(
        clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function (clientList) {
            // If the app is already open, focus it
            for (const client of clientList) {
                if (client.url.includes(self.location.origin) && 'focus' in client) {
                    client.navigate(targetUrl);
                    return client.focus();
                }
            }
            // Otherwise open a new window
            return clients.openWindow(targetUrl);
        })
    );
});

// ─── Service Worker Activate ─────────────────────────────────
self.addEventListener('activate', function (event) {
    event.waitUntil(self.clients.claim());
});
