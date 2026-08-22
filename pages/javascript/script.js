// Mobile Drawer Elements
const menuBtn = document.getElementById('mobile-menu-btn');
const closeBtn = document.getElementById('close-menu-btn');
const backdrop = document.getElementById('mobile-backdrop');
const drawer = document.getElementById('mobile-drawer');

// Modal Elements
const ctaBtn = document.getElementById('cta-btn');
const modalBackdrop = document.getElementById('mode-modal-backdrop');
const modalContent = document.getElementById('mode-modal');
const closeModalBtn = document.getElementById('close-modal-btn');

function openMenu() {
    backdrop.classList.remove('hidden');
    setTimeout(() => backdrop.classList.remove('opacity-0'), 10);
    drawer.classList.remove('drawer-hidden');
    drawer.classList.add('drawer-visible');
    document.body.classList.add('overflow-hidden');
}

function closeMenu() {
    backdrop.classList.add('opacity-0');
    drawer.classList.remove('drawer-visible');
    drawer.classList.add('drawer-hidden');
    document.body.classList.remove('overflow-hidden');
    setTimeout(() => backdrop.classList.add('hidden'), 300);
}

function openModal(e) {
    if (e) e.preventDefault();
    if (!modalBackdrop || !modalContent) return;
    modalBackdrop.classList.remove('hidden');
    setTimeout(() => {
        modalBackdrop.classList.remove('opacity-0');
        modalContent.classList.remove('scale-95', 'translate-y-full');
        modalContent.classList.add('scale-100', 'translate-y-0');
    }, 10);
    document.body.classList.add('overflow-hidden');
}

function closeModal() {
    if (!modalBackdrop || !modalContent) return;
    modalBackdrop.classList.add('opacity-0');
    modalContent.classList.remove('scale-100', 'translate-y-0');
    modalContent.classList.add('scale-95', 'translate-y-full');
    document.body.classList.remove('overflow-hidden');
    setTimeout(() => modalBackdrop.classList.add('hidden'), 300);
}

// Event Listeners for Mobile Menu
if (menuBtn) menuBtn.addEventListener('click', openMenu);
if (closeBtn) closeBtn.addEventListener('click', closeMenu);
if (backdrop) backdrop.addEventListener('click', closeMenu);

// Event Listeners for Mode Modal
if (ctaBtn) ctaBtn.addEventListener('click', openModal);
if (closeModalBtn) closeModalBtn.addEventListener('click', closeModal);
if (modalBackdrop) {
    modalBackdrop.addEventListener('click', (e) => {
        if (e.target === modalBackdrop) closeModal();
    });
}

// Close on Escape key
document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
        closeMenu();
        closeModal();
    }
});

// Help & Rules Navigation
const helpBtn = document.getElementById('help-btn');
const mobileHelpBtn = document.getElementById('mobile-help-btn');

if (helpBtn) {
    helpBtn.addEventListener('click', () => {
        window.location.href = 'help.html';
    });
}
if (mobileHelpBtn) {
    mobileHelpBtn.addEventListener('click', () => {
        window.location.href = 'help.html';
    });
}

// ── Room Joining & Navigation Helper ───────────────────────
function joinRoomByCode(rawCode) {
    if (!rawCode) return;
    const cleanCode = String(rawCode).replace(/[^0-9]/g, '').trim();
    if (cleanCode.length >= 4) {
        window.location.href = `private_room.html?join=${cleanCode}`;
    } else {
        alert('Please enter a valid 4-digit room code.');
    }
}

// Desktop Header Room Input
const roomInput = document.getElementById('room-input');
const roomSubmit = document.getElementById('room-submit');

if (roomSubmit && roomInput) {
    roomSubmit.addEventListener('click', () => {
        joinRoomByCode(roomInput.value);
    });
    roomInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            joinRoomByCode(roomInput.value);
        }
    });
}

// Create Room Buttons
const createRoomBtns = document.querySelectorAll('#create-room-btn');
createRoomBtns.forEach(btn => {
    btn.addEventListener('click', () => {
        window.location.href = 'private_room.html';
    });
});

// ── Mobile Username Display ─────────────────────────
const storedUsername = localStorage.getItem('gb_username');
if (storedUsername) {
    const mobileUserLabel = document.getElementById('mobile-user-display-name');
    if (mobileUserLabel) mobileUserLabel.textContent = `Hi, ${storedUsername}`;
}

// Mobile Drawer Room Input
const mobileDrawerInput = document.querySelector('#mobile-drawer input');
const mobileDrawerSubmit = document.getElementById('mobile-room-submit');

if (mobileDrawerSubmit && mobileDrawerInput) {
    mobileDrawerSubmit.addEventListener('click', () => {
        joinRoomByCode(mobileDrawerInput.value);
    });
    mobileDrawerInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            joinRoomByCode(mobileDrawerInput.value);
        }
    });
}

// ── Profile Modal & Image Compressor ───────────────────────
const desktopProfileBtn = document.getElementById('desktop-profile-btn');
const profileModalBackdrop = document.getElementById('profile-modal-backdrop');
const profileModal = document.getElementById('profile-modal');
const closeProfileModalBtn = document.getElementById('close-profile-modal-btn');
const cancelProfileBtn = document.getElementById('cancel-profile-btn');
const saveProfileBtn = document.getElementById('save-profile-btn');
const profilePreviewAvatar = document.getElementById('profile-preview-avatar');
const editUsernameInput = document.getElementById('edit-username-input');
const profileModalAlert = document.getElementById('profile-modal-alert');
const headerAvatarImg = document.getElementById('header-avatar-img');

let selectedCompressedBase64 = null;

// Initialize header profile image & cash from localStorage
function syncProfileHeader() {
    const username = localStorage.getItem('gb_username');
    const avatar = localStorage.getItem('gb_avatar');
    const cashVal = localStorage.getItem('gb_cash') !== null ? localStorage.getItem('gb_cash') : '10000';
    const formattedCash = Number(cashVal).toLocaleString('en-US');

    if (username) {
        const displayName = document.getElementById('user-display-name');
        if (displayName) displayName.textContent = `Hi, ${username}`;
        const mobileName = document.getElementById('mobile-user-display-name');
        if (mobileName) mobileName.textContent = `Hi, ${username}`;
    }

    if (avatar) {
        if (headerAvatarImg) headerAvatarImg.src = avatar;
        const mobileAvatar = document.getElementById('mobile-drawer-avatar-img');
        if (mobileAvatar) mobileAvatar.src = avatar;
    }

    const desktopCashEl = document.getElementById('user-cash-display');
    if (desktopCashEl) desktopCashEl.textContent = `$${formattedCash}`;

    const mobileCashEl = document.getElementById('mobile-user-cash-display');
    if (mobileCashEl) mobileCashEl.textContent = `💵 $${formattedCash}`;
}

// Fetch fresh user data from server
async function fetchUserProfile() {
    const userToken = localStorage.getItem('gb_token');
    if (!userToken) return;

    try {
        const res = await fetch('/api/auth/me', {
            headers: { 'Authorization': `Bearer ${userToken}` }
        });
        if (res.ok) {
            const data = await res.json();
            if (data.user) {
                localStorage.setItem('gb_username', data.user.username);
                localStorage.setItem('gb_avatar', data.user.avatar);
                localStorage.setItem('gb_cash', data.user.cash !== undefined ? data.user.cash : 10000);
                if (data.user.unlockedAvatars) {
                    localStorage.setItem('gb_unlocked_avatars', JSON.stringify(data.user.unlockedAvatars));
                }
                syncProfileHeader();
            }
        }
    } catch (err) {
        console.error('Failed to fetch user profile:', err);
    }
}

let selectedAvatarUrl = null;

const PREBUILT_AVATARS = [
    "Novice Quill.webp",
    "Typo Inspector.webp",
    "Owl.gif",
    "Diagram Draftsman.webp",
    "Golden Nib.webp",
    "Inkwell Scholar.webp",
    "Auctioneer's Gavel.webp",
    "Laurel Tome.webp",
    "Precision Target.webp",
    "Punctuation Matrix.webp",
    "Golden Crest.webp",
    "Explorer's Chart.webp",
    "Grand Crown.webp"
];

const AVATAR_PRICES = {
    "Novice Quill.webp": 0,
    "Typo Inspector.webp": 0,
    "Owl.gif": 0,
    "Diagram Draftsman.webp": 10000,
    "Golden Nib.webp": 15000,
    "Inkwell Scholar.webp": 25000,
    "Auctioneer's Gavel.webp": 35000,
    "Laurel Tome.webp": 50000,
    "Precision Target.webp": 60000,
    "Punctuation Matrix.webp": 75000,
    "Golden Crest.webp": 85000,
    "Explorer's Chart.webp": 100000,
    "Grand Crown.webp": 150000
};

function getAvatarDisplayName(url) {
    if (!url) return 'Default Avatar';
    try {
        const decodedUrl = decodeURIComponent(url);
        const fileName = decodedUrl.substring(decodedUrl.lastIndexOf('/') + 1);
        if (fileName === 'Owl.gif') return '🦉 Wise Owl (GIF)';
        return fileName.replace(/\.(webp|gif)$/i, '');
    } catch {
        return 'Profile Avatar';
    }
}

function updateProfilePreviewDisplay(avatarUrl) {
    const previewImg = document.getElementById('profile-preview-avatar');
    const previewName = document.getElementById('profile-preview-avatar-name');
    if (previewImg) previewImg.src = avatarUrl;
    if (previewName) previewName.textContent = getAvatarDisplayName(avatarUrl);
}

function promptBuyAvatar(url, price, displayName) {
    if (url.includes('Owl.gif')) {
        showConfirmModal({
            title: `Exclusive Day 7 Reward 🎁`,
            message: `The Wise Owl animated GIF avatar cannot be purchased with cash! It is exclusive to the Daily Rewards system—complete your 7-day login streak to unlock it for free!`,
            confirmText: 'Got It',
            onConfirm: () => { }
        });
        return;
    }

    const userCash = Number(localStorage.getItem('gb_cash') || '10000');
    if (userCash < price) {
        showConfirmModal({
            title: `Locked Avatar: ${displayName}`,
            message: `You need $${price.toLocaleString()} to buy this avatar, but you currently have $${userCash.toLocaleString()}. Win more auction rounds to earn cash!`,
            confirmText: 'Got It',
            onConfirm: () => { }
        });
        return;
    }

    showConfirmModal({
        title: `Unlock ${displayName}`,
        message: `Would you like to purchase "${displayName}" for $${price.toLocaleString()}?`,
        confirmText: `Pay $${price.toLocaleString()}`,
        onConfirm: async () => {
            const userToken = localStorage.getItem('gb_token');
            try {
                const res = await fetch('/api/auth/buy-avatar', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${userToken}`
                    },
                    body: JSON.stringify({ avatarUrl: url })
                });
                const data = await res.json();
                if (data.success && data.user) {
                    localStorage.setItem('gb_avatar', data.user.avatar);
                    localStorage.setItem('gb_cash', data.user.cash);
                    if (data.user.unlockedAvatars) {
                        localStorage.setItem('gb_unlocked_avatars', JSON.stringify(data.user.unlockedAvatars));
                    }
                    selectedAvatarUrl = data.user.avatar;
                    updateProfilePreviewDisplay(selectedAvatarUrl);
                    syncProfileHeader();
                    renderAvatarGrid();
                    closeAvatarPickerModal();
                } else {
                    alert(data.error || 'Failed to purchase avatar.');
                }
            } catch (err) {
                alert('Connection error purchasing avatar.');
            }
        }
    });
}

// Prebuilt 12 Avatar Selector Grid Logic (4x3 1:1 ratio items)
function renderAvatarGrid() {
    const grid = document.getElementById('avatar-grid');
    if (!grid) return;

    let unlockedList = [];
    try {
        unlockedList = JSON.parse(localStorage.getItem('gb_unlocked_avatars')) || [];
    } catch (e) {
        unlockedList = [];
    }

    const defaultFree = [
        '/images/profile/Novice%20Quill.webp',
        '/images/profile/Typo%20Inspector.webp'
    ];
    defaultFree.forEach(f => {
        if (!unlockedList.includes(f)) unlockedList.push(f);
    });

    let html = '';
    PREBUILT_AVATARS.forEach((fileName) => {
        const url = `/images/profile/${encodeURIComponent(fileName)}`;
        const displayName = getAvatarDisplayName(url);
        const price = AVATAR_PRICES[fileName] !== undefined ? AVATAR_PRICES[fileName] : 25000;
        const isOwl = fileName === 'Owl.gif';

        const isUnlocked = isOwl
            ? unlockedList.some(u => u.includes('Owl.gif'))
            : (price === 0 || unlockedList.some(u => u.includes(encodeURIComponent(fileName)) || u.includes(fileName)));
        const isSelected = selectedAvatarUrl === url || selectedAvatarUrl.includes(encodeURIComponent(fileName)) || selectedAvatarUrl.includes(fileName);

        if (isUnlocked) {
            const borderClass = isSelected
                ? 'border-2 border-amber-400 scale-105 shadow-[0_0_15px_rgba(251,191,36,0.6)] bg-amber-500/10'
                : 'border border-white/15 hover:border-amber-400/60 hover:scale-105 bg-white/[0.03]';

            html += `
                <div class="avatar-option group cursor-pointer p-2 rounded-2xl flex flex-col items-center gap-1.5 transition-all ${borderClass}" data-url="${url}" data-unlocked="true">
                    <div class="w-full aspect-square rounded-xl overflow-hidden bg-slate-900/50 p-1 flex items-center justify-center relative">
                        <img src="${url}" alt="${displayName}" class="w-full h-full object-contain aspect-square group-hover:scale-110 transition-transform duration-200" />
                        <span class="absolute top-1 right-1 text-[10px] text-emerald-400 font-bold bg-emerald-950/80 border border-emerald-400/50 px-1 rounded-full">✓</span>
                    </div>
                    <span class="text-[11px] sm:text-xs font-serif italic text-white/90 group-hover:text-amber-300 text-center leading-tight line-clamp-1">${displayName}</span>
                </div>
            `;
        } else {
            const borderClass = 'border border-amber-500/30 hover:border-amber-400/80 bg-slate-950/80 hover:bg-slate-900/80 opacity-80 hover:opacity-100';

            html += `
                <div class="avatar-option group cursor-pointer p-2 rounded-2xl flex flex-col items-center gap-1.5 transition-all ${borderClass}" data-url="${url}" data-filename="${fileName}" data-price="${price}" data-displayname="${displayName}" data-unlocked="false">
                    <div class="w-full aspect-square rounded-xl overflow-hidden bg-slate-950/80 p-1 flex items-center justify-center relative">
                        <img src="${url}" alt="${displayName}" class="w-full h-full object-contain aspect-square filter brightness-50 group-hover:brightness-75 transition-all duration-200" />
                        <span class="absolute inset-0 flex items-center justify-center text-xl drop-shadow-md">🔒</span>
                    </div>
                    <span class="text-[10px] sm:text-[11px] font-mono font-bold text-amber-300 bg-amber-500/10 border border-amber-500/30 px-1.5 py-0.5 rounded-full text-center leading-tight">
                        ${isOwl ? '🎁 Day 7' : `$${price.toLocaleString()}`}
                    </span>
                </div>
            `;
        }
    });
    grid.innerHTML = html;

    grid.querySelectorAll('.avatar-option').forEach(el => {
        el.addEventListener('click', () => {
            const isUnlocked = el.dataset.unlocked === 'true';
            if (isUnlocked) {
                selectedAvatarUrl = el.dataset.url;
                updateProfilePreviewDisplay(selectedAvatarUrl);
                closeAvatarPickerModal();
            } else {
                const url = el.dataset.url;
                const price = Number(el.dataset.price);
                const displayName = el.dataset.displayname;
                promptBuyAvatar(url, price, displayName);
            }
        });
    });
}

const avatarPickerModalBackdrop = document.getElementById('avatar-picker-modal-backdrop');
const avatarPickerModal = document.getElementById('avatar-picker-modal');
const avatarPickerTrigger = document.getElementById('avatar-picker-trigger');
const closeAvatarPickerBtn = document.getElementById('close-avatar-picker-btn');

function openAvatarPickerModal() {
    if (!avatarPickerModalBackdrop || !avatarPickerModal) return;
    renderAvatarGrid();
    avatarPickerModalBackdrop.classList.remove('hidden');
    setTimeout(() => {
        avatarPickerModalBackdrop.classList.remove('opacity-0');
        avatarPickerModal.classList.remove('scale-95');
        avatarPickerModal.classList.add('scale-100');
    }, 10);
}

function closeAvatarPickerModal() {
    if (!avatarPickerModalBackdrop || !avatarPickerModal) return;
    avatarPickerModalBackdrop.classList.add('opacity-0');
    avatarPickerModal.classList.remove('scale-100');
    avatarPickerModal.classList.add('scale-95');
    setTimeout(() => avatarPickerModalBackdrop.classList.add('hidden'), 300);
}

if (avatarPickerTrigger) avatarPickerTrigger.addEventListener('click', openAvatarPickerModal);
if (closeAvatarPickerBtn) closeAvatarPickerBtn.addEventListener('click', closeAvatarPickerModal);
if (avatarPickerModalBackdrop) {
    avatarPickerModalBackdrop.addEventListener('click', (e) => {
        if (e.target === avatarPickerModalBackdrop) closeAvatarPickerModal();
    });
}

function populateCareerStats(stats = {}) {
    const accuracyEl = document.getElementById('profile-stat-accuracy');
    const wonEl = document.getElementById('profile-stat-auctions-won');
    const corrAccEl = document.getElementById('profile-stat-correction-accuracy');
    const bestBidEl = document.getElementById('profile-stat-best-bid');
    const streakEl = document.getElementById('profile-stat-streak');
    const bestStreakEl = document.getElementById('val-best-streak');

    if (accuracyEl) accuracyEl.textContent = `${stats.accuracy || 0}%`;
    if (wonEl) wonEl.textContent = (stats.auctionsWon || 0).toLocaleString();
    if (corrAccEl) corrAccEl.textContent = `${stats.correctionAccuracy || 0}%`;
    if (bestBidEl) bestBidEl.textContent = `$${(stats.bestBid || 0).toLocaleString()}`;
    if (streakEl) streakEl.textContent = stats.currentStreak || 0;
    if (bestStreakEl) bestStreakEl.textContent = stats.bestStreak || 0;
}

function updateRankProgressionUI(rankProgress = {}, xp = 0, rank = 'Grammar Novice') {
    const badgeEl = document.getElementById('profile-rank-badge');
    const titleEl = document.getElementById('profile-rank-title');
    const xpTextEl = document.getElementById('profile-xp-text');
    const nextRankTagEl = document.getElementById('profile-next-rank-tag');
    const progressBarEl = document.getElementById('profile-xp-progress-bar');

    const badge = rankProgress.currentRankBadge || '🌱';
    const rankTitle = rankProgress.currentRankName || rank || 'Grammar Novice';
    const currentXP = (rankProgress.currentXP !== undefined ? rankProgress.currentXP : xp).toLocaleString();
    const percent = rankProgress.progressPercent !== undefined ? rankProgress.progressPercent : 0;
    const statusText = rankProgress.statusText || 'MAX RANK';

    if (badgeEl) badgeEl.textContent = badge;
    if (titleEl) titleEl.textContent = rankTitle;
    if (xpTextEl) xpTextEl.textContent = `${currentXP} XP`;
    if (nextRankTagEl) nextRankTagEl.textContent = statusText;
    if (progressBarEl) progressBarEl.style.width = `${percent}%`;
}

async function openProfileModal() {
    if (!profileModalBackdrop || !profileModal) return;
    const currentUsername = localStorage.getItem('gb_username') || '';
    const currentAvatar = localStorage.getItem('gb_avatar') || `/images/profile/${PREBUILT_AVATARS[0]}`;
    const isGuest = localStorage.getItem('gb_isGuest') === 'true';

    const guestUpgradeCard = document.getElementById('guest-upgrade-card');
    const usernameTag = document.getElementById('username-change-tag');

    if (isGuest) {
        if (guestUpgradeCard) guestUpgradeCard.classList.remove('hidden');
        if (editUsernameInput) {
            editUsernameInput.disabled = true;
            editUsernameInput.title = 'Guest accounts cannot change their username. Sign up below to choose a custom username!';
        }
        if (usernameTag) {
            usernameTag.textContent = 'Locked (Guest)';
            usernameTag.className = 'text-[10px] sm:text-[11px] font-sans font-bold text-rose-300 bg-rose-500/20 px-2 py-0.5 rounded-full border border-rose-500/30';
        }
    } else {
        if (guestUpgradeCard) guestUpgradeCard.classList.add('hidden');
        if (editUsernameInput) {
            editUsernameInput.disabled = false;
            editUsernameInput.title = '';
        }
        if (usernameTag) {
            usernameTag.textContent = 'Fee: $300';
            usernameTag.className = 'text-[10px] sm:text-[11px] font-sans font-bold text-amber-300 bg-amber-500/20 px-2 py-0.5 rounded-full border border-amber-500/30';
        }
    }

    if (editUsernameInput) editUsernameInput.value = currentUsername;
    selectedAvatarUrl = currentAvatar;
    updateProfilePreviewDisplay(selectedAvatarUrl);

    if (profileModalAlert) profileModalAlert.classList.add('hidden');

    // Fetch user profile and career stats & rank progression from API
    const token = localStorage.getItem('gb_token');
    if (token) {
        try {
            const res = await fetch('/api/auth/me', {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (res.ok) {
                const data = await res.json();
                if (data.user) {
                    if (data.user.isGuest) {
                        localStorage.setItem('gb_isGuest', 'true');
                    } else {
                        localStorage.removeItem('gb_isGuest');
                    }
                    if (data.user.computedStats) {
                        populateCareerStats(data.user.computedStats);
                    }
                    if (data.user.rankProgress) {
                        updateRankProgressionUI(data.user.rankProgress, data.user.xp, data.user.rank);
                    }
                }
            }
        } catch (e) {
            console.warn('Failed to fetch user stats:', e);
        }
    }

    profileModalBackdrop.classList.remove('hidden');
    setTimeout(() => {
        profileModalBackdrop.classList.remove('opacity-0');
        profileModal.classList.remove('scale-95');
        profileModal.classList.add('scale-100');
    }, 10);
}

function closeProfileModal() {
    if (!profileModalBackdrop || !profileModal) return;
    profileModalBackdrop.classList.add('opacity-0');
    profileModal.classList.remove('scale-100');
    profileModal.classList.add('scale-95');
    setTimeout(() => profileModalBackdrop.classList.add('hidden'), 300);
}

const mobileProfileTrigger = document.getElementById('mobile-user-profile-trigger');
const mobileEditProfileBtn = document.getElementById('mobile-edit-profile-btn');

function handleOpenProfile() {
    if (typeof closeMobileMenu === 'function') closeMobileMenu();
    openProfileModal();
}

if (desktopProfileBtn) desktopProfileBtn.addEventListener('click', openProfileModal);
if (mobileProfileTrigger) mobileProfileTrigger.addEventListener('click', handleOpenProfile);
if (mobileEditProfileBtn) mobileEditProfileBtn.addEventListener('click', handleOpenProfile);
if (closeProfileModalBtn) closeProfileModalBtn.addEventListener('click', closeProfileModal);
if (cancelProfileBtn) cancelProfileBtn.addEventListener('click', closeProfileModal);
if (profileModalBackdrop) {
    profileModalBackdrop.addEventListener('click', (e) => {
        if (e.target === profileModalBackdrop) closeProfileModal();
    });
}

if (saveProfileBtn) {
    saveProfileBtn.addEventListener('click', async () => {
        const isGuest = localStorage.getItem('gb_isGuest') === 'true';
        const newUsername = editUsernameInput ? editUsernameInput.value.trim() : '';
        const currentUsername = localStorage.getItem('gb_username') || '';
        const userToken = localStorage.getItem('gb_token');

        if (isGuest && newUsername !== currentUsername) {
            if (profileModalAlert) {
                profileModalAlert.textContent = 'Guest accounts cannot change their username. Sign up in the profile section to pick a custom username!';
                profileModalAlert.className = 'text-xs font-sans text-center p-2.5 rounded-xl bg-rose-500/20 text-rose-300 border border-rose-500/30';
                profileModalAlert.classList.remove('hidden');
            }
            return;
        }

        if (!newUsername || newUsername.length < 3 || newUsername.length > 20) {
            if (profileModalAlert) {
                profileModalAlert.textContent = 'Username must be between 3 and 20 characters.';
                profileModalAlert.className = 'text-xs font-sans text-center p-2.5 rounded-xl bg-rose-500/20 text-rose-300 border border-rose-500/30';
                profileModalAlert.classList.remove('hidden');
            }
            return;
        }

        const isChangingUsername = newUsername !== currentUsername;

        const performSave = async () => {
            saveProfileBtn.disabled = true;
            saveProfileBtn.textContent = 'Saving...';

            try {
                const bodyPayload = {};
                if (!isGuest && isChangingUsername) {
                    bodyPayload.username = newUsername;
                }
                if (selectedAvatarUrl) {
                    bodyPayload.avatar = selectedAvatarUrl;
                }

                const res = await fetch('/api/auth/profile', {
                    method: 'PUT',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${userToken}`
                    },
                    body: JSON.stringify(bodyPayload)
                });

                const data = await res.json();
                if (!res.ok) {
                    throw new Error(data.error || 'Failed to update profile');
                }

                localStorage.setItem('gb_username', data.user.username);
                if (data.user.avatar) localStorage.setItem('gb_avatar', data.user.avatar);
                if (data.user.cash !== undefined) localStorage.setItem('gb_cash', data.user.cash);
                if (data.token) localStorage.setItem('gb_token', data.token);

                syncProfileHeader();
                closeProfileModal();
            } catch (err) {
                if (profileModalAlert) {
                    profileModalAlert.textContent = err.message;
                    profileModalAlert.className = 'text-xs font-sans text-center p-2.5 rounded-xl bg-rose-500/20 text-rose-300 border border-rose-500/30';
                    profileModalAlert.classList.remove('hidden');
                }
            } finally {
                saveProfileBtn.disabled = false;
                saveProfileBtn.textContent = 'Save Profile';
            }
        };

        if (isChangingUsername && !isGuest) {
            showConfirmModal({
                title: 'Change Username ($300 Fee)',
                message: `Are you sure you want to change your username to "${newUsername}"? This will deduct $300 from your in-game cash.`,
                confirmText: 'Pay $300 & Change',
                onConfirm: performSave
            });
        } else {
            performSave();
        }
    });
}

// Guest Conversion Form Listener
const convertGuestForm = document.getElementById('convert-guest-form');
if (convertGuestForm) {
    convertGuestForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const errEl = document.getElementById('convert-guest-error');
        const submitBtn = document.getElementById('convert-guest-btn');
        if (errEl) errEl.classList.add('hidden');

        const newUsername = document.getElementById('convert-username-input').value.trim();
        const password = document.getElementById('convert-password-input').value;
        const confirmPassword = document.getElementById('convert-confirm-password-input').value;

        if (password !== confirmPassword) {
            if (errEl) {
                errEl.textContent = 'Passwords do not match.';
                errEl.classList.remove('hidden');
            }
            return;
        }

        const token = localStorage.getItem('gb_token');
        if (!token) return;

        submitBtn.disabled = true;
        submitBtn.textContent = 'Creating Account...';

        try {
            const res = await fetch('/api/auth/convert-guest', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({ username: newUsername, password })
            });

            const data = await res.json();
            if (!res.ok) {
                throw new Error(data.error || 'Failed to convert guest account.');
            }

            localStorage.setItem('gb_token', data.token);
            localStorage.setItem('gb_username', data.user.username);
            localStorage.removeItem('gb_isGuest');

            syncProfileHeader();
            closeProfileModal();

            showConfirmModal({
                title: '🎉 Account Upgraded!',
                message: `Congratulations ${data.user.username}! Your guest account has been converted into a full account. All your cash, XP, rank, power cards & stats are safely stored!`,
                confirmText: 'Awesome!',
                onConfirm: () => { }
            });
        } catch (err) {
            if (errEl) {
                errEl.textContent = err.message;
                errEl.classList.remove('hidden');
            }
        } finally {
            submitBtn.disabled = false;
            submitBtn.textContent = 'Create Account & Save All Data 🚀';
        }
    });
}

// ── Guest Post-Match Sign Up Gate System ──────────────────────
function checkGuestSignupGate() {
    const isGuest = localStorage.getItem('gb_isGuest') === 'true';
    const tutorialCompleted = localStorage.getItem('gb_tutorial_completed') === 'true';
    const gateModal = document.getElementById('guest-signup-gate-modal');

    if (isGuest && tutorialCompleted && gateModal) {
        gateModal.classList.remove('hidden');
        gateModal.classList.add('flex');
        return true;
    }
    return false;
}

const gateSignupForm = document.getElementById('gate-signup-form');
if (gateSignupForm) {
    gateSignupForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const errEl = document.getElementById('gate-signup-error');
        const submitBtn = document.getElementById('gate-signup-submit-btn');
        if (errEl) errEl.classList.add('hidden');

        const newUsername = document.getElementById('gate-username-input').value.trim();
        const password = document.getElementById('gate-password-input').value;
        const confirmPassword = document.getElementById('gate-confirm-password-input').value;

        if (password !== confirmPassword) {
            if (errEl) {
                errEl.textContent = 'Passwords do not match.';
                errEl.classList.remove('hidden');
            }
            return;
        }

        const token = localStorage.getItem('gb_token');
        if (!token) return;

        submitBtn.disabled = true;
        submitBtn.textContent = 'Creating Account...';

        try {
            const res = await fetch('/api/auth/convert-guest', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({ username: newUsername, password })
            });

            const data = await res.json();
            if (!res.ok) {
                throw new Error(data.error || 'Failed to create account.');
            }

            localStorage.setItem('gb_token', data.token);
            localStorage.setItem('gb_username', data.user.username);
            localStorage.removeItem('gb_isGuest');

            const gateModal = document.getElementById('guest-signup-gate-modal');
            if (gateModal) {
                gateModal.classList.add('hidden');
                gateModal.classList.remove('flex');
            }

            syncProfileHeader();

            showConfirmModal({
                title: '🎉 Welcome to Grammar Bid!',
                message: `Congratulations ${data.user.username}! Your permanent account is ready and all your progress is saved. Enjoy unlimited matches!`,
                confirmText: 'Let\'s Play! 🚀',
                onConfirm: () => { }
            });
        } catch (err) {
            if (errEl) {
                errEl.textContent = err.message;
                errEl.classList.remove('hidden');
            }
        } finally {
            submitBtn.disabled = false;
            submitBtn.textContent = 'Create Account & Save All Data 🚀';
        }
    });
}

document.addEventListener('DOMContentLoaded', () => {
    checkGuestSignupGate();
});

// ── Confirmation Modal System ─────────────────────────────
function showConfirmModal({ title = 'Confirm Action', message = 'Are you sure?', confirmText = 'Confirm', onConfirm }) {
    const backdrop = document.getElementById('confirm-modal-backdrop');
    const modal = document.getElementById('confirm-modal');
    const titleEl = document.getElementById('confirm-modal-title');
    const textEl = document.getElementById('confirm-modal-text');
    const okBtn = document.getElementById('confirm-ok-btn');
    const cancelBtn = document.getElementById('confirm-cancel-btn');

    if (!backdrop || !modal) {
        if (confirm(message)) {
            if (onConfirm) onConfirm();
        }
        return;
    }

    if (titleEl) titleEl.textContent = title;
    if (textEl) textEl.textContent = message;

    const closeConfirm = () => {
        backdrop.classList.add('opacity-0');
        modal.classList.remove('scale-100');
        modal.classList.add('scale-95');
        setTimeout(() => backdrop.classList.add('hidden'), 300);
    };

    const newOkBtn = okBtn.cloneNode(true);
    const newCancelBtn = cancelBtn.cloneNode(true);
    newOkBtn.textContent = confirmText;
    okBtn.parentNode.replaceChild(newOkBtn, okBtn);
    cancelBtn.parentNode.replaceChild(newCancelBtn, cancelBtn);

    newOkBtn.addEventListener('click', () => {
        closeConfirm();
        if (onConfirm) onConfirm();
    });

    newCancelBtn.addEventListener('click', closeConfirm);

    backdrop.classList.remove('hidden');
    setTimeout(() => {
        backdrop.classList.remove('opacity-0');
        modal.classList.remove('scale-95');
        modal.classList.add('scale-100');
    }, 10);
}

// ── Logout Handling with Confirmation ─────────────────────
function triggerLogout() {
    showConfirmModal({
        title: 'Log Out',
        message: 'Are you sure you want to log out of Grammar Bid?',
        confirmText: 'Log Out',
        onConfirm: () => {
            localStorage.removeItem('gb_token');
            localStorage.removeItem('gb_userId');
            localStorage.removeItem('gb_username');
            localStorage.removeItem('gb_avatar');
            localStorage.removeItem('gb_cash');
            window.location.href = 'login.html';
        }
    });
}

const indexLogoutBtn = document.getElementById('index-logout-btn');
const mobileLogoutBtn = document.getElementById('mobile-logout-btn');

if (indexLogoutBtn) indexLogoutBtn.addEventListener('click', triggerLogout);
if (mobileLogoutBtn) mobileLogoutBtn.addEventListener('click', triggerLogout);

// Initial sync on page load
syncProfileHeader();
fetchUserProfile();

// ── Leaderboard Modal & API Fetching ───────────────────────
const leaderboardBtn = document.getElementById('leaderboard-btn');
const mobileLeaderboardBtn = document.getElementById('mobile-leaderboard-btn');
const leaderboardModalBackdrop = document.getElementById('leaderboard-modal-backdrop');
const leaderboardModal = document.getElementById('leaderboard-modal');
const closeLeaderboardModalBtn = document.getElementById('close-leaderboard-modal-btn');
const leaderboardListContainer = document.getElementById('leaderboard-list-container');
const myRankBadge = document.getElementById('my-rank-badge');
const myRankAvatarImg = document.getElementById('my-rank-avatar-img');
const myRankUsername = document.getElementById('my-rank-username');
const myRankCash = document.getElementById('my-rank-cash');

function openLeaderboardModal() {
    if (!leaderboardModalBackdrop || !leaderboardModal) return;
    if (typeof closeMenu === 'function') closeMenu();

    leaderboardModalBackdrop.classList.remove('hidden');
    setTimeout(() => {
        leaderboardModalBackdrop.classList.remove('opacity-0');
        leaderboardModal.classList.remove('scale-95');
        leaderboardModal.classList.add('scale-100');
    }, 10);

    fetchLeaderboardData();
}

function closeLeaderboardModal() {
    if (!leaderboardModalBackdrop || !leaderboardModal) return;
    leaderboardModalBackdrop.classList.add('opacity-0');
    leaderboardModal.classList.remove('scale-100');
    leaderboardModal.classList.add('scale-95');
    setTimeout(() => leaderboardModalBackdrop.classList.add('hidden'), 300);
}

async function fetchLeaderboardData() {
    const userToken = localStorage.getItem('gb_token');
    const headers = {};
    if (userToken) headers['Authorization'] = `Bearer ${userToken}`;

    try {
        const res = await fetch('/api/leaderboard', { headers });
        if (!res.ok) throw new Error('Failed to load');
        const data = await res.json();
        renderLeaderboard(data.leaderboard, data.myRank);
    } catch (err) {
        console.error('Error fetching leaderboard:', err);
        if (leaderboardListContainer) {
            leaderboardListContainer.innerHTML = `
                <div class="text-center text-rose-400 text-xs py-6 font-serif italic">
                    Unable to load rankings. Please try again later.
                </div>
            `;
        }
    }
}

function renderLeaderboard(top10List, myRankData) {
    if (!leaderboardListContainer) return;

    if (!top10List || top10List.length === 0) {
        leaderboardListContainer.innerHTML = `
            <div class="text-center text-white/50 text-sm py-6 font-serif italic">
                No rankings available yet.
            </div>
        `;
        return;
    }

    const currentUserId = localStorage.getItem('gb_userId');

    leaderboardListContainer.innerHTML = top10List.map(player => {
        const isMe = currentUserId && player.userId === currentUserId;
        const formattedCash = Number(player.cash).toLocaleString('en-US');

        let medalEmoji = `#${player.rank}`;

        if (player.rank === 1) {
            medalEmoji = '🥇';
        } else if (player.rank === 2) {
            medalEmoji = '🥈';
        } else if (player.rank === 3) {
            medalEmoji = '🥉';
        } else if (player.rank === 4) {
            medalEmoji = '🎖️';
        }

        const borderClass = isMe
            ? 'border-2 border-emerald-400/80 bg-emerald-500/10 shadow-[0_0_15px_rgba(52,211,153,0.3)]'
            : 'border border-white/15 bg-white/[0.03] hover:bg-white/[0.08]';

        return `
            <div class="flex items-center justify-between p-2.5 sm:p-3 rounded-2xl ${borderClass} transition-all">
                <div class="flex items-center gap-3">
                    <span class="w-8 text-center font-sans font-bold text-base sm:text-lg flex items-center justify-center shrink-0">
                        ${medalEmoji}
                    </span>
                    <img src="${player.avatar}" alt="${player.username}" class="w-9 h-9 rounded-full object-cover border border-white/20 shadow-sm shrink-0" />
                    <span class="font-serif italic text-sm sm:text-base text-white font-medium truncate max-w-[120px] sm:max-w-[160px]">
                        ${player.username} ${isMe ? '<strong class="text-emerald-300 not-italic">(You)</strong>' : ''}
                    </span>
                </div>
                <span class="font-mono text-sm sm:text-base font-bold text-emerald-300 shrink-0">
                    $${formattedCash}
                </span>
            </div>
        `;
    }).join('');

    // Render Sticky Bottom Bar for Your Standing
    if (myRankData) {
        if (myRankBadge) myRankBadge.textContent = `#${myRankData.rank}`;
        if (myRankAvatarImg) myRankAvatarImg.src = myRankData.avatar;
        if (myRankUsername) myRankUsername.textContent = myRankData.username;
        if (myRankCash) myRankCash.textContent = `$${Number(myRankData.cash).toLocaleString('en-US')}`;
    } else {
        const username = localStorage.getItem('gb_username') || 'You';
        const avatar = localStorage.getItem('gb_avatar') || 'https://api.dicebear.com/7.x/initials/svg?seed=GB';
        const cashVal = localStorage.getItem('gb_cash') !== null ? localStorage.getItem('gb_cash') : '10000';

        if (myRankBadge) myRankBadge.textContent = `#--`;
        if (myRankAvatarImg) myRankAvatarImg.src = avatar;
        if (myRankUsername) myRankUsername.textContent = username;
        if (myRankCash) myRankCash.textContent = `$${Number(cashVal).toLocaleString('en-US')}`;
    }
}

if (leaderboardBtn) leaderboardBtn.addEventListener('click', openLeaderboardModal);
if (mobileLeaderboardBtn) mobileLeaderboardBtn.addEventListener('click', openLeaderboardModal);
if (closeLeaderboardModalBtn) closeLeaderboardModalBtn.addEventListener('click', closeLeaderboardModal);
if (leaderboardModalBackdrop) {
    leaderboardModalBackdrop.addEventListener('click', (e) => {
        if (e.target === leaderboardModalBackdrop) closeLeaderboardModal();
    });
}

// ═══════════════════════════════════════════════════════════════
//  Homepage Inbox System Handlers
// ═══════════════════════════════════════════════════════════════

const inboxBtn = document.getElementById('inbox-btn');
const inboxBadge = document.getElementById('inbox-badge');
const mobileInboxBtn = document.getElementById('mobile-inbox-btn');
const mobileInboxBadge = document.getElementById('mobile-inbox-badge');
const inboxModal = document.getElementById('inbox-modal');
const inboxCloseBtn = document.getElementById('inbox-close-btn');
const inboxMarkAllBtn = document.getElementById('inbox-mark-all-btn');
const inboxList = document.getElementById('inbox-list');

async function fetchHomepageUnreadCount() {
    const token = localStorage.getItem('gb_token');
    if (!token) return;
    try {
        const res = await fetch('/api/inbox/unread-count', {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const data = await res.json();
        if (data.unreadCount !== undefined) {
            const badgeText = data.unreadCount > 9 ? '9+' : data.unreadCount;
            const isHidden = data.unreadCount === 0;

            [inboxBadge, mobileInboxBadge].forEach(badge => {
                if (badge) {
                    badge.textContent = badgeText;
                    if (isHidden) {
                        badge.classList.add('hidden');
                    } else {
                        badge.classList.remove('hidden');
                    }
                }
            });
        }
    } catch (e) { console.error('Unread count error:', e); }
}

function escapeHtmlStr(str) {
    if (str === null || str === undefined) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

async function loadHomepageInbox() {
    const token = localStorage.getItem('gb_token');
    if (!token) return;
    if (inboxList) inboxList.innerHTML = '<div class="text-center text-white/40 text-sm py-8 animate-pulse">Loading messages...</div>';
    try {
        const res = await fetch('/api/inbox', {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const data = await res.json();
        renderHomepageInboxMessages(data.messages || []);
        fetchHomepageUnreadCount();
    } catch (e) {
        console.error('Inbox load error:', e);
        if (inboxList) inboxList.innerHTML = '<div class="text-center text-rose-400 text-sm py-8">Failed to load messages.</div>';
    }
}

function renderHomepageInboxMessages(messages) {
    if (!inboxList) return;
    if (messages.length === 0) {
        inboxList.innerHTML = '<div class="text-center text-white/40 text-sm py-8">Your inbox is empty.</div>';
        return;
    }

    inboxList.innerHTML = messages.map(msg => {
        const unreadBorder = !msg.isRead ? 'border-amber-500/50 bg-amber-500/10' : 'border-white/10 bg-white/[0.03]';
        const isRankReward = msg.metadata && (msg.metadata.showAnimation || msg.metadata.rankName);
        const icon = isRankReward ? (msg.metadata.rankBadge || '🏆') : (msg.type === 'compensation' ? '💰' : (msg.type === 'reward' ? '🎁' : (msg.type === 'news' ? '📰' : '📢')));

        const typeBadge = isRankReward
            ? `<span class="px-2 py-0.5 rounded-full text-[10px] font-bold bg-purple-500/20 text-purple-300 border border-purple-500/30 flex items-center gap-1">🏆 RANK UNLOCKED</span>`
            : (msg.type === 'reward'
                ? `<span class="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">🎁 CASH REWARD</span>`
                : (msg.type === 'news'
                    ? `<span class="px-2 py-0.5 rounded-full text-[10px] font-bold bg-cyan-500/20 text-cyan-300 border border-cyan-500/30">📰 NEWS</span>`
                    : (msg.type === 'compensation' ? `<span class="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-500/20 text-amber-300 border border-amber-500/30">💰 COMPENSATION</span>` : '')));

        const imageTag = (msg.imageUrl || (msg.metadata && msg.metadata.imageUrl))
            ? `<div class="my-2 rounded-xl overflow-hidden border border-white/15 shadow-md">
                <img src="${msg.imageUrl || msg.metadata.imageUrl}" alt="Message Attachment" class="w-full max-h-64 object-contain bg-slate-900/80" />
               </div>`
            : '';

        const amountTag = (msg.metadata && msg.metadata.amount)
            ? `<div class="inline-flex items-center gap-1 px-3 py-1 rounded-full bg-emerald-500/20 border border-emerald-500/40 text-emerald-300 text-xs font-mono font-bold">
                <span>💵</span> +$${msg.metadata.amount.toLocaleString()} Credited to Balance
               </div>`
            : '';

        const animationBtn = isRankReward
            ? `<div class="mt-2 pt-2 border-t border-white/10 flex items-center justify-between">
                <span class="text-xs font-mono font-semibold text-purple-300">${msg.metadata.rankBadge || '🏆'} ${escapeHtmlStr(msg.metadata.rankName || 'New Rank')}</span>
                <button onclick="triggerRankUnlockAnimation(event, '${escapeHtmlStr(msg.metadata.rankName || 'Grammar Master')}', '${escapeHtmlStr(msg.metadata.rankBadge || '🏆')}', ${msg.metadata.xp || 0})"
                    class="px-3.5 py-1.5 rounded-full bg-gradient-to-r from-amber-500 via-purple-600 to-emerald-500 hover:from-amber-400 hover:to-emerald-400 text-white font-bold text-xs shadow-lg hover:scale-105 active:scale-95 transition-all flex items-center gap-1.5 cursor-pointer border border-amber-300/40">
                    <span>✨</span> Show Animation
                </button>
               </div>`
            : '';

        return `
            <div class="p-4 rounded-2xl border ${unreadBorder} transition-all space-y-2 cursor-pointer hover:border-white/20" onclick="markHomepageMessageRead('${msg._id}')">
                <div class="flex items-center justify-between gap-2 border-b border-white/10 pb-2 flex-wrap">
                    <div class="flex items-center gap-2">
                        <span class="text-lg">${icon}</span>
                        <h4 class="text-sm font-bold text-white font-serif">${escapeHtmlStr(msg.title)}</h4>
                    </div>
                    <div class="flex items-center gap-2">
                        ${typeBadge}
                        <span class="text-[10px] text-white/40 font-mono">${new Date(msg.createdAt).toLocaleDateString()}</span>
                        <button onclick="deleteHomepageMessage(event, '${msg._id}')" title="Delete Message"
                            class="p-1 rounded-md text-white/40 hover:text-rose-400 hover:bg-rose-500/20 transition-all cursor-pointer">
                            <svg class="w-4 h-4" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
                                <path stroke-linecap="round" stroke-linejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                            </svg>
                        </button>
                    </div>
                </div>
                <p class="text-xs text-white/80 whitespace-pre-line font-sans leading-relaxed">${escapeHtmlStr(msg.body)}</p>
                ${imageTag}
                ${amountTag}
                ${animationBtn}
            </div>
        `;
    }).join('');
}

async function markHomepageMessageRead(messageId) {
    const token = localStorage.getItem('gb_token');
    if (!token) return;
    try {
        await fetch(`/api/inbox/${messageId}/read`, {
            method: 'PUT',
            headers: { 'Authorization': `Bearer ${token}` }
        });
        fetchHomepageUnreadCount();
    } catch (e) { console.error('Mark read error:', e); }
}

async function deleteHomepageMessage(event, messageId) {
    if (event) event.stopPropagation();
    const token = localStorage.getItem('gb_token');
    if (!token) return;

    try {
        const res = await fetch(`/api/inbox/${messageId}`, {
            method: 'DELETE',
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const data = await res.json();
        if (data.success) {
            loadHomepageInbox();
            fetchHomepageUnreadCount();
        }
    } catch (e) {
        console.error('Delete message error:', e);
    }
}

// ── CSS Emoji Rank Unlock GIF-like Animation Player ─────────────────────
function triggerRankUnlockAnimation(event, rankName = 'Grammar Judge', rankBadge = '🏆', xp = 0) {
    if (event && typeof event.stopPropagation === 'function') event.stopPropagation();

    const backdrop = document.getElementById('rankup-modal-backdrop');
    const modal = document.getElementById('rankup-modal');
    const badgeEl = document.getElementById('rankup-modal-badge');
    const titleEl = document.getElementById('rankup-modal-title');
    const subtitleEl = document.getElementById('rankup-modal-subtitle');
    const oldRankEl = document.getElementById('rankup-old-rank');
    const newRankEl = document.getElementById('rankup-new-rank');

    if (badgeEl) badgeEl.textContent = rankBadge;
    if (titleEl) {
        titleEl.textContent = rankName;
        titleEl.className = 'font-cinzel text-3xl font-bold tracking-wide mt-2 shimmer-text';
    }
    if (subtitleEl) subtitleEl.textContent = `Congratulations! You unlocked the title of ${rankName}.`;
    if (oldRankEl) oldRankEl.textContent = 'Unlocked!';
    if (newRankEl) newRankEl.textContent = rankName;

    // Create CSS animated emoji particle burst background
    const container = modal || document.body;
    const existingParticles = container.querySelectorAll('.rank-emoji-particle');
    existingParticles.forEach(p => p.remove());

    const emojis = [rankBadge, '✨', '🎉', '🌟', '⚡', '🏆', '👑', '📜', '🎓'];
    for (let i = 0; i < 20; i++) {
        const particle = document.createElement('div');
        particle.className = 'rank-emoji-particle absolute pointer-events-none text-2xl sm:text-3xl animate-emoji-burst z-20';
        particle.textContent = emojis[i % emojis.length];

        const left = Math.floor(Math.random() * 80) + 10;
        const top = Math.floor(Math.random() * 70) + 10;
        const delay = (Math.random() * 1.2).toFixed(2);
        const duration = (1.5 + Math.random() * 1.5).toFixed(2);

        particle.style.left = `${left}%`;
        particle.style.top = `${top}%`;
        particle.style.animationDelay = `${delay}s`;
        particle.style.animationDuration = `${duration}s`;

        container.appendChild(particle);
    }

    if (backdrop && modal) {
        backdrop.classList.remove('hidden');
        setTimeout(() => {
            backdrop.classList.remove('opacity-0');
            modal.classList.remove('scale-90');
            modal.classList.add('scale-100');
        }, 10);
    }
}

window.triggerRankUnlockAnimation = triggerRankUnlockAnimation;

const rankupCloseBtn = document.getElementById('rankup-close-btn');
const rankupModalBackdrop = document.getElementById('rankup-modal-backdrop');
const rankupModal = document.getElementById('rankup-modal');

if (rankupCloseBtn && rankupModalBackdrop) {
    rankupCloseBtn.addEventListener('click', () => {
        rankupModalBackdrop.classList.add('opacity-0');
        if (rankupModal) {
            rankupModal.classList.remove('scale-100');
            rankupModal.classList.add('scale-90');
        }
        setTimeout(() => rankupModalBackdrop.classList.add('hidden'), 500);
    });
}

[inboxBtn, mobileInboxBtn].forEach(btn => {
    if (btn) {
        btn.addEventListener('click', () => {
            if (inboxModal) {
                inboxModal.classList.remove('hidden');
                inboxModal.classList.add('flex');
            }
            loadHomepageInbox();
        });
    }
});

if (inboxCloseBtn) {
    inboxCloseBtn.addEventListener('click', () => {
        if (inboxModal) {
            inboxModal.classList.add('hidden');
            inboxModal.classList.remove('flex');
        }
    });
}

if (inboxMarkAllBtn) {
    inboxMarkAllBtn.addEventListener('click', async () => {
        const token = localStorage.getItem('gb_token');
        if (!token) return;
        try {
            await fetch('/api/inbox/read-all', {
                method: 'PUT',
                headers: { 'Authorization': `Bearer ${token}` }
            });
            loadHomepageInbox();
        } catch (e) { console.error('Mark all read error:', e); }
    });
}

const inboxClearAllBtn = document.getElementById('inbox-clear-all-btn');
if (inboxClearAllBtn) {
    inboxClearAllBtn.addEventListener('click', async () => {
        const token = localStorage.getItem('gb_token');
        if (!token) return;
        if (!confirm('Are you sure you want to delete all messages in your inbox?')) return;
        try {
            await fetch('/api/inbox', {
                method: 'DELETE',
                headers: { 'Authorization': `Bearer ${token}` }
            });
            loadHomepageInbox();
            fetchHomepageUnreadCount();
        } catch (e) { console.error('Clear all inbox error:', e); }
    });
}

function escapeHtmlStr(str) {
    if (!str) return '';
    return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// Initial unread count check
fetchHomepageUnreadCount();

// ─── DAILY REWARDS SYSTEM CLIENT LOGIC ─────────────────────────
let dailyCountdownInterval = null;

const dailyRewardBtn = document.getElementById('daily-reward-btn');
const mobileDailyRewardBtn = document.getElementById('mobile-daily-reward-btn');
const dailyModalBackdrop = document.getElementById('daily-reward-modal-backdrop');
const closeDailyModalBtn = document.getElementById('close-daily-reward-btn');
const claimDailyBtn = document.getElementById('claim-daily-reward-btn');
const dailyStreakCount = document.getElementById('daily-streak-count');
const dailyRewardsGrid = document.getElementById('daily-rewards-grid');
const dailyActionArea = document.getElementById('daily-reward-action-area');
const dailyCountdownBox = document.getElementById('daily-countdown-box');
const dailyCountdownTimer = document.getElementById('daily-countdown-timer');
const dailyBadge = document.getElementById('daily-reward-badge');

const celebrationBackdrop = document.getElementById('daily-celebration-backdrop');
const celebrationTitle = document.getElementById('daily-celebration-title');
const celebrationSubtitle = document.getElementById('daily-celebration-subtitle');
const celebrationIcon = document.getElementById('daily-celebration-icon');
const celebrationCloseBtn = document.getElementById('daily-celebration-close-btn');

async function fetchDailyRewardStatus() {
    const token = localStorage.getItem('gb_token');
    if (!token) return null;
    try {
        const res = await fetch('/api/daily-reward/status', {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        if (!res.ok) return null;
        return await res.json();
    } catch (e) {
        console.error('Fetch daily reward status error:', e);
        return null;
    }
}

function updateDailyRewardBadge(status) {
    if (!dailyBadge) return;
    if (status && status.canClaim) {
        dailyBadge.classList.remove('hidden');
    } else {
        dailyBadge.classList.add('hidden');
    }
}

function renderDailyRewardsSchedule(schedule, currentDay, canClaim) {
    if (!dailyRewardsGrid) return;
    dailyRewardsGrid.innerHTML = '';

    schedule.forEach(item => {
        const isDay7 = item.day === 7;
        const card = document.createElement('div');

        let cardBg = 'bg-white/[0.03] border-white/10 text-white/50';
        let statusBadge = `<span class="text-[10px] font-sans px-2 py-0.5 rounded-full bg-white/5 border border-white/10 text-white/40">Locked 🔒</span>`;

        if (item.state === 'claimed') {
            cardBg = 'bg-emerald-950/30 border-emerald-500/40 text-emerald-300';
            statusBadge = `<span class="text-[10px] font-sans font-bold px-2 py-0.5 rounded-full bg-emerald-500/20 border border-emerald-500/40 text-emerald-300 flex items-center gap-1">✓ Claimed</span>`;
        } else if (item.state === 'available') {
            cardBg = isDay7
                ? 'bg-gradient-to-b from-amber-900/60 to-purple-900/60 border-2 border-amber-400 text-white shadow-[0_0_30px_rgba(251,191,36,0.5)] animate-pulse'
                : 'bg-gradient-to-b from-amber-950/40 to-slate-900 border-2 border-amber-400/80 text-amber-200 shadow-[0_0_20px_rgba(251,191,36,0.3)] animate-pulse';
            statusBadge = `<span class="text-[10px] font-sans font-bold px-2.5 py-0.5 rounded-full bg-amber-400 text-slate-950 shadow-md">READY 🎁</span>`;
        } else if (isDay7) {
            cardBg = 'bg-gradient-to-b from-purple-950/40 to-slate-900 border border-purple-500/30 text-purple-200';
        }

        const colSpan = isDay7 ? 'col-span-2 sm:col-span-2' : 'col-span-1';

        card.className = `${colSpan} ${cardBg} relative rounded-2xl p-3 flex flex-col items-center justify-between text-center transition-all duration-300 hover:scale-102`;

        card.innerHTML = `
            <div class="flex items-center justify-between w-full text-[11px] font-sans font-bold mb-1">
                <span class="${item.state === 'claimed' ? 'text-emerald-400' : (item.state === 'available' ? 'text-amber-300' : 'text-white/60')}">Day ${item.day}</span>
                ${statusBadge}
            </div>

            <div class="text-3xl my-1.5 transform transition-transform hover:scale-110">
                ${item.icon || '🎁'}
            </div>

            <div class="font-sans font-bold text-xs sm:text-sm tracking-wide ${isDay7 ? 'text-amber-300' : ''}">
                ${item.label}
            </div>
            ${item.note ? `<div class="text-[10px] font-serif italic text-white/50 mt-0.5">${item.note}</div>` : ''}
        `;

        dailyRewardsGrid.appendChild(card);
    });
}

function startDailyCountdown(nextClaimTimeIso) {
    if (dailyCountdownInterval) clearInterval(dailyCountdownInterval);
    if (!dailyCountdownTimer || !nextClaimTimeIso) return;

    function update() {
        const now = new Date().getTime();
        const target = new Date(nextClaimTimeIso).getTime();
        const diff = Math.max(0, target - now);

        if (diff <= 0) {
            clearInterval(dailyCountdownInterval);
            dailyCountdownTimer.textContent = '00:00:00';
            openDailyRewardModal();
            return;
        }

        const hours = String(Math.floor(diff / (1000 * 60 * 60))).padStart(2, '0');
        const minutes = String(Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60))).padStart(2, '0');
        const seconds = String(Math.floor((diff % (1000 * 60)) / 1000)).padStart(2, '0');
        dailyCountdownTimer.textContent = `${hours}:${minutes}:${seconds}`;
    }

    update();
    dailyCountdownInterval = setInterval(update, 1000);
}

async function openDailyRewardModal() {
    if (!dailyModalBackdrop) return;
    dailyModalBackdrop.classList.remove('hidden');
    setTimeout(() => dailyModalBackdrop.classList.remove('opacity-0'), 10);
    document.body.classList.add('overflow-hidden');

    const status = await fetchDailyRewardStatus();
    if (!status) return;

    updateDailyRewardBadge(status);

    if (dailyStreakCount) {
        dailyStreakCount.textContent = `Daily Streak: ${status.dailyStreak} Day${status.dailyStreak === 1 ? '' : 's'}`;
    }

    renderDailyRewardsSchedule(status.schedule, status.currentDay, status.canClaim);

    if (status.canClaim) {
        if (dailyActionArea) dailyActionArea.classList.remove('hidden');
        if (dailyCountdownBox) dailyCountdownBox.classList.add('hidden');
    } else {
        if (dailyActionArea) dailyActionArea.classList.add('hidden');
        if (dailyCountdownBox) dailyCountdownBox.classList.remove('hidden');
        startDailyCountdown(status.nextClaimTime);
    }
}

function closeDailyRewardModal() {
    if (!dailyModalBackdrop) return;
    dailyModalBackdrop.classList.add('opacity-0');
    document.body.classList.remove('overflow-hidden');
    setTimeout(() => dailyModalBackdrop.classList.add('hidden'), 300);
}

async function handleClaimDailyReward() {
    const token = localStorage.getItem('gb_token');
    if (!token) return;

    if (claimDailyBtn) {
        claimDailyBtn.disabled = true;
        claimDailyBtn.innerHTML = `<span>⏳</span> CLAIMING...`;
    }

    try {
        const res = await fetch('/api/daily-reward/claim', {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const data = await res.json();

        if (res.ok && data.success) {
            // Play win audio if available
            try {
                const sfx = new Audio('/SFX/win_cash.mp3');
                sfx.volume = 0.7;
                sfx.play().catch(() => { });
            } catch (e) { }

            // Trigger celebration modal
            if (celebrationTitle) celebrationTitle.textContent = data.reward.label;
            if (celebrationSubtitle) celebrationSubtitle.textContent = `Daily Streak: ${data.newDailyStreak} Day${data.newDailyStreak === 1 ? '' : 's'} 🔥`;
            if (celebrationIcon) celebrationIcon.textContent = data.reward.icon || '🎁';

            if (celebrationBackdrop) {
                celebrationBackdrop.classList.remove('hidden');
                setTimeout(() => celebrationBackdrop.classList.remove('opacity-0'), 10);
            }

            // Reload user stats on page header & sync unlocked avatars
            fetchUserProfile();
            if (typeof fetchUserData === 'function') {
                fetchUserData();
            }

            // Refresh modal
            await openDailyRewardModal();

        } else {
            alert(data.message || 'Failed to claim reward.');
            await openDailyRewardModal();
        }
    } catch (e) {
        console.error('Claim daily reward error:', e);
        alert('Network error claiming reward.');
    } finally {
        if (claimDailyBtn) {
            claimDailyBtn.disabled = false;
            claimDailyBtn.innerHTML = `<span>🎁</span> CLAIM TODAY'S REWARD`;
        }
    }
}

function closeCelebrationModal() {
    if (!celebrationBackdrop) return;
    celebrationBackdrop.classList.add('opacity-0');
    setTimeout(() => celebrationBackdrop.classList.add('hidden'), 300);
}

// Bind Power Store listener
const powerStoreBtn = document.getElementById('power-store-btn');
const mobilePowerStoreBtn = document.getElementById('mobile-power-store-btn');

if (powerStoreBtn) {
    powerStoreBtn.addEventListener('click', () => {
        if (window.powerCardsUI) window.powerCardsUI.fetchAndOpenStore();
    });
}

if (mobilePowerStoreBtn) {
    mobilePowerStoreBtn.addEventListener('click', () => {
        closeMenu();
        if (window.powerCardsUI) window.powerCardsUI.fetchAndOpenStore();
    });
}

// Bind Daily Reward listeners
if (dailyRewardBtn) dailyRewardBtn.addEventListener('click', openDailyRewardModal);
if (mobileDailyRewardBtn) {
    mobileDailyRewardBtn.addEventListener('click', () => {
        closeMenu();
        openDailyRewardModal();
    });
}
if (closeDailyModalBtn) closeDailyModalBtn.addEventListener('click', closeDailyRewardModal);
if (claimDailyBtn) claimDailyBtn.addEventListener('click', handleClaimDailyReward);
if (celebrationCloseBtn) celebrationCloseBtn.addEventListener('click', closeCelebrationModal);

if (dailyModalBackdrop) {
    dailyModalBackdrop.addEventListener('click', (e) => {
        if (e.target === dailyModalBackdrop) closeDailyRewardModal();
    });
}

// Initial status check to show/hide badge ping
(async () => {
    const status = await fetchDailyRewardStatus();
    updateDailyRewardBadge(status);
})();
