/**
 * Grammar Bid — Power Card System Client UI
 * Handles Store Modal, In-Auction Action HUD, purchases, and card activations.
 */

(() => {
    // Card Metadata definition for client rendering
    const POWER_CARDS = {
        DOUBLE_HINT: {
            id: 'DOUBLE_HINT',
            name: 'Double Hint',
            icon: '💡',
            tokenCost: 5,
            phase: 'inspection',
            phaseLabel: 'Inspection',
            description: 'Explains the grammar rule for the lot without revealing the answer directly.'
        },
        BID_SHIELD: {
            id: 'BID_SHIELD',
            name: 'Bid Shield',
            icon: '🛡️',
            tokenCost: 15,
            phase: ['inspection', 'bidding'],
            phaseLabel: 'Inspection & Bidding',
            description: 'Guarantees 100% loss protection — lose $0 cash penalty if you win an incorrect lot.'
        },
        CASHBACK: {
            id: 'CASHBACK',
            name: 'Cashback',
            icon: '💰',
            tokenCost: 12,
            phase: ['inspection', 'bidding'],
            phaseLabel: 'Inspection & Bidding',
            description: 'Returns 25% of your lost cash back if you win an incorrect lot and lose money.'
        },
        SECOND_CHANCE: {
            id: 'SECOND_CHANCE',
            name: 'Second Chance',
            icon: '🔄',
            tokenCost: 10,
            phase: 'correction',
            phaseLabel: 'Correction',
            description: 'Grants 1 extra submission attempt if your initial correction is incorrect.'
        },
        BID_BOOST: {
            id: 'BID_BOOST',
            name: 'Bid Boost',
            icon: '⚡',
            tokenCost: 8,
            phase: ['inspection', 'bidding'],
            phaseLabel: 'Inspection & Bidding',
            description: 'Doubles your bid power. Win double payout on correct lots; lose double on incorrect lots!'
        }
    };

    let userCash = 0;
    let userTokens = 0;
    let userInventory = {
        DOUBLE_HINT: 0,
        BID_SHIELD: 0,
        CASHBACK: 0,
        SECOND_CHANCE: 0,
        BID_BOOST: 0
    };
    let currentAuctionPhase = 'inspection';
    let roundUsedCards = new Set();
    let socket = null;
    let exchangeRate = { costPerToken: 700, rankName: 'Grammar Judge', rankBadge: '⚖️' };
    let selectedExchangeQty = 1;

    // Toast Notification helper
    function showToast(message, type = 'info') {
        const toastContainer = document.getElementById('toast-container') || createToastContainer();
        const toast = document.createElement('div');

        let bgClass = 'bg-slate-900/95 border-cyan-500/50 text-cyan-200';
        if (type === 'success') bgClass = 'bg-slate-900/95 border-emerald-500/50 text-emerald-200';
        if (type === 'error') bgClass = 'bg-slate-900/95 border-rose-500/50 text-rose-200';
        if (type === 'warning') bgClass = 'bg-slate-900/95 border-amber-500/50 text-amber-200';

        toast.className = `flex items-center gap-2 px-4 py-3 rounded-2xl border backdrop-blur-xl shadow-2xl text-xs sm:text-sm font-sans font-semibold transition-all duration-300 transform translate-y-2 opacity-0 ${bgClass}`;
        toast.innerHTML = `<span>⚡</span> <span>${message}</span>`;

        toastContainer.appendChild(toast);
        setTimeout(() => {
            toast.classList.remove('translate-y-2', 'opacity-0');
        }, 10);

        setTimeout(() => {
            toast.classList.add('opacity-0', 'translate-y-2');
            setTimeout(() => toast.remove(), 300);
        }, 4000);
    }

    function createToastContainer() {
        const container = document.createElement('div');
        container.id = 'toast-container';
        container.className = 'fixed top-5 right-5 z-50 flex flex-col gap-2.5 max-w-sm pointer-events-none';
        document.body.appendChild(container);
        return container;
    }

    // ═══════════════════════════════════════════════════════════
    //  STORE MODAL UI (LOBBY & STORE)
    // ═══════════════════════════════════════════════════════════

    async function fetchAndOpenStore() {
        const token = localStorage.getItem('gb_token');
        if (!token) {
            showToast('Please log in to access the Power Store.', 'error');
            return;
        }

        try {
            const res = await fetch('/api/power-cards/store', {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            const data = await res.json().catch(() => ({}));
            if (!res.ok) {
                throw new Error(data.error || data.message || `Server error (${res.status})`);
            }

            userCash = data.cash !== undefined ? data.cash : 0;
            userTokens = data.tokens !== undefined ? data.tokens : 50;
            userInventory = data.inventory || userInventory;
            if (data.exchangeRate) exchangeRate = data.exchangeRate;

            renderStoreModal();
            openStoreModal();
        } catch (err) {
            console.error('Store error:', err);
            showToast(err.message || 'Failed to open Power Store.', 'error');
        }
    }

    function openStoreModal() {
        const backdrop = document.getElementById('power-store-modal-backdrop');
        const modal = document.getElementById('power-store-modal');
        if (!backdrop || !modal) return;

        backdrop.classList.remove('hidden');
        setTimeout(() => {
            backdrop.classList.remove('opacity-0');
            modal.classList.remove('scale-95');
            modal.classList.add('scale-100');
        }, 10);
    }

    function closeStoreModal() {
        const backdrop = document.getElementById('power-store-modal-backdrop');
        const modal = document.getElementById('power-store-modal');
        if (!backdrop || !modal) return;

        backdrop.classList.add('opacity-0');
        modal.classList.remove('scale-100');
        modal.classList.add('scale-95');
        setTimeout(() => backdrop.classList.add('hidden'), 300);
    }

    function renderStoreModal() {
        const cashDisplay = document.getElementById('power-store-cash-display');
        if (cashDisplay) {
            cashDisplay.innerHTML = `<span class="text-amber-300 font-mono font-bold flex items-center gap-1">🪙 ${userTokens} Tokens</span> <span class="text-white/30">|</span> <span class="text-emerald-300 font-mono font-bold flex items-center gap-1">💵 $${userCash.toLocaleString()} Vault Cash</span>`;
        }

        const rankBadgeEl = document.getElementById('exchange-rank-badge');
        const rankTextEl = document.getElementById('exchange-rank-text');
        const totalCostEl = document.getElementById('exchange-total-cost');
        const tokensNumEl = document.getElementById('exchange-tokens-num');

        if (rankBadgeEl) rankBadgeEl.textContent = exchangeRate.rankBadge || '🌱';
        if (rankTextEl) rankTextEl.textContent = `${exchangeRate.rankName} ($${exchangeRate.costPerToken.toLocaleString()} / token)`;
        if (tokensNumEl) tokensNumEl.textContent = selectedExchangeQty.toLocaleString();
        if (totalCostEl) totalCostEl.textContent = `$${(exchangeRate.costPerToken * selectedExchangeQty).toLocaleString()}`;

        const grid = document.getElementById('power-cards-store-grid');
        if (!grid) return;

        grid.innerHTML = Object.values(POWER_CARDS).map(card => {
            const qty = userInventory[card.id] || 0;
            const canAfford = userTokens >= card.tokenCost;

            return `
                <div class="relative bg-[#1e2536]/90 border border-cyan-500/30 rounded-2xl p-2.5 sm:p-4 flex flex-col justify-between gap-2 shadow-lg hover:border-cyan-400/60 transition-all group overflow-hidden">
                    <!-- Top Bar: Icon + Info Button + Owned Tag -->
                    <div class="flex items-center justify-between gap-1.5">
                        <div class="w-9 h-9 sm:w-11 sm:h-11 rounded-xl bg-cyan-500/20 border border-cyan-400/40 flex items-center justify-center text-xl sm:text-2xl shadow-inner shrink-0 group-hover:scale-105 transition-transform">
                            ${card.icon}
                        </div>
                        <div class="flex items-center gap-1.5 shrink-0">
                            <!-- Info Button -->
                            <button type="button" onclick="window.powerCardsUI.showCardInfo('${card.id}')"
                                class="w-6 h-6 sm:w-7 sm:h-7 rounded-lg bg-cyan-500/10 border border-cyan-400/30 text-cyan-300 flex items-center justify-center hover:bg-cyan-500/30 hover:scale-105 active:scale-95 transition-all cursor-pointer shadow-sm shrink-0"
                                title="View Card Info">
                                <svg class="w-3.5 h-3.5 sm:w-4 sm:h-4 stroke-current" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path>
                                </svg>
                            </button>
                            <!-- Owned Tag -->
                            <span class="px-2 py-0.5 rounded-full bg-slate-900/80 text-[10px] sm:text-xs font-sans font-bold border ${qty > 0 ? 'text-amber-300 border-amber-400/40' : 'text-white/40 border-white/10'} shrink-0">
                                x${qty}
                            </span>
                        </div>
                    </div>

                    <!-- Title & Phase -->
                    <div class="flex flex-col gap-0.5 my-0.5 min-w-0">
                        <h3 class="font-cinzel text-xs sm:text-base font-bold text-white tracking-wide truncate">${card.name}</h3>
                        <span class="text-[9px] sm:text-[10px] font-sans font-bold text-cyan-300/80 uppercase tracking-wider truncate">
                            ${card.phaseLabel}
                        </span>
                        <!-- Description: hidden on mobile for 2x compact grid, visible on sm+ screens -->
                        <p class="hidden sm:block text-xs font-serif italic text-white/70 mt-1 leading-snug">${card.description}</p>
                    </div>

                    <!-- Bottom Bar: Cost & Buy Button -->
                    <div class="pt-2 border-t border-white/10 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-1.5">
                        <span class="font-mono text-xs sm:text-sm font-bold text-amber-300 flex items-center justify-center sm:justify-start gap-1 shrink-0">
                            <span>🪙</span> ${card.tokenCost}
                        </span>
                        <button onclick="window.powerCardsUI.buyCard('${card.id}')"
                            ${!canAfford ? 'disabled' : ''}
                            class="w-full sm:w-auto px-3 py-1.5 rounded-xl text-[11px] sm:text-xs font-sans font-bold transition-all cursor-pointer shadow-md flex items-center justify-center gap-1 shrink-0
                            ${canAfford
                    ? 'bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-slate-950 font-extrabold hover:scale-105 active:scale-95'
                    : 'bg-slate-800 text-white/40 cursor-not-allowed border border-white/10'}">
                            <span>🛒</span> BUY
                        </button>
                    </div>
                </div>
            `;
        }).join('');
    }

    async function buyCard(cardId) {
        const token = localStorage.getItem('gb_token');
        if (!token) return;

        try {
            const res = await fetch('/api/power-cards/buy', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({ cardId, quantity: 1 })
            });

            const result = await res.json();
            if (!res.ok || !result.success) {
                showToast(result.message || 'Purchase failed.', 'error');
                return;
            }

            userCash = result.cash !== undefined ? result.cash : userCash;
            userTokens = result.tokens !== undefined ? result.tokens : userTokens;
            userInventory = result.inventory;

            showToast(`Purchased 1x ${result.card.name}!`, 'success');
            renderStoreModal();

            // Update live cash displays on page if present
            const headerCash = document.getElementById('header-cash');
            if (headerCash) headerCash.textContent = `$${userCash.toLocaleString()}`;

        } catch (err) {
            console.error('Buy card error:', err);
            showToast('Failed to complete transaction.', 'error');
        }
    }

    function updateExchangeSummary() {
        const totalCostEl = document.getElementById('exchange-total-cost');
        const tokensNumEl = document.getElementById('exchange-tokens-num');
        if (tokensNumEl) tokensNumEl.textContent = selectedExchangeQty.toLocaleString();
        if (totalCostEl) totalCostEl.textContent = `$${(exchangeRate.costPerToken * selectedExchangeQty).toLocaleString()}`;
    }

    function setExchangeAmount(qty) {
        selectedExchangeQty = Number(qty) || 1;
        const customInput = document.getElementById('exchange-custom-qty');
        if (customInput) customInput.value = '';

        document.querySelectorAll('.exchange-pkg-btn').forEach(btn => {
            const btnQty = Number(btn.getAttribute('data-qty'));
            if (btnQty === selectedExchangeQty) {
                btn.className = 'exchange-pkg-btn px-3 py-1.5 rounded-xl text-xs font-sans font-semibold transition-all cursor-pointer bg-amber-500/20 border border-amber-500/50 text-amber-300';
            } else {
                btn.className = 'exchange-pkg-btn px-3 py-1.5 rounded-xl text-xs font-sans font-semibold transition-all cursor-pointer bg-white/5 border border-white/10 text-white/70 hover:bg-amber-500/10 hover:text-amber-300';
            }
        });
        updateExchangeSummary();
    }

    function onCustomExchangeInput(val) {
        const parsed = parseInt(val, 10);
        if (!isNaN(parsed) && parsed > 0) {
            selectedExchangeQty = parsed;
        } else {
            selectedExchangeQty = 1;
        }
        document.querySelectorAll('.exchange-pkg-btn').forEach(btn => {
            btn.className = 'exchange-pkg-btn px-3 py-1.5 rounded-xl text-xs font-sans font-semibold transition-all cursor-pointer bg-white/5 border border-white/10 text-white/70 hover:bg-amber-500/10 hover:text-amber-300';
        });
        updateExchangeSummary();
    }

    async function executeCashExchange() {
        const token = localStorage.getItem('gb_token');
        if (!token) {
            showToast('Please log in to exchange cash.', 'error');
            return;
        }

        const totalCost = exchangeRate.costPerToken * selectedExchangeQty;
        if (userCash < totalCost) {
            showToast(`Insufficient Cash! You need $${totalCost.toLocaleString()} but only have $${userCash.toLocaleString()}.`, 'error');
            return;
        }

        try {
            const res = await fetch('/api/power-cards/exchange-cash', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({ tokensToBuy: selectedExchangeQty })
            });

            const result = await res.json();
            if (!res.ok || !result.success) {
                showToast(result.message || 'Exchange failed.', 'error');
                return;
            }

            userCash = result.cash !== undefined ? result.cash : userCash;
            userTokens = result.tokens !== undefined ? result.tokens : userTokens;
            if (result.rate) exchangeRate = result.rate;

            showToast(result.message || `Exchanged $${totalCost.toLocaleString()} Cash for +${selectedExchangeQty} 🪙 Gold Tokens!`, 'success');
            renderStoreModal();

            // Update live cash displays on page if present
            const headerCash = document.getElementById('header-cash');
            if (headerCash) headerCash.textContent = `$${userCash.toLocaleString()}`;

        } catch (err) {
            console.error('Exchange error:', err);
            showToast('Failed to complete cash exchange.', 'error');
        }
    }

    // ═══════════════════════════════════════════════════════════
    //  IN-AUCTION ACTION BAR HUD & CARD USAGE
    // ═══════════════════════════════════════════════════════════

    function renderAuctionActionBar() {
        const container = document.getElementById('power-cards-action-bar');
        if (container) {
            const shortNames = {
                DOUBLE_HINT: 'Hint',
                BID_SHIELD: 'Shield',
                CASHBACK: 'Cashback',
                SECOND_CHANCE: '2nd Chance',
                BID_BOOST: 'Boost'
            };

            container.innerHTML = Object.values(POWER_CARDS).map(card => {
                const qty = userInventory[card.id] || 0;
                const allowedPhases = Array.isArray(card.phase) ? card.phase : [card.phase];
                const isCorrectPhase = allowedPhases.includes(currentAuctionPhase);
                const isUsedThisRound = roundUsedCards.has(card.id);
                const canUse = qty > 0 && isCorrectPhase && !isUsedThisRound;

                let badgeStyle = 'bg-slate-800/80 border-white/10 text-white/40';
                if (canUse) {
                    badgeStyle = 'bg-cyan-500/20 border-cyan-400/50 text-cyan-300 hover:bg-cyan-500/40 hover:scale-105 active:scale-95 cursor-pointer shadow-[0_0_15px_rgba(6,182,212,0.3)] animate-pulse';
                } else if (isUsedThisRound) {
                    badgeStyle = 'bg-emerald-500/20 border-emerald-400/40 text-emerald-300 opacity-60';
                }

                const displayName = isUsedThisRound ? 'USED' : (shortNames[card.id] || card.name);

                return `
                    <button onclick="window.powerCardsUI.useCard('${card.id}')"
                        ${!canUse ? 'disabled' : ''}
                        class="flex-1 py-1 px-1.5 sm:py-1.5 sm:px-2 rounded-lg sm:rounded-xl border flex items-center justify-center gap-1 transition-all text-center group ${badgeStyle} shrink-0 min-w-0"
                        title="${card.name} (${card.phaseLabel} phase) — ${card.description}">
                        <span class="text-sm sm:text-base leading-none">${card.icon}</span>
                        <span class="font-sans font-extrabold text-[11px] sm:text-xs text-white leading-none">${qty}</span>
                        <span class="hidden md:inline text-[10px] font-sans font-bold tracking-tight truncate max-w-[65px]">
                            ${displayName}
                        </span>
                    </button>
                `;
            }).join('');
        }

        updateCorrectionModalPowerCard();
    }

    function updateCorrectionModalPowerCard() {
        const cardBtn = document.getElementById('correction-use-card-btn');
        const cardStatus = document.getElementById('correction-card-status');
        if (!cardBtn || !cardStatus) return;

        const qty = userInventory['SECOND_CHANCE'] || 0;
        const isUsed = roundUsedCards.has('SECOND_CHANCE');
        const isCorrectionPhase = currentAuctionPhase === 'correction';

        if (isUsed) {
            cardBtn.disabled = true;
            cardBtn.className = 'px-3 py-1.5 rounded-xl bg-emerald-500/30 border border-emerald-400/50 text-emerald-300 font-sans text-xs font-bold shrink-0 cursor-not-allowed';
            cardBtn.innerHTML = '<span>✓</span> ACTIVATED';
            cardStatus.textContent = 'Active for this correction attempt';
        } else if (qty > 0 && isCorrectionPhase) {
            cardBtn.disabled = false;
            cardBtn.className = 'px-3 py-1.5 rounded-xl bg-gradient-to-r from-amber-500 to-amber-400 text-slate-950 font-sans text-xs font-extrabold hover:scale-105 active:scale-95 transition-all shadow-md flex items-center gap-1 cursor-pointer shrink-0 animate-pulse';
            cardBtn.innerHTML = `<span>⚡</span> USE CARD (${qty})`;
            cardStatus.textContent = `Owned: x${qty} — Grants 1 extra attempt`;
        } else if (qty > 0) {
            cardBtn.disabled = true;
            cardBtn.className = 'px-3 py-1.5 rounded-xl bg-slate-800 text-white/40 border border-white/10 font-sans text-xs font-bold shrink-0 cursor-not-allowed';
            cardBtn.innerHTML = `<span>⚡</span> USE CARD (${qty})`;
            cardStatus.textContent = 'Usable during correction phase';
        } else {
            cardBtn.disabled = true;
            cardBtn.className = 'px-3 py-1.5 rounded-xl bg-slate-800 text-white/40 border border-white/10 font-sans text-xs font-bold shrink-0 cursor-not-allowed';
            cardBtn.innerHTML = '<span>⚡</span> NO CARDS';
            cardStatus.textContent = 'Buy from Power Card store';
        }
    }

    function useCard(cardId) {
        if (!socket) {
            showToast('Socket connection offline.', 'error');
            return;
        }

        const roomCode = localStorage.getItem('gb_roomCode') || getRoomCodeFromUrl();
        socket.emit('power_card:use', { roomCode, cardId });
    }

    function getRoomCodeFromUrl() {
        const params = new URLSearchParams(window.location.search);
        return params.get('room') || '';
    }

    function resetRoundCards() {
        roundUsedCards.clear();
        renderAuctionActionBar();
    }

    function setAuctionPhase(phase) {
        currentAuctionPhase = phase;
        renderAuctionActionBar();
    }

    // ═══════════════════════════════════════════════════════════
    //  INIT & EVENT LISTENERS
    // ═══════════════════════════════════════════════════════════

    function initPowerCardsUI(socketInstance) {
        if (socketInstance) {
            socket = socketInstance;

            // Request initial state from server on connect
            const emitGetState = () => socket.emit('power_cards:get_state');
            if (socket.connected) {
                emitGetState();
            }
            socket.on('connect', emitGetState);

            // Listen for user inventory updates from server
            socket.on('power_cards:state', (data) => {
                if (data.inventory) userInventory = data.inventory;
                if (data.cash !== undefined) userCash = data.cash;
                renderAuctionActionBar();
                renderStoreModal();
            });

            // Listen for card purchase / usage results
            socket.on('power_card:result', (data) => {
                if (data.success) {
                    if (data.cardId) roundUsedCards.add(data.cardId);
                    showToast(data.message, 'success');
                    renderAuctionActionBar();
                }
            });

            socket.on('power_card:error', (data) => {
                showToast(data.message || 'Power card action failed.', 'error');
            });

            // Listen for broadcast card activations from other players in auction room
            socket.on('power_card_activated', (data) => {
                showToast(`⚡ ${data.username} activated ${data.cardName}! ${data.icon}`, 'warning');
            });

            // Listen for Double Hint reveal
            socket.on('double_hint_revealed', (data) => {
                showToast('💡 Double Hint Activated! Revealed detailed grammar clue.', 'success');
                const hintArea = document.getElementById('hint-area');
                const hintText = document.getElementById('hint-text');
                if (hintArea && hintText) {
                    hintText.textContent = data.hintText;
                    hintArea.classList.remove('hidden');
                }
            });

            // Listen for Second Chance grant
            socket.on('second_chance_granted', (data) => {
                showToast(data.message || '🔄 SECOND CHANCE! Submit again!', 'success');
                const errorMsg = document.getElementById('correction-error');
                if (errorMsg) {
                    errorMsg.textContent = '🔄 Second Chance Activated! You have 1 extra attempt!';
                    errorMsg.className = 'text-xs font-sans text-amber-300 font-bold italic animate-bounce';
                }
            });

            // Handle phase transitions
            socket.on('round_start', () => {
                resetRoundCards();
                setAuctionPhase('inspection');
            });

            socket.on('bidding_start', () => {
                setAuctionPhase('bidding');
            });

            socket.on('correction_start', () => {
                setAuctionPhase('correction');
            });

            socket.on('round_result', () => {
                setAuctionPhase('resolution');
            });
        }

        // Attach Store Modal trigger buttons in lobby
        const storeBtn = document.getElementById('power-store-btn');
        if (storeBtn) {
            storeBtn.addEventListener('click', fetchAndOpenStore);
        }

        const closeBtn = document.getElementById('close-power-store-btn');
        if (closeBtn) {
            closeBtn.addEventListener('click', closeStoreModal);
        }

        const backdrop = document.getElementById('power-store-modal-backdrop');
        if (backdrop) {
            backdrop.addEventListener('click', (e) => {
                if (e.target === backdrop) closeStoreModal();
            });
        }

        const infoBackdrop = document.getElementById('card-info-modal-backdrop');
        if (infoBackdrop) {
            infoBackdrop.addEventListener('click', (e) => {
                if (e.target === infoBackdrop) closeCardInfoModal();
            });
        }
    }

    function showCardInfo(cardId) {
        const card = POWER_CARDS[cardId];
        if (!card) return;

        const backdrop = document.getElementById('card-info-modal-backdrop');
        const modal = document.getElementById('card-info-modal');
        const iconBox = document.getElementById('card-info-icon-box');
        const titleEl = document.getElementById('card-info-title');
        const phaseEl = document.getElementById('card-info-phase');
        const descEl = document.getElementById('card-info-desc');
        const costEl = document.getElementById('card-info-cost');
        const ownedEl = document.getElementById('card-info-owned');
        const buyBtn = document.getElementById('card-info-buy-btn');

        if (iconBox) iconBox.textContent = card.icon;
        if (titleEl) titleEl.textContent = card.name;
        if (phaseEl) phaseEl.textContent = `${card.phaseLabel} Phase`;
        if (descEl) descEl.textContent = card.description;
        if (costEl) costEl.textContent = `🪙 ${card.tokenCost} Tokens`;

        const qty = userInventory[card.id] || 0;
        if (ownedEl) ownedEl.textContent = `x${qty}`;

        const canAfford = userTokens >= card.tokenCost;
        if (buyBtn) {
            buyBtn.disabled = !canAfford;
            buyBtn.onclick = () => {
                buyCard(card.id);
                closeCardInfoModal();
            };
            if (canAfford) {
                buyBtn.className = 'w-full py-3 rounded-2xl bg-gradient-to-r from-amber-500 to-amber-400 hover:from-amber-400 hover:to-amber-300 text-slate-950 font-sans font-extrabold text-xs sm:text-sm shadow-xl transition-all cursor-pointer flex items-center justify-center gap-1.5 active:scale-95';
                buyBtn.innerHTML = `<span>🛒</span> BUY THIS CARD (🪙 ${card.tokenCost})`;
            } else {
                buyBtn.className = 'w-full py-3 rounded-2xl bg-slate-800 text-white/40 border border-white/10 font-sans font-extrabold text-xs sm:text-sm cursor-not-allowed flex items-center justify-center gap-1.5';
                buyBtn.innerHTML = `<span>🛒</span> INSUFFICIENT TOKENS`;
            }
        }

        if (backdrop && modal) {
            backdrop.classList.remove('hidden');
            setTimeout(() => {
                backdrop.classList.remove('opacity-0');
                modal.classList.remove('scale-95');
                modal.classList.add('scale-100');
            }, 10);
        }
    }

    function closeCardInfoModal() {
        const backdrop = document.getElementById('card-info-modal-backdrop');
        const modal = document.getElementById('card-info-modal');
        if (!backdrop || !modal) return;

        backdrop.classList.add('opacity-0');
        modal.classList.remove('scale-100');
        modal.classList.add('scale-95');
        setTimeout(() => backdrop.classList.add('hidden'), 300);
    }

    // Expose global API
    window.powerCardsUI = {
        init: initPowerCardsUI,
        fetchAndOpenStore,
        closeStoreModal,
        buyCard,
        showCardInfo,
        closeCardInfoModal,
        setExchangeAmount,
        onCustomExchangeInput,
        executeCashExchange,
        useCard,
        setAuctionPhase,
        resetRoundCards
    };

    // Auto-attach DOM listeners on load & fetch initial inventory for instant HUD render
    document.addEventListener('DOMContentLoaded', () => {
        const storeBtn = document.getElementById('power-store-btn');
        if (storeBtn) storeBtn.addEventListener('click', fetchAndOpenStore);
        const closeBtn = document.getElementById('close-power-store-btn');
        if (closeBtn) closeBtn.addEventListener('click', closeStoreModal);

        const token = localStorage.getItem('gb_token');
        if (token) {
            fetch('/api/power-cards/store', {
                headers: { 'Authorization': `Bearer ${token}` }
            })
                .then(res => res.json())
                .then(data => {
                    if (data && data.inventory) {
                        userInventory = data.inventory;
                        if (data.cash !== undefined) userCash = data.cash;
                        renderAuctionActionBar();
                    }
                })
                .catch(() => { });
        }
    });
})();
