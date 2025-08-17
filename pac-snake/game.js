(() => {
  // ======= Config =======
  const GRID_W = 32;     // columns (16:9 friendly: 32x18)
  const GRID_H = 18;     // rows
  const BASE_SPEED = 6;  // moves per second at 1x
  const ITEM_LIMITS = { book: 4, weight: 3, food: 5 };
  const SPAWN_CHANCE = { book: 0.025, weight: 0.02, food: 0.03 }; // per step when below limit
  const WEIGHT_SHRINK_BY = 3;

  // ======= State =======
  const canvas = document.getElementById("game");
  const ctx = canvas.getContext("2d");
  const scoreEl = document.getElementById("score");
  const lenEl = document.getElementById("len");
  const bestEl = document.getElementById("best");
  const speedEl = document.getElementById("speed");

  const ih = { up: false, down: false, left: false, right: false };
  let dir = { x: 1, y: 0 };
  let nextDir = { x: 1, y: 0 };
  let snake = [];          // array of {x,y}
  let growthPending = 0;   // number of segments to add (classic snake)

  let items = [];          // array of {x,y,type: 'book'|'weight'|'food'}
  let playing = false;
  let lastStepTime = 0;
  let stepInterval = 1000 / BASE_SPEED; // ms per step at current speed multiplier
  let speedMult = 1;
  let score = 0;
  let best = Number(localStorage.getItem("pacsnake.best") || 0);
  bestEl.textContent = String(best);

  const headImg = new Image();
  headImg.src = "assets/face.png";

  // Helpers
  const randInt = (n) => Math.floor(Math.random() * n);
  const same = (a, b) => a.x === b.x && a.y === b.y;
  const inside = (x, y) => x >= 0 && x < GRID_W && y >= 0 && y < GRID_H;
  const cellSize = () => Math.min(canvas.width / GRID_W, canvas.height / GRID_H);

  function initGame() {
    dir = { x: 1, y: 0 };
    nextDir = { x: 1, y: 0 };
    snake = [];
    items = [];
    growthPending = 0;
    score = 0;
    speedMult = 1;
    stepInterval = 1000 / (BASE_SPEED * speedMult);
    updateHUD();

    // Start snake in center length 5
    const cx = Math.floor(GRID_W / 2);
    const cy = Math.floor(GRID_H / 2);
    for (let i = 4; i >= 0; i--) {
      snake.push({ x: cx - i, y: cy });
    }
    // Pre-seed a few items
    for (let i = 0; i < 4; i++) trySpawn("book");
    for (let i = 0; i < 3; i++) trySpawn("weight");
    for (let i = 0; i < 4; i++) trySpawn("food");

    playing = false;
    draw();
  }

  function updateHUD() {
    scoreEl.textContent = String(score);
    lenEl.textContent = String(snake.length);
    speedEl.textContent = String(speedMult.toFixed(1)).replace(/\.0$/, '');
  }

  function togglePlay() {
    playing = !playing;
    if (playing) {
      lastStepTime = performance.now();
      requestAnimationFrame(loop);
    } else {
      draw();
    }
  }

  function setSpeed(mult) {
    speedMult = Math.max(0.5, Math.min(3, mult));
    stepInterval = 1000 / (BASE_SPEED * speedMult);
    updateHUD();
  }

  function loop(now) {
    if (!playing) return;
    if (now - lastStepTime >= stepInterval) {
      step();
      lastStepTime = now;
    }
    draw();
    requestAnimationFrame(loop);
  }

  function step() {
    // apply queued direction (no instant reverse)
    if ((nextDir.x !== -dir.x || nextDir.y !== -dir.y)) {
      dir = nextDir;
    }

    const head = snake[snake.length - 1];
    const nx = (head.x + dir.x + GRID_W) % GRID_W; // wrap
    const ny = (head.y + dir.y + GRID_H) % GRID_H;
    const newHead = { x: nx, y: ny };

    // Move snake: add new head
    snake.push(newHead);

    // Item interactions first (before deciding tail pop)
    const hitIdx = items.findIndex(it => same(it, newHead));
    if (hitIdx >= 0) {
      const it = items[hitIdx];
      if (it.type === "book") {
        score += 10;
        // optional: small growth reward (commented out)
        // growthPending += 1;
      } else if (it.type === "weight") {
        score += 5;
        // shrink by popping tail immediately
        for (let i = 0; i < WEIGHT_SHRINK_BY && snake.length > 1; i++) {
          snake.shift();
        }
      } else if (it.type === "food") {
        // Double current length via growthPending
        const currentLen = snake.length;
        const totalCells = GRID_W * GRID_H;
        const targetIncrease = Math.min(currentLen, totalCells - currentLen);
        growthPending += targetIncrease;
      }
      items.splice(hitIdx, 1);
      updateHUD();
    }

    // Tail management
    if (growthPending > 0) {
      growthPending--;
      // keep tail (grow)
    } else {
      snake.shift(); // normal move
    }

    // spawn items probabilistically when under the cap
    if (countItems("book") < ITEM_LIMITS.book && Math.random() < SPAWN_CHANCE.book) trySpawn("book");
    if (countItems("weight") < ITEM_LIMITS.weight && Math.random() < SPAWN_CHANCE.weight) trySpawn("weight");
    if (countItems("food") < ITEM_LIMITS.food && Math.random() < SPAWN_CHANCE.food) trySpawn("food");

    // Lose condition: filled the screen (cannot place any more tail because we've occupied all cells)
    if (snake.length >= GRID_W * GRID_H) {
      gameOver("You filled the screen! 🧠➡️🧱");
      return;
    }

    // (Design choice) Self-collision does NOT end the game; the challenge is to avoid filling the grid.
  }

  function gameOver(msg) {
    playing = false;
    best = Math.max(best, score);
    localStorage.setItem("pacsnake.best", String(best));
    bestEl.textContent = String(best);
    draw(msg, true);
  }

  function countItems(type) {
    return items.reduce((n, it) => n + (it.type === type), 0);
  }

  function trySpawn(type) {
    const empty = [];
    const occ = new Set(snake.map(c => c.x + "," + c.y));
    for (let y = 0; y < GRID_H; y++) {
      for (let x = 0; x < GRID_W; x++) {
        const k = x + "," + y;
        if (!occ.has(k) && !items.find(it => it.x === x && it.y === y)) empty.push({ x, y });
      }
    }
    if (!empty.length) return false;
    const spot = empty[randInt(empty.length)];
    items.push({ ...spot, type });
    return true;
  }

  // ======= Rendering =======
  function draw(overlayMsg = "", dim = false) {
    // Resize canvas to CSS size to keep crisp grid
    const rect = canvas.getBoundingClientRect();
    const dpr = Math.max(1, Math.floor(window.devicePixelRatio || 1));
    const targetW = Math.floor(rect.width * dpr);
    const targetH = Math.floor(rect.height * dpr);
    if (canvas.width !== targetW || canvas.height !== targetH) {
      canvas.width = targetW;
      canvas.height = targetH;
    }

    const size = cellSize();
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // background grid
    for (let y = 0; y < GRID_H; y++) {
      for (let x = 0; x < GRID_W; x++) {
        ctx.fillStyle = ((x + y) % 2 === 0) ? "#0b0b0b" : "#111";
        ctx.fillRect(x * size, y * size, size, size);
      }
    }

    // items
    for (const it of items) {
      if (it.type === "book") drawEmoji("📚", it.x, it.y, size);
      else if (it.type === "weight") drawEmoji("🏋️", it.x, it.y, size);
      else if (it.type === "food") drawEmoji("🍔", it.x, it.y, size);
    }

    // snake body (excluding head)
    ctx.lineJoin = "round";
    ctx.lineCap = "round";
    for (let i = 0; i < snake.length - 1; i++) {
      const c = snake[i];
      const alpha = 0.4 + 0.6 * (i / (snake.length - 1)); // fade towards head
      ctx.fillStyle = `rgba(0,200,255,${alpha.toFixed(3)})`;
      roundRect(ctx, c.x * size + 2, c.y * size + 2, size - 4, size - 4, Math.min(10, size/3));
      ctx.fill();
    }

    // snake head with face
    const head = snake[snake.length - 1];
    const hx = head.x * size;
    const hy = head.y * size;
    // head background ring
    ctx.save();
    ctx.translate(hx, hy);
    ctx.beginPath();
    ctx.arc(size/2, size/2, size*0.48, 0, Math.PI * 2);
    ctx.fillStyle = "#fff";
    ctx.fill();
    // clip and draw image
    ctx.save();
    ctx.beginPath();
    ctx.arc(size/2, size/2, size*0.44, 0, Math.PI * 2);
    ctx.clip();
    if (headImg.complete) {
      ctx.drawImage(headImg, 0, 0, size, size);
    } else {
      // fallback
      ctx.fillStyle = "#333";
      ctx.fillRect(0, 0, size, size);
    }
    ctx.restore();
    ctx.restore();

    if (dim) {
      ctx.fillStyle = "rgba(0,0,0,.55)";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
    }

    if (overlayMsg) {
      ctx.fillStyle = "#fff";
      ctx.font = `${Math.max(18, Math.floor(size))}px system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial`;
      ctx.textAlign = "center";
      ctx.fillText(overlayMsg, canvas.width / 2, canvas.height / 2);
      ctx.font = `${Math.max(12, Math.floor(size*0.7))}px system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial`;
      ctx.fillText("Press R to restart", canvas.width / 2, canvas.height / 2 + size * 1.2);
    }
  }

  function drawEmoji(glyph, gx, gy, size) {
    ctx.font = `${Math.floor(size*0.8)}px serif`;
    ctx.textBaseline = "middle";
    ctx.textAlign = "center";
    ctx.fillText(glyph, gx * size + size / 2, gy * size + size / 2 + 1);
  }

  function roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x+r, y);
    ctx.arcTo(x+w, y, x+w, y+h, r);
    ctx.arcTo(x+w, y+h, x, y+h, r);
    ctx.arcTo(x, y+h, x, y, r);
    ctx.arcTo(x, y, x+w, y, r);
    ctx.closePath();
  }

  // ======= Input =======
  window.addEventListener("keydown", (e) => {
    const k = e.key.toLowerCase();
    if (k === "arrowup" || k === "w") nextDir = { x: 0, y: -1 };
    else if (k === "arrowdown" || k === "s") nextDir = { x: 0, y: 1 };
    else if (k === "arrowleft" || k === "a") nextDir = { x: -1, y: 0 };
    else if (k === "arrowright" || k === "d") nextDir = { x: 1, y: 0 };
    else if (k === " "){ togglePlay(); }
    else if (k === "r"){ initGame(); togglePlay(); }
    else if (k === "-" || k === "_"){ setSpeed(speedMult - 0.1); }
    else if (k === "=" || k === "+"){ setSpeed(speedMult + 0.1); }
  });

  document.getElementById("btnStart").addEventListener("click", togglePlay);
  document.getElementById("btnRestart").addEventListener("click", () => { initGame(); togglePlay(); });
  document.getElementById("btnSlow").addEventListener("click", () => setSpeed(speedMult - 0.1));
  document.getElementById("btnFast").addEventListener("click", () => setSpeed(speedMult + 0.1));

  window.addEventListener("resize", () => draw());

  // Boot
  initGame();
})();
