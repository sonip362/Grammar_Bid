// pages/javascript/tutorialManager.js
// ─── Interactive Guided Onboarding Tutorial System ─────────────────────────────

const TutorialManager = (function () {
    let currentStep = 0;
    let isActive = false;
    let spotlightOverlay = null;
    let tooltipCard = null;
    let activeHighlightedElement = null;

    // Step Definitions
    const STEPS = [
        {
            id: 0,
            name: 'hero_cta',
            page: 'index.html',
            title: 'Welcome to Grammar Bid! 🎩',
            body: 'Click the "Let\'s Go" button below to begin your guided tour!',
            targetSelector: '#cta-btn',
            interactive: true,
            btnText: null
        },
        {
            id: 1,
            name: 'public_lobby_info',
            page: 'index.html',
            title: '1. Public Auction Lobby 🌐',
            body: 'Here you can jump straight into active public rooms to bid against online players worldwide in real-time! No setup required.',
            targetSelector: '#mode-modal .modal-card:first-child',
            interactive: false,
            btnText: 'Next: Private Room ➔'
        },
        {
            id: 2,
            name: 'select_private_room',
            page: 'index.html',
            title: '2. Host Private Rooms 🔒',
            body: 'Host custom rooms, set rules, and practice with AI bots! Click **"Let\'s Go"** under **Private Room** now.',
            targetSelector: '#mode-modal [href*="mode=private"]',
            interactive: true,
            btnText: null
        },
        {
            id: 3,
            name: 'add_bot',
            page: 'private_room.html',
            title: '3. Add an AI Opponent 🤖',
            body: 'Click the **"🤖 Bot"** button in the footer to invite an AI competitor to your room!',
            targetSelector: '#invite-bot-btn',
            interactive: true,
            btnText: null
        },
        {
            id: 4,
            name: 'start_game',
            page: 'private_room.html',
            title: '4. Launch the Auction Arena 🚀',
            body: 'Awesome! Now click **"Start Game"** to enter the live auction!',
            targetSelector: '#start-game-btn',
            interactive: true,
            btnText: null
        },
        {
            id: 5,
            name: 'arena_walkthrough',
            page: 'auction.html',
            title: '5. Arena Rules & Strategy 🏆',
            body: 'Inspect sentences, bid strategically, and submit bonus corrections!',
            targetSelector: null,
            interactive: false,
            btnText: null
        }
    ];

    function initDOM() {
        if (spotlightOverlay) return;

        // Dark backdrop & spotlight layer (pointer-events-none allows direct clicks on real website buttons)
        spotlightOverlay = document.createElement('div');
        spotlightOverlay.id = 'tutorial-spotlight-backdrop';
        spotlightOverlay.className = 'fixed inset-0 z-[99990] pointer-events-none transition-all duration-300 hidden';
        document.body.appendChild(spotlightOverlay);

        // Tooltip Card — Matched to Grammar Bid Gold Glass Card theme
        tooltipCard = document.createElement('div');
        tooltipCard.id = 'tutorial-tooltip-card';
        tooltipCard.className = 'fixed z-[99999] p-5 rounded-3xl bg-slate-950/95 border border-amber-500/40 shadow-[0_0_50px_rgba(212,150,15,0.25)] backdrop-blur-2xl text-white flex flex-col gap-3 transition-all duration-300 hidden font-sans pointer-events-auto box-border';
        document.body.appendChild(tooltipCard);
    }

    function checkShouldStart() {
        const isCompleted = localStorage.getItem('gb_tutorial_completed') === 'true';
        if (isCompleted) return false;

        const isNewUser = localStorage.getItem('gb_is_new_user') === 'true';
        const isGuest = localStorage.getItem('gb_isGuest') === 'true';
        const hasToken = !!localStorage.getItem('gb_token');

        return (isNewUser || isGuest || hasToken) && !isCompleted;
    }

    function start() {
        initDOM();
        isActive = true;
        localStorage.setItem('gb_tutorial_active', 'true');
        currentStep = 0;
        showStep(0);
    }

    function resume() {
        initDOM();
        const savedStep = parseInt(localStorage.getItem('gb_tutorial_step') || '0', 10);
        isActive = true;
        currentStep = savedStep;
        showStep(currentStep);
    }

    function isElementVisible(el) {
        if (!el) return false;
        const rect = el.getBoundingClientRect();
        return rect.width > 0 && rect.height > 0 && getComputedStyle(el).display !== 'none' && getComputedStyle(el).visibility !== 'hidden';
    }

    function clearTargetHighlight() {
        if (activeHighlightedElement) {
            activeHighlightedElement.classList.remove('ring-2', 'ring-amber-400', 'shadow-[0_0_30px_rgba(251,191,36,0.8)]', 'animate-pulse');
            activeHighlightedElement = null;
        }
    }

    function showStep(stepIdx) {
        initDOM();
        clearTargetHighlight();
        currentStep = stepIdx;
        localStorage.setItem('gb_tutorial_step', stepIdx);

        const step = STEPS[stepIdx];
        if (!step) {
            complete();
            return;
        }

        spotlightOverlay.classList.remove('hidden');
        tooltipCard.classList.remove('hidden');

        if (step.id === 5) {
            renderArenaStep();
            return;
        }

        attemptHighlightTarget(step);
    }

    function attemptHighlightTarget(step, retryCount = 0) {
        const targetEl = document.querySelector(step.targetSelector);
        if (targetEl && isElementVisible(targetEl)) {
            highlightElement(targetEl, step);
        } else if (retryCount < 20) {
            setTimeout(() => attemptHighlightTarget(step, retryCount + 1), 200);
        } else {
            renderFallbackStep(step);
        }
    }

    function highlightElement(el, step) {
        clearTargetHighlight();
        activeHighlightedElement = el;

        // Apply clean gold glow highlight directly to real button
        el.classList.add('ring-2', 'ring-amber-400', 'shadow-[0_0_30px_rgba(251,191,36,0.8)]', 'animate-pulse');

        const isMobile = window.innerWidth <= 640;
        const rect = el.getBoundingClientRect();
        const centerX = rect.left + rect.width / 2;
        const centerY = rect.top + rect.height / 2;
        const radius = Math.max(rect.width, rect.height) / 2 + 12;

        // Radial spotlight mask over target element
        spotlightOverlay.style.background = `radial-gradient(circle at ${centerX}px ${centerY}px, transparent ${radius}px, rgba(15, 23, 42, 0.85) ${radius + 30}px)`;

        // Mobile-docked vs desktop positioning
        if (isMobile) {
            if (centerY > window.innerHeight / 2) {
                tooltipCard.style.top = '16px';
                tooltipCard.style.bottom = 'auto';
            } else {
                tooltipCard.style.top = 'auto';
                tooltipCard.style.bottom = '16px';
            }
            tooltipCard.style.left = '16px';
            tooltipCard.style.right = '16px';
            tooltipCard.style.transform = 'none';
            tooltipCard.style.maxWidth = 'calc(100vw - 32px)';
        } else {
            let top = rect.bottom + 20;
            let left = Math.max(20, rect.left);
            if (top + 220 > window.innerHeight) {
                top = Math.max(20, rect.top - 210);
            }
            if (left + 380 > window.innerWidth) {
                left = window.innerWidth - 400;
            }

            tooltipCard.style.top = `${top}px`;
            tooltipCard.style.left = `${left}px`;
            tooltipCard.style.bottom = 'auto';
            tooltipCard.style.right = 'auto';
            tooltipCard.style.transform = 'none';
            tooltipCard.style.maxWidth = '380px';
        }

        tooltipCard.innerHTML = `
            <div class="flex items-center justify-between border-b border-white/10 pb-2.5">
                <span class="font-cinzel text-xs font-bold text-amber-300 tracking-wider">STEP ${step.id + 1} OF 6</span>
                <div class="flex items-center gap-1.5 sm:gap-2">
                    <span class="px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/40 text-[10px] font-sans font-bold uppercase tracking-wider">Guided Tour</span>
                    <button id="tutorial-skip-btn" class="px-2 py-0.5 rounded-md bg-rose-500/20 hover:bg-rose-500/40 border border-rose-500/40 text-rose-300 text-[11px] font-sans font-bold transition-all cursor-pointer hover:scale-105 active:scale-95" title="Skip Tutorial">Skip ✕</button>
                </div>
            </div>
            <h4 class="font-cinzel text-sm sm:text-base font-bold text-white tracking-wide">${step.title}</h4>
            <p class="font-serif italic text-xs sm:text-sm text-white/90 leading-relaxed">${step.body}</p>
            ${step.btnText ? `
                <button id="tutorial-next-step-btn"
                    class="mt-1 w-full py-2.5 rounded-full bg-gradient-to-r from-amber-500 via-amber-400 to-amber-500 text-slate-950 font-bold text-xs shadow-[0_0_20px_rgba(245,158,11,0.35)] border border-amber-300/50 hover:brightness-110 hover:scale-[1.02] transition-all cursor-pointer">
                    ${step.btnText}
                </button>
            ` : `<p class="text-[11px] font-sans font-semibold text-amber-300/90 text-center animate-pulse mt-0.5">Click the highlighted button to proceed ➔</p>`}
        `;

        attachSkipListener();

        if (step.btnText) {
            const nextBtn = document.getElementById('tutorial-next-step-btn');
            if (nextBtn) {
                nextBtn.addEventListener('click', nextStep);
            }
        } else if (step.interactive) {
            el.scrollIntoView({ behavior: 'smooth', block: 'center' });

            const handleRealButtonClick = () => {
                clearTargetHighlight();
                el.removeEventListener('click', handleRealButtonClick);
                setTimeout(() => {
                    nextStep();
                }, 300);
            };

            el.addEventListener('click', handleRealButtonClick, { once: true });
        }
    }

    function renderFallbackStep(step) {
        clearTargetHighlight();
        spotlightOverlay.style.background = 'rgba(15, 23, 42, 0.85)';

        const isMobile = window.innerWidth <= 640;
        if (isMobile) {
            tooltipCard.style.top = 'auto';
            tooltipCard.style.bottom = '16px';
            tooltipCard.style.left = '16px';
            tooltipCard.style.right = '16px';
            tooltipCard.style.transform = 'none';
            tooltipCard.style.maxWidth = 'calc(100vw - 32px)';
        } else {
            tooltipCard.style.top = '50%';
            tooltipCard.style.left = '50%';
            tooltipCard.style.transform = 'translate(-50%, -50%)';
            tooltipCard.style.bottom = 'auto';
            tooltipCard.style.right = 'auto';
            tooltipCard.style.maxWidth = '380px';
        }

        tooltipCard.innerHTML = `
            <div class="flex items-center justify-between border-b border-white/10 pb-2.5">
                <span class="font-cinzel text-xs font-bold text-amber-300 tracking-wider">STEP ${step.id + 1} OF 6</span>
                <button id="tutorial-skip-btn" class="px-2 py-0.5 rounded-md bg-rose-500/20 hover:bg-rose-500/40 border border-rose-500/40 text-rose-300 text-[11px] font-sans font-bold transition-all cursor-pointer hover:scale-105 active:scale-95" title="Skip Tutorial">Skip ✕</button>
            </div>
            <h4 class="font-cinzel text-sm font-bold text-white">${step.title}</h4>
            <p class="font-serif italic text-xs text-white/90 leading-relaxed">${step.body}</p>
            <button id="tutorial-fallback-btn"
                class="mt-2 w-full py-2.5 rounded-full bg-gradient-to-r from-amber-500 via-amber-400 to-amber-500 text-slate-950 font-bold text-xs shadow-[0_0_20px_rgba(245,158,11,0.35)] border border-amber-300/50 hover:brightness-110 hover:scale-[1.02] transition-all cursor-pointer">
                Continue ➔
            </button>
        `;

        attachSkipListener();
        document.getElementById('tutorial-fallback-btn').addEventListener('click', nextStep);
    }

    function renderArenaStep() {
        let subStep = 0;
        clearTargetHighlight();

        const arenaSubSteps = [
            {
                title: '5a. Sentence Inspection 📜',
                body: 'Each round, an English sentence is displayed. Inspect it carefully to see if it\'s grammatically correct or contains an error!',
                target: '#sentence-panel',
                btnText: 'Next: Bidding Strategy ➔'
            },
            {
                title: '5b. Strategic Bidding Rules 💡',
                body: '• <strong>CORRECT Sentence?</strong> Bid HIGH to win the lot for cash rewards!<br>• <strong>INCORRECT Sentence?</strong> Bid LOW or PASS to save cash for the Correction Round!',
                target: '#auction-console, #bidding-controls',
                btnText: 'Next: Bonus Correction ➔'
            },
            {
                title: '5c. Bonus Correction Phase ✏️',
                body: 'If a sentence contains a grammar error, submit the proper fix in the Bonus Correction Round to earn big cash bounties!',
                target: '#correction-overlay, #correction-card',
                btnText: 'Start Playing Now! 🎮'
            }
        ];

        function showSubStep(idx) {
            subStep = idx;
            const sub = arenaSubSteps[idx];

            const targetEl = document.querySelector(sub.target);
            if (targetEl && isElementVisible(targetEl)) {
                const rect = targetEl.getBoundingClientRect();
                const centerX = rect.left + rect.width / 2;
                const centerY = rect.top + rect.height / 2;
                const radius = Math.max(rect.width, rect.height) / 2 + 15;
                spotlightOverlay.style.background = `radial-gradient(circle at ${centerX}px ${centerY}px, transparent ${radius}px, rgba(15, 23, 42, 0.85) ${radius + 30}px)`;
            } else {
                spotlightOverlay.style.background = 'rgba(15, 23, 42, 0.85)';
            }

            const isMobile = window.innerWidth <= 640;
            if (isMobile) {
                tooltipCard.style.top = '16px';
                tooltipCard.style.bottom = 'auto';
                tooltipCard.style.left = '16px';
                tooltipCard.style.right = '16px';
                tooltipCard.style.transform = 'none';
                tooltipCard.style.maxWidth = 'calc(100vw - 32px)';
            } else {
                tooltipCard.style.top = '50%';
                tooltipCard.style.left = '50%';
                tooltipCard.style.transform = 'translate(-50%, -50%)';
                tooltipCard.style.bottom = 'auto';
                tooltipCard.style.right = 'auto';
                tooltipCard.style.maxWidth = '380px';
            }

            tooltipCard.innerHTML = `
                <div class="flex items-center justify-between border-b border-white/10 pb-2">
                    <span class="font-cinzel text-xs font-bold text-amber-300 tracking-wider">ARENA TUTORIAL (${idx + 1}/3)</span>
                    <div class="flex items-center gap-1.5">
                        <span class="text-[10px] bg-emerald-500/20 text-emerald-300 px-2 py-0.5 rounded-full border border-emerald-500/30 font-bold">Game Rules</span>
                        <button id="tutorial-skip-btn" class="px-2 py-0.5 rounded-md bg-rose-500/20 hover:bg-rose-500/40 border border-rose-500/40 text-rose-300 text-[11px] font-sans font-bold transition-all cursor-pointer hover:scale-105 active:scale-95" title="Skip Tutorial">Skip ✕</button>
                    </div>
                </div>
                <h4 class="font-cinzel text-sm sm:text-base font-bold text-white mt-1">${sub.title}</h4>
                <p class="font-serif italic text-xs sm:text-sm text-white/90 leading-relaxed">${sub.body}</p>
                <button id="arena-substep-btn"
                    class="mt-2 w-full py-2.5 rounded-full bg-gradient-to-r from-amber-500 via-amber-400 to-amber-500 text-slate-950 font-bold text-xs shadow-[0_0_20px_rgba(245,158,11,0.35)] border border-amber-300/50 hover:brightness-110 hover:scale-[1.02] transition-all cursor-pointer">
                    ${sub.btnText}
                </button>
            `;

            attachSkipListener();

            document.getElementById('arena-substep-btn').addEventListener('click', () => {
                if (idx < arenaSubSteps.length - 1) {
                    showSubStep(idx + 1);
                } else {
                    complete();
                }
            });
        }

        showSubStep(0);
    }

    function attachSkipListener() {
        const skipBtn = document.getElementById('tutorial-skip-btn');
        if (skipBtn) {
            skipBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                complete();
            });
        }
    }

    function nextStep() {
        currentStep++;
        if (currentStep >= STEPS.length) {
            complete();
        } else {
            showStep(currentStep);
        }
    }

    function complete() {
        clearTargetHighlight();
        isActive = false;
        localStorage.setItem('gb_tutorial_completed', 'true');
        localStorage.removeItem('gb_tutorial_active');
        localStorage.removeItem('gb_tutorial_step');
        localStorage.removeItem('gb_is_new_user');

        if (spotlightOverlay) spotlightOverlay.classList.add('hidden');
        if (tooltipCard) tooltipCard.classList.add('hidden');

        saveTutorialCompletedToAccount();
    }

    function saveTutorialCompletedToAccount() {
        try {
            const userId = localStorage.getItem('gb_userId') || localStorage.getItem('userId');
            const token = localStorage.getItem('gb_token') || localStorage.getItem('token');

            if (userId || token) {
                fetch('/api/user/complete-tutorial', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        ...(token ? { 'Authorization': `Bearer ${token}` } : {})
                    },
                    body: JSON.stringify({ userId })
                }).catch(err => console.warn('Sync tutorial completed API error:', err));
            }

            if (window.socket && window.socket.connected) {
                window.socket.emit('tutorial_completed', { userId });
            }
        } catch (e) {
            console.warn('Sync tutorial completed state error:', e);
        }
    }

    return {
        checkShouldStart,
        start,
        resume,
        nextStep,
        complete,
        getCurrentStep: () => currentStep
    };
})();

// Auto-start or resume tutorial when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    const active = localStorage.getItem('gb_tutorial_active') === 'true';
    if (active) {
        TutorialManager.resume();
    } else if (TutorialManager.checkShouldStart()) {
        setTimeout(() => TutorialManager.start(), 600);
    }
});
