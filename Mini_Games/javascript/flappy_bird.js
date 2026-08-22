/**
 * Flappy Bird Mini Game Script
 * Vector HTML5 Canvas render engine, attempt system & rewards
 */

let canvas, ctx;

let attemptsRemaining = 5;
let attemptsToday = 0;
const maxAttempts = 5;

let gameState = 'START'; // START, PLAYING, GAMEOVER
let score = 0;
let bestScore = parseInt(localStorage.getItem('flappy_highscore') || '0', 10);
let frameCount = 0;

const bird = {
    x: 120,
    y: 300,
    width: 40,
    height: 32,
    velocity: 0,
    gravity: 0.32,
    jump: -5.8,
    rotation: 0
};

const pipes = [];
const pipeWidth = 72;
const pipeGap = 155;
const pipeSpeed = 1.7;
const pipeSpacingDistance = 300;

function resizeCanvas() {
    if (!canvas) return;
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
}

async function fetchGameStatus() {
    const status = await ArcadeManager.fetchStatus('flappy', 'gb_flappy_date', 'gb_flappy_attempts');
    attemptsRemaining = status.remainingAttempts;
    attemptsToday = status.attemptsToday;
    updateAttemptsUI();
}

function updateAttemptsUI() {
    const displayStr = `${attemptsRemaining} / ${maxAttempts}`;
    const startDisplay = document.getElementById('start-attempts-display');
    const hudDisplay = document.getElementById('hud-attempts');
    const triesDisplay = document.getElementById('tries-left-display');

    if (startDisplay) startDisplay.textContent = displayStr;
    if (hudDisplay) hudDisplay.textContent = displayStr;
    if (triesDisplay) triesDisplay.textContent = displayStr;

    const startBtn = document.getElementById('start-btn');
    const restartBtn = document.getElementById('restart-btn');
    const warningEl = document.getElementById('limit-warning');

    if (attemptsRemaining <= 0) {
        if (startBtn) {
            startBtn.disabled = true;
            startBtn.classList.add('opacity-50', 'cursor-not-allowed');
        }
        if (restartBtn) {
            restartBtn.disabled = true;
            restartBtn.classList.add('opacity-50', 'cursor-not-allowed');
        }
        if (warningEl) warningEl.classList.remove('hidden');
    } else {
        if (startBtn) {
            startBtn.disabled = false;
            startBtn.classList.remove('opacity-50', 'cursor-not-allowed');
        }
        if (restartBtn) {
            restartBtn.disabled = false;
            restartBtn.classList.remove('opacity-50', 'cursor-not-allowed');
        }
        if (warningEl) warningEl.classList.add('hidden');
    }
}

async function submitGameReward(pipesCleared) {
    const res = await ArcadeManager.submitReward('flappy', { pipesCleared }, 'gb_flappy_date', 'gb_flappy_attempts');
    if (res.success || res.guestFallback) {
        attemptsRemaining = res.remainingAttempts;
        attemptsToday = res.attemptsToday;
        if (res.guestFallback) {
            const currentTokens = parseInt(localStorage.getItem('gb_tokens') || '50', 10);
            ArcadeManager.syncBalances(null, currentTokens + (pipesCleared * 1));
        }
        updateAttemptsUI();
    }
}

function drawBirdSVG(x, y, rotation) {
    ctx.save();
    ctx.translate(x + bird.width / 2, y + bird.height / 2);
    ctx.rotate(rotation);

    ctx.beginPath();
    ctx.arc(0, 0, 18, 0, Math.PI * 2);
    ctx.fillStyle = '#facc15';
    ctx.fill();
    ctx.lineWidth = 2.5;
    ctx.strokeStyle = '#0f172a';
    ctx.stroke();

    ctx.beginPath();
    ctx.ellipse(-6, 3, 9, 5, Math.PI / 6, 0, Math.PI * 2);
    ctx.fillStyle = '#ffffff';
    ctx.fill();
    ctx.strokeStyle = '#0f172a';
    ctx.stroke();

    ctx.beginPath();
    ctx.arc(8, -6, 6, 0, Math.PI * 2);
    ctx.fillStyle = '#ffffff';
    ctx.fill();
    ctx.stroke();

    ctx.beginPath();
    ctx.arc(10, -6, 2.5, 0, Math.PI * 2);
    ctx.fillStyle = '#0f172a';
    ctx.fill();

    ctx.beginPath();
    ctx.moveTo(14, -2);
    ctx.lineTo(24, 3);
    ctx.lineTo(13, 8);
    ctx.closePath();
    ctx.fillStyle = '#f97316';
    ctx.fill();
    ctx.stroke();

    ctx.restore();
}

function drawPipeSVG(x, y, width, height, isTop) {
    ctx.save();
    const grad = ctx.createLinearGradient(x, 0, x + width, 0);
    grad.addColorStop(0, '#0e7490');
    grad.addColorStop(0.3, '#06b6d4');
    grad.addColorStop(0.7, '#22d3ee');
    grad.addColorStop(1, '#155e75');

    ctx.fillStyle = grad;
    ctx.fillRect(x, y, width, height);

    ctx.lineWidth = 2.5;
    ctx.strokeStyle = '#030712';
    ctx.strokeRect(x, y, width, height);

    const capHeight = 28;
    const capOverhang = 6;
    const capY = isTop ? y + height - capHeight : y;

    ctx.fillStyle = grad;
    ctx.fillRect(x - capOverhang, capY, width + capOverhang * 2, capHeight);
    ctx.strokeRect(x - capOverhang, capY, width + capOverhang * 2, capHeight);
    ctx.restore();
}

function drawEnvironment() {
    const groundHeight = 70;
    const groundY = canvas.height - groundHeight;

    ctx.fillStyle = 'rgba(255, 255, 255, 0.15)';
    const cloudOffset = (frameCount * 0.25) % (canvas.width + 300);

    ctx.beginPath();
    ctx.arc(120 - cloudOffset, 110, 35, 0, Math.PI * 2);
    ctx.arc(160 - cloudOffset, 95, 45, 0, Math.PI * 2);
    ctx.arc(200 - cloudOffset, 110, 35, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = '#0f172a';
    ctx.fillRect(0, groundY, canvas.width, groundHeight);

    ctx.fillStyle = '#06b6d4';
    ctx.fillRect(0, groundY, canvas.width, 10);
    ctx.lineWidth = 2.5;
    ctx.strokeStyle = '#030712';
    ctx.beginPath();
    ctx.moveTo(0, groundY);
    ctx.lineTo(canvas.width, groundY);
    ctx.stroke();

    ctx.strokeStyle = '#1e293b';
    ctx.lineWidth = 5;
    const stripeOffset = (frameCount * pipeSpeed) % 24;
    for (let i = -30; i < canvas.width + 30; i += 24) {
        ctx.beginPath();
        ctx.moveTo(i - stripeOffset, groundY + 10);
        ctx.lineTo(i - stripeOffset - 12, canvas.height);
        ctx.stroke();
    }
}

function flap() {
    if (gameState === 'START') {
        startGame();
    } else if (gameState === 'PLAYING') {
        bird.velocity = bird.jump;
        if (window.ArcadeAudio) ArcadeAudio.playJump();
    }
}

function startGame() {
    if (attemptsRemaining <= 0) return;

    document.getElementById('start-overlay').classList.add('hidden');
    document.getElementById('gameover-overlay').classList.add('hidden');
    document.getElementById('live-hud').classList.remove('hidden');

    bird.x = Math.min(160, canvas.width * 0.25);
    bird.y = canvas.height / 2;
    bird.velocity = 0;
    bird.rotation = 0;
    pipes.length = 0;
    score = 0;
    frameCount = 0;

    const firstPipeX = bird.x + 360;
    const groundY = canvas.height - 70;
    const minH = 80;
    const maxH = groundY - pipeGap - minH;
    const topH = Math.floor(Math.random() * (maxH - minH + 1)) + minH;

    pipes.push({
        x: firstPipeX,
        topHeight: topH,
        passed: false
    });

    document.getElementById('live-score').textContent = '0';
    document.getElementById('live-cash').textContent = '0';

    gameState = 'PLAYING';
}

function gameOver() {
    gameState = 'GAMEOVER';
    if (window.ArcadeAudio) ArcadeAudio.playError();
    if (score > bestScore) {
        bestScore = score;
        localStorage.setItem('flappy_highscore', bestScore.toString());
    }

    const tokensEarned = score * 1;
    document.getElementById('live-hud').classList.add('hidden');
    document.getElementById('final-score').textContent = score;
    document.getElementById('best-score').textContent = bestScore;
    document.getElementById('cash-earned').textContent = `+${tokensEarned} Tokens`;

    submitGameReward(score);

    document.getElementById('gameover-overlay').classList.remove('hidden');
}

function restartGame() {
    if (attemptsRemaining <= 0) return;
    startGame();
}

function gameLoop() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    const groundY = canvas.height - 70;

    drawEnvironment();

    if (gameState === 'PLAYING') {
        frameCount++;

        bird.velocity += bird.gravity;
        bird.y += bird.velocity;
        bird.rotation = Math.min(Math.PI / 4, Math.max(-Math.PI / 6, bird.velocity * 0.07));

        const lastPipe = pipes[pipes.length - 1];
        if (lastPipe && lastPipe.x <= canvas.width - pipeSpacingDistance) {
            const minH = 80;
            const maxH = groundY - pipeGap - minH;
            const topH = Math.floor(Math.random() * (maxH - minH + 1)) + minH;

            pipes.push({
                x: canvas.width,
                topHeight: topH,
                passed: false
            });
        }

        for (let i = pipes.length - 1; i >= 0; i--) {
            const p = pipes[i];
            p.x -= pipeSpeed;

            drawPipeSVG(p.x, 0, pipeWidth, p.topHeight, true);
            const bottomY = p.topHeight + pipeGap;
            const bottomH = groundY - bottomY;
            drawPipeSVG(p.x, bottomY, pipeWidth, bottomH, false);

            if (!p.passed && p.x + pipeWidth < bird.x) {
                p.passed = true;
                score++;
                if (window.ArcadeAudio) ArcadeAudio.playScore();
                document.getElementById('live-score').textContent = score;
                document.getElementById('live-cash').textContent = (score * 1).toString();
            }

            const birdBox = {
                left: bird.x - 14,
                right: bird.x + 14,
                top: bird.y - 14,
                bottom: bird.y + 14
            };

            if (
                (birdBox.right > p.x && birdBox.left < p.x + pipeWidth && birdBox.top < p.topHeight) ||
                (birdBox.right > p.x && birdBox.left < p.x + pipeWidth && birdBox.bottom > bottomY)
            ) {
                gameOver();
            }

            if (p.x + pipeWidth < -40) {
                pipes.splice(i, 1);
            }
        }

        if (bird.y + 16 >= groundY || bird.y - 16 <= 0) {
            gameOver();
        }

        drawBirdSVG(bird.x, bird.y, bird.rotation);

    } else if (gameState === 'START') {
        const bobY = (canvas.height / 2) + Math.sin(Date.now() * 0.004) * 8;
        drawBirdSVG(bird.x, bobY, 0);

    } else if (gameState === 'GAMEOVER') {
        for (let i = 0; i < pipes.length; i++) {
            const p = pipes[i];
            drawPipeSVG(p.x, 0, pipeWidth, p.topHeight, true);
            const bottomY = p.topHeight + pipeGap;
            drawPipeSVG(p.x, bottomY, pipeWidth, groundY - bottomY, false);
        }
        drawBirdSVG(bird.x, Math.min(bird.y, groundY - 16), Math.PI / 2);
    }

    requestAnimationFrame(gameLoop);
}

document.addEventListener('DOMContentLoaded', () => {
    canvas = document.getElementById('game-canvas');
    if (canvas) {
        ctx = canvas.getContext('2d');
        resizeCanvas();
        window.addEventListener('resize', resizeCanvas);

        window.addEventListener('keydown', (e) => {
            if (e.code === 'Space' || e.code === 'ArrowUp') {
                e.preventDefault();
                flap();
            }
        });

        canvas.addEventListener('mousedown', (e) => {
            e.preventDefault();
            flap();
        });

        canvas.addEventListener('touchstart', (e) => {
            e.preventDefault();
            flap();
        }, { passive: false });

        fetchGameStatus();
        requestAnimationFrame(gameLoop);
    }
});
