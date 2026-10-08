const express = require('express');
const { authMiddleware } = require('../middleware/auth');
const { VAPID_PUBLIC_KEY, saveSubscription, removeSubscription } = require('../services/pushService');

const router = express.Router();

// GET /api/notifications/vapid-key
router.get('/vapid-key', (req, res) => {
    res.json({ publicKey: VAPID_PUBLIC_KEY || null });
});

// POST /api/notifications/subscribe
router.post('/subscribe', authMiddleware, async (req, res) => {
    try {
        const { subscription } = req.body || {};
        if (!subscription || typeof subscription !== 'object') {
            return res.status(400).json({ error: 'Invalid subscription object.' });
        }
        const { endpoint, keys } = subscription;
        if (!endpoint || typeof endpoint !== 'string' || !endpoint.startsWith('https://') || endpoint.length > 500) {
            return res.status(400).json({ error: 'Invalid push endpoint URL.' });
        }
        if (!keys || typeof keys !== 'object' ||
            typeof keys.p256dh !== 'string' || keys.p256dh.length < 10 || keys.p256dh.length > 250 ||
            typeof keys.auth !== 'string' || keys.auth.length < 5 || keys.auth.length > 150) {
            return res.status(400).json({ error: 'Invalid push subscription cryptographic keys.' });
        }

        const result = await saveSubscription(req.user._id.toString(), subscription);
        if (!result.success) return res.status(500).json({ error: result.error });
        res.json({ success: true, message: 'Push subscription saved.' });
    } catch (err) {
        console.error('Push subscribe error:', err);
        res.status(500).json({ error: 'Failed to subscribe.' });
    }
});

// POST /api/notifications/unsubscribe
router.post('/unsubscribe', authMiddleware, async (req, res) => {
    try {
        const { endpoint } = req.body;
        if (!endpoint) return res.status(400).json({ error: 'Endpoint required.' });
        const result = await removeSubscription(req.user._id.toString(), endpoint);
        if (!result.success) return res.status(500).json({ error: result.error });
        res.json({ success: true, message: 'Push subscription removed.' });
    } catch (err) {
        console.error('Push unsubscribe error:', err);
        res.status(500).json({ error: 'Failed to unsubscribe.' });
    }
});

module.exports = router;
