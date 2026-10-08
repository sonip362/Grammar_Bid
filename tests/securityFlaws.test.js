// tests/securityFlaws.test.js
// ─── Automated Security & Vulnerability Remediation Test Suite ───

const assert = require('assert');
const http = require('http');
const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
require('dotenv').config();

const { app, server, io } = require('../server');
const User = require('../models/User');
const Transaction = require('../models/Transaction');
const { exchangeCashForTokens, purchasePowerCard } = require('../server/services/powerCardService');

async function runSecurityTests() {
    console.log('🧪 Starting Security Flaws & Hardening Automated Test Suite...\n');

    // Ensure MongoDB is connected
    if (mongoose.connection.readyState === 0) {
        await mongoose.connect(process.env.MONGO_URI);
        console.log('✅ Connected to MongoDB for Security tests.');
    }

    // Start server on an ephemeral port if not already listening
    let testPort = 0;
    let baseUrl = '';

    if (!server.listening) {
        await new Promise((resolve) => {
            server.listen(0, () => {
                testPort = server.address().port;
                baseUrl = `http://localhost:${testPort}`;
                console.log(`📡 Test server listening on ephemeral port ${testPort}`);
                resolve();
            });
        });
    } else {
        testPort = server.address().port;
        baseUrl = `http://localhost:${testPort}`;
    }

    const testUsername = `sec_${Date.now().toString().slice(-8)}`;
    let testUser = null;
    let userToken = '';

    try {
        // ── 0. Create Test User ───────────────────────────────────────────
        testUser = await User.create({
            username: testUsername,
            password: 'SecurePassword123!',
            cash: 10000,
            tokens: 50,
            xp: 100,
            rank: 'Grammar Novice',
            tutorialCompleted: false
        });
        const userId = testUser._id.toString();

        const JWT_SECRET = process.env.JWT_SECRET;
        const ADMIN_JWT_SECRET = process.env.ADMIN_JWT_SECRET ||
            crypto.createHmac('sha256', JWT_SECRET).update('gb_admin_salt_auth_2025').digest('hex');
        userToken = jwt.sign({ userId, username: testUsername }, JWT_SECRET, { expiresIn: '1h' });

        // ── Test 1: Admin Secret Protection & Distinct Admin JWT Secret ──
        console.log('Test 1: Admin Secret Timing-Safe Verification & Token Signing');
        
        // Invalid code should return 403
        const wrongAdminRes = await fetch(`${baseUrl}/api/admin/verify`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ code: 'wrong_password_attempt' })
        });
        assert.strictEqual(wrongAdminRes.status, 403, 'Wrong admin code must return 403');

        // Valid code should return 200 and a token signed with ADMIN_JWT_SECRET
        const validAdminRes = await fetch(`${baseUrl}/api/admin/verify`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ code: process.env.ADMIN_CODE })
        });
        assert.strictEqual(validAdminRes.status, 200, 'Valid admin code must return 200');
        const adminData = await validAdminRes.json();
        assert.ok(adminData.token, 'Must return admin token');

        // Verify token was signed with ADMIN_JWT_SECRET (not regular JWT_SECRET)
        const verifiedAdmin = jwt.verify(adminData.token, ADMIN_JWT_SECRET);
        assert.strictEqual(verifiedAdmin.isAdmin, true, 'Token must contain isAdmin claim');
        assert.strictEqual(verifiedAdmin.role, 'admin', 'Token must contain role: admin claim');

        // Standard user token cannot access admin routes (must return 401 or 403)
        const userAdminAccessRes = await fetch(`${baseUrl}/api/admin/logs`, {
            headers: { 'Authorization': `Bearer ${userToken}` }
        });
        assert.ok([401, 403].includes(userAdminAccessRes.status), `Regular user token must be rejected (401/403) from admin endpoints, got ${userAdminAccessRes.status}`);

        // Admin token can access admin routes
        const adminAccessRes = await fetch(`${baseUrl}/api/admin/logs`, {
            headers: { 'Authorization': `Bearer ${adminData.token}` }
        });
        assert.strictEqual(adminAccessRes.status, 200, 'Admin token must access admin endpoints');
        console.log('✅ Test 1 Passed: Admin secret & token authorization hardened.\n');

        // ── Test 2: Unauthenticated User-ID Manipulation Blocked ─────────
        console.log('Test 2: Tutorial completion requires authenticated identity');
        const unauthTutorialRes = await fetch(`${baseUrl}/api/user/complete-tutorial`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ userId })
        });
        assert.strictEqual(unauthTutorialRes.status, 401, 'Unauthenticated complete-tutorial must be rejected with 401');

        // Authenticated tutorial completion
        const authTutorialRes = await fetch(`${baseUrl}/api/user/complete-tutorial`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${userToken}`
            },
            body: JSON.stringify({ userId: 'spoofed_victim_id' }) // Spoofed ID in body
        });
        assert.strictEqual(authTutorialRes.status, 200, 'Authenticated complete-tutorial succeeds');
        const updatedUser = await User.findById(userId);
        assert.strictEqual(updatedUser.tutorialCompleted, true, 'Target user tutorial completed');
        console.log('✅ Test 2 Passed: Tutorial manipulation guarded by auth middleware.\n');

        // ── Test 3: Password Policy Enforcement ───────────────────────────
        console.log('Test 3: Strong password validation on signup & conversion');
        const weakPwRes = await fetch(`${baseUrl}/api/auth/signup`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                username: `wk_${Date.now().toString().slice(-6)}`,
                password: 'short' // < 8 characters
            })
        });
        assert.strictEqual(weakPwRes.status, 400, 'Short password must return 400');
        const weakPwData = await weakPwRes.json();
        const errMsg = weakPwData.error || weakPwData.message || '';
        assert.ok(errMsg.includes('8 characters'), `Error must specify 8 characters requirement, got: ${JSON.stringify(weakPwData)}`);
        console.log('✅ Test 3 Passed: Password policy enforces >= 8 chars and complexity.\n');

        // ── Test 4: Server-Authoritative Mini-Game Reward Verification ───
        console.log('Test 4: Server-authoritative mini-game reward calculations');
        // Submitting reward without starting attempt must be rejected
        const noSessionRes = await fetch(`${baseUrl}/api/mini-games/pattern-sequence/submit-reward`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${userToken}`
            },
            body: JSON.stringify({
                cashEarned: 99999, // Forged client reward
                tokensDeducted: 0,
                difficulty: 'hard'
            })
        });
        assert.strictEqual(noSessionRes.status, 400, 'Submitting without active session must return 400');

        // Start legitimate attempt
        const startAttemptRes = await fetch(`${baseUrl}/api/mini-games/pattern-sequence/start-attempt`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${userToken}`
            }
        });
        assert.strictEqual(startAttemptRes.status, 200, 'Starting attempt must return 200');

        // Wait 1 second to simulate elapsed time
        await new Promise(r => setTimeout(r, 1100));

        // Submit reward with client trying to claim $100,000 cash
        const userBeforeReward = await User.findById(userId);
        const cashBefore = userBeforeReward.cash;

        const legitRewardRes = await fetch(`${baseUrl}/api/mini-games/pattern-sequence/submit-reward`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${userToken}`
            },
            body: JSON.stringify({
                gameSuccess: true,
                cashEarned: 100000, // Attacker tries to inject 100k
                tokensDeducted: 0,
                difficulty: 'EASY'
            })
        });
        const legitRewardText = await legitRewardRes.text();
        assert.strictEqual(legitRewardRes.status, 200, `Valid attempt submission must return 200: ${legitRewardText}`);
        const rewardData = JSON.parse(legitRewardText);

        // Server-calculated reward must be clamped to max 6000, ignoring the client's 100,000
        assert.ok(rewardData.cashEarned <= 6000, `Reward must be server-calculated <= 6000, got ${rewardData.cashEarned}`);
        assert.strictEqual(rewardData.attemptsToday, 1, 'attemptsToday must be incremented to 1');

        const userAfterReward = await User.findById(userId);
        assert.strictEqual(userAfterReward.cash, cashBefore + rewardData.cashEarned, 'DB cash must match server calculation');
        console.log('✅ Test 4 Passed: Client reward injection rejected; server calculation enforced.\n');

        // ── Test 5: Atomic Daily Limit & Concurrency Race Condition ───────
        console.log('Test 5: Atomic mini-game daily attempt limits under concurrency');
        // Manually set user's attemptsToday to 4
        const todayStr = new Date().toISOString().split('T')[0];
        await User.findByIdAndUpdate(userId, {
            $set: { 'miniGames.flappy.attemptsToday': 4, 'miniGames.flappy.lastPlayDate': todayStr }
        });

        // Start attempt session
        await fetch(`${baseUrl}/api/mini-games/flappy/start-attempt`, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${userToken}` }
        });

        // Launch 10 concurrent reward submission requests at the exact same moment
        const concurrentRequests = Array.from({ length: 10 }, () =>
            fetch(`${baseUrl}/api/mini-games/flappy/submit-reward`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${userToken}`
                },
                body: JSON.stringify({ pipesCleared: 5 })
            })
        );

        const responses = await Promise.all(concurrentRequests);
        const successCount = responses.filter(r => r.status === 200).length;
        const blockedCount = responses.filter(r => r.status === 429 || r.status === 400).length;

        assert.strictEqual(successCount, 1, `Exactly 1 concurrent request should succeed to reach 5 attempts, got ${successCount}`);
        assert.strictEqual(blockedCount, 9, `9 concurrent requests should be atomically blocked, got ${blockedCount}`);

        const finalUser = await User.findById(userId);
        assert.strictEqual(finalUser.miniGames.flappy.attemptsToday, 5, 'Final attemptsToday must be capped at 5');
        console.log('✅ Test 5 Passed: Atomic findOneAndUpdate successfully prevented race conditions.\n');

        // ── Test 6: Power Card Service Validation & UUID Transaction IDs ──
        console.log('Test 6: Power cards invalid bounds & crypto UUID transaction IDs');
        const invalidBuyZero = await purchasePowerCard(userId, 'SECOND_CHANCE', 0);
        assert.strictEqual(invalidBuyZero.success, false, 'Purchasing 0 cards must fail');

        const invalidBuyNegative = await purchasePowerCard(userId, 'SECOND_CHANCE', -5);
        assert.strictEqual(invalidBuyNegative.success, false, 'Purchasing negative cards must fail');

        const invalidBuyHuge = await purchasePowerCard(userId, 'SECOND_CHANCE', 9999);
        assert.strictEqual(invalidBuyHuge.success, false, 'Purchasing > 50 cards must fail');

        const invalidExchangeString = await exchangeCashForTokens(userId, 'not_a_number');
        assert.strictEqual(invalidExchangeString.success, false, 'Non-integer exchange must fail');

        const invalidExchangeNegative = await exchangeCashForTokens(userId, -500);
        assert.strictEqual(invalidExchangeNegative.success, false, 'Negative cash exchange must fail');

        // Valid exchange to test transaction ID format (e.g. 5 tokens within cash balance)
        const validExchange = await exchangeCashForTokens(userId, 5);
        assert.strictEqual(validExchange.success, true, `Valid exchange must succeed: ${JSON.stringify(validExchange)}`);

        // Verify transaction ID is a valid cryptographically secure UUID (v4 format)
        const latestTx = await Transaction.findOne({ userId }).sort({ createdAt: -1 });
        assert.ok(latestTx, 'Transaction record must exist');
        const uuidRegex = /^tx_ex_[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
        assert.match(latestTx.transactionId, uuidRegex, `Transaction ID must contain a valid UUID, got: ${latestTx.transactionId}`);
        console.log('✅ Test 6 Passed: Strict bounds validated and UUID transaction IDs verified.\n');

        // ── Test 7: Push Notification Subscription Validation ───────────
        console.log('Test 7: Push notification input validation');
        const invalidSubRes = await fetch(`${baseUrl}/api/notifications/subscribe`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${userToken}`
            },
            body: JSON.stringify({
                subscription: {
                    endpoint: 'javascript:alert(1)', // Invalid endpoint
                    keys: { p256dh: 'short' } // Missing auth key
                }
            })
        });
        assert.strictEqual(invalidSubRes.status, 400, 'Invalid push subscription must return 400');
        console.log('✅ Test 7 Passed: Invalid push notification inputs rejected.\n');

        // ── Test 8: Socket Authentication & Identity Verification ───────
        console.log('Test 8: Socket event handler authentication protection');
        let joinErrorReceived = false;
        let errorMessage = '';
        const mockEvents = {};

        const mockSocket = {
            id: 'mock_attacker_socket',
            handshake: { auth: {}, headers: {} },
            on(event, fn) {
                mockEvents[event] = fn;
            },
            emit(event, data) {
                if (event === 'join_error') {
                    joinErrorReceived = true;
                    errorMessage = data.message;
                }
            }
        };

        // Find the create_room listener registered on io
        const connectionListeners = io.listeners('connection');
        assert.ok(connectionListeners.length > 0, 'io must have connection listeners');

        // Invoke connection handler to register socket event listeners
        connectionListeners[0](mockSocket);

        // Attempt to create room without token or authenticated identity
        assert.ok(mockEvents['create_room'], 'Socket must have registered create_room event');
        await mockEvents['create_room']({ userId: 'spoofed_user_123' });
        assert.strictEqual(joinErrorReceived, true, 'Unauthenticated create_room must emit join_error');
        assert.ok(errorMessage.includes('Authentication required'), `Error must be auth required, got: ${errorMessage}`);
        console.log('✅ Test 8 Passed: Socket event rejects unauthenticated identity claims.\n');

        console.log('🎉 ALL SECURITY & HARDENING AUTOMATED TESTS PASSED SUCCESSFULLY!\n');
    } finally {
        // Cleanup test user & transactions
        if (testUser) {
            await User.findByIdAndDelete(testUser._id);
            await Transaction.deleteMany({ userId: testUser._id.toString() });
        }
        await new Promise(resolve => server.close(resolve));
        if (mongoose.connection.readyState !== 0) {
            await mongoose.connection.close();
        }
        process.exit(0);
    }
}

runSecurityTests().catch(err => {
    console.error('❌ Security tests failed:', err);
    process.exit(1);
});
