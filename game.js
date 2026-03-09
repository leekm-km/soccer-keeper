// ============================================
// 축구 공막기 게임
// ============================================

const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

const CANVAS_W = Math.min(window.innerWidth, 480);
const CANVAS_H = Math.min(window.innerHeight, 720);
canvas.width = CANVAS_W;
canvas.height = CANVAS_H;

const BANNER_H = 50;
const CTRL_H = 120; // 컨트롤 버튼 영역

// 포지션 (3개: 왼쪽, 가운데, 오른쪽)
const POS = {
  LEFT: 0,
  CENTER: 1,
  RIGHT: 2
};
const POS_NAMES = ['왼쪽', '가운데', '오른쪽'];
const POS_X = [
  CANVAS_W * 0.2,
  CANVAS_W * 0.5,
  CANVAS_W * 0.8
];

// 난이도 설정
const DIFFICULTY = {
  easy:   { name: '쉬움',   speed: 0.8, fakeChance: 0.1, timeLimit: 3.0 },
  normal: { name: '보통',   speed: 1.2, fakeChance: 0.25, timeLimit: 2.2 },
  hard:   { name: '어려움', speed: 1.8, fakeChance: 0.4, timeLimit: 1.5 }
};

let selectedDifficulty = 'normal';

// 게임 상태
const State = { IDLE: 'idle', READY: 'ready', BALL_FLYING: 'ball_flying', RESULT: 'result', DEAD: 'dead', PAUSED: 'paused' };
let state = State.IDLE;
let animId = null;
let lastTime = 0;

// 스코어
let saved = 0;     // 막은 수
let goals = 0;     // 골 허용
let streak = 0;    // 연속 방어
let bestStreak = parseInt(localStorage.getItem('sk_best_streak') || '0');
let totalSaved = parseInt(localStorage.getItem('sk_total') || '0');
let canRevive = true;
let round = 0;

// 키퍼
const keeper = {
  pos: POS.CENTER,
  x: POS_X[POS.CENTER],
  targetX: POS_X[POS.CENTER],
  y: 0,
  w: 50, h: 80,
  diving: false,
  diveDir: 0,
  diveTimer: 0,
  catchAnim: 0,
  failAnim: 0,
  frameCount: 0,

  reset() {
    this.pos = POS.CENTER;
    this.x = POS_X[POS.CENTER];
    this.targetX = POS_X[POS.CENTER];
    this.diving = false; this.diveTimer = 0;
    this.catchAnim = 0; this.failAnim = 0;
  },

  moveTo(newPos) {
    if (state !== State.READY && state !== State.BALL_FLYING) return;
    if (this.diving) return;
    this.pos = Math.max(0, Math.min(2, newPos));
    this.targetX = POS_X[this.pos];
  },

  update(dt) {
    // 스무스 이동
    const dx = this.targetX - this.x;
    this.x += dx * Math.min(1, 12 * dt);

    if (this.diving) {
      this.diveTimer -= dt;
      if (this.diveTimer <= 0) this.diving = false;
    }
    if (this.catchAnim > 0) this.catchAnim -= dt;
    if (this.failAnim > 0) this.failAnim -= dt;
    this.frameCount++;
    this.y = CANVAS_H - BANNER_H - CTRL_H - 70;
  },

  draw() {
    ctx.save();
    const cx = this.x;
    const by = this.y + this.h;
    const color = this.catchAnim > 0 ? '#27ae60' : this.failAnim > 0 ? '#e74c3c' : '#f39c12';
    const gloveBright = this.catching > 0 ? '#2ecc71' : '#f1c40f';

    // 그림자
    ctx.fillStyle = 'rgba(0,0,0,0.2)';
    ctx.beginPath();
    ctx.ellipse(cx, CANVAS_H - BANNER_H - CTRL_H - 12, 22, 6, 0, 0, Math.PI * 2);
    ctx.fill();

    // 다이빙 각도
    let angle = 0;
    if (this.diving) angle = this.diveDir * 0.4;
    ctx.rotate(angle);

    // 유니폼 (몸통)
    ctx.fillStyle = '#27ae60';
    ctx.beginPath();
    ctx.roundRect(cx - 14, by - 42, 28, 32, 4);
    ctx.fill();

    // 줄무늬
    ctx.fillStyle = '#1e8449';
    ctx.fillRect(cx - 4, by - 42, 8, 32);

    // 팔 / 장갑
    // 왼팔
    if (this.diving && this.diveDir < 0) {
      ctx.fillStyle = gloveBright;
      ctx.beginPath();
      ctx.roundRect(cx - 34, by - 48, 20, 14, 6);
      ctx.fill();
    } else {
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.roundRect(cx - 24, by - 40, 10, 22, 4);
      ctx.fill();
      ctx.fillStyle = gloveBright;
      ctx.beginPath();
      ctx.roundRect(cx - 26, by - 22, 14, 12, 4);
      ctx.fill();
    }
    // 오른팔
    if (this.diving && this.diveDir > 0) {
      ctx.fillStyle = gloveBright;
      ctx.beginPath();
      ctx.roundRect(cx + 14, by - 48, 20, 14, 6);
      ctx.fill();
    } else {
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.roundRect(cx + 14, by - 40, 10, 22, 4);
      ctx.fill();
      ctx.fillStyle = gloveBright;
      ctx.beginPath();
      ctx.roundRect(cx + 12, by - 22, 14, 12, 4);
      ctx.fill();
    }

    // 다리
    ctx.fillStyle = color;
    const legSpread = this.diving ? Math.abs(this.diveDir) * 8 : 0;
    ctx.beginPath(); ctx.roundRect(cx - 14 - legSpread, by - 10, 12, 20, 3); ctx.fill();
    ctx.beginPath(); ctx.roundRect(cx + 2 + legSpread, by - 10, 12, 20, 3); ctx.fill();

    // 신발
    ctx.fillStyle = '#222';
    ctx.beginPath(); ctx.roundRect(cx - 16 - legSpread, by + 8, 14, 8, 3); ctx.fill();
    ctx.beginPath(); ctx.roundRect(cx + 2 + legSpread, by + 8, 14, 8, 3); ctx.fill();

    // 머리
    ctx.fillStyle = '#f5cba7';
    ctx.beginPath();
    ctx.arc(cx, by - 52, 16, 0, Math.PI * 2);
    ctx.fill();

    // 헬멧/머리카락
    ctx.fillStyle = '#27ae60';
    ctx.beginPath();
    ctx.arc(cx, by - 60, 12, Math.PI, Math.PI * 2);
    ctx.fill();

    // 눈
    ctx.fillStyle = '#222';
    ctx.beginPath(); ctx.arc(cx - 5, by - 53, 2.5, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(cx + 5, by - 53, 2.5, 0, Math.PI * 2); ctx.fill();

    // 표정
    if (this.catchAnim > 0) {
      // 기뻐하는 표정
      ctx.strokeStyle = '#222'; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.arc(cx, by - 50, 4, 0, Math.PI); ctx.stroke();
    } else if (this.failAnim > 0) {
      // 슬픈 표정
      ctx.strokeStyle = '#222'; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.arc(cx, by - 47, 4, Math.PI, Math.PI * 2); ctx.stroke();
    }

    ctx.restore();
  }
};

// 공 오브젝트
const ball = {
  x: 0, y: 0,
  startX: 0, startY: 0,
  targetX: 0, targetY: 0,
  targetPos: POS.CENTER,
  progress: 0, // 0 → 1
  speed: 1.5,  // 초당 진행
  active: false,
  hasFake: false,
  fakeProgress: 0.4,   // 여기서 방향 바뀜
  realTargetPos: 0,
  size: 18,
  trail: [],

  reset() {
    this.active = false;
    this.progress = 0;
    this.trail = [];
  },

  launch(targetPos, diff) {
    const cfg = DIFFICULTY[diff];
    this.targetPos = targetPos;
    this.startX = CANVAS_W / 2;
    this.startY = CANVAS_H * 0.25;
    this.targetX = POS_X[targetPos];
    this.targetY = CANVAS_H - BANNER_H - CTRL_H - 30;
    this.progress = 0;
    this.active = true;
    this.speed = cfg.speed;

    // 페이크
    this.hasFake = Math.random() < cfg.fakeChance;
    if (this.hasFake) {
      this.realTargetPos = targetPos;
      const fakes = [0, 1, 2].filter(p => p !== targetPos);
      this.fakeDir = fakes[Math.floor(Math.random() * fakes.length)];
      this.fakeProgress = 0.3 + Math.random() * 0.2;
    }

    this.trail = [];
  },

  update(dt) {
    if (!this.active) return;
    this.progress = Math.min(1, this.progress + this.speed * dt);

    // 페이크 방향 전환
    let tx = this.targetX;
    let ty = this.targetY;
    if (this.hasFake && this.progress < this.fakeProgress) {
      tx = POS_X[this.fakeDir];
    }

    const t = this.progress;
    // 포물선 보간
    const sx = this.startX, sy = this.startY;
    const cpX = (sx + tx) / 2;
    const cpY = sy - CANVAS_H * 0.15;
    this.x = (1-t)*(1-t)*sx + 2*(1-t)*t*cpX + t*t*tx;
    this.y = (1-t)*(1-t)*sy + 2*(1-t)*t*cpY + t*t*ty;

    this.trail.push({ x: this.x, y: this.y });
    if (this.trail.length > 10) this.trail.shift();

    if (this.progress >= 1) {
      this.active = false;
      resolveBall();
    }
  },

  draw() {
    if (!this.active) return;

    // 잔상
    this.trail.forEach((pt, i) => {
      const alpha = (i / this.trail.length) * 0.25;
      const s = this.size * (i / this.trail.length) * 0.7;
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.fillStyle = '#fff';
      ctx.beginPath();
      ctx.arc(pt.x, pt.y, s, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    });

    // 공 회전 효과
    const spin = this.progress * Math.PI * 8;
    ctx.save();
    ctx.translate(this.x, this.y);
    ctx.rotate(spin);

    // 공 본체
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.arc(0, 0, this.size, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#222';
    ctx.lineWidth = 1;
    ctx.stroke();

    // 축구공 패턴 (단순화)
    ctx.fillStyle = '#333';
    ctx.beginPath();
    ctx.arc(0, 0, this.size * 0.35, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = '#555';
    ctx.lineWidth = 1;
    [0, 1, 2, 3, 4].forEach(i => {
      const a = (Math.PI * 2 / 5) * i;
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(Math.cos(a) * this.size * 0.75, Math.sin(a) * this.size * 0.75);
      ctx.stroke();
    });

    ctx.restore();

    // 그림자
    const shadowY = this.targetY + 6;
    const shadowScale = 0.3 + 0.7 * this.progress;
    ctx.fillStyle = `rgba(0,0,0,${0.1 + 0.15 * this.progress})`;
    ctx.beginPath();
    ctx.ellipse(this.targetX, shadowY, this.size * shadowScale * 1.2, this.size * shadowScale * 0.4, 0, 0, Math.PI * 2);
    ctx.fill();
  }
};

// 타이머
let readyTimer = 0;
let readyDuration = 2.0;
let shotTimer = 0;
let shotDuration = 0;
let resultTimer = 0;
let lastShotPos = POS.CENTER;

// 연출 파티클
let particles = [];
function spawnParticles(x, y, type) {
  const emojis = type === 'save' ? ['⭐','✨','💫','🎉'] : ['😢','❌','💔'];
  for (let i = 0; i < 6; i++) {
    const angle = (Math.PI * 2 / 6) * i + Math.random() * 0.5;
    particles.push({
      x, y,
      vx: Math.cos(angle) * (60 + Math.random() * 60),
      vy: Math.sin(angle) * (60 + Math.random() * 60) - 60,
      life: 1.0, maxLife: 1.0,
      emoji: emojis[Math.floor(Math.random() * emojis.length)],
      size: 16 + Math.random() * 12
    });
  }
}

// ---- 게임 로직 ----
function startGame() {
  state = State.READY;
  saved = 0; goals = 0; streak = 0; round = 0;
  canRevive = true;
  keeper.reset();
  ball.reset();
  particles = [];

  document.getElementById('startScreen').style.display = 'none';
  document.getElementById('gameOverScreen').classList.remove('show');
  document.getElementById('controls').classList.add('active');

  updateHUD();
  prepareNextShot();
}

function prepareNextShot() {
  state = State.READY;
  round++;
  ball.reset();
  readyTimer = readyDuration;
  shotDuration = DIFFICULTY[selectedDifficulty].timeLimit;
  shotTimer = shotDuration;

  // 자동으로 슛
  const delay = readyDuration * 1000;
  setTimeout(() => {
    if (state === State.READY) launchBall();
  }, delay);
}

function launchBall() {
  if (state !== State.READY) return;
  state = State.BALL_FLYING;
  lastShotPos = Math.floor(Math.random() * 3);
  ball.launch(lastShotPos, selectedDifficulty);
}

function resolveBall() {
  const saved_it = keeper.pos === lastShotPos;

  if (saved_it) {
    saved++;
    streak++;
    keeper.catchAnim = 0.8;
    keeper.diving = true;
    keeper.diveDir = lastShotPos === POS.LEFT ? -1 : lastShotPos === POS.RIGHT ? 1 : 0;
    keeper.diveTimer = 0.5;
    spawnParticles(POS_X[lastShotPos], keeper.y + 20, 'save');
    vibrate([80]);
    if (streak > bestStreak) {
      bestStreak = streak;
      localStorage.setItem('sk_best_streak', bestStreak);
    }
  } else {
    goals++;
    streak = 0;
    keeper.failAnim = 0.8;
    spawnParticles(POS_X[lastShotPos], keeper.y + 20, 'goal');
    vibrate([200, 50, 200]);
  }

  state = State.RESULT;
  resultTimer = 1.2;
  updateHUD();

  setTimeout(() => {
    if (goals >= 3) {
      showGameOver();
    } else {
      prepareNextShot();
    }
  }, 1200);
}

function showGameOver() {
  state = State.DEAD;
  totalSaved += saved;
  localStorage.setItem('sk_total', totalSaved);

  const screen = document.getElementById('gameOverScreen');
  screen.classList.add('show');
  document.getElementById('goSaved').textContent = `${saved}개`;
  document.getElementById('goGoals').textContent = `${goals}개`;
  document.getElementById('goStreak').textContent = `${streak > 0 ? streak : bestStreak}연속`;
  document.getElementById('goBest').textContent = `${bestStreak}연속`;
  const rb = document.getElementById('reviveBtn');
  rb.classList.toggle('used', !canRevive);
  rb.textContent = canRevive ? '📺 광고 보고 부활하기' : '(부활 소진)';
}

function revive() {
  if (!canRevive) return;
  canRevive = false;
  document.getElementById('gameOverScreen').classList.remove('show');
  showRewardedAd(() => {
    state = State.READY;
    goals = Math.max(0, goals - 1);
    updateHUD();
    prepareNextShot();
  });
}

function retryGame() {
  showSaveDialog(saved, (name) => {
    if (name) {
      saveLeaderboard(name, saved, streak);
      showToast(`${name}님의 기록이 저장됐어요!`);
    }
    setTimeout(startGame, name ? 2500 : 0);
  });
}

// ---- 입력 ----
document.addEventListener('keydown', e => {
  if (state !== State.READY && state !== State.BALL_FLYING) return;
  if (e.code === 'ArrowLeft') keeper.moveTo(keeper.pos - 1);
  if (e.code === 'ArrowRight') keeper.moveTo(keeper.pos + 1);
  if (e.code === 'KeyA' || e.code === 'KeyQ') keeper.moveTo(POS.LEFT);
  if (e.code === 'KeyS' || e.code === 'KeyW') keeper.moveTo(POS.CENTER);
  if (e.code === 'KeyD' || e.code === 'KeyE') keeper.moveTo(POS.RIGHT);
});

document.getElementById('btnLeft').addEventListener('click', () => keeper.moveTo(keeper.pos - 1));
document.getElementById('btnRight').addEventListener('click', () => keeper.moveTo(keeper.pos + 1));
document.getElementById('btnJump').addEventListener('click', () => {
  // 점프 = 현재 위치 고수 (확인)
  vibrate([30]);
});

// 터치 스와이프
let touchStartX2 = 0;
canvas.addEventListener('touchstart', e => { touchStartX2 = e.touches[0].clientX; });
canvas.addEventListener('touchend', e => {
  const dx = e.changedTouches[0].clientX - touchStartX2;
  if (Math.abs(dx) > 30) {
    keeper.moveTo(dx < 0 ? keeper.pos - 1 : keeper.pos + 1);
  }
});

// ---- 렌더링 ----
function drawField() {
  // 그라운드 그라디언트
  const grad = ctx.createLinearGradient(0, 0, 0, CANVAS_H);
  grad.addColorStop(0, '#1a5c1a');
  grad.addColorStop(0.4, '#27821a');
  grad.addColorStop(0.7, '#1e6b1e');
  grad.addColorStop(1, '#145a14');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);

  // 잔디 줄무늬
  for (let i = 0; i < 8; i++) {
    if (i % 2 === 0) {
      ctx.fillStyle = 'rgba(0,0,0,0.05)';
      ctx.fillRect(0, CANVAS_H * i / 8, CANVAS_W, CANVAS_H / 8);
    }
  }

  // 골문 (뒤쪽, 위)
  const gw = CANVAS_W * 0.6;
  const gx = (CANVAS_W - gw) / 2;
  const gy = 60;
  const gh = CANVAS_H * 0.22;

  // 골대 배경 (그물)
  ctx.fillStyle = 'rgba(255,255,255,0.05)';
  ctx.fillRect(gx, gy, gw, gh);

  // 그물 패턴
  ctx.strokeStyle = 'rgba(255,255,255,0.12)';
  ctx.lineWidth = 1;
  for (let x = gx; x <= gx + gw; x += 20) {
    ctx.beginPath(); ctx.moveTo(x, gy); ctx.lineTo(x, gy + gh); ctx.stroke();
  }
  for (let y = gy; y <= gy + gh; y += 15) {
    ctx.beginPath(); ctx.moveTo(gx, y); ctx.lineTo(gx + gw, y); ctx.stroke();
  }

  // 골대 프레임
  ctx.strokeStyle = '#fff';
  ctx.lineWidth = 5;
  ctx.lineCap = 'square';
  ctx.beginPath();
  ctx.moveTo(gx, gy + gh);
  ctx.lineTo(gx, gy);
  ctx.lineTo(gx + gw, gy);
  ctx.lineTo(gx + gw, gy + gh);
  ctx.stroke();

  // 지시 표시선 (3개 포지션)
  const groundY = CANVAS_H - BANNER_H - CTRL_H - 15;
  POS_X.forEach((px, i) => {
    const isKeeperHere = keeper.pos === i;
    ctx.fillStyle = isKeeperHere ? 'rgba(255,255,255,0.3)' : 'rgba(255,255,255,0.1)';
    ctx.beginPath();
    ctx.ellipse(px, groundY, 28, 10, 0, 0, Math.PI * 2);
    ctx.fill();
  });

  // 페널티 박스 라인
  const pbW = CANVAS_W * 0.7;
  const pbX = (CANVAS_W - pbW) / 2;
  const pbY = CANVAS_H - BANNER_H - CTRL_H - 90;
  ctx.strokeStyle = 'rgba(255,255,255,0.3)';
  ctx.lineWidth = 2;
  ctx.setLineDash([]);
  ctx.strokeRect(pbX, pbY, pbW, 80);

  // 페널티 스팟
  ctx.fillStyle = 'rgba(255,255,255,0.4)';
  ctx.beginPath();
  ctx.arc(CANVAS_W / 2, CANVAS_H * 0.3, 4, 0, Math.PI * 2);
  ctx.fill();
}

function drawHudOnCanvas() {
  // 진행 바 (라운드)
  const barW = CANVAS_W * 0.5;
  const barX = (CANVAS_W - barW) / 2;
  const barY = CANVAS_H * 0.5 - 10;

  if (state === State.READY) {
    // 카운트다운
    ctx.fillStyle = 'rgba(0,0,0,0.5)';
    ctx.beginPath();
    ctx.roundRect(CANVAS_W / 2 - 70, CANVAS_H * 0.45 - 20, 140, 44, 22);
    ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 18px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const remaining = Math.ceil(readyTimer);
    ctx.fillText(`⚽ 슛 준비... ${remaining}`, CANVAS_W / 2, CANVAS_H * 0.45 + 2);
  }

  if (state === State.RESULT) {
    const saved_it = keeper.catchAnim > 0;
    ctx.fillStyle = saved_it ? 'rgba(39,174,96,0.85)' : 'rgba(231,76,60,0.85)';
    ctx.beginPath();
    ctx.roundRect(CANVAS_W / 2 - 80, CANVAS_H * 0.45 - 25, 160, 50, 25);
    ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 22px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(saved_it ? '✅ SAVE!' : '❌ GOAL!', CANVAS_W / 2, CANVAS_H * 0.45);
  }

  // 포지션 힌트 화살표
  if (state === State.BALL_FLYING || state === State.READY) {
    const kpy = CANVAS_H - BANNER_H - CTRL_H - 105;
    ctx.fillStyle = 'rgba(255,255,255,0.5)';
    ctx.font = '13px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    POS_X.forEach((px, i) => {
      ctx.fillText(POS_NAMES[i], px, kpy);
    });
  }
}

function drawParticles() {
  particles.forEach(p => {
    ctx.save();
    ctx.globalAlpha = p.life / p.maxLife;
    ctx.font = `${p.size}px serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(p.emoji, p.x, p.y);
    ctx.restore();
  });
}

// ---- 메인 루프 ----
function loop(timestamp) {
  const dt = Math.min((timestamp - lastTime) / 1000, 0.05);
  lastTime = timestamp;

  if (state === State.PLAYING || state === State.READY || state === State.BALL_FLYING || state === State.RESULT) {
    if (state === State.READY) readyTimer = Math.max(0, readyTimer - dt);
    ball.update(dt);
    keeper.update(dt);
    particles.forEach(p => {
      p.x += p.vx * dt; p.y += p.vy * dt;
      p.vy += 300 * dt;
      p.life -= dt * 1.2;
    });
    particles = particles.filter(p => p.life > 0);
  }

  // 그리기
  drawField();
  ball.draw();
  keeper.draw();
  drawParticles();
  drawHudOnCanvas();

  animId = requestAnimationFrame(loop);
}

// ---- 광고 시스템 ----
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
      <button class="ad-skip-btn" id="adBtn" disabled>광고 시청 후 부활 (5)</button>
    </div>`;
  document.body.appendChild(overlay);
  let count = 5;
  const btn = overlay.querySelector('#adBtn');
  const counter = overlay.querySelector('#adCount');
  const fill = overlay.querySelector('#adFill');
  const t = setInterval(() => {
    count--;
    counter.textContent = count;
    fill.style.width = `${((5 - count) / 5) * 100}%`;
    if (count <= 0) { clearInterval(t); btn.disabled = false; btn.textContent = '부활하기! 🔄'; btn.classList.add('ready'); }
    else btn.textContent = `광고 시청 후 부활 (${count})`;
  }, 1000);
  btn.addEventListener('click', () => { if (!btn.disabled) { overlay.remove(); onComplete?.(); } });
}

// ---- 랭킹 / 저장 ----
const LB_KEY = 'lb_soccer_keeper';
function saveLeaderboard(name, score, streak) {
  const all = JSON.parse(localStorage.getItem(LB_KEY) || '[]');
  all.push({ name, score, streak, date: new Date().toLocaleDateString('ko-KR') });
  all.sort((a, b) => b.score - a.score);
  localStorage.setItem(LB_KEY, JSON.stringify(all.slice(0, 10)));
}
function getLeaderboard() {
  return JSON.parse(localStorage.getItem(LB_KEY) || '[]');
}
function showLeaderboard(currentScore) {
  const scores = getLeaderboard();
  const rows = scores.length === 0
    ? '<tr><td colspan="3" style="text-align:center;color:#999;padding:20px">기록 없음</td></tr>'
    : scores.map((s, i) => `
        <tr class="${s.score === currentScore ? 'highlight' : ''}">
          <td>${['🥇','🥈','🥉'][i] || i+1}</td>
          <td>${s.name}</td>
          <td>${s.score}개 방어</td>
        </tr>`).join('');
  const modal = document.createElement('div');
  modal.className = 'modal-overlay';
  modal.innerHTML = `
    <div class="modal-box leaderboard-modal">
      <h2>🏆 랭킹</h2>
      <table class="lb-table">
        <thead><tr><th>순위</th><th>이름</th><th>기록</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
      <button class="btn-primary" onclick="this.closest('.modal-overlay').remove()">닫기</button>
    </div>`;
  document.body.appendChild(modal);
}

function showSaveDialog(score, onDone) {
  const modal = document.createElement('div');
  modal.className = 'modal-overlay';
  modal.innerHTML = `
    <div class="modal-box">
      <h2>⚽ 게임 종료</h2>
      <p class="final-score">막은 수: <strong>${score}개</strong></p>
      <p style="color:#666;font-size:14px">랭킹에 등록할까요?</p>
      <input type="text" id="nameInput" placeholder="닉네임" maxlength="10" class="name-input"/>
      <div class="modal-buttons">
        <button class="btn-primary" id="saveBtn">등록</button>
        <button class="btn-secondary" id="skipBtn">종료</button>
      </div>
    </div>`;
  document.body.appendChild(modal);
  const inp = modal.querySelector('#nameInput');
  inp.focus();
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

function vibrate(p = [50]) { navigator.vibrate?.(p); }

// ---- HUD 업데이트 ----
function updateHUD() {
  document.getElementById('savedCount').textContent = saved;
  document.getElementById('goalCount').textContent = goals;
  document.getElementById('streakCount').textContent = streak;
}

// ---- 이벤트 바인딩 ----
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
  showLeaderboard(saved);
});

// 난이도 버튼
document.querySelectorAll('.diff-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.diff-btn').forEach(b => b.classList.remove('selected'));
    btn.classList.add('selected');
    selectedDifficulty = btn.dataset.diff;
  });
});

// 배너 광고
document.getElementById('bannerAd').innerHTML = `
  <div class="banner-ad">
    <span class="ad-badge">AD</span>
    <span>배너 광고 영역 (실제 광고로 교체하세요)</span>
  </div>`;

// 게임 루프 시작
lastTime = performance.now();
animId = requestAnimationFrame(loop);
