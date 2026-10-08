const crypto = require('crypto');
if (!globalThis.crypto) {
    globalThis.crypto = crypto;
}

require('dotenv').config();

const express = require('express');
const http = require('http');
const path = require('path');
const cors = require('cors');
const helmet = require('helmet');
const mongoose = require('mongoose');
const { Server } = require('socket.io');

const Transaction = require('../models/Transaction');
const { initLogger } = require('./utils/logger');
const { generalApiLimiter } = require('./middleware/rateLimiters');

const authRoutes = require('./routes/authRoutes');
const adminRoutes = require('./routes/adminRoutes');
const reportRoutes = require('./routes/reportRoutes');
const inboxRoutes = require('./routes/inboxRoutes');
const rewardRoutes = require('./routes/rewardRoutes');
const miniGameRoutes = require('./routes/miniGameRoutes');
const notificationRoutes = require('./routes/notificationRoutes');
const userRoutes = require('./routes/userRoutes');
const { initSocketHandler } = require('./sockets/socketHandler');

initLogger();

const app = express();
const server = http.createServer(app);

const PORT = process.env.PORT || 3000;

// ─── CORS Setup ──────────────────────────────────────────────
const defaultAllowedOrigins = [
    'http://localhost:3000',
    'http://127.0.0.1:3000',
    'http://localhost:7860',
    'http://127.0.0.1:7860'
];
const allowedOrigins = process.env.ALLOWED_ORIGINS
    ? process.env.ALLOWED_ORIGINS.split(',').map(s => s.trim()).filter(Boolean)
    : (process.env.NODE_ENV === 'production' ? [] : defaultAllowedOrigins);

const corsOriginDelegate = (origin, cb) => {
    if (!origin) return cb(null, true);
    if (allowedOrigins.length === 0) {
        return cb(new Error('CORS blocked: origin not allowed'));
    }
    if (allowedOrigins.includes(origin) || allowedOrigins.includes('*')) {
        return cb(null, true);
    }
    cb(new Error('CORS blocked: origin not allowed'));
};

app.use(cors({
    origin: corsOriginDelegate,
    credentials: true
}));

const io = new Server(server, {
    cors: {
        origin: allowedOrigins.length > 0 ? (allowedOrigins.includes('*') ? '*' : allowedOrigins) : false,
        credentials: true
    },
    pingTimeout: 45000,
    pingInterval: 15000,
    connectTimeout: 45000,
    transports: ['websocket', 'polling']
});

app.set('io', io);

// ─── Security Headers (Helmet) & Body Parsers ────────────────
app.use(helmet({
    contentSecurityPolicy: false,
    crossOriginEmbedderPolicy: false
}));

app.use(express.json({ limit: '200kb' }));
app.use(express.urlencoded({ limit: '200kb', extended: true }));

// ─── Static Files Serving ────────────────────────────────────
const rootDir = path.join(__dirname, '..');
app.use(express.static(path.join(rootDir, 'pages/templates')));
app.use('/pages/templates', express.static(path.join(rootDir, 'pages/templates')));
app.use(express.static(path.join(rootDir, 'pages/styles')));
app.use('/pages/styles', express.static(path.join(rootDir, 'pages/styles')));
app.use(express.static(path.join(rootDir, 'pages/javascript')));
app.use('/pages/javascript', express.static(path.join(rootDir, 'pages/javascript')));
app.use('/assets', express.static(path.join(rootDir, 'assets')));
app.use(express.static(path.join(rootDir, 'assets')));
app.use('/assests', express.static(path.join(rootDir, 'assests')));
app.use(express.static(path.join(rootDir, 'assests')));
app.use(express.static(path.join(rootDir, 'assests/images')));
app.use(express.static(path.join(rootDir, 'assests/SFX')));
app.use('/SFX', express.static(path.join(rootDir, 'assests/SFX')));
app.use('/Mini_Games', express.static(path.join(rootDir, 'Mini_Games/pages')));
app.use('/Mini_Games/pages', express.static(path.join(rootDir, 'Mini_Games/pages')));
app.use('/Mini_Games/javascript', express.static(path.join(rootDir, 'Mini_Games/javascript')));
app.use('/assets/icons', express.static(path.join(rootDir, 'assets/icons')));

// ─── Root Static Routes ──────────────────────────────────────
app.get('/sw.js', (req, res) => {
    res.sendFile(path.join(rootDir, 'sw.js'));
});

app.get('/manifest.json', (req, res) => {
    res.sendFile(path.join(rootDir, 'manifest.json'));
});

app.get('/', (req, res) => {
    res.sendFile(path.join(rootDir, 'pages/templates/index.html'));
});

app.get('/help', (req, res) => {
    res.sendFile(path.join(rootDir, 'pages/templates/help.html'));
});

// ─── MongoDB Connection ──────────────────────────────────────
let isMongoConnected = false;
mongoose.connect(process.env.MONGO_URI)
    .then(async () => {
        isMongoConnected = true;
        console.log('✅ Connected to MongoDB Atlas');
        try {
            await Transaction.syncIndexes();
            console.log('✅ Transaction indexes synced successfully.');
        } catch (e) {
            console.warn('Transaction syncIndexes warning:', e.message);
        }
    })
    .catch(err => {
        console.error('❌ FATAL: MongoDB connection error. Refusing to run in broken state:', err);
        process.exit(1);
    });

// ─── API Routes ──────────────────────────────────────────────
app.use('/api/', generalApiLimiter);
app.use('/api/auth', authRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/reports', reportRoutes);
app.use('/api/inbox', inboxRoutes);
app.use('/api', rewardRoutes);
app.use('/api/mini-games', miniGameRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api', userRoutes);

// ─── Socket.IO Handler ───────────────────────────────────────
initSocketHandler(io);

// ─── Graceful Shutdown ───────────────────────────────────────
let isShuttingDown = false;
async function gracefulShutdown(signal) {
    if (isShuttingDown) return;
    isShuttingDown = true;
    console.log(`\n🛑 Received ${signal}. Starting graceful shutdown...`);

    server.close(async () => {
        console.log('HTTP and WebSocket server closed.');
        try {
            await mongoose.connection.close(false);
            console.log('MongoDB connection closed.');
            process.exit(0);
        } catch (err) {
            console.error('Error during database disconnection:', err);
            process.exit(1);
        }
    });

    setTimeout(() => {
        console.error('Forced shutdown due to timeout.');
        process.exit(1);
    }, 10000).unref();
}

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

// ─── Start Server ────────────────────────────────────────────
if (require.main === module) {
    server.listen(PORT, () => {
        console.log(`🚀 Server running at http://localhost:${PORT}`);
    });
}

module.exports = { app, server, io };
