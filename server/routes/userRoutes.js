const express = require('express');
const User = require('../../models/User');
const { authMiddleware, verifyToken } = require('../middleware/auth');

const router = express.Router();

// POST /api/user/complete-tutorial
router.post('/user/complete-tutorial', authMiddleware, async (req, res) => {
    try {
        const userId = req.user._id;

        const updatedUser = await User.findByIdAndUpdate(
            userId,
            { $set: { tutorialCompleted: true } },
            { returnDocument: 'after' }
        );

        if (!updatedUser) {
            return res.status(404).json({ error: 'User not found.' });
        }

        console.log(`🎓 Tutorial marked complete in DB for user: ${updatedUser.username} (${updatedUser._id})`);
        res.json({ success: true, message: 'Tutorial marked complete.' });
    } catch (err) {
        console.error('Save tutorial completion error:', err);
        res.status(500).json({ error: 'Failed to save tutorial status.' });
    }
});

// GET /api/leaderboard
router.get('/leaderboard', async (req, res) => {
    try {
        const allUsers = await User.find({}, 'username cash avatar').lean();

        allUsers.sort((a, b) => {
            const cashA = Number(a.cash !== undefined ? a.cash : 10000);
            const cashB = Number(b.cash !== undefined ? b.cash : 10000);
            return cashB - cashA;
        });

        const top10 = allUsers.slice(0, 10);

        const leaderboard = top10.map((u, index) => ({
            rank: index + 1,
            userId: u._id.toString(),
            username: u.username,
            cash: Number(u.cash !== undefined ? u.cash : 10000),
            avatar: u.avatar || `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(u.username)}`
        }));

        let myRank = null;
        const authHeader = req.headers.authorization;
        if (authHeader && authHeader.startsWith('Bearer ')) {
            const decoded = verifyToken(authHeader.split(' ')[1]);
            if (decoded) {
                const myIndex = allUsers.findIndex(u => u._id.toString() === decoded.userId);
                if (myIndex !== -1) {
                    const me = allUsers[myIndex];
                    myRank = {
                        rank: myIndex + 1,
                        userId: me._id.toString(),
                        username: me.username,
                        cash: Number(me.cash !== undefined ? me.cash : 10000),
                        avatar: me.avatar || `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(me.username)}`
                    };
                }
            }
        }

        res.json({ leaderboard, myRank });
    } catch (err) {
        console.error('Leaderboard fetch error:', err);
        res.status(500).json({ error: 'Failed to load leaderboard' });
    }
});

module.exports = router;
