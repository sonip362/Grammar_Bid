const Log = require('../../models/Log');

const _origLog = console.log.bind(console);
const _origError = console.error.bind(console);
const _origWarn = console.warn.bind(console);

function saveLog(level, args) {
    if (level !== 'warn' && level !== 'error') return;
    try {
        let message = args.map(a => (typeof a === 'string' ? a : JSON.stringify(a))).join(' ');
        message = message
            .replace(/(Bearer\s+)[A-Za-z0-9-_=]+\.[A-Za-z0-9-_=]+\.?[A-Za-z0-9-_.+/=]*/gi, '$1[REDACTED]')
            .replace(/(password["':\s]+)[^"'\s,}]+/gi, '$1[REDACTED]')
            .replace(/(ADMIN_CODE["':\s=]+)[^"'\s,}]+/gi, '$1[REDACTED]')
            .replace(/(secret["':\s=]+)[^"'\s,}]+/gi, '$1[REDACTED]')
            .slice(0, 2000);

        Log.create({ level, message }).catch(() => { });
    } catch { }
}

function initLogger() {
    if (process.env.QUIET_LOGS === 'true') {
        console.log = function (...args) {
            const msg = args.map(a => (typeof a === 'object' ? JSON.stringify(a) : String(a))).join(' ');
            if (msg.includes('Server running') || msg.includes('Connected to MongoDB') || msg.includes('injected env')) {
                _origLog.apply(console, args);
            }
        };
        console.warn = function () { };
    } else {
        console.log = (...args) => { _origLog(...args); };
        console.warn = (...args) => { _origWarn(...args); saveLog('warn', args); };
    }
    console.error = (...args) => { _origError(...args); saveLog('error', args); };
}

module.exports = {
    saveLog,
    initLogger
};
