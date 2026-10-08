const express = require('express');
const crypto = require('crypto');
const User = require('../../models/User');
const Transaction = require('../../models/Transaction');
const { authMiddleware } = require('../middleware/auth');

const router = express.Router();

async function getAndResetMiniGameUser(userId, gameKey) {
    const todayStr = new Date().toISOString().split('T')[0];
    let user = await User.findById(userId);
    if (!user) return null;
    if (!user.miniGames) user.miniGames = {};
    if (!user.miniGames[gameKey] || user.miniGames[gameKey].lastPlayDate !== todayStr) {
        user = await User.findByIdAndUpdate(
            userId,
            {
                $set: {
                    [`miniGames.${gameKey}.lastPlayDate`]: todayStr,
                    [`miniGames.${gameKey}.attemptsToday`]: 0
                }
            },
            { returnDocument: 'after' }
        );
    }
    return user;
}

// ─── Flappy Bird ─────────────────────────────────────────────────────────────
router.get('/flappy/status', authMiddleware, async (req, res) => {
    try {
        const user = await getAndResetMiniGameUser(req.user._id, 'flappy');
        if (!user) return res.status(404).json({ error: 'User not found.' });

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

router.post('/flappy/start-attempt', authMiddleware, async (req, res) => {
    try {
        const user = await getAndResetMiniGameUser(req.user._id, 'flappy');
        if (!user) return res.status(404).json({ error: 'User not found.' });

        const currentAttempts = user.miniGames.flappy.attemptsToday || 0;
        if (currentAttempts >= 5) {
            return res.status(400).json({
                success: false,
                error: 'Daily limit of 5 tries reached! Come back tomorrow.'
            });
        }

        const todayStr = new Date().toISOString().split('T')[0];
        const startTime = Date.now();
        await User.findByIdAndUpdate(user._id, {
            $set: {
                'miniGames.flappy.lastPlayDate': todayStr,
                'miniGames.flappy.sessionStartTime': startTime
            }
        });

        res.json({
            success: true,
            startTime,
            remainingAttempts: Math.max(0, 5 - currentAttempts)
        });
    } catch (err) {
        console.error('Flappy start attempt error:', err);
        res.status(500).json({ error: 'Failed to start Flappy Bird attempt.' });
    }
});

router.post('/flappy/submit-reward', authMiddleware, async (req, res) => {
    try {
        const user = await getAndResetMiniGameUser(req.user._id, 'flappy');
        if (!user) return res.status(404).json({ error: 'User not found.' });

        const sessionStartTime = user.miniGames?.flappy?.sessionStartTime;
        if (!sessionStartTime) {
            return res.status(400).json({
                success: false,
                error: 'Session not started. Please start the game first.'
            });
        }

        const elapsedSeconds = (Date.now() - sessionStartTime) / 1000;
        const rawPipes = Number(req.body.pipesCleared);
        if (!Number.isInteger(rawPipes) || rawPipes < 0) {
            return res.status(400).json({ success: false, error: 'Invalid pipesCleared value.' });
        }

        let validPipes = Math.min(25, rawPipes);
        if (validPipes > 0 && elapsedSeconds < (validPipes * 0.8)) {
            validPipes = Math.max(0, Math.floor(elapsedSeconds / 0.8));
        }

        const tokensEarned = validPipes * 1;
        const todayStr = new Date().toISOString().split('T')[0];

        const updatedUser = await User.findOneAndUpdate(
            { _id: user._id, 'miniGames.flappy.attemptsToday': { $lt: 5 } },
            {
                $inc: {
                    'miniGames.flappy.attemptsToday': 1,
                    tokens: tokensEarned
                },
                $set: {
                    'miniGames.flappy.sessionStartTime': null,
                    'miniGames.flappy.lastPlayDate': todayStr
                }
            },
            { returnDocument: 'after' }
        );

        if (!updatedUser) {
            return res.status(400).json({
                success: false,
                error: 'Daily limit of 5 tries reached! Come back tomorrow.'
            });
        }

        if (tokensEarned > 0) {
            const txId = `tx_flappy_${crypto.randomUUID()}`;
            await Transaction.create({
                transactionId: txId,
                userId: updatedUser._id.toString(),
                username: updatedUser.username || updatedUser.name || 'Guest Player',
                type: 'MINI_GAME_REWARD',
                amount: tokensEarned,
                balanceBefore: updatedUser.tokens - tokensEarned,
                balanceAfter: updatedUser.tokens,
                reason: `Flappy Bird cleared ${validPipes} pipes (+${tokensEarned} Gold Tokens)`
            }).catch(e => console.error('Flappy txn log error:', e.message));
        }

        const remainingAttempts = Math.max(0, 5 - updatedUser.miniGames.flappy.attemptsToday);

        res.json({
            success: true,
            tokensEarned,
            newTokensBalance: updatedUser.tokens,
            attemptsToday: updatedUser.miniGames.flappy.attemptsToday,
            remainingAttempts
        });
    } catch (err) {
        console.error('Flappy submit reward error:', err);
        res.status(500).json({ error: 'Failed to process Flappy Bird reward.' });
    }
});

// ─── Tic Tac Toe ─────────────────────────────────────────────────────────────
router.get('/tic-tac-toe/status', authMiddleware, async (req, res) => {
    try {
        const user = await getAndResetMiniGameUser(req.user._id, 'ticTacToe');
        if (!user) return res.status(404).json({ error: 'User not found.' });

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

router.post('/tic-tac-toe/start-attempt', authMiddleware, async (req, res) => {
    try {
        const user = await getAndResetMiniGameUser(req.user._id, 'ticTacToe');
        if (!user) return res.status(404).json({ error: 'User not found.' });

        const currentAttempts = user.miniGames.ticTacToe.attemptsToday || 0;
        if (currentAttempts >= 5) {
            return res.status(400).json({
                success: false,
                error: 'Daily limit of 5 tries reached! Come back tomorrow.'
            });
        }

        const todayStr = new Date().toISOString().split('T')[0];
        const startTime = Date.now();
        await User.findByIdAndUpdate(user._id, {
            $set: {
                'miniGames.ticTacToe.lastPlayDate': todayStr,
                'miniGames.ticTacToe.sessionStartTime': startTime
            }
        });

        res.json({
            success: true,
            startTime,
            remainingAttempts: Math.max(0, 5 - currentAttempts)
        });
    } catch (err) {
        console.error('Tic Tac Toe start attempt error:', err);
        res.status(500).json({ error: 'Failed to start Tic Tac Toe attempt.' });
    }
});

router.post('/tic-tac-toe/submit-reward', authMiddleware, async (req, res) => {
    try {
        const user = await getAndResetMiniGameUser(req.user._id, 'ticTacToe');
        if (!user) return res.status(404).json({ error: 'User not found.' });

        const sessionStartTime = user.miniGames?.ticTacToe?.sessionStartTime;
        if (!sessionStartTime) {
            return res.status(400).json({
                success: false,
                error: 'Session not started. Please start the game first.'
            });
        }

        const elapsedSeconds = (Date.now() - sessionStartTime) / 1000;
        let resolvedResult = 'LOSS';
        const clientResult = String(req.body.result || '').toUpperCase();

        if (req.body.moves && Array.isArray(req.body.moves)) {
            const b = Array(9).fill(null);
            let turn = 'X';
            for (const m of req.body.moves) {
                if (typeof m === 'number' && m >= 0 && m < 9 && b[m] === null) {
                    b[m] = turn;
                    turn = turn === 'X' ? 'O' : 'X';
                }
            }
            const winCombos = [[0,1,2],[3,4,5],[6,7,8],[0,3,6],[1,4,7],[2,5,8],[0,4,8],[2,4,6]];
            const hasXWon = winCombos.some(c => c.every(idx => b[idx] === 'X'));
            const hasOWon = winCombos.some(c => c.every(idx => b[idx] === 'O'));
            const isFull = b.every(c => c !== null);
            if (hasXWon && !hasOWon) resolvedResult = 'WIN';
            else if (!hasXWon && !hasOWon && isFull) resolvedResult = 'DRAW';
            else resolvedResult = 'LOSS';
        } else if (['WIN', 'DRAW', 'LOSS'].includes(clientResult)) {
            resolvedResult = elapsedSeconds >= 1.5 ? clientResult : 'LOSS';
        }

        const isWin = resolvedResult === 'WIN';
        const isDraw = resolvedResult === 'DRAW';
        let tokensEarned = 0;
        if (isWin) tokensEarned = 2;
        else if (isDraw) tokensEarned = 1;

        const todayStr = new Date().toISOString().split('T')[0];

        const updatedUser = await User.findOneAndUpdate(
            { _id: user._id, 'miniGames.ticTacToe.attemptsToday': { $lt: 5 } },
            {
                $inc: {
                    'miniGames.ticTacToe.attemptsToday': 1,
                    tokens: tokensEarned
                },
                $set: {
                    'miniGames.ticTacToe.sessionStartTime': null,
                    'miniGames.ticTacToe.lastPlayDate': todayStr
                }
            },
            { returnDocument: 'after' }
        );

        if (!updatedUser) {
            return res.status(400).json({
                success: false,
                error: 'Daily limit of 5 tries reached! Come back tomorrow.'
            });
        }

        if (tokensEarned > 0) {
            const txId = `tx_ttt_${crypto.randomUUID()}`;
            await Transaction.create({
                transactionId: txId,
                userId: updatedUser._id.toString(),
                username: updatedUser.username || updatedUser.name || 'Guest Player',
                type: 'MINI_GAME_REWARD',
                amount: tokensEarned,
                balanceBefore: updatedUser.tokens - tokensEarned,
                balanceAfter: updatedUser.tokens,
                reason: `Tic Tac Toe ${resolvedResult} against AI (+${tokensEarned} Gold Tokens)`
            }).catch(e => console.error('TTT txn log error:', e.message));
        }

        const remainingAttempts = Math.max(0, 5 - updatedUser.miniGames.ticTacToe.attemptsToday);

        res.json({
            success: true,
            isWin,
            isDraw,
            tokensEarned,
            newTokensBalance: updatedUser.tokens,
            attemptsToday: updatedUser.miniGames.ticTacToe.attemptsToday,
            remainingAttempts
        });
    } catch (err) {
        console.error('Tic Tac Toe submit reward error:', err);
        res.status(500).json({ error: 'Failed to process Tic Tac Toe reward.' });
    }
});

// ─── Help AI ─────────────────────────────────────────────────────────────────
router.get('/help-ai/status', authMiddleware, async (req, res) => {
    try {
        const user = await getAndResetMiniGameUser(req.user._id, 'helpAi');
        if (!user) return res.status(404).json({ error: 'User not found.' });

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

router.post('/help-ai/start-attempt', authMiddleware, async (req, res) => {
    try {
        const user = await getAndResetMiniGameUser(req.user._id, 'helpAi');
        if (!user) return res.status(404).json({ error: 'User not found.' });

        const currentAttempts = user.miniGames.helpAi.attemptsToday || 0;
        if (currentAttempts >= 5) {
            return res.status(400).json({
                success: false,
                error: 'Daily limit of 5 tries reached! Come back tomorrow.'
            });
        }

        const todayStr = new Date().toISOString().split('T')[0];
        const startTime = Date.now();
        await User.findByIdAndUpdate(user._id, {
            $set: {
                'miniGames.helpAi.lastPlayDate': todayStr,
                'miniGames.helpAi.sessionStartTime': startTime
            }
        });

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

router.post('/help-ai/submit-reward', authMiddleware, async (req, res) => {
    try {
        const user = await getAndResetMiniGameUser(req.user._id, 'helpAi');
        if (!user) return res.status(404).json({ error: 'User not found.' });

        const sessionStartTime = user.miniGames?.helpAi?.sessionStartTime;
        if (!sessionStartTime) {
            return res.status(400).json({
                success: false,
                error: 'Session not started. Please start the game first.'
            });
        }

        const elapsedSeconds = (Date.now() - sessionStartTime) / 1000;
        const clientSuccess = req.body.gameSuccess === true || req.body.gameSuccess === 'true';
        const isWin = clientSuccess && elapsedSeconds <= 24;
        const tokensEarned = isWin ? 3 : 0;
        const todayStr = new Date().toISOString().split('T')[0];

        const updatedUser = await User.findOneAndUpdate(
            { _id: user._id, 'miniGames.helpAi.attemptsToday': { $lt: 5 } },
            {
                $inc: {
                    'miniGames.helpAi.attemptsToday': 1,
                    tokens: tokensEarned
                },
                $set: {
                    'miniGames.helpAi.sessionStartTime': null,
                    'miniGames.helpAi.lastPlayDate': todayStr
                }
            },
            { returnDocument: 'after' }
        );

        if (!updatedUser) {
            return res.status(400).json({
                success: false,
                error: 'Daily limit of 5 tries reached! Come back tomorrow.'
            });
        }

        if (tokensEarned > 0) {
            const txId = `tx_helpai_${crypto.randomUUID()}`;
            await Transaction.create({
                transactionId: txId,
                userId: updatedUser._id.toString(),
                username: updatedUser.username || updatedUser.name || 'Guest Player',
                type: 'MINI_GAME_REWARD',
                amount: tokensEarned,
                balanceBefore: updatedUser.tokens - tokensEarned,
                balanceAfter: updatedUser.tokens,
                reason: `Help the AI Wire Pipeline rebooted (+3 Gold Tokens)`
            }).catch(e => console.error('Help AI txn log error:', e.message));
        }

        const remainingAttempts = Math.max(0, 5 - updatedUser.miniGames.helpAi.attemptsToday);

        res.json({
            success: true,
            isWin,
            tokensEarned,
            newTokensBalance: updatedUser.tokens,
            attemptsToday: updatedUser.miniGames.helpAi.attemptsToday,
            remainingAttempts
        });
    } catch (err) {
        console.error('Help AI submit reward error:', err);
        res.status(500).json({ error: 'Failed to process Help AI reward.' });
    }
});

// ─── Pattern / Math Sequence ─────────────────────────────────────────────────
router.get(['/pattern-sequence/status', '/math-sequence/status'], authMiddleware, async (req, res) => {
    try {
        const user = await getAndResetMiniGameUser(req.user._id, 'patternSequence');
        if (!user) return res.status(404).json({ error: 'User not found.' });

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

router.post(['/pattern-sequence/start-attempt', '/math-sequence/start-attempt'], authMiddleware, async (req, res) => {
    try {
        const user = await getAndResetMiniGameUser(req.user._id, 'patternSequence');
        if (!user) return res.status(404).json({ error: 'User not found.' });

        const currentAttempts = user.miniGames.patternSequence.attemptsToday || 0;
        if (currentAttempts >= 5) {
            return res.status(400).json({
                success: false,
                error: 'Daily limit of 5 tries reached! Come back tomorrow.'
            });
        }

        const todayStr = new Date().toISOString().split('T')[0];
        const startTime = Date.now();
        await User.findByIdAndUpdate(user._id, {
            $set: {
                'miniGames.patternSequence.lastPlayDate': todayStr,
                'miniGames.patternSequence.sessionStartTime': startTime
            }
        });

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

router.post(['/pattern-sequence/submit-reward', '/math-sequence/submit-reward'], authMiddleware, async (req, res) => {
    try {
        const user = await getAndResetMiniGameUser(req.user._id, 'patternSequence');
        if (!user) return res.status(404).json({ error: 'User not found.' });

        const sessionStartTime = user.miniGames?.patternSequence?.sessionStartTime;
        if (!sessionStartTime) {
            return res.status(400).json({
                success: false,
                error: 'Session not started. Please start the game first.'
            });
        }

        const mode = String(req.body.difficulty || 'EASY').toUpperCase();
        let maxBackendAllowedSec = 164;
        if (mode === 'MEDIUM') maxBackendAllowedSec = 124;
        if (mode === 'HARD') maxBackendAllowedSec = 64;

        const elapsedSeconds = (Date.now() - sessionStartTime) / 1000;
        const clientSuccess = req.body.gameSuccess === true || req.body.gameSuccess === 'true';
        const isWin = clientSuccess && (elapsedSeconds <= maxBackendAllowedSec);

        const numDeducted = Math.max(0, Math.min(10, Math.floor(Number(req.body.tokensDeducted) || 0)));

        let cashEarned = 0;
        let tokensEarned = 0;
        if (isWin) {
            if (mode === 'EASY') {
                const calculatedCash = 6000 - Math.floor(elapsedSeconds * 10) - (numDeducted * 250);
                cashEarned = Math.max(200, Math.min(6000, calculatedCash));
            } else if (mode === 'MEDIUM') {
                tokensEarned = Math.max(0, 5 - numDeducted);
            } else if (mode === 'HARD') {
                tokensEarned = Math.max(0, 10 - numDeducted);
            }
        }

        const todayStr = new Date().toISOString().split('T')[0];
        const netTokenDelta = tokensEarned - numDeducted;

        const updatedUser = await User.findOneAndUpdate(
            { _id: user._id, 'miniGames.patternSequence.attemptsToday': { $lt: 5 } },
            {
                $inc: {
                    'miniGames.patternSequence.attemptsToday': 1,
                    ...(cashEarned > 0 ? { cash: cashEarned, totalCashEarned: cashEarned } : {}),
                    ...(netTokenDelta !== 0 ? { tokens: netTokenDelta } : {})
                },
                $set: {
                    'miniGames.patternSequence.sessionStartTime': null,
                    'miniGames.patternSequence.lastPlayDate': todayStr
                }
            },
            { returnDocument: 'after' }
        );

        if (!updatedUser) {
            return res.status(400).json({
                success: false,
                error: 'Daily limit of 5 tries reached! Come back tomorrow.'
            });
        }

        if (numDeducted > 0) {
            const txId = `tx_pen_${crypto.randomUUID()}`;
            await Transaction.create({
                transactionId: txId,
                userId: updatedUser._id.toString(),
                username: updatedUser.username || updatedUser.name || 'Guest Player',
                type: 'MINI_GAME_PENALTY',
                amount: -numDeducted,
                balanceBefore: user.tokens || 0,
                balanceAfter: updatedUser.tokens,
                reason: `Pattern Sequence [${mode}] penalties (-${numDeducted} Gold Tokens)`
            }).catch(e => console.error('Pattern pen txn error:', e.message));
        }

        if (cashEarned > 0) {
            const txId = `tx_pattern_${crypto.randomUUID()}`;
            await Transaction.create({
                transactionId: txId,
                userId: updatedUser._id.toString(),
                username: updatedUser.username || updatedUser.name || 'Guest Player',
                type: 'MINI_GAME_REWARD',
                amount: cashEarned,
                balanceBefore: user.cash || 0,
                balanceAfter: updatedUser.cash,
                reason: `Pattern Sequence [EASY] completed (+$${cashEarned})`
            }).catch(e => console.error('Pattern cash txn error:', e.message));
        }

        if (tokensEarned > 0) {
            const txId = `tx_pattern_${crypto.randomUUID()}`;
            await Transaction.create({
                transactionId: txId,
                userId: updatedUser._id.toString(),
                username: updatedUser.username || updatedUser.name || 'Guest Player',
                type: 'MINI_GAME_REWARD',
                amount: tokensEarned,
                balanceBefore: user.tokens || 0,
                balanceAfter: updatedUser.tokens,
                reason: `Pattern Sequence [${mode}] completed (+${tokensEarned} Gold Tokens)`
            }).catch(e => console.error('Pattern tokens txn error:', e.message));
        }

        const remainingAttempts = Math.max(0, 5 - updatedUser.miniGames.patternSequence.attemptsToday);

        res.json({
            success: true,
            isWin,
            difficulty: mode,
            cashEarned,
            tokensEarned,
            newCashBalance: updatedUser.cash,
            newTokensBalance: updatedUser.tokens,
            attemptsToday: updatedUser.miniGames.patternSequence.attemptsToday,
            remainingAttempts
        });
    } catch (err) {
        console.error('Pattern Sequence submit reward error:', err);
        res.status(500).json({ error: 'Failed to process Pattern Sequence reward.' });
    }
});

// ─── Food Memory ─────────────────────────────────────────────────────────────
router.get('/food-memory/status', authMiddleware, async (req, res) => {
    try {
        const user = await getAndResetMiniGameUser(req.user._id, 'foodMemory');
        if (!user) return res.status(404).json({ error: 'User not found.' });

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

router.post('/food-memory/start-attempt', authMiddleware, async (req, res) => {
    try {
        const user = await getAndResetMiniGameUser(req.user._id, 'foodMemory');
        if (!user) return res.status(404).json({ error: 'User not found.' });

        const currentAttempts = user.miniGames.foodMemory.attemptsToday || 0;
        if (currentAttempts >= 5) {
            return res.status(400).json({
                success: false,
                error: 'Daily limit of 5 tries reached! Come back tomorrow.'
            });
        }

        const todayStr = new Date().toISOString().split('T')[0];
        const startTime = Date.now();
        await User.findByIdAndUpdate(user._id, {
            $set: {
                'miniGames.foodMemory.lastPlayDate': todayStr,
                'miniGames.foodMemory.sessionStartTime': startTime
            }
        });

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

router.post('/food-memory/submit-reward', authMiddleware, async (req, res) => {
    try {
        const user = await getAndResetMiniGameUser(req.user._id, 'foodMemory');
        if (!user) return res.status(404).json({ error: 'User not found.' });

        const sessionStartTime = user.miniGames?.foodMemory?.sessionStartTime;
        if (!sessionStartTime) {
            return res.status(400).json({
                success: false,
                error: 'Session not started. Please start the game first.'
            });
        }

        const elapsedSeconds = (Date.now() - sessionStartTime) / 1000;
        const isTimeout = elapsedSeconds > 139;

        const rawCorrect = Number(req.body.correctCount);
        const rawWrong = Number(req.body.wrongCount);
        const validCorrect = (!isNaN(rawCorrect) && rawCorrect >= 0) ? Math.min(9, Math.floor(rawCorrect)) : 0;
        const validWrong = (!isNaN(rawWrong) && rawWrong >= 0) ? Math.min(9, Math.floor(rawWrong)) : (9 - validCorrect);

        const netTokens = isTimeout ? 0 : Math.max(0, 9 - validWrong);
        const todayStr = new Date().toISOString().split('T')[0];

        const updatedUser = await User.findOneAndUpdate(
            { _id: user._id, 'miniGames.foodMemory.attemptsToday': { $lt: 5 } },
            {
                $inc: {
                    'miniGames.foodMemory.attemptsToday': 1,
                    tokens: netTokens
                },
                $set: {
                    'miniGames.foodMemory.sessionStartTime': null,
                    'miniGames.foodMemory.lastPlayDate': todayStr
                }
            },
            { returnDocument: 'after' }
        );

        if (!updatedUser) {
            return res.status(400).json({
                success: false,
                error: 'Daily limit of 5 tries reached! Come back tomorrow.'
            });
        }

        if (isTimeout) {
            return res.status(400).json({
                success: false,
                error: 'Session time limit exceeded.',
                attemptsToday: updatedUser.miniGames.foodMemory.attemptsToday,
                remainingAttempts: Math.max(0, 5 - updatedUser.miniGames.foodMemory.attemptsToday)
            });
        }

        if (netTokens > 0) {
            const txId = `tx_food_${crypto.randomUUID()}`;
            await Transaction.create({
                transactionId: txId,
                userId: updatedUser._id.toString(),
                username: updatedUser.username || updatedUser.name || 'Guest Player',
                type: 'MINI_GAME_REWARD',
                amount: netTokens,
                balanceBefore: updatedUser.tokens - netTokens,
                balanceAfter: updatedUser.tokens,
                reason: `Food Memory completed (${validCorrect}/9 correct, -${validWrong} wrong) ➔ +${netTokens} Gold Tokens`
            }).catch(e => console.error('Food memory txn log error:', e.message));
        }

        const remainingAttempts = Math.max(0, 5 - updatedUser.miniGames.foodMemory.attemptsToday);

        res.json({
            success: true,
            tokensEarned: netTokens,
            correctCount: validCorrect,
            wrongCount: validWrong,
            newTokensBalance: updatedUser.tokens,
            attemptsToday: updatedUser.miniGames.foodMemory.attemptsToday,
            remainingAttempts
        });
    } catch (err) {
        console.error('Food Memory submit reward error:', err);
        res.status(500).json({ error: 'Failed to submit Food Memory reward.' });
    }
});

module.exports = router;
