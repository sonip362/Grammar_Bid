const User = require('../../models/User');
const XPTransaction = require('../../models/XPTransaction');
const { verifyToken } = require('../middleware/auth');
const { getRankFromXP } = require('../config/ranks');
const { XP_REWARDS } = require('../config/ranks');
const { awardXP } = require('../services/xpService');
const { getUserPowerCards, purchasePowerCard, consumeAndApplyCard } = require('../services/powerCardService');
const { registerBotHandlers, onPlayerBid, destroyRoomBots } = require('./botHandler');
const {
    rooms,
    socketRoomMap,
    roomTimeouts,
    disconnectGraceTimers,
    onlineUserIds,
    socketUserMap,
    socketEventCounts,
    MAX_PLAYERS,
    generateRoomCode,
    scheduleRoomTimeout,
    generateGamePlan,
    sanitizeRoom
} = require('../game/gameState');
const { startRound, persistAllHumanCash } = require('../game/gameEngine');

function getSocketUserId(socket, payload) {
    if (socket.authenticatedUserId) return socket.authenticatedUserId;
    if (payload && payload.token) {
        const dec = verifyToken(payload.token);
        if (dec && dec.userId) {
            socket.authenticatedUserId = dec.userId;
            socketUserMap.set(socket.id, dec.userId);
            onlineUserIds.add(dec.userId);
            return dec.userId;
        }
    }
    return socketUserMap.get(socket.id) || null;
}

function socketRateLimit(socketId, event, max, windowMs) {
    const now = Date.now();
    if (!socketEventCounts.has(socketId)) socketEventCounts.set(socketId, {});
    const events = socketEventCounts.get(socketId);
    if (!events[event] || now > events[event].resetAt) {
        events[event] = { count: 0, resetAt: now + windowMs };
    }
    events[event].count++;
    return events[event].count <= max;
}

function sendRoomSyncState(socket, room) {
    if (!room || room.status === 'lobby') return;

    const lot = room.currentLot;
    let timerValue = room.timer;
    if (room.deadline) {
        timerValue = Math.max(0, Math.ceil((room.deadline - Date.now()) / 1000));
    }
    const payload = {
        status: room.status,
        currentRound: room.currentRound,
        totalRounds: room.totalRounds,
        timer: timerValue,
        deadline: room.deadline || null,
        highestBid: room.highestBid,
        topBidder: room.topBidder,
        sentence: lot ? lot.sentence : null,
        category: lot ? lot.category : null,
        questionId: lot ? lot.questionId : null,
        englishVariety: lot ? lot.englishVariety : null,
        validationReasoning: lot ? lot.validationReasoning : null,
        flawedPhrase: (room.status === 'correction' && lot) ? lot.flawedPhrase : null,
        correctPhrase: (room.status === 'correction' && lot) ? lot.correctPhrase : null,
        correctAnswer: (room.status === 'resolution' || room.status === 'game_over') && lot ? lot.correction : null,
        chatHistory: room.chatHistory || [],
        roundHistory: room.roundHistory || [],
        players: room.players.map(p => ({
            socketId: p.socketId,
            userId: p.userId,
            username: p.username,
            avatar: p.avatar,
            cash: p.cash,
            isHost: p.isHost
        }))
    };

    socket.emit('sync_game_state', payload);
    console.log(`🔄 Sent full sync_game_state [phase: ${room.status}, timer: ${timerValue}s] to socket ${socket.id}`);
}

function initSocketHandler(io) {
    io.use((socket, next) => {
        const token =
            socket.handshake.auth && socket.handshake.auth.token
                ? socket.handshake.auth.token
                : (socket.handshake.headers && socket.handshake.headers.authorization
                    ? socket.handshake.headers.authorization.replace('Bearer ', '')
                    : null);

        if (token) {
            const decoded = verifyToken(token);
            if (decoded && decoded.userId) {
                socket.authenticatedUserId = decoded.userId;
                socketUserMap.set(socket.id, decoded.userId);
                onlineUserIds.add(decoded.userId);
            }
        }
        next();
    });

    io.on('connection', (socket) => {
        console.log(`🔌 Socket connected: ${socket.id}`);

        registerBotHandlers(io, socket, rooms, socketRoomMap);

        socket.on('auth_online', (payload = {}) => {
            const authUserId = getSocketUserId(socket, payload);
            if (authUserId) {
                socketUserMap.set(socket.id, authUserId);
                onlineUserIds.add(authUserId);
            }
        });

        socket.on('tutorial_completed', async (payload = {}) => {
            const targetUserId = getSocketUserId(socket, payload);
            if (targetUserId) {
                try {
                    await User.findByIdAndUpdate(targetUserId, { $set: { tutorialCompleted: true } });
                    console.log(`🎓 Tutorial marked complete via socket for user: ${targetUserId}`);
                } catch (e) {
                    console.error('Socket tutorial_completed error:', e);
                }
            } else {
                socket.emit('error', { message: 'Authentication required' });
            }
        });

        socket.on('disconnect', () => {
            socketEventCounts.delete(socket.id);
        });

        socket.on('create_room', async (payload = {}) => {
            try {
                const userId = getSocketUserId(socket, payload);
                if (!userId) {
                    return socket.emit('join_error', { message: 'Authentication required. Please log in.' });
                }
                const user = await User.findById(userId);
                if (!user) {
                    return socket.emit('join_error', { message: 'User not found. Please log in again.' });
                }

                const roomCode = generateRoomCode();
                const userRank = getRankFromXP(user.xp || 0);
                const player = {
                    socketId: socket.id,
                    userId: user._id.toString(),
                    username: user.username,
                    avatar: user.avatar,
                    cash: user.cash !== undefined ? user.cash : 10000,
                    rankBadge: userRank.badge,
                    rankName: userRank.name,
                    isHost: true
                };

                const room = {
                    code: roomCode,
                    isPublic: false,
                    players: [player],
                    bannedUserIds: [],
                    createdAt: Date.now(),
                    status: 'lobby',
                    currentRound: 0,
                    totalRounds: 5,
                    gamePlan: generateGamePlan(),
                    currentLot: null,
                    usedDomains: [],
                    usedCategories: [],
                    highestBid: 0,
                    topBidder: null,
                    timer: 0,
                    timerRef: null,
                    corrections: []
                };

                rooms.set(roomCode, room);
                roomTimeouts.set(roomCode, scheduleRoomTimeout(roomCode, io));
                socketRoomMap.set(socket.id, roomCode);
                socket.join(roomCode);

                console.log(`🏠 Private Room ${roomCode} created by ${user.username}`);
                socket.emit('room_created', { roomCode, room: sanitizeRoom(room) });
            } catch (err) {
                console.error('create_room error:', err);
                socket.emit('join_error', { message: 'Failed to create room.' });
            }
        });

        socket.on('quick_match', async (payload = {}) => {
            try {
                const userId = getSocketUserId(socket, payload);
                if (!userId) {
                    return socket.emit('join_error', { message: 'Authentication required. Please log in.' });
                }
                const user = await User.findById(userId);
                if (!user) {
                    return socket.emit('join_error', { message: 'User not found. Please log in again.' });
                }

                let targetRoom = null;
                for (const room of rooms.values()) {
                    if (room.isPublic && room.players.length < MAX_PLAYERS) {
                        if (room.bannedUserIds && room.bannedUserIds.includes(userId)) {
                            continue;
                        }
                        targetRoom = room;
                        break;
                    }
                }

                if (targetRoom) {
                    const existing = targetRoom.players.find(p => p.userId === userId);
                    if (existing) {
                        existing.socketId = socket.id;
                        socketRoomMap.set(socket.id, targetRoom.code);
                        socket.join(targetRoom.code);
                        socket.emit('join_success', { roomCode: targetRoom.code, room: sanitizeRoom(targetRoom) });
                        io.to(targetRoom.code).emit('lobby_updated', { room: sanitizeRoom(targetRoom) });
                        return;
                    }

                    const userRank = getRankFromXP(user.xp || 0);
                    const player = {
                        socketId: socket.id,
                        userId: user._id.toString(),
                        username: user.username,
                        avatar: user.avatar,
                        cash: user.cash !== undefined ? user.cash : 10000,
                        rankBadge: userRank.badge,
                        rankName: userRank.name,
                        isHost: false
                    };

                    targetRoom.players.push(player);
                    socketRoomMap.set(socket.id, targetRoom.code);
                    socket.join(targetRoom.code);

                    console.log(`⚡ ${user.username} Quick-Matched into public room ${targetRoom.code} (${targetRoom.players.length}/${MAX_PLAYERS})`);
                    socket.emit('join_success', { roomCode: targetRoom.code, room: sanitizeRoom(targetRoom) });
                    socket.to(targetRoom.code).emit('player_joined', { username: user.username });
                    io.to(targetRoom.code).emit('lobby_updated', { room: sanitizeRoom(targetRoom) });
                } else {
                    const roomCode = generateRoomCode();
                    const userRank = getRankFromXP(user.xp || 0);
                    const player = {
                        socketId: socket.id,
                        userId: user._id.toString(),
                        username: user.username,
                        avatar: user.avatar,
                        cash: user.cash !== undefined ? user.cash : 10000,
                        rankBadge: userRank.badge,
                        rankName: userRank.name,
                        isHost: true
                    };

                    const room = {
                        code: roomCode,
                        isPublic: true,
                        players: [player],
                        bannedUserIds: [],
                        createdAt: Date.now(),
                        status: 'lobby',
                        currentRound: 0,
                        totalRounds: 5,
                        gamePlan: generateGamePlan(),
                        currentLot: null,
                        usedDomains: [],
                        usedCategories: [],
                        highestBid: 0,
                        topBidder: null,
                        timer: 0,
                        timerRef: null,
                        corrections: []
                    };

                    rooms.set(roomCode, room);
                    roomTimeouts.set(roomCode, scheduleRoomTimeout(roomCode, io));
                    socketRoomMap.set(socket.id, roomCode);
                    socket.join(roomCode);

                    console.log(`⚡ Quick Match created new public room ${roomCode} hosted by ${user.username}`);
                    socket.emit('room_created', { roomCode, room: sanitizeRoom(room) });
                }
            } catch (err) {
                console.error('quick_match error:', err);
                socket.emit('join_error', { message: 'Quick match failed.' });
            }
        });

        socket.on('join_room', async (payload = {}) => {
            try {
                const { roomCode } = payload || {};
                const userId = getSocketUserId(socket, payload);
                if (!userId) {
                    return socket.emit('join_error', { message: 'Authentication required. Please log in.' });
                }
                const cleanCode = String(roomCode || '').replace(/[^0-9]/g, '').trim();
                const room = rooms.get(cleanCode);
                if (!room) {
                    return socket.emit('join_error', { message: `Room #${cleanCode || roomCode} not found. Please check the 4-digit code.` });
                }

                if (room.bannedUserIds && room.bannedUserIds.includes(userId)) {
                    return socket.emit('join_error', { message: 'You have been kicked from this room and cannot rejoin.' });
                }

                const existingPlayer = room.players.find(p => p.userId === userId);
                if (existingPlayer) {
                    const graceEntry = disconnectGraceTimers.get(userId);
                    if (graceEntry) {
                        clearTimeout(graceEntry.timeout);
                        disconnectGraceTimers.delete(userId);
                        console.log(`🔁 Cancelled grace-period timer for ${existingPlayer.username} (reconnected)`);
                    }

                    const oldSocketId = existingPlayer.socketId;
                    if (oldSocketId && oldSocketId !== socket.id) {
                        socketRoomMap.delete(oldSocketId);
                    }

                    existingPlayer.socketId = socket.id;
                    existingPlayer.disconnected = false;
                    socketRoomMap.set(socket.id, cleanCode);
                    socket.join(cleanCode);
                    socket.emit('join_success', { roomCode: cleanCode, room: sanitizeRoom(room) });

                    if (room.status !== 'lobby') {
                        sendRoomSyncState(socket, room);
                    } else {
                        io.to(cleanCode).emit('lobby_updated', { room: sanitizeRoom(room) });
                    }
                    return;
                }

                if (room.isPublic) {
                    return socket.emit('join_error', { message: 'This is a public room. Please use Quick Mode to match into public rooms!' });
                }

                if (room.players.length >= MAX_PLAYERS) {
                    return socket.emit('join_error', { message: 'Room is full (4/4 players).' });
                }

                const user = await User.findById(userId);
                if (!user) {
                    return socket.emit('join_error', { message: 'User not found. Please log in again.' });
                }

                const userRank = getRankFromXP(user.xp || 0);
                const player = {
                    socketId: socket.id,
                    userId: user._id.toString(),
                    username: user.username,
                    avatar: user.avatar,
                    cash: user.cash !== undefined ? user.cash : 10000,
                    rankBadge: userRank.badge,
                    rankName: userRank.name,
                    isHost: false
                };

                room.players.push(player);
                socketRoomMap.set(socket.id, cleanCode);
                socket.join(cleanCode);

                console.log(`👤 ${user.username} joined room ${cleanCode} (${room.players.length}/${MAX_PLAYERS})`);
                socket.emit('join_success', { roomCode: cleanCode, room: sanitizeRoom(room) });
                socket.to(cleanCode).emit('player_joined', { username: user.username });
                io.to(cleanCode).emit('lobby_updated', { room: sanitizeRoom(room) });
            } catch (err) {
                console.error('join_room error:', err);
                socket.emit('join_error', { message: 'Failed to join room.' });
            }
        });

        socket.on('get_room_status', ({ roomCode }) => {
            if (!roomCode) return;
            const cleanCode = String(roomCode).replace(/[^0-9]/g, '').trim();
            const room = rooms.get(cleanCode);
            if (room) {
                socket.emit('lobby_updated', { room: sanitizeRoom(room) });
            }
        });

        socket.on('start_game', (payload = {}) => {
            const { roomCode } = payload || {};
            const userId = getSocketUserId(socket, payload);
            if (!roomCode || !userId) {
                return socket.emit('join_error', { message: 'Authentication required.' });
            }
            const cleanCode = String(roomCode).replace(/[^0-9]/g, '').trim();
            const room = rooms.get(cleanCode);
            if (!room) {
                return socket.emit('join_error', { message: 'Room not found.' });
            }

            const host = room.players.find(p => p.isHost);
            if (!host || host.userId !== userId || host.socketId !== socket.id) {
                return socket.emit('join_error', { message: 'Only the room host can start the game!' });
            }

            if (room.players.length < 2) {
                return socket.emit('join_error', { message: `Need at least 2 players to start! (${room.players.length}/${MAX_PLAYERS})` });
            }

            if (room.status !== 'lobby') {
                return socket.emit('join_error', { message: 'Game already in progress.' });
            }

            const timer = roomTimeouts.get(cleanCode);
            if (timer) {
                clearTimeout(timer);
                roomTimeouts.delete(cleanCode);
            }

            room.currentRound = 0;
            room.gamePlan = generateGamePlan();
            room.currentLot = null;
            room.roundHistory = [];
            room.chatHistory = [];
            room.usedDomains = [];
            room.usedCategories = [];
            room.usedSentences = [];
            room.players.forEach(p => {
                p.points = 0;
                p.boughtHint = false;
            });

            console.log(`🚀 Game starting in room ${cleanCode} triggered by Host ${host.username}`);
            io.to(cleanCode).emit('game_starting', {
                roomCode: cleanCode,
                message: `Host ${host.username} is starting the auction!`
            });

            setTimeout(() => startRound(cleanCode, io), 3000);
        });

        socket.on('buy_hint', ({ roomCode }) => {
            const cleanCode = String(roomCode || '').replace(/[^0-9]/g, '').trim();
            const room = rooms.get(cleanCode);
            if (!room || room.status !== 'inspection') return;

            const player = room.players.find(p => p.socketId === socket.id);
            if (!player || player.boughtHint) return;

            if (player.cash < 300) {
                return socket.emit('hint_error', { message: 'Not enough cash for a hint ($300).' });
            }

            player.cash -= 300;
            player.boughtHint = true;

            persistAllHumanCash(room);

            console.log(`💡 ${player.username} bought hint in room ${cleanCode} (-$300)`);
            socket.emit('hint_revealed', {
                hintText: room.currentLot.hintText,
                newCash: player.cash
            });

            io.to(cleanCode).emit('players_updated', {
                players: room.players.map(p => ({
                    socketId: p.socketId,
                    userId: p.userId,
                    username: p.username,
                    avatar: p.avatar,
                    cash: p.cash,
                    isHost: p.isHost
                }))
            });
        });

        socket.on('place_bid', ({ roomCode, amount }) => {
            const cleanCode = String(roomCode || '').replace(/[^0-9]/g, '').trim();
            const room = rooms.get(cleanCode);
            if (!room || room.status !== 'bidding') return;

            const player = room.players.find(p => p.socketId === socket.id);
            if (!player) return;

            const bidAmount = Math.floor(Number(amount));
            if (isNaN(bidAmount) || bidAmount <= 0) {
                return socket.emit('bid_error', { message: 'Invalid bid amount.' });
            }

            let effectiveBid = bidAmount;
            let boostApplied = false;
            const activeEffects = room.activeCardEffects && room.activeCardEffects[player.userId];
            if (activeEffects && activeEffects.BID_BOOST) {
                effectiveBid = bidAmount * 2;
                boostApplied = true;
                activeEffects.BID_BOOST_APPLIED = true;
                delete activeEffects.BID_BOOST;
                console.log(`⚡ BID BOOST CARD: ${player.username}'s bid doubled ($${bidAmount} -> $${effectiveBid})`);
                socket.emit('power_card:result', { success: true, message: `⚡ Bid Doubled! Effective bid: $${effectiveBid.toLocaleString()}` });
                io.to(cleanCode).emit('power_card_activated', {
                    userId: player.userId,
                    username: player.username,
                    cardName: 'Bid Boost (2x Bid)',
                    icon: '⚡'
                });
            }

            if (effectiveBid <= room.highestBid) {
                return socket.emit('bid_error', { message: `Bid must be higher than current highest ($${room.highestBid.toLocaleString()}).` });
            }

            if (room.topBidder && room.topBidder.socketId === socket.id) {
                return socket.emit('bid_error', { message: 'You are already the top bidder!' });
            }

            if (bidAmount > player.cash) {
                return socket.emit('bid_error', { message: 'Not enough vault cash for this bid.' });
            }

            room.highestBid = effectiveBid;
            room.topBidder = { socketId: socket.id, userId: player.userId, username: player.username };

            onPlayerBid(room, player, bidAmount);

            console.log(`💰 ${player.username} bid $${bidAmount.toLocaleString()} in room ${cleanCode}`);

            if (room.timer <= 3) {
                const MAX_ANTI_SNIPE_TOTAL = 10;
                const currentExt = room.antiSnipeExtended || 0;
                if (currentExt < MAX_ANTI_SNIPE_TOTAL) {
                    const add = Math.min(2, MAX_ANTI_SNIPE_TOTAL - currentExt);
                    room.timer += add;
                    room.antiSnipeExtended = currentExt + add;
                    console.log(`⏰ Anti-snipe: timer extended by +${add}s (Total anti-snipe used: ${room.antiSnipeExtended}/${MAX_ANTI_SNIPE_TOTAL}s) in room ${cleanCode}`);
                }
            }

            io.to(cleanCode).emit('bid_update', {
                highestBid: room.highestBid,
                topBidder: room.topBidder,
                timer: room.timer
            });
        });

        socket.on('submit_correction', ({ roomCode, correctedText }) => {
            const cleanCode = String(roomCode || '').replace(/[^0-9]/g, '').trim();
            const room = rooms.get(cleanCode);
            if (!room || room.status !== 'correction') return;

            const player = room.players.find(p => p.socketId === socket.id);
            if (!player) return;

            const alreadySubmitted = room.corrections.find(c => c.socketId === socket.id);
            if (alreadySubmitted) {
                return socket.emit('correction_error', { message: 'You already submitted a correction.' });
            }

            const trimmed = (correctedText || '').trim();
            if (!trimmed) {
                return socket.emit('correction_error', { message: 'Correction cannot be empty.' });
            }

            const normalize = s => (s || '').toLowerCase().replace(/\s+/g, ' ').replace(/[.!?]+$/, '').trim();
            const userAttempt = normalize(trimmed);
            const fullCorrection = normalize(room.currentLot.correction);
            const targetPhrase = room.currentLot.correctPhrase ? normalize(room.currentLot.correctPhrase) : null;

            let isAccurate = userAttempt === fullCorrection;
            if (!isAccurate && targetPhrase) {
                isAccurate = (userAttempt === targetPhrase) || (userAttempt.includes(targetPhrase) || targetPhrase.includes(userAttempt));
            }

            const activeEffects = room.activeCardEffects && room.activeCardEffects[player.userId];
            if (!isAccurate && activeEffects && activeEffects.SECOND_CHANCE) {
                delete activeEffects.SECOND_CHANCE;
                console.log(`🔄 SECOND CHANCE CARD: ${player.username} used Second Chance (failed attempt forgiven)`);
                return socket.emit('second_chance_granted', {
                    message: '🔄 SECOND CHANCE! Your correction was incorrect, but Second Chance grants you 1 extra attempt!'
                });
            }

            const submissionOrder = room.corrections.length + 1;
            room.corrections.push({
                socketId: socket.id,
                userId: player.userId,
                username: player.username,
                text: trimmed,
                isAccurate,
                order: submissionOrder
            });

            if (isAccurate && submissionOrder === 1) {
                player.cash += 500;
                console.log(`✅ ${player.username} submitted FIRST correct correction (+$500)`);
            } else if (isAccurate) {
                player.cash += 200;
                console.log(`✅ ${player.username} submitted correct correction (+$200)`);
            } else {
                player.cash -= 200;
                console.log(`❌ ${player.username} submitted wrong correction (-$200)`);
            }

            persistAllHumanCash(room);

            if (!player.isBot) {
                const matchId = room.matchId || room.code;
                const roundId = `round_${room.currentRound}`;

                User.findById(player.userId).then(async (user) => {
                    if (!user) return;
                    if (!user.stats) user.stats = {};
                    user.stats.totalCorrectionsSubmitted = (user.stats.totalCorrectionsSubmitted || 0) + 1;
                    if (isAccurate) {
                        user.stats.correctCorrectionsSubmitted = (user.stats.correctCorrectionsSubmitted || 0) + 1;
                    }
                    await user.save();

                    if (isAccurate) {
                        const xpReward = submissionOrder === 1 ? XP_REWARDS.CORRECTION_FIRST_ACCURATE : XP_REWARDS.CORRECTION_ACCURATE;
                        const xpType = submissionOrder === 1 ? 'CORRECTION_FIRST_ACCURATE' : 'CORRECTION_ACCURATE';
                        const xpDesc = submissionOrder === 1
                            ? `First accurate correction in round ${room.currentRound}`
                            : `Accurate correction in round ${room.currentRound}`;

                        await awardXP({
                            userId: player.userId,
                            amount: xpReward,
                            type: xpType,
                            matchId,
                            roundId,
                            description: xpDesc,
                            io,
                            roomCode: cleanCode
                        });
                    }
                }).catch(err => console.error('Correction stat & XP update error:', err));
            }

            socket.emit('correction_result', {
                isAccurate,
                cashChange: isAccurate ? (submissionOrder === 1 ? 500 : 200) : -200,
                newCash: player.cash,
                order: submissionOrder
            });

            io.to(cleanCode).emit('players_updated', {
                players: room.players.map(p => ({
                    socketId: p.socketId,
                    userId: p.userId,
                    username: p.username,
                    avatar: p.avatar,
                    cash: p.cash,
                    isHost: p.isHost
                }))
            });
        });

        socket.on('power_cards:get_state', async (payload = {}) => {
            const userId = getSocketUserId(socket, payload);
            if (!userId) return;
            const data = await getUserPowerCards(userId);
            if (data) {
                socket.emit('power_cards:state', { cash: data.cash, inventory: data.inventory });
            }
        });

        socket.on('power_card:purchase', async (payload = {}) => {
            const { cardId, quantity } = payload || {};
            const userId = getSocketUserId(socket, payload);
            if (!userId) return socket.emit('power_card:error', { message: 'Unauthorized' });

            const result = await purchasePowerCard(userId, cardId, quantity || 1);
            if (result.success) {
                socket.emit('power_cards:state', { cash: result.cash, inventory: result.inventory });
                socket.emit('power_card:result', { success: true, message: `Purchased ${result.quantity}x ${result.card.name}!`, result });
            } else {
                socket.emit('power_card:error', { message: result.message || 'Purchase failed.' });
            }
        });

        socket.on('power_card:use', async (payload = {}) => {
            const { roomCode, cardId } = payload || {};
            const userId = getSocketUserId(socket, payload);
            if (!userId) return socket.emit('power_card:error', { message: 'Unauthorized' });

            const cleanCode = String(roomCode || '').replace(/[^0-9]/g, '').trim();
            const room = rooms.get(cleanCode);

            const result = await consumeAndApplyCard(userId, cardId, room, room ? room.status : null);
            if (!result.success) {
                return socket.emit('power_card:error', { message: result.message });
            }

            socket.emit('power_cards:state', { inventory: result.inventory });
            socket.emit('power_card:result', { success: true, message: `Activated ${result.card.name}!`, cardId });

            io.to(cleanCode).emit('power_card_activated', {
                userId: result.userId,
                username: result.username,
                cardId,
                cardName: result.card.name,
                icon: result.card.icon
            });

            if (cardId === 'DOUBLE_HINT' && room && room.currentLot) {
                const secondaryHint = room.currentLot.validationReasoning
                    ? `💡 Detailed Rule: ${room.currentLot.validationReasoning}`
                    : `💡 Clue: ${room.currentLot.hintText} (Category: ${room.currentLot.category})`;

                socket.emit('double_hint_revealed', {
                    hintText: secondaryHint,
                    cardId: 'DOUBLE_HINT'
                });
            }
        });

        socket.on('kick_player', (payload = {}) => {
            try {
                const { roomCode, targetUserId } = payload || {};
                const hostUserId = getSocketUserId(socket, payload);
                if (!roomCode || !targetUserId || !hostUserId) return;
                const cleanCode = String(roomCode).replace(/[^0-9]/g, '').trim();
                const room = rooms.get(cleanCode);
                if (!room) return;

                const host = room.players.find(p => p.isHost);
                if (!host || host.userId !== hostUserId || host.socketId !== socket.id) {
                    return socket.emit('join_error', { message: 'Only the room host can kick players.' });
                }

                if (host.userId === targetUserId) {
                    return socket.emit('join_error', { message: 'Host cannot kick themselves.' });
                }

                const targetIndex = room.players.findIndex(p => p.userId === targetUserId);
                if (targetIndex === -1) return;

                const [kickedPlayer] = room.players.splice(targetIndex, 1);

                if (!room.bannedUserIds) room.bannedUserIds = [];
                if (!room.bannedUserIds.includes(targetUserId)) {
                    room.bannedUserIds.push(targetUserId);
                }

                if (kickedPlayer.socketId) {
                    socketRoomMap.delete(kickedPlayer.socketId);
                    const targetSocket = io.sockets.sockets.get(kickedPlayer.socketId);
                    if (targetSocket) {
                        targetSocket.leave(cleanCode);
                        targetSocket.emit('you_were_kicked', {
                            message: `You were kicked from room #${cleanCode} by host ${host.username}.`
                        });
                    }
                }

                console.log(`🚫 Host ${host.username} kicked ${kickedPlayer.username} from room ${cleanCode}`);

                io.to(cleanCode).emit('player_kicked_notify', {
                    username: kickedPlayer.username,
                    message: `Host ${host.username} kicked ${kickedPlayer.username}.`
                });
                io.to(cleanCode).emit('lobby_updated', { room: sanitizeRoom(room) });
            } catch (err) {
                console.error('kick_player error:', err);
            }
        });

        socket.on('leave_room', (payload = {}) => {
            try {
                const { roomCode } = payload || {};
                const userId = getSocketUserId(socket, payload);
                const cleanCode = String(roomCode || '').replace(/[^0-9]/g, '').trim();
                const room = rooms.get(cleanCode);
                if (!room) return;

                const player = room.players.find(p => p.socketId === socket.id && (!userId || p.userId === userId));
                if (!player) return;

                const existingGrace = disconnectGraceTimers.get(player.userId);
                if (existingGrace) {
                    clearTimeout(existingGrace.timeout);
                    disconnectGraceTimers.delete(player.userId);
                }

                room.players = room.players.filter(p => p.userId !== player.userId);
                socketRoomMap.delete(socket.id);
                socket.leave(cleanCode);

                console.log(`🚪 ${player.username} explicitly left room ${cleanCode}`);

                const remainingHumans = room.players.filter(p => !p.isBot && !p.disconnected);
                if (remainingHumans.length === 0) {
                    const emptyTimer = roomTimeouts.get(cleanCode);
                    if (emptyTimer) {
                        clearTimeout(emptyTimer);
                        roomTimeouts.delete(cleanCode);
                    }
                    destroyRoomBots(cleanCode);
                    rooms.delete(cleanCode);
                    console.log(`🗑️ Room ${cleanCode} deleted (no human players remaining after ${player.username} left)`);
                } else {
                    let newHostUsername = null;
                    const hasHost = room.players.some(p => p.isHost && !p.disconnected);
                    if (!hasHost && room.players.length > 0) {
                        const nextHost = room.players.find(p => !p.disconnected) || room.players[0];
                        if (nextHost) {
                            nextHost.isHost = true;
                            newHostUsername = nextHost.username;
                        }
                    }
                    io.to(cleanCode).emit('player_left', {
                        username: player.username,
                        wasHost: player.isHost,
                        newHostUsername
                    });
                    io.to(cleanCode).emit('lobby_updated', { room: sanitizeRoom(room) });
                }
            } catch (err) {
                console.error('leave_room error:', err);
            }
        });

        socket.on('disconnect', () => {
            const disconnectedUserId = socketUserMap.get(socket.id);
            if (disconnectedUserId) {
                socketUserMap.delete(socket.id);
                const stillOnline = [...socketUserMap.values()].includes(disconnectedUserId);
                if (!stillOnline) onlineUserIds.delete(disconnectedUserId);
            }

            const roomCode = socketRoomMap.get(socket.id);
            if (!roomCode) return;

            const room = rooms.get(roomCode);
            if (!room) {
                socketRoomMap.delete(socket.id);
                return;
            }

            const leavingPlayer = room.players.find(p => p.socketId === socket.id);
            const leavingUsername = leavingPlayer ? leavingPlayer.username : 'A player';
            const wasHost = leavingPlayer ? leavingPlayer.isHost : false;

            const isActiveGame = room.status !== 'lobby' && room.status !== 'game_over';
            if (isActiveGame && leavingPlayer && !leavingPlayer.isBot) {
                leavingPlayer.disconnected = true;
                socketRoomMap.delete(socket.id);
                console.log(`⏳ ${leavingUsername} disconnected from active game in room ${roomCode} — grace period started (60s)`);

                const existingGrace = disconnectGraceTimers.get(leavingPlayer.userId);
                if (existingGrace) {
                    clearTimeout(existingGrace.timeout);
                }

                const graceTimeout = setTimeout(() => {
                    disconnectGraceTimers.delete(leavingPlayer.userId);
                    const currentRoom = rooms.get(roomCode);
                    if (!currentRoom) return;

                    const playerStillDisconnected = currentRoom.players.find(
                        p => p.userId === leavingPlayer.userId && p.disconnected
                    );
                    if (!playerStillDisconnected) return;

                    currentRoom.players = currentRoom.players.filter(p => p.userId !== leavingPlayer.userId);
                    console.log(`🚪 ${leavingUsername} grace period expired — removed from room ${roomCode} (${currentRoom.players.length} remaining)`);

                    const remainingHumans = currentRoom.players.filter(p => !p.isBot && !p.disconnected);
                    if (remainingHumans.length === 0) {
                        const emptyTimer = roomTimeouts.get(roomCode);
                        if (emptyTimer) {
                            clearTimeout(emptyTimer);
                            roomTimeouts.delete(roomCode);
                        }
                        destroyRoomBots(roomCode);
                        rooms.delete(roomCode);
                        console.log(`🗑️  Room ${roomCode} deleted (no human players remaining after grace)`);
                    } else {
                        let newHostUsername = null;
                        const hasHost = currentRoom.players.some(p => p.isHost && !p.disconnected);
                        if (!hasHost && currentRoom.players.length > 0) {
                            currentRoom.players[0].isHost = true;
                            newHostUsername = currentRoom.players[0].username;
                        }
                        io.to(roomCode).emit('player_left', {
                            username: leavingUsername,
                            wasHost,
                            newHostUsername
                        });
                        io.to(roomCode).emit('lobby_updated', { room: sanitizeRoom(currentRoom) });
                    }
                }, 60000);

                disconnectGraceTimers.set(leavingPlayer.userId, {
                    timeout: graceTimeout,
                    roomCode
                });
                return;
            }

            room.players = room.players.filter(p => p.socketId !== socket.id);
            socketRoomMap.delete(socket.id);

            console.log(`🚪 ${leavingUsername} left room ${roomCode} (${room.players.length} remaining)`);

            const remainingHumans = room.players.filter(p => !p.isBot && !p.disconnected);
            if (remainingHumans.length === 0) {
                const emptyTimer = roomTimeouts.get(roomCode);
                if (emptyTimer) {
                    clearTimeout(emptyTimer);
                    roomTimeouts.delete(roomCode);
                }
                destroyRoomBots(roomCode);
                rooms.delete(roomCode);
                console.log(`🗑️  Room ${roomCode} deleted (no human players remaining)`);
            } else {
                let newHostUsername = null;
                const hasHost = room.players.some(p => p.isHost && !p.disconnected);
                if (!hasHost && room.players.length > 0) {
                    room.players[0].isHost = true;
                    newHostUsername = room.players[0].username;
                    console.log(`👑 ${newHostUsername} promoted to host in room ${roomCode}`);
                }
                io.to(roomCode).emit('player_left', {
                    username: leavingUsername,
                    wasHost,
                    newHostUsername
                });
                io.to(roomCode).emit('lobby_updated', { room: sanitizeRoom(room) });
            }
        });
    });
}

module.exports = {
    initSocketHandler
};
