const mongoose = require('mongoose');

const questionSnapshotSchema = new mongoose.Schema({
    sentence: String,
    isCorrect: Boolean,
    correction: String,
    flawedPhrase: String,
    correctPhrase: String,
    category: String,
    hintText: String,
    englishVariety: String,
    validationReasoning: String
}, { _id: false });

const questionReportSchema = new mongoose.Schema({
    reportId: {
        type: String,
        required: true,
        unique: true,
        index: true
    },
    questionId: {
        type: String,
        required: true,
        index: true
    },
    reporterId: {
        type: String,
        required: true,
        index: true
    },
    reporterUsername: {
        type: String,
        required: true
    },
    matchId: {
        type: String,
        default: null
    },
    roomCode: {
        type: String,
        default: null
    },
    roundNumber: {
        type: Number,
        default: null
    },
    bidAmount: {
        type: Number,
        default: 0
    },
    questionSnapshot: {
        type: questionSnapshotSchema,
        required: true
    },
    reason: {
        type: String,
        enum: ['incorrect_verdict', 'incorrect_correction', 'ambiguous', 'nonsensical', 'other'],
        required: true
    },
    playerExplanation: {
        type: String,
        default: '',
        maxlength: 500
    },
    status: {
        type: String,
        enum: ['pending', 'valid', 'rejected', 'question_disabled'],
        default: 'pending',
        index: true
    },
    reviewedBy: {
        type: String,
        default: null
    },
    reviewedAt: {
        type: Date,
        default: null
    },
    reviewNotes: {
        type: String,
        default: null
    },
    compensationProcessed: {
        type: Boolean,
        default: false
    },
    createdAt: {
        type: Date,
        default: Date.now,
        index: true
    }
});

// Prevent duplicate reports: same player, same question
questionReportSchema.index({ reporterId: 1, questionId: 1 }, { unique: true });

module.exports = mongoose.model('QuestionReport', questionReportSchema);
