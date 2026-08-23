const webpush = require('web-push');
const User = require('../../models/User');

// ─── Configure VAPID ─────────────────────────────────────────
const VAPID_PUBLIC_KEY = process.env.VAPID_PUBLIC_KEY;
const VAPID_PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY;
const VAPID_EMAIL = process.env.VAPID_EMAIL || 'mailto:grammarbid@example.com';

if (VAPID_PUBLIC_KEY && VAPID_PRIVATE_KEY) {
    webpush.setVapidDetails(VAPID_EMAIL, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);
    console.log('✅ Web Push VAPID configured');
} else {
    console.warn('⚠️ VAPID keys not set — push notifications disabled');
}

// ─── Save Subscription to User ───────────────────────────────
async function saveSubscription(userId, subscription) {
    try {
        const user = await User.findById(userId);
        if (!user) return { success: false, error: 'User not found' };

        // Avoid storing duplicate endpoints
        const exists = (user.pushSubscriptions || []).some(
            sub => sub.endpoint === subscription.endpoint
        );

        if (!exists) {
            user.pushSubscriptions = user.pushSubscriptions || [];
            user.pushSubscriptions.push({
                endpoint: subscription.endpoint,
                keys: {
                    p256dh: subscription.keys.p256dh,
                    auth: subscription.keys.auth
                }
            });
            await user.save();
        }

        return { success: true };
    } catch (err) {
        console.error('Push subscription save error:', err);
        return { success: false, error: 'Failed to save subscription' };
    }
}

// ─── Remove Subscription from User ──────────────────────────
async function removeSubscription(userId, endpoint) {
    try {
        await User.findByIdAndUpdate(userId, {
            $pull: { pushSubscriptions: { endpoint } }
        });
        return { success: true };
    } catch (err) {
        console.error('Push subscription remove error:', err);
        return { success: false, error: 'Failed to remove subscription' };
    }
}

// ─── Send Push to a Single User ──────────────────────────────
async function sendPushToUser(userId, payload) {
    if (!VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY) return;

    try {
        const user = await User.findById(userId).lean();
        if (!user || !user.pushSubscriptions || user.pushSubscriptions.length === 0) return;

        const notificationPayload = JSON.stringify(payload);
        const expiredEndpoints = [];

        for (const sub of user.pushSubscriptions) {
            try {
                const res = await webpush.sendNotification(sub, notificationPayload);
                console.log(`📡 WebPush sent to user ${user._id} (Status: ${res.statusCode})`);
            } catch (err) {
                console.error(`❌ WebPush error for user ${user._id}:`, err.statusCode || err.message);
                // 410 Gone or 404 = subscription expired/invalid, mark for removal
                if (err.statusCode === 410 || err.statusCode === 404) {
                    expiredEndpoints.push(sub.endpoint);
                }
            }
        }

        // Clean up expired subscriptions
        if (expiredEndpoints.length > 0) {
            await User.findByIdAndUpdate(userId, {
                $pull: { pushSubscriptions: { endpoint: { $in: expiredEndpoints } } }
            });
        }
    } catch (err) {
        console.error('Push notification send error:', err);
    }
}

// ─── Send Push to All Users (Broadcast) ──────────────────────
async function sendPushToAll(payload) {
    if (!VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY) return;

    try {
        const users = await User.find({
            'pushSubscriptions.0': { $exists: true }
        }).select('_id pushSubscriptions').lean();

        if (users.length === 0) {
            console.log('⚠️ No users with push subscriptions found.');
            return;
        }

        await Promise.all(users.map(u => sendPushToUser(u._id.toString(), payload)));
    } catch (err) {
        console.error('Broadcast push error:', err);
    }
}

module.exports = {
    VAPID_PUBLIC_KEY,
    saveSubscription,
    removeSubscription,
    sendPushToUser,
    sendPushToAll
};
