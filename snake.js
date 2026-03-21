(() => {
  'use strict';

  const canvas = document.getElementById('game');
  const scoreEl = document.getElementById('score');
  const bestEl = document.getElementById('best');
  const speedEl = document.getElementById('speed');
  const overlay = document.getElementById('overlay');
  const btnStart = document.getElementById('btnStart');

  const COLS = 20;
  const ROWS = 20;
  const CELL = 20; // used as "grid pixels" before DPR scaling
  const GRID_W = COLS * CELL;
  const GRID_H = ROWS * CELL;

  // Step interval in ms; we will accelerate as score increases.
  const BASE_STEP_MS = 140;
  const MIN_STEP_MS = 70;

  const DIRS = {
    ArrowUp: { x: 0, y: -1 },
    ArrowDown: { x: 0, y: 1 },
    ArrowLeft: { x: -1, y: 0 },
    ArrowRight: { x: 1, y: 0 },
    w: { x: 0, y: -1 },
    s: { x: 0, y: 1 },
    a: { x: -1, y: 0 },
    d: { x: 1, y: 0 },
  };

  const state = {
    status: 'idle', // 'idle' | 'playing' | 'paused' | 'gameover'
    snake: [],
    dir: { x: 1, y: 0 },
    nextDir: { x: 1, y: 0 },
    food: { x: 10, y: 10 },
    score: 0,
    best: 0,
    stepMs: BASE_STEP_MS,
    accMs: 0,
    lastTs: 0,
    rafId: 0,
    touch: {
      active: false,
      startX: 0,
      startY: 0,
    },
  };

  function loadBest() {
    const v = Number(localStorage.getItem('snake_best') || '0');
    state.best = Number.isFinite(v) ? v : 0;
    bestEl.textContent = String(state.best);
  }

  function setOverlayVisible(visible) {
    overlay.style.display = visible ? 'flex' : 'none';
  }

  function setStatus(status) {
    state.status = status;
    // Avoid dt "backlog" after switching states.
    if (status === 'paused' || status === 'idle' || status === 'gameover') {
      state.accMs = 0;
      state.lastTs = 0;
    }
    if (status === 'idle') {
      btnStart.textContent = '开始游戏';
      setOverlayVisible(true);
      document.getElementById('overlay-title').textContent = '贪吃蛇';
      document.getElementById('overlay-text').textContent = '使用方向键或 WASD 操作，吃到红色食物得分。';
    } else if (status === 'gameover') {
      btnStart.textContent = '再来一局';
      setOverlayVisible(true);
      document.getElementById('overlay-title').textContent = '游戏结束';
      document.getElementById('overlay-text').textContent = '按 Enter 或点击按钮重新开始。';
    } else {
      setOverlayVisible(false);
    }
  }

  function setScore(v) {
    state.score = v;
    scoreEl.textContent = String(state.score);

    // Speed up gradually (every 3 points).
    const accelSteps = Math.floor(state.score / 3);
    const step = BASE_STEP_MS - accelSteps * 6;
    state.stepMs = Math.max(MIN_STEP_MS, step);
    speedEl.textContent = `${Math.round(1000 / state.stepMs)}x`;
  }

  function randInt(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
  }

  function cellKey(x, y) {
    return `${x},${y}`;
  }

  function placeFood() {
    const occupied = new Set(state.snake.map((p) => cellKey(p.x, p.y)));
    for (let i = 0; i < 9999; i++) {
      const x = randInt(0, COLS - 1);
      const y = randInt(0, ROWS - 1);
      if (!occupied.has(cellKey(x, y))) {
        state.food = { x, y };
        return;
      }
    }
    // Fallback: if board is almost full, keep current.
  }

  function resetGame() {
    state.snake = [
      { x: Math.floor(COLS / 2) - 1, y: Math.floor(ROWS / 2) },
      { x: Math.floor(COLS / 2), y: Math.floor(ROWS / 2) },
      { x: Math.floor(COLS / 2) + 1, y: Math.floor(ROWS / 2) },
    ];
    state.dir = { x: 1, y: 0 };
    state.nextDir = { x: 1, y: 0 };
    setScore(0);
    state.accMs = 0;
    state.lastTs = 0;
    placeFood();
    setStatus('playing');
    // Bring focus so keyboard works after clicking.
    canvas.focus?.();
  }

  function isOppositeDir(a, b) {
    return a.x === -b.x && a.y === -b.y;
  }

  function trySetDirFromKey(key) {
    const d = DIRS[key];
    if (!d) return;
    // Prevent immediate reverse.
    if (state.status === 'playing' || state.status === 'paused') {
      if (!isOppositeDir(d, state.dir)) state.nextDir = d;
      return;
    }
    if (state.status === 'idle' && (key === 'Enter')) resetGame();
    if (state.status === 'gameover' && (key === 'Enter' || key === ' ')) resetGame();
  }

  function handleKeyDown(e) {
    const key = e.key;

    if (key === 'Escape') {
      setStatus('idle');
      return;
    }

    if (key === 'p' || key === 'P') {
      if (state.status === 'playing') setStatus('paused');
      else if (state.status === 'paused') setStatus('playing');
      return;
    }

    if (key === 'Enter') {
      if (state.status === 'idle' || state.status === 'gameover') resetGame();
      return;
    }

    if (key === ' ') {
      if (state.status === 'gameover') resetGame();
      return;
    }

    trySetDirFromKey(key);
  }

  function handleTouchStart(e) {
    if (state.status !== 'playing' && state.status !== 'paused') return;
    const t = e.touches[0];
    state.touch.active = true;
    state.touch.startX = t.clientX;
    state.touch.startY = t.clientY;
  }

  function handleTouchMove(e) {
    if (!state.touch.active) return;
    const t = e.touches[0];
    const dx = t.clientX - state.touch.startX;
    const dy = t.clientY - state.touch.startY;

    // Choose dominant axis and apply if moved enough.
    const absX = Math.abs(dx);
    const absY = Math.abs(dy);
    if (Math.max(absX, absY) < 18) return;

    let d = null;
    if (absX > absY) d = dx > 0 ? { x: 1, y: 0 } : { x: -1, y: 0 };
    else d = dy > 0 ? { x: 0, y: 1 } : { x: 0, y: -1 };

    if (state.status === 'playing' || state.status === 'paused') {
      if (!isOppositeDir(d, state.dir)) state.nextDir = d;
      // Reset start to avoid repeated flips.
      state.touch.startX = t.clientX;
      state.touch.startY = t.clientY;
    }
  }

  function handleTouchEnd() {
    state.touch.active = false;
  }

  function resizeCanvas() {
    const dpr = Math.max(1, Math.min(2, window.devicePixelRatio || 1));
    canvas.width = GRID_W * dpr;
    canvas.height = GRID_H * dpr;
    const ctx = canvas.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  function drawGrid(ctx) {
    // Dark grid to help orientation.
    ctx.save();
    ctx.globalAlpha = 0.55;
    ctx.strokeStyle = 'rgba(255,255,255,0.06)';
    ctx.lineWidth = 1;
    for (let x = 0; x <= COLS; x++) {
      ctx.beginPath();
      ctx.moveTo(x * CELL + 0.5, 0);
      ctx.lineTo(x * CELL + 0.5, GRID_H);
      ctx.stroke();
    }
    for (let y = 0; y <= ROWS; y++) {
      ctx.beginPath();
      ctx.moveTo(0, y * CELL + 0.5);
      ctx.lineTo(GRID_W, y * CELL + 0.5);
      ctx.stroke();
    }
    ctx.restore();
  }

  function drawFood(ctx) {
    const { x, y } = state.food;
    const px = x * CELL;
    const py = y * CELL;
    const pad = 4;
    const s = CELL - pad * 2;

    // Base
    ctx.save();
    ctx.fillStyle = 'rgba(255, 60, 92, 0.95)';
    ctx.shadowColor = 'rgba(255, 60, 92, 0.5)';
    ctx.shadowBlur = 12;
    roundRect(ctx, px + pad, py + pad, s, s, 8);
    ctx.fill();

    // highlight
    ctx.shadowBlur = 0;
    ctx.fillStyle = 'rgba(255,255,255,0.25)';
    ctx.beginPath();
    ctx.arc(px + pad + s * 0.35, py + pad + s * 0.35, s * 0.15, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  function drawSnake(ctx) {
    const head = state.snake[0];
    const body = state.snake.slice(1);

    // Body
    ctx.save();
    ctx.shadowColor = 'rgba(103,232,249,0.25)';
    ctx.shadowBlur = 10;
    for (let i = 0; i < body.length; i++) {
      const seg = body[i];
      const t = i / Math.max(1, body.length - 1);
      const pad = 3;
      const px = seg.x * CELL + pad;
      const py = seg.y * CELL + pad;
      const s = CELL - pad * 2;

      ctx.fillStyle = `rgba(67, 218, 255, ${0.35 + (1 - t) * 0.45})`;
      ctx.strokeStyle = 'rgba(255,255,255,0.10)';
      roundRect(ctx, px, py, s, s, 7);
      ctx.fill();
      ctx.stroke();
    }
    ctx.restore();

    // Head
    ctx.save();
    const pad = 2;
    const px = head.x * CELL + pad;
    const py = head.y * CELL + pad;
    const s = CELL - pad * 2;

    // Gradient head
    const g = ctx.createLinearGradient(px, py, px + s, py + s);
    g.addColorStop(0, 'rgba(103,232,249,0.95)');
    g.addColorStop(1, 'rgba(167,139,250,0.95)');
    ctx.fillStyle = g;
    ctx.shadowColor = 'rgba(167,139,250,0.35)';
    ctx.shadowBlur = 18;
    roundRect(ctx, px, py, s, s, 9);
    ctx.fill();

    // Eyes based on direction
    const eyeOffset = 5;
    const eyeSize = 2.2;
    const dir = state.dir;
    let ex1 = px + s / 2 - eyeOffset;
    let ex2 = px + s / 2 + eyeOffset;
    let ey = py + s / 2;
    if (dir.x !== 0) {
      ex1 = dir.x > 0 ? px + s * 0.66 : px + s * 0.34;
      ex2 = dir.x > 0 ? px + s * 0.66 : px + s * 0.34;
      ey = py + s / 2;
      // swap to place pupils vertically
      const pupilY1 = py + s * 0.38;
      const pupilY2 = py + s * 0.62;
      drawEye(ctx, ex1, pupilY1, eyeSize, dir);
      drawEye(ctx, ex2, pupilY2, eyeSize, dir);
    } else {
      // Vertical direction
      ey = dir.y > 0 ? py + s * 0.66 : py + s * 0.34;
      const pupilX1 = px + s * 0.38;
      const pupilX2 = px + s * 0.62;
      drawEye(ctx, pupilX1, ey, eyeSize, dir);
      drawEye(ctx, pupilX2, ey, eyeSize, dir);
    }

    // Outline
    ctx.shadowBlur = 0;
    ctx.strokeStyle = 'rgba(255,255,255,0.14)';
    ctx.lineWidth = 1;
    roundRect(ctx, px, py, s, s, 9);
    ctx.stroke();
    ctx.restore();
  }

  function drawEye(ctx, x, y, r, dir) {
    // Eye shell
    ctx.save();
    ctx.fillStyle = 'rgba(6,16,24,0.62)';
    ctx.beginPath();
    ctx.arc(x, y, r + 1.3, 0, Math.PI * 2);
    ctx.fill();

    // Pupil
    const pupilShift = 1.4;
    const px = x + dir.x * pupilShift;
    const py = y + dir.y * pupilShift;
    ctx.fillStyle = 'rgba(255,255,255,0.9)';
    ctx.beginPath();
    ctx.arc(px, py, r, 0, Math.PI * 2);
    ctx.fill();

    // tiny highlight
    ctx.fillStyle = 'rgba(255,255,255,0.35)';
    ctx.beginPath();
    ctx.arc(px - 0.8, py - 0.8, r * 0.35, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  function roundRect(ctx, x, y, w, h, r) {
    const rr = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + rr, y);
    ctx.arcTo(x + w, y, x + w, y + h, rr);
    ctx.arcTo(x + w, y + h, x, y + h, rr);
    ctx.arcTo(x, y + h, x, y, rr);
    ctx.arcTo(x, y, x + w, y, rr);
    ctx.closePath();
  }

  function update() {
    state.dir = state.nextDir;
    const head = state.snake[0];
    const nx = head.x + state.dir.x;
    const ny = head.y + state.dir.y;

    // Wall collision
    if (nx < 0 || nx >= COLS || ny < 0 || ny >= ROWS) {
      finishGame();
      return;
    }

    // Self collision (handled below with "tail moving" consideration).
    const nextHeadKey = cellKey(nx, ny);

    // Move
    const newHead = { x: nx, y: ny };

    // Eating?
    const willEat = nx === state.food.x && ny === state.food.y;

    // Collision check must account for whether tail moves.
    // When not eating, the tail will be removed; so moving into the current tail cell is allowed.
    const tail = state.snake[state.snake.length - 1];
    const hitsSelf = state.snake.some((p) => cellKey(p.x, p.y) === nextHeadKey);
    if (hitsSelf) {
      const isIntoTail = tail.x === nx && tail.y === ny && !willEat;
      if (!isIntoTail) {
        finishGame();
        return;
      }
    }

    state.snake.unshift(newHead);

    if (willEat) {
      setScore(state.score + 1);
      placeFood();
    } else {
      state.snake.pop();
    }
  }

  function finishGame() {
    setStatus('gameover');
    if (state.score > state.best) {
      state.best = state.score;
      localStorage.setItem('snake_best', String(state.best));
      bestEl.textContent = String(state.best);
    }
  }

  function render() {
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, GRID_W, GRID_H);

    // Background fill
    ctx.save();
    const grad = ctx.createLinearGradient(0, 0, 0, GRID_H);
    grad.addColorStop(0, 'rgba(5,12,24,0.55)');
    grad.addColorStop(1, 'rgba(9,21,40,0.45)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, GRID_W, GRID_H);
    ctx.restore();

    drawGrid(ctx);
    drawFood(ctx);
    drawSnake(ctx);

    if (state.status === 'paused') {
      ctx.save();
      ctx.fillStyle = 'rgba(0,0,0,0.25)';
      ctx.fillRect(0, 0, GRID_W, GRID_H);
      ctx.fillStyle = 'rgba(234,241,255,0.92)';
      ctx.font = '700 22px ui-sans-serif, system-ui, -apple-system, "Segoe UI"';
      ctx.textAlign = 'center';
      ctx.fillText('已暂停', GRID_W / 2, GRID_H / 2 - 6);
      ctx.font = '600 14px ui-sans-serif, system-ui, -apple-system, "Segoe UI"';
      ctx.fillStyle = 'rgba(234,241,255,0.72)';
      ctx.fillText('按 P 继续', GRID_W / 2, GRID_H / 2 + 18);
      ctx.restore();
    }
  }

  function tick(ts) {
    const dt = state.lastTs ? ts - state.lastTs : 0;
    state.lastTs = ts;

    if (state.status === 'playing') {
      state.accMs += dt;
      while (state.accMs >= state.stepMs) {
        state.accMs -= state.stepMs;
        update();
        if (state.status !== 'playing') break;
      }
    } else {
      // Prevent accumulating time while paused/idle/gameover.
      state.accMs = 0;
    }

    render();
    state.rafId = requestAnimationFrame(tick);
  }

  function bind() {
    window.addEventListener('keydown', (e) => {
      // Prevent scroll on arrow keys / space.
      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', ' '].includes(e.key)) e.preventDefault();
      handleKeyDown(e);
    });

    btnStart.addEventListener('click', () => {
      if (state.status === 'idle' || state.status === 'gameover') resetGame();
      else if (state.status === 'paused') setStatus('playing');
    });

    canvas.addEventListener('touchstart', handleTouchStart, { passive: true });
    canvas.addEventListener('touchmove', handleTouchMove, { passive: true });
    canvas.addEventListener('touchend', handleTouchEnd, { passive: true });

    window.addEventListener('resize', () => resizeCanvas());
  }

  function init() {
    loadBest();
    resizeCanvas();
    setStatus('idle');
    bind();
    state.rafId = requestAnimationFrame(tick);
  }

  init();
})();

