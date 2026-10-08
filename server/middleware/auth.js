const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const User = require('../../models/User');

if (!process.env.JWT_SECRET) {
    console.error('❌ FATAL: JWT_SECRET environment variable is not set. Refusing to start.');
    process.exit(1);
}
const JWT_SECRET = process.env.JWT_SECRET;

const ADMIN_JWT_SECRET = process.env.ADMIN_JWT_SECRET ||
    crypto.createHmac('sha256', JWT_SECRET).update('gb_admin_salt_auth_2025').digest('hex');

if (!process.env.ADMIN_CODE) {
    console.warn('⚠️  WARNING: ADMIN_CODE environment variable is not set. Admin panel is disabled.');
}
const ADMIN_CODE = process.env.ADMIN_CODE || null;

function generateToken(userId) {
    return jwt.sign({ userId }, JWT_SECRET, { expiresIn: '7d' });
}

function verifyToken(token) {
    try {
        return jwt.verify(token, JWT_SECRET);
    } catch {
        return null;
    }
}

async function authMiddleware(req, res, next) {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ error: 'No token provided' });
    }
    const decoded = verifyToken(authHeader.split(' ')[1]);
    if (!decoded) {
        return res.status(401).json({ error: 'Invalid token' });
    }
    const user = await User.findById(decoded.userId);
    if (!user) {
        return res.status(401).json({ error: 'User not found' });
    }
    req.user = user;
    next();
}

function adminMiddleware(req, res, next) {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ error: 'No admin token' });
    }
    const token = authHeader.split(' ')[1];
    try {
        const decoded = jwt.verify(token, ADMIN_JWT_SECRET);
        if (!decoded || !decoded.isAdmin || decoded.role !== 'admin') {
            return res.status(403).json({ error: 'Not authorized as admin' });
        }
        req.admin = decoded;
        next();
    } catch {
        return res.status(401).json({ error: 'Invalid admin token' });
    }
}

module.exports = {
    JWT_SECRET,
    ADMIN_JWT_SECRET,
    ADMIN_CODE,
    generateToken,
    verifyToken,
    authMiddleware,
    adminMiddleware
};
