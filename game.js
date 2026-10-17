
const canvas = document.getElementById("gameCanvas");
const ctx = canvas.getContext("2d");

const $ = id => document.getElementById(id);

const scoreEl = $("score");
const bestEl = $("best");
const levelEl = $("level");
const timeEl = $("time");
const livesEl = $("lives");
const ammoEl = $("ammo");
const levelNameEl = $("levelName");
const progressEl = $("levelProgress");
const overlay = $("overlay");
const overlayTitle = $("overlayTitle");
const overlayText = $("overlayText");
const startBtn = $("startBtn");
const pauseBtn = $("pauseBtn");
const reloadBtn = $("reloadBtn");
const soundBtn = $("soundBtn");

const GAME_DURATION = 60;
const MAX_LEVEL = 10;
const MAX_AMMO = 6;
const MAX_LIVES = 5;

const levelNames = [
  "FIRST FLIGHT", "SKY PATROL", "QUICK WINGS",
  "FEATHER FRENZY", "AIRBORNE ACTION", "WILD SKY",
  "ACE SHOOTER", "STORM FLIGHT", "MASTER HUNTER",
  "LEGENDARY SHOT"
];

let width = 800;
let height = 450;
let pixelRatio = 1;

let score = 0;
let best = Number(localStorage.getItem("duckBlasterBest") || 0);
let level = 1;
let lives = MAX_LIVES;
let ammo = MAX_AMMO;
let timeLeft = GAME_DURATION;

let ducks = [];
let particles = [];
let floatingTexts = [];
let clouds = [];
let grass = [];

let running = false;
let paused = false;
let reloading = false;
let soundEnabled = true;

let spawnTimer = 0;
let lastFrame = 0;
let animationId = null;
let reloadTimeout = null;
let audioContext = null;

let pointer = { x: -100, y: -100 };
let shake = 0;
let shotFlash = 0;

// ---------- CANVAS ----------

function resizeCanvas() {
  const rect = canvas.getBoundingClientRect();

  width = rect.width || 800;
  height = rect.height || 450;
  pixelRatio = Math.min(window.devicePixelRatio || 1, 2);

  canvas.width = Math.round(width * pixelRatio);
  canvas.height = Math.round(height * pixelRatio);

  ctx.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);

  createScenery();
  drawScene(0);
}

function createScenery() {
  clouds = Array.from({ length: 7 }, (_, i) => ({
    x: i * width / 7 + Math.random() * 30,
    y: 35 + Math.random() * height * 0.32,
    size: 0.55 + Math.random() * 0.8,
    speed: 5 + Math.random() * 12
  }));

  grass = Array.from(
    { length: Math.ceil(width / 12) + 2 },
    (_, i) => ({
      x: i * 12,
      h: 8 + Math.random() * 25
    })
  );
}

window.addEventListener("resize", resizeCanvas);

// ---------- SOUND ----------

function playSound(frequency, duration = 0.08, type = "sine", volume = 0.035) {
  if (!soundEnabled) return;

  try {
    if (!audioContext) {
      audioContext = new (
        window.AudioContext || window.webkitAudioContext
      )();
    }

    if (audioContext.state === "suspended") {
      audioContext.resume();
    }

    const oscillator = audioContext.createOscillator();
    const gain = audioContext.createGain();

    oscillator.type = type;
    oscillator.frequency.setValueAtTime(
      frequency,
      audioContext.currentTime
    );

    gain.gain.setValueAtTime(volume, audioContext.currentTime);
    gain.gain.exponentialRampToValueAtTime(
      0.001,
      audioContext.currentTime + duration
    );

    oscillator.connect(gain);
    gain.connect(audioContext.destination);

    oscillator.start();
    oscillator.stop(audioContext.currentTime + duration);
  } catch (error) {
    // Sound is optional; gameplay continues without it.
  }
}

soundBtn.addEventListener("click", () => {
  soundEnabled = !soundEnabled;
  soundBtn.textContent = soundEnabled ? "🔊 Sound" : "🔇 Sound";

  if (soundEnabled) playSound(600);
});

// ---------- LEVELS ----------

function getLevelFromScore(points) {
  return Math.min(MAX_LEVEL, 1 + Math.floor(points / 100));
}

function getDuckLimit() {
  return Math.min(6, 1 + Math.floor((level - 1) / 2));
}

function getSpawnInterval() {
  return Math.max(330, 1250 - (level - 1) * 95);
}

function updateLevel() {
  const newLevel = getLevelFromScore(score);

  if (newLevel !== level) {
    level = newLevel;

    addFloatingText(
      width / 2,
      height * 0.32,
      `LEVEL ${level}!`,
      "#fff16b",
      true
    );

    playSound(600 + level * 80, 0.22, "triangle", 0.06);
  }

  levelEl.textContent = `${level} / ${MAX_LEVEL}`;
  levelNameEl.textContent =
    `LEVEL ${level} — ${levelNames[level - 1]}`;

  const progress = level === MAX_LEVEL ? 100 : score % 100;
  progressEl.style.width = `${progress}%`;
}

// ---------- DUCK SPAWNING ----------

function spawnDuck() {
  const direction = Math.random() < 0.5 ? 1 : -1;
  const scale = 0.8 + Math.random() * 0.35;

  ducks.push({
    x: direction === 1 ? -55 : width + 55,
    y: 65 + Math.random() * Math.max(70, height * 0.48),
    direction,
    scale,
    speed: (65 + Math.random() * 45) * (1 + (level - 1) * 0.15),
    verticalSpeed: 18 + Math.random() * 30 + level * 1.5,
    phase: Math.random() * Math.PI * 2,
    flap: Math.random() * Math.PI * 2,
    isGolden: Math.random() < 0.08,
    alive: true
  });
}

// ---------- BACKGROUND ----------

function drawBackground(dt) {
  const sky = ctx.createLinearGradient(0, 0, 0, height);
  sky.addColorStop(0, "#55bde8");
  sky.addColorStop(0.58, "#b9f0fa");
  sky.addColorStop(1, "#f5e9b6");

  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, width, height);

  // Sun
  ctx.fillStyle = "#fff2a8";
  ctx.beginPath();
  ctx.arc(width * 0.82, height * 0.18, 32, 0, Math.PI * 2);
  ctx.fill();

  // Moving clouds
  for (const cloud of clouds) {
    cloud.x += cloud.speed * dt;

    if (cloud.x > width + 100) cloud.x = -100;

    ctx.save();
    ctx.translate(cloud.x, cloud.y);
    ctx.scale(cloud.size, cloud.size);
    ctx.fillStyle = "rgba(255,255,255,0.75)";

    ctx.beginPath();
    ctx.arc(-22, 0, 18, 0, Math.PI * 2);
    ctx.arc(0, -10, 24, 0, Math.PI * 2);
    ctx.arc(24, 0, 18, 0, Math.PI * 2);
    ctx.arc(3, 7, 25, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  // Hills
  const groundY = height * 0.82;

  ctx.fillStyle = "#91ce9d";
  ctx.beginPath();
  ctx.moveTo(0, height * 0.67);

  for (let x = 0; x <= width + 20; x += 20) {
    ctx.lineTo(
      x,
      height * 0.64 +
        Math.sin(x * 0.012) * 20 +
        Math.sin(x * 0.027) * 8
    );
  }

  ctx.lineTo(width, height);
  ctx.lineTo(0, height);
  ctx.closePath();
  ctx.fill();

  // Ground
  ctx.fillStyle = "#5fbd63";
  ctx.fillRect(0, groundY, width, height - groundY);

  ctx.fillStyle = "#348e4a";
  ctx.fillRect(0, groundY, width, 7);

  // Grass blades
  ctx.strokeStyle = "#348e4a";
  ctx.lineWidth = 2;

  for (const blade of grass) {
    ctx.beginPath();
    ctx.moveTo(blade.x, height);
    ctx.lineTo(blade.x - 3, height - blade.h);
    ctx.stroke();
  }

  // Trees
  for (let i = 0; i < 8; i++) {
    const tx = i * (width / 7);
    const ty = groundY + 5;

    ctx.fillStyle = "#7a4c2c";
    ctx.fillRect(tx - 4, ty - 35, 8, 40);

    ctx.fillStyle = i % 2 ? "#318453" : "#267849";
    ctx.beginPath();
    ctx.arc(tx, ty - 43, 22, 0, Math.PI * 2);
    ctx.arc(tx - 13, ty - 31, 16, 0, Math.PI * 2);
    ctx.arc(tx + 13, ty - 31, 16, 0, Math.PI * 2);
    ctx.fill();
  }
}

// ---------- DUCK DRAWING ----------

function drawDuck(duck) {
  const wingFlap = Math.sin(duck.flap) * 0.6;
  const s = duck.scale;
  const bodyColor = duck.isGolden ? "#ffbd22" : "#f5d64b";
  const wingColor = duck.isGolden ? "#fff078" : "#fff09a";
  const outline = "#654521";

  ctx.save();
  ctx.translate(duck.x, duck.y);
  ctx.scale(duck.direction * s, s);

  // Tail
  ctx.fillStyle = bodyColor;
  ctx.strokeStyle = outline;
  ctx.lineWidth = 2.2;

  ctx.beginPath();
  ctx.moveTo(-21, 0);
  ctx.lineTo(-36, -12);
  ctx.lineTo(-32, 2);
  ctx.lineTo(-39, 10);
  ctx.lineTo(-18, 9);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  // Body
  ctx.beginPath();
  ctx.ellipse(-2, 5, 25, 16, -0.1, 0, Math.PI * 2);
  ctx.fillStyle = bodyColor;
  ctx.fill();
  ctx.stroke();

  // Neck
  ctx.beginPath();
  ctx.moveTo(8, 7);
  ctx.quadraticCurveTo(10, -5, 13, -17);
  ctx.lineTo(23, -17);
  ctx.quadraticCurveTo(17, -3, 20, 7);
  ctx.closePath();
  ctx.fillStyle = bodyColor;
  ctx.fill();
  ctx.stroke();

  // Animated wing
  ctx.save();
  ctx.translate(-6, 2);
  ctx.rotate(wingFlap);

  ctx.beginPath();
  ctx.moveTo(-19, 0);
  ctx.quadraticCurveTo(-10, -23, 13, -12);
  ctx.quadraticCurveTo(21, -3, 9, 6);
  ctx.quadraticCurveTo(-6, 12, -19, 0);
  ctx.fillStyle = wingColor;
  ctx.fill();
  ctx.stroke();

  ctx.strokeStyle = "#b18a31";
  ctx.lineWidth = 1.4;

  for (let i = 0; i < 3; i++) {
    ctx.beginPath();
    ctx.moveTo(-10 + i * 7, -1);
    ctx.quadraticCurveTo(-2 + i * 5, -8, 8 + i * 2, -5);
    ctx.stroke();
  }

  ctx.restore();

  // Head
  ctx.beginPath();
  ctx.arc(19, -21, 11, 0, Math.PI * 2);
  ctx.fillStyle = bodyColor;
  ctx.fill();
  ctx.strokeStyle = outline;
  ctx.lineWidth = 2.2;
  ctx.stroke();

  // Beak
  ctx.beginPath();
  ctx.moveTo(27, -20);
  ctx.lineTo(40, -16);
  ctx.lineTo(27, -12);
  ctx.closePath();
  ctx.fillStyle = "#f47b24";
  ctx.fill();
  ctx.stroke();

  // Eye
  ctx.beginPath();
  ctx.arc(22, -23, 4.3, 0, Math.PI * 2);
  ctx.fillStyle = "#fff";
  ctx.fill();

  ctx.beginPath();
  ctx.arc(24, -23, 2.1, 0, Math.PI * 2);
  ctx.fillStyle = "#202027";
  ctx.fill();

  // Feet
  ctx.strokeStyle = "#e87524";
  ctx.lineWidth = 2.5;

  for (let i = 0; i < 2; i++) {
    const fx = i * 11 - 5;

    ctx.beginPath();
    ctx.moveTo(fx, 17);
    ctx.lineTo(fx + 1, 23);
    ctx.lineTo(fx + 8, 25);
    ctx.stroke();
  }

  ctx.restore();

  if (duck.isGolden) {
    ctx.fillStyle = "#fff16b";
    ctx.font = "bold 17px Arial";
    ctx.textAlign = "center";
    ctx.fillText("✦", duck.x, duck.y - 36);
  }
}

// ---------- PARTICLES ----------

function createHitEffect(x, y, golden) {
  const color = golden ? "#ffdf45" : "#ffffff";

  for (let i = 0; i < 15; i++) {
    const angle = Math.random() * Math.PI * 2;
    const speed = 50 + Math.random() * 170;

    particles.push({
      x,
      y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      life: 0.35 + Math.random() * 0.4,
      maxLife: 0.75,
      size: 2 + Math.random() * 5,
      color
    });
  }
}

function addFloatingText(x, y, text, color = "#fff", big = false) {
  floatingTexts.push({
    x, y, text, color,
    life: 0.9,
    maxLife: 0.9,
    big
  });
}

function updateEffects(dt) {
  for (const p of particles) {
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.vy += 150 * dt;
    p.life -= dt;
  }

  particles = particles.filter(p => p.life > 0);

  for (const t of floatingTexts) {
    t.y -= 35 * dt;
    t.life -= dt;
  }

  floatingTexts = floatingTexts.filter(t => t.life > 0);
}

function drawEffects() {
  for (const p of particles) {
    ctx.globalAlpha = Math.max(0, p.life / p.maxLife);
    ctx.fillStyle = p.color;
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.globalAlpha = 1;
  ctx.textAlign = "center";

  for (const t of floatingTexts) {
    ctx.globalAlpha = Math.max(0, t.life / t.maxLife);
    ctx.fillStyle = t.color;
    ctx.font = `900 ${t.big ? 34 : 19}px Arial`;
    ctx.shadowColor = "#10243a";
    ctx.shadowBlur = 5;
    ctx.fillText(t.text, t.x, t.y);
    ctx.shadowBlur = 0;
  }

  ctx.globalAlpha = 1;
}

// ---------- SHOOTING ----------

function getCanvasPoint(event) {
  const rect = canvas.getBoundingClientRect();

  return {
    x: event.clientX - rect.left,
    y: event.clientY - rect.top
  };
}

function shoot(event) {
  if (!running || paused || reloading) return;

  const point = getCanvasPoint(event);
  pointer = point;

  if (ammo <= 0) {
    playSound(130, 0.08, "square", 0.02);
    addFloatingText(point.x, point.y - 10, "RELOAD!", "#ff6565");
    return;
  }

  ammo--;
  shotFlash = 0.09;
  shake = 2.5;
  playSound(105, 0.06, "square", 0.05);

  for (let i = ducks.length - 1; i >= 0; i--) {
    const duck = ducks[i];
    if (!duck.alive) continue;

    const dx = point.x - duck.x;
    const dy = point.y - duck.y;
    const hitRadius = 31 * duck.scale;

    if (dx * dx + dy * dy <= hitRadius * hitRadius) {
      duck.alive = false;

      const points = duck.isGolden ? 30 : 10;
      score += points;

      createHitEffect(duck.x, duck.y, duck.isGolden);
      addFloatingText(
        duck.x,
        duck.y - 28,
        duck.isGolden ? "+30 GOLD!" : `+${points}`,
        duck.isGolden ? "#fff16b" : "#fff"
      );

      playSound(
        duck.isGolden ? 1000 : 750,
        0.13,
        "triangle",
        0.05
      );

      if (score > best) {
        best = score;
        localStorage.setItem("duckBlasterBest", String(best));
      }

      updateLevel();
      break;
    }
  }

  updateHUD();
}

canvas.addEventListener("pointerdown", shoot);

canvas.addEventListener("pointermove", event => {
  pointer = getCanvasPoint(event);
});

// ---------- RELOAD: BUTTON AND R KEY ----------

function reload() {
  if (!running || paused || reloading || ammo === MAX_AMMO) {
    return;
  }

  reloading = true;
  reloadBtn.textContent = "↻ Loading...";
  ammoEl.textContent = "RELOADING...";

  playSound(350, 0.1, "triangle", 0.025);

  if (reloadTimeout !== null) {
    clearTimeout(reloadTimeout);
  }

  reloadTimeout = setTimeout(() => {
    ammo = MAX_AMMO;
    reloading = false;
    reloadTimeout = null;

    reloadBtn.textContent = "↻ Reload (R)";
    updateHUD();

    playSound(550, 0.1, "triangle", 0.03);
  }, 800);
}

reloadBtn.addEventListener("click", reload);

document.addEventListener("keydown", event => {
  if (event.key.toLowerCase() === "r" && !event.repeat) {
    event.preventDefault();
    reload();
  }

  if (
    event.code === "Space" &&
    running &&
    !event.repeat
  ) {
    event.preventDefault();
    togglePause();
  }
});

// ---------- PAUSE ----------

function togglePause() {
  if (!running) return;

  paused = !paused;
  pauseBtn.textContent = paused ? "▶ Resume" : "⏸ Pause";

  if (paused) {
    if (animationId !== null) {
      cancelAnimationFrame(animationId);
      animationId = null;
    }
    drawScene(0);
  } else {
    lastFrame = performance.now();
    animationId = requestAnimationFrame(gameLoop);
  }
}

pauseBtn.addEventListener("click", togglePause);

// ---------- HUD ----------

function updateHUD() {
  scoreEl.textContent = score;
  bestEl.textContent = best;
  levelEl.textContent = `${level} / ${MAX_LEVEL}`;
  timeEl.textContent = Math.ceil(timeLeft);

  livesEl.textContent =
    "❤️".repeat(lives) + "🖤".repeat(MAX_LIVES - lives);

  ammoEl.textContent = reloading
    ? "RELOADING..."
    : `AMMO: ${ammo} / ${MAX_AMMO}`;
}

// ---------- START / END ----------

function startGame() {
  if (animationId !== null) {
    cancelAnimationFrame(animationId);
    animationId = null;
  }

  if (reloadTimeout !== null) {
    clearTimeout(reloadTimeout);
    reloadTimeout = null;
  }

  score = 0;
  level = 1;
  lives = MAX_LIVES;
  ammo = MAX_AMMO;
  timeLeft = GAME_DURATION;

  ducks = [];
  particles = [];
  floatingTexts = [];

  spawnTimer = 0;
  running = true;
  paused = false;
  reloading = false;
  shake = 0;
  shotFlash = 0;

  pauseBtn.textContent = "⏸ Pause";
  reloadBtn.textContent = "↻ Reload (R)";

  overlay.classList.add("hidden");

  updateLevel();
  updateHUD();

  lastFrame = performance.now();
  animationId = requestAnimationFrame(gameLoop);
}

function endGame(won = false) {
  running = false;
  paused = false;

  if (animationId !== null) {
    cancelAnimationFrame(animationId);
    animationId = null;
  }

  if (reloadTimeout !== null) {
    clearTimeout(reloadTimeout);
    reloadTimeout = null;
  }

  reloading = false;
  reloadBtn.textContent = "↻ Reload (R)";
  pauseBtn.textContent = "⏸ Pause";

  if (won) {
    overlayTitle.textContent = "🏆 YOU WIN!";
    overlayText.textContent =
      `Amazing! You completed all 10 levels with ${score} points.`;
  } else if (lives <= 0) {
    overlayTitle.textContent = "GAME OVER";
    overlayText.textContent =
      `Final score: ${score}. Try again and beat your best!`;
  } else {
    overlayTitle.textContent = "TIME'S UP!";
    overlayText.textContent =
      `You scored ${score} points and reached level ${level}.`;
  }

  startBtn.textContent = "PLAY AGAIN";
  overlay.classList.remove("hidden");

  updateHUD();
  drawScene(0);
}

startBtn.addEventListener("click", startGame);

// ---------- GAME UPDATE ----------

function updateGame(dt) {
  timeLeft -= dt;

  if (timeLeft <= 0) {
    timeLeft = 0;
    updateHUD();
    endGame(level === MAX_LEVEL);
    return;
  }

  spawnTimer += dt * 1000;

  const activeDucks = ducks.filter(duck => duck.alive).length;

  if (
    spawnTimer >= getSpawnInterval() &&
    activeDucks < getDuckLimit()
  ) {
    spawnDuck();
    spawnTimer = 0;
  }

  for (const duck of ducks) {
    if (!duck.alive) continue;

    duck.x += duck.direction * duck.speed * dt;
    duck.phase += dt * (1.7 + level * 0.12);
    duck.flap += dt * (8 + level * 0.7);

    duck.y += Math.sin(duck.phase) * duck.verticalSpeed * dt;
    duck.y = Math.max(50, Math.min(height * 0.76, duck.y));

    if (
      (duck.direction === 1 && duck.x > width + 55) ||
      (duck.direction === -1 && duck.x < -55)
    ) {
      duck.alive = false;
      lives--;

      addFloatingText(
        Math.min(width - 50, Math.max(50, duck.x)),
        duck.y,
        "MISSED!",
        "#ff5656"
      );

      playSound(170, 0.15, "sawtooth", 0.025);

      if (lives <= 0) {
        lives = 0;
        updateHUD();
        endGame(false);
        return;
      }
    }
  }

  ducks = ducks.filter(duck => duck.alive);

  updateEffects(dt);

  if (shotFlash > 0) shotFlash = Math.max(0, shotFlash - dt);
  if (shake > 0) shake = Math.max(0, shake - dt * 12);

  updateHUD();
}

// ---------- RENDER ----------

function drawScene(dt) {
  ctx.save();

  if (shake > 0) {
    ctx.translate(
      (Math.random() - 0.5) * shake,
      (Math.random() - 0.5) * shake
    );
  }

  drawBackground(dt);

  for (const duck of ducks) {
    if (duck.alive) drawDuck(duck);
  }

  drawEffects();

  if (running && !paused) {
    ctx.strokeStyle = "rgba(255,255,255,0.95)";
    ctx.lineWidth = 1.5;

    ctx.beginPath();
    ctx.arc(pointer.x, pointer.y, 10, 0, Math.PI * 2);

    ctx.moveTo(pointer.x - 16, pointer.y);
    ctx.lineTo(pointer.x - 5, pointer.y);

    ctx.moveTo(pointer.x + 5, pointer.y);
    ctx.lineTo(pointer.x + 16, pointer.y);

    ctx.moveTo(pointer.x, pointer.y - 16);
    ctx.lineTo(pointer.x, pointer.y - 5);

    ctx.moveTo(pointer.x, pointer.y + 5);
    ctx.lineTo(pointer.x, pointer.y + 16);

    ctx.stroke();
  }

  if (shotFlash > 0) {
    ctx.fillStyle =
      `rgba(255,245,170,${Math.min(0.45, shotFlash * 5)})`;
    ctx.fillRect(0, 0, width, height);
  }

  ctx.restore();
}

function gameLoop(timestamp) {
  if (!running || paused) return;

  const dt = Math.min((timestamp - lastFrame) / 1000, 0.04);
  lastFrame = timestamp;

  updateGame(dt);

  if (!running) return;

  drawScene(dt);
  animationId = requestAnimationFrame(gameLoop);
}

// ---------- INITIALIZE ----------

bestEl.textContent = best;

resizeCanvas();
updateLevel();
updateHUD();
drawScene(0);
