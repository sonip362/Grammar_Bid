const express = require('express');
const InboxMessage = require('../../models/InboxMessage');
const { authMiddleware } = require('../middleware/auth');

const router = express.Router();

// GET /api/inbox
router.get('/', authMiddleware, async (req, res) => {
    try {
        const userId = req.user._id.toString();
        const messages = await InboxMessage.find({ userId }).sort({ createdAt: -1 }).limit(50).lean();
        const unreadCount = await InboxMessage.countDocuments({ userId, isRead: false });
        res.json({ messages, unreadCount });
    } catch (err) {
        console.error('Inbox fetch error:', err);
        res.status(500).json({ error: 'Failed to load inbox.' });
    }
});

// GET /api/inbox/unread-count
router.get('/unread-count', authMiddleware, async (req, res) => {
    try {
        const userId = req.user._id.toString();
        const unreadCount = await InboxMessage.countDocuments({ userId, isRead: false });
        res.json({ unreadCount });
    } catch (err) {
        res.status(500).json({ error: 'Failed to get unread count.' });
    }
});

// PUT /api/inbox/:messageId/read
router.put('/:messageId/read', authMiddleware, async (req, res) => {
    try {
        const userId = req.user._id.toString();
        const msg = await InboxMessage.findOneAndUpdate(
            { _id: req.params.messageId, userId },
            { $set: { isRead: true } },
            { returnDocument: 'after' }
        );
        if (!msg) return res.status(404).json({ error: 'Message not found.' });
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: 'Failed to mark as read.' });
    }
});

// PUT /api/inbox/read-all
router.put('/read-all', authMiddleware, async (req, res) => {
    try {
        const userId = req.user._id.toString();
        await InboxMessage.updateMany({ userId, isRead: false }, { $set: { isRead: true } });
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: 'Failed to mark all as read.' });
    }
});

// DELETE /api/inbox/:messageId
router.delete('/:messageId', authMiddleware, async (req, res) => {
    try {
        const userId = req.user._id.toString();
        const deletedMsg = await InboxMessage.findOneAndDelete({ _id: req.params.messageId, userId });
        if (!deletedMsg) {
            return res.status(404).json({ error: 'Message not found or unauthorized.' });
        }
        res.json({ success: true, message: 'Message deleted successfully.' });
    } catch (err) {
        console.error('Delete message error:', err);
        res.status(500).json({ error: 'Failed to delete message.' });
    }
});

// DELETE /api/inbox
router.delete('/', authMiddleware, async (req, res) => {
    try {
        const userId = req.user._id.toString();
        await InboxMessage.deleteMany({ userId });
        res.json({ success: true, message: 'All messages cleared successfully.' });
    } catch (err) {
        console.error('Clear all messages error:', err);
        res.status(500).json({ error: 'Failed to clear inbox.' });
    }
});

module.exports = router;
