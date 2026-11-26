import { useEffect, useRef, useState } from "react";
import { audio } from "./audio";
import { LEVELS, levelForScore, type LevelConfig, type PatternKey } from "./levels";

/*
  NEON DODGE ARENA
  Créé par Hylst - Geoffroy avec l'aide d'une IA.
  - Esquive arcade sur canvas, mode démo automatique (attract-mode)
  - Patterns de projectiles procéduraux, jauge de ralenti, combos de frôlement
  - Plusieurs niveaux à difficulté progressive, musique & effets sonores
*/

type BulletType = PatternKey;

type Bullet = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  r: number;
  color: string;
  type: BulletType;
  nearMissed: boolean;
  pulse: number;
};

type Particle = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  color: string;
  size: number;
  glow: boolean;
};

type Star = { x: number; y: number; z: number; size: number };
type Ripple = { x: number; y: number; r: number; max: number; color: string };

type Mode = "attract" | "playing" | "levelup" | "gameover";

const PLAYER_RADIUS = 9;
const BULLET_RADIUS = 5;
const NEAR_MISS_EXTRA = 24;
const METER_MAX = 100;
const SLOW_DRAIN = 32;
const SLOW_RECHARGE = 16;
const TIME_SCALE_SLOW = 0.22;
const PLAYER_SPEED = 330;
const MAX_BULLETS = 800;

export default function App() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  const [ui, setUi] = useState({
    score: 0,
    highScore: 0,
    combo: 0,
    multiplier: 1,
    meter: METER_MAX,
    mode: "attract" as Mode,
    level: 1,
    levelName: LEVELS[0].name,
    levelSub: LEVELS[0].subtitle,
    levelGoal: LEVELS[0].goal,
    levelStart: 0,
    accent: LEVELS[0].accent,
  });

  const [musicOn, setMusicOn] = useState(true);
  const [sfxOn, setSfxOn] = useState(true);
  const [isFullscreen, setIsFullscreen] = useState(false);

  const gameRef = useRef({
    width: 0,
    height: 0,
    mode: "attract" as Mode,
    score: 0,
    combo: 0,
    multiplier: 1,
    meter: METER_MAX,
    slowRequest: false,
    slowActive: false,
    streakTimer: 0,
    flash: 0,
    flashColor: "255,255,255",
    shake: 0,
    elapsed: 0,
    highScore: 0,
    level: LEVELS[0],
    levelTransition: 0,
    bgTop: LEVELS[0].bg[0],
    bgBot: LEVELS[0].bg[1],
    bgTopTarget: LEVELS[0].bg[0],
    bgBotTarget: LEVELS[0].bg[1],
    player: { x: 0, y: 0, r: PLAYER_RADIUS, trail: [] as { x: number; y: number; a: number }[], angle: 0 },
    bullets: [] as Bullet[],
    particles: [] as Particle[],
    stars: [] as Star[],
    ripples: [] as Ripple[],
    spawner: {
      ring: 0, spiral: 0, wall: 0, homing: 0, edge: 0, star: 0,
      rot: 0, starRot: 0, difficulty: 1,
    },
    keys: new Set<string>(),
    mouse: { x: 0, y: 0, active: false },
    lastTime: 0,
    gameOverTimer: 0,
    attractRestartTimer: 0,
    pulse: 0,
  }).current;

  const clamp = (v: number, min: number, max: number) => Math.max(min, Math.min(max, v));
  const rand = (min: number, max: number) => Math.random() * (max - min) + min;
  const randInt = (min: number, max: number) => Math.floor(rand(min, max + 1));
  const dist = (x1: number, y1: number, x2: number, y2: number) => Math.hypot(x2 - x1, y2 - y1);

  const hexToRgb = (hex: string) => {
    const h = hex.replace("#", "");
    const n = parseInt(h, 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255] as [number, number, number];
  };
  const mix = (a: string, b: string, t: number) => {
    const [r1, g1, b1] = hexToRgb(a);
    const [r2, g2, b2] = hexToRgb(b);
    const r = Math.round(r1 + (r2 - r1) * t);
    const g = Math.round(g1 + (g2 - g1) * t);
    const bb = Math.round(b1 + (b2 - b1) * t);
    return `rgb(${r},${g},${bb})`;
  };

  const addParticle = (x: number, y: number, color: string, count: number, speed: number, glow = false) => {
    for (let i = 0; i < count; i++) {
      const a = Math.random() * Math.PI * 2;
      const s = rand(speed * 0.25, speed);
      gameRef.particles.push({
        x, y,
        vx: Math.cos(a) * s,
        vy: Math.sin(a) * s,
        life: rand(0.3, 0.9),
        maxLife: 0.9,
        color, size: rand(1.2, 3.2), glow,
      });
    }
  };

  const initStars = () => {
    gameRef.stars = [];
    const n = Math.floor((gameRef.width * gameRef.height) / 9000);
    for (let i = 0; i < n; i++) {
      gameRef.stars.push({
        x: Math.random() * gameRef.width,
        y: Math.random() * gameRef.height,
        z: rand(0.2, 1),
        size: rand(0.5, 1.8),
      });
    }
  };

  const triggerNearMiss = (bullet: Bullet) => {
    gameRef.combo += 1;
    gameRef.multiplier = 1 + Math.floor(gameRef.combo / 3) * 0.5;
    gameRef.streakTimer = 1.5 + Math.min(gameRef.combo * 0.08, 1.4);
    const gain = Math.floor(50 * gameRef.multiplier);
    gameRef.score += gain;
    gameRef.flash = Math.max(gameRef.flash, 0.06);
    gameRef.flashColor = "232,121,249";
    gameRef.shake = Math.min(4, gameRef.shake + 2);
    addParticle(bullet.x, bullet.y, bullet.color, 5, 90, true);
    audio.graze(gameRef.combo);
  };

  const applyLevel = (lvl: LevelConfig, animate: boolean) => {
    gameRef.level = lvl;
    gameRef.bgTopTarget = lvl.bg[0];
    gameRef.bgBotTarget = lvl.bg[1];
    if (!animate) {
      gameRef.bgTop = lvl.bg[0];
      gameRef.bgBot = lvl.bg[1];
    }
    audio.setMusicLevel(lvl.index);
    setUi((u) => ({
      ...u,
      level: lvl.index,
      levelName: lvl.name,
      levelSub: lvl.subtitle,
      levelGoal: lvl.goal,
      accent: lvl.accent,
    }));
  };

  const resetRun = (mode: Mode) => {
    gameRef.mode = mode;
    gameRef.score = 0;
    gameRef.combo = 0;
    gameRef.multiplier = 1;
    gameRef.meter = METER_MAX;
    gameRef.streakTimer = 0;
    gameRef.flash = 0;
    gameRef.shake = 0;
    gameRef.elapsed = 0;
    gameRef.bullets = [];
    gameRef.particles = [];
    gameRef.ripples = [];
    gameRef.levelTransition = 0;
    gameRef.spawner = {
      ring: 1.5, spiral: 0.6, wall: 2.2, homing: 1.1, edge: 0.5, star: 2.6,
      rot: 0, starRot: 0, difficulty: 1,
    };
    gameRef.player.x = gameRef.width / 2;
    gameRef.player.y = gameRef.height / 2;
    gameRef.player.trail = [];
    gameRef.gameOverTimer = 0;
    gameRef.attractRestartTimer = 0;
    applyLevel(LEVELS[0], mode === "playing");
  };

  const startPlaying = () => {
    if (gameRef.mode === "playing" || gameRef.mode === "levelup") return;
    resetRun("playing");
    audio.start();
    audio.startMusic();
    setUi((u) => ({ ...u, mode: "playing" }));
  };

  const checkLevelUp = () => {
    const newLvl = levelForScore(gameRef.score);
    if (newLvl.index > gameRef.level.index) {
      applyLevel(newLvl, true);
      gameRef.levelTransition = 2.2;
      gameRef.flash = 0.4;
      gameRef.flashColor = hexToRgb(newLvl.accent).join(",");
      gameRef.shake = 8;
      gameRef.bullets = []; // souffle de nettoyage à chaque niveau
      addParticle(gameRef.player.x, gameRef.player.y, newLvl.accent, 50, 260, true);
      gameRef.ripples.push({ x: gameRef.player.x, y: gameRef.player.y, r: 0, max: Math.max(gameRef.width, gameRef.height), color: newLvl.accent });
      audio.levelUp();
      setUi((u) => ({ ...u, mode: "levelup" }));
      gameRef.mode = "levelup";
      setTimeout(() => {
        if (gameRef.mode === "levelup") {
          gameRef.mode = "playing";
          setUi((u) => ({ ...u, mode: "playing" }));
        }
      }, 1600);
    }
  };

  const handleGameOver = () => {
    gameRef.mode = "gameover";
    gameRef.gameOverTimer = 0;
    gameRef.flash = 0.6;
    gameRef.flashColor = "255,80,80";
    gameRef.shake = 14;
    addParticle(gameRef.player.x, gameRef.player.y, gameRef.level.accent, 60, 300, true);
    gameRef.ripples.push({ x: gameRef.player.x, y: gameRef.player.y, r: 0, max: 400, color: "#ff5050" });
    audio.hit();
    audio.gameOver();
    if (gameRef.score > gameRef.highScore) {
      gameRef.highScore = gameRef.score;
      try { localStorage.setItem("neonDodgeHighScore", String(gameRef.highScore)); } catch {}
    }
    setUi((u) => ({ ...u, mode: "gameover", highScore: gameRef.highScore }));
  };

  const addBullet = (b: Bullet) => {
    if (gameRef.bullets.length >= MAX_BULLETS) gameRef.bullets.shift();
    gameRef.bullets.push(b);
  };

  const mkBullet = (x: number, y: number, vx: number, vy: number, color: string, type: BulletType, r = BULLET_RADIUS): Bullet =>
    ({ x, y, vx, vy, r, color, type, nearMissed: false, pulse: Math.random() * Math.PI * 2 });

  const spawnRing = (cx: number, cy: number, count: number, speed: number) => {
    for (let i = 0; i < count; i++) {
      const a = (Math.PI * 2 * i) / count;
      addBullet(mkBullet(cx, cy, Math.cos(a) * speed, Math.sin(a) * speed, "#f472b6", "ring"));
    }
    gameRef.ripples.push({ x: cx, y: cy, r: 0, max: 60, color: "#f472b6" });
  };

  const spawnSpiral = (cx: number, cy: number, arms: number, rot: number, speed: number) => {
    for (let i = 0; i < arms; i++) {
      const a = rot + (Math.PI * 2 * i) / arms;
      addBullet(mkBullet(cx, cy, Math.cos(a) * speed, Math.sin(a) * speed, "#facc15", "spiral"));
    }
  };

  const spawnWall = (dir: "up" | "down" | "left" | "right", speed: number) => {
    const gapEvery = randInt(3, 5);
    const gapIndex = randInt(0, gapEvery - 1);
    let idx = 0;
    const step = 44;
    const place = (x: number, y: number, vx: number, vy: number) => {
      if (idx % gapEvery !== gapIndex) addBullet(mkBullet(x, y, vx, vy, "#a78bfa", "wall"));
      idx++;
    };
    if (dir === "down") for (let x = 20; x < gameRef.width - 20; x += step) place(x, -12, 0, speed);
    else if (dir === "up") for (let x = 20; x < gameRef.width - 20; x += step) place(x, gameRef.height + 12, 0, -speed);
    else if (dir === "right") for (let y = 20; y < gameRef.height - 20; y += step) place(-12, y, speed, 0);
    else for (let y = 20; y < gameRef.height - 20; y += step) place(gameRef.width + 12, y, -speed, 0);
  };

  const spawnHoming = (count: number, speed: number) => {
    const p = gameRef.player;
    for (let i = 0; i < count; i++) {
      let x = 0, y = 0;
      const edge = randInt(0, 3);
      if (edge === 0) { x = rand(0, gameRef.width); y = -20; }
      else if (edge === 1) { x = rand(0, gameRef.width); y = gameRef.height + 20; }
      else if (edge === 2) { x = -20; y = rand(0, gameRef.height); }
      else { x = gameRef.width + 20; y = rand(0, gameRef.height); }
      const a = Math.atan2(p.y - y, p.x - x) + rand(-0.25, 0.25);
      addBullet(mkBullet(x, y, Math.cos(a) * speed, Math.sin(a) * speed, "#fb7185", "homing", BULLET_RADIUS + 1));
    }
  };

  const spawnEdgeSpray = (count: number, speed: number) => {
    const cx = gameRef.width / 2, cy = gameRef.height / 2;
    for (let i = 0; i < count; i++) {
      const edge = randInt(0, 3);
      let x = 0, y = 0;
      if (edge === 0) { x = rand(0, gameRef.width); y = -16; }
      else if (edge === 1) { x = rand(0, gameRef.width); y = gameRef.height + 16; }
      else if (edge === 2) { x = -16; y = rand(0, gameRef.height); }
      else { x = gameRef.width + 16; y = rand(0, gameRef.height); }
      const a = Math.atan2(cy - y, cx - x) + rand(-0.6, 0.6);
      addBullet(mkBullet(x, y, Math.cos(a) * speed, Math.sin(a) * speed, "#22d3ee", "edge"));
    }
  };

  const spawnStar = (cx: number, cy: number, points: number, rot: number, speed: number) => {
    for (let i = 0; i < points * 2; i++) {
      const a = rot + (Math.PI * i) / points;
      addBullet(mkBullet(cx, cy, Math.cos(a) * speed, Math.sin(a) * speed, "#e879f9", "star"));
    }
  };

  const movePlayer = (dt: number) => {
    const p = gameRef.player;
    const keys = gameRef.keys;
    let dx = 0, dy = 0;
    if (keys.has("ArrowUp") || keys.has("w") || keys.has("W") || keys.has("z") || keys.has("Z")) dy -= 1;
    if (keys.has("ArrowDown") || keys.has("s") || keys.has("S")) dy += 1;
    if (keys.has("ArrowLeft") || keys.has("a") || keys.has("A") || keys.has("q") || keys.has("Q")) dx -= 1;
    if (keys.has("ArrowRight") || keys.has("d") || keys.has("D")) dx += 1;

    if (gameRef.mouse.active && dx === 0 && dy === 0) {
      const tx = gameRef.mouse.x - p.x;
      const ty = gameRef.mouse.y - p.y;
      const d = Math.hypot(tx, ty);
      if (d > 2) {
        const move = Math.min(d, PLAYER_SPEED * dt);
        p.x += (tx / d) * move;
        p.y += (ty / d) * move;
        p.angle = Math.atan2(ty, tx);
      }
    } else if (dx !== 0 || dy !== 0) {
      const len = Math.hypot(dx, dy);
      dx /= len; dy /= len;
      p.x += dx * PLAYER_SPEED * dt;
      p.y += dy * PLAYER_SPEED * dt;
      p.angle = Math.atan2(dy, dx);
    }

    p.x = clamp(p.x, p.r, gameRef.width - p.r);
    p.y = clamp(p.y, p.r, gameRef.height - p.r);
  };

  const attractAI = (dt: number) => {
    const p = gameRef.player;
    let vx = 0, vy = 0;
    let nearest: Bullet | null = null;
    let nearestDist = Infinity;

    for (const b of gameRef.bullets) {
      const d = dist(p.x, p.y, b.x, b.y);
      if (d < nearestDist) { nearestDist = d; nearest = b; }
      if (d < 230 && d > 0) {
        const weight = 230 / (d + 1);
        vx += ((p.x - b.x) / d) * weight;
        vy += ((p.y - b.y) / d) * weight;
      }
    }
    if (nearest && nearestDist < 170) {
      const b = nearest;
      const dot = (p.x - b.x) * b.vx + (p.y - b.y) * b.vy;
      if (dot > 0) {
        const perpX = -b.vy, perpY = b.vx;
        const pl = Math.hypot(perpX, perpY) || 1;
        const side = (p.x - b.x) * perpX + (p.y - b.y) * perpY > 0 ? 1 : -1;
        vx += (perpX / pl) * side * 4;
        vy += (perpY / pl) * side * 4;
      }
    }
    const margin = 80;
    if (p.x < margin) vx += 2.5;
    if (p.x > gameRef.width - margin) vx -= 2.5;
    if (p.y < margin) vy += 2.5;
    if (p.y > gameRef.height - margin) vy -= 2.5;
    vx += Math.sin(gameRef.elapsed * 1.5) * 0.6;
    vy += Math.cos(gameRef.elapsed * 1.1) * 0.6;

    const len = Math.hypot(vx, vy) || 1;
    const speed = PLAYER_SPEED * 0.95;
    p.x += (vx / len) * speed * dt;
    p.y += (vy / len) * speed * dt;
    p.angle = Math.atan2(vy, vx);
    p.x = clamp(p.x, p.r, gameRef.width - p.r);
    p.y = clamp(p.y, p.r, gameRef.height - p.r);
  };

  const has = (k: PatternKey) => gameRef.level.patterns.includes(k);

  const updateSpawners = (dt: number) => {
    const s = gameRef.spawner;
    const L = gameRef.level;
    gameRef.elapsed += dt;
    const diff = (1 + gameRef.elapsed / 28) ;
    s.difficulty = diff * L.speedMult;
    const rate = L.rateMult;
    const dens = L.density;
    const spd = L.speedMult;

    if (has("ring")) {
      s.ring -= dt;
      if (s.ring <= 0) {
        const cx = gameRef.width / 2 + Math.sin(gameRef.elapsed) * 90;
        const cy = gameRef.height / 2 + Math.cos(gameRef.elapsed * 0.8) * 70;
        spawnRing(cx, cy, Math.floor((12 + diff) * dens), (100 + diff * 12) * spd);
        s.ring = Math.max(1.0, (3.2 - diff * 0.1) * rate);
      }
    }
    if (has("spiral")) {
      s.spiral -= dt;
      if (s.spiral <= 0) {
        spawnSpiral(gameRef.width / 2, gameRef.height / 2, 3, s.rot, (90 + diff * 10) * spd);
        s.rot += 0.5;
        s.spiral = Math.max(0.22, (0.55 - diff * 0.01) * rate);
      }
    }
    if (has("wall")) {
      s.wall -= dt;
      if (s.wall <= 0) {
        const dirs: Array<"up" | "down" | "left" | "right"> = ["down", "up", "left", "right"];
        spawnWall(dirs[randInt(0, 3)], (95 + diff * 12) * spd);
        s.wall = Math.max(1.8, (5.2 - diff * 0.14) * rate);
      }
    }
    if (has("homing")) {
      s.homing -= dt;
      if (s.homing <= 0) {
        spawnHoming(Math.max(1, Math.floor((1 + diff / 2.4) * dens)), (80 + diff * 11) * spd);
        s.homing = Math.max(0.6, (2.2 - diff * 0.08) * rate);
      }
    }
    if (has("edge")) {
      s.edge -= dt;
      if (s.edge <= 0) {
        spawnEdgeSpray(Math.floor((2 + diff * 0.7) * dens), (110 + diff * 13) * spd);
        s.edge = Math.max(0.35, (1.2 - diff * 0.03) * rate);
      }
    }
    if (has("star")) {
      s.star -= dt;
      if (s.star <= 0) {
        spawnStar(gameRef.width / 2, gameRef.height / 2, 5, s.starRot, (125 + diff * 14) * spd);
        s.starRot += Math.PI / 5;
        s.star = Math.max(1.2, (6 - diff * 0.13) * rate);
      }
    }
  };

  const updateBullets = (dt: number) => {
    const p = gameRef.player;
    for (let i = gameRef.bullets.length - 1; i >= 0; i--) {
      const b = gameRef.bullets[i];
      if (b.type === "homing") {
        const targetAngle = Math.atan2(p.y - b.y, p.x - b.x);
        const curSpeed = Math.hypot(b.vx, b.vy);
        const tx = Math.cos(targetAngle) * curSpeed;
        const ty = Math.sin(targetAngle) * curSpeed;
        const turn = Math.min(1, 3.0 * dt);
        b.vx += (tx - b.vx) * turn;
        b.vy += (ty - b.vy) * turn;
      }
      b.x += b.vx * dt;
      b.y += b.vy * dt;

      const d = dist(p.x, p.y, b.x, b.y);
      const hitDist = p.r + b.r;
      const nearDist = hitDist + NEAR_MISS_EXTRA;

      if (d < hitDist) {
        if (gameRef.mode === "playing") { handleGameOver(); }
        else if (gameRef.mode === "attract") {
          gameRef.flash = 0.3;
          gameRef.flashColor = "120,200,255";
          gameRef.attractRestartTimer = 0.7;
          addParticle(p.x, p.y, gameRef.level.accent, 24, 160, true);
          gameRef.bullets.splice(i, 1);
          continue;
        }
      }
      if (!b.nearMissed && d < nearDist) {
        b.nearMissed = true;
        if (gameRef.mode === "playing") triggerNearMiss(b);
      }
      if (b.x < -60 || b.x > gameRef.width + 60 || b.y < -60 || b.y > gameRef.height + 60) {
        gameRef.bullets.splice(i, 1);
      }
    }
  };

  const updateParticles = (dt: number) => {
    for (let i = gameRef.particles.length - 1; i >= 0; i--) {
      const pt = gameRef.particles[i];
      pt.x += pt.vx * dt;
      pt.y += pt.vy * dt;
      pt.vx *= 0.96;
      pt.vy *= 0.96;
      pt.life -= dt;
      if (pt.life <= 0) gameRef.particles.splice(i, 1);
    }
    for (let i = gameRef.ripples.length - 1; i >= 0; i--) {
      const rp = gameRef.ripples[i];
      rp.r += dt * 600;
      if (rp.r >= rp.max) gameRef.ripples.splice(i, 1);
    }
  };

  const updateSlowMotion = (dt: number) => {
    const wasActive = gameRef.slowActive;
    if (gameRef.mode === "playing" && gameRef.slowRequest && gameRef.meter > 0) {
      gameRef.slowActive = true;
      gameRef.meter = Math.max(0, gameRef.meter - SLOW_DRAIN * dt);
    } else {
      gameRef.slowActive = false;
      if (gameRef.meter < METER_MAX) gameRef.meter = Math.min(METER_MAX, gameRef.meter + SLOW_RECHARGE * dt);
    }
    if (gameRef.slowActive && !wasActive) audio.slowOn();
    if (!gameRef.slowActive && wasActive && gameRef.mode === "playing") audio.slowOff();
  };

  const draw = (ctx: CanvasRenderingContext2D) => {
    const { width, height, player, bullets, particles, stars, ripples, flash, shake, slowActive } = gameRef;
    gameRef.pulse += 0.05;

    ctx.save();
    if (shake > 0) ctx.translate(rand(-shake, shake), rand(-shake, shake));

    // Fond dégradé animé
    const grad = ctx.createLinearGradient(0, 0, 0, height);
    grad.addColorStop(0, gameRef.bgTop);
    grad.addColorStop(1, gameRef.bgBot);
    ctx.fillStyle = grad;
    ctx.fillRect(-30, -30, width + 60, height + 60);

    // Champ d'étoiles parallax
    for (const st of stars) {
      st.y += st.z * 14 * 0.016;
      if (st.y > height) { st.y = 0; st.x = Math.random() * width; }
      ctx.globalAlpha = 0.25 + st.z * 0.5;
      ctx.fillStyle = "#bde7ff";
      ctx.fillRect(st.x, st.y, st.size, st.size);
    }
    ctx.globalAlpha = 1;

    // Grille néon avec perspective douce
    const gridSize = 64;
    const offset = (gameRef.elapsed * 22) % gridSize;
    const accentRgb = hexToRgb(gameRef.level.accent);
    ctx.strokeStyle = `rgba(${accentRgb.join(",")}, 0.07)`;
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let x = offset; x < width; x += gridSize) { ctx.moveTo(x, 0); ctx.lineTo(x, height); }
    for (let y = offset; y < height; y += gridSize) { ctx.moveTo(0, y); ctx.lineTo(width, y); }
    ctx.stroke();

    // Ondes de choc
    for (const rp of ripples) {
      const a = 1 - rp.r / rp.max;
      ctx.globalAlpha = a * 0.5;
      ctx.strokeStyle = rp.color;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(rp.x, rp.y, rp.r, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;

    ctx.globalCompositeOperation = "lighter";

    // Traînée du joueur
    for (let i = 0; i < player.trail.length; i++) {
      const t = player.trail[i];
      ctx.globalAlpha = t.a * 0.6;
      ctx.fillStyle = slowActive ? "#facc15" : gameRef.level.accent;
      ctx.beginPath();
      ctx.arc(t.x, t.y, player.r * (0.4 + t.a * 0.5), 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;

    // Projectiles avec halo
    for (const b of bullets) {
      const pulse = 1 + Math.sin(gameRef.pulse + b.pulse) * 0.12;
      ctx.shadowBlur = 14;
      ctx.shadowColor = b.color;
      // halo externe
      ctx.globalAlpha = 0.25;
      ctx.fillStyle = b.color;
      ctx.beginPath();
      ctx.arc(b.x, b.y, b.r * 2.1 * pulse, 0, Math.PI * 2);
      ctx.fill();
      // coeur
      ctx.globalAlpha = 1;
      ctx.fillStyle = b.color;
      ctx.beginPath();
      ctx.arc(b.x, b.y, b.r * pulse, 0, Math.PI * 2);
      ctx.fill();
      // centre blanc
      ctx.fillStyle = "rgba(255,255,255,0.85)";
      ctx.beginPath();
      ctx.arc(b.x, b.y, b.r * 0.4, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.shadowBlur = 0;
    ctx.globalAlpha = 1;

    // Particules
    for (const pt of particles) {
      const a = Math.max(0, pt.life / pt.maxLife);
      ctx.globalAlpha = a;
      if (pt.glow) { ctx.shadowBlur = 8; ctx.shadowColor = pt.color; }
      ctx.fillStyle = pt.color;
      ctx.beginPath();
      ctx.arc(pt.x, pt.y, pt.size * a, 0, Math.PI * 2);
      ctx.fill();
      ctx.shadowBlur = 0;
    }
    ctx.globalAlpha = 1;

    // Orbe du joueur (sauf game over)
    if (gameRef.mode !== "gameover") {
      const pr = player.r;
      const col = slowActive ? "#facc15" : gameRef.level.accent;
      // anneau de near-miss en ralenti
      if (slowActive) {
        ctx.globalAlpha = 0.4;
        ctx.strokeStyle = "#facc15";
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(player.x, player.y, pr + NEAR_MISS_EXTRA, 0, Math.PI * 2);
        ctx.stroke();
        ctx.globalAlpha = 1;
      }
      // halo
      ctx.shadowBlur = 26;
      ctx.shadowColor = col;
      ctx.globalAlpha = 0.3;
      ctx.fillStyle = col;
      ctx.beginPath();
      ctx.arc(player.x, player.y, pr * 2.2, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
      ctx.fillStyle = col;
      ctx.beginPath();
      ctx.arc(player.x, player.y, pr, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#ffffff";
      ctx.beginPath();
      ctx.arc(player.x, player.y, pr * 0.45, 0, Math.PI * 2);
      ctx.fill();
      ctx.shadowBlur = 0;
    }

    ctx.globalCompositeOperation = "source-over";

    // Flash
    if (flash > 0) {
      ctx.fillStyle = `rgba(${gameRef.flashColor}, ${Math.min(0.5, flash)})`;
      ctx.fillRect(-30, -30, width + 60, height + 60);
    }

    ctx.restore();
  };

  const gameLoop = (time: number) => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;

    let dt = 0;
    if (gameRef.lastTime) dt = Math.min((time - gameRef.lastTime) / 1000, 0.05);
    gameRef.lastTime = time;

    // transition de fond
    gameRef.bgTop = mix(rgbToHexSafe(gameRef.bgTop), gameRef.bgTopTarget, Math.min(1, dt * 2));
    gameRef.bgBot = mix(rgbToHexSafe(gameRef.bgBot), gameRef.bgBotTarget, Math.min(1, dt * 2));

    if (gameRef.mode === "gameover") gameRef.gameOverTimer += dt;
    if (gameRef.mode === "attract" && gameRef.attractRestartTimer > 0) {
      gameRef.attractRestartTimer -= dt;
      if (gameRef.attractRestartTimer <= 0) resetRun("attract");
    }
    if (gameRef.levelTransition > 0) gameRef.levelTransition -= dt;

    updateSlowMotion(dt);
    const timeScale = gameRef.slowActive ? TIME_SCALE_SLOW : 1;
    const simDt = dt * timeScale;

    if (gameRef.streakTimer > 0) {
      gameRef.streakTimer -= dt;
      if (gameRef.streakTimer <= 0) { gameRef.combo = 0; gameRef.multiplier = 1; }
    }
    if (gameRef.flash > 0) gameRef.flash = Math.max(0, gameRef.flash - dt * 2);
    if (gameRef.shake > 0) gameRef.shake = Math.max(0, gameRef.shake - dt * 28);

    const simActive = gameRef.mode === "playing" || gameRef.mode === "attract" || gameRef.mode === "levelup";

    if (simActive) {
      if (gameRef.mode !== "levelup") updateSpawners(simDt);
      updateBullets(simDt);
      updateParticles(dt);

      if (gameRef.mode === "playing" || gameRef.mode === "levelup") movePlayer(dt);
      else attractAI(dt);

      if (gameRef.mode === "playing") {
        gameRef.score += Math.floor(dt * 14 * gameRef.spawner.difficulty);
        checkLevelUp();
      }

      gameRef.player.trail.unshift({ x: gameRef.player.x, y: gameRef.player.y, a: 1 });
      if (gameRef.player.trail.length > 14) gameRef.player.trail.pop();
      for (let i = 0; i < gameRef.player.trail.length; i++)
        gameRef.player.trail[i].a = 1 - i / gameRef.player.trail.length;
    } else {
      updateParticles(dt);
    }

    draw(ctx);

    setUi((u) =>
      u.score === gameRef.score &&
      u.combo === gameRef.combo &&
      u.multiplier === gameRef.multiplier &&
      u.meter === Math.round(gameRef.meter) &&
      u.mode === gameRef.mode
        ? u
        : {
            ...u,
            score: gameRef.score,
            combo: gameRef.combo,
            multiplier: gameRef.multiplier,
            meter: Math.round(gameRef.meter),
            mode: gameRef.mode,
            highScore: gameRef.highScore,
          }
    );

    requestAnimationFrame(gameLoop);
  };

  // utilitaire pour reconvertir rgb() en hex pour mix
  const rgbToHexSafe = (c: string) => {
    if (c.startsWith("#")) return c;
    const m = c.match(/\d+/g);
    if (!m) return "#000000";
    const [r, g, b] = m.map(Number);
    return "#" + [r, g, b].map((v) => v.toString(16).padStart(2, "0")).join("");
  };

  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen?.();
    } else {
      document.exitFullscreen?.();
    }
  };

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const resize = () => {
      const dpr = window.devicePixelRatio || 1;
      canvas.width = window.innerWidth * dpr;
      canvas.height = window.innerHeight * dpr;
      canvas.style.width = `${window.innerWidth}px`;
      canvas.style.height = `${window.innerHeight}px`;
      gameRef.width = window.innerWidth;
      gameRef.height = window.innerHeight;
      const ctx = canvas.getContext("2d");
      if (ctx) ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      gameRef.player.x = clamp(gameRef.player.x || gameRef.width / 2, PLAYER_RADIUS, gameRef.width - PLAYER_RADIUS);
      gameRef.player.y = clamp(gameRef.player.y || gameRef.height / 2, PLAYER_RADIUS, gameRef.height - PLAYER_RADIUS);
      initStars();
    };
    resize();
    window.addEventListener("resize", resize);

    try {
      const hs = localStorage.getItem("neonDodgeHighScore");
      if (hs) { gameRef.highScore = parseInt(hs, 10) || 0; setUi((u) => ({ ...u, highScore: gameRef.highScore })); }
    } catch {}

    resetRun("attract");

    const restartIfOver = () => {
      if (gameRef.mode === "gameover" && gameRef.gameOverTimer > 0.4) {
        resetRun("playing");
        audio.start();
        setUi((u) => ({ ...u, mode: "playing" }));
      }
    };

    const onKeyDown = (e: KeyboardEvent) => {
      if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", " ", "Shift"].includes(e.key)) e.preventDefault();
      gameRef.keys.add(e.key);
      if (e.key === " " || e.key === "Shift") gameRef.slowRequest = true;
      if (e.key === "f" || e.key === "F") { toggleFullscreen(); return; }
      audio.resume();
      if (gameRef.mode === "attract") startPlaying();
      else restartIfOver();
    };
    const onKeyUp = (e: KeyboardEvent) => {
      gameRef.keys.delete(e.key);
      if (e.key === " " || e.key === "Shift") gameRef.slowRequest = false;
    };
    const onMouseMove = (e: MouseEvent) => {
      if (gameRef.mode === "attract") startPlaying();
      gameRef.mouse.active = true;
      gameRef.mouse.x = e.clientX;
      gameRef.mouse.y = e.clientY;
    };
    const onMouseDown = (e: MouseEvent) => {
      if ((e.target as HTMLElement).closest("button")) return;
      audio.resume();
      gameRef.slowRequest = true;
      if (gameRef.mode === "attract") startPlaying();
      else restartIfOver();
    };
    const onMouseUp = () => { gameRef.slowRequest = false; };
    const onTouchStart = (e: TouchEvent) => {
      if ((e.target as HTMLElement).closest("button")) return;
      e.preventDefault();
      audio.resume();
      if (gameRef.mode === "attract") startPlaying();
      else restartIfOver();
      const t = e.touches[0];
      gameRef.mouse.active = true;
      gameRef.mouse.x = t.clientX;
      gameRef.mouse.y = t.clientY;
      gameRef.slowRequest = true;
    };
    const onTouchMove = (e: TouchEvent) => {
      e.preventDefault();
      const t = e.touches[0];
      gameRef.mouse.active = true;
      gameRef.mouse.x = t.clientX;
      gameRef.mouse.y = t.clientY;
    };
    const onTouchEnd = () => { gameRef.slowRequest = false; };
    const onFsChange = () => setIsFullscreen(!!document.fullscreenElement);

    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mousedown", onMouseDown);
    window.addEventListener("mouseup", onMouseUp);
    window.addEventListener("touchstart", onTouchStart, { passive: false });
    window.addEventListener("touchmove", onTouchMove, { passive: false });
    window.addEventListener("touchend", onTouchEnd);
    document.addEventListener("fullscreenchange", onFsChange);

    const raf = requestAnimationFrame(gameLoop);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mousedown", onMouseDown);
      window.removeEventListener("mouseup", onMouseUp);
      window.removeEventListener("touchstart", onTouchStart);
      window.removeEventListener("touchmove", onTouchMove);
      window.removeEventListener("touchend", onTouchEnd);
      document.removeEventListener("fullscreenchange", onFsChange);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const goalText = ui.levelGoal === Infinity ? "∞" : ui.levelGoal.toLocaleString("fr-FR");
  const progress =
    ui.levelGoal === Infinity ? 100 : Math.min(100, (ui.score / ui.levelGoal) * 100);

  return (
    <div className="relative h-screen w-screen overflow-hidden bg-[#030308] text-cyan-50 select-none">
      <canvas ref={canvasRef} className="absolute inset-0 block cursor-none touch-none" />

      {/* Boutons de contrôle */}
      <div className="absolute right-3 top-3 z-30 flex gap-2 sm:right-5 sm:top-5">
        <CtrlButton
          active={musicOn}
          onClick={() => { audio.resume(); setMusicOn(audio.toggleMusic()); }}
          label={musicOn ? "Musique activée" : "Musique coupée"}
        >
          {musicOn ? "♪" : "♪̸"}
        </CtrlButton>
        <CtrlButton
          active={sfxOn}
          onClick={() => { audio.resume(); setSfxOn(audio.toggleSfx()); }}
          label={sfxOn ? "Effets activés" : "Effets coupés"}
        >
          {sfxOn ? "🔊" : "🔇"}
        </CtrlButton>
        <CtrlButton active={isFullscreen} onClick={toggleFullscreen} label="Plein écran">
          {isFullscreen ? "⤢" : "⛶"}
        </CtrlButton>
      </div>

      {/* HUD */}
      <div className="pointer-events-none absolute inset-0 flex flex-col justify-between p-4 sm:p-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="text-[10px] font-bold tracking-[0.3em] text-cyan-300/80 sm:text-xs">SCORE</div>
            <div className="neon-text-cyan text-3xl font-black tabular-nums leading-none sm:text-5xl">
              {ui.score.toLocaleString("fr-FR")}
            </div>
            <div className="mt-1 text-[10px] text-cyan-200/60 sm:text-xs">
              RECORD {ui.highScore.toLocaleString("fr-FR")}
            </div>
          </div>

          {/* Niveau central */}
          <div className="mt-1 text-center">
            <div
              className="text-[10px] font-bold tracking-[0.3em] sm:text-xs"
              style={{ color: ui.accent }}
            >
              NIVEAU {ui.level}
            </div>
            <div
              className="text-lg font-black tracking-wider sm:text-2xl"
              style={{ color: ui.accent, textShadow: `0 0 12px ${ui.accent}` }}
            >
              {ui.levelName}
            </div>
            <div className="mt-1 h-1.5 w-28 overflow-hidden rounded-full bg-black/50 sm:w-40">
              <div
                className="h-full rounded-full transition-all duration-200"
                style={{ width: `${progress}%`, background: ui.accent, boxShadow: `0 0 8px ${ui.accent}` }}
              />
            </div>
            <div className="mt-0.5 text-[9px] text-white/40 sm:text-[10px]">objectif {goalText}</div>
          </div>

          <div className="text-right">
            <div className="text-[10px] font-bold tracking-[0.3em] text-fuchsia-300/80 sm:text-xs">COMBO</div>
            <div className="neon-text-fuchsia text-3xl font-black tabular-nums leading-none sm:text-5xl">
              {ui.combo}
            </div>
            <div className="neon-text-fuchsia mt-1 text-sm font-bold">×{ui.multiplier.toFixed(1)}</div>
          </div>
        </div>

        <div className="flex items-end justify-between gap-4">
          <div className="w-full max-w-xs">
            <div className="mb-1 flex items-center justify-between text-[10px] font-bold tracking-[0.25em] text-cyan-300/80 sm:text-xs">
              <span>RALENTI</span>
              <span className="text-cyan-200/50">ESPACE / MAJ / MAINTENIR</span>
            </div>
            <div className="h-3 w-full overflow-hidden rounded-full border border-cyan-400/30 bg-black/40">
              <div
                className="h-full bg-gradient-to-r from-cyan-400 to-blue-500 shadow-[0_0_14px_rgba(34,211,238,0.8)] transition-all duration-75"
                style={{ width: `${ui.meter}%` }}
              />
            </div>
          </div>
          <div className="hidden text-right text-[10px] text-cyan-200/50 sm:block">
            ZQSD · FLÈCHES · SOURIS · TACTILE
          </div>
        </div>
      </div>

      {/* Overlay montée de niveau */}
      {ui.mode === "levelup" && (
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center text-center">
          <div className="animate-pulse text-sm font-bold tracking-[0.4em]" style={{ color: ui.accent }}>
            NIVEAU {ui.level}
          </div>
          <div
            className="text-6xl font-black tracking-tighter sm:text-8xl"
            style={{ color: ui.accent, textShadow: `0 0 30px ${ui.accent}` }}
          >
            {ui.levelName}
          </div>
          <div className="mt-2 text-lg text-white/70 sm:text-2xl">{ui.levelSub}</div>
        </div>
      )}

      {/* Overlay attract */}
      {ui.mode === "attract" && (
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center bg-black/25 text-center">
          <h1 className="neon-text-cyan mb-1 text-5xl font-black tracking-tighter sm:text-8xl">NEON DODGE</h1>
          <h2 className="neon-text-fuchsia mb-6 text-2xl font-black tracking-[0.5em] sm:text-4xl">ARENA</h2>
          <div className="animate-pulse rounded-full border border-cyan-400/40 bg-cyan-950/40 px-5 py-2 text-sm font-bold tracking-widest text-cyan-300 backdrop-blur-sm">
            MODE DÉMO
          </div>
          <p className="mt-6 max-w-md px-4 text-sm text-cyan-100/70">
            Appuie sur une touche, bouge la souris ou touche l'écran pour prendre le contrôle
          </p>
          <div className="mt-3 flex flex-wrap items-center justify-center gap-x-4 gap-y-1 text-xs text-cyan-100/50">
            <span>Déplacement : ZQSD / Flèches / Souris</span>
            <span>·</span>
            <span>Ralenti : Espace / Maj</span>
            <span>·</span>
            <span>Plein écran : F</span>
          </div>
        </div>
      )}

      {/* Overlay game over */}
      {ui.mode === "gameover" && (
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center bg-black/65 text-center">
          <div className="neon-text-fuchsia mb-2 text-5xl font-black tracking-tighter sm:text-8xl">PARTIE TERMINÉE</div>
          <div className="mb-1 text-xl text-cyan-100 sm:text-2xl">
            Score <span className="font-bold text-cyan-300">{ui.score.toLocaleString("fr-FR")}</span>
          </div>
          <div className="mb-1 text-sm text-white/60">
            Niveau atteint : <span style={{ color: ui.accent }}>{ui.levelName}</span>
          </div>
          {ui.score >= ui.highScore && ui.score > 0 && (
            <div className="mb-3 animate-pulse text-sm font-bold text-yellow-300">★ NOUVEAU RECORD ! ★</div>
          )}
          <div className="mt-3 rounded-full border border-cyan-400/40 bg-cyan-950/40 px-6 py-2 text-sm font-bold tracking-widest text-cyan-300 backdrop-blur-sm">
            CLIC / TOUCHE / TACTILE POUR REJOUER
          </div>
        </div>
      )}

      {/* Crédit */}
      <div className="pointer-events-none absolute bottom-2 left-1/2 z-20 -translate-x-1/2 text-center text-[10px] tracking-wide text-white/35 sm:text-xs">
        Créé par <span className="font-bold text-cyan-300/70">Hylst - Geoffroy</span> avec l'aide d'une IA
      </div>
    </div>
  );
}

function CtrlButton({
  children,
  onClick,
  active,
  label,
}: {
  children: React.ReactNode;
  onClick: () => void;
  active: boolean;
  label: string;
}) {
  return (
    <button
      onClick={onClick}
      aria-label={label}
      title={label}
      className={`flex h-10 w-10 items-center justify-center rounded-lg border text-lg backdrop-blur-sm transition-all ${
        active
          ? "border-cyan-400/60 bg-cyan-500/20 text-cyan-200 shadow-[0_0_12px_rgba(34,211,238,0.4)]"
          : "border-white/15 bg-black/40 text-white/40"
      } hover:scale-110 active:scale-95`}
    >
      {children}
    </button>
  );
}
