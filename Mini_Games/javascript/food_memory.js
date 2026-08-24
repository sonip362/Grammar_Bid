/**
 * Food Memory Mini Game Script — Grammar Bid Arcade
 * 3x3 Grid Food SVGs Memorization & Drag/Tap Placement Game
 */

const FOOD_ITEMS = [
    { id: 'pizza', name: 'Pizza', emoji: '🍕', color: 'from-amber-500/20 to-orange-500/20 border-orange-500/40 text-orange-400', svg: `<svg viewBox="0 0 64 64" class="w-10 h-10 drop-shadow-md"><path fill="#F59E0B" d="M32 6L6 54h52L32 6z"/><path fill="#EF4444" d="M22 36a4 4 0 1 0 0-8 4 4 0 0 0 0 8zm20 8a4 4 0 1 0 0-8 4 4 0 0 0 0 8zm-10-18a4 4 0 1 0 0-8 4 4 0 0 0 0 8z"/><path fill="#D97706" d="M6 54c-1 3 2 6 5 6h42c3 0 6-3 5-6H6z"/></svg>` },
    { id: 'burger', name: 'Burger', emoji: '🍔', color: 'from-amber-600/20 to-yellow-600/20 border-yellow-600/40 text-amber-300', svg: `<svg viewBox="0 0 64 64" class="w-10 h-10 drop-shadow-md"><path fill="#D97706" d="M12 28c0-10 9-18 20-18s20 8 20 18H12z"/><path fill="#10B981" d="M8 32c4 2 8-2 12 0s8-2 12 0 8-2 12 0 8-2 12 0v-4H8v4z"/><path fill="#EF4444" d="M10 36h44v4H10z"/><path fill="#78350F" d="M8 42c0 2 2 4 4 4h40c2 0 4-2 4-4v-2H8v2z"/><path fill="#F59E0B" d="M14 48c0 6 8 10 18 10s18-4 18-10H14z"/></svg>` },
    { id: 'taco', name: 'Taco', emoji: '🌮', color: 'from-yellow-500/20 to-lime-500/20 border-yellow-500/40 text-yellow-300', svg: `<svg viewBox="0 0 64 64" class="w-10 h-10 drop-shadow-md"><path fill="#F59E0B" d="M8 44C8 24 18 10 32 10s24 14 24 34H8z"/><path fill="#10B981" d="M14 36c4-4 10-2 14-4s8 2 12-2 10 2 12 4H14z"/><path fill="#EF4444" d="M18 40a3 3 0 1 0 0-6 3 3 0 0 0 0 6zm14-2a3 3 0 1 0 0-6 3 3 0 0 0 0 6zm14 2a3 3 0 1 0 0-6 3 3 0 0 0 0 6z"/></svg>` },
    { id: 'hotdog', name: 'Hotdog', emoji: '🌭', color: 'from-red-500/20 to-amber-500/20 border-red-500/40 text-red-400', svg: `<svg viewBox="0 0 64 64" class="w-10 h-10 drop-shadow-md"><path fill="#F59E0B" d="M10 38c0-8 6-14 14-14h16c8 0 14 6 14 14s-6 14-14 14H24c-8 0-14-6-14-14z"/><path fill="#EF4444" d="M6 38c0-5 4-8 8-8h36c4 0 8 3 8 8s-4 8-8 8H14c-4 0-8-3-8-8z"/><path fill="#FBBF24" d="M12 36c4 2 8-2 12 0s8-2 12 0 8-2 12 0" stroke="#FBBF24" stroke-width="3" stroke-linecap="round" fill="none"/></svg>` },
    { id: 'sushi', name: 'Sushi', emoji: '🍣', color: 'from-emerald-500/20 to-teal-500/20 border-emerald-500/40 text-emerald-300', svg: `<svg viewBox="0 0 64 64" class="w-10 h-10 drop-shadow-md"><rect x="10" y="24" width="44" height="24" rx="12" fill="#F8FAFC"/><path fill="#EF4444" d="M14 24h36c4 0 6 4 4 8H10c-2-4 0-8 4-8z"/><rect x="26" y="22" width="12" height="28" rx="2" fill="#065F46"/></svg>` },
    { id: 'donut', name: 'Donut', emoji: '🍩', color: 'from-pink-500/20 to-rose-500/20 border-pink-500/40 text-pink-300', svg: `<svg viewBox="0 0 64 64" class="w-10 h-10 drop-shadow-md"><circle cx="32" cy="32" r="24" fill="#D97706"/><path fill="#EC4899" d="M32 10c12 0 22 8 22 20 0 4-4 2-6 5s-2 6-6 4-6 2-8-2-4-2-6 2-4-4-6 0-4-10 10-29z"/><circle cx="32" cy="32" r="8" fill="#121620"/></svg>` },
    { id: 'icecream', name: 'Ice Cream', emoji: '🍦', color: 'from-cyan-500/20 to-blue-500/20 border-cyan-500/40 text-cyan-300', svg: `<svg viewBox="0 0 64 64" class="w-10 h-10 drop-shadow-md"><path fill="#D97706" d="M22 34l10 24 10-24H22z"/><path fill="#3B82F6" d="M32 8c-8 0-12 6-12 12 0 4 2 6 4 8h16c2-2 4-4 4-8 0-6-4-12-12-12z"/><path fill="#EC4899" d="M20 20c-4 0-6 4-6 7s3 5 6 5h24c3 0 6-2 6-5s-2-7-6-7H20z"/></svg>` },
    { id: 'fries', name: 'Fries', emoji: '🍟', color: 'from-red-600/20 to-yellow-500/20 border-red-500/40 text-yellow-400', svg: `<svg viewBox="0 0 64 64" class="w-10 h-10 drop-shadow-md"><path fill="#EF4444" d="M14 26l4 32h28l4-32H14z"/><path fill="#FBBF24" d="M18 10h5v20h-5zm7-4h5v24h-5zm7 6h5v18h-5zm7-4h5v22h-5z"/></svg>` },
    { id: 'popcorn', name: 'Popcorn', emoji: '🍿', color: 'from-amber-400/20 to-red-500/20 border-amber-400/40 text-amber-200', svg: `<svg viewBox="0 0 64 64" class="w-10 h-10 drop-shadow-md"><path fill="#F8FAFC" d="M16 26l4 32h24l4-32H16z"/><path fill="#EF4444" d="M24 26l2 32h4l-2-32h-4zm12 0l-2 32h4l2-32h-4z"/><circle cx="22" cy="18" r="7" fill="#FDE047"/><circle cx="32" cy="14" r="8" fill="#FDE047"/><circle cx="42" cy="18" r="7" fill="#FDE047"/></svg>` },
    { id: 'cookie', name: 'Cookie', emoji: '🍪', color: 'from-amber-700/20 to-yellow-700/20 border-amber-600/40 text-amber-400', svg: `<svg viewBox="0 0 64 64" class="w-10 h-10 drop-shadow-md"><circle cx="32" cy="32" r="22" fill="#D97706"/><circle cx="22" cy="22" r="3" fill="#451A03"/><circle cx="40" cy="24" r="4" fill="#451A03"/><circle cx="28" cy="38" r="3.5" fill="#451A03"/><circle cx="42" cy="40" r="3" fill="#451A03"/></svg>` },
    { id: 'ramen', name: 'Ramen', emoji: '🍜', color: 'from-orange-600/20 to-red-600/20 border-orange-500/40 text-orange-300', svg: `<svg viewBox="0 0 64 64" class="w-10 h-10 drop-shadow-md"><path fill="#EF4444" d="M10 28c0 14 10 24 22 24s22-10 22-24H10z"/><path fill="#FBBF24" d="M14 26c4-4 8 2 12 0s8 2 12 0 8 2 12 0v4H14v-4z"/><path fill="#F8FAFC" d="M18 10l34 20M24 8l34 20" stroke="#78350F" stroke-width="3" stroke-linecap="round"/></svg>` },
    { id: 'cake', name: 'Cake', emoji: '🍰', color: 'from-pink-600/20 to-purple-600/20 border-pink-500/40 text-pink-300', svg: `<svg viewBox="0 0 64 64" class="w-10 h-10 drop-shadow-md"><path fill="#F472B6" d="M10 40l40-16v24L10 56V40z"/><path fill="#F8FAFC" d="M10 40l40-16-16-10L10 30v10z"/><circle cx="34" cy="14" r="4" fill="#EF4444"/></svg>` }
];

let attemptsRemaining = 5;
let attemptsToday = 0;
const maxAttempts = 5;

let gameState = 'IDLE'; // IDLE, MEMORIZING, PLACING, FINISHED
let memorizedGrid = Array(9).fill(null); // Array of 9 food objects in target positions (0..8)
let currentGrid = Array(9).fill(null); // Player's current grid placement
let inventoryPool = []; // Items in tray below

let timerInterval = null;
let timeLeft = 15.0; // 15s for memorization, then 120s for placement
let backendStartTime = null;
let selectedInventoryIndex = null; // For tap-to-select mobile placement

async function fetchGameStatus() {
    const status = await ArcadeManager.fetchStatus('food-memory', 'gb_food_date', 'gb_food_attempts');
    attemptsRemaining = status.remainingAttempts;
    attemptsToday = status.attemptsToday;
    updateAttemptsUI();
}

function updateAttemptsUI() {
    ArcadeManager.updateTriesUI(attemptsRemaining, maxAttempts, {
        playAgainBtnId: 'modal-play-again-btn'
    });
}

function selectRandom9Foods() {
    const shuffled = [...FOOD_ITEMS].sort(() => Math.random() - 0.5);
    return shuffled.slice(0, 9);
}

function startFoodMemoryGame() {
    if (attemptsRemaining <= 0) return;

    document.getElementById('start-overlay').classList.add('hidden');
    gameState = 'MEMORIZING';
    selectedInventoryIndex = null;

    // Pick 9 random food items and place in target grid
    memorizedGrid = selectRandom9Foods();
    currentGrid = Array(9).fill(null);

    // Prepare tray items (shuffled version of memorized items)
    inventoryPool = [...memorizedGrid].sort(() => Math.random() - 0.5);

    renderMemorizeGrid();
    renderInventoryTray();

    // Start 15s Memorization Timer
    timeLeft = 15.0;
    updateStatusText('MEMORIZE FOOD POSITIONS! (15s)', 'text-amber-400 font-bold animate-pulse');
    updateTimerUI(15.0, 15.0, 'Memorize Timer');

    if (timerInterval) clearInterval(timerInterval);

    const startTime = Date.now();
    timerInterval = setInterval(() => {
        const elapsed = (Date.now() - startTime) / 1000;
        timeLeft = Math.max(0, 15.0 - elapsed);
        updateTimerUI(timeLeft, 15.0, 'Memorize Timer');

        if (timeLeft <= 0) {
            clearInterval(timerInterval);
            transitionToPlacementPhase();
        }
    }, 100);

    // Notify backend
    const authToken = ArcadeManager.getAuthToken();
    if (authToken) {
        fetch('/api/mini-games/food-memory/start-attempt', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${authToken}`
            }
        }).then(r => r.json()).then(data => {
            if (data.success) backendStartTime = data.startTime;
        }).catch(err => console.warn('Food memory start attempt error:', err));
    }
    if (!backendStartTime) backendStartTime = Date.now();
}

function renderMemorizeGrid() {
    const gridEl = document.getElementById('food-grid');
    if (!gridEl) return;
    gridEl.innerHTML = '';

    memorizedGrid.forEach((item, idx) => {
        const slot = document.createElement('div');
        slot.className = `food-slot relative flex flex-col items-center justify-center p-3 rounded-2xl bg-[#1c2230] border border-white/10 shadow-lg transition-all transform hover:scale-105 select-none min-h-[90px]`;
        slot.innerHTML = `
            <span class="absolute top-1.5 left-2 text-[10px] font-mono font-semibold text-slate-500">#${idx + 1}</span>
            <div class="my-auto flex flex-col items-center gap-1">
                <span class="text-3xl">${item.emoji}</span>
                <span class="text-xs font-bold text-slate-200">${item.name}</span>
            </div>
        `;
        gridEl.appendChild(slot);
    });
}

function transitionToPlacementPhase() {
    gameState = 'PLACING';
    if (window.ArcadeAudio) ArcadeAudio.playClick();

    // Clear 3x3 grid into empty drop slots
    renderPlacementGrid();
    renderInventoryTray();

    // Start 2-Minute (120s) Placement Timer
    timeLeft = 120.0;
    updateStatusText('DRAG / TAP FOODS INTO CORRECT SLOTS! (2:00)', 'text-cyan-300 font-semibold');
    updateTimerUI(120.0, 120.0, 'Placement Timer');

    const placementStartTime = Date.now();
    if (timerInterval) clearInterval(timerInterval);

    timerInterval = setInterval(() => {
        const elapsed = (Date.now() - placementStartTime) / 1000;
        timeLeft = Math.max(0, 120.0 - elapsed);
        updateTimerUI(timeLeft, 120.0, 'Placement Timer');

        if (timeLeft <= 0) {
            clearInterval(timerInterval);
            submitPlacements();
        }
    }, 100);
}

function renderPlacementGrid() {
    const gridEl = document.getElementById('food-grid');
    if (!gridEl) return;
    gridEl.innerHTML = '';

    currentGrid.forEach((item, slotIdx) => {
        const slot = document.createElement('div');
        slot.className = `food-slot relative flex flex-col items-center justify-center p-3 rounded-2xl border transition-all select-none min-h-[90px] ${item
            ? 'bg-[#1c2230] border-white/15 shadow-md cursor-pointer hover:border-cyan-400'
            : 'bg-slate-900/60 border-dashed border-slate-800 hover:border-slate-600 cursor-pointer'
            }`;

        slot.ondragover = (e) => { e.preventDefault(); slot.classList.add('border-cyan-400', 'bg-cyan-950/30'); };
        slot.ondragleave = () => { slot.classList.remove('border-cyan-400', 'bg-cyan-950/30'); };
        slot.ondrop = (e) => handleDropOnSlot(e, slotIdx);
        slot.onclick = () => handleSlotClick(slotIdx);

        if (item) {
            slot.draggable = true;
            slot.ondragstart = (e) => { e.dataTransfer.setData('text/plain', JSON.stringify({ type: 'GRID', index: slotIdx })); };
            slot.innerHTML = `
                <span class="absolute top-1.5 left-2 text-[10px] font-mono text-slate-500 font-semibold">#${slotIdx + 1}</span>
                <div class="my-auto flex flex-col items-center gap-1">
                    <span class="text-3xl">${item.emoji}</span>
                    <span class="text-xs font-bold text-slate-200">${item.name}</span>
                </div>
                <button onclick="event.stopPropagation(); returnToTray(${slotIdx});" class="absolute top-1 right-1 w-5 h-5 rounded-full bg-slate-950/80 border border-white/20 text-slate-400 hover:text-white text-[10px] flex items-center justify-center">✕</button>
            `;
        } else {
            slot.innerHTML = `
                <span class="absolute top-1.5 left-2 text-[10px] font-mono text-slate-600 font-semibold">#${slotIdx + 1}</span>
                <div class="my-auto flex flex-col items-center gap-1 text-slate-600">
                    <span class="text-2xl font-light opacity-40">+</span>
                    <span class="text-[10px] font-mono tracking-wider uppercase opacity-50">Drop Here</span>
                </div>
            `;
        }
        gridEl.appendChild(slot);
    });

    checkSubmitReady();
}

function renderInventoryTray() {
    const trayEl = document.getElementById('inventory-tray');
    if (!trayEl) return;
    trayEl.innerHTML = '';

    if (gameState === 'MEMORIZING') {
        trayEl.innerHTML = `<p class="w-full text-[10px] text-slate-500 font-mono py-2 text-center">Tray locked during memorization...</p>`;
        return;
    }

    // Always render exactly 9 divisions side-by-side
    inventoryPool.forEach((item, trayIdx) => {
        const div = document.createElement('div');
        div.style.flex = '1 1 0%';
        div.style.minWidth = '0';

        if (!item) {
            div.className = 'h-12 sm:h-14 rounded-xl border border-dashed border-white/10 bg-slate-950/40 flex items-center justify-center opacity-30 select-none';
            div.innerHTML = `<span class="text-xs text-slate-600">✓</span>`;
            trayEl.appendChild(div);
            return;
        }

        const isSelected = (selectedInventoryIndex === trayIdx);
        div.className = `h-12 sm:h-14 rounded-xl border flex items-center justify-center bg-[#1c2230] hover:bg-[#232936] transition-all cursor-pointer select-none ${isSelected
            ? 'border-cyan-400 bg-cyan-950/60 ring-2 ring-cyan-400/40 scale-105'
            : 'border-white/10 hover:border-cyan-500/40'
            }`;

        div.draggable = true;
        div.ondragstart = (e) => {
            e.dataTransfer.setData('text/plain', JSON.stringify({ type: 'TRAY', index: trayIdx }));
        };
        div.onclick = () => {
            selectedInventoryIndex = (selectedInventoryIndex === trayIdx) ? null : trayIdx;
            renderInventoryTray();
        };

        div.innerHTML = `<span class="text-xl sm:text-2xl">${item.emoji}</span>`;
        trayEl.appendChild(div);
    });

    if (inventoryPool.every(i => i === null)) {
        trayEl.innerHTML = `<p class="w-full text-[10px] text-emerald-400 font-mono font-medium py-2 text-center">✓ All 9 items placed!</p>`;
    }
}

function handleDropOnSlot(e, targetSlotIdx) {
    e.preventDefault();
    if (gameState !== 'PLACING') return;

    try {
        const data = JSON.parse(e.dataTransfer.getData('text/plain'));
        if (data.type === 'TRAY') {
            placeFromTrayToSlot(data.index, targetSlotIdx);
        } else if (data.type === 'GRID') {
            swapGridSlots(data.index, targetSlotIdx);
        }
    } catch (err) {
        console.warn('Drop handle error:', err);
    }
}

function handleSlotClick(slotIdx) {
    if (gameState !== 'PLACING') return;

    // If an inventory item is tapped/selected, place it in this slot
    if (selectedInventoryIndex !== null && inventoryPool[selectedInventoryIndex]) {
        placeFromTrayToSlot(selectedInventoryIndex, slotIdx);
        selectedInventoryIndex = null;
        return;
    }

    // If slot is occupied and no inventory item selected, return to tray
    if (currentGrid[slotIdx]) {
        returnToTray(slotIdx);
    }
}

function placeFromTrayToSlot(trayIdx, slotIdx) {
    const item = inventoryPool[trayIdx];
    if (!item) return;

    // If slot already has an item, return that item to tray first
    if (currentGrid[slotIdx]) {
        const existingItem = currentGrid[slotIdx];
        // Find first empty tray index
        const emptyTrayIdx = inventoryPool.findIndex(i => i === null);
        if (emptyTrayIdx !== -1) {
            inventoryPool[emptyTrayIdx] = existingItem;
        } else {
            inventoryPool.push(existingItem);
        }
    }

    currentGrid[slotIdx] = item;
    inventoryPool[trayIdx] = null;

    if (window.ArcadeAudio) ArcadeAudio.playClick();
    renderPlacementGrid();
    renderInventoryTray();
}

function swapGridSlots(fromSlotIdx, toSlotIdx) {
    if (fromSlotIdx === toSlotIdx) return;
    const temp = currentGrid[fromSlotIdx];
    currentGrid[fromSlotIdx] = currentGrid[toSlotIdx];
    currentGrid[toSlotIdx] = temp;

    if (window.ArcadeAudio) ArcadeAudio.playClick();
    renderPlacementGrid();
    renderInventoryTray();
}

function returnToTray(slotIdx) {
    const item = currentGrid[slotIdx];
    if (!item) return;

    currentGrid[slotIdx] = null;
    const emptyTrayIdx = inventoryPool.findIndex(i => i === null);
    if (emptyTrayIdx !== -1) {
        inventoryPool[emptyTrayIdx] = item;
    } else {
        inventoryPool.push(item);
    }

    if (window.ArcadeAudio) ArcadeAudio.playClick();
    renderPlacementGrid();
    renderInventoryTray();
}

function checkSubmitReady() {
    const submitBtn = document.getElementById('submit-btn');
    if (!submitBtn) return;

    const allPlaced = currentGrid.every(i => i !== null);
    if (allPlaced && gameState === 'PLACING') {
        submitBtn.disabled = false;
        submitBtn.classList.remove('opacity-50', 'cursor-not-allowed');
        submitBtn.classList.add('hover:bg-cyan-400', 'hover:shadow-cyan-500/20');
    } else {
        submitBtn.disabled = true;
        submitBtn.classList.add('opacity-50', 'cursor-not-allowed');
    }
}

async function submitPlacements() {
    if (gameState !== 'PLACING') return;
    gameState = 'FINISHED';
    if (timerInterval) clearInterval(timerInterval);

    let correctCount = 0;
    let wrongCount = 0;

    memorizedGrid.forEach((targetItem, idx) => {
        const placedItem = currentGrid[idx];
        if (placedItem && placedItem.id === targetItem.id) {
            correctCount++;
        } else {
            wrongCount++;
        }
    });

    const netTokens = Math.max(0, 9 - wrongCount);

    if (window.ArcadeAudio) {
        if (netTokens >= 5) ArcadeAudio.playWin();
        else ArcadeAudio.playError();
    }

    // Submit to server API
    submitReward(correctCount, wrongCount, netTokens);

    // Show Results Modal
    showResultModal(correctCount, wrongCount, netTokens);
}

async function submitReward(correctCount, wrongCount, tokensEarned) {
    const res = await ArcadeManager.submitReward('food-memory', {
        correctCount,
        wrongCount,
        tokensEarned
    }, 'gb_food_date', 'gb_food_attempts');

    if (res.success) {
        attemptsRemaining = res.remainingAttempts;
        attemptsToday = res.attemptsToday;
        updateAttemptsUI();
    }
}

function showResultModal(correctCount, wrongCount, netTokens) {
    const modal = document.getElementById('result-modal');
    if (!modal) return;

    const titleEl = document.getElementById('result-title');
    const subtitleEl = document.getElementById('result-subtitle');
    const outcomeEl = document.getElementById('result-outcome-text');
    const rewardEl = document.getElementById('result-cash-text');
    const breakdownEl = document.getElementById('grid-comparison-list');

    if (titleEl) titleEl.textContent = netTokens === 9 ? 'Perfect Memory!' : 'Memory Challenge Complete';
    if (subtitleEl) subtitleEl.textContent = `You correctly recalled ${correctCount} of 9 food items!`;
    if (outcomeEl) {
        outcomeEl.textContent = `${correctCount}/9 MATCHED`;
        outcomeEl.className = correctCount >= 5 ? 'font-mono font-semibold text-emerald-400' : 'font-mono font-semibold text-rose-400';
    }
    if (rewardEl) {
        rewardEl.textContent = `+${netTokens} Gold Tokens`;
    }

    if (breakdownEl) {
        breakdownEl.innerHTML = '';
        memorizedGrid.forEach((target, idx) => {
            const placed = currentGrid[idx];
            const isMatch = placed && placed.id === target.id;
            const itemCard = document.createElement('div');
            itemCard.className = `p-2 rounded-xl border flex items-center justify-between text-xs font-mono ${isMatch
                ? 'bg-emerald-950/40 border-emerald-500/40 text-emerald-300'
                : 'bg-rose-950/40 border-rose-500/40 text-rose-300'
                }`;
            itemCard.innerHTML = `
                <div class="flex items-center gap-2">
                    <span class="text-slate-400 font-bold">#${idx + 1}</span>
                    <span>${target.emoji} ${target.name}</span>
                </div>
                <span>${isMatch ? '✓ Correct' : `✗ Placed: ${placed ? placed.name : 'Empty'}`}</span>
            `;
            breakdownEl.appendChild(itemCard);
        });
    }

    modal.classList.remove('hidden');
}

function closeModalAndReset() {
    document.getElementById('result-modal').classList.add('hidden');
    document.getElementById('start-overlay').classList.remove('hidden');
    gameState = 'IDLE';
}

function updateStatusText(text, className) {
    const el = document.getElementById('ai-status-text');
    if (el) {
        el.textContent = text;
        if (className) el.className = `text-xs ${className}`;
    }
}

function updateTimerUI(current, max, label) {
    const timerText = document.getElementById('timer-text');
    const progressBar = document.getElementById('power-progress');

    if (timerText) {
        const mins = Math.floor(current / 60);
        const secs = Math.floor(current % 60);
        timerText.textContent = `${mins}:${secs < 10 ? '0' : ''}${secs}`;
    }

    if (progressBar) {
        const pct = Math.max(0, (current / max) * 100);
        progressBar.style.width = `${pct}%`;
    }
}

function openHelpModal() {
    document.getElementById('help-modal').classList.remove('hidden');
}

function closeHelpModal() {
    document.getElementById('help-modal').classList.add('hidden');
}

document.addEventListener('DOMContentLoaded', fetchGameStatus);
