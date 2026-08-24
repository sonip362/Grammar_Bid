const crypto = require('crypto');
if (!globalThis.crypto) {
    globalThis.crypto = crypto;
}

require('dotenv').config();

// ─── Global Quiet Logs Mode ──────────────────────────────────
if (process.env.QUIET_LOGS === 'true') {
    const _origLog = console.log;
    console.log = function (...args) {
        const msg = args.map(a => (typeof a === 'object' ? JSON.stringify(a) : String(a))).join(' ');
        if (msg.includes('Server running') || msg.includes('Connected to MongoDB') || msg.includes('injected env')) {
            _origLog.apply(console, args);
        }
    };
    console.warn = function () { };
}

const express = require('express');
const http = require('http');
const path = require('path');
const cors = require('cors');
const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');
const { Server } = require('socket.io');
const User = require('./models/User');
const Log = require('./models/Log');
const QuestionReport = require('./models/QuestionReport');
const Transaction = require('./models/Transaction');
const InboxMessage = require('./models/InboxMessage');
const XPTransaction = require('./models/XPTransaction');
const { RANKS, XP_REWARDS, getRankFromXP, calculateRankProgress } = require('./server/config/ranks');
const { awardXP, ensureUserRankSync, getUserProgression } = require('./server/services/xpService');
const { getDailyRewardStatus, claimDailyReward } = require('./server/services/dailyRewardService');
const { POWER_CARDS, getUserPowerCards, purchasePowerCard, exchangeCashForTokens, consumeAndApplyCard, clearRoundActiveCardEffects } = require('./server/services/powerCardService');
const { generateSentence } = require('./data/generateSentence');
const { registerBotHandlers, onBiddingStart, onPlayerBid, onRoundStart, onRoundResult, onCorrectionStart, onGameOver, destroyRoomBots } = require('./server/sockets/botHandler');
const { VAPID_PUBLIC_KEY, saveSubscription, removeSubscription, sendPushToUser, sendPushToAll } = require('./server/services/pushService');

// ─── App & Server Setup ──────────────────────────────────────
const app = express();
const server = http.createServer(app);
const io = new Server(server, {
    cors: { origin: '*' },
    pingTimeout: 45000,
    pingInterval: 15000,
    connectTimeout: 45000,
    transports: ['websocket', 'polling']
});

const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'fallback_secret';

// ─── Admin Config ────────────────────────────────────────────
// ⚠️ SET YOUR ADMIN CODE HERE (also add ADMIN_CODE to .env for production)
const ADMIN_CODE = process.env.ADMIN_CODE || 'grammar2025';

app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ limit: '10mb', extended: true }));

// Serve static files from clean directory structure
app.use(express.static(path.join(__dirname, 'pages/templates')));
app.use(express.static(path.join(__dirname, 'pages/styles')));
app.use(express.static(path.join(__dirname, 'pages/javascript')));
app.use(express.static(path.join(__dirname, 'assests')));
app.use(express.static(path.join(__dirname, 'assests/images')));
app.use(express.static(path.join(__dirname, 'assests/SFX')));
app.use('/SFX', express.static(path.join(__dirname, 'assests/SFX')));
app.use('/Mini_Games', express.static(path.join(__dirname, 'Mini_Games/pages')));
app.use('/Mini_Games/pages', express.static(path.join(__dirname, 'Mini_Games/pages')));
app.use('/Mini_Games/javascript', express.static(path.join(__dirname, 'Mini_Games/javascript')));
app.use('/assets/icons', express.static(path.join(__dirname, 'assets/icons')));
app.use(express.static(__dirname));

// Route for root '/'
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'pages/templates/index.html'));
});

// Route for '/help'
app.get('/help', (req, res) => {
    res.sendFile(path.join(__dirname, 'pages/templates/help.html'));
});

// ─── MongoDB Connection ──────────────────────────────────────
mongoose.connect(process.env.MONGO_URI)
    .then(async () => {
        console.log('✅ Connected to MongoDB Atlas');
        try {
            await Transaction.collection.dropIndex('reportId_1_userId_1_type_1');
            console.log('🧹 Dropped legacy Transaction index reportId_1_userId_1_type_1');
        } catch (e) { }
        try {
            await Transaction.syncIndexes();
            console.log('✅ Transaction indexes synced successfully.');
        } catch (e) { }
    })
    .catch(err => console.error('❌ MongoDB connection error:', err));

// ─── Online User Tracking ────────────────────────────────────
const onlineUserIds = new Set();

// ─── Log Capture System (saves console output to MongoDB) ────
const _origLog = console.log.bind(console);
const _origError = console.error.bind(console);
const _origWarn = console.warn.bind(console);

function saveLog(level, args) {
    if (level !== 'warn' && level !== 'error') return;
    const message = args.map(a => (typeof a === 'string' ? a : JSON.stringify(a))).join(' ');
    Log.create({ level, message }).catch(() => { });
}

console.log = (...args) => { _origLog(...args); };
console.error = (...args) => { _origError(...args); saveLog('error', args); };
console.warn = (...args) => { _origWarn(...args); saveLog('warn', args); };

// ─── JWT Helper ──────────────────────────────────────────────
function generateToken(userId) {
    return jwt.sign({ userId }, JWT_SECRET, { expiresIn: '7d' });
}

function verifyToken(token) {
    try {
        return jwt.verify(token, JWT_SECRET);
    } catch {
        return null;
    }
}

// ─── Auth Middleware ──────────────────────────────────────────
async function authMiddleware(req, res, next) {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ error: 'No token provided' });
    }
    const decoded = verifyToken(authHeader.split(' ')[1]);
    if (!decoded) {
        return res.status(401).json({ error: 'Invalid token' });
    }
    const user = await User.findById(decoded.userId);
    if (!user) {
        return res.status(401).json({ error: 'User not found' });
    }
    req.user = user;
    next();
}

// ─── Admin Middleware ────────────────────────────────────────
function adminMiddleware(req, res, next) {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ error: 'No admin token' });
    }
    const token = authHeader.split(' ')[1];
    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        if (!decoded.isAdmin) return res.status(401).json({ error: 'Not admin' });
        next();
    } catch {
        return res.status(401).json({ error: 'Invalid admin token' });
    }
}

// ─── Admin API Routes ────────────────────────────────────────
app.post('/api/admin/verify', (req, res) => {
    const { code } = req.body;
    if (!code || code !== ADMIN_CODE) {
        return res.status(403).json({ success: false, error: 'Invalid admin code.' });
    }
    const token = jwt.sign({ isAdmin: true }, JWT_SECRET, { expiresIn: '4h' });
    res.json({ success: true, token });
});

app.get('/api/admin/users', adminMiddleware, async (req, res) => {
    try {
        const users = await User.find({}).select('-password').sort({ createdAt: -1 }).lean();
        res.json({ users, onlineUserIds: Array.from(onlineUserIds) });
    } catch (err) {
        res.status(500).json({ error: 'Failed to fetch users.' });
    }
});

app.delete('/api/admin/users/:userId', adminMiddleware, async (req, res) => {
    try {
        const { userId } = req.params;
        if (!userId) return res.status(400).json({ error: 'User ID required.' });

        const deletedUser = await User.findByIdAndDelete(userId);
        if (!deletedUser) {
            return res.status(404).json({ error: 'User not found.' });
        }

        res.json({ success: true, message: `Deleted ${deletedUser.username}` });
    } catch (err) {
        res.status(500).json({ error: 'Failed to delete user.' });
    }
});

app.get('/api/admin/logs', adminMiddleware, async (req, res) => {
    try {
        const logs = await Log.find({}).sort({ timestamp: -1 }).limit(500).lean();
        res.json({ logs });
    } catch (err) {
        res.status(500).json({ error: 'Failed to fetch logs.' });
    }
});

app.delete('/api/admin/logs', adminMiddleware, async (req, res) => {
    try {
        await Log.deleteMany({});
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: 'Failed to clear logs.' });
    }
});

// ─── Admin Broadcast & Cash Reward Grants ──────────────────────
app.post('/api/admin/broadcast', adminMiddleware, async (req, res) => {
    try {
        const { target, userId, type, title, body, cashReward, imageUrl } = req.body;

        if (!title || !title.trim() || !body || !body.trim()) {
            return res.status(400).json({ error: 'Title and body message are required.' });
        }

        const msgType = type === 'reward' ? 'reward' : (type === 'news' ? 'news' : 'announcement');
        const rewardAmount = (msgType === 'reward' && Number(cashReward) > 0) ? Number(cashReward) : 0;
        const cleanImageUrl = imageUrl && typeof imageUrl === 'string' && imageUrl.startsWith('data:image/') ? imageUrl : null;

        if (target === 'user') {
            if (!userId) return res.status(400).json({ error: 'User ID is required for targeted message.' });
            const user = await User.findById(userId);
            if (!user) return res.status(404).json({ error: 'User not found.' });

            let oldCash = user.cash !== undefined ? user.cash : 10000;
            if (rewardAmount > 0) {
                user.cash = oldCash + rewardAmount;
                await user.save();

                await Transaction.create({
                    transactionId: `txn_grant_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
                    userId: user._id.toString(),
                    username: user.username,
                    type: 'ADMIN_GRANT',
                    amount: rewardAmount,
                    balanceBefore: oldCash,
                    balanceAfter: user.cash,
                    reason: `Admin Grant: ${title.trim()}`
                });
            }

            await InboxMessage.create({
                userId: user._id.toString(),
                type: msgType,
                title: title.trim(),
                body: body.trim(),
                imageUrl: cleanImageUrl,
                metadata: {
                    amount: rewardAmount > 0 ? rewardAmount : null,
                    imageUrl: cleanImageUrl
                }
            });

            // Push notification for targeted user
            sendPushToUser(user._id.toString(), {
                title: `📬 ${title.trim()}`,
                body: body.trim(),
                url: '/'
            }).catch(() => { });

            return res.json({ success: true, recipientCount: 1, message: `Message sent to ${user.username}` });
        } else {
            // Target: all users
            const users = await User.find({}).lean();
            if (users.length === 0) return res.status(400).json({ error: 'No users found.' });

            const inboxDocs = [];
            for (const u of users) {
                let oldCash = u.cash !== undefined ? u.cash : 10000;
                let updatedCash = oldCash;
                if (rewardAmount > 0) {
                    updatedCash = oldCash + rewardAmount;
                    await User.findByIdAndUpdate(u._id, { $inc: { cash: rewardAmount } });
                    await Transaction.create({
                        transactionId: `txn_grant_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
                        userId: u._id.toString(),
                        username: u.username,
                        type: 'ADMIN_GRANT',
                        amount: rewardAmount,
                        balanceBefore: oldCash,
                        balanceAfter: updatedCash,
                        reason: `Admin Grant: ${title.trim()}`
                    });
                }

                inboxDocs.push({
                    userId: u._id.toString(),
                    type: msgType,
                    title: title.trim(),
                    body: body.trim(),
                    imageUrl: cleanImageUrl,
                    metadata: {
                        amount: rewardAmount > 0 ? rewardAmount : null,
                        imageUrl: cleanImageUrl
                    }
                });
            }

            if (inboxDocs.length > 0) {
                await InboxMessage.insertMany(inboxDocs);
            }

            // Push notification broadcast to all users
            sendPushToAll({
                title: `📢 ${title.trim()}`,
                body: body.trim(),
                url: '/'
            }).catch(() => { });

            return res.json({
                success: true,
                recipientCount: users.length,
                message: `Broadcast successfully sent to all ${users.length} users!`
            });
        }
    } catch (err) {
        console.error('Admin broadcast error:', err);
        res.status(500).json({ error: 'Failed to send broadcast.' });
    }
});

// ─── Push Notification API Routes ─────────────────────────────
app.get('/api/notifications/vapid-key', (req, res) => {
    res.json({ publicKey: VAPID_PUBLIC_KEY || null });
});

app.post('/api/notifications/subscribe', authMiddleware, async (req, res) => {
    try {
        const { subscription } = req.body;
        if (!subscription || !subscription.endpoint || !subscription.keys) {
            return res.status(400).json({ error: 'Invalid subscription object.' });
        }
        const result = await saveSubscription(req.user._id.toString(), subscription);
        if (!result.success) return res.status(500).json({ error: result.error });
        res.json({ success: true, message: 'Push subscription saved.' });
    } catch (err) {
        console.error('Push subscribe error:', err);
        res.status(500).json({ error: 'Failed to subscribe.' });
    }
});

app.post('/api/notifications/unsubscribe', authMiddleware, async (req, res) => {
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

// ═══════════════════════════════════════════════════════════════
//  Question Report + Admin Review + Compensation + Inbox System
// ═══════════════════════════════════════════════════════════════

// ─── Player: Submit a Question Report ────────────────────────
app.post('/api/reports', authMiddleware, async (req, res) => {
    try {
        const user = req.user;
        const { questionId, reason, playerExplanation, questionSnapshot, roomCode, roundNumber, bidAmount, matchId } = req.body;

        if (!questionId || !reason) {
            return res.status(400).json({ error: 'questionId and reason are required.' });
        }

        const validReasons = ['incorrect_verdict', 'incorrect_correction', 'ambiguous', 'nonsensical', 'other'];
        if (!validReasons.includes(reason)) {
            return res.status(400).json({ error: 'Invalid report reason.' });
        }

        if (!questionSnapshot || !questionSnapshot.sentence) {
            return res.status(400).json({ error: 'Question snapshot with sentence is required.' });
        }

        // Prevent duplicate reports
        const existing = await QuestionReport.findOne({ reporterId: user._id.toString(), questionId });
        if (existing) {
            return res.status(409).json({ error: 'You have already reported this question.' });
        }

        const reportId = `rpt_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;

        const report = new QuestionReport({
            reportId,
            questionId,
            reporterId: user._id.toString(),
            reporterUsername: user.username,
            matchId: matchId || null,
            roomCode: roomCode || null,
            roundNumber: roundNumber || null,
            bidAmount: typeof bidAmount === 'number' ? bidAmount : 0,
            questionSnapshot: {
                sentence: questionSnapshot.sentence,
                isCorrect: questionSnapshot.isCorrect,
                correction: questionSnapshot.correction || null,
                flawedPhrase: questionSnapshot.flawedPhrase || null,
                correctPhrase: questionSnapshot.correctPhrase || null,
                category: questionSnapshot.category || null,
                hintText: questionSnapshot.hintText || null,
                englishVariety: questionSnapshot.englishVariety || null,
                validationReasoning: questionSnapshot.validationReasoning || null
            },
            reason,
            playerExplanation: (playerExplanation || '').substring(0, 500),
            status: 'pending'
        });

        await report.save();
        console.log(`📋 Report ${reportId} submitted by ${user.username} for question ${questionId}`);
        res.status(201).json({ success: true, reportId });
    } catch (err) {
        if (err.code === 11000) {
            return res.status(409).json({ error: 'You have already reported this question.' });
        }
        console.error('Submit report error:', err);
        res.status(500).json({ error: 'Failed to submit report.' });
    }
});

// ─── Player: Get Inbox Messages ──────────────────────────────
app.get('/api/inbox', authMiddleware, async (req, res) => {
    try {
        const userId = req.user._id.toString();
        const messages = await InboxMessage.find({ userId }).sort({ createdAt: -1 }).limit(50).lean();
        const unreadCount = await InboxMessage.countDocuments({ userId, isRead: false });
        res.json({ messages, unreadCount });
    } catch (err) {
        console.error('Inbox fetch error:', err);
        res.status(500).json({ error: 'Failed to load inbox.' });
    }
});

// ─── Player: Get Unread Count ────────────────────────────────
app.get('/api/inbox/unread-count', authMiddleware, async (req, res) => {
    try {
        const userId = req.user._id.toString();
        const unreadCount = await InboxMessage.countDocuments({ userId, isRead: false });
        res.json({ unreadCount });
    } catch (err) {
        res.status(500).json({ error: 'Failed to get unread count.' });
    }
});

// ─── Player: Mark Message as Read ────────────────────────────
app.put('/api/inbox/:messageId/read', authMiddleware, async (req, res) => {
    try {
        const userId = req.user._id.toString();
        const msg = await InboxMessage.findOneAndUpdate(
            { _id: req.params.messageId, userId },
            { $set: { isRead: true } },
            { returnDocument: 'after' }
        );
        if (!msg) return res.status(404).json({ error: 'Message not found.' });
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: 'Failed to mark as read.' });
    }
});

// ─── Player: Mark All as Read ────────────────────────────────
app.put('/api/inbox/read-all', authMiddleware, async (req, res) => {
    try {
        const userId = req.user._id.toString();
        await InboxMessage.updateMany({ userId, isRead: false }, { $set: { isRead: true } });
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: 'Failed to mark all as read.' });
    }
});

// ─── Player: Delete Single Inbox Message ─────────────────────
app.delete('/api/inbox/:messageId', authMiddleware, async (req, res) => {
    try {
        const userId = req.user._id.toString();
        const deletedMsg = await InboxMessage.findOneAndDelete({ _id: req.params.messageId, userId });
        if (!deletedMsg) {
            return res.status(404).json({ error: 'Message not found or unauthorized.' });
        }
        res.json({ success: true, message: 'Message deleted successfully.' });
    } catch (err) {
        console.error('Delete message error:', err);
        res.status(500).json({ error: 'Failed to delete message.' });
    }
});

// ─── Player: Clear All Inbox Messages ────────────────────────
app.delete('/api/inbox', authMiddleware, async (req, res) => {
    try {
        const userId = req.user._id.toString();
        await InboxMessage.deleteMany({ userId });
        res.json({ success: true, message: 'All messages cleared successfully.' });
    } catch (err) {
        console.error('Clear all messages error:', err);
        res.status(500).json({ error: 'Failed to clear inbox.' });
    }
});

// ─── Player: Save Tutorial Completion ─────────────────────────
app.post('/api/user/complete-tutorial', async (req, res) => {
    try {
        let userId = req.body.userId;
        const authHeader = req.headers.authorization;
        if (authHeader && authHeader.startsWith('Bearer ')) {
            const decoded = verifyToken(authHeader.split(' ')[1]);
            if (decoded && decoded.userId) userId = decoded.userId;
        }

        if (!userId) {
            return res.status(400).json({ error: 'User ID required.' });
        }

        const updatedUser = await User.findByIdAndUpdate(
            userId,
            { $set: { tutorialCompleted: true } },
            { returnDocument: 'after' }
        );

        if (!updatedUser) {
            return res.status(404).json({ error: 'User not found.' });
        }

        console.log(`🎓 Tutorial marked complete in DB for user: ${updatedUser.username} (${updatedUser._id})`);
        res.json({ success: true, message: 'Tutorial marked complete.' });
    } catch (err) {
        console.error('Save tutorial completion error:', err);
        res.status(500).json({ error: 'Failed to save tutorial status.' });
    }
});

// ─── Daily Rewards System Routes ──────────────────────────────
app.get('/api/daily-reward/status', authMiddleware, async (req, res) => {
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

app.post('/api/daily-reward/claim', authMiddleware, async (req, res) => {
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

// ─── Mini Games System: Flappy Bird Status & Real Cash Rewards ───────────────
app.get('/api/mini-games/flappy/status', authMiddleware, async (req, res) => {
    try {
        const user = req.user;
        const todayStr = new Date().toISOString().split('T')[0];

        if (!user.miniGames) user.miniGames = {};
        if (!user.miniGames.flappy) {
            user.miniGames.flappy = { lastPlayDate: todayStr, attemptsToday: 0 };
        }

        if (user.miniGames.flappy.lastPlayDate !== todayStr) {
            user.miniGames.flappy.lastPlayDate = todayStr;
            user.miniGames.flappy.attemptsToday = 0;
            user.markModified('miniGames');
            await user.save();
        }

        const attemptsToday = user.miniGames.flappy.attemptsToday || 0;
        const remainingAttempts = Math.max(0, 5 - attemptsToday);

        res.json({
            success: true,
            attemptsToday,
            remainingAttempts,
            maxAttempts: 5,
            cash: user.cash
        });
    } catch (err) {
        console.error('Flappy status error:', err);
        res.status(500).json({ error: 'Failed to fetch Flappy Bird status.' });
    }
});

app.post('/api/mini-games/flappy/submit-reward', authMiddleware, async (req, res) => {
    try {
        const user = req.user;
        const { pipesCleared } = req.body;
        const todayStr = new Date().toISOString().split('T')[0];

        if (!user.miniGames) user.miniGames = {};
        if (!user.miniGames.flappy) {
            user.miniGames.flappy = { lastPlayDate: todayStr, attemptsToday: 0 };
        }

        if (user.miniGames.flappy.lastPlayDate !== todayStr) {
            user.miniGames.flappy.lastPlayDate = todayStr;
            user.miniGames.flappy.attemptsToday = 0;
        }

        const currentAttempts = user.miniGames.flappy.attemptsToday || 0;
        if (currentAttempts >= 5) {
            return res.status(400).json({
                success: false,
                error: 'Daily limit of 5 tries reached! Come back tomorrow.'
            });
        }

        // Consume 1 attempt
        user.miniGames.flappy.attemptsToday = currentAttempts + 1;
        user.miniGames.flappy.lastPlayDate = todayStr;

        const validPipes = Math.max(0, parseInt(pipesCleared || 0, 10));
        const tokensEarned = validPipes * 1; // 1 Gold Token per pipe cleared
        const balanceBefore = user.tokens || 0;

        if (tokensEarned > 0) {
            user.tokens = (user.tokens || 0) + tokensEarned;

            const txId = `TX_FLAPPY_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
            await Transaction.create({
                transactionId: txId,
                userId: user._id.toString(),
                username: user.username || user.name || 'Guest Player',
                type: 'MINI_GAME_REWARD',
                amount: tokensEarned,
                balanceBefore,
                balanceAfter: user.tokens,
                reason: `Flappy Bird cleared ${validPipes} pipes (+${tokensEarned} Gold Tokens)`
            });
        }

        user.markModified('miniGames');
        await user.save();

        const remainingAttempts = Math.max(0, 5 - user.miniGames.flappy.attemptsToday);

        res.json({
            success: true,
            tokensEarned,
            newTokensBalance: user.tokens,
            attemptsToday: user.miniGames.flappy.attemptsToday,
            remainingAttempts
        });
    } catch (err) {
        console.error('Flappy submit reward error:', err);
        res.status(500).json({ error: 'Failed to process Flappy Bird reward.' });
    }
});

// ─── Mini Games System: Tic Tac Toe Status & Real Cash Rewards ───────────────
app.get('/api/mini-games/tic-tac-toe/status', authMiddleware, async (req, res) => {
    try {
        const user = req.user;
        const todayStr = new Date().toISOString().split('T')[0];

        if (!user.miniGames) user.miniGames = {};
        if (!user.miniGames.ticTacToe) {
            user.miniGames.ticTacToe = { lastPlayDate: todayStr, attemptsToday: 0 };
        }

        if (user.miniGames.ticTacToe.lastPlayDate !== todayStr) {
            user.miniGames.ticTacToe.lastPlayDate = todayStr;
            user.miniGames.ticTacToe.attemptsToday = 0;
            user.markModified('miniGames');
            await user.save();
        }

        const attemptsToday = user.miniGames.ticTacToe.attemptsToday || 0;
        const remainingAttempts = Math.max(0, 5 - attemptsToday);

        res.json({
            success: true,
            attemptsToday,
            remainingAttempts,
            maxAttempts: 5,
            cash: user.cash
        });
    } catch (err) {
        console.error('Tic Tac Toe status error:', err);
        res.status(500).json({ error: 'Failed to fetch Tic Tac Toe status.' });
    }
});

app.post('/api/mini-games/tic-tac-toe/submit-reward', authMiddleware, async (req, res) => {
    try {
        const user = req.user;
        const { result } = req.body; // 'WIN', 'LOSS', 'DRAW'
        const todayStr = new Date().toISOString().split('T')[0];

        if (!user.miniGames) user.miniGames = {};
        if (!user.miniGames.ticTacToe) {
            user.miniGames.ticTacToe = { lastPlayDate: todayStr, attemptsToday: 0 };
        }

        if (user.miniGames.ticTacToe.lastPlayDate !== todayStr) {
            user.miniGames.ticTacToe.lastPlayDate = todayStr;
            user.miniGames.ticTacToe.attemptsToday = 0;
        }

        const currentAttempts = user.miniGames.ticTacToe.attemptsToday || 0;
        if (currentAttempts >= 5) {
            return res.status(400).json({
                success: false,
                error: 'Daily limit of 5 tries reached! Come back tomorrow.'
            });
        }

        // Consume 1 attempt for every match played (WIN, LOSS, DRAW)
        user.miniGames.ticTacToe.attemptsToday = currentAttempts + 1;
        user.miniGames.ticTacToe.lastPlayDate = todayStr;

        const isWin = result === 'WIN';
        const isDraw = result === 'DRAW';
        let tokensEarned = 0;
        if (isWin) tokensEarned = 2;
        else if (isDraw) tokensEarned = 1;

        const balanceBefore = user.tokens || 0;

        if (tokensEarned > 0) {
            user.tokens = (user.tokens || 0) + tokensEarned;

            const txId = `TX_TTT_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
            await Transaction.create({
                transactionId: txId,
                userId: user._id.toString(),
                username: user.username || user.name || 'Guest Player',
                type: 'MINI_GAME_REWARD',
                amount: tokensEarned,
                balanceBefore,
                balanceAfter: user.tokens,
                reason: `Tic Tac Toe ${result} against AI (+${tokensEarned} Gold Tokens)`
            });
        }

        user.markModified('miniGames');
        await user.save();

        const remainingAttempts = Math.max(0, 5 - user.miniGames.ticTacToe.attemptsToday);

        res.json({
            success: true,
            isWin,
            isDraw,
            tokensEarned,
            newTokensBalance: user.tokens,
            attemptsToday: user.miniGames.ticTacToe.attemptsToday,
            remainingAttempts
        });
    } catch (err) {
        console.error('Tic Tac Toe submit reward error:', err);
        res.status(500).json({ error: 'Failed to process Tic Tac Toe reward.' });
    }
});

// ─── Mini Games System: Help the AI Status & Real Cash Rewards ───────────────
app.get('/api/mini-games/help-ai/status', authMiddleware, async (req, res) => {
    try {
        const user = req.user;
        const todayStr = new Date().toISOString().split('T')[0];

        if (!user.miniGames) user.miniGames = {};
        if (!user.miniGames.helpAi) {
            user.miniGames.helpAi = { lastPlayDate: todayStr, attemptsToday: 0 };
        }

        if (user.miniGames.helpAi.lastPlayDate !== todayStr) {
            user.miniGames.helpAi.lastPlayDate = todayStr;
            user.miniGames.helpAi.attemptsToday = 0;
            user.markModified('miniGames');
            await user.save();
        }

        const attemptsToday = user.miniGames.helpAi.attemptsToday || 0;
        const remainingAttempts = Math.max(0, 5 - attemptsToday);

        res.json({
            success: true,
            attemptsToday,
            remainingAttempts,
            maxAttempts: 5,
            cash: user.cash
        });
    } catch (err) {
        console.error('Help AI status error:', err);
        res.status(500).json({ error: 'Failed to fetch Help AI status.' });
    }
});

app.post('/api/mini-games/help-ai/start-attempt', authMiddleware, async (req, res) => {
    try {
        const user = req.user;
        const todayStr = new Date().toISOString().split('T')[0];

        if (!user.miniGames) user.miniGames = {};
        if (!user.miniGames.helpAi) {
            user.miniGames.helpAi = { lastPlayDate: todayStr, attemptsToday: 0 };
        }

        if (user.miniGames.helpAi.lastPlayDate !== todayStr) {
            user.miniGames.helpAi.lastPlayDate = todayStr;
            user.miniGames.helpAi.attemptsToday = 0;
        }

        const currentAttempts = user.miniGames.helpAi.attemptsToday || 0;
        if (currentAttempts >= 5) {
            return res.status(400).json({
                success: false,
                error: 'Daily limit of 5 tries reached! Come back tomorrow.'
            });
        }

        const startTime = Date.now();
        user.miniGames.helpAi.sessionStartTime = startTime;
        user.markModified('miniGames');
        await user.save();

        res.json({
            success: true,
            startTime,
            timeLimitSeconds: 20,
            remainingAttempts: Math.max(0, 5 - currentAttempts)
        });
    } catch (err) {
        console.error('Help AI start attempt error:', err);
        res.status(500).json({ error: 'Failed to start Help AI attempt.' });
    }
});

app.post('/api/mini-games/help-ai/submit-reward', authMiddleware, async (req, res) => {
    try {
        const user = req.user;
        let { gameSuccess, timeRemaining } = req.body;
        const todayStr = new Date().toISOString().split('T')[0];

        if (!user.miniGames) user.miniGames = {};
        if (!user.miniGames.helpAi) {
            user.miniGames.helpAi = { lastPlayDate: todayStr, attemptsToday: 0 };
        }

        if (user.miniGames.helpAi.lastPlayDate !== todayStr) {
            user.miniGames.helpAi.lastPlayDate = todayStr;
            user.miniGames.helpAi.attemptsToday = 0;
        }

        const currentAttempts = user.miniGames.helpAi.attemptsToday || 0;
        if (currentAttempts >= 5) {
            return res.status(400).json({
                success: false,
                error: 'Daily limit of 5 tries reached! Come back tomorrow.'
            });
        }

        // STRICT BACKEND TIMER VALIDATION (20 seconds limit + 4s network latency tolerance)
        const sessionStartTime = user.miniGames.helpAi.sessionStartTime;
        if (sessionStartTime) {
            const elapsedSeconds = (Date.now() - sessionStartTime) / 1000;
            if (elapsedSeconds > 24) {
                console.log(`[Help AI] Attempt rejected: Backend time limit exceeded (${elapsedSeconds.toFixed(1)}s > 20s)`);
                gameSuccess = false;
            }
        }
        user.miniGames.helpAi.sessionStartTime = null; // Reset session timer

        // Consume 1 attempt
        user.miniGames.helpAi.attemptsToday = currentAttempts + 1;
        user.miniGames.helpAi.lastPlayDate = todayStr;

        const isWin = Boolean(gameSuccess);
        const tokensEarned = isWin ? 3 : 0;
        const balanceBefore = user.tokens || 0;

        if (tokensEarned > 0) {
            user.tokens = (user.tokens || 0) + tokensEarned;

            const txId = `TX_HELPAI_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
            await Transaction.create({
                transactionId: txId,
                userId: user._id.toString(),
                username: user.username || user.name || 'Guest Player',
                type: 'MINI_GAME_REWARD',
                amount: tokensEarned,
                balanceBefore,
                balanceAfter: user.tokens,
                reason: `Help the AI Wire Pipeline rebooted (+3 Gold Tokens)`
            });
        }

        user.markModified('miniGames');
        await user.save();

        const remainingAttempts = Math.max(0, 5 - user.miniGames.helpAi.attemptsToday);

        res.json({
            success: true,
            isWin,
            tokensEarned,
            newTokensBalance: user.tokens,
            attemptsToday: user.miniGames.helpAi.attemptsToday,
            remainingAttempts
        });
    } catch (err) {
        console.error('Help AI submit reward error:', err);
        res.status(500).json({ error: 'Failed to process Help AI reward.' });
    }
});

// ─── Pattern / Math Sequence Mini Game Endpoints ───────────────
app.get(['/api/mini-games/pattern-sequence/status', '/api/mini-games/math-sequence/status'], authMiddleware, async (req, res) => {
    try {
        const user = req.user;
        const todayStr = new Date().toISOString().split('T')[0];
        if (!user.miniGames) user.miniGames = {};
        if (!user.miniGames.patternSequence) {
            user.miniGames.patternSequence = { lastPlayDate: todayStr, attemptsToday: 0 };
        }
        if (user.miniGames.patternSequence.lastPlayDate !== todayStr) {
            user.miniGames.patternSequence.lastPlayDate = todayStr;
            user.miniGames.patternSequence.attemptsToday = 0;
            user.markModified('miniGames');
            await user.save();
        }
        const currentAttempts = user.miniGames.patternSequence.attemptsToday || 0;
        res.json({
            success: true,
            attemptsToday: currentAttempts,
            remainingAttempts: Math.max(0, 5 - currentAttempts)
        });
    } catch (err) {
        console.error('Pattern Sequence status check error:', err);
        res.status(500).json({ error: 'Failed to check Pattern Sequence status.' });
    }
});

app.post(['/api/mini-games/pattern-sequence/start-attempt', '/api/mini-games/math-sequence/start-attempt'], authMiddleware, async (req, res) => {
    try {
        const user = req.user;
        const todayStr = new Date().toISOString().split('T')[0];
        if (!user.miniGames) user.miniGames = {};
        if (!user.miniGames.patternSequence) {
            user.miniGames.patternSequence = { lastPlayDate: todayStr, attemptsToday: 0 };
        }
        if (user.miniGames.patternSequence.lastPlayDate !== todayStr) {
            user.miniGames.patternSequence.lastPlayDate = todayStr;
            user.miniGames.patternSequence.attemptsToday = 0;
        }

        const currentAttempts = user.miniGames.patternSequence.attemptsToday || 0;
        if (currentAttempts >= 5) {
            return res.status(400).json({
                success: false,
                error: 'Daily limit of 5 tries reached! Come back tomorrow.'
            });
        }

        const startTime = Date.now();
        user.miniGames.patternSequence.sessionStartTime = startTime;
        user.markModified('miniGames');
        await user.save();

        res.json({
            success: true,
            startTime,
            timeLimitSeconds: 180,
            remainingAttempts: Math.max(0, 5 - currentAttempts)
        });
    } catch (err) {
        console.error('Pattern Sequence start attempt error:', err);
        res.status(500).json({ error: 'Failed to start Pattern Sequence attempt.' });
    }
});

app.post(['/api/mini-games/pattern-sequence/submit-reward', '/api/mini-games/math-sequence/submit-reward'], authMiddleware, async (req, res) => {
    try {
        const user = req.user;
        let { gameSuccess, timeRemaining, difficulty, cashEarned: requestedCash, tokensDeducted } = req.body;
        const todayStr = new Date().toISOString().split('T')[0];

        if (!user.miniGames) user.miniGames = {};
        if (!user.miniGames.patternSequence) {
            user.miniGames.patternSequence = { lastPlayDate: todayStr, attemptsToday: 0 };
        }

        if (user.miniGames.patternSequence.lastPlayDate !== todayStr) {
            user.miniGames.patternSequence.lastPlayDate = todayStr;
            user.miniGames.patternSequence.attemptsToday = 0;
        }

        const currentAttempts = user.miniGames.patternSequence.attemptsToday || 0;
        if (currentAttempts >= 5) {
            return res.status(400).json({
                success: false,
                error: 'Daily limit of 5 tries reached! Come back tomorrow.'
            });
        }

        const mode = (difficulty || 'EASY').toUpperCase();

        // STRICT BACKEND TIMER VALIDATION PER DIFFICULTY:
        // Easy: 160s (+4s buffer = 164s)
        // Medium: 120s (+4s buffer = 124s)
        // Hard: 60s (+4s buffer = 64s)
        let maxBackendAllowedSec = 164;
        if (mode === 'MEDIUM') maxBackendAllowedSec = 124;
        if (mode === 'HARD') maxBackendAllowedSec = 64;

        const sessionStartTime = user.miniGames.patternSequence.sessionStartTime;
        if (sessionStartTime) {
            const elapsedSeconds = (Date.now() - sessionStartTime) / 1000;
            if (elapsedSeconds > maxBackendAllowedSec) {
                console.log(`[Pattern Sequence] Attempt rejected: Backend time limit exceeded (${elapsedSeconds.toFixed(1)}s > ${maxBackendAllowedSec - 4}s)`);
                gameSuccess = false;
            }
        }
        user.miniGames.patternSequence.sessionStartTime = null;

        // Apply live token deductions incurred during wrong choices
        const numDeducted = (!isNaN(parseInt(tokensDeducted, 10)) && parseInt(tokensDeducted, 10) > 0) ? parseInt(tokensDeducted, 10) : 0;

        if (numDeducted > 0) {
            const balanceBefore = user.tokens || 0;
            user.tokens = Math.max(0, (user.tokens || 0) - numDeducted);

            const txId = `TX_PENALTY_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
            await Transaction.create({
                transactionId: txId,
                userId: user._id.toString(),
                username: user.username || user.name || 'Guest Player',
                type: 'MINI_GAME_PENALTY',
                amount: -numDeducted,
                balanceBefore,
                balanceAfter: user.tokens,
                reason: `Pattern Sequence [${mode}] wrong attempt penalties (-${numDeducted} Gold Tokens)`
            });
        }

        // Consume 1 attempt
        user.miniGames.patternSequence.attemptsToday = currentAttempts + 1;
        user.miniGames.patternSequence.lastPlayDate = todayStr;

        const isWin = Boolean(gameSuccess);
        let cashEarned = 0;
        let tokensEarned = 0;

        if (isWin) {
            if (mode === 'EASY') {
                const parsedCash = parseInt(requestedCash, 10);
                cashEarned = (!isNaN(parsedCash) && parsedCash >= 200 && parsedCash <= 6000) ? parsedCash : 6000;
            } else if (mode === 'MEDIUM') {
                tokensEarned = Math.max(0, 5 - numDeducted);
            } else if (mode === 'HARD') {
                tokensEarned = Math.max(0, 10 - numDeducted);
            }
        }

        if (cashEarned > 0) {
            const balanceBefore = user.cash;
            user.cash = (user.cash || 0) + cashEarned;
            user.totalCashEarned = (user.totalCashEarned || 0) + cashEarned;

            const txId = `TX_PATTERN_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
            await Transaction.create({
                transactionId: txId,
                userId: user._id.toString(),
                username: user.username || user.name || 'Guest Player',
                type: 'MINI_GAME_REWARD',
                amount: cashEarned,
                balanceBefore,
                balanceAfter: user.cash,
                reason: `Pattern Sequence [EASY] completed (+$${cashEarned})`
            });
        }

        if (tokensEarned > 0) {
            const balanceBefore = user.tokens || 0;
            user.tokens = (user.tokens || 0) + tokensEarned;

            const txId = `TX_PATTERN_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
            await Transaction.create({
                transactionId: txId,
                userId: user._id.toString(),
                username: user.username || user.name || 'Guest Player',
                type: 'MINI_GAME_REWARD',
                amount: tokensEarned,
                balanceBefore,
                balanceAfter: user.tokens,
                reason: `Pattern Sequence [${mode}] completed (+${tokensEarned} Gold Tokens)`
            });
        }

        user.markModified('miniGames');
        await user.save();

        const remainingAttempts = Math.max(0, 5 - user.miniGames.patternSequence.attemptsToday);

        res.json({
            success: true,
            isWin,
            difficulty: mode,
            cashEarned,
            tokensEarned,
            newCashBalance: user.cash,
            newTokensBalance: user.tokens,
            attemptsToday: user.miniGames.patternSequence.attemptsToday,
            remainingAttempts
        });
    } catch (err) {
        console.error('Pattern Sequence submit reward error:', err);
        res.status(500).json({ error: 'Failed to process Pattern Sequence reward.' });
    }
});

// ─── Food Memory Mini Game Endpoints ───────────────────────────────
app.get('/api/mini-games/food-memory/status', authMiddleware, async (req, res) => {
    try {
        const user = req.user;
        const todayStr = new Date().toISOString().split('T')[0];
        if (!user.miniGames) user.miniGames = {};
        if (!user.miniGames.foodMemory) {
            user.miniGames.foodMemory = { lastPlayDate: todayStr, attemptsToday: 0 };
        }
        if (user.miniGames.foodMemory.lastPlayDate !== todayStr) {
            user.miniGames.foodMemory.lastPlayDate = todayStr;
            user.miniGames.foodMemory.attemptsToday = 0;
            user.markModified('miniGames');
            await user.save();
        }
        const currentAttempts = user.miniGames.foodMemory.attemptsToday || 0;
        res.json({
            success: true,
            attemptsToday: currentAttempts,
            remainingAttempts: Math.max(0, 5 - currentAttempts)
        });
    } catch (err) {
        console.error('Food Memory status check error:', err);
        res.status(500).json({ error: 'Failed to check Food Memory status.' });
    }
});

app.post('/api/mini-games/food-memory/start-attempt', authMiddleware, async (req, res) => {
    try {
        const user = req.user;
        const todayStr = new Date().toISOString().split('T')[0];
        if (!user.miniGames) user.miniGames = {};
        if (!user.miniGames.foodMemory) {
            user.miniGames.foodMemory = { lastPlayDate: todayStr, attemptsToday: 0 };
        }
        if (user.miniGames.foodMemory.lastPlayDate !== todayStr) {
            user.miniGames.foodMemory.lastPlayDate = todayStr;
            user.miniGames.foodMemory.attemptsToday = 0;
        }

        const currentAttempts = user.miniGames.foodMemory.attemptsToday || 0;
        if (currentAttempts >= 5) {
            return res.status(400).json({
                success: false,
                error: 'Daily limit of 5 tries reached! Come back tomorrow.'
            });
        }

        const startTime = Date.now();
        user.miniGames.foodMemory.sessionStartTime = startTime;
        user.markModified('miniGames');
        await user.save();

        res.json({
            success: true,
            startTime,
            memorizeTimeSeconds: 15,
            placementTimeSeconds: 120,
            remainingAttempts: Math.max(0, 5 - currentAttempts)
        });
    } catch (err) {
        console.error('Food Memory start attempt error:', err);
        res.status(500).json({ error: 'Failed to start Food Memory attempt.' });
    }
});

app.post('/api/mini-games/food-memory/submit-reward', authMiddleware, async (req, res) => {
    try {
        const user = req.user;
        const { correctCount, wrongCount } = req.body;
        const todayStr = new Date().toISOString().split('T')[0];

        if (!user.miniGames) user.miniGames = {};
        if (!user.miniGames.foodMemory) {
            user.miniGames.foodMemory = { lastPlayDate: todayStr, attemptsToday: 0 };
        }

        if (user.miniGames.foodMemory.lastPlayDate !== todayStr) {
            user.miniGames.foodMemory.lastPlayDate = todayStr;
            user.miniGames.foodMemory.attemptsToday = 0;
        }

        const currentAttempts = user.miniGames.foodMemory.attemptsToday || 0;
        if (currentAttempts >= 5) {
            return res.status(400).json({
                success: false,
                error: 'Daily limit of 5 tries reached! Come back tomorrow.'
            });
        }

        // Validate backend time limit (15s memorize + 120s placement + 4s buffer = 139s max)
        const sessionStartTime = user.miniGames.foodMemory.sessionStartTime;
        if (sessionStartTime) {
            const elapsedSeconds = (Date.now() - sessionStartTime) / 1000;
            if (elapsedSeconds > 139) {
                console.log(`[Food Memory] Attempt rejected: Time limit exceeded (${elapsedSeconds.toFixed(1)}s > 135s)`);
            }
        }
        user.miniGames.foodMemory.sessionStartTime = null;

        const validCorrect = (!isNaN(parseInt(correctCount, 10)) && parseInt(correctCount, 10) >= 0) ? Math.min(9, parseInt(correctCount, 10)) : 0;
        const validWrong = (!isNaN(parseInt(wrongCount, 10)) && parseInt(wrongCount, 10) >= 0) ? parseInt(wrongCount, 10) : (9 - validCorrect);

        // Consume 1 attempt
        user.miniGames.foodMemory.attemptsToday = currentAttempts + 1;
        user.miniGames.foodMemory.lastPlayDate = todayStr;

        // Base reward: 9 tokens. Net tokens = Math.max(0, 9 - wrongCount)
        const netTokens = Math.max(0, 9 - validWrong);

        if (netTokens > 0) {
            const balanceBefore = user.tokens || 0;
            user.tokens = (user.tokens || 0) + netTokens;

            const txId = `TX_FOOD_MEM_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
            await Transaction.create({
                transactionId: txId,
                userId: user._id.toString(),
                username: user.username || user.name || 'Guest Player',
                type: 'MINI_GAME_REWARD',
                amount: netTokens,
                balanceBefore,
                balanceAfter: user.tokens,
                reason: `Food Memory completed (${validCorrect}/9 correct, -${validWrong} wrong) ➔ +${netTokens} Gold Tokens`
            });
        }

        user.markModified('miniGames');
        await user.save();

        res.json({
            success: true,
            tokensEarned: netTokens,
            correctCount: validCorrect,
            wrongCount: validWrong,
            newTokensBalance: user.tokens,
            attemptsToday: user.miniGames.foodMemory.attemptsToday,
            remainingAttempts: Math.max(0, 5 - user.miniGames.foodMemory.attemptsToday)
        });
    } catch (err) {
        console.error('Food Memory submit reward error:', err);
        res.status(500).json({ error: 'Failed to submit Food Memory reward.' });
    }
});

// ─── Power Cards System Routes ──────────────────────────────
app.get('/api/power-cards/store', authMiddleware, async (req, res) => {
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

app.post('/api/power-cards/buy', authMiddleware, async (req, res) => {
    try {
        const userId = req.user._id.toString();
        const { cardId, quantity } = req.body;
        const result = await purchasePowerCard(userId, cardId, quantity || 1);
        if (!result.success) {
            return res.status(result.status || 400).json(result);
        }
        res.json(result);
    } catch (err) {
        console.error('Power card buy error:', err);
        res.status(500).json({ error: 'Failed to purchase power card.' });
    }
});

app.post('/api/power-cards/exchange-cash', authMiddleware, async (req, res) => {
    try {
        const userId = req.user._id.toString();
        const { tokensToBuy } = req.body;
        const result = await exchangeCashForTokens(userId, tokensToBuy || 1);
        if (!result.success) {
            return res.status(result.status || 400).json(result);
        }
        res.json(result);
    } catch (err) {
        console.error('Power card exchange cash error:', err);
        res.status(500).json({ error: 'Failed to exchange cash for tokens.' });
    }
});

// ─── Admin: Get All Reports ──────────────────────────────────
app.get('/api/admin/reports', adminMiddleware, async (req, res) => {
    try {
        const { status } = req.query;
        const filter = {};
        if (status && ['pending', 'valid', 'rejected', 'question_disabled'].includes(status)) {
            filter.status = status;
        }
        const reports = await QuestionReport.find(filter).sort({ createdAt: -1 }).limit(200).lean();
        res.json({ reports });
    } catch (err) {
        console.error('Admin reports fetch error:', err);
        res.status(500).json({ error: 'Failed to fetch reports.' });
    }
});

// ─── Admin: Get Single Report Detail ─────────────────────────
app.get('/api/admin/reports/:reportId', adminMiddleware, async (req, res) => {
    try {
        const report = await QuestionReport.findOne({ reportId: req.params.reportId }).lean();
        if (!report) return res.status(404).json({ error: 'Report not found.' });

        // Find all reports for the same questionId
        const relatedReports = await QuestionReport.find({ questionId: report.questionId }).lean();

        // Find all transactions for this questionId
        const transactions = await Transaction.find({ questionId: report.questionId }).lean();

        res.json({ report, relatedReports, transactions });
    } catch (err) {
        console.error('Admin report detail error:', err);
        res.status(500).json({ error: 'Failed to fetch report detail.' });
    }
});

// ─── Admin: Approve Report (Compensate Affected Players) ─────
app.post('/api/admin/reports/:reportId/approve', adminMiddleware, async (req, res) => {
    try {
        const report = await QuestionReport.findOne({ reportId: req.params.reportId });
        if (!report) return res.status(404).json({ error: 'Report not found.' });
        if (report.status === 'valid' || report.status === 'question_disabled') {
            return res.status(409).json({ error: 'Report already processed.' });
        }

        // 1. Mark report as valid
        report.status = 'valid';
        report.reviewedAt = new Date();
        report.reviewedBy = 'admin';
        await report.save();

        // 2. Find ALL reports for this same questionId to get all affected players
        const allReportsForQuestion = await QuestionReport.find({ questionId: report.questionId });
        const affectedPlayers = [];

        for (const r of allReportsForQuestion) {
            // Check idempotency: skip if compensation already given for this report+user
            const existingTx = await Transaction.findOne({
                reportId: r.reportId,
                userId: r.reporterId,
                type: 'QUESTION_COMPENSATION'
            });
            if (existingTx) continue;

            // Only compensate if player was actually financially affected (had a bid)
            if (r.bidAmount > 0) {
                const user = await User.findById(r.reporterId);
                if (!user) continue;

                const compensationAmount = r.bidAmount * 2;
                const balanceBefore = user.cash;
                user.cash += compensationAmount;
                const balanceAfter = user.cash;
                await user.save();

                // Create auditable transaction
                const txId = `tx_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
                await Transaction.create({
                    transactionId: txId,
                    userId: r.reporterId,
                    username: r.reporterUsername || user.username,
                    type: 'QUESTION_COMPENSATION',
                    amount: compensationAmount,
                    balanceBefore,
                    balanceAfter,
                    questionId: report.questionId,
                    reportId: r.reportId,
                    matchId: r.matchId,
                    reason: `Compensation for faulty question ${report.questionId}. Original bid: $${r.bidAmount.toLocaleString()}. 2× compensation: $${compensationAmount.toLocaleString()}.`,
                    adminId: 'admin'
                });

                // Create inbox notification
                await InboxMessage.create({
                    userId: r.reporterId,
                    type: 'compensation',
                    title: '💰 Question Error Compensation',
                    body: `The question you reported (ID: ${report.questionId}) was reviewed and confirmed to contain an error.\n\nOriginal sentence: "${report.questionSnapshot.sentence}"\n\nYour affected bid: $${r.bidAmount.toLocaleString()}\nCompensation: +$${compensationAmount.toLocaleString()}\n\nYour balance has been updated.`,
                    metadata: {
                        questionId: report.questionId,
                        reportId: r.reportId,
                        transactionId: txId,
                        matchId: r.matchId,
                        amount: compensationAmount,
                        originalBid: r.bidAmount
                    }
                });

                // Mark report as compensated
                r.compensationProcessed = true;
                r.status = 'valid';
                r.reviewedAt = new Date();
                r.reviewedBy = 'admin';
                await r.save();

                affectedPlayers.push({
                    userId: r.reporterId,
                    username: r.reporterUsername || user.username,
                    bidAmount: r.bidAmount,
                    compensation: compensationAmount,
                    transactionId: txId
                });

                console.log(`💰 Compensated ${user.username}: +$${compensationAmount.toLocaleString()} for question ${report.questionId}`);
            }
        }

        res.json({
            success: true,
            message: `Report approved. ${affectedPlayers.length} player(s) compensated.`,
            affectedPlayers
        });
    } catch (err) {
        if (err.code === 11000) {
            return res.status(409).json({ error: 'Compensation already processed (duplicate transaction).' });
        }
        console.error('Approve report error:', err);
        res.status(500).json({ error: 'Failed to approve report.' });
    }
});

// ─── Admin: Reject Report ────────────────────────────────────
app.post('/api/admin/reports/:reportId/reject', adminMiddleware, async (req, res) => {
    try {
        const report = await QuestionReport.findOne({ reportId: req.params.reportId });
        if (!report) return res.status(404).json({ error: 'Report not found.' });
        if (report.status !== 'pending') {
            return res.status(409).json({ error: 'Report already processed.' });
        }

        report.status = 'rejected';
        report.reviewedAt = new Date();
        report.reviewedBy = 'admin';
        report.reviewNotes = req.body.reviewNotes || null;
        await report.save();

        // Optional: notify reporter
        await InboxMessage.create({
            userId: report.reporterId,
            type: 'report_result',
            title: '📋 Report Reviewed',
            body: `Your report for question "${report.questionSnapshot.sentence}" has been reviewed and was not found to contain an error.\n\nThank you for helping improve Grammar Bid!`,
            metadata: {
                questionId: report.questionId,
                reportId: report.reportId
            }
        });

        res.json({ success: true, message: 'Report rejected.' });
    } catch (err) {
        console.error('Reject report error:', err);
        res.status(500).json({ error: 'Failed to reject report.' });
    }
});

// ─── Admin: Disable Question ─────────────────────────────────
app.post('/api/admin/reports/:reportId/disable-question', adminMiddleware, async (req, res) => {
    try {
        const report = await QuestionReport.findOne({ reportId: req.params.reportId });
        if (!report) return res.status(404).json({ error: 'Report not found.' });

        // Mark all reports for this question as question_disabled
        await QuestionReport.updateMany(
            { questionId: report.questionId },
            { $set: { status: 'question_disabled', reviewedAt: new Date(), reviewedBy: 'admin' } }
        );

        console.log(`🚫 Question ${report.questionId} disabled by admin.`);
        res.json({ success: true, message: `Question ${report.questionId} has been disabled.` });
    } catch (err) {
        console.error('Disable question error:', err);
        res.status(500).json({ error: 'Failed to disable question.' });
    }
});

// ─── Admin: Get All Transactions ─────────────────────────────
app.get('/api/admin/transactions', adminMiddleware, async (req, res) => {
    try {
        const transactions = await Transaction.find({}).sort({ createdAt: -1 }).limit(200).lean();
        res.json({ transactions });
    } catch (err) {
        res.status(500).json({ error: 'Failed to fetch transactions.' });
    }
});

// ─── Leaderboard Endpoint ──────────────────────────────────────
app.get('/api/leaderboard', async (req, res) => {
    try {
        const allUsers = await User.find({}, 'username cash avatar').lean();

        // Strict numeric sort (b.cash - a.cash) so $10,000 is always higher than $5,100
        allUsers.sort((a, b) => {
            const cashA = Number(a.cash !== undefined ? a.cash : 10000);
            const cashB = Number(b.cash !== undefined ? b.cash : 10000);
            return cashB - cashA;
        });

        const top10 = allUsers.slice(0, 10);

        const leaderboard = top10.map((u, index) => ({
            rank: index + 1,
            userId: u._id.toString(),
            username: u.username,
            cash: Number(u.cash !== undefined ? u.cash : 10000),
            avatar: u.avatar || `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(u.username)}`
        }));

        let myRank = null;
        const authHeader = req.headers.authorization;
        if (authHeader && authHeader.startsWith('Bearer ')) {
            const decoded = verifyToken(authHeader.split(' ')[1]);
            if (decoded) {
                const myIndex = allUsers.findIndex(u => u._id.toString() === decoded.userId);
                if (myIndex !== -1) {
                    const me = allUsers[myIndex];
                    myRank = {
                        rank: myIndex + 1,
                        userId: me._id.toString(),
                        username: me.username,
                        cash: Number(me.cash !== undefined ? me.cash : 10000),
                        avatar: me.avatar || `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(me.username)}`
                    };
                }
            }
        }

        res.json({ leaderboard, myRank });
    } catch (err) {
        console.error('Leaderboard fetch error:', err);
        res.status(500).json({ error: 'Failed to load leaderboard' });
    }
});

// ═══════════════════════════════════════════════════════════════
//  REST API — Auth Routes
// ═══════════════════════════════════════════════════════════════

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
app.post('/api/auth/guest', async (req, res) => {
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
app.post('/api/auth/signup', async (req, res) => {
    try {
        const { username, password } = req.body;

        if (!username || !password) {
            return res.status(400).json({ error: 'Username and password are required' });
        }
        if (username.length < 3 || username.length > 20) {
            return res.status(400).json({ error: 'Username must be 3-20 characters' });
        }
        if (password.length < 6) {
            return res.status(400).json({ error: 'Password must be at least 6 characters' });
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

        // Auto-send welcome & thank you inbox message with Thank-You.webp image
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

// ─── Avatar Shop Pricing & Unlock Helpers ─────────────────────
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

// POST /api/auth/login
app.post('/api/auth/login', async (req, res) => {
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

// GET /api/auth/me
app.get('/api/auth/me', authMiddleware, async (req, res) => {
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
app.post('/api/auth/buy-avatar', authMiddleware, async (req, res) => {
    try {
        const { avatarUrl } = req.body;
        const user = req.user;

        if (!avatarUrl) {
            return res.status(400).json({ error: 'Avatar URL is required' });
        }

        ensureUnlockedAvatars(user);

        if (user.unlockedAvatars.includes(avatarUrl)) {
            return res.json({ success: true, message: 'Avatar already unlocked!', user: user.toJSON() });
        }

        const decodedUrl = decodeURIComponent(avatarUrl);
        const fileName = decodedUrl.substring(decodedUrl.lastIndexOf('/') + 1);

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

        for (const room of rooms.values()) {
            const player = room.players.find(p => p.userId === user._id.toString());
            if (player) {
                player.avatar = user.avatar;
                player.cash = user.cash;
                io.to(room.code).emit('lobby_updated', { room: sanitizeRoom(room) });
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
app.put('/api/auth/profile', authMiddleware, async (req, res) => {
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

        for (const room of rooms.values()) {
            const player = room.players.find(p => p.userId === user._id.toString());
            if (player) {
                player.username = user.username;
                player.avatar = user.avatar;
                player.cash = user.cash !== undefined ? user.cash : 10000;
                io.to(room.code).emit('lobby_updated', { room: sanitizeRoom(room) });
            }
        }

        res.json({ token, userId: user._id, user: user.toJSON() });
    } catch (err) {
        console.error('Update profile error:', err);
        res.status(500).json({ error: 'Failed to update profile' });
    }
});

// POST /api/auth/convert-guest
app.post('/api/auth/convert-guest', authMiddleware, async (req, res) => {
    try {
        const user = req.user;
        if (!user.isGuest) {
            return res.status(400).json({ error: 'Account is already a permanent user account.' });
        }

        const { username, password } = req.body;

        if (!username || !password) {
            return res.status(400).json({ error: 'Username and password are required.' });
        }

        const cleanUsername = username.trim();
        if (cleanUsername.length < 3 || cleanUsername.length > 20) {
            return res.status(400).json({ error: 'Username must be 3-20 characters.' });
        }

        if (password.length < 6) {
            return res.status(400).json({ error: 'Password must be at least 6 characters.' });
        }

        const existing = await User.findOne({ username: cleanUsername, _id: { $ne: user._id } });
        if (existing) {
            return res.status(409).json({ error: 'Username already taken by another player.' });
        }

        user.username = cleanUsername;
        user.password = password;
        user.isGuest = false;
        await user.save();

        for (const room of rooms.values()) {
            const player = room.players.find(p => p.userId === user._id.toString());
            if (player) {
                player.username = user.username;
                io.to(room.code).emit('lobby_updated', { room: sanitizeRoom(room) });
            }
        }

        const token = generateToken(user._id);
        res.json({ success: true, message: 'Account converted successfully!', token, userId: user._id, user: user.toJSON() });
    } catch (err) {
        console.error('Convert guest error:', err);
        res.status(500).json({ error: 'Failed to convert guest account.' });
    }
});

// ═══════════════════════════════════════════════════════════════
//  In-Memory Lobby System
// ═══════════════════════════════════════════════════════════════
const rooms = new Map();
const socketRoomMap = new Map();
const roomTimeouts = new Map();
const disconnectGraceTimers = new Map(); // userId -> { timeout, roomCode }
const MAX_PLAYERS = 4;

function generateRoomCode() {
    let code;
    do {
        code = Math.floor(1000 + Math.random() * 9000).toString();
    } while (rooms.has(code));
    return code;
}

const ROOM_TIMEOUT_MS = 10 * 60 * 1000; // 10 minutes

function scheduleRoomTimeout(roomCode) {
    return setTimeout(() => {
        const room = rooms.get(roomCode);
        if (room) {
            console.log(`⏰ Room ${roomCode} cancelled due to 10-minute timeout.`);
            io.to(roomCode).emit('room_cancelled', {
                message: 'Room automatically cancelled after 10 minutes of inactivity.'
            });
            room.players.forEach(p => socketRoomMap.delete(p.socketId));
            destroyRoomBots(roomCode);
            rooms.delete(roomCode);
        }
    }, ROOM_TIMEOUT_MS);
}

// Helper: generate a 5-round plan with either 3 correct/2 incorrect OR 3 incorrect/2 correct
function generateGamePlan() {
    const threeCorrect = Math.random() < 0.5;
    const plan = threeCorrect
        ? [true, true, true, false, false]
        : [false, false, false, true, true];
    // Fisher-Yates shuffle
    for (let i = plan.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [plan[i], plan[j]] = [plan[j], plan[i]];
    }
    return plan;
}

// Helper: strip non-serializable fields from room before emitting
function sanitizeRoom(room) {
    return {
        code: room.code,
        isPublic: room.isPublic,
        status: room.status,
        createdAt: room.createdAt,
        currentRound: room.currentRound,
        totalRounds: room.totalRounds,
        highestBid: room.highestBid,
        topBidder: room.topBidder,
        players: room.players.map(p => ({
            socketId: p.socketId,
            userId: p.userId,
            username: p.username,
            avatar: p.avatar,
            cash: p.cash,
            isHost: p.isHost,
            isBot: p.isBot || false,
            rankBadge: p.rankBadge || '🌱',
            rankName: p.rankName || 'Grammar Novice',
            points: p.points || 0,
            boughtHint: p.boughtHint || false
        }))
    };
}

// ═══════════════════════════════════════════════════════════════
//  Game Phase Engine Functions
// ═══════════════════════════════════════════════════════════════

function clearRoomTimer(room) {
    if (room.timerRef) {
        clearInterval(room.timerRef);
        room.timerRef = null;
    }
}

async function startRound(roomCode) {
    const room = rooms.get(roomCode);
    if (!room) return;

    room.currentRound++;
    room.highestBid = 0;
    room.topBidder = null;
    room.corrections = [];
    room.players.forEach(p => { p.boughtHint = false; });
    clearRoundActiveCardEffects(room);

    if (!room.gamePlan || room.gamePlan.length < room.totalRounds) {
        room.gamePlan = generateGamePlan();
    }

    const forcedIsCorrect = room.gamePlan[room.currentRound - 1];

    // Generate sentence via Groq API
    console.log(`📝 Round ${room.currentRound}/${room.totalRounds} — Generating ${forcedIsCorrect ? 'CORRECT' : 'INCORRECT'} sentence for room ${roomCode}...`);
    room.usedDomains = Array.isArray(room.usedDomains) ? room.usedDomains : [];
    room.usedCategories = Array.isArray(room.usedCategories) ? room.usedCategories : [];
    room.usedSentences = Array.isArray(room.usedSentences) ? room.usedSentences : [];

    const lot = await generateSentence(forcedIsCorrect, {
        excludeDomains: room.usedDomains,
        excludeCategories: room.usedCategories
    });
    room.currentLot = lot;

    if (lot.sentence && !room.usedSentences.includes(lot.sentence)) {
        room.usedSentences.push(lot.sentence);
    }
    if (lot.domain && !room.usedDomains.includes(lot.domain)) {
        room.usedDomains.push(lot.domain);
    }
    if (lot.category && !room.usedCategories.includes(lot.category)) {
        room.usedCategories.push(lot.category);
    }

    // Set inspection phase
    room.status = 'inspection';
    room.timer = 30;
    room.deadline = Date.now() + (30 * 1000);

    io.to(roomCode).emit('round_start', {
        round: room.currentRound,
        totalRounds: room.totalRounds,
        sentence: lot.sentence,
        category: lot.category,
        domain: lot.domain || null,
        questionId: lot.questionId || null,
        englishVariety: lot.englishVariety || 'General / International English',
        validationReasoning: lot.validationReasoning || null,
        timer: room.timer,
        players: room.players.map(p => ({
            socketId: p.socketId,
            userId: p.userId,
            username: p.username,
            avatar: p.avatar,
            cash: p.cash,
            isHost: p.isHost
        }))
    });

    // Trigger bot round-start reactions
    onRoundStart(room);

    // Start inspection countdown
    clearRoomTimer(room);
    room.timerRef = setInterval(() => {
        room.timer--;
        io.to(roomCode).emit('timer_tick', { timer: room.timer, phase: 'inspection' });

        if (room.timer <= 0) {
            clearRoomTimer(room);
            startBiddingPhase(roomCode);
        }
    }, 1000);
}

function startBiddingPhase(roomCode) {
    const room = rooms.get(roomCode);
    if (!room) return;

    room.status = 'bidding';
    room.timer = 30;
    room.deadline = Date.now() + (30 * 1000);
    room.antiSnipeExtended = 0;

    io.to(roomCode).emit('bidding_start', {
        timer: room.timer,
        highestBid: room.highestBid,
        topBidder: room.topBidder
    });

    clearRoomTimer(room);

    // Trigger bot bidding
    onBiddingStart(room);

    room.timerRef = setInterval(() => {
        room.timer--;
        io.to(roomCode).emit('timer_tick', { timer: room.timer, phase: 'bidding' });

        if (room.timer <= 0) {
            clearRoomTimer(room);
            resolveRound(roomCode);
        }
    }, 1000);
}

async function persistAllHumanCash(room) {
    if (!room || !room.players) return;
    for (const player of room.players) {
        if (player.isBot) continue;
        try {
            await User.findByIdAndUpdate(player.userId, {
                $set: { cash: Number(player.cash) }
            });
            if (process.env.LOG_BOTS === 'true') {
                console.log(`💾 Live DB Cash Synced: ${player.username} -> $${player.cash.toLocaleString()}`);
            }
        } catch (err) {
            console.error(`Failed to sync live cash for ${player.username}:`, err);
        }
    }
}

function resolveRound(roomCode) {
    const room = rooms.get(roomCode);
    if (!room) return;

    room.status = 'resolution';
    const lot = room.currentLot;
    const winner = room.topBidder
        ? room.players.find(p => p.socketId === room.topBidder.socketId)
        : null;

    let cashChange = 0;
    let winnerUsername = null;

    if (winner) {
        winnerUsername = winner.username;
        const activeEffects = room.activeCardEffects && room.activeCardEffects[winner.userId];

        if (lot.isCorrect) {
            // Winner bought a correct sentence — they GAIN the bid amount (or 2x if BID_BOOST active)
            let gain = room.highestBid;
            let boostApplied = false;
            if (activeEffects && (activeEffects.BID_BOOST || activeEffects.BID_BOOST_APPLIED)) {
                gain = room.highestBid * 2;
                boostApplied = true;
                delete activeEffects.BID_BOOST;
                delete activeEffects.BID_BOOST_APPLIED;
                console.log(`⚡ BID BOOST CARD: ${winner.username} won double reward (2x payout: +$${gain.toLocaleString()})!`);
            }

            winner.cash += gain;
            cashChange = gain;
            console.log(`🎉 ${winner.username} won correct sentence! +$${gain.toLocaleString()}${boostApplied ? ' (2x Bid Boost)' : ''}`);
        } else {
            // Winner bought an incorrect sentence
            let loss = room.highestBid;
            let boostApplied = false;
            if (activeEffects && (activeEffects.BID_BOOST || activeEffects.BID_BOOST_APPLIED)) {
                loss = room.highestBid * 2;
                boostApplied = true;
                delete activeEffects.BID_BOOST;
                delete activeEffects.BID_BOOST_APPLIED;
                console.log(`⚡ BID BOOST CARD: ${winner.username} lost double on incorrect lot (2x penalty: -$${loss.toLocaleString()})!`);
            }

            let shieldApplied = false;
            if (activeEffects && activeEffects.BID_SHIELD) {
                loss = 0; // 100% Loss Protection — guaranteed no loss
                shieldApplied = true;
                console.log(`🛡️ BID SHIELD CARD: ${winner.username} loss 100% protected ($0 penalty)`);
            }

            let cashbackBonus = 0;
            if (activeEffects && activeEffects.CASHBACK && loss > 0) {
                cashbackBonus = Math.floor(loss * 0.25);
                loss -= cashbackBonus;
                console.log(`💰 CASHBACK CARD: ${winner.username} received 25% refund on lost cash (+$${cashbackBonus.toLocaleString()})!`);
            }

            winner.cash -= loss;
            cashChange = -loss;
            console.log(`💀 ${winner.username} bought incorrect sentence! -$${loss.toLocaleString()}${shieldApplied ? ' (100% Shielded)' : ''}${cashbackBonus ? ` (includes $${cashbackBonus} Cashback refund)` : ''}`);
        }
    } else {
        console.log(`🤷 No bids placed in round ${room.currentRound} of room ${roomCode}`);
    }

    // Immediately persist live cash to DB for all human players after round resolution
    persistAllHumanCash(room);

    // Update career stats & award server-authoritative XP for all human players in room
    const matchId = room.matchId || room.code;
    const roundId = `round_${room.currentRound}`;

    for (const player of room.players) {
        if (player.isBot) continue;
        User.findById(player.userId).then(async (user) => {
            if (!user) return;
            if (!user.stats) user.stats = {};
            user.stats.totalRoundsPlayed = (user.stats.totalRoundsPlayed || 0) + 1;

            const isWinner = winner && player.userId === winner.userId;

            if (isWinner) {
                if (lot.isCorrect) {
                    user.stats.auctionsWon = (user.stats.auctionsWon || 0) + 1;
                    user.stats.correctDecisions = (user.stats.correctDecisions || 0) + 1;
                    user.stats.bestBid = Math.max(user.stats.bestBid || 0, room.highestBid || 0);
                    user.stats.currentStreak = (user.stats.currentStreak || 0) + 1;
                    user.stats.bestStreak = Math.max(user.stats.bestStreak || 0, user.stats.currentStreak);
                } else {
                    user.stats.currentStreak = 0;
                }
            } else {
                // Non-winners who correctly refrained from bidding on an incorrect lot
                if (!lot.isCorrect) {
                    user.stats.correctDecisions = (user.stats.correctDecisions || 0) + 1;
                }
            }
            await user.save();

            // Server-authoritative XP awards (awardXP loads fresh user, saves updated XP & rank, creates InboxMessage)
            if (isWinner) {
                if (lot.isCorrect) {
                    await awardXP({
                        userId: player.userId,
                        amount: XP_REWARDS.CORRECT_DECISION,
                        type: 'CORRECT_DECISION',
                        matchId,
                        roundId,
                        description: `Correctly evaluated auction lot ${room.currentRound}`,
                        io,
                        roomCode: room.code
                    });
                    await awardXP({
                        userId: player.userId,
                        amount: XP_REWARDS.AUCTION_WIN,
                        type: 'AUCTION_WIN',
                        matchId,
                        roundId,
                        description: `Won auction lot ${room.currentRound}`,
                        io,
                        roomCode: room.code
                    });
                }
            } else {
                if (!lot.isCorrect) {
                    await awardXP({
                        userId: player.userId,
                        amount: XP_REWARDS.CORRECT_DECISION,
                        type: 'CORRECT_DECISION',
                        matchId,
                        roundId,
                        description: `Correctly identified incorrect sentence lot ${room.currentRound}`,
                        io,
                        roomCode: room.code
                    });
                }
            }
        }).catch(err => console.error('Round stat & XP update error:', err));
    }

    const roundResult = {
        roundNumber: room.currentRound,
        lotNumber: `Lot ${room.currentRound}`,
        isCorrect: lot.isCorrect,
        sentence: lot.sentence,
        correction: lot.isCorrect ? lot.correction : null,
        category: lot.category,
        hintText: lot.hintText,
        questionId: lot.questionId || null,
        englishVariety: lot.englishVariety || 'General / International English',
        validationReasoning: lot.validationReasoning || null,
        winnerUsername,
        highestBid: room.highestBid,
        cashChange,
        topBidder: room.topBidder,
        players: room.players.map(p => ({
            socketId: p.socketId,
            userId: p.userId,
            username: p.username,
            avatar: p.avatar,
            cash: p.cash,
            isHost: p.isHost
        }))
    };

    // Store complete permanent question snapshot in room history
    if (!room.roundHistory) room.roundHistory = [];
    room.roundHistory.push({
        roundNumber: room.currentRound,
        questionId: lot.questionId || null,
        sentence: lot.sentence,
        isCorrect: lot.isCorrect,
        correction: lot.correction || null,
        explanation: lot.hintText || null,
        category: lot.category || null,
        englishVariety: lot.englishVariety || 'General / International English',
        validationReasoning: lot.validationReasoning || null,
        winnerUsername,
        highestBid: room.highestBid,
        cashChange,
        timestamp: new Date()
    });

    io.to(roomCode).emit('round_result', roundResult);

    // Trigger bot reactions to round result
    onRoundResult(room, roundResult);

    // Keep result popup visible for 10 seconds before next phase
    if (!lot.isCorrect) {
        setTimeout(() => startCorrectionPhase(roomCode), 10000);
    } else {
        setTimeout(() => nextRoundOrEnd(roomCode), 10000);
    }
}

function startCorrectionPhase(roomCode) {
    const room = rooms.get(roomCode);
    if (!room) return;

    room.status = 'correction';
    room.timer = 30;
    room.deadline = Date.now() + (30 * 1000);
    room.corrections = [];

    io.to(roomCode).emit('correction_start', {
        timer: room.timer,
        sentence: room.currentLot.sentence,
        flawedPhrase: room.currentLot.flawedPhrase,
        correctPhrase: room.currentLot.correctPhrase
    });

    // Trigger bot correction submissions
    onCorrectionStart(room);

    clearRoomTimer(room);
    room.timerRef = setInterval(() => {
        room.timer--;
        io.to(roomCode).emit('timer_tick', { timer: room.timer, phase: 'correction' });

        if (room.timer <= 0) {
            clearRoomTimer(room);
            endCorrectionPhase(roomCode);
        }
    }, 1000);
}

function endCorrectionPhase(roomCode) {
    const room = rooms.get(roomCode);
    if (!room) return;

    // Record round summary into room.roundHistory
    if (!room.roundHistory) room.roundHistory = [];
    const fastest = room.corrections.find(c => c.isAccurate && c.order === 1);
    room.roundHistory.push({
        roundNumber: room.currentRound,
        sentence: room.currentLot.sentence,
        isCorrect: room.currentLot.isCorrect,
        correction: room.currentLot.correction,
        category: room.currentLot.category,
        questionId: room.currentLot.questionId || null,
        englishVariety: room.currentLot.englishVariety || 'General / International English',
        validationReasoning: room.currentLot.validationReasoning || null,
        flawedPhrase: room.currentLot.flawedPhrase,
        correctPhrase: room.currentLot.correctPhrase,
        winnerUsername: room.topBidder ? room.topBidder.username : null,
        highestBid: room.highestBid,
        fastestCorrector: fastest ? fastest.username : null
    });

    // Persist live cash to DB for all human players after correction phase
    persistAllHumanCash(room);

    // Broadcast correction results and explanation to all players
    io.to(roomCode).emit('correction_end', {
        correctAnswer: room.currentLot.correction,
        category: room.currentLot.category,
        explanation: room.currentLot.hintText,
        questionId: room.currentLot.questionId || null,
        englishVariety: room.currentLot.englishVariety || 'General / International English',
        validationReasoning: room.currentLot.validationReasoning || null,
        originalSentence: room.currentLot.sentence,
        submissions: room.corrections.map(c => ({
            username: c.username,
            text: c.text,
            isAccurate: c.isAccurate,
            order: c.order
        })),
        players: room.players.map(p => ({
            socketId: p.socketId,
            userId: p.userId,
            username: p.username,
            avatar: p.avatar,
            cash: p.cash,
            isHost: p.isHost
        }))
    });

    // Move to next round after 8s reveal modal
    setTimeout(() => nextRoundOrEnd(roomCode), 8000);
}

async function nextRoundOrEnd(roomCode) {
    const room = rooms.get(roomCode);
    if (!room) return;

    if (room.currentRound >= room.totalRounds) {
        // Game over
        room.status = 'game_over';
        clearRoomTimer(room);

        // Sort players by cash descending
        const standings = [...room.players].sort((a, b) => b.cash - a.cash);
        const winner = standings[0];

        console.log(`🏆 Game Over in room ${roomCode}! Winner: ${winner.username} ($${winner.cash.toLocaleString()})`);

        // Trigger bot game-over reactions
        onGameOver(room);

        // Persist cash & award match completion XP to MongoDB for all HUMAN players (skip bots)
        const matchId = room.matchId || room.code;
        const matchXpSummaryMap = {};

        for (const player of room.players) {
            if (player.isBot) continue; // Bots don't persist to DB
            try {
                await User.findByIdAndUpdate(player.userId, {
                    $set: { cash: Number(player.cash) },
                    $inc: { gamesPlayed: 1 }
                });
                // Mark winner
                if (player.userId === winner.userId) {
                    await User.findByIdAndUpdate(player.userId, {
                        $inc: { gamesWon: 1 }
                    });
                }

                // Award match completion XP (server-authoritative)
                await awardXP({
                    userId: player.userId,
                    amount: XP_REWARDS.MATCH_COMPLETE,
                    type: 'MATCH_COMPLETE',
                    matchId,
                    description: `Completed match in room ${roomCode}`,
                    io,
                    roomCode
                });

                // Check win streak milestone bonuses
                const u = await User.findById(player.userId);
                if (u && u.stats) {
                    if (u.stats.currentStreak === 3) {
                        await awardXP({
                            userId: player.userId,
                            amount: XP_REWARDS.STREAK_3_BONUS,
                            type: 'STREAK_BONUS',
                            matchId,
                            description: '3-win streak milestone bonus!',
                            io,
                            roomCode
                        });
                    } else if (u.stats.currentStreak === 5) {
                        await awardXP({
                            userId: player.userId,
                            amount: XP_REWARDS.STREAK_5_BONUS,
                            type: 'STREAK_BONUS',
                            matchId,
                            description: '5-win streak milestone bonus!',
                            io,
                            roomCode
                        });
                    }
                }

                // Compute player's total match XP breakdown for end-game UI summary
                const matchTxns = await XPTransaction.find({ userId: player.userId, matchId }).lean();
                let totalMatchXP = 0;
                const breakdown = { correctDecisions: 0, auctionWins: 0, correctionWins: 0, matchComplete: 0, streakBonus: 0 };

                matchTxns.forEach(t => {
                    totalMatchXP += t.amount;
                    if (t.type === 'CORRECT_DECISION') breakdown.correctDecisions += t.amount;
                    else if (t.type === 'AUCTION_WIN') breakdown.auctionWins += t.amount;
                    else if (t.type === 'CORRECTION_ACCURATE' || t.type === 'CORRECTION_FIRST_ACCURATE') breakdown.correctionWins += t.amount;
                    else if (t.type === 'MATCH_COMPLETE') breakdown.matchComplete += t.amount;
                    else if (t.type === 'STREAK_BONUS') breakdown.streakBonus += t.amount;
                });

                const finalUser = u ? await User.findById(player.userId).lean() : null;
                const finalXP = finalUser ? (finalUser.xp || 0) : 0;

                matchXpSummaryMap[player.userId] = {
                    totalMatchXP,
                    breakdown,
                    currentXP: finalXP,
                    rankProgress: calculateRankProgress(finalXP)
                };

            } catch (err) {
                console.error(`Failed to persist cash/XP for ${player.username}:`, err);
            }
        }

        io.to(roomCode).emit('game_over', {
            standings: standings.map((p, i) => ({
                rank: i + 1,
                userId: p.userId,
                username: p.username,
                avatar: p.avatar,
                cash: p.cash,
                isHost: p.isHost,
                xpSummary: matchXpSummaryMap[p.userId] || null
            })),
            winnerUsername: winner.username,
            winnerCash: winner.cash,
            roundHistory: room.roundHistory || [],
            matchXpSummaryMap
        });

        // Clean up room after 30 seconds
        setTimeout(() => {
            const r = rooms.get(roomCode);
            if (r && r.status === 'game_over') {
                r.players.forEach(p => socketRoomMap.delete(p.socketId));
                destroyRoomBots(roomCode);
                rooms.delete(roomCode);
                console.log(`🗑️ Room ${roomCode} cleaned up after game over`);
            }
        }, 30000);
    } else {
        // Start next round
        startRound(roomCode);
    }
}

// ═══════════════════════════════════════════════════════════════
//  Socket.io Event Handlers
// ═══════════════════════════════════════════════════════════════
const socketUserMap = new Map();

io.on('connection', (socket) => {
    console.log(`🔌 Socket connected: ${socket.id}`);

    // Register bot socket event handlers
    registerBotHandlers(io, socket, rooms, socketRoomMap);

    // Track user as online when they authenticate
    socket.on('auth_online', ({ userId }) => {
        if (userId) {
            socketUserMap.set(socket.id, userId);
            onlineUserIds.add(userId);
        }
    });

    // Save tutorial completion status via socket
    socket.on('tutorial_completed', async ({ userId }) => {
        const targetUserId = userId || socketUserMap.get(socket.id);
        if (targetUserId) {
            try {
                await User.findByIdAndUpdate(targetUserId, { $set: { tutorialCompleted: true } });
                console.log(`🎓 Tutorial marked complete via socket for user: ${targetUserId}`);
            } catch (e) {
                console.error('Socket tutorial_completed error:', e);
            }
        }
    });

    // ── CREATE ROOM ──────────────────────────────────────────
    socket.on('create_room', async ({ userId }) => {
        try {
            const user = await User.findById(userId);
            if (!user) {
                return socket.emit('join_error', { message: 'User not found. Please log in again.' });
            }

            const roomCode = generateRoomCode();
            const userRank = getRankFromXP(user.xp || 0);
            const player = {
                socketId: socket.id,
                userId: user._id.toString(),
                username: user.username,
                avatar: user.avatar,
                cash: user.cash !== undefined ? user.cash : 10000,
                rankBadge: userRank.badge,
                rankName: userRank.name,
                isHost: true
            };

            const room = {
                code: roomCode,
                isPublic: false,
                players: [player],
                bannedUserIds: [],
                createdAt: Date.now(),
                status: 'lobby',
                currentRound: 0,
                totalRounds: 5,
                gamePlan: generateGamePlan(),
                currentLot: null,
                usedDomains: [],
                usedCategories: [],
                highestBid: 0,
                topBidder: null,
                timer: 0,
                timerRef: null,
                corrections: []
            };

            rooms.set(roomCode, room);
            roomTimeouts.set(roomCode, scheduleRoomTimeout(roomCode));
            socketRoomMap.set(socket.id, roomCode);
            socket.join(roomCode);

            console.log(`🏠 Private Room ${roomCode} created by ${user.username}`);
            socket.emit('room_created', { roomCode, room: sanitizeRoom(room) });
        } catch (err) {
            console.error('create_room error:', err);
            socket.emit('join_error', { message: 'Failed to create room.' });
        }
    });

    // ── QUICK MATCH (PUBLIC ROOMS) ───────────────────────────
    socket.on('quick_match', async ({ userId }) => {
        try {
            const user = await User.findById(userId);
            if (!user) {
                return socket.emit('join_error', { message: 'User not found. Please log in again.' });
            }

            // Find open public room with space
            let targetRoom = null;
            for (const room of rooms.values()) {
                if (room.isPublic && room.players.length < MAX_PLAYERS) {
                    if (room.bannedUserIds && room.bannedUserIds.includes(userId)) {
                        continue; // Skip public rooms where user is banned
                    }
                    targetRoom = room;
                    break;
                }
            }

            if (targetRoom) {
                // Check if user already in room
                const existing = targetRoom.players.find(p => p.userId === userId);
                if (existing) {
                    existing.socketId = socket.id;
                    socketRoomMap.set(socket.id, targetRoom.code);
                    socket.join(targetRoom.code);
                    socket.emit('join_success', { roomCode: targetRoom.code, room: sanitizeRoom(targetRoom) });
                    io.to(targetRoom.code).emit('lobby_updated', { room: sanitizeRoom(targetRoom) });
                    return;
                }

                // Join open public room as guest
                const userRank = getRankFromXP(user.xp || 0);
                const player = {
                    socketId: socket.id,
                    userId: user._id.toString(),
                    username: user.username,
                    avatar: user.avatar,
                    cash: user.cash !== undefined ? user.cash : 10000,
                    rankBadge: userRank.badge,
                    rankName: userRank.name,
                    isHost: false
                };

                targetRoom.players.push(player);
                socketRoomMap.set(socket.id, targetRoom.code);
                socket.join(targetRoom.code);

                console.log(`⚡ ${user.username} Quick-Matched into public room ${targetRoom.code} (${targetRoom.players.length}/${MAX_PLAYERS})`);
                socket.emit('join_success', { roomCode: targetRoom.code, room: sanitizeRoom(targetRoom) });
                socket.to(targetRoom.code).emit('player_joined', { username: user.username });
                io.to(targetRoom.code).emit('lobby_updated', { room: sanitizeRoom(targetRoom) });
            } else {
                // No open public room found -> Create a new public room as Host
                const roomCode = generateRoomCode();
                const userRank = getRankFromXP(user.xp || 0);
                const player = {
                    socketId: socket.id,
                    userId: user._id.toString(),
                    username: user.username,
                    avatar: user.avatar,
                    cash: user.cash !== undefined ? user.cash : 10000,
                    rankBadge: userRank.badge,
                    rankName: userRank.name,
                    isHost: true
                };

                const room = {
                    code: roomCode,
                    isPublic: true,
                    players: [player],
                    bannedUserIds: [],
                    createdAt: Date.now(),
                    status: 'lobby',
                    currentRound: 0,
                    totalRounds: 5,
                    gamePlan: generateGamePlan(),
                    currentLot: null,
                    usedDomains: [],
                    usedCategories: [],
                    highestBid: 0,
                    topBidder: null,
                    timer: 0,
                    timerRef: null,
                    corrections: []
                };

                rooms.set(roomCode, room);
                roomTimeouts.set(roomCode, scheduleRoomTimeout(roomCode));
                socketRoomMap.set(socket.id, roomCode);
                socket.join(roomCode);

                console.log(`⚡ Quick Match created new public room ${roomCode} hosted by ${user.username}`);
                socket.emit('room_created', { roomCode, room: sanitizeRoom(room) });
            }
        } catch (err) {
            console.error('quick_match error:', err);
            socket.emit('join_error', { message: 'Quick match failed.' });
        }
    });

    function sendRoomSyncState(socket, room) {
        if (!room || room.status === 'lobby') return;

        const lot = room.currentLot;
        // Compute remaining time from server deadline for accurate sync
        let timerValue = room.timer;
        if (room.deadline) {
            timerValue = Math.max(0, Math.ceil((room.deadline - Date.now()) / 1000));
        }
        const payload = {
            status: room.status,
            currentRound: room.currentRound,
            totalRounds: room.totalRounds,
            timer: timerValue,
            deadline: room.deadline || null,
            highestBid: room.highestBid,
            topBidder: room.topBidder,
            sentence: lot ? lot.sentence : null,
            category: lot ? lot.category : null,
            questionId: lot ? lot.questionId : null,
            englishVariety: lot ? lot.englishVariety : null,
            validationReasoning: lot ? lot.validationReasoning : null,
            flawedPhrase: (room.status === 'correction' && lot) ? lot.flawedPhrase : null,
            correctPhrase: (room.status === 'correction' && lot) ? lot.correctPhrase : null,
            correctAnswer: (room.status === 'resolution' || room.status === 'game_over') && lot ? lot.correction : null,
            chatHistory: room.chatHistory || [],
            roundHistory: room.roundHistory || [],
            players: room.players.map(p => ({
                socketId: p.socketId,
                userId: p.userId,
                username: p.username,
                avatar: p.avatar,
                cash: p.cash,
                isHost: p.isHost
            }))
        };

        socket.emit('sync_game_state', payload);
        console.log(`🔄 Sent full sync_game_state [phase: ${room.status}, timer: ${timerValue}s] to socket ${socket.id}`);
    }

    // ── JOIN ROOM ────────────────────────────────────────────
    socket.on('join_room', async ({ roomCode, userId }) => {
        try {
            const cleanCode = String(roomCode || '').replace(/[^0-9]/g, '').trim();
            const room = rooms.get(cleanCode);
            if (!room) {
                return socket.emit('join_error', { message: `Room #${cleanCode || roomCode} not found. Please check the 4-digit code.` });
            }

            // Check if player is banned from room
            if (room.bannedUserIds && room.bannedUserIds.includes(userId)) {
                return socket.emit('join_error', { message: 'You have been kicked from this room and cannot rejoin.' });
            }

            // Check if player is already in room (e.g. refreshed tab, navigated to auction.html, or reconnecting)
            const existingPlayer = room.players.find(p => p.userId === userId);
            if (existingPlayer) {
                // Cancel any pending grace-period disconnect timer
                const graceEntry = disconnectGraceTimers.get(userId);
                if (graceEntry) {
                    clearTimeout(graceEntry.timeout);
                    disconnectGraceTimers.delete(userId);
                    console.log(`🔁 Cancelled grace-period timer for ${existingPlayer.username} (reconnected)`);
                }

                // Clean up old socketRoomMap entry if socket.id changed
                const oldSocketId = existingPlayer.socketId;
                if (oldSocketId && oldSocketId !== socket.id) {
                    socketRoomMap.delete(oldSocketId);
                }

                existingPlayer.socketId = socket.id;
                existingPlayer.disconnected = false;
                socketRoomMap.set(socket.id, cleanCode);
                socket.join(cleanCode);
                socket.emit('join_success', { roomCode: cleanCode, room: sanitizeRoom(room) });

                // If game is in progress, immediately sync active game state
                if (room.status !== 'lobby') {
                    sendRoomSyncState(socket, room);
                } else {
                    io.to(cleanCode).emit('lobby_updated', { room: sanitizeRoom(room) });
                }
                return;
            }

            // Public rooms cannot be joined manually via 4-digit code
            if (room.isPublic) {
                return socket.emit('join_error', { message: 'This is a public room. Please use Quick Mode to match into public rooms!' });
            }

            if (room.players.length >= MAX_PLAYERS) {
                return socket.emit('join_error', { message: 'Room is full (4/4 players).' });
            }

            const user = await User.findById(userId);
            if (!user) {
                return socket.emit('join_error', { message: 'User not found. Please log in again.' });
            }

            const userRank = getRankFromXP(user.xp || 0);
            const player = {
                socketId: socket.id,
                userId: user._id.toString(),
                username: user.username,
                avatar: user.avatar,
                cash: user.cash !== undefined ? user.cash : 10000,
                rankBadge: userRank.badge,
                rankName: userRank.name,
                isHost: false
            };

            room.players.push(player);
            socketRoomMap.set(socket.id, cleanCode);
            socket.join(cleanCode);

            console.log(`👤 ${user.username} joined room ${cleanCode} (${room.players.length}/${MAX_PLAYERS})`);
            socket.emit('join_success', { roomCode: cleanCode, room: sanitizeRoom(room) });
            socket.to(cleanCode).emit('player_joined', { username: user.username });
            io.to(cleanCode).emit('lobby_updated', { room: sanitizeRoom(room) });
        } catch (err) {
            console.error('join_room error:', err);
            socket.emit('join_error', { message: 'Failed to join room.' });
        }
    });

    // ── GET ROOM STATUS (POLLING FALLBACK) ───────────────────
    socket.on('get_room_status', ({ roomCode }) => {
        if (!roomCode) return;
        const cleanCode = String(roomCode).replace(/[^0-9]/g, '').trim();
        const room = rooms.get(cleanCode);
        if (room) {
            socket.emit('lobby_updated', { room: sanitizeRoom(room) });
        }
    });

    // ── START GAME (HOST ONLY & ALL PLAYERS REQUIRED) ───────
    socket.on('start_game', ({ roomCode, userId }) => {
        if (!roomCode || !userId) return;
        const cleanCode = String(roomCode).replace(/[^0-9]/g, '').trim();
        const room = rooms.get(cleanCode);
        if (!room) {
            return socket.emit('join_error', { message: 'Room not found.' });
        }

        const host = room.players.find(p => p.isHost);
        if (!host || host.userId !== userId) {
            return socket.emit('join_error', { message: 'Only the room host can start the game!' });
        }

        if (room.players.length < 2) {
            return socket.emit('join_error', { message: `Need at least 2 players to start! (${room.players.length}/${MAX_PLAYERS})` });
        }

        if (room.status !== 'lobby') {
            return socket.emit('join_error', { message: 'Game already in progress.' });
        }

        // Cancel the 10-minute timeout once game starts
        const timer = roomTimeouts.get(cleanCode);
        if (timer) {
            clearTimeout(timer);
            roomTimeouts.delete(cleanCode);
        }

        // Initialize player game state
        room.currentRound = 0;
        room.gamePlan = generateGamePlan();
        room.currentLot = null;
        room.roundHistory = [];
        room.chatHistory = [];
        room.usedDomains = [];
        room.usedCategories = [];
        room.usedSentences = [];
        room.players.forEach(p => {
            p.points = 0;
            p.boughtHint = false;
        });

        console.log(`🚀 Game starting in room ${cleanCode} triggered by Host ${host.username}`);
        io.to(cleanCode).emit('game_starting', {
            roomCode: cleanCode,
            message: `Host ${host.username} is starting the auction!`
        });

        // Start first round after 3-second countdown
        setTimeout(() => startRound(cleanCode), 3000);
    });

    // ── BUY HINT ─────────────────────────────────────────────
    socket.on('buy_hint', ({ roomCode }) => {
        const cleanCode = String(roomCode || '').replace(/[^0-9]/g, '').trim();
        const room = rooms.get(cleanCode);
        if (!room || room.status !== 'inspection') return;

        const player = room.players.find(p => p.socketId === socket.id);
        if (!player || player.boughtHint) return;

        if (player.cash < 300) {
            return socket.emit('hint_error', { message: 'Not enough cash for a hint ($300).' });
        }

        player.cash -= 300;
        player.boughtHint = true;

        // Persist live cash update to DB
        persistAllHumanCash(room);

        console.log(`💡 ${player.username} bought hint in room ${cleanCode} (-$300)`);
        socket.emit('hint_revealed', {
            hintText: room.currentLot.hintText,
            newCash: player.cash
        });

        // Broadcast updated player cash to everyone
        io.to(cleanCode).emit('players_updated', {
            players: room.players.map(p => ({
                socketId: p.socketId,
                userId: p.userId,
                username: p.username,
                avatar: p.avatar,
                cash: p.cash,
                isHost: p.isHost
            }))
        });
    });

    // ── PLACE BID ────────────────────────────────────────────
    socket.on('place_bid', ({ roomCode, amount }) => {
        const cleanCode = String(roomCode || '').replace(/[^0-9]/g, '').trim();
        const room = rooms.get(cleanCode);
        if (!room || room.status !== 'bidding') return;

        const player = room.players.find(p => p.socketId === socket.id);
        if (!player) return;

        const bidAmount = Math.floor(Number(amount));
        if (isNaN(bidAmount) || bidAmount <= 0) {
            return socket.emit('bid_error', { message: 'Invalid bid amount.' });
        }

        // Apply BID_BOOST if active (Doubles bid amount)
        let effectiveBid = bidAmount;
        let boostApplied = false;
        const activeEffects = room.activeCardEffects && room.activeCardEffects[player.userId];
        if (activeEffects && activeEffects.BID_BOOST) {
            effectiveBid = bidAmount * 2;
            boostApplied = true;
            activeEffects.BID_BOOST_APPLIED = true;
            delete activeEffects.BID_BOOST;
            console.log(`⚡ BID BOOST CARD: ${player.username}'s bid doubled ($${bidAmount} -> $${effectiveBid})`);
            socket.emit('power_card:result', { success: true, message: `⚡ Bid Doubled! Effective bid: $${effectiveBid.toLocaleString()}` });
            io.to(cleanCode).emit('power_card_activated', {
                userId: player.userId,
                username: player.username,
                cardName: 'Bid Boost (2x Bid)',
                icon: '⚡'
            });
        }

        // Bid ladder: must be higher than current highest
        if (effectiveBid <= room.highestBid) {
            return socket.emit('bid_error', { message: `Bid must be higher than current highest ($${room.highestBid.toLocaleString()}).` });
        }

        // Cannot bid against yourself
        if (room.topBidder && room.topBidder.socketId === socket.id) {
            return socket.emit('bid_error', { message: 'You are already the top bidder!' });
        }

        // Must have enough cash for base bid amount
        if (bidAmount > player.cash) {
            return socket.emit('bid_error', { message: 'Not enough vault cash for this bid.' });
        }

        // Place the bid
        room.highestBid = effectiveBid;
        room.topBidder = { socketId: socket.id, userId: player.userId, username: player.username };

        // Notify bot handler of player bid
        onPlayerBid(room, player, bidAmount);

        console.log(`💰 ${player.username} bid $${bidAmount.toLocaleString()} in room ${cleanCode}`);

        // Anti-sniping: if bid placed within last 3 seconds, extend timer by 2s (Max 10s total extension)
        if (room.timer <= 3) {
            const MAX_ANTI_SNIPE_TOTAL = 10;
            const currentExt = room.antiSnipeExtended || 0;
            if (currentExt < MAX_ANTI_SNIPE_TOTAL) {
                const add = Math.min(2, MAX_ANTI_SNIPE_TOTAL - currentExt);
                room.timer += add;
                room.antiSnipeExtended = currentExt + add;
                console.log(`⏰ Anti-snipe: timer extended by +${add}s (Total anti-snipe used: ${room.antiSnipeExtended}/${MAX_ANTI_SNIPE_TOTAL}s) in room ${cleanCode}`);
            }
        }

        // Broadcast bid update to all players
        io.to(cleanCode).emit('bid_update', {
            highestBid: room.highestBid,
            topBidder: room.topBidder,
            timer: room.timer
        });
    });

    // ── SUBMIT CORRECTION ───────────────────────────────────
    socket.on('submit_correction', ({ roomCode, correctedText }) => {
        const cleanCode = String(roomCode || '').replace(/[^0-9]/g, '').trim();
        const room = rooms.get(cleanCode);
        if (!room || room.status !== 'correction') return;

        const player = room.players.find(p => p.socketId === socket.id);
        if (!player) return;

        // Check if player already submitted
        const alreadySubmitted = room.corrections.find(c => c.socketId === socket.id);
        if (alreadySubmitted) {
            return socket.emit('correction_error', { message: 'You already submitted a correction.' });
        }

        const trimmed = (correctedText || '').trim();
        if (!trimmed) {
            return socket.emit('correction_error', { message: 'Correction cannot be empty.' });
        }

        // Normalize comparison: lowercase, strip extra spaces, strip trailing punctuation
        const normalize = s => (s || '').toLowerCase().replace(/\s+/g, ' ').replace(/[.!?]+$/, '').trim();
        const userAttempt = normalize(trimmed);
        const fullCorrection = normalize(room.currentLot.correction);
        const targetPhrase = room.currentLot.correctPhrase ? normalize(room.currentLot.correctPhrase) : null;

        let isAccurate = userAttempt === fullCorrection;
        if (!isAccurate && targetPhrase) {
            isAccurate = (userAttempt === targetPhrase) || (userAttempt.includes(targetPhrase) || targetPhrase.includes(userAttempt));
        }

        // Check for SECOND_CHANCE power card effect if submission is incorrect
        const activeEffects = room.activeCardEffects && room.activeCardEffects[player.userId];
        if (!isAccurate && activeEffects && activeEffects.SECOND_CHANCE) {
            delete activeEffects.SECOND_CHANCE;
            console.log(`🔄 SECOND CHANCE CARD: ${player.username} used Second Chance (failed attempt forgiven)`);
            return socket.emit('second_chance_granted', {
                message: '🔄 SECOND CHANCE! Your correction was incorrect, but Second Chance grants you 1 extra attempt!'
            });
        }

        const submissionOrder = room.corrections.length + 1;
        room.corrections.push({
            socketId: socket.id,
            userId: player.userId,
            username: player.username,
            text: trimmed,
            isAccurate,
            order: submissionOrder
        });

        // Scoring: accurate first = +$500, accurate later = +$200, wrong = -$200
        if (isAccurate && submissionOrder === 1) {
            player.cash += 500;
            console.log(`✅ ${player.username} submitted FIRST correct correction (+$500)`);
        } else if (isAccurate) {
            player.cash += 200;
            console.log(`✅ ${player.username} submitted correct correction (+$200)`);
        } else {
            player.cash -= 200;
            console.log(`❌ ${player.username} submitted wrong correction (-$200)`);
        }

        // Persist live cash update to DB
        persistAllHumanCash(room);

        // Update correction accuracy stats & award server-authoritative XP for human player
        if (!player.isBot) {
            const matchId = room.matchId || room.code;
            const roundId = `round_${room.currentRound}`;

            User.findById(player.userId).then(async (user) => {
                if (!user) return;
                if (!user.stats) user.stats = {};
                user.stats.totalCorrectionsSubmitted = (user.stats.totalCorrectionsSubmitted || 0) + 1;
                if (isAccurate) {
                    user.stats.correctCorrectionsSubmitted = (user.stats.correctCorrectionsSubmitted || 0) + 1;
                }
                await user.save();

                if (isAccurate) {
                    const xpReward = submissionOrder === 1 ? XP_REWARDS.CORRECTION_FIRST_ACCURATE : XP_REWARDS.CORRECTION_ACCURATE;
                    const xpType = submissionOrder === 1 ? 'CORRECTION_FIRST_ACCURATE' : 'CORRECTION_ACCURATE';
                    const xpDesc = submissionOrder === 1
                        ? `First accurate correction in round ${room.currentRound}`
                        : `Accurate correction in round ${room.currentRound}`;

                    await awardXP({
                        userId: player.userId,
                        amount: xpReward,
                        type: xpType,
                        matchId,
                        roundId,
                        description: xpDesc,
                        io,
                        roomCode: cleanCode
                    });
                }
            }).catch(err => console.error('Correction stat & XP update error:', err));
        }

        // Tell only this player their result
        socket.emit('correction_result', {
            isAccurate,
            cashChange: isAccurate ? (submissionOrder === 1 ? 500 : 200) : -200,
            newCash: player.cash,
            order: submissionOrder
        });

        // Broadcast updated cash to all
        io.to(cleanCode).emit('players_updated', {
            players: room.players.map(p => ({
                socketId: p.socketId,
                userId: p.userId,
                username: p.username,
                avatar: p.avatar,
                cash: p.cash,
                isHost: p.isHost
            }))
        });
    });

    // ── GET POWER CARDS STATE (SOCKET) ──────────────────────
    socket.on('power_cards:get_state', async () => {
        const userId = socketUserMap.get(socket.id);
        if (!userId) return;
        const data = await getUserPowerCards(userId);
        if (data) {
            socket.emit('power_cards:state', { cash: data.cash, inventory: data.inventory });
        }
    });

    // ── POWER CARD PURCHASE (SOCKET) ──────────────────────────
    socket.on('power_card:purchase', async ({ cardId, quantity }) => {
        const userId = socketUserMap.get(socket.id);
        if (!userId) return socket.emit('power_card:error', { message: 'Unauthorized' });

        const result = await purchasePowerCard(userId, cardId, quantity || 1);
        if (result.success) {
            socket.emit('power_cards:state', { cash: result.cash, inventory: result.inventory });
            socket.emit('power_card:result', { success: true, message: `Purchased ${result.quantity}x ${result.card.name}!`, result });
        } else {
            socket.emit('power_card:error', { message: result.message || 'Purchase failed.' });
        }
    });

    // ── POWER CARD USE (SOCKET) ─────────────────────────────
    socket.on('power_card:use', async ({ roomCode, cardId }) => {
        const userId = socketUserMap.get(socket.id);
        if (!userId) return socket.emit('power_card:error', { message: 'Unauthorized' });

        const cleanCode = String(roomCode || '').replace(/[^0-9]/g, '').trim();
        const room = rooms.get(cleanCode);

        const result = await consumeAndApplyCard(userId, cardId, room, room ? room.status : null);
        if (!result.success) {
            return socket.emit('power_card:error', { message: result.message });
        }

        socket.emit('power_cards:state', { inventory: result.inventory });
        socket.emit('power_card:result', { success: true, message: `Activated ${result.card.name}!`, cardId });

        // Broadcast activation to all players in the room
        io.to(cleanCode).emit('power_card_activated', {
            userId: result.userId,
            username: result.username,
            cardId,
            cardName: result.card.name,
            icon: result.card.icon
        });

        // Special handling for Double Hint reveal immediately upon activation
        if (cardId === 'DOUBLE_HINT' && room && room.currentLot) {
            const secondaryHint = room.currentLot.validationReasoning
                ? `💡 Detailed Rule: ${room.currentLot.validationReasoning}`
                : `💡 Clue: ${room.currentLot.hintText} (Category: ${room.currentLot.category})`;

            socket.emit('double_hint_revealed', {
                hintText: secondaryHint,
                cardId: 'DOUBLE_HINT'
            });
        }
    });

    // ── KICK PLAYER (HOST ONLY) ──────────────────────────────
    socket.on('kick_player', ({ roomCode, userId: hostUserId, targetUserId }) => {
        try {
            if (!roomCode || !targetUserId) return;
            const cleanCode = String(roomCode).replace(/[^0-9]/g, '').trim();
            const room = rooms.get(cleanCode);
            if (!room) return;

            // Verify requesting player is host
            const host = room.players.find(p => p.isHost);
            if (!host || (hostUserId && host.userId !== hostUserId)) {
                return socket.emit('join_error', { message: 'Only the room host can kick players.' });
            }

            if (host.userId === targetUserId) {
                return socket.emit('join_error', { message: 'Host cannot kick themselves.' });
            }

            const targetIndex = room.players.findIndex(p => p.userId === targetUserId);
            if (targetIndex === -1) return;

            const [kickedPlayer] = room.players.splice(targetIndex, 1);

            // Add to bannedUserIds
            if (!room.bannedUserIds) room.bannedUserIds = [];
            if (!room.bannedUserIds.includes(targetUserId)) {
                room.bannedUserIds.push(targetUserId);
            }

            // Disconnect socket from room
            if (kickedPlayer.socketId) {
                socketRoomMap.delete(kickedPlayer.socketId);
                const targetSocket = io.sockets.sockets.get(kickedPlayer.socketId);
                if (targetSocket) {
                    targetSocket.leave(cleanCode);
                    targetSocket.emit('you_were_kicked', {
                        message: `You were kicked from room #${cleanCode} by host ${host.username}.`
                    });
                }
            }

            console.log(`🚫 Host ${host.username} kicked ${kickedPlayer.username} from room ${cleanCode}`);

            // Notify remaining players
            io.to(cleanCode).emit('player_kicked_notify', {
                username: kickedPlayer.username,
                message: `Host ${host.username} kicked ${kickedPlayer.username}.`
            });
            io.to(cleanCode).emit('lobby_updated', { room: sanitizeRoom(room) });
        } catch (err) {
            console.error('kick_player error:', err);
        }
    });

    // ── LEAVE ROOM (EXPLICIT MATCH EXIT) ──────────────────────
    socket.on('leave_room', ({ roomCode, userId }) => {
        try {
            const cleanCode = String(roomCode || '').replace(/[^0-9]/g, '').trim();
            const room = rooms.get(cleanCode);
            if (!room) return;

            const player = room.players.find(p => p.socketId === socket.id || p.userId === userId);
            if (!player) return;

            // Cancel any disconnect grace timer for this user
            const existingGrace = disconnectGraceTimers.get(player.userId);
            if (existingGrace) {
                clearTimeout(existingGrace.timeout);
                disconnectGraceTimers.delete(player.userId);
            }

            // Remove player from room
            room.players = room.players.filter(p => p.userId !== player.userId);
            socketRoomMap.delete(socket.id);
            socket.leave(cleanCode);

            console.log(`🚪 ${player.username} explicitly left room ${cleanCode}`);

            const remainingHumans = room.players.filter(p => !p.isBot && !p.disconnected);
            if (remainingHumans.length === 0) {
                const emptyTimer = roomTimeouts.get(cleanCode);
                if (emptyTimer) {
                    clearTimeout(emptyTimer);
                    roomTimeouts.delete(cleanCode);
                }
                destroyRoomBots(cleanCode);
                rooms.delete(cleanCode);
                console.log(`🗑️ Room ${cleanCode} deleted (no human players remaining after ${player.username} left)`);
            } else {
                let newHostUsername = null;
                const hasHost = room.players.some(p => p.isHost && !p.disconnected);
                if (!hasHost && room.players.length > 0) {
                    const nextHost = room.players.find(p => !p.disconnected) || room.players[0];
                    if (nextHost) {
                        nextHost.isHost = true;
                        newHostUsername = nextHost.username;
                    }
                }
                io.to(cleanCode).emit('player_left', {
                    username: player.username,
                    wasHost: player.isHost,
                    newHostUsername
                });
                io.to(cleanCode).emit('lobby_updated', { room: sanitizeRoom(room) });
            }
        } catch (err) {
            console.error('leave_room error:', err);
        }
    });

    // ── DISCONNECT ───────────────────────────────────────────
    socket.on('disconnect', () => {
        // Remove from online tracking
        const disconnectedUserId = socketUserMap.get(socket.id);
        if (disconnectedUserId) {
            socketUserMap.delete(socket.id);
            // Only remove from onlineUserIds if no other sockets have this userId
            const stillOnline = [...socketUserMap.values()].includes(disconnectedUserId);
            if (!stillOnline) onlineUserIds.delete(disconnectedUserId);
        }

        const roomCode = socketRoomMap.get(socket.id);
        if (!roomCode) return;

        const room = rooms.get(roomCode);
        if (!room) {
            socketRoomMap.delete(socket.id);
            return;
        }

        const leavingPlayer = room.players.find(p => p.socketId === socket.id);
        const leavingUsername = leavingPlayer ? leavingPlayer.username : 'A player';
        const wasHost = leavingPlayer ? leavingPlayer.isHost : false;

        // ── GRACE PERIOD: During active game, keep player slot for 60s ──
        const isActiveGame = room.status !== 'lobby' && room.status !== 'game_over';
        if (isActiveGame && leavingPlayer && !leavingPlayer.isBot) {
            leavingPlayer.disconnected = true;
            socketRoomMap.delete(socket.id);
            console.log(`⏳ ${leavingUsername} disconnected from active game in room ${roomCode} — grace period started (60s)`);

            // Cancel any existing grace timer for this userId (e.g. rapid disconnect/reconnect)
            const existingGrace = disconnectGraceTimers.get(leavingPlayer.userId);
            if (existingGrace) {
                clearTimeout(existingGrace.timeout);
            }

            const graceTimeout = setTimeout(() => {
                disconnectGraceTimers.delete(leavingPlayer.userId);
                const currentRoom = rooms.get(roomCode);
                if (!currentRoom) return;

                const playerStillDisconnected = currentRoom.players.find(
                    p => p.userId === leavingPlayer.userId && p.disconnected
                );
                if (!playerStillDisconnected) return; // They reconnected, nothing to do

                // Grace period expired — remove player for real
                currentRoom.players = currentRoom.players.filter(p => p.userId !== leavingPlayer.userId);
                console.log(`🚪 ${leavingUsername} grace period expired — removed from room ${roomCode} (${currentRoom.players.length} remaining)`);

                const remainingHumans = currentRoom.players.filter(p => !p.isBot && !p.disconnected);
                if (remainingHumans.length === 0) {
                    const emptyTimer = roomTimeouts.get(roomCode);
                    if (emptyTimer) {
                        clearTimeout(emptyTimer);
                        roomTimeouts.delete(roomCode);
                    }
                    destroyRoomBots(roomCode);
                    rooms.delete(roomCode);
                    console.log(`🗑️  Room ${roomCode} deleted (no human players remaining after grace)`);
                } else {
                    let newHostUsername = null;
                    const hasHost = currentRoom.players.some(p => p.isHost && !p.disconnected);
                    if (!hasHost && currentRoom.players.length > 0) {
                        currentRoom.players[0].isHost = true;
                        newHostUsername = currentRoom.players[0].username;
                    }
                    io.to(roomCode).emit('player_left', {
                        username: leavingUsername,
                        wasHost,
                        newHostUsername
                    });
                    io.to(roomCode).emit('lobby_updated', { room: sanitizeRoom(currentRoom) });
                }
            }, 60000); // 60 second grace period

            disconnectGraceTimers.set(leavingPlayer.userId, {
                timeout: graceTimeout,
                roomCode
            });
            return; // Don't remove player yet
        }

        // ── IMMEDIATE REMOVAL: lobby/game_over or bot ──
        room.players = room.players.filter(p => p.socketId !== socket.id);
        socketRoomMap.delete(socket.id);

        console.log(`🚪 ${leavingUsername} left room ${roomCode} (${room.players.length} remaining)`);

        const remainingHumans = room.players.filter(p => !p.isBot && !p.disconnected);
        if (remainingHumans.length === 0) {
            const emptyTimer = roomTimeouts.get(roomCode);
            if (emptyTimer) {
                clearTimeout(emptyTimer);
                roomTimeouts.delete(roomCode);
            }
            destroyRoomBots(roomCode);
            rooms.delete(roomCode);
            console.log(`🗑️  Room ${roomCode} deleted (no human players remaining)`);
        } else {
            let newHostUsername = null;
            // Promote next player to host if the host left
            const hasHost = room.players.some(p => p.isHost && !p.disconnected);
            if (!hasHost && room.players.length > 0) {
                room.players[0].isHost = true;
                newHostUsername = room.players[0].username;
                console.log(`👑 ${newHostUsername} promoted to host in room ${roomCode}`);
            }
            io.to(roomCode).emit('player_left', {
                username: leavingUsername,
                wasHost,
                newHostUsername
            });
            io.to(roomCode).emit('lobby_updated', { room: sanitizeRoom(room) });
        }
    });
});



// ─── Start Server ────────────────────────────────────────────
server.listen(PORT, () => {
    console.log(`🚀 Server running at http://localhost:${PORT}`);
});
