# ⚖️ Grammar Bid — Real-Time Multiplayer Grammar Auction Game

[![Node.js](https://img.shields.io/badge/Node.js-v18+-339933?style=for-the-badge&logo=node.js&logoColor=white)](https://nodejs.org/)
[![Express.js](https://img.shields.io/badge/Express.js-000000?style=for-the-badge&logo=express&logoColor=white)](https://expressjs.com/)
[![Socket.io](https://img.shields.io/badge/Socket.io-010101?style=for-the-badge&logo=socket.io&logoColor=white)](https://socket.io/)
[![MongoDB](https://img.shields.io/badge/MongoDB-47A248?style=for-the-badge&logo=mongodb&logoColor=white)](https://www.mongodb.com/)
[![Groq AI](https://img.shields.io/badge/Groq_AI-GPT_OSS_20B-F05032?style=for-the-badge&logo=meta&logoColor=white)](https://groq.com/)
[![Tailwind CSS](https://img.shields.io/badge/Tailwind_CSS-v4.0-38B2AC?style=for-the-badge&logo=tailwind-css&logoColor=white)](https://tailwindcss.com/)

**Grammar Bid** is a fast-paced, real-time multiplayer auction web game where players bid on English sentences using virtual cash and Gold Tokens, test their grammar skills, activate tactical Power Cards, claim daily rewards, climb player ranks through XP, and compete to build the ultimate fortune!

---

## 🎮 Game Concept & Rules

Every player begins with **$10,000 Vault Cash** and **50 Gold Tokens**. Each match consists of **5 rounds** featuring dynamic sentences generated on-the-fly by AI.

### 5-Phase Game Loop

1. 🔍 **Inspection Phase (30s)**: Players inspect a candidate sentence on the auction block. Spend **$300** to buy a hint revealing grammar category clues or activate the **💡 Double Hint** power card.
2. 💰 **Bidding Phase (30s)**: Place competitive bids to purchase the auction lot.
   - **Ladder Rule**: Bids must exceed current highest bid by at least $100.
   - **Anti-Sniping**: Bids placed in the final 3 seconds extend timer by 2 seconds.
   - **Tactical Cards**: Activate **⚡ Bid Boost**, **🛡️ Bid Shield**, or **💰 Cashback** to manipulate bid power and loss protection.
3. 📊 **Result Reveal (10s)**: The gavel falls! If the winner bought a **Grammatically Correct** sentence, they earn their bid amount. If the sentence was **Incorrect**, they lose their bid (unless protected by Bid Shield or Cashback).
4. ✏️ **Bonus Correction Phase (30s)**: If the sentence was flawed, all players rush to type the correct fix. Need another try? Activate the **🔄 Second Chance** power card directly inside the Correction Modal!
   - **1st Accurate Correction**: Earns +$500 bonus & bonus XP.
   - **Subsequent Accurate Corrections**: Earn +$200 bonus.
   - **Incorrect Submissions**: Penalty of -$200.
5. 📖 **Official Solution & Standings Reveal (8s)**: View official corrected sentence, grammar rule explanation, player submission results, and updated XP ranks before starting the next round!

---

## 🪙 Gold Tokens & Power Card Store

Gold Tokens (🪙) are an exclusive secondary currency earned through Daily Rewards, Signup Bonuses, and Rank Ups.

### Fixed Token Pricing in Power Card Store

| Power Card | Fixed Token Price | Phase | Effect |
| :--- | :--- | :--- | :--- |
| **💡 Double Hint** | **5 Gold Tokens** 🪙 | Inspection | Explains grammar rule for the lot without revealing the answer directly. |
| **⚡ Bid Boost** | **8 Gold Tokens** 🪙 | Inspection, Bidding | Doubles bid power (2x bid strength), 2x win payout, 2x loss penalty. |
| **🔄 Second Chance** | **10 Gold Tokens** 🪙 | Correction | Grants 1 extra correction attempt (activatable directly inside Correction Modal). |
| **💰 Cashback** | **12 Gold Tokens** 🪙 | Inspection, Bidding | Returns 25% cash refund if you win an incorrect lot and lose money. |
| **🛡️ Bid Shield** | **15 Gold Tokens** 🪙 | Inspection, Bidding | Guarantees 100% loss protection ($0 cash penalty on incorrect lot). |

---

## 🎁 7-Day Daily Rewards Schedule

| Day | Reward Items | UI Badge |
| :--- | :--- | :--- |
| **Day 1** | **10 Gold Tokens** + **100 XP** *(No Cards)* | 🪙 10 Tokens + 100 XP |
| **Day 2** | **15 Gold Tokens** + **1x Double Hint Card** | 💡 15 Tokens + Double Hint |
| **Day 3** | **20 Gold Tokens** + **150 XP** *(No Cards)* | 🪙 20 Tokens + 150 XP |
| **Day 4** | **25 Gold Tokens** + **1x Bid Boost Card** | ⚡ 25 Tokens + Bid Boost |
| **Day 5** | **30 Gold Tokens** + **1x Second Chance Card** | 🔄 30 Tokens + Second Chance |
| **Day 6** | **40 Gold Tokens** + **1x Cashback Card** + **1x Bid Shield Card** | 🛡️ 40 Tokens + Cashback + Shield |
| **Day 7** | **50 Gold Tokens** + **500 XP** + **🦉 Owl Avatar** + **1x of ALL 5 Power Cards!** | 🎁 **Jackpot Pack** |

---

## ✨ Features

- **🤖 AI-Powered Sentence Engine**: Powered by Groq LLM (`openai/gpt-oss-20b`) with dynamic theme randomization (Space, Oceanography, Finance, Cybernetics, Archaeology) and varied grammar categories.
- **🏆 7-Tier Rank & XP Progression System**:
  1. 🌱 **Grammar Novice** (0 XP)
  2. 🔍 **Sentence Scout** (250 XP) — *+20 Tokens Bonus*
  3. 📝 **Proofreader** (750 XP) — *+20 Tokens Bonus*
  4. ⚖️ **Grammar Judge** (1,500 XP) — *+20 Tokens Bonus*
  5. 🧠 **Grammar Expert** (3,000 XP) — *+20 Tokens Bonus*
  6. 👑 **Grammar Master** (5,500 XP) — *+20 Tokens Bonus*
  7. 🌟 **Grammar Legend** (9,000 XP) — *+20 Tokens Bonus*
- **📬 Rank Unlock Inbox & Celebration Modal**: Automatically receive persistent Inbox messages when ranking up, complete with a **"✨ Show Animation"** replay button featuring CSS emoji bursts, spinning rays, and badge glow pulses!
- **📊 Career Performance Statistics**: Track decision accuracy %, total auctions won, bonus correction accuracy %, best bid amount, and active/best win streaks.
- **📱 Mobile-First Compact Design**: Ultra-compact single-row power card HUD for mobile auction rounds, responsive store modal, and in-modal Second Chance activation.
- **⚡ Real-Time WebSockets**: Instant bid synchronization, timer countdowns, and real-time inbox badges powered by Socket.io.
- **🖼️ Profile Avatars**: Customize your player profile with unlockable animated and static avatars.

---

## 🛠️ Tech Stack

| Domain | Technology |
| :--- | :--- |
| **Backend** | Node.js, Express.js, Socket.io |
| **AI LLM** | Groq SDK (`openai/gpt-oss-20b`) |
| **Database** | MongoDB Atlas & Mongoose ODM |
| **Authentication**| JSON Web Tokens (JWT) & bcrypt.js |
| **Frontend** | HTML5, Vanilla JavaScript (ES6+), Tailwind CSS v4 |
| **Testing** | Automated Integration Test Runner (`dailyRewards.test.js`, `powerCards.test.js`, `xpRankProgression.test.js`) |

---

## 🚀 Local Installation & Setup

### 1. Prerequisites
- [Node.js](https://nodejs.org/) (v18 or higher)
- A free [MongoDB Atlas](https://www.mongodb.com/cloud/atlas) cluster
- A free [Groq API Key](https://console.groq.com/)

### 2. Clone Repository
```bash
git clone https://github.com/sonip362/Grammar-Bid.git
cd Grammar-Bid
```

### 3. Install Dependencies
```bash
npm install
```

### 4. Configure Environment Variables
Create a `.env` file in the root directory:
```env
PORT=3000
MONGO_URI=mongodb+srv://YOUR_USERNAME:YOUR_PASSWORD@cluster0.xxx.mongodb.net/grammarbid?retryWrites=true&w=majority
GROQ_API_KEY=gsk_your_groq_api_key_here
GROQ_MODEL=openai/gpt-oss-20b
JWT_SECRET=your_super_secret_jwt_key
```

### 5. Start the Server
```bash
npm start
```
Open `http://localhost:3000` in your web browser!

---

## 🧪 Running Automated Test Suites

Run the automated integration test suites to verify daily rewards, power card mechanics, and rank progression math:

```bash
# 1. Daily Rewards System Test Suite
node tests/dailyRewards.test.js

# 2. Power Cards System Test Suite
node tests/powerCards.test.js

# 3. XP & Rank Progression Test Suite
node tests/xpRankProgression.test.js
```
