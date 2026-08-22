// server/services/powerCardService.js
/**
 * Server-authoritative Power Card Service for Grammar Bid.
 * Handles card purchases, inventory operations, phase validation, and atomic state updates.
 */

const User = require('../../models/User');
const Transaction = require('../../models/Transaction');
const InboxMessage = require('../../models/InboxMessage');
const { POWER_CARDS } = require('../config/powerCards');

const { getRankFromXP, RANKS } = require('../config/ranks');

const RANK_TOKEN_RATES = [
    1000,   // Rank 0: Grammar Novice ($1,000)
    2500,   // Rank 1: Sentence Scout ($2,500)
    5000,   // Rank 2: Proofreader ($5,000)
    10000,  // Rank 3: Grammar Judge ($10,000)
    25000,  // Rank 4: Grammar Expert ($25,000)
    50000,  // Rank 5: Grammar Master ($50,000)
    100000  // Rank 6: Grammar Legend ($100,000)
];

/**
 * Get Cash to Gold Tokens exchange rate for a given user XP/rank.
 * Scales up with high-rank cash economy starting at $1,000 for Grammar Novice.
 */
function getCashExchangeRate(xp = 0) {
    const rankObj = getRankFromXP(xp);
    const rankIndex = RANKS.findIndex(r => r.name === rankObj.name);
    const safeIndex = (rankIndex >= 0 && rankIndex < RANK_TOKEN_RATES.length) ? rankIndex : 0;
    const costPerToken = RANK_TOKEN_RATES[safeIndex];

    return {
        rankName: rankObj.name,
        rankBadge: rankObj.badge,
        rankIndex: safeIndex,
        costPerToken,
        displayText: `$${costPerToken.toLocaleString()} Cash per 🪙 1 Gold Token`
    };
}

/**
 * Get formatted user power cards inventory and rank exchange rate.
 */
async function getUserPowerCards(userId) {
    const user = await User.findById(userId).lean();
    if (!user) return null;

    const rawInventory = (user.inventory && user.inventory.powerCards) || {};
    const formattedInventory = {};

    Object.keys(POWER_CARDS).forEach(cardId => {
        formattedInventory[cardId] = Number(rawInventory[cardId] || 0);
    });

    const exchangeRate = getCashExchangeRate(user.xp || 0);

    return {
        cash: user.cash !== undefined ? user.cash : 10000,
        tokens: user.tokens !== undefined ? user.tokens : 50,
        xp: user.xp || 0,
        inventory: formattedInventory,
        exchangeRate
    };
}

/**
 * Exchange Cash for Gold Tokens based on player's rank.
 */
async function exchangeCashForTokens(userId, tokensToBuy = 1) {
    const qty = Math.max(1, Math.floor(Number(tokensToBuy) || 1));

    const user = await User.findById(userId);
    if (!user) {
        return { success: false, status: 404, message: 'User not found' };
    }

    const rate = getCashExchangeRate(user.xp || 0);
    const totalCashCost = qty * rate.costPerToken;

    const userCash = user.cash !== undefined ? user.cash : 10000;
    if (userCash < totalCashCost) {
        return {
            success: false,
            status: 400,
            message: `Insufficient Cash! Exchanging ${qty} 🪙 Gold Tokens costs $${totalCashCost.toLocaleString()} Cash at your ${rate.rankName} rate ($${rate.costPerToken.toLocaleString()}/token), but you only have $${userCash.toLocaleString()} Cash.`
        };
    }

    const balanceBeforeCash = user.cash;

    const updatedUser = await User.findOneAndUpdate(
        { _id: userId, cash: { $gte: totalCashCost } },
        {
            $inc: {
                cash: -totalCashCost,
                tokens: qty
            }
        },
        { returnDocument: 'after' }
    );

    if (!updatedUser) {
        return { success: false, status: 400, message: 'Exchange failed due to insufficient cash or concurrent request.' };
    }

    const txId = `tx_ex_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;

    // Create transaction audit log
    try {
        await Transaction.create({
            transactionId: txId,
            userId: userId.toString(),
            username: updatedUser.username,
            type: 'CASH_EXCHANGE',
            amount: -totalCashCost,
            balanceBefore: balanceBeforeCash,
            balanceAfter: updatedUser.cash,
            reason: `Exchanged $${totalCashCost.toLocaleString()} Cash for +${qty} 🪙 Gold Tokens (${rate.rankName} rate: $${rate.costPerToken.toLocaleString()}/token)`
        });
    } catch (txErr) {
        if (txErr.code !== 11000) console.error('Cash exchange transaction error:', txErr);
    }

    return {
        success: true,
        message: `Successfully exchanged $${totalCashCost.toLocaleString()} Cash for +${qty} 🪙 Gold Tokens!`,
        cash: updatedUser.cash,
        tokens: updatedUser.tokens,
        tokensExchanged: qty,
        totalCashSpent: totalCashCost,
        rate
    };
}

/**
 * Calculate dynamic card unit cost based on player cash ratio.
 * Base cost serves as the absolute minimum price.
 */
function getCardUnitCost(card, userCash = 10000) {
    if (!card) return 0;
    const baseCost = card.cost || 1000;
    const ratio = card.cashRatio || 0.10;
    const ratioCost = Math.floor(userCash * ratio);
    return Math.max(baseCost, ratioCost);
}

/**
 * Purchase a power card atomically using Gold Tokens.
 * Server validates card ID, token price, and token balance before executing atomic MongoDB update.
 */
async function purchasePowerCard(userId, cardId, quantity = 1) {
    const card = POWER_CARDS[cardId];
    if (!card) {
        return { success: false, status: 400, message: 'Invalid card ID' };
    }

    const qty = Math.max(1, Math.floor(Number(quantity) || 1));
    const tokenCost = (card.tokenCost || 10) * qty;

    const userBefore = await User.findById(userId).lean();
    if (!userBefore) {
        return { success: false, status: 404, message: 'User not found' };
    }

    const tokensBefore = userBefore.tokens !== undefined ? userBefore.tokens : 50;
    if (tokensBefore < tokenCost) {
        return {
            success: false,
            status: 400,
            message: `Insufficient Gold Tokens! You need ${tokenCost} 🪙 but only have ${tokensBefore} 🪙.`
        };
    }

    const updateField = `inventory.powerCards.${cardId}`;

    const updatedUser = await User.findOneAndUpdate(
        { _id: userId, tokens: { $gte: tokenCost } },
        {
            $inc: {
                tokens: -tokenCost,
                [updateField]: qty
            }
        },
        { returnDocument: 'after' }
    );

    if (!updatedUser) {
        return { success: false, status: 400, message: 'Purchase failed due to insufficient tokens or concurrent request.' };
    }

    const tokensAfter = updatedUser.tokens;
    const txId = `tx_pc_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;

    // Create auditable transaction record
    try {
        await Transaction.create({
            transactionId: txId,
            userId: userId.toString(),
            username: updatedUser.username,
            type: 'POWER_CARD_PURCHASE',
            amount: -tokenCost,
            balanceBefore: tokensBefore,
            balanceAfter: tokensAfter,
            reason: `Purchased x${qty} ${card.name} for ${tokenCost} Gold Tokens`
        });
    } catch (txErr) {
        if (txErr.code !== 11000) console.error('Transaction creation error:', txErr);
    }

    const rawInv = (updatedUser.inventory && updatedUser.inventory.powerCards) || {};
    const formattedInventory = {};
    Object.keys(POWER_CARDS).forEach(cId => {
        formattedInventory[cId] = Number(rawInv[cId] || 0);
    });

    return {
        success: true,
        message: `Purchased x${qty} ${card.name} for ${tokenCost} 🪙!`,
        tokens: updatedUser.tokens,
        cash: updatedUser.cash,
        card,
        quantity: qty,
        totalCost: tokenCost,
        inventory: formattedInventory
    };
}

/**
 * Validate whether a card can be used by a player in a room during the given phase.
 */
function validateCardUse(userId, cardId, room, currentPhase) {
    const card = POWER_CARDS[cardId];
    if (!card) {
        return { valid: false, reason: 'Invalid card ID' };
    }

    if (!room) {
        return { valid: false, reason: 'Room not found' };
    }

    const phase = currentPhase || room.status;
    if (!card.allowedPhases.includes(phase)) {
        return { valid: false, reason: `${card.name} cannot be used during ${phase.toUpperCase()} phase.` };
    }

    const player = room.players && room.players.find(p => p.userId === userId.toString());
    if (!player) {
        return { valid: false, reason: 'Player not in room' };
    }

    // Check if card has already been activated in this round
    room.activeCardEffects = room.activeCardEffects || {};
    const playerEffects = room.activeCardEffects[userId.toString()] || {};
    if (card.maxPerRound && playerEffects[cardId]) {
        return { valid: false, reason: `${card.name} has already been used in this round!` };
    }

    return { valid: true, card, player };
}

/**
 * Consume a power card from user inventory atomically and register active effect on room state.
 */
async function consumeAndApplyCard(userId, cardId, room, currentPhase) {
    const val = validateCardUse(userId, cardId, room, currentPhase);
    if (!val.valid) {
        console.warn(`[POWER CARD REJECTED] Player ${userId} in Room ${room ? room.code : 'N/A'}: ${val.reason}`);
        return { success: false, message: val.reason };
    }

    const cardField = `inventory.powerCards.${cardId}`;
    const updatedUser = await User.findOneAndUpdate(
        { _id: userId, [cardField]: { $gte: 1 } },
        { $inc: { [cardField]: -1 } },
        { returnDocument: 'after' }
    );

    if (!updatedUser) {
        console.warn(`[POWER CARD REJECTED] Player ${userId} does not own card ${cardId}`);
        return { success: false, message: `You do not own any ${val.card.name} cards!` };
    }

    // Register active effect on room state
    room.activeCardEffects = room.activeCardEffects || {};
    const uidStr = userId.toString();
    room.activeCardEffects[uidStr] = room.activeCardEffects[uidStr] || {};
    room.activeCardEffects[uidStr][cardId] = {
        activatedAt: Date.now(),
        round: room.currentRound || 1,
        card: val.card
    };

    console.log(`[POWER CARD USE] Player ${updatedUser.username} (${userId}) used ${cardId} in Room ${room.code} (Round ${room.currentRound}, Phase: ${currentPhase})`);


    const formattedInventory = {};
    Object.keys(POWER_CARDS).forEach(id => {
        formattedInventory[id] = Number((updatedUser.inventory && updatedUser.inventory.powerCards && updatedUser.inventory.powerCards[id]) || 0);
    });

    return {
        success: true,
        card: val.card,
        userId: uidStr,
        username: updatedUser.username,
        inventory: formattedInventory,
        activeEffects: room.activeCardEffects[uidStr]
    };
}

/**
 * Clear all temporary active card effects for a room on round transition or game over.
 */
function clearRoundActiveCardEffects(room) {
    if (room) {
        room.activeCardEffects = {};
    }
}

module.exports = {
    POWER_CARDS,
    getCardUnitCost,
    getUserPowerCards,
    purchasePowerCard,
    getCashExchangeRate,
    exchangeCashForTokens,
    validateCardUse,
    consumeAndApplyCard,
    clearRoundActiveCardEffects
};
