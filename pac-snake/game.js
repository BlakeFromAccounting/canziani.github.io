(() => {
  // ======= Config =======
  const GRID_W = 32;      // columns (16:9 friendly: 32x18)
  const GRID_H = 18;      // rows
  const BASE_SPEED = 6;   // moves per second at 1x

  // Make burgers far more common
  const ITEM_LIMITS = { book: 4, weight: 2, food: 12 };
  const SPAWN_CHANCE = { book: 0.02, weight: 0.012, food: 0.08 }; // food >> weight

  const WEIGHT_SHRINK_BY = 3;
  const BOOK_BURGER_REMOVALS = 3; // books remove up to this many burgers on pickup

  // ======= State =======
  const canvas = document.getElementById("game");
  const ctx = canvas.getContext("2d");

  const timeEl = document.getElementById("time");
  const lenEl = document.getElementById("len");
  const bestEl = document.getElementById("best");
  const speedEl = document.getElementById("speed");

  let dir = { x: 1, y: 0 };
  let nextDir = { x: 1, y: 0 };
  let snake = [];          // array of {x,y}
  let growthPending = 0;   // number of segments to add

  let items = [];          // array of {x,y,type:'book'|'weight'|'food'}
  let playing = false;
  let lastStepTime = 0;
  let stepInterval = 1000 / BASE_SPEED; // ms per step at current speed multiplier
  let speedMult = 1;

  let startTime = 0;
  let elapsed = 0;
  let bestTime = Number(localStorage.getItem("pacsnake.bestTime") || 0);

  const headImg = new Image();
  headImg.src = "assets/face.png";

  const randInt = (n) => Math.floor(Math.random() * n);
  const same = (a, b) => a.x === b.x && a.y === b.y;
  const cellSize = () => Math.min(canvas.width / GRID_W, canvas.height / GRID_H);

  function updateHUD() {
    timeEl.textContent = elapsed.toFixed(1);
    lenEl.textContent = String(snake.length);
    bestEl.textContent = bestTime.toFixed(1);
    speedEl.textContent = String(speedMult.toFixed(1)).replace(/\.0$/, "");
  }

  function initGame() {
    dir = { x: 1, y: 0 };
    nextDir = { x: 1, y: 0 };
    snake = [];
    items = [];
    growthPending = 0;
    speedMult = 1;
    stepInterval = 1000 / (BASE_SPEED * speedMult);
    elapsed = 0;

    // Start snake in center length 5
    const cx = Math.floor(GRID_W / 2);
    const cy = Math.floor(GRID_H / 2);
    for (let i = 4; i >= 0; i--) snake.push({ x: cx - i, y: cy });

    // Pre-seed items
    for (let i = 0; i < 3; i++) trySpawn("book");
    for (let i = 0; i < 2; i++) trySpawn("weight");
    for (let i = 0; i < 8; i++) trySpawn("food");

    playing = false;
    updateHUD();
    draw();
  }

  function togglePlay() {
    playing = !playing;
    if (playing) {
      startTime = performance.now() - elapsed * 1000;
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
    elapsed = (now - startTime) / 1000;
    if (now - lastStepTime >= stepInterval) {
      step();
      lastStepTime = now;
    }
    draw();
    updateHUD();
    requestAnimationFrame(loop);
  }

  function step() {
    // apply queued dir (no instant reverse)
    if (nextDir.x !== -dir.x || nextDir.y !== -dir.y) dir = nextDir;

    const head = snake[snake.length - 1];
    const nx = (head.x + dir.x + GRID_W) % GRID_W; // wrap edges
    const ny = (head.y + dir.y + GRID_H) % GRID_H;
    const newHead = { x: nx, y: ny };

    // Add new head
    snake.push(newHead);

    // Item interactions (before deciding tail pop)
    const hitIdx = items.findIndex((it) => same(it, newHead));
    if (hitIdx >= 0) {
      const it = items[hitIdx];
      if (it.type === "book") {
        // Books remove burgers from the board (no points)
        removeSomeBurgers(BOOK_BURGER_REMOVALS);
      } else if (it.type === "weight") {
        // Shrink by popping tail
        for (let i = 0; i < WEIGHT_SHRINK_BY && snake.length > 1; i++) snake.shift();
      } else if (it.type === "food") {
        // Double length by growth
        const currentLen = snake.length;
        const totalCells = GRID_W * GRID_H;
        const inc = Math.min(currentLen, totalCells - currentLen);
        growthPending += inc;
      }
      items.splice(hitIdx, 1);
    }

    // Tail management (grow vs move)
    if (growthPending > 0) {
      growthPending--;
      // keep tail (grow)
    } else {
      snake.shift();
    }

    // Self-collision check (you lose if you hit your own body)
    // Check body excluding head (last element)
    for (let i = 0; i < snake.length - 1; i++) {
      if (same(snake[i], snake[snake.length - 1])) {
        return gameOver("You hit your own body!");
      }
    }

    // Spawn items (food >> weight)
    if (countItems("book") < ITEM_LIMITS.book && Math.random() < SPAWN_CHANCE.book) trySpawn("book");
    if (countItems("weight") < ITEM_LIMITS.weight && Math.random() < SPAWN_CHANCE.weight) trySpawn("weight");
    if (countItems("food") < ITEM_LIMITS.food && Math.random() < SPAWN_CHANCE.food) trySpawn("food");

    // Lose condition: filled the screen
    if (snake.length >= GRID_W * GRID_H) {
      return gameOver("You filled the screen!");
    }
  }

  function gameOver(msg) {
    playing = false;
    if (elapsed > bestTime) {
      bestTime = elapsed;
      localStorage.setItem("pacsnake.bestTime", String(bestTime));
    }
    draw(msg, true);
  }

  function removeSomeBurgers(n) {
    // remove up to n random 'food' items currently on board
    const burgerIdxs = items.map((it, i) => (it.type === "food" ? i : -1)).filter((i) => i >= 0);
    // shuffle
    for (let i = burgerIdxs.length - 1; i > 0; i--) {
      const j = randInt(i + 1);
      [burgerIdxs[i], burgerIdxs[j]] = [burgerIdxs[j], burgerIdxs[i]];
    }
    const toRemove = burgerIdxs.slice(0, n).sort((a, b) => b - a);
    for (const idx of toRemove) items.splice(idx, 1);
  }

  function countItems(type) {
    return items.reduce((n, it) => n + (it.type === type), 0);
  }

  function trySpawn(type) {
    const empty = [];
    const occ = new Set(snake.map((c) => c.x + "," + c.y));
    for (let y = 0; y < GRID_H; y++) {
      for (let x = 0; x < GRID_W; x++) {
        const k = x + "," + y;
        if (!occ.has(k) && !items.find((it) => it.x === x && it.y === y)) empty.push({ x, y });
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
    ctx.clearRect(0, 0, canvas.width,
