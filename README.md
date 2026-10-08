# 🎮 Grammar Bid — Real-Time Multiplayer Grammar Auction Game

Grammar Bid is a real-time multiplayer auction game built with Node.js, Express 5, Socket.IO 4, MongoDB Atlas, and Tailwind CSS. Players enter competitive auction rooms, bid on sentence lots, evaluate grammatical accuracy, submit corrections, and earn XP and Gold Tokens to climb the global leaderboard.

---

## 🏗️ Architecture & Project Structure

The backend has been modularized from a monolithic structure into a decoupled, layered service architecture inside the `server/` directory:

```
Grammar/
├── index.js                     # Root entry point delegating to server/index.js
├── package.json                 # Scripts and dependencies
├── Dockerfile                   # Production container setup (Node 18 Alpine, non-root USER node)
├── server/
│   ├── index.js                 # Central server bootstrapper (Express app, CORS, Helmet, Static serving, DB & Socket init)
│   ├── middleware/
│   │   ├── auth.js              # Auth & Admin JWT verification, secrets, and middlewares
│   │   └── rateLimiters.js      # Rate limiters (login, signup, admin, general API)
│   ├── utils/
│   │   └── logger.js            # Quiet logs mode & MongoDB error log capture system
│   ├── game/
│   │   ├── gameState.js         # In-memory stores (rooms, room timeouts, grace timers, user tracking) & state helpers
│   │   └── gameEngine.js        # Core game phase engine (startRound, resolveRound, startCorrectionPhase, nextRoundOrEnd)
│   ├── routes/
│   │   ├── authRoutes.js        # User auth endpoints (/guest, /signup, /login, /me, /buy-avatar, /profile, /convert-guest)
│   │   ├── adminRoutes.js       # Admin control endpoints (/verify, /users, /logs, /broadcast, /reports, /transactions)
│   │   ├── reportRoutes.js      # Question report submission (/api/reports)
│   │   ├── inboxRoutes.js       # Player inbox & notification management (/api/inbox/*)
│   │   ├── rewardRoutes.js      # Daily rewards & power cards store endpoints
│   │   ├── miniGameRoutes.js    # Mini-games reward system (Flappy Bird, Tic Tac Toe, Help AI, Pattern Sequence, Food Memory)
│   │   ├── notificationRoutes.js# Web push VAPID & subscription endpoints
│   │   └── userRoutes.js        # Tutorial completion & global leaderboard endpoints
│   ├── sockets/
│   │   ├── socketHandler.js     # Socket.IO connection & event handlers (create/join room, bidding, corrections, power cards, kick/leave)
│   │   └── botHandler.js        # AI bot player lifecycle hooks
│   ├── services/
│   │   ├── dailyRewardService.js# Daily rewards streak and claim logic
│   │   ├── powerCardService.js  # Power cards inventory, store, and in-game activation effects
│   │   ├── pushService.js       # Web push notifications via VAPID keys
│   │   └── xpService.js         # Server-authoritative XP awards & rank progression
│   ├── config/
│   │   ├── dailyRewards.js      # 14-day daily reward schedule configuration
│   │   ├── powerCards.js        # Power card definitions, pricing, and phase restrictions
│   │   └── ranks.js             # Rank thresholds, badges, and progress formulas
│   └── bots/
│       ├── BotPlayer.js         # Bot behavior & bidding decision logic
│       └── botProfiles.js       # Predefined bot profiles and avatars
├── models/                      # Mongoose data schemas (User, Log, QuestionReport, Transaction, InboxMessage, XPTransaction)
├── data/                        # Question generation & LanguageTool audit engine
├── pages/                       # Templates, stylesheets, and client-side JavaScript
├── Mini_Games/                  # Mini-game arcade deck pages and logic
└── tests/                       # Node.js automated test suites
```

---

## 🔒 Security & Hardening Controls

| Security Control | Implementation Details | Status |
|------------------|------------------------|--------|
| **Secret Protection** | Refuses to start if `JWT_SECRET` environment variable is not set. Dedicated `ADMIN_JWT_SECRET` generated using SHA-256 HMAC salt. | ✅ Active |
| **Admin Verification** | Timing-safe buffer comparison (`crypto.timingSafeEqual`) prevents timing-attack vectors on admin code verification. Short-lived 1-hour admin JWTs. | ✅ Active |
| **Rate Limiting** | `loginRateLimiter` (max 20 per 15m), `signupRateLimiter` (max 10 per 1h), `adminVerifyRateLimiter` (max 10 per 15m), `generalApiLimiter` (max 120 per 1m). | ✅ Active |
| **Input Validation & Sanitization** | `avatarUrl` strictly validated against whitelist (`ALLOWED_AVATAR_FILENAMES`) and relative path prefix (`/images/profile/`). | ✅ Active |
| **Security Headers** | Integrated `helmet` middleware for security headers. | ✅ Active |
| **Container Security** | `Dockerfile` runs under non-root unprivileged `USER node` account on Node 18 Alpine. | ✅ Active |
| **Server-Authoritative Economy** | All mini-game rewards, power card inventory decrements, cash calculations, and XP progression are strictly computed server-side. | ✅ Active |

---

## 🧪 Automated Test Suite

Run all test suites using Node.js built-in test runner:

```bash
npm test
```

### Included Test Files:
1. `tests/dailyRewards.test.js` — 18 tests covering 14-day streak cycles, double-claim rejection, concurrency guards, and server authority.
2. `tests/dialectValidation.test.js` — Quality audit, regional dialect candidate rejection, and LanguageTool grammar validation.
3. `tests/powerCards.test.js` — 11 tests for power card store purchases, phase restrictions, atomic decrements, and rank exchange.
4. `tests/securityFlaws.test.js` — 8 security tests verifying admin secret verification, password policy, socket identity protection, and push input checks.
5. `tests/xpRankProgression.test.js` — Rank boundary threshold checks, rank progression formulas, and anti-farming bot exclusion.

---

## 🚀 Getting Started

### Prerequisites
- **Node.js**: `>= 18.0.0`
- **MongoDB Atlas** database connection URI
- **Groq API Key** (for sentence generation)

### Environment Setup (`.env`)
Create a `.env` file in the project root:

```env
PORT=3000
MONGO_URI=YourMongoDbUrl
JWT_SECRET=your_super_secret_jwt_key
ADMIN_CODE=your_secure_admin_passcode
GROQ_API_KEY=gsk_your_groq_api_key
GROQ_MODEL=openai/gpt-oss-20b
QUIET_LOGS=false
VAPID_PUBLIC_KEY=your_vapid_public_key
VAPID_PRIVATE_KEY=your_vapid_private_key
VAPID_EMAIL=mailto:admin@example.com
```

### Installation & Execution

```bash
# Install dependencies
npm install

# Build CSS
npm run build:css

# Start server
npm start

# Development mode (concurrent server + CSS watcher)
npm run dev
```

The application will be accessible at `http://localhost:3000`.

---

