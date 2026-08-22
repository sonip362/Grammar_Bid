// server/config/dailyRewards.js
// ─── Daily Reward Schedule & Constants ─────────────────────────

/**
 * 7-day rotating reward cycle.
 * After Day 7, the cycle repeats from Day 1.
 *
 * Reward types:
 *   'cash'   — server adds to User.cash via Transaction
 *   'xp'     — server calls awardXP() from xpService
 *   'avatar' — server unlocks a profile avatar for the user
 *   'multi'  — server applies multiple sub-rewards
 *
 * Card rewards (hint/shield) are placeholders for future inventory system.
 * Until then, Day 4 & Day 6 award cash equivalents.
 */

const DAILY_REWARDS = [
    {
        day: 1,
        type: 'multi',
        rewards: [
            { type: 'tokens', amount: 10 },
            { type: 'xp', amount: 100 }
        ],
        label: '10 Gold Tokens + 100 XP',
        icon: '🪙'
    },
    {
        day: 2,
        type: 'multi',
        rewards: [
            { type: 'tokens', amount: 15 },
            { type: 'powerCard', cardId: 'DOUBLE_HINT', quantity: 1 }
        ],
        label: '15 Tokens + 💡 Double Hint',
        icon: '💡'
    },
    {
        day: 3,
        type: 'multi',
        rewards: [
            { type: 'tokens', amount: 20 },
            { type: 'xp', amount: 150 }
        ],
        label: '20 Gold Tokens + 150 XP',
        icon: '🪙'
    },
    {
        day: 4,
        type: 'multi',
        rewards: [
            { type: 'tokens', amount: 25 },
            { type: 'powerCard', cardId: 'BID_BOOST', quantity: 1 }
        ],
        label: '25 Tokens + ⚡ Bid Boost',
        icon: '⚡'
    },
    {
        day: 5,
        type: 'multi',
        rewards: [
            { type: 'tokens', amount: 30 },
            { type: 'powerCard', cardId: 'SECOND_CHANCE', quantity: 1 }
        ],
        label: '30 Tokens + 🔄 Second Chance',
        icon: '🔄'
    },
    {
        day: 6,
        type: 'multi',
        rewards: [
            { type: 'tokens', amount: 40 },
            { type: 'powerCard', cardId: 'CASHBACK', quantity: 1 },
            { type: 'powerCard', cardId: 'BID_SHIELD', quantity: 1 }
        ],
        label: '40 Tokens + 💰 Cashback + 🛡️ Shield',
        icon: '🛡️'
    },
    {
        day: 7,
        type: 'multi',
        rewards: [
            { type: 'tokens', amount: 50 },
            { type: 'xp', amount: 500 },
            { type: 'avatar', avatarUrl: '/images/profile/Owl.gif' },
            { type: 'powerCard', cardId: 'DOUBLE_HINT', quantity: 1 },
            { type: 'powerCard', cardId: 'BID_BOOST', quantity: 1 },
            { type: 'powerCard', cardId: 'SECOND_CHANCE', quantity: 1 },
            { type: 'powerCard', cardId: 'CASHBACK', quantity: 1 },
            { type: 'powerCard', cardId: 'BID_SHIELD', quantity: 1 }
        ],
        label: '50 Tokens + 500 XP + 🦉 Owl Avatar + ALL 5 Cards!',
        icon: '🎁'
    },
    {
        day: 8,
        type: 'multi',
        rewards: [
            { type: 'tokens', amount: 60 },
            { type: 'xp', amount: 600 }
        ],
        label: '60 Gold Tokens + 600 XP',
        icon: '✨'
    },
    {
        day: 9,
        type: 'multi',
        rewards: [
            { type: 'tokens', amount: 70 },
            { type: 'powerCard', cardId: 'DOUBLE_HINT', quantity: 2 }
        ],
        label: '70 Tokens + 💡 Double Hint x2',
        icon: '💡'
    },
    {
        day: 10,
        type: 'multi',
        rewards: [
            { type: 'tokens', amount: 80 },
            { type: 'xp', amount: 750 },
            { type: 'powerCard', cardId: 'BID_BOOST', quantity: 2 }
        ],
        label: '80 Tokens + 750 XP + ⚡ Bid Boost x2',
        icon: '⚡'
    },
    {
        day: 11,
        type: 'multi',
        rewards: [
            { type: 'tokens', amount: 90 },
            { type: 'powerCard', cardId: 'SECOND_CHANCE', quantity: 2 }
        ],
        label: '90 Tokens + 🔄 Second Chance x2',
        icon: '🔄'
    },
    {
        day: 12,
        type: 'multi',
        rewards: [
            { type: 'tokens', amount: 100 },
            { type: 'powerCard', cardId: 'CASHBACK', quantity: 2 },
            { type: 'powerCard', cardId: 'BID_SHIELD', quantity: 2 }
        ],
        label: '100 Tokens + 💰 Cashback x2 + 🛡️ Shield x2',
        icon: '🛡️'
    },
    {
        day: 13,
        type: 'multi',
        rewards: [
            { type: 'tokens', amount: 120 },
            { type: 'xp', amount: 1000 }
        ],
        label: '120 Gold Tokens + 1000 XP',
        icon: '👑'
    },
    {
        day: 14,
        type: 'multi',
        rewards: [
            { type: 'tokens', amount: 150 },
            { type: 'xp', amount: 2000 },
            { type: 'avatar', avatarUrl: '/images/profile/proofreader.gif' },
            { type: 'powerCard', cardId: 'DOUBLE_HINT', quantity: 2 },
            { type: 'powerCard', cardId: 'BID_BOOST', quantity: 2 },
            { type: 'powerCard', cardId: 'SECOND_CHANCE', quantity: 2 },
            { type: 'powerCard', cardId: 'CASHBACK', quantity: 2 },
            { type: 'powerCard', cardId: 'BID_SHIELD', quantity: 2 }
        ],
        label: '150 Tokens + 2000 XP + 📜 Proofreader Avatar + ALL Cards x2!',
        icon: '📜'
    }
];

const TOTAL_DAYS = DAILY_REWARDS.length; // 14

/**
 * Get today's UTC date string (YYYY-MM-DD).
 * This is the single source of truth for "what calendar day is it".
 */
function getUTCDateString(date = new Date()) {
    return date.toISOString().slice(0, 10);
}

/**
 * Get yesterday's UTC date string.
 */
function getYesterdayUTCDateString() {
    const d = new Date();
    d.setUTCDate(d.getUTCDate() - 1);
    return d.toISOString().slice(0, 10);
}

/**
 * Get the start of the next UTC day as a Date object (for countdown timers).
 */
function getNextUTCMidnight() {
    const now = new Date();
    const next = new Date(Date.UTC(
        now.getUTCFullYear(),
        now.getUTCMonth(),
        now.getUTCDate() + 1,
        0, 0, 0, 0
    ));
    return next;
}

module.exports = {
    DAILY_REWARDS,
    TOTAL_DAYS,
    getUTCDateString,
    getYesterdayUTCDateString,
    getNextUTCMidnight
};
