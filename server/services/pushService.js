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

async function saveSubscription(userId, subscription) {
    try {
        if (!subscription || typeof subscription !== 'object') {
            return { success: false, error: 'Invalid subscription object' };
        }
        const { endpoint, keys } = subscription;
        if (!endpoint || typeof endpoint !== 'string' || !endpoint.startsWith('https://') || endpoint.length > 500) {
            return { success: false, error: 'Invalid push endpoint URL' };
        }
        if (!keys || typeof keys !== 'object' ||
            typeof keys.p256dh !== 'string' || keys.p256dh.length < 10 || keys.p256dh.length > 250 ||
            typeof keys.auth !== 'string' || keys.auth.length < 5 || keys.auth.length > 150) {
            return { success: false, error: 'Invalid push subscription keys' };
        }

        const user = await User.findById(userId);
        if (!user) return { success: false, error: 'User not found' };

        user.pushSubscriptions = user.pushSubscriptions || [];
        // Avoid storing duplicate endpoints
        const exists = user.pushSubscriptions.some(sub => sub.endpoint === endpoint);

        if (!exists) {
            // Keep at most 4 previous subscriptions to limit to 5 total
            if (user.pushSubscriptions.length >= 5) {
                user.pushSubscriptions = user.pushSubscriptions.slice(-4);
            }
            user.pushSubscriptions.push({
                endpoint,
                keys: {
                    p256dh: keys.p256dh,
                    auth: keys.auth
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
