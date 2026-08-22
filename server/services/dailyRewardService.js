// server/services/dailyRewardService.js
// ─── Server-Authoritative Daily Reward Claim & Status Service ──────

const User = require('../../models/User');
const Transaction = require('../../models/Transaction');
const DailyRewardClaim = require('../../models/DailyRewardClaim');
const { awardXP } = require('./xpService');
const {
    DAILY_REWARDS,
    TOTAL_DAYS,
    getUTCDateString,
    getYesterdayUTCDateString,
    getNextUTCMidnight
} = require('../config/dailyRewards');

/**
 * Compute the user's daily reward state, handling streak reset if they missed a day.
 * Returns the resolved (possibly reset) currentDay and dailyStreak.
 */
function resolveStreakState(user) {
    const today = getUTCDateString();
    const yesterday = getYesterdayUTCDateString();
    const dr = user.dailyReward || {};
    const lastClaim = dr.lastClaimDate || null;
    const rawDay = dr.currentDay || 1;

    // Already claimed today — return state of claimed day
    if (lastClaim === today) {
        return {
            currentDay: rawDay,
            dailyStreak: dr.dailyStreak || 1,
            canClaim: false,
            alreadyClaimedToday: true
        };
    }

    // Claimed yesterday — streak continues! Advance to next day for today's claim
    if (lastClaim === yesterday) {
        const nextDay = rawDay >= TOTAL_DAYS ? 1 : rawDay + 1;
        return {
            currentDay: nextDay,
            dailyStreak: dr.dailyStreak || 0,
            canClaim: true,
            alreadyClaimedToday: false
        };
    }

    // Missed a day (or brand new user) — reset streak to Day 1
    return {
        currentDay: 1,
        dailyStreak: 0,
        canClaim: true,
        alreadyClaimedToday: false
    };
}

/**
 * GET: Daily reward status for a user.
 * Returns everything the client needs to render the UI.
 */
async function getDailyRewardStatus(userId) {
    const user = await User.findById(userId).lean();
    if (!user) return null;

    const { currentDay, dailyStreak, canClaim, alreadyClaimedToday } = resolveStreakState(user);
    const todayReward = DAILY_REWARDS.find(r => r.day === currentDay);
    const nextDay = currentDay >= TOTAL_DAYS ? 1 : currentDay + 1;
    const nextReward = DAILY_REWARDS.find(r => r.day === nextDay);
    const nextClaimTime = getNextUTCMidnight().toISOString();

    // Build 7-day schedule with states
    const schedule = DAILY_REWARDS.map(r => {
        let state = 'locked';
        if (alreadyClaimedToday) {
            // Everything up to and including currentDay is claimed
            if (r.day <= currentDay) state = 'claimed';
            else state = 'locked';
        } else if (canClaim) {
            // Days before currentDay are claimed, currentDay is available, rest locked
            if (r.day < currentDay) state = 'claimed';
            else if (r.day === currentDay) state = 'available';
            else state = 'locked';
        } else {
            // Edge case: can't claim (shouldn't normally happen)
            if (r.day < currentDay) state = 'claimed';
            else state = 'locked';
        }
        return { ...r, state };
    });

    return {
        currentDay,
        dailyStreak: alreadyClaimedToday ? dailyStreak : (canClaim ? dailyStreak : 0),
        canClaim,
        alreadyClaimedToday,
        todayReward,
        nextReward,
        lastClaimDate: (user.dailyReward && user.dailyReward.lastClaimDate) || null,
        nextClaimTime,
        schedule
    };
}

/**
 * POST: Claim today's daily reward.
 * Idempotent — duplicate calls return already-claimed without re-applying rewards.
 *
 * @param {string} userId
 * @returns {Object} Claim result
 */
async function claimDailyReward(userId) {
    const user = await User.findById(userId);
    if (!user) return { success: false, error: 'USER_NOT_FOUND' };

    const today = getUTCDateString();
    const { currentDay, dailyStreak, canClaim, alreadyClaimedToday } = resolveStreakState(user);

    if (alreadyClaimedToday) {
        return { success: false, error: 'ALREADY_CLAIMED', message: 'You have already claimed today\'s reward.' };
    }

    if (!canClaim) {
        return { success: false, error: 'NOT_AVAILABLE', message: 'Daily reward is not available right now.' };
    }

    const reward = DAILY_REWARDS.find(r => r.day === currentDay);
    if (!reward) {
        return { success: false, error: 'INVALID_DAY', message: 'Invalid reward day.' };
    }

    // Idempotency key: one claim per user per UTC calendar day
    const claimId = `drc_${userId}_${today}`;

    // ── Attempt to create the claim record (atomic gate) ────────
    // If a concurrent request already created this record, the unique index
    // will throw a duplicate key error (code 11000) and we return already-claimed.
    try {
        await DailyRewardClaim.create({
            claimId,
            userId: user._id.toString(),
            username: user.username,
            rewardDay: currentDay,
            rewardDate: today,
            rewardType: reward.type,
            rewardDetails: reward,
            dailyStreakAtClaim: dailyStreak + 1
        });
    } catch (err) {
        if (err.code === 11000) {
            return { success: false, error: 'ALREADY_CLAIMED', message: 'Reward already claimed (concurrent request).' };
        }
        throw err;
    }

    // ── Apply rewards ──────────────────────────────────────────
    const appliedRewards = [];

    async function applyReward(r) {
        if (r.type === 'cash') {
            const balanceBefore = user.cash || 0;
            user.cash = balanceBefore + r.amount;

            try {
                await Transaction.create({
                    transactionId: `txn_daily_${userId}_${today}_${r.amount}`,
                    userId: user._id.toString(),
                    username: user.username,
                    type: 'DAILY_REWARD',
                    amount: r.amount,
                    balanceBefore,
                    balanceAfter: user.cash,
                    reason: `Daily reward Day ${currentDay}`
                });
            } catch (txErr) {
                if (txErr.code !== 11000) console.error('Daily reward transaction log error:', txErr.message);
            }

            appliedRewards.push({ type: 'cash', amount: r.amount });

        } else if (r.type === 'tokens') {
            const tokensBefore = user.tokens || 0;
            user.tokens = tokensBefore + r.amount;

            try {
                await Transaction.create({
                    transactionId: `txn_daily_tokens_${userId}_${today}_${r.amount}`,
                    userId: user._id.toString(),
                    username: user.username,
                    type: 'DAILY_REWARD',
                    amount: r.amount,
                    balanceBefore: tokensBefore,
                    balanceAfter: user.tokens,
                    reason: `Daily reward Day ${currentDay}: +${r.amount} Gold Tokens`
                });
            } catch (txErr) {
                if (txErr.code !== 11000) console.error('Daily reward tokens transaction log error:', txErr.message);
            }

            appliedRewards.push({ type: 'tokens', amount: r.amount });

        } else if (r.type === 'powerCard') {
            if (!user.inventory) user.inventory = {};
            if (!user.inventory.powerCards) user.inventory.powerCards = {};
            const curQty = Number(user.inventory.powerCards[r.cardId] || 0);
            user.inventory.powerCards[r.cardId] = curQty + (r.quantity || 1);
            user.markModified('inventory');

            appliedRewards.push({ type: 'powerCard', cardId: r.cardId, quantity: r.quantity || 1 });

        } else if (r.type === 'xp') {
            const xpResult = await awardXP({
                userId: user._id.toString(),
                amount: r.amount,
                type: 'DAILY_REWARD',
                matchId: claimId,
                roundId: `day_${currentDay}`,
                description: `Daily reward Day ${currentDay}: +${r.amount} XP`
            });
            appliedRewards.push({ type: 'xp', amount: r.amount, awarded: xpResult.awarded });

        } else if (r.type === 'avatar') {
            // Unlock avatar if not already unlocked
            const avatarUrl = r.avatarUrl;
            if (avatarUrl && !user.unlockedAvatars.includes(avatarUrl)) {
                user.unlockedAvatars.push(avatarUrl);
            }
            appliedRewards.push({ type: 'avatar', avatarUrl });

        } else if (r.type === 'multi') {
            for (const sub of r.rewards) {
                await applyReward(sub);
            }
        }
    }

    await applyReward(reward);

    // ── Update user daily reward state ──────────────────────────
    const nextDay = currentDay >= TOTAL_DAYS ? 1 : currentDay + 1;
    user.dailyReward = {
        currentDay: currentDay,
        dailyStreak: dailyStreak + 1,
        lastClaimDate: today
    };

    try {
        await user.save();
    } catch (saveErr) {
        // If version error or concurrent save collision occurs, query fresh user doc to save
        const freshUser = await User.findById(userId);
        if (freshUser) {
            freshUser.cash = user.cash;
            freshUser.tokens = user.tokens;
            if (user.inventory) freshUser.inventory = user.inventory;
            if (user.unlockedAvatars) freshUser.unlockedAvatars = user.unlockedAvatars;
            freshUser.dailyReward = user.dailyReward;
            await freshUser.save().catch(() => { });
        }
    }

    return {
        success: true,
        claimId,
        rewardDay: currentDay,
        rewardDate: today,
        reward: { ...reward },
        appliedRewards,
        tokens: user.tokens,
        cash: user.cash,
        newDailyStreak: dailyStreak + 1,
        nextDay: nextDay,
        nextClaimTime: getNextUTCMidnight().toISOString()
    };
}

module.exports = {
    getDailyRewardStatus,
    claimDailyReward
};
