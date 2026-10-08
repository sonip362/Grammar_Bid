const express = require('express');
const { authMiddleware } = require('../middleware/auth');
const { getDailyRewardStatus, claimDailyReward } = require('../services/dailyRewardService');
const { POWER_CARDS, getUserPowerCards, purchasePowerCard, exchangeCashForTokens } = require('../services/powerCardService');

const router = express.Router();

// GET /api/daily-reward/status
router.get('/daily-reward/status', authMiddleware, async (req, res) => {
    try {
        const userId = req.user._id.toString();
        const status = await getDailyRewardStatus(userId);
        if (!status) return res.status(404).json({ error: 'User not found.' });
        res.json(status);
    } catch (err) {
        console.error('Daily reward status error:', err);
        res.status(500).json({ error: 'Failed to retrieve daily reward status.' });
    }
});

// POST /api/daily-reward/claim
router.post('/daily-reward/claim', authMiddleware, async (req, res) => {
    try {
        const userId = req.user._id.toString();
        const result = await claimDailyReward(userId);
        if (!result.success) {
            return res.status(400).json(result);
        }
        res.json(result);
    } catch (err) {
        console.error('Daily reward claim error:', err);
        res.status(500).json({ error: 'Failed to claim daily reward.' });
    }
});

// GET /api/power-cards/store
router.get('/power-cards/store', authMiddleware, async (req, res) => {
    try {
        const userId = req.user._id.toString();
        const data = await getUserPowerCards(userId);
        if (!data) return res.status(404).json({ error: 'User not found.' });
        res.json({
            cards: POWER_CARDS,
            cash: data.cash,
            tokens: data.tokens,
            inventory: data.inventory,
            exchangeRate: data.exchangeRate
        });
    } catch (err) {
        console.error('Power cards store fetch error:', err);
        res.status(500).json({ error: 'Failed to fetch power cards store.' });
    }
});

// POST /api/power-cards/buy
router.post('/power-cards/buy', authMiddleware, async (req, res) => {
    try {
        const userId = req.user._id.toString();
        const { cardId, quantity } = req.body || {};
        const result = await purchasePowerCard(userId, cardId, quantity);
        if (!result.success) {
            return res.status(result.status || 400).json(result);
        }
        res.json(result);
    } catch (err) {
        console.error('Power cards buy error:', err);
        res.status(500).json({ error: 'Failed to purchase power card.' });
    }
});

// POST /api/power-cards/exchange-cash
router.post('/power-cards/exchange-cash', authMiddleware, async (req, res) => {
    try {
        const userId = req.user._id.toString();
        const { tokensToBuy } = req.body || {};
        const result = await exchangeCashForTokens(userId, tokensToBuy);
        if (!result.success) {
            return res.status(result.status || 400).json(result);
        }
        res.json(result);
    } catch (err) {
        console.error('Power cards exchange error:', err);
        res.status(500).json({ error: 'Failed to exchange cash for tokens.' });
    }
});

module.exports = router;
