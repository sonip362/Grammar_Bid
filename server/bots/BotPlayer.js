// server/bots/BotPlayer.js
// ─── AI Bot Engine Class ─────────────────────────────────────
// Simulates a human player: bidding, corrections, emotes, chat banter

const Groq = require('groq-sdk');

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });
const LOG_BOTS = process.env.LOG_BOTS === 'true';

function botLog(...args) {
    if (LOG_BOTS) {
        console.log(...args);
    }
}

// Emote pools keyed by game scenario
const EMOTE_POOLS = {
    OUTBID: ['😤', '😱', '🤬', '💀', '🫠'],
    WIN_CORRECT: ['🤑', '🏆', '🔥', '💰', '😎', '🎉'],
    LOST_FLAWED: ['🤡', '💀', '😭', '😵', '🪦'],
    ROUND_START: ['👀', '🧐', '🔍', '🤔'],
    BIG_BID: ['😱', '🤯', '💸', '🫣'],
    GAME_OVER_WIN: ['🏆', '👑', '🥇', '🎊'],
    GAME_OVER_LOSE: ['😢', '💔', '🫡', '🤝']
};

class BotPlayer {
    constructor(profile, roomCode, io, rooms) {
        this.profile = profile;
        this.roomCode = roomCode;
        this.io = io;
        this.rooms = rooms;
        this.activeTimers = new Set();
        this.destroyed = false;
        this.lastChatTime = Date.now(); // Always start with an 8-second chat cooldown active

        this.isBoss = profile.isBoss || false;

        // Dynamic starting cash based on human players in room (Boss: 120-150% up to 150%, Normal: 90-120%)
        const roomObj = rooms ? rooms.get(roomCode) : null;
        const humanPlayers = roomObj ? roomObj.players.filter(p => !p.isBot) : [];
        const topHumanCash = humanPlayers.length > 0
            ? Math.max(...humanPlayers.map(p => p.cash || 10000))
            : 10000;

        const initialCash = this.isBoss
            ? Math.max(1000, Math.floor(topHumanCash * (1.20 + Math.random() * 0.30)))
            : Math.max(1000, Math.floor(topHumanCash * (0.90 + Math.random() * 0.30)));

        this.hasAttemptedAllInThisRound = false;

        // Player object that gets pushed into room.players[]
        this.playerData = {
            socketId: profile.botId,
            userId: profile.botId,
            username: profile.username,
            avatar: profile.avatar,
            cash: initialCash,
            rankBadge: profile.rankBadge || (this.isBoss ? '👑' : '⚖️'),
            rankName: profile.rankName || (this.isBoss ? 'Grammar Overlord (BOSS)' : 'Grammar Judge'),
            isHost: false,
            isBot: true,
            isBoss: this.isBoss
        };

        botLog(`🤖 [Bot Initialized] ${profile.username}${this.isBoss ? ' 👑 (BOSS)' : ''} (ID: ${profile.botId}, Cash: $${initialCash.toLocaleString()}) joined room ${roomCode}`);
    }

    // ─── Timer Management (leak-safe) ────────────────────────
    _setTimeout(fn, delay) {
        if (this.destroyed) return null;
        const id = setTimeout(() => {
            this.activeTimers.delete(id);
            if (!this.destroyed) fn();
        }, delay);
        this.activeTimers.add(id);
        return id;
    }

    _randomDelay() {
        const [min, max] = this.profile.delayRange;
        return min + Math.random() * (max - min);
    }

    _shouldEmote() {
        if (this.isBoss) return Math.random() < 0.15; // Boss emotes sparingly
        const freq = this.profile.emoteFrequency;
        const chance = freq === 'high' ? 0.50 : freq === 'medium' ? 0.35 : 0.20;
        return Math.random() < chance;
    }

    _shouldChat() {
        if (this.isBoss) return Math.random() < 0.10; // Boss trash talks significantly less (10% chance)
        const freq = this.profile.emoteFrequency;
        const chance = freq === 'high' ? 0.45 : freq === 'medium' ? 0.30 : 0.20;
        return Math.random() < chance;
    }

    _pickRandom(arr) {
        return arr[Math.floor(Math.random() * arr.length)];
    }

    // ─── Emote Reactions ──────────────────────────────────────
    reactEmote(scenario) {
        if (this.destroyed || !this._shouldEmote()) return;

        const pool = EMOTE_POOLS[scenario] || EMOTE_POOLS.ROUND_START;
        const emote = this._pickRandom(pool);

        botLog(`🤖 [Emote] ${this.profile.username} reacting with ${emote} (Scenario: ${scenario})`);

        this._setTimeout(() => {
            this.io.to(this.roomCode).emit('display_reaction', {
                username: this.profile.username,
                emote,
                socketId: this.profile.botId
            });
        }, 300 + Math.random() * 800);
    }

    // ─── Chat Banter (Groq openai/gpt-oss-20b + Fallback) ──
    async chatBanter(scenario, context = '') {
        if (this.destroyed) return;

        // Enforce strict 8-second chat cooldown per bot instance
        const CHAT_COOLDOWN_MS = 8000;
        const now = Date.now();
        if (now - this.lastChatTime < CHAT_COOLDOWN_MS) {
            botLog(`⏳ [Chat Cooldown] ${this.profile.username} chat suppressed (cooldown active: ${Math.round((CHAT_COOLDOWN_MS - (now - this.lastChatTime)) / 1000)}s remaining)`);
            return;
        }

        // Lock in cooldown timestamp immediately to prevent concurrent calls
        this.lastChatTime = now;

        botLog(`💬 [Chat Request] ${this.profile.username} | Scenario: ${scenario} | Context: "${context}"`);

        let message = null;

        // Try Groq LLM
        if (process.env.GROQ_API_KEY) {
            const modelName = process.env.GROQ_BOT_MODEL || 'openai/gpt-oss-20b';
            try {
                const prompt = `You are ${this.profile.username}, a ${this.profile.personality} playing an online multiplayer English grammar auction game called Grammar Bid.
Game Situation: ${scenario}. Context: ${context}.
Task: Write ONE short, hilarious roast, savage trash-talk, or meme-filled joke with emojis (max 10 words). Make human players laugh out loud!



Rules:
- Max 10 words! Include 1-2 expressive emojis!
- NEVER reveal, spoil, or hint whether the current sentence is correct or flawed! Keep the answer 100% secret during bidding!
- No quotation marks, no hashtags, no markdown. Speak directly to the players in the room.`;

                botLog(`📡 [Groq API] Calling Groq API (${modelName}) for ${this.profile.username}...`);

                const timeoutPromise = new Promise((_, reject) =>
                    setTimeout(() => reject(new Error('Groq Timeout (7s)')), 7000)
                );

                const groqPromise = groq.chat.completions.create({
                    model: modelName,
                    messages: [{ role: 'user', content: prompt }],
                    max_tokens: 500,
                    temperature: 0.9
                });

                const result = await Promise.race([groqPromise, timeoutPromise]);
                const text = result.choices?.[0]?.message?.content?.trim();
                if (text && text.length > 2 && text.length < 120) {
                    message = text.replace(/^["']|["']$/g, '').trim();
                    botLog(`✅ [Groq Success] ${this.profile.username}: "${message}"`);
                }
            } catch (err) {
                console.warn(`⚠️ [Groq Bot Chat Warning] ${this.profile.username} (${modelName}) failed: ${err.message}. Using fallback chat.`);
            }
        } else {
            botLog(`ℹ️ [Groq Info] No GROQ_API_KEY found. Using fallback chat for ${this.profile.username}.`);
        }

        // Fallback to static messages
        if (!message) {
            const pool = this.profile.fallbackChat[scenario] || this.profile.fallbackChat.ROUND_START;
            message = pool ? this._pickRandom(pool) : "Let's keep playing!";
            botLog(`📦 [Fallback Chat] ${this.profile.username}: "${message}"`);
        }

        if (this.destroyed) return;

        // Update timestamp upon broadcast
        this.lastChatTime = Date.now();

        // Emit chat message to room
        this.io.to(this.roomCode).emit('chat_message', {
            username: this.profile.username,
            avatar: this.profile.avatar,
            message,
            isBot: true,
            timestamp: Date.now()
        });
        botLog(`📢 [Socket Broadcast] chat_message emitted to room ${this.roomCode} for ${this.profile.username}`);
    }

    // ─── Bidding Engine (Continuous loop throughout bidding phase) ──
    startBidding(room) {
        if (this.destroyed || room.status !== 'bidding') return;

        this.hasAttemptedAllInThisRound = false;
        const maxBid = Math.floor(this.playerData.cash * this.profile.maxBidPercent);
        botLog(`💰 [Bidding Start] ${this.profile.username} starting bidding loop (Cash: $${this.playerData.cash}, MaxBid: $${maxBid})`);

        if (maxBid <= 0 && this.playerData.cash <= 0) return;

        const tryBid = () => {
            if (this.destroyed || room.status !== 'bidding') return;

            const currentHighest = room.highestBid || 0;
            const isTopBidder = room.topBidder && room.topBidder.socketId === this.profile.botId;

            if (isTopBidder) {
                this._setTimeout(tryBid, this._randomDelay());
                return;
            }

            // Rare 4% chance to go ALL-IN with entire cash balance
            const canAffordAllIn = this.playerData.cash > currentHighest && this.playerData.cash > 0;
            const isRareAllIn = !this.hasAttemptedAllInThisRound && canAffordAllIn && (Math.random() < 0.04);

            const openChance = Math.min(0.95, this.profile.aggressiveness + 0.35);
            const shouldAttempt = isRareAllIn || (currentHighest === 0 ? (Math.random() < openChance) : (Math.random() < this.profile.aggressiveness + 0.15));

            if (shouldAttempt) {
                let bidAmount;
                if (isRareAllIn) {
                    this.hasAttemptedAllInThisRound = true;
                    bidAmount = this.playerData.cash;
                    botLog(`🚀💥 [RARE ALL-IN BID] 🤖 ${this.profile.username} going ALL-IN with $${bidAmount.toLocaleString()}!`);
                } else {
                    const increment = Math.floor(100 + Math.random() * 400 * this.profile.aggressiveness);
                    bidAmount = currentHighest + increment;
                    bidAmount = Math.ceil(bidAmount / 100) * 100;
                    bidAmount = Math.min(bidAmount, maxBid, this.playerData.cash);
                }

                if (bidAmount > currentHighest && bidAmount > 0) {
                    const previousTopBidder = room.topBidder;
                    room.highestBid = bidAmount;
                    room.topBidder = {
                        socketId: this.profile.botId,
                        userId: this.profile.botId,
                        username: this.profile.username
                    };

                    botLog(`🔨 [Bid Placed] 🤖 ${this.profile.username} bid $${bidAmount.toLocaleString()} in room ${this.roomCode}`);

                    if (room.timer <= 3) {
                        const MAX_ANTI_SNIPE_TOTAL = 10;
                        const currentExt = room.antiSnipeExtended || 0;
                        if (currentExt < MAX_ANTI_SNIPE_TOTAL) {
                            const add = Math.min(2, MAX_ANTI_SNIPE_TOTAL - currentExt);
                            room.timer += add;
                            room.antiSnipeExtended = currentExt + add;
                            botLog(`⏰ [Anti-Snipe] Extended timer by +${add}s (Total anti-snipe used: ${room.antiSnipeExtended}/${MAX_ANTI_SNIPE_TOTAL}s) in room ${this.roomCode}`);
                        }
                    }

                    this.io.to(this.roomCode).emit('bid_update', {
                        highestBid: room.highestBid,
                        topBidder: room.topBidder,
                        timer: room.timer
                    });

                    if (isRareAllIn) {
                        this.reactEmote('BIG_BID');
                        this._setTimeout(() => {
                            this.chatBanter('ALL_IN_JOKE', `I just went ALL-IN with my entire $${bidAmount.toLocaleString()} vault!`);
                        }, 400);
                    } else if (bidAmount > this.playerData.cash * 0.5) {
                        this.reactEmote('BIG_BID');
                    }

                    if (previousTopBidder && previousTopBidder.socketId !== this.profile.botId && !isRareAllIn) {
                        this.reactEmote('OUTBID');
                        if (this._shouldChat()) {
                            this._setTimeout(() => this.chatBanter('OUTBID_SNIPE', `I outbid ${previousTopBidder.username} with $${bidAmount}`), 500);
                        }
                    }
                }
            }

            this._setTimeout(tryBid, this._randomDelay());
        };

        this._setTimeout(tryBid, this._randomDelay());
    }

    // ─── Player Bid Reaction Hook ──────────────────────────────
    onPlayerBid(bidder, amount) {
        if (this.destroyed) return;
        if (bidder.socketId === this.profile.botId) return;

        botLog(`⚡ [Player Bid Notified] ${this.profile.username} notified of bid by ${bidder.username} ($${amount})`);

        this.reactEmote('OUTBID');
        if (this._shouldChat()) {
            this._setTimeout(() => {
                this.chatBanter('OUTBID_SNIPE', `${bidder.username} just bid $${amount}`);
            }, 600 + Math.random() * 1000);
        }
    }

    // ─── Correction Submission ─────────────────────────────────
    submitCorrection(room) {
        if (this.destroyed || room.status !== 'correction') return;

        // Realistic typing delay: 4.5s to 9.5s so human players can read, edit, & type to win fairly!
        const typingDelay = 4500 + Math.random() * 5000;
        botLog(`✏️ [Correction Start] ${this.profile.username} will submit correction in ${Math.round(typingDelay)}ms`);

        this._setTimeout(() => {
            if (this.destroyed || room.status !== 'correction') return;
            if (!room.currentLot) return;

            const alreadySubmitted = room.corrections.find(c => c.socketId === this.profile.botId);
            if (alreadySubmitted) return;

            const isAccurate = Math.random() < this.profile.accuracy;

            let submittedText;
            if (isAccurate && room.currentLot.correction) {
                submittedText = room.currentLot.correction;
            } else {
                submittedText = room.currentLot.sentence.replace(
                    room.currentLot.flawedPhrase || '',
                    'something wrong'
                );
            }

            const submissionOrder = room.corrections.length + 1;
            room.corrections.push({
                socketId: this.profile.botId,
                userId: this.profile.botId,
                username: this.profile.username,
                text: submittedText,
                isAccurate,
                order: submissionOrder
            });

            if (isAccurate && submissionOrder === 1) {
                this.playerData.cash += 500;
                botLog(`🤖✅ [Correction 1st] ${this.profile.username} FIRST correct (+$500)`);
                this.reactEmote('WIN_CORRECT');
                if (this._shouldChat()) {
                    this._setTimeout(() => {
                        this.chatBanter('BOT_SUBMIT_CORRECT', 'I submitted the fastest correction!');
                    }, 400);
                }
            } else if (isAccurate) {
                this.playerData.cash += 200;
                botLog(`🤖✅ [Correction OK] ${this.profile.username} correct (+$200)`);
            } else {
                this.playerData.cash -= 200;
                botLog(`🤖❌ [Correction Wrong] ${this.profile.username} wrong (-$200)`);
                this.reactEmote('LOST_FLAWED');
            }

            this.io.to(this.roomCode).emit('players_updated', {
                players: room.players.map(p => ({
                    socketId: p.socketId,
                    userId: p.userId,
                    username: p.username,
                    avatar: p.avatar,
                    cash: p.cash,
                    isHost: p.isHost
                }))
            });
        }, typingDelay);
    }

    // ─── Lifecycle Reactions ──────────────────────────────────
    onRoundStart() {
        botLog(`🔔 [Round Start Notified] ${this.profile.username} handling round start`);
        this.reactEmote('ROUND_START');
        if (this._shouldChat()) {
            this._setTimeout(() => this.chatBanter('ROUND_START', 'New round started.'), 600 + Math.random() * 1200);
        }
    }

    onRoundResult(result) {
        const winner = result.winnerUsername;
        const isBotWinner = result.topBidder && result.topBidder.socketId === this.profile.botId;

        botLog(`📊 [Round Result Notified] ${this.profile.username} handling result. Winner: ${winner || 'None'}, Correct: ${result.isCorrect}`);

        if (!winner) {
            this.reactEmote('ROUND_START');
            if (this._shouldChat()) {
                this._setTimeout(() => this.chatBanter('NO_BIDS', 'Nobody bid on this lot.'), 500);
            }
            return;
        }

        if (isBotWinner) {
            if (result.isCorrect) {
                this.reactEmote('WIN_CORRECT');
                this._setTimeout(() => this.chatBanter('BIG_WIN', `I won $${result.highestBid} on a correct sentence!`), 400);
            } else {
                this.reactEmote('LOST_FLAWED');
                this._setTimeout(() => this.chatBanter('LOST_MONEY_FLAWED', `I bought a flawed sentence and lost $${result.highestBid}!`), 400);
            }
        } else {
            if (!result.isCorrect) {
                // Human bought flawed sentence!
                this.reactEmote('LOST_FLAWED');
                this._setTimeout(() => {
                    this.chatBanter('HUMAN_LOST_FLAWED', `${winner} bought a flawed sentence and lost $${result.highestBid}!`);
                }, 500 + Math.random() * 1000);
            } else {
                this.reactEmote('OUTBID');
                if (this._shouldChat()) {
                    this._setTimeout(() => {
                        this.chatBanter('HUMAN_WIN_CORRECT', `${winner} bought a correct sentence and won $${result.highestBid}.`);
                    }, 600 + Math.random() * 1200);
                }
            }
        }
    }

    onGameOver(isWinner) {
        const scenario = isWinner ? 'GAME_OVER_WIN' : 'GAME_OVER_LOSE';
        botLog(`🏆 [Game Over Notified] ${this.profile.username} handling game over (Winner: ${isWinner})`);
        this.reactEmote(scenario);
        this._setTimeout(() => this.chatBanter('GAME_OVER', isWinner ? 'I won the auction game!' : 'I lost the game.'), 800 + Math.random() * 1500);
    }

    // ─── Cleanup ──────────────────────────────────────────────
    destroy() {
        this.destroyed = true;
        for (const timerId of this.activeTimers) {
            clearTimeout(timerId);
        }
        this.activeTimers.clear();
        botLog(`🤖 [Bot Destroyed] ${this.profile.username} cleaned up in room ${this.roomCode}`);
    }
}

module.exports = { BotPlayer };
