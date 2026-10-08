const express = require('express');
const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const User = require('../../models/User');
const Log = require('../../models/Log');
const QuestionReport = require('../../models/QuestionReport');
const Transaction = require('../../models/Transaction');
const InboxMessage = require('../../models/InboxMessage');
const { ADMIN_JWT_SECRET, ADMIN_CODE, adminMiddleware } = require('../middleware/auth');
const { adminVerifyRateLimiter } = require('../middleware/rateLimiters');
const { onlineUserIds } = require('../game/gameState');
const { sendPushToUser, sendPushToAll } = require('../services/pushService');

const router = express.Router();

// POST /api/admin/verify
router.post('/verify', adminVerifyRateLimiter, (req, res) => {
    const { code } = req.body || {};
    if (!ADMIN_CODE) {
        return res.status(503).json({ success: false, error: 'Admin panel is not configured on this server.' });
    }
    if (typeof code !== 'string') {
        return res.status(400).json({ success: false, error: 'Admin code required.' });
    }

    const codeBuf = Buffer.from(code);
    const adminBuf = Buffer.from(ADMIN_CODE);
    const isMatch = codeBuf.length === adminBuf.length && crypto.timingSafeEqual(codeBuf, adminBuf);

    if (!isMatch) {
        return res.status(403).json({ success: false, error: 'Invalid admin code.' });
    }

    const token = jwt.sign({ isAdmin: true, role: 'admin' }, ADMIN_JWT_SECRET, { expiresIn: '1h' });
    res.json({ success: true, token });
});

// GET /api/admin/users
router.get('/users', adminMiddleware, async (req, res) => {
    try {
        const users = await User.find({}).select('-password').sort({ createdAt: -1 }).lean();
        res.json({ users, onlineUserIds: Array.from(onlineUserIds) });
    } catch (err) {
        res.status(500).json({ error: 'Failed to fetch users.' });
    }
});

// DELETE /api/admin/users/:userId
router.delete('/users/:userId', adminMiddleware, async (req, res) => {
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

// GET /api/admin/logs
router.get('/logs', adminMiddleware, async (req, res) => {
    try {
        const logs = await Log.find({}).sort({ timestamp: -1 }).limit(500).lean();
        res.json({ logs });
    } catch (err) {
        res.status(500).json({ error: 'Failed to fetch logs.' });
    }
});

// DELETE /api/admin/logs
router.delete('/logs', adminMiddleware, async (req, res) => {
    try {
        await Log.deleteMany({});
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: 'Failed to clear logs.' });
    }
});

// POST /api/admin/broadcast
router.post('/broadcast', adminMiddleware, async (req, res) => {
    try {
        const { target, userId, type, title, body, cashReward, imageUrl } = req.body;

        if (!title || !title.trim() || !body || !body.trim()) {
            return res.status(400).json({ error: 'Title and body message are required.' });
        }

        const msgType = type === 'reward' ? 'reward' : (type === 'news' ? 'news' : 'announcement');
        const MAX_CASH_REWARD = 100000;
        const rewardAmount = (msgType === 'reward' && Number(cashReward) > 0) ? Math.min(Number(cashReward), MAX_CASH_REWARD) : 0;
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
                    transactionId: `txn_grant_${crypto.randomUUID()}`,
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

            sendPushToUser(user._id.toString(), {
                title: `📬 ${title.trim()}`,
                body: body.trim(),
                url: '/'
            }).catch(() => { });

            return res.json({ success: true, recipientCount: 1, message: `Message sent to ${user.username}` });
        } else {
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
                        transactionId: `txn_grant_${crypto.randomUUID()}`,
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

// GET /api/admin/reports
router.get('/reports', adminMiddleware, async (req, res) => {
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

// GET /api/admin/reports/:reportId
router.get('/reports/:reportId', adminMiddleware, async (req, res) => {
    try {
        const report = await QuestionReport.findOne({ reportId: req.params.reportId }).lean();
        if (!report) return res.status(404).json({ error: 'Report not found.' });

        const relatedReports = await QuestionReport.find({ questionId: report.questionId }).lean();
        const transactions = await Transaction.find({ questionId: report.questionId }).lean();

        res.json({ report, relatedReports, transactions });
    } catch (err) {
        console.error('Admin report detail error:', err);
        res.status(500).json({ error: 'Failed to fetch report detail.' });
    }
});

// POST /api/admin/reports/:reportId/approve
router.post('/reports/:reportId/approve', adminMiddleware, async (req, res) => {
    try {
        const report = await QuestionReport.findOne({ reportId: req.params.reportId });
        if (!report) return res.status(404).json({ error: 'Report not found.' });
        if (report.status === 'valid' || report.status === 'question_disabled') {
            return res.status(409).json({ error: 'Report already processed.' });
        }

        report.status = 'valid';
        report.reviewedAt = new Date();
        report.reviewedBy = 'admin';
        await report.save();

        const allReportsForQuestion = await QuestionReport.find({ questionId: report.questionId });
        const affectedPlayers = [];

        for (const r of allReportsForQuestion) {
            const existingTx = await Transaction.findOne({
                reportId: r.reportId,
                userId: r.reporterId,
                type: 'QUESTION_COMPENSATION'
            });
            if (existingTx) continue;

            if (r.bidAmount > 0) {
                const user = await User.findById(r.reporterId);
                if (!user) continue;

                const compensationAmount = r.bidAmount * 2;
                const balanceBefore = user.cash;
                user.cash += compensationAmount;
                const balanceAfter = user.cash;
                await user.save();

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

// POST /api/admin/reports/:reportId/reject
router.post('/reports/:reportId/reject', adminMiddleware, async (req, res) => {
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

// POST /api/admin/reports/:reportId/disable-question
router.post('/reports/:reportId/disable-question', adminMiddleware, async (req, res) => {
    try {
        const report = await QuestionReport.findOne({ reportId: req.params.reportId });
        if (!report) return res.status(404).json({ error: 'Report not found.' });

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

// GET /api/admin/transactions
router.get('/transactions', adminMiddleware, async (req, res) => {
    try {
        const transactions = await Transaction.find({}).sort({ createdAt: -1 }).limit(200).lean();
        res.json({ transactions });
    } catch (err) {
        res.status(500).json({ error: 'Failed to fetch transactions.' });
    }
});

module.exports = router;
