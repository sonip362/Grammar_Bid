// server/config/powerCards.js
/**
 * Centralized Power Card definitions and configuration for Grammar Bid.
 */

const POWER_CARDS = {
    DOUBLE_HINT: {
        cardId: 'DOUBLE_HINT',
        name: 'Double Hint',
        icon: '💡',
        tokenCost: 5,
        allowedPhases: ['inspection'],
        description: 'Explains the grammar rule for the lot without revealing the answer directly.',
        maxPerRound: 1
    },
    BID_SHIELD: {
        cardId: 'BID_SHIELD',
        name: 'Bid Shield',
        icon: '🛡️',
        tokenCost: 15,
        allowedPhases: ['inspection', 'bidding'],
        description: 'Guarantees 100% loss protection — lose $0 cash penalty if you win an incorrect lot.',
        maxPerRound: 1
    },
    CASHBACK: {
        cardId: 'CASHBACK',
        name: 'Cashback',
        icon: '💰',
        tokenCost: 12,
        allowedPhases: ['inspection', 'bidding'],
        description: 'Returns 25% of your lost cash back if you win an incorrect lot and lose money.',
        maxPerRound: 1
    },
    SECOND_CHANCE: {
        cardId: 'SECOND_CHANCE',
        name: 'Second Chance',
        icon: '🔄',
        tokenCost: 10,
        allowedPhases: ['correction'],
        description: 'Grants 1 extra submission attempt if your initial correction is incorrect.',
        maxPerRound: 1
    },
    BID_BOOST: {
        cardId: 'BID_BOOST',
        name: 'Bid Boost',
        icon: '⚡',
        tokenCost: 8,
        allowedPhases: ['inspection', 'bidding'],
        description: 'Doubles your bid power. Win double payout on correct lots; lose double on incorrect lots!',
        maxPerRound: 1
    }
};

module.exports = {
    POWER_CARDS
};
