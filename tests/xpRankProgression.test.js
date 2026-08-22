const assert = require('assert');
const { RANKS, XP_REWARDS, getRankFromXP, calculateRankProgress } = require('../server/config/ranks');
const { awardXP } = require('../server/services/xpService');

async function runTests() {
    console.log('🧪 Starting Rank & XP Progression System Automated Tests...\n');

    // ── Test 1: Configuration & Rank Threshold Boundaries ──────────────────────
    console.log('Test 1: Rank threshold boundary checks');
    assert.strictEqual(RANKS.length, 7, 'Must have exactly 7 ranks');

    assert.strictEqual(getRankFromXP(-50).name, 'Grammar Novice', 'Negative XP defaults to Grammar Novice');
    assert.strictEqual(getRankFromXP(0).name, 'Grammar Novice', '0 XP is Grammar Novice');
    assert.strictEqual(getRankFromXP(249).name, 'Grammar Novice', '249 XP is Grammar Novice');

    assert.strictEqual(getRankFromXP(250).name, 'Sentence Scout', '250 XP is Sentence Scout');
    assert.strictEqual(getRankFromXP(749).name, 'Sentence Scout', '749 XP is Sentence Scout');

    assert.strictEqual(getRankFromXP(750).name, 'Proofreader', '750 XP is Proofreader');
    assert.strictEqual(getRankFromXP(1499).name, 'Proofreader', '1499 XP is Proofreader');

    assert.strictEqual(getRankFromXP(1500).name, 'Grammar Judge', '1500 XP is Grammar Judge');
    assert.strictEqual(getRankFromXP(2999).name, 'Grammar Judge', '2999 XP is Grammar Judge');

    assert.strictEqual(getRankFromXP(3000).name, 'Grammar Expert', '3000 XP is Grammar Expert');
    assert.strictEqual(getRankFromXP(5499).name, 'Grammar Expert', '5499 XP is Grammar Expert');

    assert.strictEqual(getRankFromXP(5500).name, 'Grammar Master', '5500 XP is Grammar Master');
    assert.strictEqual(getRankFromXP(8999).name, 'Grammar Master', '8999 XP is Grammar Master');

    assert.strictEqual(getRankFromXP(9000).name, 'Grammar Legend', '9000 XP is Grammar Legend');
    assert.strictEqual(getRankFromXP(100000).name, 'Grammar Legend', '100,000 XP is Grammar Legend');

    console.log('✅ Test 1 Passed: All 7 rank boundary thresholds match expected XP floors.\n');

    // ── Test 2: Rank Progression Math & Next Rank Helper ────────────────────────
    console.log('Test 2: Rank progress percentage & statusText calculation');

    // 0 XP (0% into Novice -> Scout, 250 XP needed)
    const prog0 = calculateRankProgress(0);
    assert.strictEqual(prog0.currentRankName, 'Grammar Novice');
    assert.strictEqual(prog0.progressPercent, 0);
    assert.strictEqual(prog0.statusText, '250 XP to Sentence Scout');

    // 125 XP (50% into Novice -> Scout, 125 XP remaining)
    const prog125 = calculateRankProgress(125);
    assert.strictEqual(prog125.progressPercent, 50);
    assert.strictEqual(prog125.statusText, '125 XP to Sentence Scout');

    // 9000 XP (Max rank Legend)
    const progLegend = calculateRankProgress(9000);
    assert.strictEqual(progLegend.currentRankName, 'Grammar Legend');
    assert.strictEqual(progLegend.progressPercent, 100);
    assert.strictEqual(progLegend.statusText, 'MAX RANK');

    console.log('✅ Test 2 Passed: Rank progression math & status tags are accurate.\n');

    // ── Test 3: Anti-Farming Safeguard — Bot Exclusion ─────────────────────────
    console.log('Test 3: Anti-Farming Safeguard — Bot Exclusion');
    const botResult = await awardXP({
        userId: 'bot_syntax_sam',
        amount: 25,
        type: 'CORRECT_DECISION',
        matchId: 'room_1234',
        roundId: 1
    });

    assert.strictEqual(botResult.awarded, false, 'Bot must not receive XP');
    assert.strictEqual(botResult.reason, 'BOT_OR_INVALID_USER', 'Reason must be BOT_OR_INVALID_USER');

    console.log('✅ Test 3 Passed: Bots are strictly excluded from earning XP.\n');

    // ── Test 4: XP Constants Verification ─────────────────────────────────────
    console.log('Test 4: XP reward constant values');
    assert.strictEqual(XP_REWARDS.CORRECT_DECISION, 25, 'CORRECT_DECISION must be 25 XP');
    assert.strictEqual(XP_REWARDS.AUCTION_WIN, 20, 'AUCTION_WIN must be 20 XP');
    assert.strictEqual(XP_REWARDS.CORRECTION_ACCURATE, 40, 'CORRECTION_ACCURATE must be 40 XP');
    assert.strictEqual(XP_REWARDS.MATCH_COMPLETE, 15, 'MATCH_COMPLETE must be 15 XP');
    assert.strictEqual(XP_REWARDS.STREAK_3_BONUS, 30, 'STREAK_3_BONUS must be 30 XP');

    console.log('✅ Test 4 Passed: All XP constants match specification.\n');

    console.log('🎉 ALL RANK & XP PROGRESSION TESTS PASSED SUCCESSFULLY!');
}

runTests().catch(err => {
    console.error('❌ Test failed:', err);
    process.exit(1);
});
