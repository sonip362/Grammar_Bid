const mongoose = require('mongoose');

const xpTransactionSchema = new mongoose.Schema({
    xpTransactionId: {
        type: String,
        required: true,
        unique: true,
        index: true
    },
    userId: {
        type: String,
        required: true,
        index: true
    },
    username: {
        type: String,
        required: true
    },
    type: {
        type: String,
        enum: [
            'MATCH_COMPLETE',
            'CORRECT_DECISION',
            'CORRECTION_WIN',
            'CORRECTION_ACCURATE',
            'CORRECTION_FIRST_ACCURATE',
            'AUCTION_WIN',
            'STREAK_BONUS',
            'RANK_ADJUSTMENT',
            'DAILY_REWARD'
        ],
        required: true
    },
    amount: {
        type: Number,
        required: true
    },
    xpBefore: {
        type: Number,
        default: 0
    },
    xpAfter: {
        type: Number,
        required: true
    },
    matchId: {
        type: String,
        default: null
    },
    roundId: {
        type: String,
        default: null
    },
    description: {
        type: String,
        default: ''
    },
    createdAt: {
        type: Date,
        default: Date.now,
        index: true
    }
});

// Idempotency index to prevent duplicate XP awards for the same user + match + round + type
xpTransactionSchema.index(
    { userId: 1, matchId: 1, roundId: 1, type: 1 },
    { unique: true, sparse: true }
);

module.exports = mongoose.model('XPTransaction', xpTransactionSchema);
