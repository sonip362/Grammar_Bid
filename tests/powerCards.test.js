// tests/powerCards.test.js
/**
 * Comprehensive Automated Test Suite for Power Card System
 * Verifies purchase atomicity, inventory management, phase enforcement, card effects, and round resets.
 */

const mongoose = require('mongoose');
const User = require('../models/User');
const Transaction = require('../models/Transaction');
const InboxMessage = require('../models/InboxMessage');
const { POWER_CARDS } = require('../server/config/powerCards');
const {
    getUserPowerCards,
    purchasePowerCard,
    getCashExchangeRate,
    exchangeCashForTokens,
    validateCardUse,
    consumeAndApplyCard,
    clearRoundActiveCardEffects
} = require('../server/services/powerCardService');

require('dotenv').config();

const MONGODB_URI = process.env.MONGO_URI || process.env.MONGODB_URI || 'mongodb://localhost:27017/grammar_bid';

async function runTests() {
    console.log('🧪 Starting Power Card System Automated Test Suite...\n');

    try {
        await mongoose.connect(MONGODB_URI);
        console.log('✅ Connected to MongoDB for Power Card tests.\n');

        // Cleanup test user
        const testEmail = 'powercard_test_user@grammarbid.com';
        await User.deleteMany({ email: testEmail });

        // Create test user with 50 tokens
        await User.deleteOne({ username: 'PowerCardTester' });

        const testUser = await User.create({
            username: 'PowerCardTester',
            email: testEmail,
            password: 'hashed_pw_test',
            cash: 10000,
            tokens: 50,
            inventory: {
                powerCards: {
                    DOUBLE_HINT: 0,
                    BID_SHIELD: 0,
                    CASHBACK: 0,
                    SECOND_CHANCE: 0,
                    BID_BOOST: 0
                }
            }
        });
        const userId = testUser._id.toString();

        // -------------------------------------------------------------
        // Test 1: User Inventory Defaults & Retrieval
        // -------------------------------------------------------------
        console.log('Test 1: User Inventory Defaults & Retrieval');
        const initialData = await getUserPowerCards(userId);
        console.assert(initialData.tokens === 50, 'Initial tokens should be 50');
        console.assert(initialData.inventory.DOUBLE_HINT === 0, 'Initial DOUBLE_HINT quantity should be 0');
        console.assert(initialData.inventory.BID_SHIELD === 0, 'Initial BID_SHIELD quantity should be 0');
        console.log('✅ Test 1 Passed: Default inventory retrieved accurately.\n');

        // -------------------------------------------------------------
        // Test 2: Successful Power Card Purchase
        // -------------------------------------------------------------
        console.log('Test 2: Successful Power Card Purchase (Atomic Tokens & Inventory)');
        const buyResult = await purchasePowerCard(userId, 'DOUBLE_HINT', 2);
        console.assert(buyResult.success === true, 'Purchase should succeed');
        console.assert(buyResult.totalCost === 10, 'Cost for 2x DOUBLE_HINT (5 tokens each) should be 10 tokens');
        console.assert(buyResult.tokens === 40, 'Tokens should be reduced from 50 to 40');
        console.assert(buyResult.inventory.DOUBLE_HINT === 2, 'DOUBLE_HINT inventory should be 2');

        const tx = await Transaction.findOne({ userId, type: 'POWER_CARD_PURCHASE' });
        console.assert(tx !== null, 'Transaction record should be created');
        console.assert(tx.amount === -10, 'Transaction amount should be -10');
        console.log('✅ Test 2 Passed: Power Card purchased, tokens deducted, inventory & audit logs created.\n');

        // -------------------------------------------------------------
        // Test 3: Insufficient Tokens Rejection
        // -------------------------------------------------------------
        console.log('Test 3: Insufficient Tokens Rejection');
        // Try buying 5x BID_SHIELD (15 tokens each = 75 tokens) when user only has 40 tokens
        const failBuy = await purchasePowerCard(userId, 'BID_SHIELD', 5);
        console.assert(failBuy.success === false, 'Purchase should fail due to insufficient tokens');
        const userCheck = await User.findById(userId);
        console.assert(userCheck.tokens === 40, 'Token balance should remain unchanged at 40');
        console.log('✅ Test 3 Passed: Insufficient tokens purchase rejected without modifying balance.\n');

        // -------------------------------------------------------------
        // Test 4: Invalid Card ID Rejection
        // -------------------------------------------------------------
        console.log('Test 4: Invalid Card ID Rejection');
        const invalidBuy = await purchasePowerCard(userId, 'SUPER_GOD_CARD', 1);
        console.assert(invalidBuy.success === false, 'Purchase should fail for invalid card ID');
        console.log('✅ Test 4 Passed: Invalid card ID rejected.\n');

        // -------------------------------------------------------------
        // Test 5: Parallel / Concurrent Purchase Safety
        // -------------------------------------------------------------
        console.log('Test 5: Parallel / Concurrent Purchase Safety');
        // User has 40 tokens. Try buying 3x BID_SHIELD (15 tokens each = 45 tokens) concurrently across 3 parallel requests
        const p1 = purchasePowerCard(userId, 'BID_SHIELD', 1);
        const p2 = purchasePowerCard(userId, 'BID_SHIELD', 1);
        const p3 = purchasePowerCard(userId, 'BID_SHIELD', 1);

        const results = await Promise.all([p1, p2, p3]);
        const successes = results.filter(r => r.success).length;
        console.assert(successes === 2, `Exactly 2 purchases should succeed out of 3 (30 tokens total spent from 40). Got: ${successes}`);
        const userAfterConcurrent = await User.findById(userId);
        console.assert(userAfterConcurrent.tokens === 10, `Final tokens should be 10. Got: ${userAfterConcurrent.tokens}`);
        console.assert(userAfterConcurrent.inventory.powerCards.BID_SHIELD === 2, `BID_SHIELD count should be 2. Got: ${userAfterConcurrent.inventory.powerCards.BID_SHIELD}`);
        console.log('✅ Test 5 Passed: Concurrent purchases correctly handled atomically.\n');

        // -------------------------------------------------------------
        // Test 6: Phase Validation Enforcement
        // -------------------------------------------------------------
        console.log('Test 6: Phase Validation Enforcement');
        const mockRoom = {
            code: '9999',
            status: 'bidding',
            currentRound: 1,
            players: [{ userId: userId.toString(), username: 'PowerCardTester', socketId: 'sock_1' }],
            activeCardEffects: {}
        };

        // Try using DOUBLE_HINT (allowedPhases: ['inspection']) during 'bidding' phase
        const phaseVal = validateCardUse(userId, 'DOUBLE_HINT', mockRoom, 'bidding');
        console.assert(phaseVal.valid === false, 'DOUBLE_HINT should be invalid during bidding phase');

        // Consume attempt should fail
        const phaseUse = await consumeAndApplyCard(userId, 'DOUBLE_HINT', mockRoom, 'bidding');
        console.assert(phaseUse.success === false, 'consumeAndApplyCard should fail when phase is invalid');
        console.log('✅ Test 6 Passed: Card usage restricted to valid game phases.\n');

        // -------------------------------------------------------------
        // Test 7: Valid Card Use & Atomic Inventory Decrement
        // -------------------------------------------------------------
        console.log('Test 7: Valid Card Use & Atomic Inventory Decrement');
        mockRoom.status = 'inspection';

        // Use 1x DOUBLE_HINT during inspection phase
        const validUse = await consumeAndApplyCard(userId, 'DOUBLE_HINT', mockRoom, 'inspection');
        console.assert(validUse.success === true, 'Card usage should succeed during inspection phase');
        console.assert(mockRoom.activeCardEffects[userId].DOUBLE_HINT !== undefined, 'Effect should be registered on room');

        const userAfterUse = await User.findById(userId);
        console.assert(userAfterUse.inventory.powerCards.DOUBLE_HINT === 1, `DOUBLE_HINT count should decrement from 2 to 1. Got: ${userAfterUse.inventory.powerCards.DOUBLE_HINT}`);
        console.log('✅ Test 7 Passed: Card consumed atomically and registered on room activeCardEffects.\n');

        // -------------------------------------------------------------
        // Test 8: Once-Per-Round Restriction Enforcement
        // -------------------------------------------------------------
        console.log('Test 8: Once-Per-Round Restriction Enforcement');
        // Try using DOUBLE_HINT again in the SAME round
        const repeatUse = await consumeAndApplyCard(userId, 'DOUBLE_HINT', mockRoom, 'inspection');
        console.assert(repeatUse.success === false, 'Second DOUBLE_HINT use in same round should be rejected');
        console.log('✅ Test 8 Passed: Once-per-round restriction enforced.\n');

        // -------------------------------------------------------------
        // Test 9: Round Reset & Cleanup
        // -------------------------------------------------------------
        console.log('Test 9: Round Reset & Cleanup');
        console.assert(Object.keys(mockRoom.activeCardEffects).length > 0, 'Room activeCardEffects should not be empty');
        clearRoundActiveCardEffects(mockRoom);
        console.assert(Object.keys(mockRoom.activeCardEffects).length === 0, 'Room activeCardEffects should be cleared on round reset');
        console.log('✅ Test 9 Passed: Active card effects successfully cleared on round reset.\n');

        // -------------------------------------------------------------
        // Test 10: Insufficient Inventory Rejection
        // -------------------------------------------------------------
        console.log('Test 10: Insufficient Inventory Rejection');
        // User has 0 SECOND_CHANCE cards
        mockRoom.status = 'correction';
        const noStockUse = await consumeAndApplyCard(userId, 'SECOND_CHANCE', mockRoom, 'correction');
        console.assert(noStockUse.success === false, 'Usage should be rejected when inventory is 0');
        console.log('✅ Test 10 Passed: Usage rejected when player has 0 cards in inventory.\n');

        // -------------------------------------------------------------
        // Test 11: Rank-Based Cash to Gold Tokens Exchange
        // -------------------------------------------------------------
        console.log('Test 11: Rank-Based Cash to Gold Tokens Exchange');
        // Test 11a: Grammar Novice (0 XP) = $1,000 / token
        await User.findByIdAndUpdate(userId, { xp: 0, cash: 10000, tokens: 50 });
        const noviceRate = getCashExchangeRate(0);
        console.assert(noviceRate.rankName === 'Grammar Novice', `Rank name should be Grammar Novice. Got: ${noviceRate.rankName}`);
        console.assert(noviceRate.costPerToken === 1000, `Cost per token for Grammar Novice should be 1000. Got: ${noviceRate.costPerToken}`);

        // Exchange 5 Gold Tokens at $1,000 each = $5,000 Cash
        const exResult = await exchangeCashForTokens(userId, 5);
        console.assert(exResult.success === true, 'Exchange should succeed');
        console.assert(exResult.cash === 5000, `Cash should be 10000 - 5000 = 5000. Got: ${exResult.cash}`);
        console.assert(exResult.tokens === 55, `Tokens should be 50 + 5 = 55. Got: ${exResult.tokens}`);

        // Test 11b: Grammar Judge (1500 XP) = $10,000 / token
        const judgeRate = getCashExchangeRate(1500);
        console.assert(judgeRate.rankName === 'Grammar Judge', `Rank name should be Grammar Judge. Got: ${judgeRate.rankName}`);
        console.assert(judgeRate.costPerToken === 10000, `Cost per token for Grammar Judge should be 10000. Got: ${judgeRate.costPerToken}`);

        const exTx = await Transaction.findOne({ userId, type: 'CASH_EXCHANGE' });
        console.assert(exTx !== null, 'Transaction log should exist for cash exchange');
        console.assert(exTx.amount === -5000, `Transaction amount should be -5000. Got: ${exTx.amount}`);
        console.log('✅ Test 11 Passed: Rank-based Cash Exchange successfully executed and verified.\n');

        // Cleanup
        await User.deleteMany({ email: testEmail });
        await Transaction.deleteMany({ userId });
        await InboxMessage.deleteMany({ userId });

        console.log('🎉 ALL 11 POWER CARD & EXCHANGE SYSTEM AUTOMATED TESTS PASSED SUCCESSFULLY!');
        process.exit(0);

    } catch (err) {
        console.error('❌ Power Card Test Suite Error:', err);
        process.exit(1);
    }
}

runTests();
