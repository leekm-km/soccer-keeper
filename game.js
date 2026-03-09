// ============================================
// ⚽ 축구 공막기 - 리듬 수비 게임
// 3개 레인에서 날아오는 공을 ◀▶ 버튼으로 막아라!
// ============================================

const canvas = document.getElementById('gameCanvas');
const ctx    = canvas.getContext('2d');

function getCanvasSize() {
  return {
    w: Math.min(window.innerWidth  || document.documentElement.clientWidth  || 375, 480),
    h: Math.min(window.innerHeight || document.documentElement.clientHeight || 720, 720),
  };
}
const { w: CANVAS_W, h: CANVAS_H } = getCanvasSize();
canvas.width  = CANVAS_W;
canvas.height = CANVAS_H;

const BANNER_H = 50;
const CTRL_H   = 120;

// ── 레인 ──
const LANE_X = [CANVAS_W * 0.2, CANVAS_W * 0.5, CANVAS_W * 0.8];

// 골키퍼는 골문 안 (상단), 공은 아래서 올라옴
const GOAL_Y   = 50;
const GOAL_H   = Math.round(CANVAS_H * 0.26);   // 넓어진 골대 높이
const GOAL_W   = CANVAS_W * 0.88;               // 넓어진 골대 너비
const KEEPER_Y = GOAL_Y + GOAL_H - 8;           // 골문 하단 안쪽
const BALL_SPAWN_Y = CANVAS_H - BANNER_H - CTRL_H - 90;  // 좀 더 좁은 플레이 구역
const HIT_Y = KEEPER_Y - 46;                    // 몸통 레벨에서 판정 (다리 위)

// ── 난이도 ──
const DIFFICULTY = {
  easy:   { ballSpeed: 150, spawnMin: 1.4, spawnMax: 2.0 },
  normal: { ballSpeed: 230, spawnMin: 0.9, spawnMax: 1.4 },
  hard:   { ballSpeed: 330, spawnMin: 0.6, spawnMax: 1.0 },
};
let selectedDifficulty = 'normal';

// ── 상태 ──
const State = { IDLE: 'idle', PLAYING: 'playing', DEAD: 'dead' };
let state   = State.IDLE;
let animId  = null;
let lastTime = 0;

// ── 점수 ──
let saved = 0, goals = 0, streak = 0;
let bestStreak = parseInt(localStorage.getItem('sk_best_streak') || '0');
let totalSaved = parseInt(localStorage.getItem('sk_total')       || '0');
let canRevive  = true;

// ── 게임 타이밍 ──
let gameTime   = 0;
let spawnTimer = 0;

// ── 레인 플래시 ──
let laneFlash     = [0, 0, 0];
let laneFlashType = ['', '', ''];

// ── 피드백 이펙트 ──
let shakeTime  = 0;   // 화면 흔들림
let flashAlpha = 0;   // 임팩트 플래시

// ── 진동 설정 ──
let vibrationEnabled = JSON.parse(localStorage.getItem('sk_vibration') ?? 'true');

// ── 키퍼 ──
const keeper = {
  lane:    1,
  x:       LANE_X[1],
  targetX: LANE_X[1],
  y:       KEEPER_Y,
  catchAnim: 0,
  failAnim:  0,
  diving:    false,
  diveDir:   0,
  diveTimer: 0,

  reset() {
    this.lane     = 1;
    this.x        = LANE_X[1];
    this.targetX  = LANE_X[1];
    this.catchAnim = 0;
    this.failAnim  = 0;
    this.diving    = false;
    this.diveTimer = 0;
  },

  shift(dir) {
    if (state !== State.PLAYING) return;
    const nl = Math.max(0, Math.min(2, this.lane + dir));
    if (nl !== this.lane) {
      this.lane    = nl;
      this.targetX = LANE_X[nl];
      vibrate([15]);
    }
  },

  update(dt) {
    this.x += (this.targetX - this.x) * Math.min(1, 20 * dt);
    if (this.catchAnim > 0) this.catchAnim -= dt;
    if (this.failAnim  > 0) this.failAnim  -= dt;
    if (this.diving) {
      this.diveTimer -= dt;
      if (this.diveTimer <= 0) this.diving = false;
    }
  },

  draw() {
    ctx.save();
    const cx  = this.x;
    const fy  = this.y;   // 발 기준점 (골문 하단 안쪽)

    const jerseyCol = this.catchAnim > 0 ? '#2ecc71' : this.failAnim > 0 ? '#e74c3c' : '#f39c12';
    const accentCol = this.catchAnim > 0 ? '#27ae60' : this.failAnim > 0 ? '#c0392b' : '#e67e22';
    const gloveCol  = this.catchAnim > 0 ? '#58d68d' : '#fff';
    const skinCol   = '#f0b97b';
    const shortsCol = '#1c1c3a';
    const socksCol  = '#f5f5f5';
    const shoesCol  = '#2c2c2c';

    // 다이빙 기울기 (몸통 중심 피벗)
    const tilt = this.diving ? this.diveDir * 0.28 : 0;
    if (tilt) {
      ctx.translate(cx, fy - 43);
      ctx.rotate(tilt);
      ctx.translate(-cx, -(fy - 43));
    }

    // ─ 그림자 ─
    ctx.fillStyle = 'rgba(0,0,0,0.18)';
    ctx.beginPath(); ctx.ellipse(cx, fy + 2, 22, 6, 0, 0, Math.PI * 2); ctx.fill();

    // ─ 신발 (짧게: 7px) ─
    ctx.fillStyle = shoesCol;
    ctx.beginPath(); ctx.roundRect(cx - 16, fy - 7,  14, 7, [2, 2, 4, 4]); ctx.fill();
    ctx.beginPath(); ctx.roundRect(cx + 2,  fy - 7,  14, 7, [2, 2, 4, 4]); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.15)';
    ctx.beginPath(); ctx.roundRect(cx - 14, fy - 6,  10, 3, 2); ctx.fill();
    ctx.beginPath(); ctx.roundRect(cx + 4,  fy - 6,  10, 3, 2); ctx.fill();

    // ─ 양말 (짧게: 10px) ─
    ctx.fillStyle = socksCol;
    ctx.beginPath(); ctx.roundRect(cx - 14, fy - 17, 10, 12, 3); ctx.fill();
    ctx.beginPath(); ctx.roundRect(cx + 4,  fy - 17, 10, 12, 3); ctx.fill();
    ctx.fillStyle = jerseyCol;  // 양말 줄무늬
    ctx.fillRect(cx - 14, fy - 20, 10, 4);
    ctx.fillRect(cx + 4,  fy - 20, 10, 4);

    // ─ 반바지 (짧게: 15px) ─
    ctx.fillStyle = shortsCol;
    ctx.beginPath(); ctx.roundRect(cx - 17, fy - 32, 15, 16, [4, 4, 0, 0]); ctx.fill();
    ctx.beginPath(); ctx.roundRect(cx + 2,  fy - 32, 15, 16, [4, 4, 0, 0]); ctx.fill();
    ctx.beginPath(); ctx.roundRect(cx - 9,  fy - 32, 18,  8, 2); ctx.fill(); // 허리

    // ─ 유니폼 몸통 (fy-32부터 위로 34px) ─
    ctx.fillStyle = jerseyCol;
    ctx.beginPath(); ctx.roundRect(cx - 16, fy - 66, 32, 36, [8, 8, 2, 2]); ctx.fill();
    ctx.fillStyle = accentCol;
    ctx.beginPath(); ctx.roundRect(cx - 5,  fy - 66, 10, 36, [4, 4, 0, 0]); ctx.fill();
    // V넥
    ctx.fillStyle = skinCol;
    ctx.beginPath();
    ctx.moveTo(cx - 4, fy - 66); ctx.lineTo(cx, fy - 58); ctx.lineTo(cx + 4, fy - 66);
    ctx.closePath(); ctx.fill();

    // ─ 왼팔 (짧아진 몸에 맞게 pivot 조정) ─
    const lAngle = this.diving && this.diveDir < 0 ? -1.15 : -0.55;
    ctx.save();
    ctx.translate(cx - 16, fy - 54);
    ctx.rotate(lAngle);
    ctx.fillStyle = jerseyCol;
    ctx.beginPath(); ctx.roundRect(-5, -2, 10, 26, 5); ctx.fill();
    ctx.fillStyle = gloveCol;
    ctx.beginPath(); ctx.roundRect(-8, 22, 16, 13, 6); ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,0.18)'; ctx.lineWidth = 1;
    for (let f = 0; f < 3; f++) { ctx.beginPath(); ctx.moveTo(-4 + f * 4, 23); ctx.lineTo(-4 + f * 4, 34); ctx.stroke(); }
    ctx.restore();

    // ─ 오른팔 ─
    const rAngle = this.diving && this.diveDir > 0 ? 1.15 : 0.55;
    ctx.save();
    ctx.translate(cx + 16, fy - 54);
    ctx.rotate(rAngle);
    ctx.fillStyle = jerseyCol;
    ctx.beginPath(); ctx.roundRect(-5, -2, 10, 26, 5); ctx.fill();
    ctx.fillStyle = gloveCol;
    ctx.beginPath(); ctx.roundRect(-8, 22, 16, 13, 6); ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,0.18)'; ctx.lineWidth = 1;
    for (let f = 0; f < 3; f++) { ctx.beginPath(); ctx.moveTo(-4 + f * 4, 23); ctx.lineTo(-4 + f * 4, 34); ctx.stroke(); }
    ctx.restore();

    // ─ 목 ─
    ctx.fillStyle = skinCol;
    ctx.beginPath(); ctx.roundRect(cx - 5, fy - 72, 10, 8, 4); ctx.fill();

    // ─ 머리 ─
    ctx.fillStyle = skinCol;
    ctx.beginPath(); ctx.arc(cx, fy - 82, 18, 0, Math.PI * 2); ctx.fill();

    // ─ 캡 ─
    ctx.fillStyle = jerseyCol;
    ctx.beginPath(); ctx.arc(cx, fy - 90, 15, Math.PI, Math.PI * 2); ctx.fill();
    ctx.fillStyle = accentCol;
    ctx.beginPath(); ctx.roundRect(cx - 19, fy - 92, 38, 7, [3, 3, 0, 0]); ctx.fill();
    ctx.fillStyle = jerseyCol;  // 챙
    ctx.beginPath(); ctx.roundRect(cx - 15, fy - 86, 30, 5, 3); ctx.fill();

    // ─ 눈 ─
    const gaze = this.diving ? this.diveDir * 1.5 : 0;
    ctx.fillStyle = '#fff';
    ctx.beginPath(); ctx.ellipse(cx - 6, fy - 82, 5, 5, 0, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.ellipse(cx + 6, fy - 82, 5, 5, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = this.catchAnim > 0 ? '#27ae60' : '#2c3e50';
    ctx.beginPath(); ctx.arc(cx - 6 + gaze, fy - 82, 3, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(cx + 6 + gaze, fy - 82, 3, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.beginPath(); ctx.arc(cx - 5 + gaze, fy - 83.5, 1.2, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(cx + 7 + gaze, fy - 83.5, 1.2, 0, Math.PI * 2); ctx.fill();

    // ─ 눈썹 ─
    ctx.strokeStyle = '#6d4c41'; ctx.lineWidth = 2.2; ctx.lineCap = 'round';
    if (this.failAnim > 0) {
      ctx.beginPath(); ctx.moveTo(cx - 11, fy - 89); ctx.lineTo(cx - 2, fy - 91); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(cx + 11, fy - 89); ctx.lineTo(cx + 2,  fy - 91); ctx.stroke();
    } else if (this.catchAnim > 0) {
      ctx.beginPath(); ctx.moveTo(cx - 11, fy - 90); ctx.lineTo(cx - 2, fy - 88); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(cx + 11, fy - 90); ctx.lineTo(cx + 2,  fy - 88); ctx.stroke();
    } else {
      ctx.beginPath(); ctx.moveTo(cx - 12, fy - 89); ctx.lineTo(cx - 2, fy - 89); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(cx + 12, fy - 89); ctx.lineTo(cx + 2,  fy - 89); ctx.stroke();
    }

    // ─ 입 ─
    ctx.strokeStyle = '#a0695d'; ctx.lineWidth = 1.5; ctx.lineCap = 'round';
    if (this.catchAnim > 0) {
      ctx.beginPath(); ctx.arc(cx, fy - 75, 5, 0.15, Math.PI - 0.15); ctx.stroke();
      ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.roundRect(cx - 4, fy - 76, 8, 4, 2); ctx.fill();
    } else if (this.failAnim > 0) {
      ctx.beginPath(); ctx.arc(cx, fy - 73, 4, Math.PI + 0.3, Math.PI * 2 - 0.3); ctx.stroke();
    } else {
      ctx.beginPath(); ctx.moveTo(cx - 4, fy - 75); ctx.lineTo(cx + 4, fy - 75); ctx.stroke();
    }

    ctx.restore();
  }
};

// ── 공 ── (아래서 위로 날아옴)
let balls = [];

function spawnBallInLane(lane, yOffset = 0) {
  const cfg       = DIFFICULTY[selectedDifficulty];
  const speedMult = 1 + Math.min(gameTime / 90, 0.4);
  balls.push({
    lane,
    x:        LANE_X[lane],
    y:        BALL_SPAWN_Y + yOffset,   // yOffset > 0 → 뒤에 출발 → 늦게 도착
    vy:       -cfg.ballSpeed * speedMult,
    size:     18,
    spin:     Math.random() * Math.PI * 2,
    spinRate: (Math.random() < 0.5 ? 1 : -1) * (5 + Math.random() * 8),
    trail:    [],
  });
}

function trySpawnBalls() {
  const lane1 = Math.floor(Math.random() * 3);
  spawnBallInLane(lane1);
  if (selectedDifficulty === 'hard' && Math.random() < 0.15) {
    const others = [0, 1, 2].filter(l => l !== lane1);
    // 두 번째 공은 60~100px 뒤에서 출발 → 0.2~0.3초 시차
    spawnBallInLane(others[Math.floor(Math.random() * 2)], 60 + Math.random() * 40);
  }
}

function nextSpawnInterval() {
  const cfg   = DIFFICULTY[selectedDifficulty];
  const scale = Math.max(0.65, 1 - gameTime / 120);
  return cfg.spawnMin * scale + Math.random() * (cfg.spawnMax - cfg.spawnMin) * scale;
}

// ── 파티클 ──
let particles = [];

function spawnParticles(x, y, type) {
  const emojis = type === 'save' ? ['⭐', '✨', '💫', '🎉'] : ['😢', '❌', '💔'];
  for (let i = 0; i < 6; i++) {
    const a = (Math.PI * 2 / 6) * i + Math.random() * 0.5;
    particles.push({
      x, y,
      vx: Math.cos(a) * (60 + Math.random() * 60),
      vy: Math.sin(a) * (60 + Math.random() * 60) - 60,
      life: 1, maxLife: 1,
      emoji: emojis[Math.floor(Math.random() * emojis.length)],
      size:  16 + Math.random() * 12,
    });
  }
}

// ── 게임 시작 ──
function startGame() {
  state      = State.PLAYING;
  saved      = 0; goals = 0; streak = 0;
  gameTime   = 0;
  spawnTimer = 0.8;
  canRevive  = true;
  balls      = [];
  laneFlash  = [0, 0, 0];
  laneFlashType = ['', '', ''];
  shakeTime  = 0;
  flashAlpha = 0;
  keeper.reset();
  particles = [];

  document.getElementById('startScreen').style.display = 'none';
  document.getElementById('gameOverScreen').classList.remove('show');
  document.getElementById('controls').classList.add('active');
  updateHUD();
}

// ── 공 업데이트 & 판정 ──
function updateBalls(dt) {
  for (let i = balls.length - 1; i >= 0; i--) {
    const b = balls[i];
    b.y    += b.vy * dt;
    b.spin += b.spinRate * dt;
    b.trail.push({ x: b.x, y: b.y });
    if (b.trail.length > 10) b.trail.shift();

    // 판정: 공이 몸통 높이에 도달 (다리를 지나기 전에 판정)
    if (b.y <= HIT_Y) {
      if (keeper.lane === b.lane) {
        // ── SAVE ──
        saved++;
        streak++;
        keeper.catchAnim = 0.6;
        keeper.diving  = true;
        keeper.diveDir = b.lane === 0 ? -1 : b.lane === 2 ? 1 : 0;
        keeper.diveTimer = 0.45;
        laneFlash[b.lane]     = 0.5;
        laneFlashType[b.lane] = 'save';
        spawnParticles(b.x, HIT_Y, 'save');
        // 타격감: 진동 + 화면 흔들림 + 임팩트 플래시
        vibrate([80]);
        shakeTime  = 0.45;
        flashAlpha = 0.22;
        if (streak > bestStreak) {
          bestStreak = streak;
          localStorage.setItem('sk_best_streak', bestStreak);
        }
      } else {
        // ── GOAL ──
        goals++;
        streak = 0;
        keeper.failAnim = 0.6;
        laneFlash[b.lane]     = 0.5;
        laneFlashType[b.lane] = 'goal';
        spawnParticles(b.x, HIT_Y, 'goal');
        vibrate([200, 50, 200]);
      }

      balls.splice(i, 1);
      updateHUD();

      if (goals >= 3 && state === State.PLAYING) {
        state = State.DEAD;
        showGameOver();
        return;
      }
    } else if (b.y < -60) {
      balls.splice(i, 1);
    }
  }
}

// ── 그리기: 필드 ──
function drawField() {
  // 잔디 그라디언트
  const grad = ctx.createLinearGradient(0, 0, 0, CANVAS_H);
  grad.addColorStop(0,   '#1a5c1a');
  grad.addColorStop(0.4, '#27821a');
  grad.addColorStop(0.7, '#1e6b1e');
  grad.addColorStop(1,   '#145a14');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);

  // 잔디 줄무늬
  for (let i = 0; i < 8; i++) {
    if (i % 2 === 0) { ctx.fillStyle = 'rgba(0,0,0,0.04)'; ctx.fillRect(0, CANVAS_H * i / 8, CANVAS_W, CANVAS_H / 8); }
  }

  // ─ 골문 (상단, 더 넓어짐) ─
  const gx = (CANVAS_W - GOAL_W) / 2;
  const gw = GOAL_W;

  // 그물
  ctx.fillStyle = 'rgba(255,255,255,0.05)';
  ctx.fillRect(gx, GOAL_Y, gw, GOAL_H);
  ctx.strokeStyle = 'rgba(255,255,255,0.12)'; ctx.lineWidth = 1;
  for (let x = gx; x <= gx + gw; x += 20) { ctx.beginPath(); ctx.moveTo(x, GOAL_Y); ctx.lineTo(x, GOAL_Y + GOAL_H); ctx.stroke(); }
  for (let y = GOAL_Y; y <= GOAL_Y + GOAL_H; y += 15) { ctx.beginPath(); ctx.moveTo(gx, y); ctx.lineTo(gx + gw, y); ctx.stroke(); }

  // 골대 프레임
  ctx.strokeStyle = '#fff'; ctx.lineWidth = 5; ctx.lineCap = 'square';
  ctx.beginPath();
  ctx.moveTo(gx, GOAL_Y + GOAL_H); ctx.lineTo(gx, GOAL_Y); ctx.lineTo(gx + gw, GOAL_Y); ctx.lineTo(gx + gw, GOAL_Y + GOAL_H);
  ctx.stroke();

  // ─ 레인 구분 점선 ─
  const lineTop = GOAL_Y + GOAL_H;
  const lineBot = BALL_SPAWN_Y + 20;
  ctx.strokeStyle = 'rgba(255,255,255,0.15)'; ctx.lineWidth = 1; ctx.setLineDash([6, 8]);
  const div1 = (LANE_X[0] + LANE_X[1]) / 2;
  const div2 = (LANE_X[1] + LANE_X[2]) / 2;
  ctx.beginPath(); ctx.moveTo(div1, lineTop); ctx.lineTo(div1, lineBot); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(div2, lineTop); ctx.lineTo(div2, lineBot); ctx.stroke();
  ctx.setLineDash([]);

  // ─ 히트존 (키퍼 위치) ─
  LANE_X.forEach((lx, i) => {
    const active = state === State.PLAYING && keeper.lane === i;
    const flash  = laneFlash[i] > 0;
    const type   = laneFlashType[i];

    if (flash) {
      const fa = Math.min(1, laneFlash[i] * 2.5);
      ctx.fillStyle   = type === 'save' ? `rgba(46,204,113,${fa * 0.45})` : `rgba(231,76,60,${fa * 0.45})`;
      ctx.beginPath(); ctx.ellipse(lx, KEEPER_Y + 6, 38, 14, 0, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = type === 'save' ? `rgba(46,204,113,${fa})` : `rgba(231,76,60,${fa})`;
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.ellipse(lx, KEEPER_Y + 6, 38, 14, 0, 0, Math.PI * 2); ctx.stroke();
    }
    ctx.fillStyle = active ? 'rgba(255,255,255,0.35)' : 'rgba(255,255,255,0.1)';
    ctx.beginPath(); ctx.ellipse(lx, KEEPER_Y + 6, 26, 9, 0, 0, Math.PI * 2); ctx.fill();
  });

  // ─ 공 출발 지점 표시 (하단) ─
  LANE_X.forEach((lx) => {
    ctx.fillStyle = 'rgba(255,255,255,0.06)';
    ctx.beginPath(); ctx.ellipse(lx, BALL_SPAWN_Y + 8, 24, 8, 0, 0, Math.PI * 2); ctx.fill();
  });

  // ─ 페널티 박스 ─
  const pbW = CANVAS_W * 0.7;
  const pbX = (CANVAS_W - pbW) / 2;
  const pbY = CANVAS_H - BANNER_H - CTRL_H - 95;
  ctx.strokeStyle = 'rgba(255,255,255,0.2)'; ctx.lineWidth = 1.5;
  ctx.strokeRect(pbX, pbY, pbW, 80);

  // 페널티 스팟
  ctx.fillStyle = 'rgba(255,255,255,0.35)';
  ctx.beginPath(); ctx.arc(CANVAS_W / 2, CANVAS_H * 0.6, 4, 0, Math.PI * 2); ctx.fill();
}

// ── 그리기: 공 ──
function drawBalls() {
  balls.forEach(b => {
    b.trail.forEach((pt, i) => {
      const a = (i / b.trail.length) * 0.18;
      const s = b.size * (i / b.trail.length) * 0.55;
      ctx.save(); ctx.globalAlpha = a;
      ctx.fillStyle = '#fff';
      ctx.beginPath(); ctx.arc(pt.x, pt.y, s, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
    });

    const distFrac = Math.max(0, Math.min(1, (BALL_SPAWN_Y - b.y) / (BALL_SPAWN_Y - HIT_Y)));
    ctx.fillStyle = `rgba(0,0,0,${0.05 + 0.15 * distFrac})`;
    ctx.beginPath();
    ctx.ellipse(b.x, BALL_SPAWN_Y + 10, b.size * (1 - distFrac * 0.5) * 1.2, b.size * 0.35, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.save();
    ctx.translate(b.x, b.y);
    ctx.rotate(b.spin);
    ctx.fillStyle = '#fff';
    ctx.beginPath(); ctx.arc(0, 0, b.size, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = '#222'; ctx.lineWidth = 1.2; ctx.stroke();
    ctx.fillStyle = '#333';
    ctx.beginPath(); ctx.arc(0, 0, b.size * 0.34, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = '#555'; ctx.lineWidth = 1;
    for (let k = 0; k < 5; k++) {
      const a = (Math.PI * 2 / 5) * k;
      ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(Math.cos(a) * b.size * 0.75, Math.sin(a) * b.size * 0.75); ctx.stroke();
    }
    ctx.restore();
  });
}

// ── 그리기: HUD (캔버스 위) ──
function drawHudOnCanvas() {
  if (state !== State.PLAYING) return;

  ctx.font = 'bold 11px sans-serif';
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  LANE_X.forEach((lx, i) => {
    ctx.fillStyle = keeper.lane === i ? 'rgba(255,255,255,0.95)' : 'rgba(255,255,255,0.3)';
    ctx.fillText(['①', '②', '③'][i], lx, GOAL_Y + GOAL_H + 14);
  });

  const sc = keeper.catchAnim;
  const fc = keeper.failAnim;
  if (sc > 0 || fc > 0) {
    const alpha = Math.max(sc, fc);
    ctx.fillStyle = sc > 0 ? `rgba(46,204,113,${alpha * 0.92})` : `rgba(231,76,60,${alpha * 0.92})`;
    ctx.beginPath(); ctx.roundRect(CANVAS_W / 2 - 72, CANVAS_H * 0.55 - 22, 144, 44, 22); ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 20px sans-serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(sc > 0 ? '✅ SAVE!' : '❌ GOAL!', CANVAS_W / 2, CANVAS_H * 0.55);
  }
}

// ── 그리기: 파티클 ──
function drawParticles() {
  particles.forEach(p => {
    ctx.save();
    ctx.globalAlpha = p.life / p.maxLife;
    ctx.font = `${p.size}px serif`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(p.emoji, p.x, p.y);
    ctx.restore();
  });
}

// ── 메인 루프 ──
function loop(timestamp) {
  const dt = Math.min((timestamp - lastTime) / 1000, 0.05);
  lastTime = timestamp;

  if (state === State.PLAYING) {
    gameTime   += dt;
    spawnTimer -= dt;
    if (spawnTimer <= 0) {
      trySpawnBalls();
      spawnTimer = nextSpawnInterval();
    }

    updateBalls(dt);
    keeper.update(dt);

    for (let i = 0; i < 3; i++) { if (laneFlash[i] > 0) laneFlash[i] -= dt * 2; }

    particles.forEach(p => {
      p.x += p.vx * dt; p.y += p.vy * dt;
      p.vy += 300 * dt;
      p.life -= dt * 1.2;
    });
    particles = particles.filter(p => p.life > 0);
  }

  // ─ 화면 흔들림 적용 ─
  ctx.save();
  if (shakeTime > 0) {
    shakeTime -= dt * 5;
    if (shakeTime < 0) shakeTime = 0;
    const s = shakeTime * 9;
    ctx.translate((Math.random() - 0.5) * s, (Math.random() - 0.5) * s * 0.6);
  }

  drawField();
  drawBalls();
  keeper.draw();
  drawParticles();
  drawHudOnCanvas();

  // ─ 임팩트 플래시 (SAVE 시) ─
  if (flashAlpha > 0) {
    ctx.fillStyle = `rgba(255,255,255,${flashAlpha})`;
    ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);
    flashAlpha = Math.max(0, flashAlpha - dt * 3.5);
  }

  ctx.restore();

  animId = requestAnimationFrame(loop);
}

// ── 입력 ──
document.addEventListener('keydown', e => {
  if (e.code === 'ArrowLeft'  || e.code === 'KeyA') keeper.shift(-1);
  if (e.code === 'ArrowRight' || e.code === 'KeyD') keeper.shift(+1);
});

['touchstart', 'mousedown'].forEach(ev => {
  document.getElementById('btnLeft').addEventListener(ev, e => { e.preventDefault(); keeper.shift(-1); }, { passive: false });
  document.getElementById('btnRight').addEventListener(ev, e => { e.preventDefault(); keeper.shift(+1); }, { passive: false });
});

let swipeStartX = 0;
canvas.addEventListener('touchstart', e => { swipeStartX = e.touches[0].clientX; }, { passive: true });
canvas.addEventListener('touchend',   e => {
  const dx = e.changedTouches[0].clientX - swipeStartX;
  if (Math.abs(dx) > 30) keeper.shift(dx < 0 ? -1 : 1);
});

// ── HUD ──
function updateHUD() {
  document.getElementById('savedCount').textContent  = saved;
  document.getElementById('goalCount').textContent   = goals;
  document.getElementById('streakCount').textContent = streak;
}

// ── 게임오버 ──
function showGameOver() {
  totalSaved += saved;
  localStorage.setItem('sk_total', totalSaved);
  const screen = document.getElementById('gameOverScreen');
  screen.classList.add('show');
  document.getElementById('goSaved').textContent  = `${saved}개`;
  document.getElementById('goGoals').textContent  = `${goals}개`;
  document.getElementById('goStreak').textContent = `${streak > 0 ? streak : bestStreak}연속`;
  document.getElementById('goBest').textContent   = `${bestStreak}연속`;
  const rb = document.getElementById('reviveBtn');
  rb.classList.toggle('used', !canRevive);
  rb.textContent = canRevive ? '📺 광고 보고 부활하기' : '(부활 소진)';
}

function revive() {
  if (!canRevive) return;
  canRevive = false;
  document.getElementById('gameOverScreen').classList.remove('show');
  showRewardedAd(() => {
    goals      = Math.max(0, goals - 1);
    balls      = [];
    state      = State.PLAYING;
    spawnTimer = 1.0;
    updateHUD();
  });
}

// 광고 보고 다시 시작 (무료 재시작 없음)
function retryGame() {
  showRewardedAd(() => {
    showSaveDialog(saved, name => {
      if (name) { saveLeaderboard(name, saved, bestStreak); showToast(`${name}님의 기록이 저장됐어요!`); }
      setTimeout(startGame, name ? 2500 : 0);
    });
  });
}

// ── 광고 ──
function showRewardedAd(onComplete) {
  const overlay = document.createElement('div');
  overlay.className = 'ad-overlay';
  overlay.innerHTML = `
    <div class="ad-modal">
      <div class="ad-label">광고</div>
      <div class="ad-placeholder">
        <span class="ad-icon">📱</span>
        <p>광고를 시청하고 계속 플레이하세요!</p>
        <div class="ad-timer-bar"><div class="ad-timer-fill" id="adFill"></div></div>
        <div class="ad-countdown" id="adCount">5</div>
      </div>
      <button class="ad-skip-btn" id="adBtn" disabled>광고 시청 후 계속 (5)</button>
    </div>`;
  document.body.appendChild(overlay);
  let count = 5;
  const btn = overlay.querySelector('#adBtn'), cntEl = overlay.querySelector('#adCount'), fill = overlay.querySelector('#adFill');
  const t = setInterval(() => {
    count--;
    cntEl.textContent = count;
    fill.style.width = `${((5 - count) / 5) * 100}%`;
    if (count <= 0) { clearInterval(t); btn.disabled = false; btn.textContent = '계속하기! 🔄'; btn.classList.add('ready'); }
    else btn.textContent = `광고 시청 후 계속 (${count})`;
  }, 1000);
  btn.addEventListener('click', () => { if (!btn.disabled) { overlay.remove(); onComplete?.(); } });
}

// ── 랭킹 ──
const LB_KEY = 'lb_soccer_keeper';
function saveLeaderboard(name, score, streak) {
  const all = JSON.parse(localStorage.getItem(LB_KEY) || '[]');
  all.push({ name, score, streak, date: new Date().toLocaleDateString('ko-KR') });
  all.sort((a, b) => b.score - a.score);
  localStorage.setItem(LB_KEY, JSON.stringify(all.slice(0, 10)));
}
function getLeaderboard() { return JSON.parse(localStorage.getItem(LB_KEY) || '[]'); }
function showLeaderboard(currentScore, fromGameOver = false) {
  const scores = getLeaderboard();
  const rows = scores.length === 0
    ? '<tr><td colspan="3" style="text-align:center;color:#999;padding:20px">기록 없음</td></tr>'
    : scores.map((s, i) => `<tr class="${s.score === currentScore ? 'highlight' : ''}"><td>${['🥇','🥈','🥉'][i] || i+1}</td><td>${s.name}</td><td>${s.score}개 방어</td></tr>`).join('');
  const modal = document.createElement('div');
  modal.className = 'modal-overlay';
  modal.innerHTML = `<div class="modal-box leaderboard-modal"><h2>🏆 랭킹</h2><table class="lb-table"><thead><tr><th>순위</th><th>이름</th><th>기록</th></tr></thead><tbody>${rows}</tbody></table><button class="btn-primary" id="lbCloseBtn">닫기</button></div>`;
  document.body.appendChild(modal);
  modal.querySelector('#lbCloseBtn').addEventListener('click', () => {
    modal.remove();
    // 게임오버에서 열었으면 닫을 때 게임오버 화면 다시 표시
    if (fromGameOver) {
      document.getElementById('gameOverScreen').classList.add('show');
    }
  });
}

function showSaveDialog(score, onDone) {
  const modal = document.createElement('div');
  modal.className = 'modal-overlay';
  modal.innerHTML = `<div class="modal-box"><h2>⚽ 게임 종료</h2><p class="final-score">막은 수: <strong>${score}개</strong></p><p style="color:#666;font-size:14px">랭킹에 등록할까요?</p><input type="text" id="nameInput" placeholder="닉네임" maxlength="10" class="name-input"/><div class="modal-buttons"><button class="btn-primary" id="saveBtn">등록</button><button class="btn-secondary" id="skipBtn">종료</button></div></div>`;
  document.body.appendChild(modal);
  const inp = modal.querySelector('#nameInput'); inp.focus();
  const save = () => { const n = inp.value.trim() || '익명'; modal.remove(); onDone(n); };
  modal.querySelector('#saveBtn').addEventListener('click', save);
  modal.querySelector('#skipBtn').addEventListener('click', () => { modal.remove(); onDone(null); });
  inp.addEventListener('keydown', e => e.key === 'Enter' && save());
}

function showToast(msg, duration = 2500) {
  document.querySelector('.toast')?.remove();
  const t = Object.assign(document.createElement('div'), { className: 'toast', textContent: msg });
  document.body.appendChild(t);
  setTimeout(() => t.classList.add('show'), 10);
  setTimeout(() => { t.classList.remove('show'); setTimeout(() => t.remove(), 300); }, duration);
}

function vibrate(p = [50]) {
  if (vibrationEnabled) navigator.vibrate?.(p);
}

// ── 이벤트 ──
document.getElementById('startBtn').addEventListener('click', startGame);
document.getElementById('lbBtn').addEventListener('click', () => showLeaderboard(0));
document.getElementById('reviveBtn').addEventListener('click', revive);
document.getElementById('retryBtn').addEventListener('click', retryGame);
document.getElementById('shareBtn').addEventListener('click', async () => {
  const text = `⚽ 축구 공막기에서 ${saved}개를 막았어요! 최고 연속 ${bestStreak}개! 나보다 잘 막을 수 있어?`;
  if (navigator.share) { try { await navigator.share({ title: '축구 공막기', text }); return; } catch {} }
  if (navigator.clipboard) { await navigator.clipboard.writeText(text); showToast('클립보드에 복사됐어요! 😊'); }
});
document.getElementById('lbShowBtn').addEventListener('click', () => {
  document.getElementById('gameOverScreen').classList.remove('show');
  showLeaderboard(saved, true);   // true = 게임오버에서 열림 → 닫으면 게임오버 다시 표시
});

// 홈으로 이동 공통 함수
function goHome() {
  state = State.IDLE;
  balls = [];
  particles = [];
  shakeTime = 0; flashAlpha = 0;
  document.getElementById('controls').classList.remove('active');
  document.getElementById('gameOverScreen').classList.remove('show');
  document.getElementById('startScreen').style.display = '';
}

// HUD 홈 버튼 (플레이 중)
document.getElementById('hudHomeBtn').addEventListener('click', () => {
  if (state === State.PLAYING || state === State.DEAD) goHome();
});

// 게임오버 화면 홈 버튼
document.getElementById('goHomeBtn').addEventListener('click', goHome);
document.querySelectorAll('.diff-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.diff-btn').forEach(b => b.classList.remove('selected'));
    btn.classList.add('selected'); selectedDifficulty = btn.dataset.diff;
  });
});

// ── 진동 토글 ──
const vibToggle = document.getElementById('vibToggle');
if (vibToggle) {
  vibToggle.textContent = vibrationEnabled ? 'ON' : 'OFF';
  vibToggle.classList.toggle('off', !vibrationEnabled);
  vibToggle.addEventListener('click', () => {
    vibrationEnabled = !vibrationEnabled;
    localStorage.setItem('sk_vibration', JSON.stringify(vibrationEnabled));
    vibToggle.textContent = vibrationEnabled ? 'ON' : 'OFF';
    vibToggle.classList.toggle('off', !vibrationEnabled);
  });
}

document.getElementById('bannerAd').innerHTML = `<div class="banner-ad"><span class="ad-badge">AD</span><span>배너 광고 영역 (실제 광고로 교체하세요)</span></div>`;

lastTime = performance.now();
animId   = requestAnimationFrame(loop);
