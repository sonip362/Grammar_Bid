const { destroyRoomBots } = require('../sockets/botHandler');

const rooms = new Map();
const socketRoomMap = new Map();
const roomTimeouts = new Map();
const disconnectGraceTimers = new Map(); // userId -> { timeout, roomCode }
const onlineUserIds = new Set();
const socketUserMap = new Map();
const socketEventCounts = new Map();

const MAX_PLAYERS = 4;
const ROOM_TIMEOUT_MS = 10 * 60 * 1000; // 10 minutes

function generateRoomCode() {
    let code;
    do {
        code = Math.floor(1000 + Math.random() * 9000).toString();
    } while (rooms.has(code));
    return code;
}

function scheduleRoomTimeout(roomCode, io) {
    return setTimeout(() => {
        const room = rooms.get(roomCode);
        if (room) {
            console.log(`⏰ Room ${roomCode} cancelled due to 10-minute timeout.`);
            if (io) {
                io.to(roomCode).emit('room_cancelled', {
                    message: 'Room automatically cancelled after 10 minutes of inactivity.'
                });
            }
            room.players.forEach(p => socketRoomMap.delete(p.socketId));
            destroyRoomBots(roomCode);
            rooms.delete(roomCode);
        }
    }, ROOM_TIMEOUT_MS);
}

function generateGamePlan() {
    const threeCorrect = Math.random() < 0.5;
    const plan = threeCorrect
        ? [true, true, true, false, false]
        : [false, false, false, true, true];
    for (let i = plan.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [plan[i], plan[j]] = [plan[j], plan[i]];
    }
    return plan;
}

function sanitizeRoom(room) {
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
            rankBadge: p.rankBadge || '🌱',
            rankName: p.rankName || 'Grammar Novice',
            points: p.points || 0,
            boughtHint: p.boughtHint || false
        }))
    };
}

function clearRoomTimer(room) {
    if (room.timerRef) {
        clearInterval(room.timerRef);
        room.timerRef = null;
    }
}

module.exports = {
    rooms,
    socketRoomMap,
    roomTimeouts,
    disconnectGraceTimers,
    onlineUserIds,
    socketUserMap,
    socketEventCounts,
    MAX_PLAYERS,
    ROOM_TIMEOUT_MS,
    generateRoomCode,
    scheduleRoomTimeout,
    generateGamePlan,
    sanitizeRoom,
    clearRoomTimer
};
