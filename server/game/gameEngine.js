const User = require('../../models/User');
const XPTransaction = require('../../models/XPTransaction');
const { XP_REWARDS, calculateRankProgress } = require('../config/ranks');
const { awardXP } = require('../services/xpService');
const { clearRoundActiveCardEffects } = require('../services/powerCardService');
const { generateSentence } = require('../../data/generateSentence');
const {
    onBiddingStart,
    onRoundStart,
    onRoundResult,
    onCorrectionStart,
    onGameOver,
    destroyRoomBots
} = require('../sockets/botHandler');
const {
    rooms,
    socketRoomMap,
    clearRoomTimer,
    generateGamePlan
} = require('./gameState');

async function startRound(roomCode, io) {
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

    onRoundStart(room);

    clearRoomTimer(room);
    room.timerRef = setInterval(() => {
        room.timer--;
        io.to(roomCode).emit('timer_tick', { timer: room.timer, phase: 'inspection' });

        if (room.timer <= 0) {
            clearRoomTimer(room);
            startBiddingPhase(roomCode, io);
        }
    }, 1000);
}

function startBiddingPhase(roomCode, io) {
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

    onBiddingStart(room);

    room.timerRef = setInterval(() => {
        room.timer--;
        io.to(roomCode).emit('timer_tick', { timer: room.timer, phase: 'bidding' });

        if (room.timer <= 0) {
            clearRoomTimer(room);
            resolveRound(roomCode, io);
        }
    }, 1000);
}

async function persistAllHumanCash(room) {
    if (!room || !room.players) return;
    for (const player of room.players) {
        if (player.isBot || !player.userId) continue;
        const currentCash = Number(player.cash);
        const lastPersisted = Number(player.persistedCash !== undefined ? player.persistedCash : currentCash);
        const delta = currentCash - lastPersisted;
        if (delta !== 0) {
            try {
                await User.findByIdAndUpdate(player.userId, {
                    $inc: { cash: delta }
                });
                player.persistedCash = currentCash;
                if (process.env.LOG_BOTS === 'true') {
                    console.log(`💾 Live DB Cash Synced: ${player.username} -> delta ${delta >= 0 ? '+' : ''}$${delta} (current room cash: $${currentCash.toLocaleString()})`);
                }
            } catch (err) {
                console.error(`Failed to sync live cash for ${player.username}:`, err);
            }
        }
    }
}

function resolveRound(roomCode, io) {
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
                loss = 0;
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

    persistAllHumanCash(room);

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
                if (!lot.isCorrect) {
                    user.stats.correctDecisions = (user.stats.correctDecisions || 0) + 1;
                }
            }
            await user.save();

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

    onRoundResult(room, roundResult);

    if (!lot.isCorrect) {
        setTimeout(() => startCorrectionPhase(roomCode, io), 10000);
    } else {
        setTimeout(() => nextRoundOrEnd(roomCode, io), 10000);
    }
}

function startCorrectionPhase(roomCode, io) {
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

    onCorrectionStart(room);

    clearRoomTimer(room);
    room.timerRef = setInterval(() => {
        room.timer--;
        io.to(roomCode).emit('timer_tick', { timer: room.timer, phase: 'correction' });

        if (room.timer <= 0) {
            clearRoomTimer(room);
            endCorrectionPhase(roomCode, io);
        }
    }, 1000);
}

function endCorrectionPhase(roomCode, io) {
    const room = rooms.get(roomCode);
    if (!room) return;

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

    persistAllHumanCash(room);

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

    setTimeout(() => nextRoundOrEnd(roomCode, io), 8000);
}

async function nextRoundOrEnd(roomCode, io) {
    const room = rooms.get(roomCode);
    if (!room) return;

    if (room.currentRound >= room.totalRounds) {
        room.status = 'game_over';
        clearRoomTimer(room);

        const standings = [...room.players].sort((a, b) => b.cash - a.cash);
        const winner = standings[0];

        console.log(`🏆 Game Over in room ${roomCode}! Winner: ${winner.username} ($${winner.cash.toLocaleString()})`);

        onGameOver(room);

        const matchId = room.matchId || room.code;
        const matchXpSummaryMap = {};

        for (const player of room.players) {
            if (player.isBot) continue;
            try {
                const currentCash = Number(player.cash);
                const lastPersisted = Number(player.persistedCash !== undefined ? player.persistedCash : currentCash);
                const delta = currentCash - lastPersisted;

                await User.findByIdAndUpdate(player.userId, {
                    ...(delta !== 0 ? { $inc: { cash: delta, gamesPlayed: 1 } } : { $inc: { gamesPlayed: 1 } })
                });
                player.persistedCash = currentCash;
                if (player.userId === winner.userId) {
                    await User.findByIdAndUpdate(player.userId, {
                        $inc: { gamesWon: 1 }
                    });
                }

                await awardXP({
                    userId: player.userId,
                    amount: XP_REWARDS.MATCH_COMPLETE,
                    type: 'MATCH_COMPLETE',
                    matchId,
                    description: `Completed match in room ${roomCode}`,
                    io,
                    roomCode
                });

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
        startRound(roomCode, io);
    }
}

module.exports = {
    startRound,
    startBiddingPhase,
    persistAllHumanCash,
    resolveRound,
    startCorrectionPhase,
    endCorrectionPhase,
    nextRoundOrEnd
};
