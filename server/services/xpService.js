// server/services/xpService.js
// ─── Server-Authoritative XP & Rank Progression Service ──────────

const User = require('../../models/User');
const XPTransaction = require('../../models/XPTransaction');
const InboxMessage = require('../../models/InboxMessage');
const { getRankFromXP, calculateRankProgress } = require('../config/ranks');

/**
 * Ensures user's rank is synchronized with user's XP (XP is sole source of truth).
 */
function ensureUserRankSync(user) {
    if (!user) return;
    const authoritativeRank = getRankFromXP(user.xp || 0).name;
    if (user.rank !== authoritativeRank) {
        user.rank = authoritativeRank;
    }
}

/**
 * Award XP to a user with idempotency and rank-up detection.
 * 
 * @param {Object} params
 * @param {string} params.userId
 * @param {number} params.amount
 * @param {string} params.type - Enum from XPTransaction
 * @param {string} [params.matchId]
 * @param {string} [params.roundId]
 * @param {string} [params.description]
 * @param {Object} [params.io] - Socket.io server instance for rank-up emission
 * @param {Map} [params.socketUserMap] - Map socketId -> userId or userId -> socketId
 */
async function awardXP({ userId, amount, type, matchId = null, roundId = null, description = '', io = null, roomCode = null, socketUserMap = null }) {
    if (!userId || typeof userId !== 'string' || userId.startsWith('bot_')) {
        return { awarded: false, reason: 'BOT_OR_INVALID_USER' };
    }

    const xpAmount = Math.floor(Number(amount));
    if (isNaN(xpAmount) || xpAmount <= 0) {
        return { awarded: false, reason: 'INVALID_AMOUNT' };
    }

    // Idempotency check: if matchId & type exist, prevent duplicate rewards
    if (matchId || roundId) {
        const query = { userId, type };
        if (matchId) query.matchId = matchId;
        if (roundId) query.roundId = roundId;

        const existingTxn = await XPTransaction.findOne(query).lean();
        if (existingTxn) {
            console.log(`⚠️ Idempotency guard: duplicate XP reward blocked for user ${userId} [type: ${type}, matchId: ${matchId}, roundId: ${roundId}]`);
            return { awarded: false, reason: 'DUPLICATE_TRANSACTION', transaction: existingTxn };
        }
    }

    try {
        const user = await User.findById(userId);
        if (!user) {
            return { awarded: false, reason: 'USER_NOT_FOUND' };
        }

        const xpBefore = Math.max(0, user.xp || 0);
        const xpAfter = xpBefore + xpAmount;

        const oldRankObj = getRankFromXP(xpBefore);
        const newRankObj = getRankFromXP(xpAfter);

        // Update user XP & synchronized Rank (XP is authoritative)
        user.xp = xpAfter;
        user.rank = newRankObj.name;
        await user.save();

        const xpTxnId = `xpt_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
        let transaction = null;
        try {
            const safeMatchId = matchId || (type === 'RANK_ADJUSTMENT' ? `adj_${Date.now()}_${Math.random().toString(36).substring(2, 6)}` : null);
            transaction = await XPTransaction.create({
                xpTransactionId: xpTxnId,
                userId: user._id.toString(),
                username: user.username,
                type,
                amount: xpAmount,
                xpBefore,
                xpAfter,
                matchId: safeMatchId,
                roundId,
                description: description || `Awarded +${xpAmount} XP for ${type}`
            });
        } catch (txErr) {
            if (txErr.code === 11000) {
                console.log(`⚠️ Idempotency transaction skipped for duplicate award (${type})`);
            } else {
                console.error('XPTransaction log warning:', txErr.message);
            }
        }

        const rankedUp = oldRankObj.name !== newRankObj.name;
        const reasonText = description || type;

        console.log(`⭐ [XP AWARD] [Reason: ${reasonText}] ${user.username} (${user._id}): +${xpAmount} XP (${xpBefore} ➔ ${xpAfter} XP) | Old Rank: "${oldRankObj.name}" | New Rank: "${newRankObj.name}" | Ranked Up: ${rankedUp}`);

        // Broadcast XP gain event for floating UI text animation (+25 XP)
        if (io) {
            const xpPayload = {
                userId: user._id.toString(),
                username: user.username,
                amount: xpAmount,
                type,
                totalXP: xpAfter
            };
            if (roomCode) {
                io.to(roomCode).emit('xp_gained', xpPayload);
            } else {
                io.emit('xp_gained', xpPayload);
            }
        }

        if (rankedUp) {
            console.log(`🏆 [RANK UP TRIGGERED] ${user.username}: ${oldRankObj.name} ➔ ${newRankObj.name} (${xpBefore} ➔ ${xpAfter} XP)`);

            // Award +20 Gold Tokens on Rank Up!
            user.tokens = (user.tokens || 0) + 20;
            console.log(`🪙 [RANK UP BONUS] ${user.username} received +20 Gold Tokens! (New Total: ${user.tokens})`);

            const rankUpPayload = {
                oldRank: oldRankObj.name,
                oldRankBadge: oldRankObj.badge,
                newRank: newRankObj.name,
                newRankBadge: newRankObj.badge,
                newRankObj: {
                    name: newRankObj.name,
                    badge: newRankObj.badge
                },
                currentXP: xpAfter,
                rankProgress: calculateRankProgress(xpAfter),
                message: 'Your grammar skills are improving!'
            };

            // Automated Inbox Notification for Rank Unlock
            try {
                const createdMsg = await InboxMessage.create({
                    userId: user._id.toString(),
                    type: 'reward',
                    title: `🏆 Rank Unlocked: ${newRankObj.badge} ${newRankObj.name}`,
                    body: `Congratulations, ${user.username}! You have accumulated ${xpAfter.toLocaleString()} XP and officially unlocked the rank of ${newRankObj.name}. Click "Show Animation" below to replay your unlock celebration!`,
                    metadata: {
                        rankName: newRankObj.name,
                        rankBadge: newRankObj.badge,
                        xp: xpAfter,
                        showAnimation: true
                    }
                });
                console.log(`📬 [INBOX MESSAGE CREATED] ID: ${createdMsg._id} for User: ${user.username} (${newRankObj.name})`);
            } catch (inboxErr) {
                console.error('❌ Failed to create rank up inbox message:', inboxErr);
            }

            // Emit rank-up socket notification & inbox refresh signal if io is available
            if (io) {
                io.emit(`rank_up_${userId}`, rankUpPayload);
                io.emit(`inbox_updated_${userId}`, { message: 'New rank unlock inbox message' });
            }
        }

        return {
            awarded: true,
            xpEarned: xpAmount,
            xpBefore,
            newXP: xpAfter,
            oldRank: oldRankObj.name,
            newRank: newRankObj.name,
            rankedUp,
            transaction
        };
    } catch (err) {
        console.error(`Failed to award XP to user ${userId}:`, err);
        return { awarded: false, reason: 'SERVER_ERROR', error: err.message };
    }
}

/**
 * Get user progression state (XP, rank, progress details).
 */
async function getUserProgression(userId) {
    if (!userId) return null;
    const user = await User.findById(userId).lean();
    if (!user) return null;

    const xp = Math.max(0, user.xp || 0);
    const progress = calculateRankProgress(xp);
    return {
        userId: user._id.toString(),
        username: user.username,
        xp,
        rank: progress.currentRankName,
        rankProgress: progress
    };
}

module.exports = {
    awardXP,
    ensureUserRankSync,
    getUserProgression
};
