// server/sockets/botHandler.js
// ─── Bot Socket Event Handlers & Game Lifecycle Hooks ─────────

const { createDynamicBotProfile } = require('../bots/botProfiles');
const { BotPlayer } = require('../bots/BotPlayer');
const { RANKS } = require('../config/ranks');

// Track active BotPlayer instances per room: Map<roomCode, BotPlayer[]>
const roomBots = new Map();

/**
 * Register bot-related socket events on a socket connection.
 * Called inside io.on('connection', socket => { ... })
 */
function registerBotHandlers(io, socket, rooms, socketRoomMap) {

    // ── ADD BOT (Host Only, Private Rooms Only) ──────────────
    socket.on('add_bot', ({ roomCode, userId }) => {
        try {
            if (!roomCode || !userId) return;
            const cleanCode = String(roomCode).replace(/[^0-9]/g, '').trim();
            const room = rooms.get(cleanCode);
            if (!room) return socket.emit('join_error', { message: 'Room not found.' });

            // Only private rooms
            if (room.isPublic) {
                return socket.emit('join_error', { message: 'Bots can only be added to private rooms.' });
            }

            // Host check
            const host = room.players.find(p => p.isHost);
            if (!host || host.userId !== userId) {
                return socket.emit('join_error', { message: 'Only the host can add bots.' });
            }

            // Room must be in lobby
            if (room.status !== 'lobby') {
                return socket.emit('join_error', { message: 'Cannot add bots after game has started.' });
            }

            // Max 4 players check
            if (room.players.length >= 4) {
                return socket.emit('join_error', { message: 'Room is full (4/4 players).' });
            }

            // Generate a fresh dynamic bot profile with unique username & personality
            const usedNames = room.players.map(p => p.username);
            const profile = createDynamicBotProfile(usedNames);

            // Create BotPlayer instance
            const bot = new BotPlayer(profile, cleanCode, io, rooms);

            // Store instance
            if (!roomBots.has(cleanCode)) roomBots.set(cleanCode, []);
            roomBots.get(cleanCode).push(bot);

            // Add bot to room players
            room.players.push(bot.playerData);

            console.log(`🤖 Bot ${profile.username} added to room ${cleanCode} by ${host.username}`);

            // Notify lobby
            socket.emit('bot_added', { username: profile.username });
            io.to(cleanCode).emit('player_joined', { username: profile.username });
            io.to(cleanCode).emit('lobby_updated', { room: sanitizeRoomForBots(room) });
        } catch (err) {
            console.error('add_bot error:', err);
            socket.emit('join_error', { message: 'Failed to add bot.' });
        }
    });

    // ── REMOVE BOT (Host Only) ───────────────────────────────
    socket.on('remove_bot', ({ roomCode, botUserId }) => {
        try {
            if (!roomCode || !botUserId) return;
            const cleanCode = String(roomCode).replace(/[^0-9]/g, '').trim();
            const room = rooms.get(cleanCode);
            if (!room) return;

            // Host check
            const host = room.players.find(p => p.isHost);
            if (!host || host.socketId !== socket.id) return;

            // Must be in lobby
            if (room.status !== 'lobby') return;

            // Find and remove bot
            const botIndex = room.players.findIndex(p => p.userId === botUserId && p.isBot);
            if (botIndex === -1) return;

            const [removed] = room.players.splice(botIndex, 1);

            // Destroy bot instance
            const bots = roomBots.get(cleanCode) || [];
            const botInstance = bots.find(b => b.profile.botId === botUserId);
            if (botInstance) {
                botInstance.destroy();
                roomBots.set(cleanCode, bots.filter(b => b !== botInstance));
            }

            console.log(`🤖 Bot ${removed.username} removed from room ${cleanCode}`);
            io.to(cleanCode).emit('lobby_updated', { room: sanitizeRoomForBots(room) });
        } catch (err) {
            console.error('remove_bot error:', err);
        }
    });
}

// ─── Game Lifecycle Hooks (called from server.js) ────────────

function onBiddingStart(room) {
    const bots = roomBots.get(room.code) || [];
    bots.forEach(bot => {
        if (!bot.destroyed) bot.startBidding(room);
    });
}

function onPlayerBid(room, bidder, amount) {
    const bots = roomBots.get(room.code) || [];
    bots.forEach(bot => {
        if (!bot.destroyed) bot.onPlayerBid(bidder, amount);
    });
}

function onRoundStart(room) {
    const bots = roomBots.get(room.code) || [];
    bots.forEach(bot => {
        if (!bot.destroyed) bot.onRoundStart();
    });
}

function onRoundResult(room, result) {
    const bots = roomBots.get(room.code) || [];
    bots.forEach(bot => {
        if (!bot.destroyed) bot.onRoundResult(result);
    });
}

function onCorrectionStart(room) {
    const bots = roomBots.get(room.code) || [];
    bots.forEach(bot => {
        if (!bot.destroyed) bot.submitCorrection(room);
    });
}

function onGameOver(room) {
    const bots = roomBots.get(room.code) || [];
    if (bots.length === 0) return;

    // Determine game winner
    const standings = [...room.players].sort((a, b) => b.cash - a.cash);
    const winnerUserId = standings[0]?.userId;

    bots.forEach(bot => {
        const isWinner = bot.profile.botId === winnerUserId;
        bot.onGameOver(isWinner);

        // Destroy after a brief delay to let final emotes/chat fire
        setTimeout(() => bot.destroy(), 5000);
    });

    // Cleanup map entry after delay
    setTimeout(() => roomBots.delete(room.code), 6000);
}

function destroyRoomBots(roomCode) {
    const bots = roomBots.get(roomCode) || [];
    bots.forEach(bot => bot.destroy());
    roomBots.delete(roomCode);
}

// ─── Helper: sanitize room including bot flag ─────────────────
function sanitizeRoomForBots(room) {
    return {
        code: room.code,
        isPublic: room.isPublic,
        status: room.status,
        createdAt: room.createdAt,
        currentRound: room.currentRound,
        totalRounds: room.totalRounds,
        highestBid: room.highestBid,
        topBidder: room.topBidder,
        players: room.players.map(p => ({
            socketId: p.socketId,
            userId: p.userId,
            username: p.username,
            avatar: p.avatar,
            cash: p.cash,
            isHost: p.isHost,
            isBot: p.isBot || false,
            isBoss: p.isBoss || false,
            rankBadge: p.rankBadge || '🌱',
            rankName: p.rankName || 'Grammar Novice',
            points: p.points || 0,
            boughtHint: p.boughtHint || false
        }))
    };
}

module.exports = {
    registerBotHandlers,
    onBiddingStart,
    onPlayerBid,
    onRoundStart,
    onRoundResult,
    onCorrectionStart,
    onGameOver,
    destroyRoomBots,
    roomBots
};
