/**
 * Mini Games Arcade Master Script — Grammar Bid Economy
 * Centralized game utilities, attempt management, reward submissions,
 * and shared game engines (Tic Tac Toe, Flappy Bird, Help AI, Pattern Sequence).
 */

const ArcadeManager = {
    // ─── Authentication & Tokens ──────────────────────────────────────────
    getAuthToken() {
        return localStorage.getItem('gb_token') || localStorage.getItem('token') || '';
    },

    // ─── Balance & Local Storage Synchronization ──────────────────────────
    syncBalances(cash, tokens) {
        if (cash !== undefined && cash !== null) {
            localStorage.setItem('gb_cash', cash.toString());
        }
        if (tokens !== undefined && tokens !== null) {
            localStorage.setItem('gb_tokens', tokens.toString());
        }
    },

    // ─── Attempt UI Updates ──────────────────────────────────────────────
    updateTriesUI(remainingAttempts, maxAttempts = 5, config = {}) {
        const displayStr = `${remainingAttempts} / ${maxAttempts}`;
        const triesDisplay = document.getElementById(config.triesDisplayId || 'tries-display');
        const modalTriesLeft = document.getElementById(config.modalTriesId || 'modal-tries-left');

        if (triesDisplay) triesDisplay.textContent = displayStr;
        if (modalTriesLeft) modalTriesLeft.textContent = displayStr;

        const resetBtn = document.getElementById(config.resetBtnId || 'reset-btn');
        const playAgainBtn = document.getElementById(config.playAgainBtnId || 'modal-play-again-btn');
        const warningEl = document.getElementById(config.warningElId || 'limit-warning');

        if (remainingAttempts <= 0) {
            if (resetBtn) {
                resetBtn.disabled = true;
                resetBtn.classList.add('opacity-50', 'cursor-not-allowed');
            }
            if (playAgainBtn) {
                playAgainBtn.disabled = true;
                playAgainBtn.classList.add('opacity-50', 'cursor-not-allowed');
            }
            if (warningEl) warningEl.classList.remove('hidden');
        } else {
            if (resetBtn) {
                resetBtn.disabled = false;
                resetBtn.classList.remove('opacity-50', 'cursor-not-allowed');
            }
            if (playAgainBtn) {
                playAgainBtn.disabled = false;
                playAgainBtn.classList.remove('opacity-50', 'cursor-not-allowed');
            }
            if (warningEl) warningEl.classList.add('hidden');
        }
    },

    // ─── Generic Status Fetching ──────────────────────────────────────────
    async fetchStatus(gameEndpoint, dateKey, attemptsKey) {
        const authToken = this.getAuthToken();
        const todayStr = new Date().toISOString().split('T')[0];

        if (authToken) {
            try {
                const res = await fetch(`/api/mini-games/${gameEndpoint}/status`, {
                    headers: { 'Authorization': `Bearer ${authToken}` }
                });
                const data = await res.json();
                if (data.success) {
                    return {
                        remainingAttempts: data.remainingAttempts,
                        attemptsToday: data.attemptsToday,
                        cash: data.cash
                    };
                }
            } catch (err) {
                console.warn(`[ArcadeManager] Status check error for ${gameEndpoint}:`, err);
            }
        }

        let attemptsToday = 0;
        const storedDate = localStorage.getItem(dateKey);
        if (storedDate !== todayStr) {
            localStorage.setItem(dateKey, todayStr);
            localStorage.setItem(attemptsKey, '0');
        } else {
            attemptsToday = parseInt(localStorage.getItem(attemptsKey) || '0', 10);
        }
        const remainingAttempts = Math.max(0, 5 - attemptsToday);
        return { remainingAttempts, attemptsToday };
    },

    // ─── Generic Reward Submission ────────────────────────────────────────
    async submitReward(gameEndpoint, payload, dateKey, attemptsKey) {
        const authToken = this.getAuthToken();
        const todayStr = new Date().toISOString().split('T')[0];

        if (authToken) {
            try {
                const res = await fetch(`/api/mini-games/${gameEndpoint}/submit-reward`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${authToken}`
                    },
                    body: JSON.stringify(payload)
                });
                const data = await res.json();
                if (data.success) {
                    this.syncBalances(data.newCashBalance, data.newTokensBalance);
                    return {
                        success: true,
                        remainingAttempts: data.remainingAttempts,
                        attemptsToday: data.attemptsToday,
                        tokensEarned: data.tokensEarned,
                        cashEarned: data.cashEarned
                    };
                }
            } catch (err) {
                console.error(`[ArcadeManager] Reward submit error for ${gameEndpoint}:`, err);
            }
        }

        // Local fallback for guest users
        let attemptsToday = parseInt(localStorage.getItem(attemptsKey) || '0', 10) + 1;
        localStorage.setItem(dateKey, todayStr);
        localStorage.setItem(attemptsKey, attemptsToday.toString());
        const remainingAttempts = Math.max(0, 5 - attemptsToday);

        return {
            success: false,
            guestFallback: true,
            remainingAttempts,
            attemptsToday
        };
    },

    // ─── Tic Tac Toe Engine ────────────────────────────────────────────────
    TicTacToe: {
        WINNING_COMBOS: [
            [0, 1, 2], [3, 4, 5], [6, 7, 8],
            [0, 3, 6], [1, 4, 7], [2, 5, 8],
            [0, 4, 8], [2, 4, 6]
        ],

        checkWin(board, symbol) {
            for (let combo of this.WINNING_COMBOS) {
                if (combo.every(idx => board[idx] === symbol)) {
                    return combo;
                }
            }
            return null;
        },

        checkDraw(board) {
            return board.every(cell => cell !== null);
        },

        /**
         * Human-like AI bot with customizable inaccuracy rate
         * @param {Array} board 9-length array
         * @param {Object} options inaccuracy rates
         */
        getSmartAIMove(board, options = {}) {
            const winTakeChance = options.winTakeChance || 0.75;
            const blockChance = options.blockChance || 0.50;
            const tacticalChance = options.tacticalChance || 0.50;

            const openIndices = board.map((val, idx) => val === null ? idx : null).filter(val => val !== null);
            if (openIndices.length === 0) return -1;

            // 1. Instant Win Check
            if (Math.random() < winTakeChance) {
                for (let i of openIndices) {
                    board[i] = 'O';
                    if (this.checkWin(board, 'O')) {
                        board[i] = null;
                        return i;
                    }
                    board[i] = null;
                }
            }

            // 2. Human Block Check (Imperfect 50% block rate)
            if (Math.random() < blockChance) {
                for (let i of openIndices) {
                    board[i] = 'X';
                    if (this.checkWin(board, 'X')) {
                        board[i] = null;
                        return i;
                    }
                    board[i] = null;
                }
            }

            // 3. Tactical Center/Corners
            if (Math.random() < tacticalChance) {
                if (board[4] === null && Math.random() < tacticalChance) return 4;

                const corners = [0, 2, 6, 8].filter(i => board[i] === null);
                if (corners.length > 0 && Math.random() < tacticalChance) {
                    return corners[Math.floor(Math.random() * corners.length)];
                }
            }

            // 4. Casual Random Spot
            return openIndices[Math.floor(Math.random() * openIndices.length)];
        }
    },

    // ─── Pattern Sequence Engine ──────────────────────────────────────────
    PatternSequence: {
        EASY_PATTERNS: [
            {
                ruleName: 'Arithmetic Addition (+Step)',
                generate: () => {
                    const step = Math.floor(Math.random() * 5) + 3;
                    const start = Math.floor(Math.random() * 10) + 2;
                    const full = [0, 1, 2, 3, 4, 5].map(i => start + i * step);
                    return { full, ruleName: `Arithmetic Addition (+${step})` };
                }
            },
            {
                ruleName: 'Doubling Powers (2ⁿ)',
                generate: () => {
                    const startPower = Math.floor(Math.random() * 2) + 1;
                    const full = [0, 1, 2, 3, 4, 5].map(i => Math.pow(2, startPower + i));
                    return { full };
                }
            },
            {
                ruleName: 'Square Numbers (n²)',
                generate: () => {
                    const start = Math.floor(Math.random() * 3) + 1;
                    const full = [start, start + 1, start + 2, start + 3, start + 4, start + 5].map(n => n * n);
                    return { full };
                }
            }
        ],

        MEDIUM_PATTERNS: [
            {
                ruleName: 'Fibonacci Addition (n = n1 + n2)',
                generate: () => {
                    const a = Math.floor(Math.random() * 3) + 1;
                    const b = a + 1;
                    const full = [a, b];
                    for (let i = 2; i < 6; i++) {
                        full.push(full[i - 1] + full[i - 2]);
                    }
                    return { full };
                }
            },
            {
                ruleName: 'Cube Numbers (n³)',
                generate: () => {
                    const full = [1, 2, 3, 4, 5, 6].map(n => n * n * n);
                    return { full };
                }
            },
            {
                ruleName: 'Triangular Numbers [n(n+1)/2]',
                generate: () => {
                    const offset = Math.floor(Math.random() * 3) + 1;
                    const full = [0, 1, 2, 3, 4, 5].map(i => {
                        const n = offset + i;
                        return (n * (n + 1)) / 2;
                    });
                    return { full };
                }
            },
            {
                ruleName: 'Prime Numbers Sequence',
                generate: () => {
                    const primes = [2, 3, 5, 7, 11, 13, 17, 19, 23, 29, 31];
                    const startIdx = Math.floor(Math.random() * 4);
                    const full = primes.slice(startIdx, startIdx + 6);
                    return { full };
                }
            }
        ],

        HARD_PATTERNS: [
            {
                ruleName: 'Koch Snowflake Segments (3 × 4ⁿ)',
                generate: () => {
                    const full = [0, 1, 2, 3, 4, 5].map(n => 3 * Math.pow(4, n));
                    return { full };
                }
            },
            {
                ruleName: 'Pentagonal Numbers [(3n² - n)/2]',
                generate: () => {
                    const full = [1, 2, 3, 4, 5, 6].map(n => (3 * n * n - n) / 2);
                    return { full };
                }
            },
            {
                ruleName: 'Catalan Combinatorics [C(n)]',
                generate: () => {
                    const full = [1, 2, 5, 14, 42, 132];
                    return { full };
                }
            },
            {
                ruleName: 'Collatz Conjecture Step (3n + 1 / 2)',
                generate: () => {
                    const full = [7, 22, 11, 34, 17, 52];
                    return { full };
                }
            }
        ],

        getRandomItem(arr) {
            return arr[Math.floor(Math.random() * arr.length)];
        },

        buildDeckForDifficulty(diff) {
            if (diff === 'EASY') {
                return Array(5).fill(null).map(() => this.getRandomItem(this.EASY_PATTERNS));
            } else if (diff === 'MEDIUM') {
                return [
                    this.getRandomItem(this.EASY_PATTERNS),
                    this.getRandomItem(this.EASY_PATTERNS),
                    this.getRandomItem(this.MEDIUM_PATTERNS),
                    this.getRandomItem(this.MEDIUM_PATTERNS),
                    this.getRandomItem(this.MEDIUM_PATTERNS)
                ];
            } else {
                return [
                    this.getRandomItem(this.EASY_PATTERNS),
                    this.getRandomItem(this.MEDIUM_PATTERNS),
                    this.getRandomItem(this.HARD_PATTERNS),
                    this.getRandomItem(this.HARD_PATTERNS),
                    this.getRandomItem(this.HARD_PATTERNS)
                ];
            }
        }
    }
};

// ─── Web Audio SFX Synthesizer Module ────────────────────────────────────
const ArcadeAudio = {
    ctx: null,
    muted: false,

    init() {
        if (!this.ctx) {
            const AudioContext = window.AudioContext || window.webkitAudioContext;
            if (AudioContext) this.ctx = new AudioContext();
        }
        if (this.ctx && this.ctx.state === 'suspended') {
            this.ctx.resume();
        }
    },

    // Tap / Click Sound (short soft pop)
    playClick() {
        if (this.muted) return;
        this.init();
        if (!this.ctx) return;
        try {
            const osc = this.ctx.createOscillator();
            const gain = this.ctx.createGain();
            osc.type = 'sine';
            osc.frequency.setValueAtTime(440, this.ctx.currentTime);
            osc.frequency.exponentialRampToValueAtTime(880, this.ctx.currentTime + 0.05);
            gain.gain.setValueAtTime(0.15, this.ctx.currentTime);
            gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + 0.05);
            osc.connect(gain);
            gain.connect(this.ctx.destination);
            osc.start();
            osc.stop(this.ctx.currentTime + 0.05);
        } catch (e) { }
    },

    // Flap / Jump Sound (ascending sweep)
    playJump() {
        if (this.muted) return;
        this.init();
        if (!this.ctx) return;
        try {
            const osc = this.ctx.createOscillator();
            const gain = this.ctx.createGain();
            osc.type = 'sine';
            osc.frequency.setValueAtTime(160, this.ctx.currentTime);
            osc.frequency.exponentialRampToValueAtTime(580, this.ctx.currentTime + 0.1);
            gain.gain.setValueAtTime(0.2, this.ctx.currentTime);
            gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + 0.1);
            osc.connect(gain);
            gain.connect(this.ctx.destination);
            osc.start();
            osc.stop(this.ctx.currentTime + 0.1);
        } catch (e) { }
    },

    // Score / Point Sound (high ping chime)
    playScore() {
        if (this.muted) return;
        this.init();
        if (!this.ctx) return;
        try {
            const osc = this.ctx.createOscillator();
            const gain = this.ctx.createGain();
            osc.type = 'triangle';
            osc.frequency.setValueAtTime(523.25, this.ctx.currentTime); // C5
            osc.frequency.setValueAtTime(659.25, this.ctx.currentTime + 0.06); // E5
            gain.gain.setValueAtTime(0.2, this.ctx.currentTime);
            gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + 0.18);
            osc.connect(gain);
            gain.connect(this.ctx.destination);
            osc.start();
            osc.stop(this.ctx.currentTime + 0.18);
        } catch (e) { }
    },

    // Win Fanfare (triumphant chord sequence)
    playWin() {
        if (this.muted) return;
        this.init();
        if (!this.ctx) return;
        try {
            const notes = [523.25, 659.25, 783.99, 1046.50]; // C5, E5, G5, C6
            notes.forEach((freq, idx) => {
                const osc = this.ctx.createOscillator();
                const gain = this.ctx.createGain();
                osc.type = 'triangle';
                osc.frequency.setValueAtTime(freq, this.ctx.currentTime + idx * 0.08);
                gain.gain.setValueAtTime(0, this.ctx.currentTime + idx * 0.08);
                gain.gain.linearRampToValueAtTime(0.25, this.ctx.currentTime + idx * 0.08 + 0.02);
                gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + idx * 0.08 + 0.35);
                osc.connect(gain);
                gain.connect(this.ctx.destination);
                osc.start(this.ctx.currentTime + idx * 0.08);
                osc.stop(this.ctx.currentTime + idx * 0.08 + 0.35);
            });
        } catch (e) { }
    },

    // Fail / Hit / Error Sound (low harsh buzz down)
    playError() {
        if (this.muted) return;
        this.init();
        if (!this.ctx) return;
        try {
            const osc = this.ctx.createOscillator();
            const gain = this.ctx.createGain();
            osc.type = 'sawtooth';
            osc.frequency.setValueAtTime(200, this.ctx.currentTime);
            osc.frequency.exponentialRampToValueAtTime(60, this.ctx.currentTime + 0.25);
            gain.gain.setValueAtTime(0.2, this.ctx.currentTime);
            gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + 0.25);
            osc.connect(gain);
            gain.connect(this.ctx.destination);
            osc.start();
            osc.stop(this.ctx.currentTime + 0.25);
        } catch (e) { }
    },

    // Connect Node Sound for Help AI (pleasant synth pulse)
    playConnect() {
        if (this.muted) return;
        this.init();
        if (!this.ctx) return;
        try {
            const osc = this.ctx.createOscillator();
            const gain = this.ctx.createGain();
            osc.type = 'sine';
            osc.frequency.setValueAtTime(587.33, this.ctx.currentTime); // D5
            osc.frequency.exponentialRampToValueAtTime(880, this.ctx.currentTime + 0.08);
            gain.gain.setValueAtTime(0.18, this.ctx.currentTime);
            gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + 0.1);
            osc.connect(gain);
            gain.connect(this.ctx.destination);
            osc.start();
            osc.stop(this.ctx.currentTime + 0.1);
        } catch (e) { }
    }
};

// Auto-initialize audio context on first user interaction
if (typeof window !== 'undefined') {
    ['click', 'touchstart', 'keydown'].forEach(evt => {
        window.addEventListener(evt, () => ArcadeAudio.init(), { once: true });
    });
}

// Global Exposure
window.ArcadeManager = ArcadeManager;
window.ArcadeAudio = ArcadeAudio;
