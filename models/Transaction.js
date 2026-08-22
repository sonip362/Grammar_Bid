const mongoose = require('mongoose');

const transactionSchema = new mongoose.Schema({
    transactionId: {
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
        enum: ['QUESTION_COMPENSATION', 'ADMIN_ADJUSTMENT', 'GAME_RESULT', 'ADMIN_GRANT', 'admin_grant', 'DAILY_REWARD', 'POWER_CARD_PURCHASE', 'CASH_EXCHANGE', 'MINI_GAME_REWARD'],
        required: true
    },
    amount: {
        type: Number,
        required: true
    },
    balanceBefore: {
        type: Number,
        default: 0
    },
    balanceAfter: {
        type: Number,
        required: true
    },
    questionId: {
        type: String,
        default: null
    },
    reportId: {
        type: String,
        default: null
    },
    matchId: {
        type: String,
        default: null
    },
    reason: {
        type: String,
        default: null
    },
    adminId: {
        type: String,
        default: null
    },
    createdAt: {
        type: Date,
        default: Date.now,
        index: true
    }
});

// Idempotency: prevent duplicate compensation for same report + user
transactionSchema.index({ reportId: 1, userId: 1, type: 1 }, { unique: true, partialFilterExpression: { reportId: { $type: 'string' } } });

module.exports = mongoose.model('Transaction', transactionSchema);
