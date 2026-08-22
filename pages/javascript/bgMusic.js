/**
 * Background Music Controller — Grammar Bid
 * Continuous audio playback across normal pages (75% volume)
 * and Auction Arena (25% volume) with position persistence in localStorage.
 */

(function () {
    const BG_MUSIC_KEY = 'gb_bg_music_time';
    const SFX_MUTED_KEY = 'gb_sfx_muted';
    const AUDIO_SRC = '/SFX/bg.mp3';

    // Determine target volume: 50% for Auction Arena, 75% for normal pages
    const isAuctionArena = window.location.pathname.includes('auction.html') ||
        !!document.getElementById('auction-console');
    const targetVolume = isAuctionArena ? 0.50 : 0.75;

    let audio = window.__gb_bg_audio;

    if (!audio) {
        audio = new Audio(AUDIO_SRC);
        audio.loop = true;
        window.__gb_bg_audio = audio;

        // Restore playback position from localStorage
        const savedTime = localStorage.getItem(BG_MUSIC_KEY);
        if (savedTime) {
            const parsedTime = parseFloat(savedTime);
            if (!isNaN(parsedTime) && parsedTime > 0) {
                audio.currentTime = parsedTime;
            }
        }
    }

    audio.volume = targetVolume;

    // Save playback position periodically and on unload
    let lastSaved = 0;
    audio.addEventListener('timeupdate', () => {
        const now = Date.now();
        if (now - lastSaved > 500) {
            lastSaved = now;
            if (audio.currentTime > 0) {
                localStorage.setItem(BG_MUSIC_KEY, audio.currentTime.toString());
            }
        }
    });

    window.addEventListener('beforeunload', () => {
        if (audio.currentTime > 0) {
            localStorage.setItem(BG_MUSIC_KEY, audio.currentTime.toString());
        }
    });

    document.addEventListener('visibilitychange', () => {
        if (document.hidden) {
            if (audio.currentTime > 0) {
                localStorage.setItem(BG_MUSIC_KEY, audio.currentTime.toString());
            }
        } else {
            if (audio.paused && localStorage.getItem(SFX_MUTED_KEY) !== 'true') {
                audio.play().catch(() => { });
            }
        }
    });

    // Attempt playback if SFX isn't explicitly muted
    const tryPlay = () => {
        if (localStorage.getItem(SFX_MUTED_KEY) === 'true') return;
        audio.play().catch(() => {
            // Autoplay blocked by browser policy — play on first user interaction
            const unlockAudio = () => {
                if (localStorage.getItem(SFX_MUTED_KEY) !== 'true') {
                    audio.play().catch(() => { });
                }
                window.removeEventListener('click', unlockAudio);
                window.removeEventListener('keydown', unlockAudio);
                window.removeEventListener('touchstart', unlockAudio);
            };
            window.addEventListener('click', unlockAudio);
            window.addEventListener('keydown', unlockAudio);
            window.addEventListener('touchstart', unlockAudio);
        });
    };

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', tryPlay);
    } else {
        tryPlay();
    }

    // Export global controller interface
    window.GrammarBidAudio = {
        audio,
        setVolume(vol) {
            audio.volume = vol;
        },
        toggleMute(isMuted) {
            if (isMuted) {
                audio.pause();
                localStorage.setItem(SFX_MUTED_KEY, 'true');
            } else {
                localStorage.setItem(SFX_MUTED_KEY, 'false');
                audio.play().catch(() => { });
            }
        }
    };
})();
