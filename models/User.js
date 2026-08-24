const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const userSchema = new mongoose.Schema({
    username: {
        type: String,
        required: true,
        unique: true,
        trim: true,
        minlength: 3,
        maxlength: 20
    },
    password: {
        type: String,
        required: true,
        minlength: 6
    },
    isGuest: {
        type: Boolean,
        default: false
    },
    tutorialCompleted: {
        type: Boolean,
        default: false
    },
    avatar: {
        type: String,
        default: 'https://api.dicebear.com/7.x/initials/svg?seed=GB'
    },
    cash: {
        type: Number,
        default: 10000
    },
    tokens: {
        type: Number,
        default: 50
    },
    xp: {
        type: Number,
        default: 0,
        index: true
    },
    rank: {
        type: String,
        default: 'Grammar Novice'
    },
    unlockedAvatars: {
        type: [String],
        default: [
            '/images/profile/Novice%20Quill.webp',
            '/images/profile/Typo%20Inspector.webp'
        ]
    },
    gamesPlayed: {
        type: Number,
        default: 0
    },
    gamesWon: {
        type: Number,
        default: 0
    },
    totalCashEarned: {
        type: Number,
        default: 0
    },
    stats: {
        totalRoundsPlayed: { type: Number, default: 0 },
        correctDecisions: { type: Number, default: 0 },
        auctionsWon: { type: Number, default: 0 },
        totalCorrectionsSubmitted: { type: Number, default: 0 },
        correctCorrectionsSubmitted: { type: Number, default: 0 },
        bestBid: { type: Number, default: 0 },
        currentStreak: { type: Number, default: 0 },
        bestStreak: { type: Number, default: 0 }
    },
    dailyReward: {
        currentDay: { type: Number, default: 1 },
        dailyStreak: { type: Number, default: 0 },
        lastClaimDate: { type: String, default: null }
    },
    inventory: {
        hintCards: { type: Number, default: 0 },
        shieldCards: { type: Number, default: 0 },
        powerCards: {
            DOUBLE_HINT: { type: Number, default: 0 },
            BID_SHIELD: { type: Number, default: 0 },
            CASHBACK: { type: Number, default: 0 },
            SECOND_CHANCE: { type: Number, default: 0 },
            BID_BOOST: { type: Number, default: 0 }
        }
    },
    miniGames: {
        flappy: {
            lastPlayDate: { type: String, default: null },
            attemptsToday: { type: Number, default: 0 }
        },
        ticTacToe: {
            lastPlayDate: { type: String, default: null },
            attemptsToday: { type: Number, default: 0 }
        },
        helpAi: {
            lastPlayDate: { type: String, default: null },
            attemptsToday: { type: Number, default: 0 }
        },
        patternSequence: {
            lastPlayDate: { type: String, default: null },
            attemptsToday: { type: Number, default: 0 }
        },
        mathSequence: {
            lastPlayDate: { type: String, default: null },
            attemptsToday: { type: Number, default: 0 }
        },
        foodMemory: {
            lastPlayDate: { type: String, default: null },
            attemptsToday: { type: Number, default: 0 }
        }
    },
    pushSubscriptions: [{
        endpoint: { type: String, required: true },
        keys: {
            p256dh: { type: String, required: true },
            auth: { type: String, required: true }
        }
    }],
    createdAt: {
        type: Date,
        default: Date.now
    }
});

// Hash password before saving
userSchema.pre('save', async function () {
    if (!this.isModified('password')) return;
    const salt = await bcrypt.genSalt(10);
    this.password = await bcrypt.hash(this.password, salt);
});

// Compare password method
userSchema.methods.comparePassword = async function (candidatePassword) {
    return bcrypt.compare(candidatePassword, this.password);
};

// Remove password from JSON output
userSchema.methods.toJSON = function () {
    const obj = this.toObject();
    delete obj.password;
    return obj;
};

module.exports = mongoose.model('User', userSchema);
