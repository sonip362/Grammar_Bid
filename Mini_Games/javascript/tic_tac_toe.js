/**
 * Tic Tac Toe Mini Game Script
 * Leverages ArcadeManager for economy & imperfect AI logic
 */

let attemptsRemaining = 5;
let attemptsToday = 0;
const maxAttempts = 5;

let board = Array(9).fill(null);
let isGameActive = true;
let currentPlayer = 'X';

async function fetchGameStatus() {
    const status = await ArcadeManager.fetchStatus('tic-tac-toe', 'gb_ttt_date', 'gb_ttt_attempts');
    attemptsRemaining = status.remainingAttempts;
    attemptsToday = status.attemptsToday;
    updateAttemptsUI();
}

function updateAttemptsUI() {
    ArcadeManager.updateTriesUI(attemptsRemaining, maxAttempts);
}

async function submitGameResult(result) {
    const res = await ArcadeManager.submitReward('tic-tac-toe', { result }, 'gb_ttt_date', 'gb_ttt_attempts');
    if (res.success || res.guestFallback) {
        attemptsRemaining = res.remainingAttempts;
        attemptsToday = res.attemptsToday;
        let tokAdd = 0;
        if (result === 'WIN') tokAdd = 2;
        else if (result === 'DRAW') tokAdd = 1;

        if (res.guestFallback && tokAdd > 0) {
            const currentTokens = parseInt(localStorage.getItem('gb_tokens') || '50', 10);
            ArcadeManager.syncBalances(null, currentTokens + tokAdd);
        }
        updateAttemptsUI();
    }
}

function makeMove(idx) {
    if (!isGameActive || board[idx] !== null || currentPlayer !== 'X' || attemptsRemaining <= 0) return;

    if (window.ArcadeAudio) ArcadeAudio.playClick();
    board[idx] = 'X';
    renderBoard();

    const winCombo = ArcadeManager.TicTacToe.checkWin(board, 'X');
    if (winCombo) {
        handleGameOver('WIN', winCombo);
        return;
    }

    if (ArcadeManager.TicTacToe.checkDraw(board)) {
        handleGameOver('DRAW');
        return;
    }

    currentPlayer = 'O';
    document.getElementById('turn-indicator').textContent = 'AI Bot Thinking... (🔵)';
    setTimeout(aiMove, 350);
}

function aiMove() {
    if (!isGameActive) return;

    let bestMove = ArcadeManager.TicTacToe.getSmartAIMove(board);
    if (window.ArcadeAudio) ArcadeAudio.playClick();
    board[bestMove] = 'O';
    renderBoard();

    const winCombo = ArcadeManager.TicTacToe.checkWin(board, 'O');
    if (winCombo) {
        handleGameOver('LOSS', winCombo);
        return;
    }

    if (ArcadeManager.TicTacToe.checkDraw(board)) {
        handleGameOver('DRAW');
        return;
    }

    currentPlayer = 'X';
    document.getElementById('turn-indicator').textContent = 'Your Turn (❌)';
}

function renderBoard() {
    for (let i = 0; i < 9; i++) {
        const btn = document.getElementById(`cell-${i}`);
        if (!btn) continue;
        if (board[i] === 'X') {
            btn.textContent = '❌';
            btn.className = 'w-[92px] h-[92px] rounded-2xl bg-[#1c2838] border border-cyan-400/60 text-cyan-300 flex items-center justify-center text-3xl font-extrabold cursor-default shadow-[0_0_15px_rgba(6,182,212,0.3)] box-border';
        } else if (board[i] === 'O') {
            btn.textContent = '🔵';
            btn.className = 'w-[92px] h-[92px] rounded-2xl bg-[#181d28] border border-slate-600 text-slate-200 flex items-center justify-center text-3xl font-extrabold cursor-default shadow-[0_0_15px_rgba(255,255,255,0.08)] box-border';
        } else {
            btn.textContent = '';
            btn.className = 'w-[92px] h-[92px] rounded-2xl bg-[#181d28] border border-slate-700/80 hover:border-cyan-400/60 transition-all flex items-center justify-center text-3xl font-extrabold cursor-pointer box-border';
        }
    }
}

function handleGameOver(result, winCombo = null) {
    isGameActive = false;

    if (result === 'WIN') {
        if (window.ArcadeAudio) ArcadeAudio.playWin();
    } else {
        if (window.ArcadeAudio) ArcadeAudio.playError();
    }

    if (winCombo) {
        const glowClass = result === 'WIN' ? 'cell-win-cyan' : 'cell-win-grey';
        winCombo.forEach(idx => {
            const btn = document.getElementById(`cell-${idx}`);
            if (btn) btn.classList.add(glowClass);
        });
    }

    submitGameResult(result);

    const iconEl = document.getElementById('result-icon');
    const titleEl = document.getElementById('result-title');
    const outcomeEl = document.getElementById('result-outcome-text');
    const cashEl = document.getElementById('result-cash-text');

    if (result === 'WIN') {
        iconEl.textContent = '🏆';
        titleEl.textContent = 'VICTORY!';
        titleEl.className = 'font-space text-3xl font-extrabold text-cyan-300 tracking-tight';
        outcomeEl.textContent = 'PLAYER WON (-1 Try)';
        outcomeEl.className = 'font-mono font-bold text-cyan-300';
        cashEl.textContent = '+2 Gold Tokens';
    } else if (result === 'LOSS') {
        iconEl.textContent = '💀';
        titleEl.textContent = 'DEFEAT!';
        titleEl.className = 'font-space text-3xl font-extrabold text-rose-400 tracking-tight';
        outcomeEl.textContent = 'AI BOT WON (-1 Try)';
        outcomeEl.className = 'font-mono font-bold text-rose-400';
        cashEl.textContent = '+0 Tokens';
    } else {
        iconEl.textContent = '🤝';
        titleEl.textContent = 'DRAW MATCH!';
        titleEl.className = 'font-space text-3xl font-extrabold text-amber-300 tracking-tight';
        outcomeEl.textContent = 'DRAW MATCH (-1 Try)';
        outcomeEl.className = 'font-mono font-bold text-amber-300';
        cashEl.textContent = '+1 Gold Token';
    }

    setTimeout(() => {
        const modal = document.getElementById('result-modal');
        if (modal) modal.classList.remove('hidden');
    }, 500);
}

function resetBoard() {
    if (attemptsRemaining <= 0) return;

    board = Array(9).fill(null);
    isGameActive = true;
    currentPlayer = 'X';
    document.getElementById('turn-indicator').textContent = 'Your Turn (❌)';
    document.getElementById('result-modal').classList.add('hidden');
    renderBoard();
}

function closeResultModalAndReset() {
    document.getElementById('result-modal').classList.add('hidden');
    resetBoard();
}

// Start
document.addEventListener('DOMContentLoaded', fetchGameStatus);
