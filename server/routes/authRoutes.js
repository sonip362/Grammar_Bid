const express = require('express');
const crypto = require('crypto');
const User = require('../../models/User');
const InboxMessage = require('../../models/InboxMessage');
const { generateToken, authMiddleware } = require('../middleware/auth');
const { loginRateLimiter, signupRateLimiter } = require('../middleware/rateLimiters');
const { getRankFromXP, calculateRankProgress } = require('../config/ranks');
const { ensureUserRankSync } = require('../services/xpService');
const { rooms, sanitizeRoom } = require('../game/gameState');

const router = express.Router();

const AVATAR_PRICES = {
    "Novice Quill.webp": 0,
    "Typo Inspector.webp": 0,
    "Diagram Draftsman.webp": 10000,
    "Golden Nib.webp": 15000,
    "Inkwell Scholar.webp": 25000,
    "Auctioneer's Gavel.webp": 35000,
    "Laurel Tome.webp": 50000,
    "Precision Target.webp": 60000,
    "Punctuation Matrix.webp": 75000,
    "Golden Crest.webp": 85000,
    "Explorer's Chart.webp": 100000,
    "Grand Crown.webp": 150000
};

const DEFAULT_FREE_AVATARS = [
    '/images/profile/Novice%20Quill.webp',
    '/images/profile/Typo%20Inspector.webp'
];

const ALLOWED_AVATAR_FILENAMES = new Set(Object.keys(AVATAR_PRICES));

function ensureUnlockedAvatars(user) {
    if (!Array.isArray(user.unlockedAvatars) || user.unlockedAvatars.length === 0) {
        user.unlockedAvatars = [...DEFAULT_FREE_AVATARS];
    }
    DEFAULT_FREE_AVATARS.forEach(a => {
        if (!user.unlockedAvatars.includes(a)) user.unlockedAvatars.push(a);
    });
    if (user.avatar && !user.unlockedAvatars.includes(user.avatar)) {
        user.unlockedAvatars.push(user.avatar);
    }
    return user.unlockedAvatars;
}

function computeUserStats(user) {
    const s = user.stats || {};
    const totalRounds = s.totalRoundsPlayed || 0;
    const correctDecisions = s.correctDecisions || 0;
    const auctionsWon = s.auctionsWon || 0;
    const totalCorrections = s.totalCorrectionsSubmitted || 0;
    const correctCorrections = s.correctCorrectionsSubmitted || 0;
    const bestBid = s.bestBid || 0;
    const currentStreak = s.currentStreak || 0;
    const bestStreak = s.bestStreak || 0;

    const accuracy = totalRounds > 0 ? Math.round((correctDecisions / totalRounds) * 100) : 0;
    const correctionAccuracy = totalCorrections > 0 ? Math.round((correctCorrections / totalCorrections) * 100) : 0;

    return {
        accuracy,
        auctionsWon,
        correctionAccuracy,
        bestBid,
        currentStreak,
        bestStreak,
        totalRoundsPlayed: totalRounds,
        totalCorrectionsSubmitted: totalCorrections
    };
}

async function generateAvailableGuestUsername() {
    for (let i = 0; i < 100; i++) {
        const num = Math.floor(Math.random() * 9999) + 1;
        const candidate = `Guest ${num}`;
        const existing = await User.findOne({ username: candidate });
        if (!existing) {
            return candidate;
        }
    }
    let seq = 1;
    while (true) {
        const candidate = `Guest ${seq}`;
        const existing = await User.findOne({ username: candidate });
        if (!existing) {
            return candidate;
        }
        seq++;
    }
}

// POST /api/auth/guest
router.post('/guest', async (req, res) => {
    try {
        const guestUsername = await generateAvailableGuestUsername();

        const FREE_SIGNUP_AVATARS = [
            "/images/profile/Novice%20Quill.webp",
            "/images/profile/Typo%20Inspector.webp"
        ];
        const randomAvatarUrl = FREE_SIGNUP_AVATARS[Math.floor(Math.random() * FREE_SIGNUP_AVATARS.length)];
        const randomPassword = typeof crypto.randomBytes === 'function'
            ? crypto.randomBytes(16).toString('hex')
            : Math.random().toString(36).substring(2) + Date.now();

        const user = new User({
            username: guestUsername,
            password: randomPassword,
            isGuest: true,
            avatar: randomAvatarUrl,
            unlockedAvatars: [
                "/images/profile/Novice%20Quill.webp",
                "/images/profile/Typo%20Inspector.webp"
            ]
        });
        await user.save();

        try {
            await InboxMessage.create({
                userId: user._id.toString(),
                type: 'system',
                title: '🎉 Welcome Guest!',
                body: `Welcome to Grammar Bid, ${user.username}! You are logged in as a guest. Your game progress, cash, and stats will be stored locally on your device. Step into the auction room and enjoy the game!`,
                imageUrl: '/Thank-You.webp',
                metadata: {
                    imageUrl: '/Thank-You.webp'
                }
            });
        } catch (msgErr) {
            console.error('Failed to create guest welcome message:', msgErr);
        }

        const token = generateToken(user._id);
        res.status(201).json({ token, userId: user._id, user: user.toJSON(), isGuest: true });
    } catch (err) {
        console.error('Guest login error:', err);
        res.status(500).json({ error: 'Failed to create guest session' });
    }
});

// POST /api/auth/signup
router.post('/signup', signupRateLimiter, async (req, res) => {
    try {
        const { username, password } = req.body;

        if (!username || !password || typeof password !== 'string') {
            return res.status(400).json({ error: 'Username and password are required' });
        }
        if (username.length < 3 || username.length > 20) {
            return res.status(400).json({ error: 'Username must be 3-20 characters' });
        }
        if (password.length < 8) {
            return res.status(400).json({ error: 'Password must be at least 8 characters' });
        }
        if (!/[A-Za-z]/.test(password) || !/[0-9]/.test(password)) {
            return res.status(400).json({ error: 'Password must contain both letters and numbers' });
        }

        const existingUser = await User.findOne({ username: username.trim() });
        if (existingUser) {
            return res.status(409).json({ error: 'Username already taken' });
        }

        const FREE_SIGNUP_AVATARS = [
            "/images/profile/Novice%20Quill.webp",
            "/images/profile/Typo%20Inspector.webp"
        ];
        const randomAvatarUrl = FREE_SIGNUP_AVATARS[Math.floor(Math.random() * FREE_SIGNUP_AVATARS.length)];
        const user = new User({
            username: username.trim(),
            password,
            avatar: randomAvatarUrl,
            unlockedAvatars: [
                "/images/profile/Novice%20Quill.webp",
                "/images/profile/Typo%20Inspector.webp"
            ]
        });
        await user.save();

        try {
            await InboxMessage.create({
                userId: user._id.toString(),
                type: 'system',
                title: '🎉 Welcome to Grammar Bid!',
                body: `Thank you for joining our service, ${user.username}! We are thrilled to have you here.\n\nStep into the auction room, bid smartly on grammar lots, identify flawed sentences, and climb the leaderboard!`,
                imageUrl: '/Thank-You.webp',
                metadata: {
                    imageUrl: '/Thank-You.webp'
                }
            });
        } catch (msgErr) {
            console.error('Failed to create welcome inbox message:', msgErr);
        }

        const token = generateToken(user._id);
        res.status(201).json({ token, userId: user._id, user: user.toJSON() });
    } catch (err) {
        console.error('Signup error:', err);
        res.status(500).json({ error: 'Server error' });
    }
});

// POST /api/auth/login
router.post('/login', loginRateLimiter, async (req, res) => {
    try {
        const { username, password } = req.body;

        if (!username || !password) {
            return res.status(400).json({ error: 'Username and password are required' });
        }

        const user = await User.findOne({ username: username.trim() });
        if (!user) {
            return res.status(401).json({ error: 'Invalid username or password' });
        }

        const isMatch = await user.comparePassword(password);
        if (!isMatch) {
            return res.status(401).json({ error: 'Invalid username or password' });
        }

        ensureUnlockedAvatars(user);
        await user.save();

        const token = generateToken(user._id);
        res.json({ token, userId: user._id, user: user.toJSON() });
    } catch (err) {
        console.error('Login error:', err);
        res.status(500).json({ error: 'Server error' });
    }
});

// GET /api/auth/me
router.get('/me', authMiddleware, async (req, res) => {
    ensureUnlockedAvatars(req.user);
    ensureUserRankSync(req.user);
    if (req.user.isModified('rank')) {
        await req.user.save();
    }
    const userObj = req.user.toJSON();
    userObj.xp = Math.max(0, req.user.xp || 0);
    userObj.rank = getRankFromXP(userObj.xp).name;
    userObj.rankProgress = calculateRankProgress(userObj.xp);
    userObj.computedStats = computeUserStats(req.user);
    res.json({ user: userObj });
});

// POST /api/auth/buy-avatar
router.post('/buy-avatar', authMiddleware, async (req, res) => {
    try {
        const { avatarUrl } = req.body;
        const user = req.user;

        if (!avatarUrl || typeof avatarUrl !== 'string') {
            return res.status(400).json({ error: 'Avatar URL is required' });
        }

        if (!avatarUrl.startsWith('/images/profile/')) {
            return res.status(400).json({ error: 'Invalid avatar URL.' });
        }

        ensureUnlockedAvatars(user);

        if (user.unlockedAvatars.includes(avatarUrl)) {
            return res.json({ success: true, message: 'Avatar already unlocked!', user: user.toJSON() });
        }

        const decodedUrl = decodeURIComponent(avatarUrl);
        const fileName = decodedUrl.substring(decodedUrl.lastIndexOf('/') + 1);

        if (!ALLOWED_AVATAR_FILENAMES.has(fileName)) {
            return res.status(400).json({ error: 'Unknown avatar.' });
        }

        if (fileName === 'Owl.gif' || fileName === 'proofreader.gif') {
            return res.status(403).json({ error: 'This animated GIF avatar is exclusive and can only be unlocked via Daily Rewards!' });
        }

        const price = AVATAR_PRICES[fileName] !== undefined ? AVATAR_PRICES[fileName] : 25000;

        const currentCash = user.cash !== undefined ? user.cash : 10000;
        if (currentCash < price) {
            return res.status(400).json({
                error: `Insufficient cash! You need $${price.toLocaleString()} but only have $${currentCash.toLocaleString()}.`
            });
        }

        user.cash = currentCash - price;
        user.unlockedAvatars.push(avatarUrl);
        user.avatar = avatarUrl;
        await user.save();

        const io = req.app.get('io');
        if (io) {
            for (const room of rooms.values()) {
                const player = room.players.find(p => p.userId === user._id.toString());
                if (player) {
                    player.avatar = user.avatar;
                    player.cash = user.cash;
                    io.to(room.code).emit('lobby_updated', { room: sanitizeRoom(room) });
                }
            }
        }

        const cleanName = fileName.replace(/\.webp$/i, '');
        res.json({
            success: true,
            message: `Unlocked ${cleanName}!`,
            user: user.toJSON()
        });
    } catch (err) {
        console.error('Buy avatar error:', err);
        res.status(500).json({ error: 'Failed to purchase avatar' });
    }
});

// PUT /api/auth/profile
router.put('/profile', authMiddleware, async (req, res) => {
    try {
        const { username, avatar } = req.body;
        const user = req.user;

        if (username && username.trim() !== user.username) {
            if (user.isGuest) {
                return res.status(403).json({ error: 'Guest accounts cannot change their username directly. Upgrade to a full account to pick a custom username!' });
            }
            const cleanUsername = username.trim();
            if (cleanUsername.length < 3 || cleanUsername.length > 20) {
                return res.status(400).json({ error: 'Username must be 3-20 characters' });
            }

            const currentCash = user.cash !== undefined ? user.cash : 10000;
            if (currentCash < 300) {
                return res.status(400).json({ error: 'Insufficient cash! Changing username costs $300.' });
            }

            const existing = await User.findOne({ username: cleanUsername, _id: { $ne: user._id } });
            if (existing) {
                return res.status(409).json({ error: 'Username already taken by another player' });
            }

            user.username = cleanUsername;
            user.cash = currentCash - 300;
        }

        if (avatar && typeof avatar === 'string') {
            ensureUnlockedAvatars(user);
            const isUnlocked = user.unlockedAvatars.includes(avatar) ||
                avatar.includes('Novice%20Quill') || avatar.includes('Typo%20Inspector');
            if (!isUnlocked) {
                return res.status(403).json({ error: 'This avatar is locked! Purchase it first.' });
            }
            user.avatar = avatar;
        }

        await user.save();
        const token = generateToken(user._id);

        const io = req.app.get('io');
        if (io) {
            for (const room of rooms.values()) {
                const player = room.players.find(p => p.userId === user._id.toString());
                if (player) {
                    player.username = user.username;
                    player.avatar = user.avatar;
                    player.cash = user.cash !== undefined ? user.cash : 10000;
                    io.to(room.code).emit('lobby_updated', { room: sanitizeRoom(room) });
                }
            }
        }

        res.json({ token, userId: user._id, user: user.toJSON() });
    } catch (err) {
        console.error('Update profile error:', err);
        res.status(500).json({ error: 'Failed to update profile' });
    }
});

// POST /api/auth/convert-guest
router.post('/convert-guest', authMiddleware, async (req, res) => {
    try {
        const user = req.user;
        if (!user.isGuest) {
            return res.status(400).json({ error: 'Account is already a permanent user account.' });
        }

        const { username, password } = req.body;

        if (!username || !password || typeof password !== 'string') {
            return res.status(400).json({ error: 'Username and password are required.' });
        }

        const cleanUsername = username.trim();
        if (cleanUsername.length < 3 || cleanUsername.length > 20) {
            return res.status(400).json({ error: 'Username must be 3-20 characters.' });
        }

        if (password.length < 8) {
            return res.status(400).json({ error: 'Password must be at least 8 characters.' });
        }
        if (!/[A-Za-z]/.test(password) || !/[0-9]/.test(password)) {
            return res.status(400).json({ error: 'Password must contain both letters and numbers.' });
        }

        const existing = await User.findOne({ username: cleanUsername, _id: { $ne: user._id } });
        if (existing) {
            return res.status(409).json({ error: 'Username already taken by another player.' });
        }

        user.username = cleanUsername;
        user.password = password;
        user.isGuest = false;
        await user.save();

        const io = req.app.get('io');
        if (io) {
            for (const room of rooms.values()) {
                const player = room.players.find(p => p.userId === user._id.toString());
                if (player) {
                    player.username = user.username;
                    io.to(room.code).emit('lobby_updated', { room: sanitizeRoom(room) });
                }
            }
        }

        const token = generateToken(user._id);
        res.json({ success: true, message: 'Account converted successfully!', token, userId: user._id, user: user.toJSON() });
    } catch (err) {
        console.error('Convert guest error:', err);
        res.status(500).json({ error: 'Failed to convert guest account.' });
    }
});

module.exports = router;
