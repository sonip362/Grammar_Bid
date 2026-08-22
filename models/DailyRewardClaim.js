const mongoose = require('mongoose');

const dailyRewardClaimSchema = new mongoose.Schema({
    claimId: {
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
    rewardDay: {
        type: Number,
        required: true,
        min: 1,
        max: 7
    },
    rewardDate: {
        type: String,
        required: true,
        index: true
    },
    rewardType: {
        type: String,
        enum: ['cash', 'xp', 'avatar', 'multi'],
        required: true
    },
    rewardDetails: {
        type: mongoose.Schema.Types.Mixed,
        required: true
    },
    dailyStreakAtClaim: {
        type: Number,
        default: 1
    },
    createdAt: {
        type: Date,
        default: Date.now,
        index: true
    }
});

// Idempotency: one claim per user per calendar day (UTC)
dailyRewardClaimSchema.index({ userId: 1, rewardDate: 1 }, { unique: true });

module.exports = mongoose.model('DailyRewardClaim', dailyRewardClaimSchema);
