const mongoose = require('mongoose');

const inboxMessageSchema = new mongoose.Schema({
    userId: {
        type: String,
        required: true,
        index: true
    },
    type: {
        type: String,
        enum: ['compensation', 'report_result', 'announcement', 'system', 'news', 'reward'],
        required: true
    },
    title: {
        type: String,
        required: true
    },
    body: {
        type: String,
        required: true
    },
    imageUrl: {
        type: String,
        default: null
    },
    metadata: {
        questionId: { type: String, default: null },
        reportId: { type: String, default: null },
        transactionId: { type: String, default: null },
        matchId: { type: String, default: null },
        amount: { type: Number, default: null },
        originalBid: { type: Number, default: null },
        imageUrl: { type: String, default: null },
        rankName: { type: String, default: null },
        rankBadge: { type: String, default: null },
        xp: { type: Number, default: null },
        showAnimation: { type: Boolean, default: false }
    },
    isRead: {
        type: Boolean,
        default: false,
        index: true
    },
    createdAt: {
        type: Date,
        default: Date.now,
        index: true
    }
});

// Compound index for efficient unread count queries
inboxMessageSchema.index({ userId: 1, isRead: 1 });

module.exports = mongoose.model('InboxMessage', inboxMessageSchema);
