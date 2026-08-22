/**
 * Mini Games Background Music Controller — Grammar Bid Arcade
 * Continuous audio playback across mini games pages using arcade.mp3 with position persistence in localStorage.
 */

(function () {
    const ARCADE_MUSIC_KEY = 'gb_arcade_music_time';
    const ARCADE_MUTED_KEY = 'gb_arcade_muted';
    const AUDIO_SRC = '/SFX/arcade.mp3';

    let audio = window.__gb_arcade_audio;

    if (!audio) {
        audio = new Audio(AUDIO_SRC);
        audio.loop = true;
        window.__gb_arcade_audio = audio;

        // Restore playback position from localStorage
        const savedTime = localStorage.getItem(ARCADE_MUSIC_KEY);
        if (savedTime) {
            const parsedTime = parseFloat(savedTime);
            if (!isNaN(parsedTime) && parsedTime > 0) {
                audio.currentTime = parsedTime;
            }
        }
    }

    // Determine target volume: 75% for Arcade Index Hub, 50% when playing games
    const path = window.location.pathname.toLowerCase();
    const isPlayingGame = path.includes('flappy_bird') ||
        path.includes('help_ai') ||
        path.includes('pattern_sequence') ||
        path.includes('tic_tac_toe');
    const targetVolume = isPlayingGame ? 0.50 : 0.75;

    audio.volume = targetVolume;

    // Save playback position periodically and on unload
    let lastSaved = 0;
    audio.addEventListener('timeupdate', () => {
        const now = Date.now();
        if (now - lastSaved > 500) {
            lastSaved = now;
            if (audio.currentTime > 0) {
                localStorage.setItem(ARCADE_MUSIC_KEY, audio.currentTime.toString());
            }
        }
    });

    window.addEventListener('beforeunload', () => {
        if (audio.currentTime > 0) {
            localStorage.setItem(ARCADE_MUSIC_KEY, audio.currentTime.toString());
        }
    });

    document.addEventListener('visibilitychange', () => {
        if (document.hidden) {
            if (audio.currentTime > 0) {
                localStorage.setItem(ARCADE_MUSIC_KEY, audio.currentTime.toString());
            }
        } else {
            if (audio.paused && localStorage.getItem(ARCADE_MUTED_KEY) !== 'true') {
                audio.play().catch(() => { });
            }
        }
    });

    // Attempt playback if not explicitly muted
    const tryPlay = () => {
        if (localStorage.getItem(ARCADE_MUTED_KEY) === 'true') return;
        audio.play().catch(() => {
            // Autoplay blocked by browser policy — play on first user interaction
            const unlockAudio = () => {
                if (localStorage.getItem(ARCADE_MUTED_KEY) !== 'true') {
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

    // Export global arcade audio controller interface
    window.ArcadeBGM = {
        audio,
        setVolume(vol) {
            audio.volume = vol;
        },
        toggleMute(isMuted) {
            if (isMuted) {
                audio.pause();
                localStorage.setItem(ARCADE_MUTED_KEY, 'true');
            } else {
                localStorage.setItem(ARCADE_MUTED_KEY, 'false');
                audio.play().catch(() => { });
            }
        }
    };
})();
