const express = require('express');
const QuestionReport = require('../../models/QuestionReport');
const { authMiddleware } = require('../middleware/auth');

const router = express.Router();

// POST /api/reports
router.post('/', authMiddleware, async (req, res) => {
    try {
        const user = req.user;
        const { questionId, reason, playerExplanation, questionSnapshot, roomCode, roundNumber, bidAmount, matchId } = req.body;

        if (!questionId || !reason) {
            return res.status(400).json({ error: 'questionId and reason are required.' });
        }

        const validReasons = ['incorrect_verdict', 'incorrect_correction', 'ambiguous', 'nonsensical', 'other'];
        if (!validReasons.includes(reason)) {
            return res.status(400).json({ error: 'Invalid report reason.' });
        }

        if (!questionSnapshot || !questionSnapshot.sentence) {
            return res.status(400).json({ error: 'Question snapshot with sentence is required.' });
        }

        const existing = await QuestionReport.findOne({ reporterId: user._id.toString(), questionId });
        if (existing) {
            return res.status(409).json({ error: 'You have already reported this question.' });
        }

        const reportId = `rpt_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;

        const report = new QuestionReport({
            reportId,
            questionId,
            reporterId: user._id.toString(),
            reporterUsername: user.username,
            matchId: matchId || null,
            roomCode: roomCode || null,
            roundNumber: roundNumber || null,
            bidAmount: typeof bidAmount === 'number' ? bidAmount : 0,
            questionSnapshot: {
                sentence: questionSnapshot.sentence,
                isCorrect: questionSnapshot.isCorrect,
                correction: questionSnapshot.correction || null,
                flawedPhrase: questionSnapshot.flawedPhrase || null,
                correctPhrase: questionSnapshot.correctPhrase || null,
                category: questionSnapshot.category || null,
                hintText: questionSnapshot.hintText || null,
                englishVariety: questionSnapshot.englishVariety || null,
                validationReasoning: questionSnapshot.validationReasoning || null
            },
            reason,
            playerExplanation: (playerExplanation || '').substring(0, 500),
            status: 'pending'
        });

        await report.save();
        console.log(`📋 Report ${reportId} submitted by ${user.username} for question ${questionId}`);
        res.status(201).json({ success: true, reportId });
    } catch (err) {
        if (err.code === 11000) {
            return res.status(409).json({ error: 'You have already reported this question.' });
        }
        console.error('Submit report error:', err);
        res.status(500).json({ error: 'Failed to submit report.' });
    }
});

module.exports = router;
