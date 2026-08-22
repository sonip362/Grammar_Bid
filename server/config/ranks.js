// server/config/ranks.js
// ─── Rank & XP Progression Constants & Calculations ──────────────

const RANKS = [
    { name: 'Grammar Novice', minXP: 0, badge: '🌱', description: 'Starting your grammar journey.' },
    { name: 'Sentence Scout', minXP: 250, badge: '🔍', description: 'Spotting typos and sentence patterns.' },
    { name: 'Proofreader', minXP: 750, badge: '📝', description: 'Carefully evaluating lot accuracy.' },
    { name: 'Grammar Judge', minXP: 1500, badge: '⚖️', description: 'Your grammar decisions are sharp and accurate.' },
    { name: 'Grammar Expert', minXP: 3000, badge: '🎓', description: 'Mastering complex grammar varieties.' },
    { name: 'Grammar Master', minXP: 5500, badge: '👑', description: 'A dominant force in the grammar arena.' },
    { name: 'Grammar Legend', minXP: 9000, badge: '🏆', description: 'Pinnacle of English grammar mastery.' }
];

const XP_REWARDS = {
    MATCH_COMPLETE: 15,
    CORRECT_DECISION: 25,
    AUCTION_WIN: 20,
    CORRECTION_ACCURATE: 40,
    CORRECTION_FIRST_ACCURATE: 60,
    STREAK_3_BONUS: 30,
    STREAK_5_BONUS: 60
};

/**
 * Get rank object for a given XP amount.
 * Always authoritative: xp -> rank.
 */
function getRankFromXP(xp) {
    const validXP = Math.max(0, Number(xp) || 0);
    let currentRank = RANKS[0];

    for (let i = RANKS.length - 1; i >= 0; i--) {
        if (validXP >= RANKS[i].minXP) {
            currentRank = RANKS[i];
            break;
        }
    }
    return currentRank;
}

/**
 * Calculate detailed progress toward the next rank.
 */
function calculateRankProgress(xp) {
    const validXP = Math.max(0, Number(xp) || 0);
    const currentRank = getRankFromXP(validXP);
    const currentIndex = RANKS.findIndex(r => r.name === currentRank.name);
    const isMaxRank = currentIndex === RANKS.length - 1;

    if (isMaxRank) {
        return {
            currentRankName: currentRank.name,
            currentRankBadge: currentRank.badge,
            nextRankName: null,
            nextRankBadge: null,
            currentXP: validXP,
            xpInCurrentLevel: validXP - currentRank.minXP,
            xpRequiredForNext: 0,
            xpToNextRank: 0,
            progressPercent: 100,
            isMaxRank: true,
            statusText: 'MAX RANK'
        };
    }

    const nextRank = RANKS[currentIndex + 1];
    const range = nextRank.minXP - currentRank.minXP;
    const gainedInLevel = validXP - currentRank.minXP;
    const progressPercent = Math.min(100, Math.max(0, Math.floor((gainedInLevel / range) * 100)));
    const xpToNextRank = nextRank.minXP - validXP;

    return {
        currentRankName: currentRank.name,
        currentRankBadge: currentRank.badge,
        nextRankName: nextRank.name,
        nextRankBadge: nextRank.badge,
        currentXP: validXP,
        xpInCurrentLevel: gainedInLevel,
        xpRequiredForNext: range,
        xpToNextRank,
        progressPercent,
        isMaxRank: false,
        statusText: `${xpToNextRank.toLocaleString()} XP to ${nextRank.name}`
    };
}

module.exports = {
    RANKS,
    XP_REWARDS,
    getRankFromXP,
    calculateRankProgress
};
