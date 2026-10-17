
"use strict";

// ==========================================
// DUCK BLASTER - Flying Duck Shooting Game
// ==========================================

const canvas = document.getElementById("gameCanvas");
const ctx = canvas.getContext("2d");

const $ = (id) => document.getElementById(id);

const ui = {
  score: $("score"),
  best: $("best"),
  level: $("level"),
  time: $("time"),
  lives: $("lives"),
  ammo: $("ammo"),
  levelProgress: $("levelProgress"),
  levelName: $("levelName"),
  overlay: $("overlay"),
  overlayTitle: $("overlayTitle"),
  overlayText: $("overlayText"),
  startBtn: $("startBtn"),
  pauseBtn: $("pauseBtn"),
  reloadBtn: $("reloadBtn"),
  soundBtn: $("soundBtn")
};

const MAX_LEVEL = 10;
const GAME_TIME = 60;
const MAGAZINE_SIZE = 6;
const STARTING_LIVES = 5;
const LEVEL_SCORE = 100;

let width = 800;
let height = 450;

let score = 0;
let best = loadBest();
let level = 1;
let lives = STARTING_LIVES;
let ammo = MAGAZINE_SIZE;
let timeLeft = GAME_TIME;

let running = false;
let paused = false;
let gameOver = false;
let reloading = false;
let soundEnabled = true;

let ducks = [];
let particles = [];

let spawnTimer = 0;
let reloadTimer = 0;
let elapsed = 0;
let lastFrame = 0;
let animationId = null;
let audioContext = null;

const levelNames = [
  "FIRST FLIGHT",
  "SKY PATROL",
  "QUICK WINGS",
  "FEATHER FRENZY",
  "GOLDEN HUNT",
  "WILD SKY",
  "ACE SHOOTER",
  "STORM FLIGHT",
  "MASTER HUNTER",
  "DUCK LEGEND"
];

// ==========================================
// SAVE HIGH SCORE
// ==========================================

function loadBest() {
  try {
    return Number(localStorage.getItem("duckBlasterBest")) || 0;
  } catch {
    return 0;
  }
}

function saveBest() {
  try {
    localStorage.setItem("duckBlasterBest", String(best));
  } catch {
    // Game can still run if storage is unavailable.
  }
}

// ==========================================
// CANVAS SIZE
// ==========================================

function resizeCanvas() {
  const rect = canvas.getBoundingClientRect();

  if (!rect.width || !rect.height) return;

  width = rect.width;
  height = rect.height;

  // Keep drawing coordinates in CSS pixels.
  // This also makes mouse and touch aiming accurate.
  const dpr = Math.min(window.devicePixelRatio || 1, 2);

  canvas.width = Math.round(width * dpr);
  canvas.height = Math.round(height * dpr);

  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

  if (!running) drawScene();
}

window.addEventListener("resize", resizeCanvas);

// ==========================================
// SOUND EFFECTS
// ==========================================

function playSound(frequency = 400, duration = 0.08, type = "sine") {
  if (!soundEnabled) return;

  try {
    const AudioContextClass =
      window.AudioContext || window.webkitAudioContext;

    if (!AudioContextClass) return;

    if (!audioContext) {
      audioContext = new AudioContextClass();
    }

    if (audioContext.state === "suspended") {
      audioContext.resume();
    }

    const oscillator = audioContext.createOscillator();
    const gain = audioContext.createGain();

    oscillator.type = type;
    oscillator.frequency.value = frequency;

    gain.gain.setValueAtTime(0.12, audioContext.currentTime);
    gain.gain.exponentialRampToValueAtTime(
      0.001,
      audioContext.currentTime + duration
    );

    oscillator.connect(gain);
    gain.connect(audioContext.destination);

    oscillator.start();
    oscillator.stop(audioContext.currentTime + duration);
  } catch {
    // Sound is optional.
  }
}

// ==========================================
// DUCK CREATION
// ==========================================

function createDuck() {
  const golden = Math.random() < 0.12;
  const direction = Math.random() < 0.5 ? 1 : -1;

  const baseSize = 0.8 + Math.random() * 0.45;
  const speed = 100 + level * 18 + Math.random() * 65;

  ducks.push({
    x: direction === 1 ? -45 : width + 45,
    y: 55 + Math.random() * Math.max(50, height * 0.58),
    vx: speed * direction,
    vy: (Math.random() - 0.5) * 45,
    scale: baseSize,
    golden,
    alive: true,
    escaped: false,
    wing: Math.random() * Math.PI * 2,
    wobble: Math.random() * Math.PI * 2
  });
}

// ==========================================
// DRAW THE BACKGROUND
// ==========================================

function drawBackground() {
  const sky = ctx.createLinearGradient(0, 0, 0, height);

  sky.addColorStop(0, "#58bde8");
  sky.addColorStop(0.65, "#b8eff4");
  sky.addColorStop(1, "#e3f7d2");

  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, width, height);

  // Sun
  ctx.beginPath();
  ctx.arc(width * 0.82, height * 0.19, 28, 0, Math.PI * 2);
  ctx.fillStyle = "#fff0a0";
  ctx.fill();

  // Clouds
  drawCloud(width * 0.19, height * 0.2, 1);
  drawCloud(width * 0.39, height * 0.14, 0.8);
  drawCloud(width * 0.92, height * 0.2, 1.05);

  // Distant hills
  ctx.fillStyle = "#91cc9b";
  ctx.beginPath();
  ctx.moveTo(0, height * 0.72);

  for (let x = 0; x <= width + 10; x += 10) {
    const y =
      height * 0.72 -
      Math.sin(x / 100) * height * 0.035 -
      Math.sin(x / 43) * height * 0.012;

    ctx.lineTo(x, y);
  }

  ctx.lineTo(width, height);
  ctx.lineTo(0, height);
  ctx.closePath();
  ctx.fill();

  // Ground
  ctx.fillStyle = "#5bbd61";
  ctx.fillRect(0, height * 0.88, width, height * 0.12);

  ctx.fillStyle = "#34894e";
  ctx.fillRect(0, height * 0.87, width, 5);

  // Trees
  const treeSpacing = Math.max(85, width / 7);

  for (let x = 10; x < width + treeSpacing; x += treeSpacing) {
    const treeY = height * 0.87;

    ctx.fillStyle = "#80512c";
    ctx.fillRect(x - 4, treeY - 25, 9, 29);

    ctx.fillStyle = "#267a4d";

    ctx.beginPath();
    ctx.arc(x, treeY - 34, 18, 0, Math.PI * 2);
    ctx.arc(x - 10, treeY - 26, 14, 0, Math.PI * 2);
    ctx.arc(x + 11, treeY - 25, 13, 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawCloud(x, y, scale) {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(scale, scale);
  ctx.fillStyle = "rgba(255,255,255,0.78)";

  ctx.beginPath();
  ctx.arc(-18, 4, 19, 0, Math.PI * 2);
  ctx.arc(0, -6, 25, 0, Math.PI * 2);
  ctx.arc(20, 5, 20, 0, Math.PI * 2);
  ctx.arc(2, 13, 21, 0, Math.PI * 2);
  ctx.fill();

  ctx.restore();
}

// ==========================================
// DRAW DUCKS
// ==========================================

function drawDuck(duck) {
  ctx.save();
  ctx.translate(duck.x, duck.y);
  ctx.scale(duck.scale, duck.scale);

  // Face the direction of travel
  if (duck.vx < 0) {
    ctx.scale(-1, 1);
  }

  const bodyColor = duck.golden ? "#ffd84e" : "#f6e1a1";
  const outline = duck.golden ? "#9b6817" : "#7c6939";

  // Wing animation
  const wingLift = Math.sin(duck.wing) * 5;

  // Body
  ctx.fillStyle = bodyColor;
  ctx.strokeStyle = outline;
  ctx.lineWidth = 2.5;

  ctx.beginPath();
  ctx.ellipse(0, 4, 25, 17, -0.1, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();

  // Wing
  ctx.fillStyle = duck.golden ? "#fff0a0" : "#fff0cb";

  ctx.beginPath();
  ctx.ellipse(-1, wingLift, 14, 9, -0.4, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();

  ctx.strokeStyle = outline;
  ctx.lineWidth = 1.5;

  ctx.beginPath();
  ctx.moveTo(-8, wingLift - 4);
  ctx.lineTo(3, wingLift + 5);
  ctx.moveTo(-1, wingLift - 5);
  ctx.lineTo(8, wingLift + 3);
  ctx.stroke();

  // Neck
  ctx.fillStyle = bodyColor;
  ctx.beginPath();
  ctx.ellipse(15, -13, 7, 15, -0.15, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();

  // Head
  ctx.beginPath();
  ctx.arc(17, -27, 12, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();

  // Beak
  ctx.fillStyle = "#eaa33d";
  ctx.beginPath();
  ctx.moveTo(26, -29);
  ctx.lineTo(40, -25);
  ctx.lineTo(26, -22);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  // Eye
  ctx.fillStyle = "#fff";
  ctx.beginPath();
  ctx.arc(20, -29, 4.2, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = "#182538";
  ctx.beginPath();
  ctx.arc(22, -29, 2, 0, Math.PI * 2);
  ctx.fill();

  // Tail
  ctx.fillStyle = bodyColor;
  ctx.beginPath();
  ctx.moveTo(-23, -1);
  ctx.lineTo(-34, -11);
  ctx.lineTo(-30, 1);
  ctx.lineTo(-36, 7);
  ctx.lineTo(-21, 8);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  // Feet
  ctx.strokeStyle = "#e98032";
  ctx.lineWidth = 2.5;

  ctx.beginPath();
  ctx.moveTo(4, 19);
  ctx.lineTo(4, 25);
  ctx.lineTo(-1, 27);
  ctx.moveTo(14, 19);
  ctx.lineTo(14, 25);
  ctx.lineTo(9, 27);
  ctx.stroke();

  // Golden sparkle
  if (duck.golden) {
    ctx.fillStyle = "#fff5a1";
    ctx.font = "bold 15px Arial";
    ctx.fillText("✦", -22, -22);
  }

  ctx.restore();
}

// ==========================================
// DRAW PARTICLES
// ==========================================

function addParticles(x, y, color) {
  for (let i = 0; i < 9; i++) {
    particles.push({
      x,
      y,
      vx: (Math.random() - 0.5) * 180,
      vy: (Math.random() - 0.5) * 180,
      life: 0.45 + Math.random() * 0.35,
      color
    });
  }
}

function drawParticles(dt) {
  for (const p of particles) {
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.life -= dt;

    ctx.globalAlpha = Math.max(0, Math.min(1, p.life * 2));
    ctx.fillStyle = p.color;
    ctx.beginPath();
    ctx.arc(p.x, p.y, 3, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.globalAlpha = 1;
  particles = particles.filter((p) => p.life > 0);
}

// ==========================================
// DRAW GAME
// ==========================================

function drawScene(dt = 0) {
  if (!ctx) return;

  ctx.clearRect(0, 0, width, height);

  drawBackground();

  for (const duck of ducks) {
    if (duck.alive) drawDuck(duck);
  }

  drawParticles(dt);

  // Crosshair follows pointer
  if (pointer.active) {
    ctx.save();
    ctx.strokeStyle = "rgba(255,255,255,0.9)";
    ctx.lineWidth = 2;

    ctx.beginPath();
    ctx.arc(pointer.x, pointer.y, 11, 0, Math.PI * 2);
    ctx.moveTo(pointer.x - 17, pointer.y);
    ctx.lineTo(pointer.x - 5, pointer.y);
    ctx.moveTo(pointer.x + 5, pointer.y);
    ctx.lineTo(pointer.x + 17, pointer.y);
    ctx.moveTo(pointer.x, pointer.y - 17);
    ctx.lineTo(pointer.x, pointer.y - 5);
    ctx.moveTo(pointer.x, pointer.y + 5);
    ctx.lineTo(pointer.x, pointer.y + 17);
    ctx.stroke();

    ctx.restore();
  }
}

const pointer = {
  x: 0,
  y: 0,
  active: false
};

// ==========================================
// HUD
// ==========================================

function updateHUD() {
  if (ui.score) ui.score.textContent = score;
  if (ui.best) ui.best.textContent = best;
  if (ui.level) ui.level.textContent = level;
  if (ui.time) ui.time.textContent = Math.max(0, Math.ceil(timeLeft));
  if (ui.lives) {
    ui.lives.textContent = lives > 0 ? "❤️".repeat(lives) : "💔";
  }

  if (ui.ammo) {
    ui.ammo.textContent = reloading ? "Reloading..." : `${ammo} / ${MAGAZINE_SIZE}`;
  }

  if (ui.levelName) {
    ui.levelName.textContent =
      `LEVEL ${level} — ${levelNames[level - 1]}`;
  }

  if (ui.levelProgress) {
    const progress = Math.min(100, (score % LEVEL_SCORE) / LEVEL_SCORE * 100);
    ui.levelProgress.style.width = `${progress}%`;
  }

  if (ui.pauseBtn) {
    ui.pauseBtn.textContent = paused ? "Resume" : "Pause";
  }

  if (score > best) {
    best = score;
    saveBest();
    if (ui.best) ui.best.textContent = best;
  }
}

// ==========================================
// OVERLAY
// ==========================================

function showOverlay(title, message, buttonText = "PLAY AGAIN") {
  if (!ui.overlay) return;

  if (ui.overlayTitle) ui.overlayTitle.textContent = title;
  if (ui.overlayText) ui.overlayText.textContent = message;
  if (ui.startBtn) ui.startBtn.textContent = buttonText;

  ui.overlay.classList.remove("hidden");
}

function hideOverlay() {
  if (ui.overlay) ui.overlay.classList.add("hidden");
}

// ==========================================
// START / RESTART
// ==========================================

function startGame() {
  if (animationId !== null) {
    cancelAnimationFrame(animationId);
    animationId = null;
  }

  score = 0;
  level = 1;
  lives = STARTING_LIVES;
  ammo = MAGAZINE_SIZE;
  timeLeft = GAME_TIME;

  running = true;
  paused = false;
  gameOver = false;
  reloading = false;

  ducks = [];
  particles = [];

  spawnTimer = 0;
  reloadTimer = 0;
  elapsed = 0;
  lastFrame = 0;

  resizeCanvas();
  hideOverlay();
  updateHUD();

  createDuck();
  animationId = requestAnimationFrame(gameLoop);
}

// ==========================================
// END GAME
// ==========================================

function endGame(won = false) {
  if (gameOver) return;

  gameOver = true;
  running = false;
  paused = false;
  reloading = false;

  if (animationId !== null) {
    cancelAnimationFrame(animationId);
    animationId = null;
  }

  updateHUD();
  drawScene();

  if (won) {
    showOverlay(
      "YOU WIN!",
      `Amazing! You completed all 10 levels with ${score} points.`,
      "PLAY AGAIN"
    );
  } else {
    showOverlay(
      "GAME OVER",
      `Final score: ${score}. Best score: ${best}. Try again!`,
      "PLAY AGAIN"
    );
  }
}

// ==========================================
// LOSE A LIFE
// ==========================================

function loseLife(reason) {
  if (gameOver || !running) return;

  lives = Math.max(0, lives - 1);

  if (reason === "miss") {
    playSound(150, 0.12, "square");
  } else {
    playSound(220, 0.16, "triangle");
  }

  updateHUD();

  if (lives <= 0) {
    endGame(false);
  }
}

// ==========================================
// SHOOTING
// ==========================================

function shoot(event) {
  if (!running || paused || gameOver || reloading || ammo <= 0) {
    if (ammo <= 0 && running && !paused && !reloading) {
      playSound(180, 0.05, "square");
    }
    return;
  }

  // Ignore clicks on the in-game control buttons.
  if (event.target.closest && event.target.closest("button")) return;

  const rect = canvas.getBoundingClientRect();

  const x = (event.clientX - rect.left) * (width / rect.width);
  const y = (event.clientY - rect.top) * (height / rect.height);

  ammo--;

  let hitDuck = null;

  // Check ducks from last drawn to first drawn.
  for (let i = ducks.length - 1; i >= 0; i--) {
    const duck = ducks[i];

    if (!duck.alive) continue;

    const dx = x - duck.x;
    const dy = y - duck.y;

    // Larger, more forgiving hit area.
    const hitRadius = 32 * duck.scale;

    if (dx * dx + dy * dy <= hitRadius * hitRadius) {
      hitDuck = duck;
      break;
    }
  }

  if (hitDuck) {
    hitDuck.alive = false;

    const points = hitDuck.golden ? 30 : 10;
    score += points;

    addParticles(
      hitDuck.x,
      hitDuck.y,
      hitDuck.golden ? "#ffd84e" : "#fff4c4"
    );

    playSound(hitDuck.golden ? 880 : 620, 0.09);

    // Progress through the 10 levels.
    const newLevel = Math.min(
      MAX_LEVEL,
      Math.floor(score / LEVEL_SCORE) + 1
    );

    if (newLevel > level) {
      level = newLevel;
      playSound(1000, 0.18);
    }

    updateHUD();
  } else {
    // NEW FIX: Every missed shot costs exactly one life.
    loseLife("miss");
  }

  updateHUD();

  if (!gameOver && ammo === 0) {
    // Let the player reload when the magazine is empty.
  }
}

// ==========================================
// RELOAD
// ==========================================

function reload() {
  if (!running || paused || gameOver || reloading) return;
  if (ammo === MAGAZINE_SIZE) return;

  reloading = true;
  reloadTimer = 1.1;

  playSound(300, 0.08, "triangle");
  updateHUD();
}

function finishReload() {
  ammo = MAGAZINE_SIZE;
  reloading = false;
  reloadTimer = 0;

  playSound(520, 0.08);
  updateHUD();
}

// ==========================================
// PAUSE / RESUME
// ==========================================

function togglePause() {
  if (!running || gameOver) return;

  paused = !paused;

  if (paused) {
    if (ui.overlayTitle) ui.overlayTitle.textContent = "PAUSED";
    if (ui.overlayText) {
      ui.overlayText.textContent = "Take a break. Resume when you're ready.";
    }
    if (ui.startBtn) ui.startBtn.textContent = "RESUME";
    if (ui.overlay) ui.overlay.classList.remove("hidden");
  } else {
    hideOverlay();
    lastFrame = 0;
  }

  updateHUD();
}

// ==========================================
// MAIN GAME LOOP
// ==========================================

function gameLoop(timestamp) {
  animationId = null;

  if (!running || gameOver) return;

  if (paused) {
    animationId = requestAnimationFrame(gameLoop);
    return;
  }

  const dt = lastFrame
    ? Math.min((timestamp - lastFrame) / 1000, 0.05)
    : 0;

  lastFrame = timestamp;
  elapsed += dt;
  timeLeft = Math.max(0, GAME_TIME - elapsed);

  if (reloading) {
    reloadTimer -= dt;

    if (reloadTimer <= 0) {
      finishReload();
    }
  }

  // Spawn ducks faster as levels increase.
  spawnTimer -= dt;

  const spawnInterval = Math.max(0.45, 1.35 - level * 0.075);
  const maxDucks = Math.min(3 + Math.floor(level / 2), 8);

  if (spawnTimer <= 0 && ducks.filter((d) => d.alive).length < maxDucks) {
    createDuck();
    spawnTimer = spawnInterval;
  }

  // Move ducks.
  for (const duck of ducks) {
    if (!duck.alive) continue;

    duck.x += duck.vx * dt;
    duck.y += duck.vy * dt;
    duck.wing += dt * 12;
    duck.wobble += dt * 2;

    // Gentle vertical movement.
    duck.y += Math.sin(duck.wobble) * 12 * dt;

    // Bounce gently off top/bottom boundaries.
    if (duck.y < 35) {
      duck.y = 35;
      duck.vy = Math.abs(duck.vy);
    }

    if (duck.y > height * 0.78) {
      duck.y = height * 0.78;
      duck.vy = -Math.abs(duck.vy);
    }

    // Escaping ducks also cost one life.
    const escaped =
      (duck.vx > 0 && duck.x > width + 50) ||
      (duck.vx < 0 && duck.x < -50);

    if (escaped && !duck.escaped) {
      duck.escaped = true;
      duck.alive = false;
      loseLife("escape");

      if (gameOver) return;
    }
  }

  ducks = ducks.filter((duck) => duck.alive);

  drawScene(dt);
  updateHUD();

  // Win when all 10 levels are completed.
  if (level >= MAX_LEVEL && score >= MAX_LEVEL * LEVEL_SCORE) {
    endGame(true);
    return;
  }

  // End when the timer runs out.
  if (timeLeft <= 0) {
    endGame(false);
    return;
  }

  animationId = requestAnimationFrame(gameLoop);
}

// ==========================================
// POINTER / MOUSE / TOUCH
// ==========================================

canvas.addEventListener("pointermove", (event) => {
  const rect = canvas.getBoundingClientRect();

  pointer.x = (event.clientX - rect.left) * (width / rect.width);
  pointer.y = (event.clientY - rect.top) * (height / rect.height);
  pointer.active = true;
});

canvas.addEventListener("pointerleave", () => {
  pointer.active = false;
});

canvas.addEventListener("pointerdown", (event) => {
  if (event.button !== undefined && event.button !== 0) return;

  event.preventDefault();
  shoot(event);
});

// ==========================================
// BUTTONS
// ==========================================

if (ui.startBtn) {
  ui.startBtn.addEventListener("click", () => {
    if (running && paused) {
      togglePause();
    } else {
      startGame();
    }
  });
}

if (ui.reloadBtn) {
  ui.reloadBtn.addEventListener("click", (event) => {
    event.stopPropagation();
    reload();
  });
}

if (ui.pauseBtn) {
  ui.pauseBtn.addEventListener("click", (event) => {
    event.stopPropagation();
    togglePause();
  });
}

if (ui.soundBtn) {
  ui.soundBtn.addEventListener("click", (event) => {
    event.stopPropagation();

    soundEnabled = !soundEnabled;
    ui.soundBtn.textContent = soundEnabled ? "Sound: ON" : "Sound: OFF";

    if (soundEnabled) playSound(600, 0.08);
  });
}

// Keyboard shortcuts.
window.addEventListener("keydown", (event) => {
  if (event.repeat) return;

  if (event.key.toLowerCase() === "r") {
    reload();
  }

  if (event.key === "Escape" || event.key.toLowerCase() === "p") {
    togglePause();
  }
});

// ==========================================
// INITIALIZE
// ==========================================

resizeCanvas();
updateHUD();
drawScene();

showOverlay(
  "DUCK BLASTER",
  "Shoot the ducks, collect bonus points, and survive all 10 levels!",
  "START GAME"
);
