const rateLimit = require('express-rate-limit');

function rateLimitHandler(label) {
    return (req, res) => {
        const retryAfterSeconds = Math.ceil(
            (res.getHeader('Retry-After') || 60)
        );
        const mins = Math.floor(retryAfterSeconds / 60);
        const secs = retryAfterSeconds % 60;
        const retryAfterText = mins > 0
            ? `${mins}m ${secs}s`
            : `${secs}s`;

        res.status(429).json({
            error: `Too many ${label}. Please try again in ${retryAfterText}.`,
            rateLimited: true,
            retryAfterSeconds,
            retryAfterText
        });
    };
}

const loginRateLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 20,
    standardHeaders: true,
    legacyHeaders: false,
    handler: rateLimitHandler('login attempts')
});

const signupRateLimiter = rateLimit({
    windowMs: 60 * 60 * 1000,
    max: 10,
    standardHeaders: true,
    legacyHeaders: false,
    handler: rateLimitHandler('signup attempts')
});

const adminVerifyRateLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 10,
    standardHeaders: true,
    legacyHeaders: false,
    handler: rateLimitHandler('admin verification attempts')
});

const generalApiLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: 120,
    standardHeaders: true,
    legacyHeaders: false,
    handler: rateLimitHandler('requests')
});

module.exports = {
    rateLimitHandler,
    loginRateLimiter,
    signupRateLimiter,
    adminVerifyRateLimiter,
    generalApiLimiter
};
