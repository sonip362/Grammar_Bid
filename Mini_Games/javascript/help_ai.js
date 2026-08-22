/**
 * Help AI / Circuit Flow Mini Game Script
 * Smooth line drawing engine, 8x8 flow layouts, attempt system & rewards
 */

let attemptsRemaining = 5;
let attemptsToday = 0;
const maxAttempts = 5;

let isPlaying = false;
let backendStartTime = null;
let timeLeft = 20.0;
let timerInterval = null;

let canvas, ctx;
const GRID_SIZE = 8;
let cellSize = 60;

const COLORS = [
    { id: 0, name: 'Red', hex: '#ef4444' },
    { id: 1, name: 'Blue', hex: '#3b82f6' },
    { id: 2, name: 'Green', hex: '#10b981' },
    { id: 3, name: 'Yellow', hex: '#f59e0b' },
    { id: 4, name: 'Purple', hex: '#8b5cf6' }
];

let activeLayout = null;
let colorPairs = [];
let colorPaths = {};
let activeColorId = null;
let isDrawing = false;
let currentPointerPos = null;

function resizeCanvas() {
    if (!canvas) return;
    const wrapper = canvas.parentElement;
    if (!wrapper) return;
    const size = Math.min(wrapper.clientWidth - 16, wrapper.clientHeight - 16, 520);
    canvas.width = Math.max(size, 300);
    canvas.height = Math.max(size, 300);
    cellSize = canvas.width / GRID_SIZE;
    drawCanvas();
}

async function fetchGameStatus() {
    const status = await ArcadeManager.fetchStatus('help-ai', 'gb_helpai_date', 'gb_helpai_attempts');
    attemptsRemaining = status.remainingAttempts;
    attemptsToday = status.attemptsToday;
    updateAttemptsUI();
}

function updateAttemptsUI() {
    ArcadeManager.updateTriesUI(attemptsRemaining, maxAttempts, {
        resetBtnId: 'main-play-btn',
        playAgainBtnId: 'modal-play-again-btn'
    });
}

async function submitGameResult(gameSuccess, timeRem) {
    const res = await ArcadeManager.submitReward('help-ai', { gameSuccess, timeRemaining: Math.round(timeRem) }, 'gb_helpai_date', 'gb_helpai_attempts');
    if (res.success || res.guestFallback) {
        attemptsRemaining = res.remainingAttempts;
        attemptsToday = res.attemptsToday;
        if (res.guestFallback && gameSuccess) {
            const currentTokens = parseInt(localStorage.getItem('gb_tokens') || '50', 10);
            ArcadeManager.syncBalances(null, currentTokens + 3);
        }
        updateAttemptsUI();
    }
}

const presetFlowLayoutsWithSolutions = [
    {
        pairs: [
            { colorId: 0, start: { r: 0, c: 0 }, end: { r: 7, c: 7 } },
            { colorId: 1, start: { r: 1, c: 0 }, end: { r: 6, c: 6 } },
            { colorId: 2, start: { r: 2, c: 0 }, end: { r: 5, c: 5 } },
            { colorId: 3, start: { r: 3, c: 0 }, end: { r: 4, c: 4 } },
            { colorId: 4, start: { r: 4, c: 0 }, end: { r: 7, c: 0 } }
        ],
        solutions: {
            0: [{ r: 0, c: 0 }, { r: 0, c: 1 }, { r: 0, c: 2 }, { r: 0, c: 3 }, { r: 0, c: 4 }, { r: 0, c: 5 }, { r: 0, c: 6 }, { r: 0, c: 7 }, { r: 1, c: 7 }, { r: 2, c: 7 }, { r: 3, c: 7 }, { r: 4, c: 7 }, { r: 5, c: 7 }, { r: 6, c: 7 }, { r: 7, c: 7 }],
            1: [{ r: 1, c: 0 }, { r: 1, c: 1 }, { r: 1, c: 2 }, { r: 1, c: 3 }, { r: 1, c: 4 }, { r: 1, c: 5 }, { r: 1, c: 6 }, { r: 2, c: 6 }, { r: 3, c: 6 }, { r: 4, c: 6 }, { r: 5, c: 6 }, { r: 6, c: 6 }],
            2: [{ r: 2, c: 0 }, { r: 2, c: 1 }, { r: 2, c: 2 }, { r: 2, c: 3 }, { r: 2, c: 4 }, { r: 2, c: 5 }, { r: 3, c: 5 }, { r: 4, c: 5 }, { r: 5, c: 5 }],
            3: [{ r: 3, c: 0 }, { r: 3, c: 1 }, { r: 3, c: 2 }, { r: 3, c: 3 }, { r: 3, c: 4 }, { r: 4, c: 4 }],
            4: [{ r: 4, c: 0 }, { r: 5, c: 0 }, { r: 6, c: 0 }, { r: 7, c: 0 }]
        }
    },
    {
        pairs: [
            { colorId: 0, start: { r: 0, c: 0 }, end: { r: 7, c: 1 } },
            { colorId: 1, start: { r: 0, c: 1 }, end: { r: 7, c: 3 } },
            { colorId: 2, start: { r: 0, c: 3 }, end: { r: 7, c: 5 } },
            { colorId: 3, start: { r: 0, c: 5 }, end: { r: 7, c: 7 } },
            { colorId: 4, start: { r: 0, c: 7 }, end: { r: 6, c: 7 } }
        ],
        solutions: {
            0: [{ r: 0, c: 0 }, { r: 1, c: 0 }, { r: 2, c: 0 }, { r: 3, c: 0 }, { r: 4, c: 0 }, { r: 5, c: 0 }, { r: 6, c: 0 }, { r: 7, c: 0 }, { r: 7, c: 1 }],
            1: [{ r: 0, c: 1 }, { r: 0, c: 2 }, { r: 1, c: 2 }, { r: 1, c: 1 }, { r: 2, c: 1 }, { r: 2, c: 2 }, { r: 3, c: 2 }, { r: 3, c: 1 }, { r: 4, c: 1 }, { r: 4, c: 2 }, { r: 5, c: 2 }, { r: 5, c: 1 }, { r: 6, c: 1 }, { r: 6, c: 2 }, { r: 7, c: 2 }, { r: 7, c: 3 }],
            2: [{ r: 0, c: 3 }, { r: 0, c: 4 }, { r: 1, c: 4 }, { r: 1, c: 3 }, { r: 2, c: 3 }, { r: 2, c: 4 }, { r: 3, c: 4 }, { r: 3, c: 3 }, { r: 4, c: 3 }, { r: 4, c: 4 }, { r: 5, c: 4 }, { r: 5, c: 3 }, { r: 6, c: 3 }, { r: 6, c: 4 }, { r: 7, c: 4 }, { r: 7, c: 5 }],
            3: [{ r: 0, c: 5 }, { r: 0, c: 6 }, { r: 1, c: 6 }, { r: 1, c: 5 }, { r: 2, c: 5 }, { r: 2, c: 6 }, { r: 3, c: 6 }, { r: 3, c: 5 }, { r: 4, c: 5 }, { r: 4, c: 6 }, { r: 5, c: 6 }, { r: 5, c: 5 }, { r: 6, c: 5 }, { r: 6, c: 6 }, { r: 7, c: 6 }, { r: 7, c: 7 }],
            4: [{ r: 0, c: 7 }, { r: 1, c: 7 }, { r: 2, c: 7 }, { r: 3, c: 7 }, { r: 4, c: 7 }, { r: 5, c: 7 }, { r: 6, c: 7 }]
        }
    },
    {
        pairs: [
            { colorId: 0, start: { r: 7, c: 0 }, end: { r: 0, c: 7 } },
            { colorId: 1, start: { r: 6, c: 0 }, end: { r: 1, c: 6 } },
            { colorId: 2, start: { r: 5, c: 0 }, end: { r: 2, c: 5 } },
            { colorId: 3, start: { r: 4, c: 0 }, end: { r: 3, c: 4 } },
            { colorId: 4, start: { r: 0, c: 0 }, end: { r: 3, c: 0 } }
        ],
        solutions: {
            0: [{ r: 7, c: 0 }, { r: 7, c: 1 }, { r: 7, c: 2 }, { r: 7, c: 3 }, { r: 7, c: 4 }, { r: 7, c: 5 }, { r: 7, c: 6 }, { r: 7, c: 7 }, { r: 6, c: 7 }, { r: 5, c: 7 }, { r: 4, c: 7 }, { r: 3, c: 7 }, { r: 2, c: 7 }, { r: 1, c: 7 }, { r: 0, c: 7 }],
            1: [{ r: 6, c: 0 }, { r: 6, c: 1 }, { r: 6, c: 2 }, { r: 6, c: 3 }, { r: 6, c: 4 }, { r: 6, c: 5 }, { r: 6, c: 6 }, { r: 5, c: 6 }, { r: 4, c: 6 }, { r: 3, c: 6 }, { r: 2, c: 6 }, { r: 1, c: 6 }],
            2: [{ r: 5, c: 0 }, { r: 5, c: 1 }, { r: 5, c: 2 }, { r: 5, c: 3 }, { r: 5, c: 4 }, { r: 5, c: 5 }, { r: 4, c: 5 }, { r: 3, c: 5 }, { r: 2, c: 5 }],
            3: [{ r: 4, c: 0 }, { r: 4, c: 1 }, { r: 4, c: 2 }, { r: 4, c: 3 }, { r: 4, c: 4 }, { r: 3, c: 4 }],
            4: [{ r: 0, c: 0 }, { r: 1, c: 0 }, { r: 2, c: 0 }, { r: 3, c: 0 }]
        }
    },
    {
        pairs: [
            { colorId: 0, start: { r: 0, c: 0 }, end: { r: 1, c: 7 } },
            { colorId: 1, start: { r: 1, c: 0 }, end: { r: 2, c: 7 } },
            { colorId: 2, start: { r: 2, c: 0 }, end: { r: 3, c: 7 } },
            { colorId: 3, start: { r: 3, c: 0 }, end: { r: 4, c: 7 } },
            { colorId: 4, start: { r: 4, c: 0 }, end: { r: 7, c: 7 } }
        ],
        solutions: {
            0: [{ r: 0, c: 0 }, { r: 0, c: 1 }, { r: 0, c: 2 }, { r: 0, c: 3 }, { r: 0, c: 4 }, { r: 0, c: 5 }, { r: 0, c: 6 }, { r: 0, c: 7 }, { r: 1, c: 7 }],
            1: [{ r: 1, c: 0 }, { r: 1, c: 1 }, { r: 1, c: 2 }, { r: 1, c: 3 }, { r: 1, c: 4 }, { r: 1, c: 5 }, { r: 1, c: 6 }, { r: 2, c: 6 }, { r: 2, c: 7 }],
            2: [{ r: 2, c: 0 }, { r: 2, c: 1 }, { r: 2, c: 2 }, { r: 2, c: 3 }, { r: 2, c: 4 }, { r: 2, c: 5 }, { r: 3, c: 5 }, { r: 3, c: 6 }, { r: 3, c: 7 }],
            3: [{ r: 3, c: 0 }, { r: 3, c: 1 }, { r: 3, c: 2 }, { r: 3, c: 3 }, { r: 3, c: 4 }, { r: 4, c: 4 }, { r: 4, c: 5 }, { r: 4, c: 6 }, { r: 4, c: 7 }],
            4: [{ r: 4, c: 0 }, { r: 5, c: 0 }, { r: 6, c: 0 }, { r: 7, c: 0 }, { r: 7, c: 1 }, { r: 7, c: 2 }, { r: 7, c: 3 }, { r: 7, c: 4 }, { r: 7, c: 5 }, { r: 7, c: 6 }, { r: 7, c: 7 }]
        }
    },
    {
        pairs: [
            { colorId: 0, start: { r: 0, c: 0 }, end: { r: 7, c: 0 } },
            { colorId: 1, start: { r: 0, c: 7 }, end: { r: 7, c: 7 } },
            { colorId: 2, start: { r: 0, c: 1 }, end: { r: 0, c: 6 } },
            { colorId: 3, start: { r: 7, c: 1 }, end: { r: 7, c: 6 } },
            { colorId: 4, start: { r: 1, c: 1 }, end: { r: 6, c: 6 } }
        ],
        solutions: {
            0: [{ r: 0, c: 0 }, { r: 1, c: 0 }, { r: 2, c: 0 }, { r: 3, c: 0 }, { r: 4, c: 0 }, { r: 5, c: 0 }, { r: 6, c: 0 }, { r: 7, c: 0 }],
            1: [{ r: 0, c: 7 }, { r: 1, c: 7 }, { r: 2, c: 7 }, { r: 3, c: 7 }, { r: 4, c: 7 }, { r: 5, c: 7 }, { r: 6, c: 7 }, { r: 7, c: 7 }],
            2: [{ r: 0, c: 1 }, { r: 0, c: 2 }, { r: 0, c: 3 }, { r: 0, c: 4 }, { r: 0, c: 5 }, { r: 0, c: 6 }],
            3: [{ r: 7, c: 1 }, { r: 7, c: 2 }, { r: 7, c: 3 }, { r: 7, c: 4 }, { r: 7, c: 5 }, { r: 7, c: 6 }],
            4: [{ r: 1, c: 1 }, { r: 1, c: 2 }, { r: 1, c: 3 }, { r: 1, c: 4 }, { r: 1, c: 5 }, { r: 1, c: 6 }, { r: 2, c: 6 }, { r: 3, c: 6 }, { r: 4, c: 6 }, { r: 5, c: 6 }, { r: 6, c: 6 }]
        }
    }
];

function scrambleDots() {
    const layoutIndex = attemptsToday % presetFlowLayoutsWithSolutions.length;
    activeLayout = presetFlowLayoutsWithSolutions[layoutIndex];
    colorPairs = JSON.parse(JSON.stringify(activeLayout.pairs));
}

function showSolution() {
    if (!activeLayout || !activeLayout.solutions) return;
    colorPaths = JSON.parse(JSON.stringify(activeLayout.solutions));
    drawCanvas();
    checkConnections();
    const statusText = document.getElementById('ai-status-text');
    if (statusText) statusText.textContent = 'Solution Revealed';
}

function revealSolutionFromModal() {
    document.getElementById('result-modal').classList.add('hidden');
    showSolution();
}

function showStartOverlay() {
    isPlaying = false;
    if (timerInterval) clearInterval(timerInterval);
    document.getElementById('start-overlay').classList.remove('hidden');
    initBoard();
}

function initBoard() {
    scrambleDots();
    clearLines();
    resizeCanvas();
}

function clearLines() {
    colorPaths = { 0: [], 1: [], 2: [], 3: [], 4: [] };
    activeColorId = null;
    isDrawing = false;
    currentPointerPos = null;
    drawCanvas();
    checkConnections();
}

function getCellCenter(r, c) {
    return {
        x: c * cellSize + cellSize / 2,
        y: r * cellSize + cellSize / 2
    };
}

function getGridPos(x, y) {
    const c = Math.floor(x / cellSize);
    const r = Math.floor(y / cellSize);
    if (r >= 0 && r < GRID_SIZE && c >= 0 && c < GRID_SIZE) {
        return { r, c };
    }
    return null;
}

function isCellOccupied(r, c, ignoreColorId = null) {
    for (let cId = 0; cId < 5; cId++) {
        if (ignoreColorId !== null && cId === ignoreColorId) continue;
        if (colorPaths[cId] && colorPaths[cId].some(p => p.r === r && p.c === c)) {
            return true;
        }
    }
    return false;
}

function drawCanvas() {
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    for (let r = 0; r < GRID_SIZE; r++) {
        for (let c = 0; c < GRID_SIZE; c++) {
            ctx.strokeStyle = 'rgba(255, 255, 255, 0.05)';
            ctx.lineWidth = 1;
            ctx.strokeRect(c * cellSize, r * cellSize, cellSize, cellSize);
        }
    }

    for (let cId = 0; cId < 5; cId++) {
        const path = colorPaths[cId];
        if (path && path.length > 0) {
            const colObj = COLORS[cId];
            ctx.save();
            ctx.strokeStyle = colObj.hex;
            ctx.lineWidth = cellSize * 0.32;
            ctx.lineCap = 'round';
            ctx.lineJoin = 'round';

            ctx.beginPath();
            const pts = path.map(p => getCellCenter(p.r, p.c));

            if (isDrawing && activeColorId === cId && currentPointerPos) {
                pts.push({ x: currentPointerPos.x, y: currentPointerPos.y });
            }

            ctx.moveTo(pts[0].x, pts[0].y);

            if (pts.length === 2) {
                ctx.lineTo(pts[1].x, pts[1].y);
            } else if (pts.length > 2) {
                for (let i = 1; i < pts.length - 1; i++) {
                    const xc = (pts[i].x + pts[i + 1].x) / 2;
                    const yc = (pts[i].y + pts[i + 1].y) / 2;
                    ctx.quadraticCurveTo(pts[i].x, pts[i].y, xc, yc);
                }
                ctx.lineTo(pts[pts.length - 1].x, pts[pts.length - 1].y);
            }

            ctx.stroke();
            ctx.restore();
        }
    }

    colorPairs.forEach(pair => {
        const colObj = COLORS[pair.colorId];
        const isConnected = isPairConnected(pair);

        [pair.start, pair.end].forEach(pt => {
            const center = getCellCenter(pt.r, pt.c);

            ctx.save();
            ctx.fillStyle = colObj.hex;
            ctx.beginPath();
            ctx.arc(center.x, center.y, cellSize * 0.28, 0, Math.PI * 2);
            ctx.fill();

            ctx.fillStyle = '#ffffff';
            ctx.beginPath();
            ctx.arc(center.x, center.y, cellSize * 0.09, 0, Math.PI * 2);
            ctx.fill();

            if (isConnected) {
                ctx.strokeStyle = '#ffffff';
                ctx.lineWidth = 2.5;
                ctx.stroke();
            }
            ctx.restore();
        });
    });
}

function isPairConnected(pair) {
    const path = colorPaths[pair.colorId];
    if (!path || path.length < 2) return false;
    const firstPt = path[0];
    const lastPt = path[path.length - 1];

    const matchesDirect = (firstPt.r === pair.start.r && firstPt.c === pair.start.c && lastPt.r === pair.end.r && lastPt.c === pair.end.c);
    const matchesReverse = (firstPt.r === pair.end.r && firstPt.c === pair.end.c && lastPt.r === pair.start.r && lastPt.c === pair.start.c);

    return matchesDirect || matchesReverse;
}

function checkConnections() {
    let connectedCount = 0;
    colorPairs.forEach(pair => {
        if (isPairConnected(pair)) connectedCount++;
    });

    const countEl = document.getElementById('connected-count');
    if (countEl) {
        const prevCount = parseInt(countEl.textContent || '0', 10);
        if (connectedCount > prevCount && window.ArcadeAudio) {
            ArcadeAudio.playConnect();
        }
        countEl.textContent = `${connectedCount}/5`;
    }

    if (isPlaying && connectedCount === 5) {
        handleVictory();
    }
}

function handlePointerDown(e) {
    if (!isPlaying || attemptsRemaining <= 0) return;
    e.preventDefault();

    const rect = canvas.getBoundingClientRect();
    const pointerX = (e.clientX || (e.touches && e.touches[0].clientX)) - rect.left;
    const pointerY = (e.clientY || (e.touches && e.touches[0].clientY)) - rect.top;

    currentPointerPos = { x: pointerX, y: pointerY };
    const gridPos = getGridPos(pointerX, pointerY);
    if (!gridPos) return;

    for (let pair of colorPairs) {
        const isStart = (pair.start.r === gridPos.r && pair.start.c === gridPos.c);
        const isEnd = (pair.end.r === gridPos.r && pair.end.c === gridPos.c);

        if (isStart || isEnd) {
            activeColorId = pair.colorId;
            isDrawing = true;
            colorPaths[activeColorId] = [{ r: gridPos.r, c: gridPos.c }];
            drawCanvas();
            return;
        }
    }

    for (let cId = 0; cId < 5; cId++) {
        const path = colorPaths[cId];
        if (path) {
            const idx = path.findIndex(p => p.r === gridPos.r && p.c === gridPos.c);
            if (idx !== -1) {
                activeColorId = cId;
                isDrawing = true;
                colorPaths[cId] = path.slice(0, idx + 1);
                drawCanvas();
                return;
            }
        }
    }
}

function handlePointerMove(e) {
    if (!isDrawing || activeColorId === null) return;
    e.preventDefault();

    const rect = canvas.getBoundingClientRect();
    const pointerX = (e.clientX || (e.touches && e.touches[0].clientX)) - rect.left;
    const pointerY = (e.clientY || (e.touches && e.touches[0].clientY)) - rect.top;

    currentPointerPos = { x: pointerX, y: pointerY };

    const gridPos = getGridPos(pointerX, pointerY);
    if (!gridPos) {
        drawCanvas();
        return;
    }

    const path = colorPaths[activeColorId];
    if (!path || path.length === 0) return;
    const lastPt = path[path.length - 1];

    if (lastPt.r === gridPos.r && lastPt.c === gridPos.c) {
        drawCanvas();
        return;
    }

    const rSteps = Math.sign(gridPos.r - lastPt.r);
    const cSteps = Math.sign(gridPos.c - lastPt.c);

    let currR = lastPt.r;
    let currC = lastPt.c;

    while (currR !== gridPos.r || currC !== gridPos.c) {
        let nextR = currR;
        let nextC = currC;

        if (currR !== gridPos.r) {
            nextR += rSteps;
        } else if (currC !== gridPos.c) {
            nextC += cSteps;
        }

        if (isCellOccupied(nextR, nextC, activeColorId)) {
            break;
        }

        if (path.length > 1) {
            const prevPt = path[path.length - 2];
            if (prevPt.r === nextR && prevPt.c === nextC) {
                path.pop();
                currR = nextR;
                currC = nextC;
                continue;
            }
        }

        path.push({ r: nextR, c: nextC });
        currR = nextR;
        currC = nextC;

        const pair = colorPairs.find(p => p.colorId === activeColorId);
        if (pair) {
            const firstPt = path[0];
            const isStartFirst = (firstPt.r === pair.start.r && firstPt.c === pair.start.c);
            const targetPt = isStartFirst ? pair.end : pair.start;

            if (currR === targetPt.r && currC === targetPt.c) {
                isDrawing = false;
                currentPointerPos = null;
                checkConnections();
                break;
            }
        }
    }

    drawCanvas();
}

function handlePointerUp(e) {
    if (isDrawing) {
        isDrawing = false;
        currentPointerPos = null;
        checkConnections();
        drawCanvas();
    }
}

async function startPuzzle() {
    if (attemptsRemaining <= 0) return;

    document.getElementById('start-overlay').classList.add('hidden');
    initBoard();
    isPlaying = true;
    timeLeft = 20.0;

    const authToken = ArcadeManager.getAuthToken();
    if (authToken) {
        try {
            const res = await fetch('/api/mini-games/help-ai/start-attempt', {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${authToken}` }
            });
            const data = await res.json();
            if (data.success) {
                backendStartTime = data.startTime;
            }
        } catch (err) {
            console.warn('Backend start attempt failed:', err);
        }
    }
    if (!backendStartTime) backendStartTime = Date.now();

    document.getElementById('ai-status-text').textContent = 'Connect all matching color dots.';

    if (timerInterval) clearInterval(timerInterval);

    timerInterval = setInterval(() => {
        const elapsedSec = (Date.now() - backendStartTime) / 1000;
        timeLeft = Math.max(0, 20.0 - elapsedSec);

        if (timeLeft <= 0) {
            timeLeft = 0;
            clearInterval(timerInterval);
            handleGameOver(false);
        }
        updateTimerDisplay();
    }, 100);
}

function updateTimerDisplay() {
    const mins = Math.floor(timeLeft / 60);
    const secs = Math.floor(timeLeft % 60);
    const formattedTime = `${mins}:${secs < 10 ? '0' : ''}${secs}`;
    const timerText = document.getElementById('timer-text');
    if (timerText) timerText.textContent = formattedTime;

    const pct = Math.max(0, (timeLeft / 20.0) * 100);
    const progressEl = document.getElementById('power-progress');
    if (progressEl) progressEl.style.width = `${pct}%`;
}

function handleVictory() {
    isPlaying = false;
    currentPointerPos = null;
    if (timerInterval) clearInterval(timerInterval);
    if (window.ArcadeAudio) ArcadeAudio.playWin();

    document.getElementById('ai-status-text').textContent = 'Circuits online.';

    submitGameResult(true, timeLeft);

    document.getElementById('result-title').textContent = 'Reboot Successful';
    document.getElementById('result-subtitle').textContent = 'All power lines connected without overlap.';
    document.getElementById('result-outcome-text').textContent = 'SUCCESS';
    document.getElementById('result-outcome-text').className = 'font-mono font-semibold text-slate-200';
    document.getElementById('result-cash-text').textContent = '+3 Gold Tokens';

    setTimeout(() => {
        document.getElementById('result-modal').classList.remove('hidden');
    }, 400);
}

function handleGameOver(isWin) {
    isPlaying = false;
    currentPointerPos = null;
    if (timerInterval) clearInterval(timerInterval);

    if (!isWin) {
        if (window.ArcadeAudio) ArcadeAudio.playError();
        document.getElementById('ai-status-text').textContent = 'Time Expired';

        submitGameResult(false, 0);

        document.getElementById('result-title').textContent = 'Time Expired';
        document.getElementById('result-subtitle').textContent = 'Could not reboot in 20 seconds.';
        document.getElementById('result-outcome-text').textContent = 'FAILED';
        document.getElementById('result-outcome-text').className = 'font-mono font-semibold text-rose-400';
        document.getElementById('result-cash-text').textContent = '+0 Tokens';

        showSolution();

        setTimeout(() => {
            document.getElementById('result-modal').classList.remove('hidden');
        }, 800);
    }
}

function closeModalAndReset() {
    document.getElementById('result-modal').classList.add('hidden');
    showStartOverlay();
}

function openHelpModal() {
    document.getElementById('help-modal').classList.remove('hidden');
}

function closeHelpModal() {
    document.getElementById('help-modal').classList.add('hidden');
}

document.addEventListener('DOMContentLoaded', () => {
    canvas = document.getElementById('circuit-canvas');
    if (canvas) {
        ctx = canvas.getContext('2d');
        canvas.addEventListener('mousedown', handlePointerDown);
        canvas.addEventListener('mousemove', handlePointerMove);
        window.addEventListener('mouseup', handlePointerUp);

        canvas.addEventListener('touchstart', handlePointerDown);
        canvas.addEventListener('touchmove', handlePointerMove);
        window.addEventListener('touchend', handlePointerUp);
        window.addEventListener('resize', resizeCanvas);

        fetchGameStatus();
        initBoard();
    }
});
