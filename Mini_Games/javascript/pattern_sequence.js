/**
 * Pattern Sequence Mini Game Script
 * Multi-difficulty mathematical sequence puzzle generator, live rewards & solution deck
 */

let attemptsRemaining = 5;
let attemptsToday = 0;
const maxAttempts = 5;

let isPlaying = false;
let backendStartTime = null;
let timeLeft = 160.0;
let timerInterval = null;

let selectedDifficulty = 'EASY'; // EASY, MEDIUM, HARD
let questionDeck = [];

let cashMeter = 6000;
let tokenMeter = 5;
const INITIAL_CASH_METER = 6000;
const MIN_CASH_METER = 500;
const WRONG_ANSWER_PENALTY = 400;
let totalPenalties = 0;
let wrongAnswersCount = 0;
let tokensLostCount = 0;

let currentStreak = 0;
const TARGET_STREAK = 5;

let currentSequenceObj = null;
let missingValue = null;
let roundHistory = [];

function getMaxTimeForDifficulty(diff) {
    if (diff === 'EASY') return 160.0; // 2 minutes 40 seconds
    if (diff === 'MEDIUM') return 120.0; // 2 minutes
    return 60.0; // HARD: 1 minute
}

async function fetchGameStatus() {
    const status = await ArcadeManager.fetchStatus('pattern-sequence', 'gb_pattern_date', 'gb_pattern_attempts');
    attemptsRemaining = status.remainingAttempts;
    attemptsToday = status.attemptsToday;
    updateAttemptsUI();
}

function updateAttemptsUI() {
    ArcadeManager.updateTriesUI(attemptsRemaining, maxAttempts, {
        playAgainBtnId: 'modal-play-again-btn'
    });
}

async function submitGameResult(gameSuccess, timeRem, finalReward) {
    const res = await ArcadeManager.submitReward('pattern-sequence', {
        gameSuccess,
        timeRemaining: Math.round(timeRem),
        difficulty: selectedDifficulty,
        cashEarned: selectedDifficulty === 'EASY' ? Math.round(finalReward) : 0,
        tokensDeducted: tokensLostCount
    }, 'gb_pattern_date', 'gb_pattern_attempts');

    if (res.success || res.guestFallback) {
        attemptsRemaining = res.remainingAttempts;
        attemptsToday = res.attemptsToday;
        if (res.newCashBalance !== undefined || res.newTokensBalance !== undefined) {
            ArcadeManager.syncBalances(res.newCashBalance, res.newTokensBalance);
        }
        updateAttemptsUI();
    }
}

function updateCashMeterDisplay() {
    const meterEl = document.getElementById('cash-meter-text');
    if (!meterEl) return;
    if (selectedDifficulty === 'EASY') {
        cashMeter = Math.max(MIN_CASH_METER, cashMeter);
        meterEl.textContent = `$${Math.round(cashMeter).toLocaleString()}`;
    } else {
        tokenMeter = Math.max(0, tokenMeter);
        meterEl.textContent = `${tokenMeter} Tokens`;
    }
}

function triggerPenaltyAnimation(label) {
    const container = document.getElementById('penalty-container');
    if (!container) return;
    const el = document.createElement('div');
    el.className = 'penalty-anim text-xs font-mono font-bold text-rose-400 bg-rose-950/80 border border-rose-500/30 px-2 py-0.5 rounded-md';
    el.textContent = typeof label === 'number' ? `-$${label}` : label;
    container.appendChild(el);

    setTimeout(() => {
        el.remove();
    }, 950);
}

function renderNextQuestion() {
    const genEntry = questionDeck[currentStreak];
    const seqData = genEntry.generate();
    const fullSeq = seqData.full;
    const ruleName = seqData.ruleName || genEntry.ruleName;

    const blankIndex = Math.floor(Math.random() * (fullSeq.length - 2)) + 2;
    missingValue = fullSeq[blankIndex];

    currentSequenceObj = {
        roundNum: currentStreak + 1,
        fullSeq: [...fullSeq],
        blankIndex,
        missingValue,
        ruleName,
        isSolved: false
    };

    const seqContainer = document.getElementById('sequence-container');
    if (seqContainer) {
        seqContainer.innerHTML = '';

        fullSeq.forEach((val, idx) => {
            const isBlank = (idx === blankIndex);
            const box = document.createElement('div');
            box.className = `w-14 h-16 sm:w-16 sm:h-20 rounded-2xl flex items-center justify-center font-mono font-bold text-lg sm:text-xl shadow-md ${isBlank ? 'num-box blank' : 'num-box text-slate-100'}`;
            box.id = `box-${idx}`;
            box.textContent = isBlank ? '?' : val.toString();
            seqContainer.appendChild(box);
        });
    }

    const options = [missingValue];
    while (options.length < 4) {
        const offset = (Math.floor(Math.random() * 5) + 1) * (Math.random() < 0.5 ? 1 : -1);
        const fake = missingValue + offset;
        if (fake > 0 && !options.includes(fake)) {
            options.push(fake);
        }
    }
    options.sort(() => Math.random() - 0.5);

    const optContainer = document.getElementById('options-container');
    if (optContainer) {
        optContainer.innerHTML = '';

        options.forEach(optVal => {
            const btn = document.createElement('button');
            btn.className = 'option-btn py-3.5 sm:py-4 rounded-xl text-white font-mono font-semibold text-base sm:text-lg cursor-pointer shadow-sm';
            btn.textContent = optVal.toString();
            btn.onclick = () => checkAnswer(optVal, btn);
            optContainer.appendChild(btn);
        });
    }

    const progressEl = document.getElementById('progress-text');
    if (progressEl) progressEl.textContent = `${currentStreak}/${TARGET_STREAK}`;
}

function checkAnswer(selectedVal, btnEl) {
    if (!isPlaying) return;

    if (window.ArcadeAudio) ArcadeAudio.playClick();

    const allBtns = document.querySelectorAll('.option-btn');
    allBtns.forEach(b => b.disabled = true);

    if (selectedVal === missingValue) {
        if (window.ArcadeAudio) ArcadeAudio.playScore();
        btnEl.classList.remove('option-btn');
        btnEl.classList.add('bg-emerald-600', 'text-white', 'border-emerald-400');

        const blankBoxes = document.querySelectorAll('.num-box.blank');
        blankBoxes.forEach(b => {
            b.classList.add('filled-correct');
            b.textContent = missingValue.toString();
        });

        currentSequenceObj.isSolved = true;
        roundHistory.push(currentSequenceObj);

        currentStreak++;
        const progressEl = document.getElementById('progress-text');
        if (progressEl) progressEl.textContent = `${currentStreak}/${TARGET_STREAK}`;

        if (currentStreak >= TARGET_STREAK) {
            setTimeout(() => {
                handleVictory();
            }, 400);
        } else {
            setTimeout(() => {
                renderNextQuestion();
            }, 550);
        }
    } else {
        if (window.ArcadeAudio) ArcadeAudio.playError();
        btnEl.classList.remove('option-btn');
        btnEl.classList.add('bg-rose-600/80', 'text-white', 'border-rose-500', 'opacity-50');

        const blankBoxes = document.querySelectorAll('.num-box.blank');
        blankBoxes.forEach(b => {
            b.classList.add('border-rose-500', 'text-rose-300');
            b.textContent = missingValue.toString();
        });

        currentSequenceObj.isSolved = false;
        currentSequenceObj.userAnswer = selectedVal;
        roundHistory.push(currentSequenceObj);

        wrongAnswersCount++;

        if (selectedDifficulty === 'HARD') {
            tokensLostCount += 1;
            tokenMeter = Math.max(0, tokenMeter - 1);
            const currentTokens = parseInt(localStorage.getItem('gb_tokens') || '50', 10);
            const updatedTokens = Math.max(0, currentTokens - 1);
            ArcadeManager.syncBalances(null, updatedTokens.toString());
            updateCashMeterDisplay();
            triggerPenaltyAnimation('-1 TOKEN');
        } else if (selectedDifficulty === 'MEDIUM') {
            if (wrongAnswersCount % 2 === 0) {
                tokensLostCount += 1;
                tokenMeter = Math.max(0, tokenMeter - 1);
                const currentTokens = parseInt(localStorage.getItem('gb_tokens') || '50', 10);
                const updatedTokens = Math.max(0, currentTokens - 1);
                ArcadeManager.syncBalances(null, updatedTokens.toString());
                updateCashMeterDisplay();
                triggerPenaltyAnimation('-1 TOKEN');
            } else {
                triggerPenaltyAnimation('WRONG (1/2)');
            }
        } else {
            totalPenalties += WRONG_ANSWER_PENALTY;
            updateCashMeterDisplay();
            triggerPenaltyAnimation(WRONG_ANSWER_PENALTY);
        }

        const statusEl = document.getElementById('ai-status-text');
        if (statusEl) {
            statusEl.textContent = `Incorrect choice! Dismissing question...`;
        }

        currentStreak++;
        const progressEl = document.getElementById('progress-text');
        if (progressEl) progressEl.textContent = `${currentStreak}/${TARGET_STREAK}`;

        if (currentStreak >= TARGET_STREAK) {
            setTimeout(() => {
                handleVictory();
            }, 750);
        } else {
            setTimeout(() => {
                renderNextQuestion();
            }, 750);
        }
    }
}

function selectDifficultyAndStart(diff) {
    if (attemptsRemaining <= 0) return;
    selectedDifficulty = diff;

    const badge = document.getElementById('active-mode-badge');
    if (badge) {
        if (diff === 'EASY') {
            badge.textContent = 'EASY (2:40)';
            badge.className = 'text-[10px] font-mono px-2 py-0.5 rounded-md bg-emerald-500/20 text-emerald-300 border border-emerald-500/30';
        } else if (diff === 'MEDIUM') {
            badge.textContent = 'MEDIUM (2:00)';
            badge.className = 'text-[10px] font-mono px-2 py-0.5 rounded-md bg-amber-500/20 text-amber-300 border border-amber-500/30';
        } else {
            badge.textContent = 'HARD (1:00)';
            badge.className = 'text-[10px] font-mono px-2 py-0.5 rounded-md bg-purple-500/20 text-purple-300 border border-purple-500/30';
        }
    }

    startPuzzle();
}

async function startPuzzle() {
    if (attemptsRemaining <= 0) return;

    document.getElementById('start-overlay').classList.add('hidden');
    currentStreak = 0;
    totalPenalties = 0;
    wrongAnswersCount = 0;
    tokensLostCount = 0;
    cashMeter = INITIAL_CASH_METER;
    tokenMeter = selectedDifficulty === 'MEDIUM' ? 5 : (selectedDifficulty === 'HARD' ? 10 : 0);
    roundHistory = [];

    questionDeck = ArcadeManager.PatternSequence.buildDeckForDifficulty(selectedDifficulty);
    updateCashMeterDisplay();
    renderNextQuestion();

    isPlaying = true;
    const maxTime = getMaxTimeForDifficulty(selectedDifficulty);
    timeLeft = maxTime;

    const authToken = ArcadeManager.getAuthToken();
    if (authToken) {
        try {
            const res = await fetch('/api/mini-games/pattern-sequence/start-attempt', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${authToken}`
                },
                body: JSON.stringify({ difficulty: selectedDifficulty })
            });
            const data = await res.json();
            if (data.success) {
                backendStartTime = data.startTime;
            }
        } catch (err) {
            console.warn('Backend start attempt failed:', err);
        }
    }
    if (!backendStartTime) backendStartTime = Date.now();

    if (timerInterval) clearInterval(timerInterval);

    timerInterval = setInterval(() => {
        const elapsedSec = (Date.now() - backendStartTime) / 1000;
        timeLeft = Math.max(0, maxTime - elapsedSec);

        if (selectedDifficulty === 'EASY') {
            cashMeter = Math.max(MIN_CASH_METER, INITIAL_CASH_METER - (elapsedSec * 10) - totalPenalties);
        }
        updateCashMeterDisplay();

        if (timeLeft <= 0) {
            timeLeft = 0;
            clearInterval(timerInterval);
            handleGameOver(false);
        }
        updateTimerDisplay();
    }, 100);
}

function updateTimerDisplay() {
    const mins = Math.floor(timeLeft / 60);
    const secs = Math.floor(timeLeft % 60);
    const formattedTime = `${mins}:${secs < 10 ? '0' : ''}${secs}`;
    const timerText = document.getElementById('timer-text');
    if (timerText) timerText.textContent = formattedTime;

    const maxTime = getMaxTimeForDifficulty(selectedDifficulty);
    const pct = Math.max(0, (timeLeft / maxTime) * 100);
    const progressEl = document.getElementById('power-progress');
    if (progressEl) progressEl.style.width = `${pct}%`;
}

function populateSolutionsModal() {
    const listEl = document.getElementById('solutions-breakdown-list');
    if (!listEl) return;
    listEl.innerHTML = '';

    roundHistory.forEach((r, idx) => {
        const card = document.createElement('div');
        card.className = 'glass-card rounded-xl p-3 flex flex-col gap-1 border border-white/10 text-xs';

        const seqDisplay = r.fullSeq.map((val, i) => {
            if (i === r.blankIndex) {
                return `<strong class="text-emerald-400 font-bold underline px-1">${val}</strong>`;
            }
            return `<span class="text-slate-300">${val}</span>`;
        }).join(', ');

        card.innerHTML = `
            <div class="flex items-center justify-between">
                <span class="font-mono text-slate-400 font-medium">Round ${idx + 1}</span>
                <span class="text-[11px] font-semibold text-emerald-400 bg-emerald-500/10 border border-emerald-500/30 px-2 py-0.5 rounded-full">✓ ${r.ruleName}</span>
            </div>
            <div class="font-mono text-sm py-1">
                ${seqDisplay}
            </div>
        `;
        listEl.appendChild(card);
    });
}

function setText(id, text, className) {
    const el = document.getElementById(id);
    if (el) {
        if (text !== undefined) el.textContent = text;
        if (className) el.className = className;
    }
}

function handleVictory() {
    isPlaying = false;
    if (timerInterval) clearInterval(timerInterval);
    if (window.ArcadeAudio) ArcadeAudio.playWin();

    const finalReward = Math.round(cashMeter);
    submitGameResult(true, timeLeft, finalReward);

    setText('result-title', `Pattern Sequence [${selectedDifficulty}] Solved`);
    setText('result-subtitle', 'Completed all 5 sequence pattern challenges.');
    setText('result-outcome-text', 'SUCCESS', 'font-mono font-semibold text-slate-200');

    if (selectedDifficulty === 'EASY') {
        setText('result-cash-text', `+$${finalReward.toLocaleString()} Cash`);
    } else if (selectedDifficulty === 'MEDIUM') {
        setText('result-cash-text', `+${tokenMeter} Gold Tokens`);
    } else {
        setText('result-cash-text', `+${tokenMeter} Gold Tokens`);
    }

    populateSolutionsModal();

    setTimeout(() => {
        const modal = document.getElementById('result-modal');
        if (modal) modal.classList.remove('hidden');
    }, 300);
}

function handleGameOver(isWin) {
    isPlaying = false;
    if (timerInterval) clearInterval(timerInterval);

    if (!isWin) {
        if (window.ArcadeAudio) ArcadeAudio.playError();
        submitGameResult(false, 0, 0);

        const timeLabel = selectedDifficulty === 'EASY' ? '2m 40s' : (selectedDifficulty === 'MEDIUM' ? '2m' : '1m');
        setText('result-title', 'Time Expired');
        setText('result-subtitle', `Could not complete 5 sequence puzzles within ${timeLabel}.`);
        setText('result-outcome-text', 'FAILED', 'font-mono font-semibold text-rose-400');
        setText('result-cash-text', '+0 Rewards');

        populateSolutionsModal();

        setTimeout(() => {
            const modal = document.getElementById('result-modal');
            if (modal) modal.classList.remove('hidden');
        }, 500);
    }
}

function showStartOverlay() {
    if (isPlaying) return;
    isPlaying = false;
    if (timerInterval) clearInterval(timerInterval);
    document.getElementById('start-overlay').classList.remove('hidden');
}

function closeModalAndReset() {
    document.getElementById('result-modal').classList.add('hidden');
    showStartOverlay();
}

function openHelpModal() {
    document.getElementById('help-modal').classList.remove('hidden');
}

function closeHelpModal() {
    document.getElementById('help-modal').classList.add('hidden');
}

document.addEventListener('DOMContentLoaded', fetchGameStatus);
