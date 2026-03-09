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
const BALL_SPAWN_Y = 90;   // 골문 안쪽에서 출발

// ── 난이도 ──
const DIFFICULTY = {
  easy:   { ballSpeed: 170, spawnMin: 1.4, spawnMax: 2.0 },
  normal: { ballSpeed: 260, spawnMin: 0.9, spawnMax: 1.4 },
  hard:   { ballSpeed: 370, spawnMin: 0.6, spawnMax: 1.0 },
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
let laneFlash     = [0, 0, 0];   // 잔상 타이머
let laneFlashType = ['', '', '']; // 'save' | 'goal'

// ── 키퍼 ──
const keeper = {
  lane:    1,                        // 0=L 1=C 2=R
  x:       LANE_X[1],
  targetX: LANE_X[1],
  y:       CANVAS_H - BANNER_H - CTRL_H - 70,
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

  // dir: -1 (왼쪽) / +1 (오른쪽)
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
    this.x += (this.targetX - this.x) * Math.min(1, 18 * dt);
    if (this.catchAnim > 0) this.catchAnim -= dt;
    if (this.failAnim  > 0) this.failAnim  -= dt;
    if (this.diving) {
      this.diveTimer -= dt;
      if (this.diveTimer <= 0) this.diving = false;
    }
    this.y = CANVAS_H - BANNER_H - CTRL_H - 70;
  },

  draw() {
    ctx.save();
    const cx = this.x;
    const by = this.y + 80;  // 발 위치

    // 그림자
    ctx.fillStyle = 'rgba(0,0,0,0.2)';
    ctx.beginPath();
    ctx.ellipse(cx, CANVAS_H - BANNER_H - CTRL_H - 12, 22, 6, 0, 0, Math.PI * 2);
    ctx.fill();

    // 다이빙 기울기 (토르소 중심 피벗)
    const angle = this.diving ? this.diveDir * 0.35 : 0;
    if (angle) {
      ctx.translate(cx, by - 40);
      ctx.rotate(angle);
      ctx.translate(-cx, -(by - 40));
    }

    const baseCol  = this.catchAnim > 0 ? '#2ecc71' : this.failAnim > 0 ? '#e74c3c' : '#27ae60';
    const gloveCol = this.catchAnim > 0 ? '#58d68d' : '#f1c40f';

    // 몸통
    ctx.fillStyle = baseCol;
    ctx.beginPath(); ctx.roundRect(cx - 14, by - 42, 28, 32, 4); ctx.fill();
    ctx.fillStyle = 'rgba(0,0,0,0.12)';
    ctx.fillRect(cx - 4, by - 42, 8, 32);

    // 왼팔
    if (this.diving && this.diveDir < 0) {
      ctx.fillStyle = gloveCol;
      ctx.beginPath(); ctx.roundRect(cx - 40, by - 50, 24, 15, 6); ctx.fill();
    } else {
      ctx.fillStyle = baseCol;
      ctx.beginPath(); ctx.roundRect(cx - 24, by - 40, 10, 22, 4); ctx.fill();
      ctx.fillStyle = gloveCol;
      ctx.beginPath(); ctx.roundRect(cx - 26, by - 22, 14, 12, 4); ctx.fill();
    }

    // 오른팔
    if (this.diving && this.diveDir > 0) {
      ctx.fillStyle = gloveCol;
      ctx.beginPath(); ctx.roundRect(cx + 16, by - 50, 24, 15, 6); ctx.fill();
    } else {
      ctx.fillStyle = baseCol;
      ctx.beginPath(); ctx.roundRect(cx + 14, by - 40, 10, 22, 4); ctx.fill();
      ctx.fillStyle = gloveCol;
      ctx.beginPath(); ctx.roundRect(cx + 12, by - 22, 14, 12, 4); ctx.fill();
    }

    // 다리
    ctx.fillStyle = '#1e8449';
    const ls = this.diving ? Math.abs(this.diveDir) * 6 : 0;
    ctx.beginPath(); ctx.roundRect(cx - 14 - ls, by - 10, 12, 20, 3); ctx.fill();
    ctx.beginPath(); ctx.roundRect(cx +  2 + ls, by - 10, 12, 20, 3); ctx.fill();

    // 신발
    ctx.fillStyle = '#222';
    ctx.beginPath(); ctx.roundRect(cx - 16 - ls, by + 8, 14, 8, 3); ctx.fill();
    ctx.beginPath(); ctx.roundRect(cx +  2 + ls, by + 8, 14, 8, 3); ctx.fill();

    // 머리
    ctx.fillStyle = '#f5cba7';
    ctx.beginPath(); ctx.arc(cx, by - 52, 16, 0, Math.PI * 2); ctx.fill();

    // 캡
    ctx.fillStyle = baseCol;
    ctx.beginPath(); ctx.arc(cx, by - 60, 12, Math.PI, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.roundRect(cx - 16, by - 61, 32, 5, 2); ctx.fill();

    // 눈
    ctx.fillStyle = '#222';
    ctx.beginPath(); ctx.arc(cx - 5, by - 53, 2.5, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(cx + 5, by - 53, 2.5, 0, Math.PI * 2); ctx.fill();

    // 표정
    ctx.strokeStyle = '#222'; ctx.lineWidth = 1.5;
    if (this.catchAnim > 0) {
      ctx.beginPath(); ctx.arc(cx, by - 50, 4, 0, Math.PI); ctx.stroke();
    } else if (this.failAnim > 0) {
      ctx.beginPath(); ctx.arc(cx, by - 47, 4, Math.PI, Math.PI * 2); ctx.stroke();
    }

    ctx.restore();
  }
};

// ── 공 ──
let balls = [];

function spawnBallInLane(lane) {
  const cfg       = DIFFICULTY[selectedDifficulty];
  const speedMult = 1 + Math.min(gameTime / 90, 0.4);  // 최대 40% 가속
  balls.push({
    lane,
    x:        LANE_X[lane],
    y:        BALL_SPAWN_Y,
    vy:       cfg.ballSpeed * speedMult,
    size:     18,
    spin:     Math.random() * Math.PI * 2,
    spinRate: (Math.random() < 0.5 ? 1 : -1) * (5 + Math.random() * 8),
    trail:    [],
  });
}

function trySpawnBalls() {
  const lane1 = Math.floor(Math.random() * 3);
  spawnBallInLane(lane1);

  // Hard 모드: 15% 확률로 다른 레인에 동시 공 추가
  if (selectedDifficulty === 'hard' && Math.random() < 0.15) {
    const others = [0, 1, 2].filter(l => l !== lane1);
    spawnBallInLane(others[Math.floor(Math.random() * 2)]);
  }
}

function nextSpawnInterval() {
  const cfg   = DIFFICULTY[selectedDifficulty];
  const scale = Math.max(0.65, 1 - gameTime / 120);  // 2분에 걸쳐 최대 35% 단축
  const lo    = cfg.spawnMin * scale;
  const hi    = cfg.spawnMax * scale;
  return lo + Math.random() * (hi - lo);
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
  spawnTimer = 0.8;   // 첫 공은 0.8초 후
  canRevive  = true;
  balls      = [];
  laneFlash  = [0, 0, 0];
  laneFlashType = ['', '', ''];
  keeper.reset();
  particles = [];

  document.getElementById('startScreen').style.display = 'none';
  document.getElementById('gameOverScreen').classList.remove('show');
  document.getElementById('controls').classList.add('active');
  updateHUD();
}

// ── 공 업데이트 & 판정 ──
function updateBalls(dt) {
  const hitY = keeper.y + 20;  // 키퍼 손 높이
  for (let i = balls.length - 1; i >= 0; i--) {
    const b = balls[i];
    b.y    += b.vy * dt;
    b.spin += b.spinRate * dt;
    b.trail.push({ x: b.x, y: b.y });
    if (b.trail.length > 10) b.trail.shift();

    if (b.y >= hitY) {
      if (keeper.lane === b.lane) {
        // ✅ 방어!
        saved++;
        streak++;
        keeper.catchAnim = 0.6;
        keeper.diving  = true;
        keeper.diveDir = b.lane === 0 ? -1 : b.lane === 2 ? 1 : 0;
        keeper.diveTimer = 0.45;
        laneFlash[b.lane]     = 0.5;
        laneFlashType[b.lane] = 'save';
        spawnParticles(b.x, hitY, 'save');
        vibrate([80]);
        if (streak > bestStreak) {
          bestStreak = streak;
          localStorage.setItem('sk_best_streak', bestStreak);
        }
      } else {
        // ❌ 실점!
        goals++;
        streak = 0;
        keeper.failAnim = 0.6;
        laneFlash[b.lane]     = 0.5;
        laneFlashType[b.lane] = 'goal';
        spawnParticles(b.x, hitY, 'goal');
        vibrate([200, 50, 200]);
      }

      balls.splice(i, 1);
      updateHUD();

      if (goals >= 3 && state === State.PLAYING) {
        state = State.DEAD;
        showGameOver();
        return;
      }
    } else if (b.y > CANVAS_H + 50) {
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
    if (i % 2 === 0) {
      ctx.fillStyle = 'rgba(0,0,0,0.04)';
      ctx.fillRect(0, CANVAS_H * i / 8, CANVAS_W, CANVAS_H / 8);
    }
  }

  // 골문
  const gw = CANVAS_W * 0.6;
  const gx = (CANVAS_W - gw) / 2;
  const gy = 60;
  const gh = CANVAS_H * 0.22;

  ctx.fillStyle = 'rgba(255,255,255,0.05)';
  ctx.fillRect(gx, gy, gw, gh);

  // 그물
  ctx.strokeStyle = 'rgba(255,255,255,0.1)';
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
  ctx.moveTo(gx, gy + gh); ctx.lineTo(gx, gy); ctx.lineTo(gx + gw, gy); ctx.lineTo(gx + gw, gy + gh);
  ctx.stroke();

  // 레인 구분 점선
  const lineTop = gy + gh;
  const lineBot = keeper.y;
  ctx.strokeStyle = 'rgba(255,255,255,0.15)';
  ctx.lineWidth = 1;
  ctx.setLineDash([6, 8]);
  const div1 = (LANE_X[0] + LANE_X[1]) / 2;
  const div2 = (LANE_X[1] + LANE_X[2]) / 2;
  ctx.beginPath(); ctx.moveTo(div1, lineTop); ctx.lineTo(div1, lineBot); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(div2, lineTop); ctx.lineTo(div2, lineBot); ctx.stroke();
  ctx.setLineDash([]);

  // 히트존 (키퍼 발 밑 원)
  const hzy = lineBot + 22;
  LANE_X.forEach((lx, i) => {
    const active = state === State.PLAYING && keeper.lane === i;
    const flash  = laneFlash[i] > 0;
    const type   = laneFlashType[i];

    // 플래시 링
    if (flash) {
      const fa = Math.min(1, laneFlash[i] * 2.5);
      ctx.fillStyle   = type === 'save' ? `rgba(46,204,113,${fa * 0.5})` : `rgba(231,76,60,${fa * 0.5})`;
      ctx.beginPath(); ctx.ellipse(lx, hzy, 40, 16, 0, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = type === 'save' ? `rgba(46,204,113,${fa})` : `rgba(231,76,60,${fa})`;
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.ellipse(lx, hzy, 40, 16, 0, 0, Math.PI * 2); ctx.stroke();
    }

    // 기본 원
    ctx.fillStyle = active ? 'rgba(255,255,255,0.4)' : 'rgba(255,255,255,0.12)';
    ctx.beginPath(); ctx.ellipse(lx, hzy, 28, 10, 0, 0, Math.PI * 2); ctx.fill();
  });

  // 페널티 박스
  const pbW = CANVAS_W * 0.7;
  const pbX = (CANVAS_W - pbW) / 2;
  const pbY = CANVAS_H - BANNER_H - CTRL_H - 95;
  ctx.strokeStyle = 'rgba(255,255,255,0.2)';
  ctx.lineWidth = 1.5;
  ctx.strokeRect(pbX, pbY, pbW, 80);

  // 페널티 스팟
  ctx.fillStyle = 'rgba(255,255,255,0.35)';
  ctx.beginPath(); ctx.arc(CANVAS_W / 2, CANVAS_H * 0.3, 4, 0, Math.PI * 2); ctx.fill();
}

// ── 그리기: 공 ──
function drawBalls() {
  balls.forEach(b => {
    // 잔상
    b.trail.forEach((pt, i) => {
      const a = (i / b.trail.length) * 0.2;
      const s = b.size * (i / b.trail.length) * 0.6;
      ctx.save(); ctx.globalAlpha = a;
      ctx.fillStyle = '#fff';
      ctx.beginPath(); ctx.arc(pt.x, pt.y, s, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
    });

    // 그림자 (키퍼 앞에 점점 선명하게)
    const gY = keeper.y + 30;
    const sp = Math.max(0, Math.min(1, (b.y - BALL_SPAWN_Y) / (gY - BALL_SPAWN_Y)));
    ctx.fillStyle = `rgba(0,0,0,${0.06 + 0.14 * sp})`;
    ctx.beginPath();
    ctx.ellipse(b.x, gY + 4, b.size * sp * 1.2, b.size * sp * 0.4, 0, 0, Math.PI * 2);
    ctx.fill();

    // 공 본체
    ctx.save();
    ctx.translate(b.x, b.y);
    ctx.rotate(b.spin);

    ctx.fillStyle = '#fff';
    ctx.beginPath(); ctx.arc(0, 0, b.size, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = '#222'; ctx.lineWidth = 1; ctx.stroke();

    // 축구공 패턴
    ctx.fillStyle = '#333';
    ctx.beginPath(); ctx.arc(0, 0, b.size * 0.35, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = '#555'; ctx.lineWidth = 1;
    for (let k = 0; k < 5; k++) {
      const a = (Math.PI * 2 / 5) * k;
      ctx.beginPath(); ctx.moveTo(0, 0);
      ctx.lineTo(Math.cos(a) * b.size * 0.75, Math.sin(a) * b.size * 0.75);
      ctx.stroke();
    }
    ctx.restore();
  });
}

// ── 그리기: 캔버스 HUD ──
function drawHudOnCanvas() {
  if (state !== State.PLAYING) return;

  // 레인 번호 표시
  ctx.font = 'bold 11px sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const labelY = BALL_SPAWN_Y - 18;
  LANE_X.forEach((lx, i) => {
    ctx.fillStyle = keeper.lane === i ? 'rgba(255,255,255,0.95)' : 'rgba(255,255,255,0.3)';
    ctx.fillText(['①', '②', '③'][i], lx, labelY);
  });

  // SAVE / GOAL 플래시 텍스트
  const sc = keeper.catchAnim;
  const fc = keeper.failAnim;
  if (sc > 0 || fc > 0) {
    const alpha = Math.max(sc, fc);
    ctx.fillStyle = sc > 0 ? `rgba(46,204,113,${alpha * 0.9})` : `rgba(231,76,60,${alpha * 0.9})`;
    ctx.beginPath();
    ctx.roundRect(CANVAS_W / 2 - 72, CANVAS_H * 0.42 - 22, 144, 44, 22);
    ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 20px sans-serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(sc > 0 ? '✅ SAVE!' : '❌ GOAL!', CANVAS_W / 2, CANVAS_H * 0.42);
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

  drawField();
  drawBalls();
  keeper.draw();
  drawParticles();
  drawHudOnCanvas();

  animId = requestAnimationFrame(loop);
}

// ── 입력: 키보드 ──
document.addEventListener('keydown', e => {
  if (e.code === 'ArrowLeft'  || e.code === 'KeyA') keeper.shift(-1);
  if (e.code === 'ArrowRight' || e.code === 'KeyD') keeper.shift(+1);
});

// ── 입력: 버튼 (touchstart으로 즉시 반응) ──
['touchstart', 'mousedown'].forEach(ev => {
  document.getElementById('btnLeft').addEventListener(ev, e => {
    e.preventDefault(); keeper.shift(-1);
  }, { passive: false });
  document.getElementById('btnRight').addEventListener(ev, e => {
    e.preventDefault(); keeper.shift(+1);
  }, { passive: false });
});

// ── 입력: 스와이프 ──
let swipeStartX = 0;
canvas.addEventListener('touchstart', e => { swipeStartX = e.touches[0].clientX; }, { passive: true });
canvas.addEventListener('touchend',   e => {
  const dx = e.changedTouches[0].clientX - swipeStartX;
  if (Math.abs(dx) > 30) keeper.shift(dx < 0 ? -1 : 1);
});

// ── HUD 업데이트 ──
function updateHUD() {
  document.getElementById('savedCount').textContent  = saved;
  document.getElementById('goalCount').textContent   = goals;
  document.getElementById('streakCount').textContent = streak;
}

// ── 게임오버 화면 ──
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

// ── 부활 ──
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

// ── 다시 시작 ──
function retryGame() {
  showSaveDialog(saved, name => {
    if (name) {
      saveLeaderboard(name, saved, bestStreak);
      showToast(`${name}님의 기록이 저장됐어요!`);
    }
    setTimeout(startGame, name ? 2500 : 0);
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
      <button class="ad-skip-btn" id="adBtn" disabled>광고 시청 후 부활 (5)</button>
    </div>`;
  document.body.appendChild(overlay);
  let count = 5;
  const btn   = overlay.querySelector('#adBtn');
  const cntEl = overlay.querySelector('#adCount');
  const fill  = overlay.querySelector('#adFill');
  const t = setInterval(() => {
    count--;
    cntEl.textContent = count;
    fill.style.width  = `${((5 - count) / 5) * 100}%`;
    if (count <= 0) {
      clearInterval(t);
      btn.disabled    = false;
      btn.textContent = '부활하기! 🔄';
      btn.classList.add('ready');
    } else {
      btn.textContent = `광고 시청 후 부활 (${count})`;
    }
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
function showLeaderboard(currentScore) {
  const scores = getLeaderboard();
  const rows   = scores.length === 0
    ? '<tr><td colspan="3" style="text-align:center;color:#999;padding:20px">기록 없음</td></tr>'
    : scores.map((s, i) => `
        <tr class="${s.score === currentScore ? 'highlight' : ''}">
          <td>${['🥇','🥈','🥉'][i] || i + 1}</td>
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
        <button class="btn-primary"   id="saveBtn">등록</button>
        <button class="btn-secondary" id="skipBtn">종료</button>
      </div>
    </div>`;
  document.body.appendChild(modal);
  const inp  = modal.querySelector('#nameInput');
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

// ── 이벤트 바인딩 ──
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
animId   = requestAnimationFrame(loop);
