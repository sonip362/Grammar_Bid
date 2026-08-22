// ═══════════════════════════════════════════════════════════════
//  Grammar Bid — Auction Arena Client
// ═══════════════════════════════════════════════════════════════

// ── Auth Check ─────────────────────────────────────────────────
const token = localStorage.getItem('gb_token');
const userId = localStorage.getItem('gb_userId');
const myUsername = localStorage.getItem('gb_username');

if (!token || !userId) {
    window.location.href = 'login.html';
}

// ── Room Code from URL ─────────────────────────────────────────
const urlParams = new URLSearchParams(window.location.search);
const roomCode = urlParams.get('room');
if (!roomCode) {
    alert('No room code provided!');
    window.location.href = 'index.html';
}

// ── DOM References ─────────────────────────────────────────────
const headerCash = document.getElementById('header-cash');
const headerRound = document.getElementById('header-round');
const headerRoomCode = document.getElementById('header-room-code');
const hintBtn = document.getElementById('hint-btn');
const phaseLabel = document.getElementById('phase-label');
const phaseTimer = document.getElementById('phase-timer');
const phaseBanner = document.getElementById('phase-banner');
const sentenceTitle = document.getElementById('sentence-title');
const sentenceText = document.getElementById('sentence-text');
const categoryTag = document.getElementById('category-tag');
const varietyTag = document.getElementById('variety-tag');
const questionIdTag = document.getElementById('question-id-tag');
const explanationVariety = document.getElementById('explanation-variety');
const explanationQid = document.getElementById('explanation-qid');
const explanationReasoning = document.getElementById('explanation-reasoning');
const hintArea = document.getElementById('hint-area');
const hintText = document.getElementById('hint-text');
const rankingsList = document.getElementById('rankings-list');
const consoleHighestBid = document.getElementById('console-highest-bid');
const consoleTopBidder = document.getElementById('console-top-bidder');
const biddingControls = document.getElementById('bidding-controls');
const inspectionMessage = document.getElementById('inspection-message');
const bidInput = document.getElementById('bid-input');
const bidSubmitBtn = document.getElementById('bid-submit-btn');
const bidStatus = document.getElementById('bid-status');
const toast = document.getElementById('toast');
const toastText = document.getElementById('toast-text');

// Report System References
const reportBtn = document.getElementById('report-btn');
const reportModal = document.getElementById('report-modal');
const reportCloseBtn = document.getElementById('report-close-btn');
const reportReason = document.getElementById('report-reason');
const reportExplanation = document.getElementById('report-explanation');
const reportSubmitBtn = document.getElementById('report-submit-btn');
const reportError = document.getElementById('report-error');
const reportSuccess = document.getElementById('report-success');

// Inbox System References
const inboxBtn = document.getElementById('inbox-btn');
const inboxBadge = document.getElementById('inbox-badge');
const inboxModal = document.getElementById('inbox-modal');
const inboxCloseBtn = document.getElementById('inbox-close-btn');
const inboxMarkAllBtn = document.getElementById('inbox-mark-all-btn');
const inboxList = document.getElementById('inbox-list');

// Question Snapshot & Bid Tracking State
let currentQuestionSnapshot = null;
let myMatchBid = 0;

// Result overlay
const resultOverlay = document.getElementById('result-overlay');
const resultCard = document.getElementById('result-card');
const resultIcon = document.getElementById('result-icon');
const resultTitle = document.getElementById('result-title');
const resultVerdict = document.getElementById('result-verdict');
const resultSentence = document.getElementById('result-sentence');
const resultCorrection = document.getElementById('result-correction');
const resultCorrectionText = document.getElementById('result-correction-text');
const resultCashChange = document.getElementById('result-cash-change');
const resultWinner = document.getElementById('result-winner');
const resultExplanation = document.getElementById('result-explanation');

// Correction overlay
const correctionOverlay = document.getElementById('correction-overlay');
const correctionCard = document.getElementById('correction-card');
const correctionSentence = document.getElementById('correction-sentence');
const correctionInput = document.getElementById('correction-input');
const correctionSubmitBtn = document.getElementById('correction-submit-btn');
const correctionFeedback = document.getElementById('correction-feedback');
const correctionFeedbackText = document.getElementById('correction-feedback-text');
const correctionTimer = document.getElementById('correction-timer');

// Explanation overlay
const explanationOverlay = document.getElementById('explanation-overlay');
const explanationCard = document.getElementById('explanation-card');
const explanationCategory = document.getElementById('explanation-category');
const explanationOriginal = document.getElementById('explanation-original');
const explanationCorrect = document.getElementById('explanation-correct');
const explanationRule = document.getElementById('explanation-rule');
const explanationSubmissions = document.getElementById('explanation-submissions');

// Game over overlay
const gameoverOverlay = document.getElementById('gameover-overlay');
const gameoverCard = document.getElementById('gameover-card');
const gameoverWinnerName = document.getElementById('gameover-winner-name');
const gameoverWinnerCash = document.getElementById('gameover-winner-cash');
const gameoverStandings = document.getElementById('gameover-standings');
const gameoverRoundHistory = document.getElementById('gameover-round-history');

// ── SFX Sound Effects System ──────────────────────────────────
let sfxEnabled = localStorage.getItem('gb_sfx_enabled') !== 'false';

const sounds = {
    bid: new Audio('/SFX/bid.mp3'),
    outbid: new Audio('/SFX/outbid.mp3'),
    timer_tick: new Audio('/SFX/timer_tick.mp3'),
    win_cash: new Audio('/SFX/win_cash.mp3'),
    lose_cash: new Audio('/SFX/lose_cash.mp3'),
    hint: new Audio('/SFX/hint.mp3'),
    correct: new Audio('/SFX/correct.mp3'),
    error: new Audio('/SFX/error.mp3'),
    gameover: new Audio('/SFX/gameover.mp3'),
    bruh: new Audio('/SFX/bruh.mp3')
};

// Set volumes for harmonious mix
sounds.bid.volume = 0.35;
sounds.outbid.volume = 0.20;
sounds.timer_tick.volume = 0.35;
sounds.win_cash.volume = 0.7;
sounds.lose_cash.volume = 0.7;
sounds.hint.volume = 0.6;
sounds.correct.volume = 0.65;
sounds.error.volume = 0.55;
sounds.gameover.volume = 0.8;
sounds.bruh.volume = 0.75;

// Web Audio Ambient Tension Drone & Synthetic UI Pop
let audioCtx = null;
let ambientOsc = null;
let ambientGain = null;

function getAudioContext() {
    if (!audioCtx) {
        audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    }
    if (audioCtx.state === 'suspended') {
        audioCtx.resume().catch(() => { });
    }
    return audioCtx;
}

function startAmbientTension() {
    if (!sfxEnabled) return;
    try {
        const ctx = getAudioContext();
        if (ambientOsc) return;
        ambientOsc = ctx.createOscillator();
        ambientGain = ctx.createGain();

        ambientOsc.type = 'sine';
        ambientOsc.frequency.setValueAtTime(55, ctx.currentTime); // Low A note drone (55Hz)
        ambientGain.gain.setValueAtTime(0.015, ctx.currentTime);   // Soft ambient background

        ambientOsc.connect(ambientGain);
        ambientGain.connect(ctx.destination);
        ambientOsc.start();
    } catch (e) { }
}

function stopAmbientTension() {
    if (ambientOsc) {
        try {
            ambientOsc.stop();
            ambientOsc.disconnect();
        } catch (e) { }
        ambientOsc = null;
    }
}

// Synthetic Whoosh SFX when sentence appears
function playWhoosh() {
    if (!sfxEnabled) return;
    try {
        const ctx = getAudioContext();
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();

        osc.type = 'sine';
        osc.frequency.setValueAtTime(150, ctx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(600, ctx.currentTime + 0.12);
        osc.frequency.exponentialRampToValueAtTime(80, ctx.currentTime + 0.3);

        gain.gain.setValueAtTime(0.01, ctx.currentTime);
        gain.gain.linearRampToValueAtTime(0.25, ctx.currentTime + 0.1);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.3);

        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start();
        osc.stop(ctx.currentTime + 0.3);
    } catch (e) { }
}

// Synthetic 5ms micro UI Click/Pop (Zero Byte File)
function playUIPop() {
    if (!sfxEnabled) return;
    try {
        const ctx = getAudioContext();
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(800, ctx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(200, ctx.currentTime + 0.015);
        gain.gain.setValueAtTime(0.08, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.015);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start();
        osc.stop(ctx.currentTime + 0.015);
    } catch (e) { }
}

// Synthetic low warm pitch-drop bubble sound for floating emotes
function playEmoteSFX() {
    if (!sfxEnabled) return;
    try {
        const ctx = getAudioContext();
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();

        // Soft, warm pitch-drop bubble sound (340Hz -> 130Hz over 140ms)
        osc.type = 'sine';
        osc.frequency.setValueAtTime(340, ctx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(130, ctx.currentTime + 0.14);

        gain.gain.setValueAtTime(0.07, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.14);

        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start();
        osc.stop(ctx.currentTime + 0.14);
    } catch (e) { }
}

function playSFX(name, options = {}) {
    if (!sfxEnabled || !sounds[name]) return;
    try {
        const sound = sounds[name];
        sound.currentTime = 0;
        if (options.volume !== undefined) sound.volume = options.volume;
        if (options.playbackRate !== undefined) sound.playbackRate = options.playbackRate;
        sound.play().catch(() => { });
    } catch (e) {
        // Ignore audio play errors
    }
}

// SFX Mute/Unmute Toggle UI
const sfxToggleBtn = document.getElementById('sfx-toggle-btn');
const sfxSvgOn = document.getElementById('sfx-svg-on');
const sfxSvgOff = document.getElementById('sfx-svg-off');

function updateSFXToggleUI() {
    if (sfxSvgOn && sfxSvgOff) {
        if (sfxEnabled) {
            sfxSvgOn.classList.remove('hidden');
            sfxSvgOff.classList.add('hidden');
        } else {
            sfxSvgOn.classList.add('hidden');
            sfxSvgOff.classList.remove('hidden');
        }
    }
    if (sfxToggleBtn) {
        if (sfxEnabled) {
            sfxToggleBtn.classList.remove('opacity-50', 'bg-rose-500/20', 'border-rose-500/40');
            sfxToggleBtn.classList.add('bg-white/10', 'border-white/20');
        } else {
            sfxToggleBtn.classList.add('opacity-50', 'bg-rose-500/20', 'border-rose-500/40');
            sfxToggleBtn.classList.remove('bg-white/10', 'border-white/20');
        }
    }
}

if (sfxToggleBtn) {
    updateSFXToggleUI();
    sfxToggleBtn.addEventListener('click', () => {
        sfxEnabled = !sfxEnabled;
        localStorage.setItem('gb_sfx_enabled', sfxEnabled);
        updateSFXToggleUI();
        if (sfxEnabled) {
            playSFX('bid');
            startAmbientTension();
        } else {
            stopAmbientTension();
        }
    });
}

// ── Custom Glassmorphism Leave Match Modal ─────────────────────
const leaveMatchBtn = document.getElementById('leave-match-btn');
const leaveModal = document.getElementById('leave-modal');
const leaveCard = document.getElementById('leave-card');
const leaveModalCancelBtn = document.getElementById('leave-modal-cancel-btn');
const leaveModalConfirmBtn = document.getElementById('leave-modal-confirm-btn');

if (leaveMatchBtn && leaveModal && leaveCard) {
    leaveMatchBtn.addEventListener('click', () => {
        showOverlay(leaveModal, leaveCard);
    });

    if (leaveModalCancelBtn) {
        leaveModalCancelBtn.addEventListener('click', () => {
            hideOverlay(leaveModal, leaveCard);
        });
    }

    if (leaveModalConfirmBtn) {
        leaveModalConfirmBtn.addEventListener('click', () => {
            socket.emit('leave_room', { roomCode, userId });
            window.location.href = 'index.html';
        });
    }

    // Close on backdrop click
    leaveModal.addEventListener('click', (e) => {
        if (e.target === leaveModal) {
            hideOverlay(leaveModal, leaveCard);
        }
    });
}

// ── Game State ─────────────────────────────────────────────────
let currentPhase = 'waiting';
let myCash = parseInt(localStorage.getItem('gb_cash') || '10000');
let currentHighestBid = 0;
let currentTopBidder = null;
let hintBought = false;
let correctionSubmitted = false;
let players = [];
let isDisconnected = false;

// Reconnect Overlay Elements
const reconnectOverlay = document.getElementById('reconnect-overlay');
const reconnectSpinner = document.getElementById('reconnect-spinner');
const reconnectFailedIcon = document.getElementById('reconnect-failed-icon');
const reconnectTitle = document.getElementById('reconnect-title');
const reconnectMsg = document.getElementById('reconnect-msg');
const reconnectActions = document.getElementById('reconnect-actions');
const reconnectRetryBtn = document.getElementById('reconnect-retry-btn');

// ── Socket Connection & Auto-Reconnect ─────────────────────────
const socket = io({
    reconnection: true,
    reconnectionAttempts: 15,
    reconnectionDelay: 1000,
    timeout: 30000
});

if (window.powerCardsUI) {
    window.powerCardsUI.init(socket);
}

// Set room code in header
if (headerRoomCode) headerRoomCode.textContent = roomCode;

// ── Utility Functions ──────────────────────────────────────────
function formatCash(amount) {
    return '$' + Number(amount).toLocaleString('en-US');
}

// ── Multi-Toast Stacking Container (Mobile Above Bidding Area + Desktop Top-Right) ───
function getOrCreateToastContainer() {
    let container = document.getElementById('toast-container');
    if (!container) {
        container = document.createElement('div');
        container.id = 'toast-container';
        // Mobile (<768px): fixed bottom-48 left-3 right-3 (above bidding console)
        // Desktop (>=768px): fixed top-20 right-6
        container.className = 'fixed bottom-48 left-3 right-3 md:bottom-auto md:top-20 md:left-auto md:right-6 z-50 flex flex-col items-center md:items-end gap-2 pointer-events-none max-w-sm mx-auto md:mx-0 w-full overflow-hidden';
        document.body.appendChild(container);
    }
    return container;
}

function showToast(message, icon = '📋', duration = 3500) {
    const container = getOrCreateToastContainer();

    // Mobile: max 2 toasts; Desktop: max 3 toasts
    const maxToasts = window.innerWidth < 768 ? 2 : 3;
    while (container.children.length >= maxToasts) {
        const oldest = container.firstChild;
        if (oldest) oldest.remove();
    }

    const toastEl = document.createElement('div');
    toastEl.className = 'bg-slate-950/95 text-white border border-amber-500/40 px-4 py-2.5 rounded-2xl shadow-[0_10px_30px_rgba(0,0,0,0.85)] backdrop-blur-xl transform translate-x-full opacity-0 transition-all duration-400 ease-out flex items-center gap-2.5 pointer-events-auto select-none max-w-full';

    toastEl.innerHTML = `<span class="font-serif italic text-xs sm:text-sm text-white/95">${icon ? icon + ' ' : ''}${message}</span>`;

    container.appendChild(toastEl);

    // Slide IN from RIGHT
    requestAnimationFrame(() => {
        toastEl.classList.remove('translate-x-full', 'opacity-0');
        toastEl.classList.add('translate-x-0', 'opacity-100');
    });

    // Auto Slide OUT to LEFT after duration
    setTimeout(() => {
        toastEl.classList.remove('translate-x-0', 'opacity-100');
        toastEl.classList.add('-translate-x-full', 'opacity-0');
        setTimeout(() => {
            if (toastEl.parentNode) toastEl.remove();
        }, 400);
    }, duration);
}

function updateCashDisplay() {
    headerCash.textContent = formatCash(myCash);
    headerCash.classList.remove('text-emerald-300', 'text-rose-400');
    headerCash.classList.add(myCash >= 0 ? 'text-emerald-300' : 'text-rose-400');
}

function showOverlay(overlay, card) {
    overlay.classList.remove('hidden');
    setTimeout(() => {
        overlay.classList.remove('opacity-0');
        card.classList.remove('scale-95');
        card.classList.add('scale-100');
    }, 10);
}

function hideOverlay(overlay, card) {
    overlay.classList.add('opacity-0');
    card.classList.remove('scale-100');
    card.classList.add('scale-95');
    setTimeout(() => overlay.classList.add('hidden'), 300);
}

function renderRankings(playerList) {
    if (!playerList || !rankingsList) return;
    players = playerList;

    // Sort by cash descending
    const sorted = [...playerList].sort((a, b) => b.cash - a.cash);
    const medals = ['🥇', '🥈', '🥉', '🎖️'];

    rankingsList.innerHTML = sorted.map((p, i) => {
        const isMe = p.userId === userId;
        const isTopBidder = currentTopBidder && p.socketId === currentTopBidder.socketId;
        const borderClass = isMe
            ? 'border-2 border-emerald-400/80 bg-emerald-500/10 shadow-[0_0_20px_rgba(52,211,153,0.3)]'
            : p.isBoss
                ? 'border border-amber-500/60 bg-amber-500/10 shadow-[0_0_20px_rgba(245,158,11,0.25)]'
                : 'border border-transparent hover:border-white/10 hover:bg-white/5';
        const topBidIndicator = isTopBidder
            ? '<span class="ml-1 text-[10px] bg-amber-500/20 text-amber-300 px-1.5 py-0.5 rounded-full font-sans font-bold">TOP BID</span>'
            : '';
        const bossTag = p.isBoss
            ? '<span class="ml-1 text-[10px] bg-amber-500/30 text-amber-300 border border-amber-500/50 px-1.5 py-0.5 rounded-md font-sans font-extrabold tracking-wider uppercase shadow-[0_0_10px_rgba(245,158,11,0.3)] animate-pulse">👑 BOSS</span>'
            : '';

        return `
            <div data-user-id="${p.userId}" class="flex items-center justify-between py-2 px-3 rounded-xl transition-all ${borderClass}">
                <div class="flex items-center gap-2.5 overflow-hidden mr-2">
                    <span class="text-lg drop-shadow shrink-0">${medals[i] || `#${i + 1}`}</span>
                    <span class="font-serif text-base text-white ${isMe ? 'font-bold' : ''} tracking-wide truncate">
                        ${p.username}${isMe ? ' <span class="text-emerald-300 text-xs">(You)</span>' : ''}${bossTag}${topBidIndicator}
                    </span>
                </div>
                <span class="font-sans text-lg ${isMe ? 'text-emerald-300' : p.isBoss ? 'text-amber-300 font-extrabold' : 'text-white/90'} font-bold tracking-tight shrink-0">
                    ${formatCash(p.cash)}
                </span>
            </div>
        `;
    }).join('');
}

// Auto-refresh Live Rankings UI every 5 seconds
setInterval(() => {
    if (players && players.length > 0) {
        renderRankings(players);
    }
}, 5000);

function updateMyPlayerCash(playerList) {
    const me = playerList.find(p => p.userId === userId);
    if (me) {
        myCash = me.cash;
        updateCashDisplay();
        localStorage.setItem('gb_cash', myCash);
    }
}

function setPhase(phase, timerValue) {
    currentPhase = phase;
    phaseTimer.textContent = timerValue;
    phaseTimer.classList.remove('text-rose-400', 'timer-urgent');

    const consoleBidSummary = document.getElementById('console-bid-summary');

    switch (phase) {
        case 'inspection':
            phaseLabel.textContent = '🔍 INSPECTION PHASE';
            phaseBanner.className = phaseBanner.className.replace(/border-b border-\S+/g, 'border-b border-cyan-500/30');
            phaseBanner.style.background = 'rgba(6, 78, 97, 0.4)';
            biddingControls.classList.add('hidden');
            if (consoleBidSummary) consoleBidSummary.classList.add('hidden');
            inspectionMessage.classList.remove('hidden');
            bidStatus.textContent = '';
            break;
        case 'bidding':
            phaseLabel.textContent = '💰 BIDDING PHASE';
            phaseBanner.className = phaseBanner.className.replace(/border-b border-\S+/g, 'border-b border-amber-500/30');
            phaseBanner.style.background = 'rgba(120, 80, 10, 0.4)';
            biddingControls.classList.remove('hidden');
            if (consoleBidSummary) consoleBidSummary.classList.remove('hidden');
            inspectionMessage.classList.add('hidden');
            updateBidButtonState();
            break;
        case 'correction':
            phaseLabel.textContent = '✏️ CORRECTION PHASE';
            phaseBanner.style.background = 'rgba(120, 50, 10, 0.4)';
            break;
        case 'resolution':
            phaseLabel.textContent = '📊 RESULTS';
            phaseBanner.style.background = 'rgba(40, 40, 60, 0.6)';
            break;
        case 'game_over':
            phaseLabel.textContent = '🏆 GAME OVER';
            phaseBanner.style.background = 'rgba(120, 80, 10, 0.6)';
            break;
    }
}

function updateBidButtonState() {
    // Disable BID button if player is current top bidder
    const isTopBidder = currentTopBidder && currentTopBidder.userId === userId;
    if (isTopBidder) {
        bidSubmitBtn.disabled = true;
        bidSubmitBtn.textContent = 'YOU LEAD';
        bidStatus.textContent = 'You are the top bidder — wait for others.';
        bidStatus.className = 'text-xs font-sans text-center text-emerald-300/80 italic h-4';
    } else {
        bidSubmitBtn.disabled = false;
        bidSubmitBtn.textContent = 'BID';
        bidStatus.textContent = '';
        bidStatus.className = 'text-xs font-sans text-center text-white/50 italic h-4';
    }
}

// ═══════════════════════════════════════════════════════════════
//  Socket Event Listeners
// ═══════════════════════════════════════════════════════════════

// ── Connection Events ──────────────────────────────────────────
socket.on('join_success', ({ room }) => {
    console.log('Joined game room:', room.code);
    if (room.players) {
        renderRankings(room.players);
        updateMyPlayerCash(room.players);
    }
});

socket.on('join_error', ({ message }) => {
    showToast(message, '⚠️', 4000);
    setTimeout(() => { window.location.href = 'index.html'; }, 3000);
});

socket.on('player_left', ({ username }) => {
    if (username) {
        showToast(`${username} left the match`, '🚪', 3000);
        players = players.filter(p => p.username !== username);
        renderRankings(players);
    }
});

socket.on('lobby_updated', ({ room }) => {
    if (room && room.players) {
        players = room.players;
        renderRankings(players);
        updateMyPlayerCash(players);
    }
});

// ── Full Game State Sync (Handles Latency, Slow Page Load & Reconnects) ──
socket.on('sync_game_state', (data) => {
    console.log('🔄 Synced game state from server:', data);
    if (!data || !data.status || data.status === 'lobby') return;

    if (data.currentRound && data.totalRounds) {
        if (headerRound) headerRound.textContent = `${data.currentRound}/${data.totalRounds}`;
        sentenceTitle.textContent = `Lot ${data.currentRound}`;
    }

    if (data.sentence) {
        sentenceText.textContent = `"${data.sentence}"`;
    }

    if (data.category && categoryTag) {
        categoryTag.textContent = data.category;
    }

    if (varietyTag && data.englishVariety) {
        varietyTag.textContent = `🌐 ${data.englishVariety}`;
    }

    if (questionIdTag && data.questionId) {
        questionIdTag.textContent = data.questionId;
        questionIdTag.setAttribute('data-question-id', data.questionId);
    }

    if (data.highestBid !== undefined) {
        currentHighestBid = data.highestBid;
        consoleHighestBid.textContent = formatCash(data.highestBid);
    }

    if (data.topBidder) {
        currentTopBidder = data.topBidder;
        consoleTopBidder.textContent = data.topBidder.username;
    } else {
        consoleTopBidder.textContent = 'None';
    }

    if (data.players) {
        renderRankings(data.players);
        updateMyPlayerCash(data.players);
    }

    // Compute remaining time from server deadline if provided
    let effectiveTimer = data.timer;
    if (data.deadline) {
        effectiveTimer = Math.max(0, Math.ceil((data.deadline - Date.now()) / 1000));
    }

    // Hide reconnect overlay once state is successfully synced
    if (isDisconnected) {
        isDisconnected = false;
        if (reconnectOverlay) reconnectOverlay.classList.add('hidden');
        showToast('Reconnected to match!', '✅', 3000);
    }

    // Restore active UI phase matching server status
    if (data.status === 'inspection') {
        setPhase('inspection', effectiveTimer);
    } else if (data.status === 'bidding') {
        setPhase('bidding', effectiveTimer);
    } else if (data.status === 'correction') {
        setPhase('correction', effectiveTimer);
        if (data.sentence && data.flawedPhrase) {
            const escaped = data.flawedPhrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            const regex = new RegExp(`(${escaped})`, 'gi');
            const highlighted = data.sentence.replace(regex, `<span class="inline-block px-1.5 py-0.5 rounded bg-rose-500/30 text-rose-200 border border-rose-400/60 animate-pulse font-bold tracking-wide shadow-[0_0_10px_rgba(244,63,94,0.4)]">$1</span>`);
            correctionSentence.innerHTML = `"${highlighted}"`;
            correctionInput.placeholder = `Type the fix for "${data.flawedPhrase}"...`;
        } else if (data.sentence) {
            correctionSentence.textContent = `"${data.sentence}"`;
            correctionInput.placeholder = 'Type the correction...';
        }
        showOverlay(correctionOverlay, correctionCard);
    } else if (data.status === 'game_over') {
        setPhase('game_over', '🏆');
    }
});

// ── Round Start (Inspection Phase) ─────────────────────────────
socket.on('round_start', (data) => {
    console.log(`Round ${data.round}/${data.totalRounds} starting`);

    // Reset round state
    currentHighestBid = 0;
    currentTopBidder = null;
    hintBought = false;
    correctionSubmitted = false;
    myMatchBid = 0;

    // Snapshot played question for audit/reporting
    currentQuestionSnapshot = {
        questionId: data.questionId || `q_${Date.now()}`,
        sentence: data.sentence,
        category: data.category,
        englishVariety: data.englishVariety || 'General / International English',
        validationReasoning: data.validationReasoning || null,
        roundNumber: data.round,
        isCorrect: null,
        correction: null,
        flawedPhrase: null,
        correctPhrase: null,
        hintText: null
    };

    if (reportBtn) reportBtn.classList.remove('hidden');

    // Update UI
    if (headerRound) headerRound.textContent = `${data.round}/${data.totalRounds}`;
    sentenceTitle.textContent = `Lot ${data.round}`;
    sentenceText.textContent = `"${data.sentence}"`;
    categoryTag.textContent = data.category;
    if (varietyTag) varietyTag.textContent = `🌐 ${data.englishVariety || 'General English'}`;
    if (questionIdTag) {
        questionIdTag.textContent = data.questionId || '---';
        questionIdTag.setAttribute('data-question-id', data.questionId || '---');
    }
    consoleHighestBid.textContent = '$0';
    consoleTopBidder.textContent = 'None';
    bidInput.value = '';

    // Reset hint
    hintArea.classList.add('hidden');
    hintBtn.disabled = false;
    hintBtn.classList.remove('opacity-40');

    // Hide overlays
    hideOverlay(resultOverlay, resultCard);
    hideOverlay(correctionOverlay, correctionCard);
    if (explanationOverlay && explanationCard) hideOverlay(explanationOverlay, explanationCard);

    // Set inspection phase
    setPhase('inspection', data.timer);

    // Play sentence whoosh SFX & start ambient tension drone
    playWhoosh();
    startAmbientTension();

    // Render players
    if (data.players) {
        renderRankings(data.players);
        updateMyPlayerCash(data.players);
    }

    showToast(`Round ${data.round} — Inspect the sentence!`, '📜', 2000);
});

// ── Bidding Phase Start ────────────────────────────────────────
socket.on('bidding_start', (data) => {
    console.log('Bidding phase started');
    currentHighestBid = data.highestBid || 0;
    currentTopBidder = data.topBidder || null;
    setPhase('bidding', data.timer);
    showToast('Bidding is now open!', '💰', 2000);
});

// ── Timer Tick ─────────────────────────────────────────────────
socket.on('timer_tick', ({ timer, phase }) => {
    phaseTimer.textContent = timer;

    // Graduated timer tick audio logic
    if (timer <= 5 && timer > 0) {
        // Urgent Emergency Ticking (<=5s)
        phaseTimer.classList.add('text-rose-400');
        playSFX('timer_tick', { volume: 0.6, playbackRate: 1.25 });
        if (timer <= 3) {
            phaseTimer.classList.add('timer-urgent');
        }
    } else if (timer >= 6 && timer <= 15) {
        // Soft Low Pulse (6s to 15s)
        phaseTimer.classList.remove('text-rose-400', 'timer-urgent');
        playSFX('timer_tick', { volume: 0.15, playbackRate: 0.85 });
    } else {
        phaseTimer.classList.remove('text-rose-400', 'timer-urgent');
    }

    // Update correction timer if in correction modal
    if (phase === 'correction' && correctionTimer) {
        correctionTimer.textContent = timer;
    }
});

// ── Bid Update ─────────────────────────────────────────────────
socket.on('bid_update', (data) => {
    // Reject bid updates intended for other rooms
    if (data.roomCode && data.roomCode !== roomCode) {
        console.warn(`[Security] Ignored cross-room bid update from room ${data.roomCode}`);
        return;
    }

    // Validate bidder is a member of current room's player list
    if (data.topBidder && data.topBidder.userId) {
        const isMember = players.some(p => p.userId === data.topBidder.userId);
        if (!isMember) {
            console.warn(`[Security] Suppressed bid notification from unlisted player: ${data.topBidder.username}`);
            return;
        }
    }

    currentHighestBid = data.highestBid;
    currentTopBidder = data.topBidder;

    consoleHighestBid.textContent = formatCash(data.highestBid);
    if (data.topBidder) {
        if (data.topBidder.isBoss) {
            consoleTopBidder.innerHTML = `${data.topBidder.username} <span class="text-[10px] bg-amber-500/30 text-amber-300 border border-amber-500/50 px-1.5 py-0.5 rounded-md font-extrabold uppercase shadow-[0_0_8px_rgba(245,158,11,0.3)] animate-pulse">👑 BOSS</span>`;
        } else {
            consoleTopBidder.textContent = data.topBidder.username;
        }
    } else {
        consoleTopBidder.textContent = 'None';
    }

    // Play bid SFX or outbid SFX
    if (data.topBidder && data.topBidder.userId === userId) {
        myMatchBid = data.highestBid;
        playSFX('bid');
    } else {
        playSFX('outbid');
    }

    // Flash effect
    consoleHighestBid.classList.add('text-amber-400');
    setTimeout(() => consoleHighestBid.classList.remove('text-amber-400'), 500);

    // Update bid button state
    updateBidButtonState();

    // Re-render rankings to show top bidder indicator
    renderRankings(players);

    // Update timer if anti-sniping extended it
    if (data.timer) {
        phaseTimer.textContent = data.timer;
    }
});

// ── Hint Revealed ──────────────────────────────────────────────
socket.on('hint_revealed', (data) => {
    hintBought = true;
    hintArea.classList.remove('hidden');
    hintText.textContent = data.hintText;
    myCash = data.newCash;
    updateCashDisplay();
    hintBtn.disabled = true;
    hintBtn.classList.add('opacity-40');
    playSFX('hint');
    showToast('Hint revealed! (-$300)', '💡', 2000);
});

socket.on('hint_error', ({ message }) => {
    showToast(message, '⚠️', 3000);
});

// ── Bid Errors ─────────────────────────────────────────────────
socket.on('bid_error', ({ message }) => {
    bidStatus.textContent = message;
    bidStatus.className = 'text-xs font-sans text-center text-rose-400 italic h-4';
    setTimeout(() => {
        bidStatus.textContent = '';
        bidStatus.className = 'text-xs font-sans text-center text-white/50 italic h-4';
    }, 3000);
});

// ── Players Updated (cash changes) ────────────────────────────
socket.on('players_updated', ({ players: updatedPlayers }) => {
    renderRankings(updatedPlayers);
    updateMyPlayerCash(updatedPlayers);
});

// ── Round Result ───────────────────────────────────────────────
socket.on('round_result', (data) => {
    console.log('Round result:', data);
    setPhase('resolution', '--');
    stopAmbientTension();

    // Update question snapshot with resolution details
    if (currentQuestionSnapshot) {
        currentQuestionSnapshot.isCorrect = data.isCorrect;
        currentQuestionSnapshot.correction = data.correction || null;
        currentQuestionSnapshot.hintText = data.hintText || null;
    }

    // Hide bidding controls
    biddingControls.classList.add('hidden');
    inspectionMessage.classList.add('hidden');

    // Update players
    if (data.players) {
        renderRankings(data.players);
        updateMyPlayerCash(data.players);
    }

    // Populate result overlay
    if (data.isCorrect) {
        resultIcon.textContent = '✅';
        resultTitle.textContent = 'Grammatically Correct!';
        resultVerdict.innerHTML = '<span class="inline-flex items-center gap-2 px-4 py-1.5 rounded-full text-sm font-bold font-sans bg-emerald-500/20 text-emerald-300 border border-emerald-500/40">✓ CORRECT</span>';
        resultCorrection.classList.add('hidden');
    } else {
        resultIcon.textContent = '❌';
        resultTitle.textContent = 'Grammatically Incorrect!';
        resultVerdict.innerHTML = '<span class="inline-flex items-center gap-2 px-4 py-1.5 rounded-full text-sm font-bold font-sans bg-rose-500/20 text-rose-300 border border-rose-500/40">✗ INCORRECT</span>';
        resultCorrection.classList.remove('hidden');
        resultCorrectionText.textContent = `⚠️ Contains a grammatical error! Prepare to submit your fix in the upcoming Bonus Correction Round!`;
    }

    resultSentence.textContent = `"${data.sentence}"`;
    resultExplanation.textContent = `Category: ${data.category} — ${data.hintText}`;

    if (data.winnerUsername) {
        // Strictly check if the current user is the actual round winner
        const winnerPlayer = data.players ? data.players.find(p => p.username === data.winnerUsername) : null;
        const isMe = winnerPlayer ? (winnerPlayer.userId === userId) : (data.winnerUsername === myUsername);

        if (data.cashChange > 0) {
            resultCashChange.textContent = `${data.winnerUsername} earned +${formatCash(data.cashChange)}!`;
            resultCashChange.className = 'font-sans text-lg font-bold text-emerald-300';
            if (isMe) {
                playSFX('win_cash');
            } else {
                playSFX('bruh');
            }
        } else if (data.cashChange < 0) {
            resultCashChange.textContent = `${data.winnerUsername} lost ${formatCash(Math.abs(data.cashChange))}!`;
            resultCashChange.className = 'font-sans text-lg font-bold text-rose-400';
            if (isMe) {
                playSFX('lose_cash');
            } else {
                playSFX('bruh');
            }
        } else {
            resultCashChange.textContent = `${data.winnerUsername} — cash unchanged.`;
            resultCashChange.className = 'font-sans text-lg font-bold text-amber-300';
            playSFX('bruh');
        }
        resultWinner.textContent = `Won by ${data.winnerUsername} with a bid of ${formatCash(data.highestBid)}`;
    } else {
        resultCashChange.textContent = 'No bids placed this round.';
        resultCashChange.className = 'font-sans text-lg font-bold text-white/60';
        resultWinner.textContent = '';
        playSFX('bruh');
    }

    showOverlay(resultOverlay, resultCard);
});

// ── Correction Phase Start ─────────────────────────────────────
socket.on('correction_start', (data) => {
    console.log('Correction phase started');
    setPhase('correction', data.timer);
    correctionSubmitted = false;

    // Hide result overlay, show correction modal
    hideOverlay(resultOverlay, resultCard);

    if (data.flawedPhrase) {
        const escaped = data.flawedPhrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const regex = new RegExp(`(${escaped})`, 'gi');
        const highlighted = data.sentence.replace(regex, `<span class="inline-block px-1.5 py-0.5 rounded bg-rose-500/30 text-rose-200 border border-rose-400/60 animate-pulse font-bold tracking-wide shadow-[0_0_10px_rgba(244,63,94,0.4)]">$1</span>`);
        correctionSentence.innerHTML = `"${highlighted}"`;
        correctionInput.placeholder = `Type the fix for "${data.flawedPhrase}"...`;
    } else {
        correctionSentence.textContent = `"${data.sentence}"`;
        correctionInput.placeholder = 'Type the correction...';
    }

    correctionInput.value = '';
    correctionSubmitBtn.disabled = false;
    correctionSubmitBtn.textContent = 'Submit Correction';
    correctionFeedback.classList.add('hidden');
    correctionTimer.textContent = data.timer;

    setTimeout(() => showOverlay(correctionOverlay, correctionCard), 400);
});

// ── Correction Result (personal) ───────────────────────────────
socket.on('correction_result', (data) => {
    correctionSubmitted = true;
    correctionSubmitBtn.disabled = true;
    correctionSubmitBtn.textContent = 'Submitted';
    correctionFeedback.classList.remove('hidden');

    if (data.isAccurate) {
        correctionFeedbackText.textContent = `✅ Correct! +${formatCash(data.cashChange)}${data.order === 1 ? ' (FIRST!)' : ''}`;
        correctionFeedbackText.className = 'text-sm font-sans font-bold text-emerald-300';
        playSFX('correct');
    } else {
        correctionFeedbackText.textContent = `❌ Incorrect! ${formatCash(data.cashChange)}`;
        correctionFeedbackText.className = 'text-sm font-sans font-bold text-rose-400';
        playSFX('error');
    }

    myCash = data.newCash;
    updateCashDisplay();
});

socket.on('correction_error', ({ message }) => {
    showToast(message, '⚠️', 3000);
});

// ── Correction End ─────────────────────────────────────────────
socket.on('correction_end', (data) => {
    hideOverlay(correctionOverlay, correctionCard);

    if (data.players) {
        renderRankings(data.players);
        updateMyPlayerCash(data.players);
    }

    // Populate official solution modal
    if (explanationCategory) explanationCategory.textContent = data.category || 'GRAMMAR SOLUTION';
    if (explanationVariety) explanationVariety.textContent = `🌐 ${data.englishVariety || 'General / International English'}`;
    if (explanationQid) explanationQid.textContent = `ID: ${data.questionId || '---'}`;
    if (explanationOriginal) explanationOriginal.textContent = `"${data.originalSentence}"`;
    if (explanationCorrect) explanationCorrect.textContent = `"${data.correctAnswer}"`;
    if (explanationRule) explanationRule.textContent = data.explanation || 'Review the correct grammar pattern above.';
    if (explanationReasoning) explanationReasoning.textContent = data.validationReasoning || 'Validated unambiguous across all standard English varieties.';

    // Render player submissions
    if (explanationSubmissions) {
        if (data.submissions && data.submissions.length > 0) {
            explanationSubmissions.innerHTML = data.submissions.map(sub => {
                const statusClass = sub.isAccurate
                    ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
                    : 'bg-rose-500/20 text-rose-300 border-rose-500/40';
                const award = sub.isAccurate
                    ? (sub.order === 1 ? '+$500 (1st)' : '+$200')
                    : '-$200';

                return `
                    <div class="flex items-center justify-between p-2 sm:p-2.5 rounded-lg sm:rounded-xl bg-white/[0.03] border border-white/10 text-[11px] sm:text-xs">
                        <div class="flex items-center gap-1.5 sm:gap-2 overflow-hidden mr-2">
                            <span class="font-bold text-white font-serif shrink-0">${sub.username}:</span>
                            <span class="italic text-white/80 truncate">"${sub.text}"</span>
                        </div>
                        <span class="px-2 py-0.5 rounded-full font-bold border ${statusClass} shrink-0 text-[10px] sm:text-xs">
                            ${sub.isAccurate ? '✓ Correct' : '✗ Incorrect'} (${award})
                        </span>
                    </div>
                `;
            }).join('');
        } else {
            explanationSubmissions.innerHTML = `<p class="text-[11px] sm:text-xs font-sans italic text-white/50 text-center py-1.5">No players submitted a correction.</p>`;
        }
    }

    // Show solution modal
    if (explanationOverlay && explanationCard) {
        setTimeout(() => showOverlay(explanationOverlay, explanationCard), 300);
    }
});

// ── Game Over ──────────────────────────────────────────────────
socket.on('game_over', (data) => {
    console.log('Game over!', data);
    setPhase('game_over', '🏆');

    hideOverlay(resultOverlay, resultCard);
    hideOverlay(correctionOverlay, correctionCard);
    if (explanationOverlay && explanationCard) hideOverlay(explanationOverlay, explanationCard);

    // Populate game over screen
    gameoverWinnerName.textContent = data.winnerUsername;
    gameoverWinnerCash.textContent = formatCash(data.winnerCash);

    const medals = ['🥇', '🥈', '🥉', '🎖️'];
    gameoverStandings.innerHTML = data.standings.map((p, i) => {
        const isMe = p.userId === userId;
        const borderClass = isMe
            ? 'border-2 border-emerald-400/80 bg-emerald-500/10 shadow-[0_0_15px_rgba(52,211,153,0.3)]'
            : 'border border-white/15 bg-white/[0.03]';

        return `
            <div class="flex items-center justify-between p-2.5 rounded-2xl ${borderClass} transition-all">
                <div class="flex items-center gap-3">
                    <span class="text-lg">${medals[i] || `#${i + 1}`}</span>
                    <span class="font-serif italic text-sm font-medium text-white">
                        ${p.username}${isMe ? ' <strong class="text-emerald-300 not-italic">(You)</strong>' : ''}
                    </span>
                </div>
                <span class="font-mono text-sm font-bold ${isMe ? 'text-emerald-300' : 'text-white/80'}">
                    ${formatCash(p.cash)}
                </span>
            </div>
        `;
    }).join('');

    // Update local cash
    const me = data.standings.find(p => p.userId === userId);
    if (me) {
        localStorage.setItem('gb_cash', me.cash);
    }

    // Render round-by-round match breakdown
    if (gameoverRoundHistory) {
        currentMatchRoundHistory = data.roundHistory || [];
        if (currentMatchRoundHistory.length > 0) {
            gameoverRoundHistory.innerHTML = currentMatchRoundHistory.map(r => {
                const statusBadge = r.isCorrect
                    ? `<span class="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/40">✅ 100% CORRECT</span>`
                    : `<span class="px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-500/20 text-rose-300 border border-rose-500/40">❌ GRAMMAR ERROR</span>`;

                const winnerText = r.winnerUsername
                    ? `<span class="text-amber-300 font-bold">🔨 ${r.winnerUsername}</span> (${formatCash(r.highestBid)})`
                    : `<span class="text-white/40 italic">Unsold (No bids)</span>`;

                const correctorText = r.fastestCorrector
                    ? `<span class="text-cyan-300 font-bold">⚡ ${r.fastestCorrector} (+$500)</span>`
                    : (r.isCorrect ? `<span class="text-white/40 italic">N/A (Correct)</span>` : `<span class="text-white/40 italic">No fixes</span>`);

                return `
                    <div class="p-3 rounded-2xl bg-white/[0.03] border border-white/10 flex flex-col gap-2 text-xs">
                        <div class="flex items-center justify-between gap-2 border-b border-white/10 pb-1.5 flex-wrap">
                            <div class="flex items-center gap-2 flex-wrap">
                                <span class="font-bold text-amber-300 font-mono">Round ${r.roundNumber}</span>
                                ${statusBadge}
                                <span class="px-2 py-0.5 rounded-full text-[10px] bg-sky-500/20 text-sky-300 border border-sky-500/30">🌐 ${r.englishVariety || 'General English'}</span>
                            </div>
                            <div class="flex items-center gap-2">
                                <span class="text-[10px] font-sans text-cyan-300/80 uppercase font-semibold tracking-wider">${r.category || 'GRAMMAR'}</span>
                                <span class="text-[10px] font-mono text-slate-400">ID: ${r.questionId || '---'}</span>
                            </div>
                        </div>
                        <p class="font-serif italic text-white/90 font-medium">"${r.sentence}"</p>
                        ${!r.isCorrect ? `<p class="font-serif italic text-emerald-300 text-[11px]">✨ Fix: "${r.correction}"</p>` : ''}
                        ${r.validationReasoning ? `<p class="font-sans text-[10px] text-emerald-200/80 bg-emerald-950/20 p-2 rounded-lg border border-emerald-500/20">🛡️ <strong>Verdict Evidence:</strong> ${r.validationReasoning}</p>` : ''}
                        <div class="flex flex-wrap items-center justify-between gap-2 pt-1 border-t border-white/5 text-[11px]">
                            <div><span class="text-white/50">Lot Winner:</span> ${winnerText}</div>
                            <div class="flex items-center gap-2">
                                <div><span class="text-white/50">Top Fix:</span> ${correctorText}</div>
                                <button onclick="openReportModalForRound(${r.roundNumber})"
                                    class="ml-2 px-2 py-0.5 rounded bg-rose-500/20 hover:bg-rose-500/40 border border-rose-500/40 text-rose-300 hover:text-rose-100 text-[10px] font-bold transition-all cursor-pointer flex items-center gap-1">
                                    ⚠️ Report
                                </button>
                            </div>
                        </div>
                    </div>
                `;
            }).join('');
        } else {
            gameoverRoundHistory.innerHTML = `<p class="text-xs font-sans italic text-white/40 text-center py-2">No round breakdown available.</p>`;
        }
    }

    // Render Match XP Summary & Rank Progress
    const gameoverXPContainer = document.getElementById('gameover-xp-container');
    const gameoverXPTotal = document.getElementById('gameover-xp-total');
    const gameoverXPBreakdown = document.getElementById('gameover-xp-breakdown');
    const gameoverRankTitle = document.getElementById('gameover-rank-title');
    const gameoverRankProgressText = document.getElementById('gameover-rank-progress-text');
    const gameoverXPProgressBar = document.getElementById('gameover-xp-progress-bar');

    const myXPSummary = (data.matchXPSummary && userId) ? data.matchXPSummary[userId] : null;

    if (myXPSummary && gameoverXPContainer) {
        gameoverXPContainer.classList.remove('hidden');
        if (gameoverXPTotal) gameoverXPTotal.textContent = `+${myXPSummary.totalXP || 0} XP`;

        if (gameoverXPBreakdown) {
            const b = myXPSummary.breakdown || {};
            const breakdownItems = [
                { label: 'Correct Decisions', value: b.correctDecisions, icon: '🎯' },
                { label: 'Auction Wins', value: b.auctionWins, icon: '🔨' },
                { label: 'Correction Round', value: b.corrections, icon: '✏️' },
                { label: 'Match Complete', value: b.matchCompletion, icon: '🎮' },
                { label: 'Streak Bonus', value: b.streakBonus, icon: '🔥' }
            ].filter(item => item.value > 0);

            if (breakdownItems.length > 0) {
                gameoverXPBreakdown.innerHTML = breakdownItems.map(item => `
                    <div class="bg-black/40 p-2 rounded-xl border border-white/10 flex items-center justify-between">
                        <span class="text-white/70 text-[11px] flex items-center gap-1">
                            <span>${item.icon}</span> ${item.label}
                        </span>
                        <span class="font-mono font-bold text-amber-300 text-xs">+${item.value} XP</span>
                    </div>
                `).join('');
            } else {
                gameoverXPBreakdown.innerHTML = `<div class="col-span-2 text-center text-white/50 italic py-1 text-xs">No XP gained in this match</div>`;
            }
        }

        if (myXPSummary.rankProgress) {
            const rp = myXPSummary.rankProgress;
            if (gameoverRankTitle) gameoverRankTitle.textContent = `${rp.currentRankBadge || '🌱'} ${rp.currentRankName || 'Grammar Novice'}`;
            if (gameoverRankProgressText) gameoverRankProgressText.textContent = rp.statusText || 'MAX RANK';
            if (gameoverXPProgressBar) gameoverXPProgressBar.style.width = `${rp.progressPercent || 0}%`;
        }
    } else if (gameoverXPContainer) {
        gameoverXPContainer.classList.add('hidden');
    }

    setTimeout(() => {
        playSFX('gameover');
        showOverlay(gameoverOverlay, gameoverCard);
    }, 500);
});

// Socket rank_up event listener for match arena
if (userId) {
    socket.on(`rank_up_${userId}`, (data) => {
        console.log('🏆 Rank Up Event in Arena:', data);
        const badge = (data && data.newRankObj && data.newRankObj.badge) || (data && data.newRankBadge) || (data && data.newRank && data.newRank.badge) || '🏆';
        const name = (data && data.newRankObj && data.newRankObj.name) || (data && typeof data.newRank === 'string' ? data.newRank : (data && data.newRank && data.newRank.name)) || 'New Rank';
        showToast(`🏆 RANK UP! You reached ${badge} ${name}!`, '🎉', 5000);
    });
}

// ═══════════════════════════════════════════════════════════════
//  User Interaction Handlers
// ═══════════════════════════════════════════════════════════════

// ── Hint Button ────────────────────────────────────────────────
hintBtn.addEventListener('click', () => {
    if (isDisconnected || hintBought || currentPhase !== 'inspection') return;
    socket.emit('buy_hint', { roomCode });
});

// ── Quick-Add Bid Chips ────────────────────────────────────────
document.querySelectorAll('[data-add]').forEach(chip => {
    chip.addEventListener('mouseenter', playUIPop);
    chip.addEventListener('click', () => {
        if (isDisconnected) return;
        playUIPop();
        if (currentPhase !== 'bidding') return;
        const addAmount = parseInt(chip.dataset.add);
        const newBid = currentHighestBid + addAmount;
        bidInput.value = newBid;
    });
});

// ── Submit Bid ─────────────────────────────────────────────────
function submitBid() {
    if (isDisconnected || currentPhase !== 'bidding') return;
    const amount = parseInt(bidInput.value);
    if (!amount || amount <= 0) {
        bidStatus.textContent = 'Enter a valid bid amount.';
        bidStatus.className = 'text-xs font-sans text-center text-rose-400 italic h-4';
        return;
    }
    socket.emit('place_bid', { roomCode, amount });
    bidInput.value = '';
}

bidSubmitBtn.addEventListener('click', submitBid);
bidInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') submitBid();
});

// ── Submit Correction ──────────────────────────────────────────
correctionSubmitBtn.addEventListener('click', () => {
    if (isDisconnected || correctionSubmitted) return;
    const text = correctionInput.value.trim();
    if (!text) {
        showToast('Please type your correction first.', '⚠️', 2000);
        return;
    }
    socket.emit('submit_correction', { roomCode, correctedText: text });
});

correctionInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        correctionSubmitBtn.click();
    }
});

// ── Reconnection & Disconnect UI Handlers ──────────────────────
socket.on('disconnect', (reason) => {
    console.warn('⚡ Socket disconnected:', reason);
    isDisconnected = true;
    if (reconnectOverlay) {
        reconnectOverlay.classList.remove('hidden');
        reconnectOverlay.classList.add('flex');
        reconnectSpinner.classList.remove('hidden');
        reconnectFailedIcon.classList.add('hidden');
        reconnectActions.classList.add('hidden');
        reconnectActions.classList.remove('flex');
        reconnectTitle.textContent = 'Connection Lost — Reconnecting...';
        reconnectMsg.textContent = 'Attempting to restore match connection. Please wait...';
    }
});

socket.on('connect', () => {
    console.log('⚡ Socket connected to server. Joining room:', roomCode);
    if (roomCode && userId) {
        socket.emit('auth_online', { userId });
        socket.emit('join_room', { roomCode, userId });
    }
});

socket.io.on('reconnect_attempt', (attempt) => {
    console.log(`🔌 Reconnect attempt #${attempt}`);
    if (reconnectMsg) {
        reconnectMsg.textContent = `Attempting to restore match connection (attempt ${attempt}/15)...`;
    }
});

socket.io.on('reconnect_failed', () => {
    console.error('❌ Reconnection failed completely after all attempts.');
    showFailedReconnectUI();
});

function showFailedReconnectUI() {
    if (!reconnectOverlay) return;
    reconnectSpinner.classList.add('hidden');
    reconnectFailedIcon.classList.remove('hidden');
    reconnectTitle.textContent = 'Unable to Reconnect';
    reconnectMsg.textContent = 'Connection to the match was lost. Check your internet or try again.';
    reconnectActions.classList.remove('hidden');
    reconnectActions.classList.add('flex');
}

if (reconnectRetryBtn) {
    reconnectRetryBtn.addEventListener('click', () => {
        if (reconnectSpinner) reconnectSpinner.classList.remove('hidden');
        if (reconnectFailedIcon) reconnectFailedIcon.classList.add('hidden');
        if (reconnectActions) {
            reconnectActions.classList.add('hidden');
            reconnectActions.classList.remove('flex');
        }
        if (reconnectTitle) reconnectTitle.textContent = 'Connection Lost — Reconnecting...';
        if (reconnectMsg) reconnectMsg.textContent = 'Attempting manual reconnect...';
        socket.connect();
    });
}

// ── Bot Floating Emote Reactions ───────────────────────────────
socket.on('display_reaction', ({ username, emote, socketId }) => {
    // Play subtle low pitch-drop bubble SFX
    playEmoteSFX();

    // Create a floating emote that drifts up the screen safely
    const floater = document.createElement('div');
    floater.className = 'fixed z-50 pointer-events-none text-4xl sm:text-5xl select-none transform -translate-x-1/2';
    floater.textContent = emote;

    // Safe horizontal position bounded between 20% and 75% screen width
    const leftPos = 20 + Math.random() * 55;
    floater.style.left = `${leftPos}%`;
    floater.style.bottom = '15%';
    floater.style.opacity = '1';
    floater.style.transition = 'all 2.2s cubic-bezier(0.25, 1, 0.5, 1)';

    document.body.appendChild(floater);

    // Animate upward and fade out
    requestAnimationFrame(() => {
        floater.style.bottom = '65%';
        floater.style.opacity = '0';
        floater.style.transform = `translateX(-50%) scale(1.2) rotate(${Math.random() > 0.5 ? '' : '-'}12deg)`;
    });

    // Cleanup DOM element
    setTimeout(() => floater.remove(), 2500);
});

// ── Floating XP Gain Animation (+25 XP / +50 XP) ───────────────
socket.on('xp_gained', ({ roomCode: eventRoomCode, userId: targetUserId, username, amount }) => {
    if (eventRoomCode && eventRoomCode !== roomCode) return;
    const isPlayerInRoom = players.some(p => p.userId === targetUserId);
    if (!isPlayerInRoom) return;
    showFloatingXP(targetUserId, username, amount);
});

function showFloatingXP(targetUserId, targetUsername, amount) {
    try {
        if (sounds && sounds.win_cash && sfxEnabled) {
            const sfx = sounds.win_cash.cloneNode();
            sfx.volume = 0.2;
            sfx.play().catch(() => { });
        }
    } catch (e) { }

    const floater = document.createElement('div');
    // High z-index (z-[99999]), medium-sized white text with drop shadow, no pill background box
    floater.className = 'fixed z-[99999] pointer-events-none text-white font-bold text-xl sm:text-2xl select-none transform -translate-x-1/2 drop-shadow-[0_2px_10px_rgba(0,0,0,0.85)] tracking-wide';
    floater.textContent = `+${amount} XP`;

    // Randomized horizontal & vertical spawn positions (just like floating emotes)
    const leftPos = 20 + Math.random() * 55;
    const startBottom = 15 + Math.random() * 12;
    floater.style.left = `${leftPos}%`;
    floater.style.bottom = `${startBottom}%`;
    floater.style.opacity = '1';
    floater.style.transition = 'all 2.2s cubic-bezier(0.25, 1, 0.5, 1)';

    document.body.appendChild(floater);

    // Animate upward, scale slightly, add subtle random rotation, and fade out
    requestAnimationFrame(() => {
        const endBottom = 60 + Math.random() * 15;
        const randomRotate = (Math.random() > 0.5 ? '' : '-') + (4 + Math.random() * 12);
        floater.style.bottom = `${endBottom}%`;
        floater.style.opacity = '0';
        floater.style.transform = `translateX(-50%) scale(1.25) rotate(${randomRotate}deg)`;
    });

    setTimeout(() => floater.remove(), 2400);
}

// ── Bot Chat Banter Messages (Toast Notification) ─────────────
socket.on('chat_message', ({ username, message, isBot }) => {
    console.log(`💬 Chat message received: [${username}]: "${message}"`);
    const botBadge = isBot ? ' 🤖' : '';
    showToast(`<strong class="text-amber-300">${username}${botBadge}:</strong> ${message}`, '💬', 3500);
});

// ═══════════════════════════════════════════════════════════════
//  Question Reporting System Client Handlers
// ═══════════════════════════════════════════════════════════════

const explanationReportBtn = document.getElementById('explanation-report-btn');
const reportSentencePreview = document.getElementById('report-sentence-preview');
let currentMatchRoundHistory = [];

window.openReportModalForRound = function (roundNumber) {
    const item = currentMatchRoundHistory.find(r => r.roundNumber === roundNumber);
    if (!item) {
        showToast('Question details not found for this round.', '⚠️', 2000);
        return;
    }

    currentQuestionSnapshot = {
        questionId: item.questionId || `q_${Date.now()}`,
        sentence: item.sentence,
        category: item.category || 'GRAMMAR',
        englishVariety: item.englishVariety || 'General / International English',
        validationReasoning: item.validationReasoning || null,
        roundNumber: item.roundNumber || roundNumber,
        isCorrect: item.isCorrect !== undefined ? item.isCorrect : null,
        correction: item.correction || null,
        hintText: item.explanation || item.hintText || null
    };

    if (item.highestBid !== undefined) {
        myMatchBid = item.highestBid;
    }

    if (reportSentencePreview) {
        reportSentencePreview.textContent = item.sentence ? `"${item.sentence}"` : '';
    }

    if (reportReason) reportReason.value = '';
    if (reportExplanation) reportExplanation.value = '';
    if (reportError) reportError.classList.add('hidden');
    if (reportSuccess) reportSuccess.classList.add('hidden');
    if (reportSubmitBtn) reportSubmitBtn.disabled = false;
    if (reportModal) {
        reportModal.classList.remove('hidden');
        reportModal.classList.add('flex');
    }
};

window.openReportModalForQuestion = function (questionId, sentence, category, englishVariety, validationReasoning, roundNumber, isCorrect, correction, hintText, highestBid) {
    currentQuestionSnapshot = {
        questionId: questionId || `q_${Date.now()}`,
        sentence: sentence,
        category: category || 'GRAMMAR',
        englishVariety: englishVariety || 'General / International English',
        validationReasoning: validationReasoning || null,
        roundNumber: roundNumber || 1,
        isCorrect: isCorrect !== undefined ? isCorrect : null,
        correction: correction || null,
        hintText: hintText || null
    };
    if (highestBid !== undefined) {
        myMatchBid = highestBid;
    }

    if (reportSentencePreview) {
        reportSentencePreview.textContent = sentence ? `"${sentence}"` : '';
    }

    if (reportReason) reportReason.value = '';
    if (reportExplanation) reportExplanation.value = '';
    if (reportError) reportError.classList.add('hidden');
    if (reportSuccess) reportSuccess.classList.add('hidden');
    if (reportSubmitBtn) reportSubmitBtn.disabled = false;
    if (reportModal) {
        reportModal.classList.remove('hidden');
        reportModal.classList.add('flex');
    }
};

if (explanationReportBtn) {
    explanationReportBtn.addEventListener('click', () => {
        if (!currentQuestionSnapshot) {
            showToast('No question available to report!', '⚠️', 2000);
            return;
        }
        openReportModalForQuestion(
            currentQuestionSnapshot.questionId,
            currentQuestionSnapshot.sentence,
            currentQuestionSnapshot.category,
            currentQuestionSnapshot.englishVariety,
            currentQuestionSnapshot.validationReasoning,
            currentQuestionSnapshot.roundNumber,
            currentQuestionSnapshot.isCorrect,
            currentQuestionSnapshot.correction,
            currentQuestionSnapshot.hintText,
            myMatchBid
        );
    });
}

if (reportBtn) {
    reportBtn.addEventListener('click', () => {
        if (!currentQuestionSnapshot) {
            showToast('No active question to report!', '⚠️', 2000);
            return;
        }
        reportReason.value = '';
        reportExplanation.value = '';
        reportError.classList.add('hidden');
        reportSuccess.classList.add('hidden');
        reportSubmitBtn.disabled = false;
        reportModal.classList.remove('hidden');
        reportModal.classList.add('flex');
    });
}

if (reportCloseBtn) {
    reportCloseBtn.addEventListener('click', () => {
        reportModal.classList.add('hidden');
        reportModal.classList.remove('flex');
    });
}

if (reportSubmitBtn) {
    reportSubmitBtn.addEventListener('click', async () => {
        const reason = reportReason.value;
        const explanation = reportExplanation.value.trim();

        if (!reason) {
            reportError.textContent = 'Please select a reason.';
            reportError.classList.remove('hidden');
            return;
        }

        reportSubmitBtn.disabled = true;
        reportError.classList.add('hidden');

        try {
            const res = await fetch('/api/reports', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    questionId: currentQuestionSnapshot.questionId,
                    reason,
                    playerExplanation: explanation,
                    questionSnapshot: currentQuestionSnapshot,
                    roomCode,
                    roundNumber: currentQuestionSnapshot.roundNumber,
                    bidAmount: myMatchBid,
                    matchId: roomCode
                })
            });

            const data = await res.json();

            if (res.status === 201 && data.success) {
                reportSuccess.textContent = '✅ Report submitted! Our team will review this question.';
                reportSuccess.classList.remove('hidden');
                setTimeout(() => {
                    reportModal.classList.add('hidden');
                    reportModal.classList.remove('flex');
                }, 2000);
            } else if (res.status === 409) {
                reportError.textContent = '⚠️ You have already reported this question.';
                reportError.classList.remove('hidden');
            } else {
                reportError.textContent = data.error || 'Failed to submit report.';
                reportError.classList.remove('hidden');
                reportSubmitBtn.disabled = false;
            }
        } catch (err) {
            console.error('Report submission error:', err);
            reportError.textContent = 'Network error. Please try again.';
            reportError.classList.remove('hidden');
            reportSubmitBtn.disabled = false;
        }
    });
}

// ═══════════════════════════════════════════════════════════════
//  Inbox System Client Handlers
// ═══════════════════════════════════════════════════════════════

async function fetchUnreadCount() {
    if (!token || !inboxBadge) return;
    try {
        const res = await fetch('/api/inbox/unread-count', {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const data = await res.json();
        if (data.unreadCount !== undefined && inboxBadge) {
            if (data.unreadCount > 0) {
                inboxBadge.textContent = data.unreadCount > 9 ? '9+' : data.unreadCount;
                inboxBadge.classList.remove('hidden');
            } else {
                inboxBadge.classList.add('hidden');
            }
        }
    } catch (e) { console.error('Unread count fetch error:', e); }
}

async function loadInboxMessages() {
    if (!token || !inboxList) return;
    inboxList.innerHTML = '<div class="text-center text-white/40 text-sm py-8 animate-pulse">Loading messages...</div>';
    try {
        const res = await fetch('/api/inbox', {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const data = await res.json();
        renderInboxMessages(data.messages || []);
        fetchUnreadCount();
    } catch (e) {
        if (inboxList) inboxList.innerHTML = '<div class="text-center text-rose-400 text-sm py-8">Failed to load inbox messages.</div>';
    }
}

function renderInboxMessages(messages) {
    if (messages.length === 0) {
        inboxList.innerHTML = '<div class="text-center text-white/40 text-sm py-8">Your inbox is empty.</div>';
        return;
    }

    inboxList.innerHTML = messages.map(msg => {
        const unreadBorder = !msg.isRead ? 'border-amber-500/50 bg-amber-500/10' : 'border-white/10 bg-white/[0.03]';
        const icon = msg.type === 'compensation' ? '💰' : (msg.type === 'reward' ? '🎁' : (msg.type === 'news' ? '📰' : '📢'));
        const imageTag = (msg.imageUrl || (msg.metadata && msg.metadata.imageUrl))
            ? `<div class="my-2 rounded-xl overflow-hidden border border-white/15 shadow-md">
                <img src="${msg.imageUrl || msg.metadata.imageUrl}" alt="Message Attachment" class="w-full max-h-64 object-contain bg-slate-900/80" />
               </div>`
            : '';
        const animationBtn = isRankReward
            ? `<div class="mt-2 pt-2 border-t border-white/10 flex items-center justify-between">
                <span class="text-xs font-mono font-semibold text-purple-300">${msg.metadata.rankBadge || '🏆'} ${escapeHtml(msg.metadata.rankName || 'New Rank')}</span>
                <button onclick="if(window.triggerRankUnlockAnimation) window.triggerRankUnlockAnimation(event, '${escapeHtml(msg.metadata.rankName || 'Grammar Master')}', '${escapeHtml(msg.metadata.rankBadge || '🏆')}', ${msg.metadata.xp || 0})"
                    class="px-3.5 py-1.5 rounded-full bg-gradient-to-r from-amber-500 via-purple-600 to-emerald-500 hover:from-amber-400 hover:to-emerald-400 text-white font-bold text-xs shadow-lg hover:scale-105 active:scale-95 transition-all flex items-center gap-1.5 cursor-pointer border border-amber-300/40">
                    <span>✨</span> Show Animation
                </button>
               </div>`
            : '';

        return `
            <div class="p-4 rounded-2xl border ${unreadBorder} transition-all space-y-2 cursor-pointer hover:border-white/20" onclick="markMessageRead('${msg._id}')">
                <div class="flex items-center justify-between">
                    <div class="flex items-center gap-2">
                        <span class="text-lg">${icon}</span>
                        <h4 class="text-sm font-bold text-white font-serif">${escapeHtml(msg.title)}</h4>
                    </div>
                    <span class="text-[10px] text-white/40">${new Date(msg.createdAt).toLocaleDateString()}</span>
                </div>
                <p class="text-xs text-white/80 whitespace-pre-line">${escapeHtml(msg.body)}</p>
                ${imageTag}
                ${msg.metadata && msg.metadata.amount ? `
                    <div class="inline-block px-2.5 py-1 rounded-full bg-emerald-500/20 border border-emerald-500/40 text-emerald-300 text-xs font-bold">
                        +$${msg.metadata.amount.toLocaleString()} Credited
                    </div>
                ` : ''}
                ${animationBtn}
            </div>
        `;
    }).join('');
}

async function markMessageRead(messageId) {
    try {
        await fetch(`/api/inbox/${messageId}/read`, {
            method: 'PUT',
            headers: { 'Authorization': `Bearer ${token}` }
        });
        fetchUnreadCount();
    } catch (e) { console.error('Mark read error:', e); }
}

if (inboxBtn) {
    inboxBtn.addEventListener('click', () => {
        inboxModal.classList.remove('hidden');
        inboxModal.classList.add('flex');
        loadInboxMessages();
    });
}

if (inboxCloseBtn) {
    inboxCloseBtn.addEventListener('click', () => {
        inboxModal.classList.add('hidden');
        inboxModal.classList.remove('flex');
    });
}

if (inboxMarkAllBtn) {
    inboxMarkAllBtn.addEventListener('click', async () => {
        try {
            await fetch('/api/inbox/read-all', {
                method: 'PUT',
                headers: { 'Authorization': `Bearer ${token}` }
            });
            loadInboxMessages();
        } catch (e) { console.error('Mark all read error:', e); }
    });
}

function escapeHtml(str) {
    if (!str) return '';
    return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// Initial unread check on load
fetchUnreadCount();

