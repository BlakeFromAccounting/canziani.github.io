(() => {
  // ======= Config =======
  const GRID_W = 32;
  const GRID_H = 18;
  const BASE_SPEED = 6;

  // Burgers >> Weights, Books rare
  const ITEM_LIMITS   = { book: 2,  weight: 2,  food: 18 };
  const SPAWN_CHANCE  = { book: 0.010, weight: 0.010, food: 0.120 };
  const WEIGHT_SHRINK_BY = 3;

  // Books remove ONLY burgers
  const BOOK_BURGER_REMOVALS = 5;

  // ======= State =======
  const canvas  = document.getElementById("game");
  const ctx     = canvas.getContext("2d");
  const timeEl  = document.getElementById("time");
  const lenEl   = document.getElementById("len");
  const bestEl  = document.getElementById("best");
  const speedEl = document.getElementById("speed");

  let dir = { x: 1, y: 0 }, nextDir = { x: 1, y: 0 };
  let snake = [];
  let growthPending = 0;
  let items = []; // {x,y,type:'book'|'weight'|'food'}

  let playing = false;
  let lastStepTime = 0;
  let stepInterval = 1000 / BASE_SPEED;
  let speedMult = 1;

  let startTime = 0, elapsed = 0;
  let bestTime = Number(localStorage.getItem("pacsnake.bestTime") || 0);

  let gameOverText = "";

  const headImg = new Image();
  headImg.src = "assets/face.png";

  const randInt = (n) => Math.floor(Math.random() * n);
  const same = (a,b) => a.x===b.x && a.y===b.y;
  const cellSize = () => Math.min(canvas.width/GRID_W, canvas.height/GRID_H);

  function updateHUD(){
    timeEl.textContent = elapsed.toFixed(1);
    lenEl.textContent  = String(snake.length);
    bestEl.textContent = bestTime.toFixed(1);
    speedEl.textContent= String(speedMult.toFixed(1)).replace(/\.0$/,'');
  }

  function initGame(){
    dir = { x: 1, y: 0 };
    nextDir = { x: 1, y: 0 };
    snake = [];
    items = [];
    growthPending = 0;
    speedMult = 1;
    stepInterval = 1000 / (BASE_SPEED * speedMult);
    elapsed = 0;

    // Start length 5 in center
    const cx = Math.floor(GRID_W/2), cy = Math.floor(GRID_H/2);
    for (let i=4;i>=0;i--) snake.push({x: cx - i, y: cy});

    // Pre-seed
    for (let i=0;i<1;i++) trySpawn("book");
    for (let i=0;i<1;i++) trySpawn("weight");
    for (let i=0;i<10;i++) trySpawn("food");

    playing = false;
    updateHUD();
    draw();
  }

  function togglePlay(){
    playing = !playing;
    if (playing){
      startTime = performance.now() - elapsed*1000;
      lastStepTime = performance.now();
      requestAnimationFrame(loop);
    } else {
      draw();
    }
  }

  function setSpeed(mult){
    speedMult = Math.max(0.5, Math.min(3, mult));
    stepInterval = 1000 / (BASE_SPEED * speedMult);
    updateHUD();
  }

  function loop(now){
    if (!playing) return;
    elapsed = (now - startTime)/1000;
    if (now - lastStepTime >= stepInterval){
      step();
      lastStepTime = now;
    }
    draw();
    updateHUD();
    requestAnimationFrame(loop);
  }

  function step(){
    if (nextDir.x !== -dir.x || nextDir.y !== -dir.y) dir = nextDir;

    const head = snake[snake.length-1];
    const nx = (head.x + dir.x + GRID_W) % GRID_W;
    const ny = (head.y + dir.y + GRID_H) % GRID_H;
    const newHead = { x: nx, y: ny };

    snake.push(newHead);

    // Item pick-up
    const hitIdx = items.findIndex(it => same(it, newHead));
    if (hitIdx >= 0){
      const it = items[hitIdx];
      if (it.type === "book"){
        removeSomeBurgers(BOOK_BURGER_REMOVALS);
      } else if (it.type === "weight"){
        for (let i=0; i<WEIGHT_SHRINK_BY && snake.length>1; i++) snake.shift();
      } else if (it.type === "food"){
        const currentLen = snake.length;
        const totalCells = GRID_W * GRID_H;
        const inc = Math.min(currentLen, totalCells - currentLen);
        growthPending += inc;
      }
      items.splice(hitIdx, 1);
    }

    // Tail move vs growth
    if (growthPending > 0) growthPending--;
    else snake.shift();

    // Self-collision ends the game
    const h = snake[snake.length-1];
    for (let i=0;i<snake.length-1;i++){
      if (same(snake[i], h)) return gameOver();
    }

    // Spawns
    if (countItems("book")   < ITEM_LIMITS.book   && Math.random() < SPAWN_CHANCE.book)   trySpawn("book");
    if (countItems("weight") < ITEM_LIMITS.weight && Math.random() < SPAWN_CHANCE.weight) trySpawn("weight");
    if (countItems("food")   < ITEM_LIMITS.food   && Math.random() < SPAWN_CHANCE.food)   trySpawn("food");

    // Lose if full
    if (snake.length >= GRID_W*GRID_H) return gameOver();
  }

  function gameOver(){
    playing = false;
    if (elapsed > bestTime){
      bestTime = elapsed;
      localStorage.setItem("pacsnake.bestTime", String(bestTime));
    }
    gameOverText = "Burgers win!";
    draw(); // ensure overlay is painted immediately
  }

  function removeSomeBurgers(n){
    const idxs = items.map((it,i)=> it.type==="food" ? i : -1).filter(i=>i>=0);
    for (let i=idxs.length-1;i>0;i--){
      const j = randInt(i+1);
      [idxs[i], idxs[j]] = [idxs[j], idxs[i]];
    }
    const toRemove = idxs.slice(0, n).sort((a,b)=>b-a);
    for (const k of toRemove) items.splice(k,1);
  }

  function countItems(type){
    return items.reduce((n,it)=> n + (it.type===type), 0);
  }

  function trySpawn(type){
    const empty = [];
    const occ = new Set(snake.map(c => c.x+","+c.y));
    for (let y=0;y<GRID_H;y++){
      for (let x=0;x<GRID_W;x++){
        const k = x+","+y;
        if (!occ.has(k) && !items.find(it=>it.x===x && it.y===y)) empty.push({x,y});
      }
    }
    if (!empty.length) return false;
    const spot = empty[randInt(empty.length)];
    items.push({ ...spot, type });
    return true;
  }

  // ======= Rendering =======
  function draw(overlayMsg="", dim=false){
    const rect = canvas.getBoundingClientRect();
    const dpr = Math.max(1, Math.floor(window.devicePixelRatio || 1));
    const targetW = Math.floor(rect.width * dpr);
    const targetH = Math.floor(rect.height * dpr);
    if (canvas.width!==targetW || canvas.height!==targetH){
      canvas.width = targetW; canvas.height = targetH;
    }

    const size = cellSize();
    ctx.clearRect(0,0,canvas.width,canvas.height);

    // grid
    for (let y=0;y<GRID_H;y++){
      for (let x=0;x<GRID_W;x++){
        ctx.fillStyle = ((x+y)%2===0) ? "#0b0b0b" : "#111";
        ctx.fillRect(x*size, y*size, size, size);
      }
    }

    // items
    for (const it of items){
      if (it.type==="book")  drawEmoji("📚", it.x, it.y, size);
      else if (it.type==="weight") drawEmoji("🏋️", it.x, it.y, size);
      else if (it.type==="food")   drawEmoji("🍔", it.x, it.y, size);
    }

    // body
    for (let i=0;i<snake.length-1;i++){
      const c = snake[i];
      const alpha = 0.4 + 0.6*(i/(snake.length-1));
      ctx.fillStyle = `rgba(0,200,255,${alpha.toFixed(3)})`;
      roundRect(ctx, c.x*size+2, c.y*size+2, size-4, size-4, Math.min(10, size/3));
      ctx.fill();
    }

    // head (face)
    const head = snake[snake.length-1];
    const hx = head.x*size, hy = head.y*size;
    ctx.save();
    ctx.translate(hx, hy);
    ctx.beginPath();
    ctx.arc(size/2, size/2, size*0.48, 0, Math.PI*2);
    ctx.fillStyle = "#fff";
    ctx.fill();
    ctx.save();
    ctx.beginPath();
    ctx.arc(size/2, size/2, size*0.44, 0, Math.PI*2);
    ctx.clip();
    if (headImg.complete) ctx.drawImage(headImg, 0, 0, size, size);
    else { ctx.fillStyle="#333"; ctx.fillRect(0,0,size,size); }
    ctx.restore();
    ctx.restore();

    if (dim){
      ctx.fillStyle = "rgba(0,0,0,.55)";
      ctx.fillRect(0,0,canvas.width,canvas.height);
    }
    if (overlayMsg){
      // Big fun "Burgers win!" text
      ctx.fillStyle = "#ff4444";
      ctx.font = `${Math.floor(size * 2.2)}px Impact, sans-serif`;
      ctx.textAlign = "center";
      ctx.fillText(overlayMsg, canvas.width / 2, canvas.height / 2);

      // Restart hint
      ctx.fillStyle = "#fff";
      ctx.font = `${Math.max(14, Math.floor(size * 0.9))}px system-ui, sans-serif`;
      ctx.fillText('Hit "R" to restart', canvas.width / 2, canvas.height / 2 + size * 2);
    }
  }

  function drawEmoji(glyph, gx, gy, size){
    ctx.font = `${Math.floor(size*0.8)}px serif`;
    ctx.textBaseline = "middle";
    ctx.textAlign = "center";
    ctx.fillText(glyph, gx*size + size/2, gy*size + size/2 + 1);
  }

  function roundRect(ctx, x,y,w,h,r){
    ctx.beginPath();
    ctx.moveTo(x+r, y);
    ctx.arcTo(x+w,y, x+w,y+h, r);
    ctx.arcTo(x+w,y+h, x,y+h, r);
    ctx.arcTo(x,y+h, x,y, r);
    ctx.arcTo(x,y, x+w,y, r);
    ctx.closePath();
  }

  // ======= Input =======
  window.addEventListener("keydown",(e)=>{
    const k = e.key.toLowerCase();
    if (k==="arrowup"||k==="w") nextDir = {x:0,y:-1};
    else if (k==="arrowdown"||k==="s") nextDir = {x:0,y:1};
    else if (k==="arrowleft"||k==="a") nextDir = {x:-1,y:0};
    else if (k==="arrowright"||k==="d") nextDir = {x:1,y:0};
    else if (k===" ") togglePlay();
    else if (k==="r"){ initGame(); togglePlay(); }
    else if (k==="-"||k==="_") setSpeed(speedMult-0.1);
    else if (k==="="||k==="+") setSpeed(speedMult+0.1);
  });

  document.getElementById("btnStart")?.addEventListener("click", togglePlay);
  document.getElementById("btnRestart")?.addEventListener("click", ()=>{ initGame(); togglePlay(); });
  document.getElementById("btnSlow")?.addEventListener("click", ()=> setSpeed(speedMult-0.1));
  document.getElementById("btnFast")?.addEventListener("click", ()=> setSpeed(speedMult+0.1));
  window.addEventListener("resize", ()=> draw());

  // Boot
  initGame();
})();
