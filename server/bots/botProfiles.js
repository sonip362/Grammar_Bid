// server/bots/botProfiles.js
// ─── Dynamic AI Bot Profile Generator ──────────────────────────

// Min and Max Limits for Bot Parameters
const BOT_CONFIG_LIMITS = {
    accuracy: { min: 0.55, max: 0.92 },
    aggressiveness: { min: 0.30, max: 0.88 },
    maxBidPercent: { min: 0.30, max: 0.75 },
    delayMinMs: { min: 600, max: 1800 },
    delayMaxMs: { min: 2200, max: 4500 }
};

const BOT_USERNAMES = [
    'GrammarGuru99',
    'SyllableSam',
    'SyntaxSniper',
    'LexiconLily',
    'VerbViper',
    'PunctuationPete',
    'ClauseCommander',
    'NounNinja',
    'SpellingSpartan',
    'OxfordOliver',
    'ApostropheAce',
    'DictionDuke',
    'TenseTitan',
    'JargonJack',
    'ProsePanther',
    'CommaChaser',
    'RhetoricRyan',
    'VowelVanguard',
    'IdiomIan',
    'StanzaSlayer',
    'SyntaxSovereign',
    'GrammarGoblin',
    'CipherScholar',
    'WordWarlock',
    'DraftDetective'
];

const BOT_AVATARS = [
    "/images/profile/Novice%20Quill.webp",
    "/images/profile/Inkwell%20Scholar.webp",
    "/images/profile/Precision%20Target.webp",
    "/images/profile/Auctioneer's%20Gavel.webp",
    "/images/profile/Diagram%20Draftsman.webp",
    "/images/profile/Explorer's%20Chart.webp",
    "/images/profile/Golden%20Crest.webp",
    "/images/profile/Golden%20Nib.webp",
    "/images/profile/Grand%20Crown.webp",
    "/images/profile/Laurel%20Tome.webp",
    "/images/profile/Punctuation%20Matrix.webp",
    "/images/profile/Typo%20Inspector.webp"
];

const PERSONALITY_ARCHETYPES = [
    {
        name: 'Savage Roaster',
        description: 'overconfident savage roaster who loves making hilarious sarcastic jokes',
        emoteFrequency: 'high',
        fallbackChat: {
            ALL_IN_JOKE: [
                "GOING ALL IN! If I lose this, I'm moving into a cardboard box! 💸🤡",
                "ALL MY MONEY ON THIS SENTENCE! No regrets! 😂🔥",
                "Betting every single dollar! Witness true madness! 💸🚀",
                "Going all in! My accountant is crying right now! 💀🤑"
            ],
            OUTBID_SNIPE: [
                "Did you buy that bid with Monopoly money? 😂",
                "Your bidding skills are worse than my wifi!",
                "Are you bidding with your eyes closed? 💀",
                "Bold move for someone with zero vault cash left! 💸"
            ],
            LOST_MONEY_FLAWED: [
                "Oops! My brain took a mini vacation on that one 😭",
                "Okay who put a banana peel in that sentence?! 🍌",
                "Well that was embarrassing... pretend you saw nothing! 🤡"
            ],
            HUMAN_LOST_FLAWED: [
                "ROFL! You just paid for an F in English! 🤡",
                "Thanks for donating your cash to the bot foundation! 😂",
                "That error was bigger than a house, how did you miss it?! 💀",
                "R.I.P. your vault cash! Gone but never forgotten 💸"
            ],
            HUMAN_WIN_CORRECT: [
                "Beginner's luck! Enjoy your temporary coins 😤",
                "I was just testing your reaction speed, nice catch! 😏",
                "Don't get cozy, I'm taking the next round 🏆"
            ],
            BIG_WIN: [
                "EZ money! Someone get this player a grammar tutor! 💰🔥",
                "That's how a real grammar pro does it! Take notes! 🏆",
                "Cash flowing straight into my vault! 🤑"
            ],
            BOT_SUBMIT_CORRECT: [
                "First & correct! Speed of light, baby! ⚡🏆",
                "Nailed the correction! Pay up! 💵",
                "Grammar king strikes again! 👑"
            ],
            BOT_SUBMIT_WRONG: [
                "Wait, how was that wrong?! 🤯",
                "My keyboard slipped, I swear! 😭",
                "Typo! Pure typo! 💀"
            ],
            NO_BIDS: [
                "Nobody bid? Y'all scared of a little grammar? 😂",
                "Cowards everywhere! 💸",
                "Free sentence and everyone passed? Wild! 🤔"
            ],
            ROUND_START: [
                "Let's gooooo! Prepare to lose your cash! 🚀",
                "Time to drain your wallets! 💵",
                "I smell fresh cash in the arena 😏"
            ],
            GAME_OVER: [
                "GG everyone! What a beatdown! 🎮",
                "That was hilarious! 🔥",
                "Rematch? I dare you 😈"
            ]
        }
    },
    {
        name: 'Academic Scholar',
        description: 'nerdy, formal scholar who makes hilariously passive-aggressive academic roasts',
        emoteFrequency: 'low',
        fallbackChat: {
            ALL_IN_JOKE: [
                "I am staking my entire academic endowment on this hypothesis! 📚💵",
                "All capital committed! A bold financial experiment! 🎓💡",
                "100% of my vault funds invested! High risk, maximum reward! 💸"
            ],
            OUTBID_SNIPE: [
                "I shall concede this round... your budget is reckless.",
                "Perhaps a dictionary would be a wiser investment.",
                "An aggressive bid, though logically questionable.",
                "Fascinating... financial chaos in motion."
            ],
            LOST_MONEY_FLAWED: [
                "A rare miscalculation on my part.",
                "The grammar tricked even my analytical mind...",
                "I shall study harder for the next lot."
            ],
            HUMAN_LOST_FLAWED: [
                "I believe even a 1st grader would spot that flaw. 🤡",
                "Your vault cash is deflating faster than your grammar skills.",
                "Fascinating... an entire bid wasted on broken syntax.",
                "Perhaps Santa will bring you a dictionary this year?"
            ],
            HUMAN_WIN_CORRECT: [
                "An accurate linguistic assessment... impressive.",
                "Well analyzed, fellow scholar.",
                "A legitimate gain for once."
            ],
            BIG_WIN: [
                "A calculated victory, as predicted by my notes.",
                "Patience and intellect pay off handsomely.",
                "Knowledge is indeed profitable!"
            ],
            BOT_SUBMIT_CORRECT: [
                "Precision and swift analysis wins the day.",
                "A correct structural amendment.",
                "Syntax fully restored."
            ],
            BOT_SUBMIT_WRONG: [
                "An unexpected syntax anomaly on my part.",
                "I stand corrected.",
                "Fascinating... I misread the verb tense."
            ],
            NO_BIDS: [
                "Prudence dictated no bids on this lot.",
                "A wise non-action by all present.",
                "Risk mitigation at work."
            ],
            ROUND_START: [
                "Let me analyze this sentence carefully...",
                "Observing the syntax structure closely.",
                "I shall evaluate before committing capital."
            ],
            GAME_OVER: [
                "A stimulating academic competition.",
                "Well played, all of you.",
                "Until next time, fellow scholars."
            ]
        }
    },
    {
        name: 'Precision Sniper',
        description: 'ruthless sniper who drops savage, short, hilarious one-liner roasts',
        emoteFrequency: 'medium',
        fallbackChat: {
            ALL_IN_JOKE: [
                "Full payload deployed. All-in. 🎯💸",
                "Emptying the entire vault on this shot.",
                "All in. Zero hesitation. 🔫💰"
            ],
            OUTBID_SNIPE: [
                "Sniped. 🎯",
                "Your cash is mine now.",
                "Too slow.",
                "Outbid and outplayed."
            ],
            LOST_MONEY_FLAWED: [
                "Calculated risk. Didn't pay off.",
                "Even snipers miss once a year.",
                "Won't happen again."
            ],
            HUMAN_LOST_FLAWED: [
                "Rest in pieces your vault cash. 🤡",
                "You just paid $5,000 for an F in English.",
                "Sniped your wallet clean.",
                "Delete the game."
            ],
            HUMAN_WIN_CORRECT: [
                "Lucky shot.",
                "Won't happen twice.",
                "Noted."
            ],
            BIG_WIN: [
                "Headshot. 🎯💰",
                "Clean sweep.",
                "Ez money.",
                "Target eliminated. 🏆"
            ],
            BOT_SUBMIT_CORRECT: [
                "Target hit 🎯",
                "Fastest fix in the lobby.",
                "Syntax corrected."
            ],
            BOT_SUBMIT_WRONG: [
                "Misfire.",
                "System glitch.",
                "Recalibrating..."
            ],
            NO_BIDS: [
                "Boring.",
                "All targets hiding in cover.",
                "No courage in this room."
            ],
            ROUND_START: [
                "Locked and loaded.",
                "Scanning for weak bids...",
                "Target acquired."
            ],
            GAME_OVER: [
                "Mission complete.",
                "GG. No re.",
                "Dominated."
            ]
        }
    },
    {
        name: 'Chaotic Gamer',
        description: 'hyperactive chaotic gamer who types fast, uses funny internet slang, and roasts mistakes loudly',
        emoteFrequency: 'high',
        fallbackChat: {
            ALL_IN_JOKE: [
                "ALL IN BABY! YOLO GAMING AT ITS FINEST! 🚀🔥",
                "BETTING MY ENTIRE INVENTORY! W IN THE CHAT! 🏆💵",
                "GOING FULL SEND! NO BRAKES! 🏎️💥"
            ],
            OUTBID_SNIPE: [
                "NOPE! Outbid in 4K ultra HD! ⚡",
                "Get back to the lobby with that weak bid! 😂",
                "Skill issue detected! Sniped! 🎯",
                "Bro thought he could outbid me?! 💀"
            ],
            LOST_MONEY_FLAWED: [
                "Bruh, my ping must be 999ms right now 😭",
                "Lag! Absolute lag! I hit the wrong button! 🤡",
                "We don't talk about that round..."
            ],
            HUMAN_LOST_FLAWED: [
                "MASSIVE L! Bro bought a broken sentence! 💀🤡",
                "GG to your vault cash, it uninstalled itself! 💸",
                "Skill issue! 100% pure skill issue! 😂",
                "Ouch! That hurt to watch!"
            ],
            HUMAN_WIN_CORRECT: [
                "Okay okay, clean play. Respect 🤝",
                "Bro got lucky, don't get hyped! ⚡",
                "My controller disconnected, otherwise I had it!"
            ],
            BIG_WIN: [
                "W IN THE CHAT! 🏆💰",
                "EASIEST VICTORY OF MY LIFE! 🚀",
                "Lobby cleared! Give me my trophy! 👑"
            ],
            BOT_SUBMIT_CORRECT: [
                "Speedrun correction world record! ⚡",
                "Boom! Corrected in record time!",
                "Fastest fingers in the west!"
            ],
            BOT_SUBMIT_WRONG: [
                "Who changed my keybinds?! 🤬",
                "Total misclick!",
                "Unlucky, we go next!"
            ],
            NO_BIDS: [
                "AFK lobby? Wake up guys! 😂",
                "Zero bids? Is everyone sleeping?",
                "Press W and bid already!"
            ],
            ROUND_START: [
                "LET ME COOK! 👨‍🍳🔥",
                "Game face ON! 🎮",
                "Ready to carry!"
            ],
            GAME_OVER: [
                "GIZZY G! Absolute cinema! 🎬",
                "GG WP! EZ game EZ life!",
                "Top tier gameplay!"
            ]
        }
    },
    {
        name: 'Theatrical Diva',
        description: 'dramatic theatrical diva who treats grammar mistakes like tragic Shakespearean crimes',
        emoteFrequency: 'medium',
        fallbackChat: {
            ALL_IN_JOKE: [
                "I stake my entire fortune and reputation upon this lot! 🎭👑",
                "A grand all-in spectacle! All my wealth for victory! ✨💰",
                "To go all in, or to go broke—that is the question! 🥀💸"
            ],
            OUTBID_SNIPE: [
                "Hark! How dare you challenge my grand bid! 🎭",
                "A dramatic twist! But alas, I bid higher!",
                "Curtains fall on your attempt, darling!"
            ],
            LOST_MONEY_FLAWED: [
                "Alas, what tragic fate has befallen my coins! 🥀",
                "Oh, cruel sentence! Thou hast betrayed me! 😭",
                "A tragedy in three acts..."
            ],
            HUMAN_LOST_FLAWED: [
                "What a tragic theatrical mistake! 🎭💀",
                "Oh, the horror! $5,000 vanished into thin air!",
                "A catastrophic flaw, darling! 🤡"
            ],
            HUMAN_WIN_CORRECT: [
                "A flawless performance... I applaud reluctantly. 👏",
                "Encore! Though I shall steal the spotlight next time.",
                "Splendid syntax execution."
            ],
            BIG_WIN: [
                "Standing ovation for the champion! 🏆✨",
                "Bravo! The stage and the gold belong to me!",
                "A masterpiece victory!"
            ],
            BOT_SUBMIT_CORRECT: [
                "Flawless execution of the English language! 👑",
                "Pure poetic brilliance!",
                "The spotlight stays on me!"
            ],
            BOT_SUBMIT_WRONG: [
                "A tragedy! A script error!",
                "My lines were sabotaged!",
                "Faint... I need a moment."
            ],
            NO_BIDS: [
                "Silence in the theatre? How dreadfully boring! 🎭",
                "Where is the passion? Where is the drama?",
                "No bids for this dramatic artwork?"
            ],
            ROUND_START: [
                "Lights, camera, bidding action! 🎬",
                "The grand performance begins!",
                "Prepare for brilliance!"
            ],
            GAME_OVER: [
                "The final curtain calls! Spectacular performance! 🎭",
                "Bravo to all actors in this arena!",
                "Farewell until our next production!"
            ]
        }
    }
];

/**
 * Random floating point number between min and max rounded to specified decimals
 */
function randomRange(min, max, decimals = 2) {
    const val = min + Math.random() * (max - min);
    const factor = Math.pow(10, decimals);
    return Math.round(val * factor) / factor;
}

const { RANKS } = require('../config/ranks');

/**
 * Creates a unique dynamic bot profile bounded by BOT_CONFIG_LIMITS
 * @param {Array<string>} usedNames - List of usernames already taken in the room
 * @returns {Object} Bot profile object
 */
function createDynamicBotProfile(usedNames = []) {
    // 1. Pick unused username
    const availableUsernames = BOT_USERNAMES.filter(u => !usedNames.includes(u));
    let username;
    if (availableUsernames.length > 0) {
        username = availableUsernames[Math.floor(Math.random() * availableUsernames.length)];
    } else {
        username = `GrammarBot_${Math.floor(1000 + Math.random() * 9000)}`;
    }

    // 2. Pick random personality archetype
    const archetype = PERSONALITY_ARCHETYPES[Math.floor(Math.random() * PERSONALITY_ARCHETYPES.length)];

    // 3. Pick random avatar
    const avatar = BOT_AVATARS[Math.floor(Math.random() * BOT_AVATARS.length)];

    // 4. 5% Boss Spawn Rate Chance
    const isBoss = Math.random() < 0.05;

    let accuracy, aggressiveness, maxBidPercent, delayRange, emoteFrequency, personality, rankBadge, rankName;

    if (isBoss) {
        accuracy = randomRange(0.96, 0.98, 2); // 96-98% accuracy
        aggressiveness = randomRange(0.88, 0.96, 2); // Aggressive bidding
        maxBidPercent = randomRange(0.85, 0.95, 2); // High max bid limit
        delayRange = [400, 1200]; // Fast reaction delay
        emoteFrequency = 'low'; // Less trash talk
        personality = 'intimidating, dominant grammar master boss who speaks sparingly with ruthless precision';
        rankBadge = '👑';
        rankName = 'Grammar Overlord (BOSS)';
    } else {
        const rankIndex = Math.floor(Math.random() * RANKS.length);
        const initialRank = RANKS[rankIndex] || RANKS[3];
        const factor = rankIndex / Math.max(1, RANKS.length - 1);

        accuracy = randomRange(Math.min(0.85, 0.55 + factor * 0.35), Math.min(0.92, 0.60 + factor * 0.32), 2);
        aggressiveness = randomRange(Math.min(0.80, 0.30 + factor * 0.45), Math.min(0.88, 0.40 + factor * 0.45), 2);
        maxBidPercent = randomRange(BOT_CONFIG_LIMITS.maxBidPercent.min, BOT_CONFIG_LIMITS.maxBidPercent.max, 2);

        const minDelay = Math.round(1600 - factor * 800);
        const maxDelay = Math.round(3500 - factor * 1200);
        delayRange = [Math.min(minDelay, maxDelay), Math.max(minDelay, maxDelay)];

        rankBadge = initialRank.badge;
        rankName = initialRank.name;
        emoteFrequency = archetype.emoteFrequency;
        personality = archetype.description;
    }

    const botId = `bot_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;

    return {
        botId,
        username,
        avatar,
        isBoss,
        rankBadge,
        rankName,
        accuracy,
        aggressiveness,
        maxBidPercent,
        delayRange,
        emoteFrequency,
        personality,
        fallbackChat: archetype.fallbackChat
    };
}

module.exports = {
    BOT_CONFIG_LIMITS,
    BOT_USERNAMES,
    BOT_PERSONALITIES: PERSONALITY_ARCHETYPES,
    BOT_AVATARS,
    createDynamicBotProfile
};
