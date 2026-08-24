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
                id: 'arithmetic_add',
                ruleName: 'Arithmetic Addition (+Step)',
                generate: () => {
                    const step = Math.floor(Math.random() * 12) + 3;
                    const start = Math.floor(Math.random() * 45) + 5;
                    const full = [0, 1, 2, 3, 4, 5].map(i => start + i * step);
                    return { full, ruleName: `Arithmetic Addition (+${step})` };
                }
            },
            {
                id: 'arithmetic_sub',
                ruleName: 'Arithmetic Subtraction (-Step)',
                generate: () => {
                    const step = Math.floor(Math.random() * 10) + 4;
                    const start = Math.floor(Math.random() * 100) + 120;
                    const full = [0, 1, 2, 3, 4, 5].map(i => start - i * step);
                    return { full, ruleName: `Arithmetic Subtraction (-${step})` };
                }
            },
            {
                id: 'geometric_mult',
                ruleName: 'Geometric Multiplication (×Multiplier)',
                generate: () => {
                    const mult = Math.floor(Math.random() * 2) + 2;
                    const start = Math.floor(Math.random() * 6) + 2;
                    const full = [0, 1, 2, 3, 4, 5].map(i => start * Math.pow(mult, i));
                    return { full, ruleName: `Geometric Progression (×${mult})` };
                }
            },
            {
                id: 'square_numbers',
                ruleName: 'Square Numbers (n²)',
                generate: () => {
                    const start = Math.floor(Math.random() * 7) + 2;
                    const full = [start, start + 1, start + 2, start + 3, start + 4, start + 5].map(n => n * n);
                    return { full, ruleName: `Square Numbers (${start}² to ${start + 5}²)` };
                }
            },
            {
                id: 'alternating_step',
                ruleName: 'Alternating Add & Subtract (+A, -B)',
                generate: () => {
                    const add = Math.floor(Math.random() * 8) + 5;
                    const sub = Math.floor(Math.random() * 3) + 2;
                    let curr = Math.floor(Math.random() * 20) + 10;
                    const full = [curr];
                    for (let i = 1; i < 6; i++) {
                        curr += (i % 2 !== 0 ? add : -sub);
                        full.push(curr);
                    }
                    return { full, ruleName: `Alternating Step (+${add}, -${sub})` };
                }
            }
        ],

        MEDIUM_PATTERNS: [
            {
                id: 'fibonacci',
                ruleName: 'Fibonacci Sequence (n = n1 + n2)',
                generate: () => {
                    const a = Math.floor(Math.random() * 5) + 1;
                    const b = a + Math.floor(Math.random() * 3) + 1;
                    const full = [a, b];
                    for (let i = 2; i < 6; i++) {
                        full.push(full[i - 1] + full[i - 2]);
                    }
                    return { full, ruleName: `Fibonacci Addition (start: ${a}, ${b})` };
                }
            },
            {
                id: 'cube_numbers',
                ruleName: 'Cube Numbers (n³)',
                generate: () => {
                    const start = Math.floor(Math.random() * 4) + 1;
                    const full = [0, 1, 2, 3, 4, 5].map(i => Math.pow(start + i, 3));
                    return { full, ruleName: `Cube Sequence (${start}³ to ${start + 5}³)` };
                }
            },
            {
                id: 'triangular_numbers',
                ruleName: 'Triangular Numbers [n(n+1)/2]',
                generate: () => {
                    const offset = Math.floor(Math.random() * 5) + 1;
                    const full = [0, 1, 2, 3, 4, 5].map(i => {
                        const n = offset + i;
                        return (n * (n + 1)) / 2;
                    });
                    return { full, ruleName: `Triangular Formula [T(n)]` };
                }
            },
            {
                id: 'prime_sequence',
                ruleName: 'Prime Numbers Sequence',
                generate: () => {
                    const primes = [2, 3, 5, 7, 11, 13, 17, 19, 23, 29, 31, 37, 41, 43, 47, 53];
                    const startIdx = Math.floor(Math.random() * (primes.length - 6));
                    const full = primes.slice(startIdx, startIdx + 6);
                    return { full, ruleName: `Sequential Primes (${full[0]} to ${full[5]})` };
                }
            },
            {
                id: 'increasing_difference',
                ruleName: 'Accelerating Difference (+1, +2, +3...)',
                generate: () => {
                    const baseStep = Math.floor(Math.random() * 3) + 1;
                    let curr = Math.floor(Math.random() * 15) + 5;
                    const full = [curr];
                    for (let i = 1; i < 6; i++) {
                        curr += (baseStep + i - 1);
                        full.push(curr);
                    }
                    return { full, ruleName: `Accelerating Delta (+${baseStep}, +${baseStep + 1}...)` };
                }
            }
        ],

        HARD_PATTERNS: [
            {
                id: 'koch_snowflake',
                ruleName: 'Koch Snowflake Segments (3 × 4ⁿ)',
                generate: () => {
                    const full = [0, 1, 2, 3, 4, 5].map(n => 3 * Math.pow(4, n));
                    return { full, ruleName: 'Koch Snowflake Fractal Segments (3 × 4ⁿ)' };
                }
            },
            {
                id: 'pentagonal_numbers',
                ruleName: 'Pentagonal Numbers [(3n² - n)/2]',
                generate: () => {
                    const offset = Math.floor(Math.random() * 3) + 1;
                    const full = [0, 1, 2, 3, 4, 5].map(i => {
                        const n = offset + i;
                        return (3 * n * n - n) / 2;
                    });
                    return { full, ruleName: 'Pentagonal Figurate Series [(3n² - n)/2]' };
                }
            },
            {
                id: 'catalan_numbers',
                ruleName: 'Catalan Combinatorics [C(n)]',
                generate: () => {
                    const catalan = [1, 2, 5, 14, 42, 132, 429, 1430];
                    const startIdx = Math.floor(Math.random() * 3);
                    const full = catalan.slice(startIdx, startIdx + 6);
                    return { full, ruleName: 'Catalan Sequence C(n)' };
                }
            },
            {
                id: 'collatz_conjecture',
                ruleName: 'Collatz Conjecture Orbits',
                generate: () => {
                    const starts = [7, 11, 13, 15, 17, 19, 21, 23];
                    const start = starts[Math.floor(Math.random() * starts.length)];
                    let curr = start;
                    const full = [curr];
                    for (let i = 1; i < 6; i++) {
                        curr = (curr % 2 === 0) ? (curr / 2) : (3 * curr + 1);
                        full.push(curr);
                    }
                    return { full, ruleName: `Collatz Orbit (Start: ${start})` };
                }
            },
            {
                id: 'square_plus_n',
                ruleName: 'Polynomial Quad Series (n² + n)',
                generate: () => {
                    const offset = Math.floor(Math.random() * 4) + 1;
                    const full = [0, 1, 2, 3, 4, 5].map(i => {
                        const n = offset + i;
                        return n * n + n;
                    });
                    return { full, ruleName: 'Polynomial Quad Series (n² + n)' };
                }
            },
            {
                id: 'kaprekar_routine',
                ruleName: 'Kaprekar Routine (Desc - Asc)',
                generate: () => {
                    const validSeeds = [3524, 5291, 8314, 7129, 9412, 4218, 6312, 1982, 4832, 7351];
                    const seed = validSeeds[Math.floor(Math.random() * validSeeds.length)];

                    const stepKaprekar = (num) => {
                        let str = num.toString().padStart(4, '0');
                        let desc = parseInt(str.split('').sort((a, b) => b - a).join(''), 10);
                        let asc = parseInt(str.split('').sort((a, b) => a - b).join(''), 10);
                        return desc - asc;
                    };

                    let curr = seed;
                    const full = [curr];
                    for (let i = 1; i < 6; i++) {
                        curr = stepKaprekar(curr);
                        full.push(curr);
                    }
                    return { full, ruleName: `Kaprekar Routine (Start: ${seed})` };
                }
            }
        ],

        getRandomItem(arr) {
            return arr[Math.floor(Math.random() * arr.length)];
        },

        buildDeckForDifficulty(diff) {
            const allPatterns = [
                ...this.EASY_PATTERNS,
                ...this.MEDIUM_PATTERNS,
                ...this.HARD_PATTERNS
            ];

            let pool = [];
            if (diff === 'EASY') {
                pool = [...this.EASY_PATTERNS, ...this.MEDIUM_PATTERNS];
            } else if (diff === 'MEDIUM') {
                pool = [...this.EASY_PATTERNS, ...this.MEDIUM_PATTERNS, ...this.HARD_PATTERNS.slice(0, 2)];
            } else {
                pool = [...this.MEDIUM_PATTERNS, ...this.HARD_PATTERNS];
            }

            // Shuffle pool and select 5 strictly unique pattern instances/rules
            const shuffled = [...pool].sort(() => Math.random() - 0.5);
            const deck = [];
            const usedNames = new Set();

            for (const item of shuffled) {
                const name = item.id || item.ruleName;
                if (!usedNames.has(name)) {
                    usedNames.add(name);
                    deck.push(item);
                }
                if (deck.length === 5) break;
            }

            // Fallback safety if pool had fewer items
            while (deck.length < 5) {
                const randomItem = allPatterns[Math.floor(Math.random() * allPatterns.length)];
                const name = randomItem.id || randomItem.ruleName;
                if (!usedNames.has(name)) {
                    usedNames.add(name);
                    deck.push(randomItem);
                }
            }

            return deck;
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
