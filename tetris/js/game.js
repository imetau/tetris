// game.js - 俄罗斯方块核心逻辑（Canvas 渲染）
// 导出类或对象以供 UI 使用：TetrisGame
// 主要职责：管理网格、当前方块、下一个方块、移动、旋转、消行、计分、游戏循环

// 方块尺寸（像素）和网格宽高（以方块计）
const BLOCK = 24;       // 与 ui.js 保持一致
const COLS = 10;
const ROWS = 20;

// 7 种 Tetromino 定义（使用矩阵表示）
const SHAPES = {
  I: [
    [[0,0,0,0],
     [1,1,1,1],
     [0,0,0,0],
     [0,0,0,0]]
  ],
  J: [
    [[1,0,0],
     [1,1,1],
     [0,0,0]]
  ],
  L: [
    [[0,0,1],
     [1,1,1],
     [0,0,0]]
  ],
  O: [
    [[1,1],
     [1,1]]
  ],
  S: [
    [[0,1,1],
     [1,1,0],
     [0,0,0]]
  ],
  T: [
    [[0,1,0],
     [1,1,1],
     [0,0,0]]
  ],
  Z: [
    [[1,1,0],
     [0,1,1],
     [0,0,0]]
  ]
};

// 新增：额外异形方块（设计为方阵矩阵，便于旋转）
const EXTRA_SHAPES = {
  // U 形（3x3）
  U: [
    [[1,0,1],
     [1,1,1],
     [0,0,0]]
  ],
  // P 形（类似一个小方块加翘起）（3x3）
  P: [
    [[1,1,0],
     [1,1,1],
     [0,0,0]]
  ],
  // W 形（3x3，锯齿）
  W: [
    [[1,0,0],
     [1,1,0],
     [0,1,1]]
  ],
  // V 形（3x3）
  V: [
    [[1,0,0],
     [1,0,0],
     [1,1,0]]
  ],
  // X 形（中心像素，3x3）
  X: [
    [[0,1,0],
     [1,1,1],
     [0,1,0]]
  ],
  // Y 形（4x4 用于更复杂旋转）
  Y: [
    [[0,1,0,0],
     [1,1,1,1],
     [0,0,0,0],
     [0,0,0,0]]
  ],
  // 单点方块（1x1）
  DOT: [
    [[1]]
  ]
};

// 颜色映射（为新方块添加颜色）
const COLORS = {
  I: '#00e5ff', J:'#3f51b5', L:'#ffb74d', O:'#ffd54f', S:'#00e676', T:'#ba68c8', Z:'#ff5252', X:'#263238',
  U:'#4dd0e1', P:'#8bc34a', W:'#ff8a65', V:'#ffd180', Y:'#b39ddb', DOT:'#ffffff'
};

// 随机生成 Tetromino（支持权重映射或普通数组）
function weightedRandomKey(weightsOrArray) {
  // 如果传入的是对象映射 name->weight
  if (weightsOrArray && typeof weightsOrArray === 'object' && !Array.isArray(weightsOrArray)) {
    const keys = Object.keys(weightsOrArray);
    const weights = keys.map(k => Math.max(0, Number(weightsOrArray[k]) || 0));
    const total = weights.reduce((a,b)=>a+b,0);
    if (total <= 0) return keys[Math.floor(Math.random()*keys.length)];
    let r = Math.random() * total;
    for (let i=0;i<keys.length;i++) {
      r -= weights[i];
      if (r <= 0) return keys[i];
    }
    return keys[keys.length-1];
  }
  // 如果是数组
  const arr = Array.isArray(weightsOrArray) ? weightsOrArray : Object.keys(SHAPES);
  return arr[Math.floor(Math.random() * arr.length)];
}

function randomTetromino(shapeWeights = null) {
  const k = weightedRandomKey(shapeWeights);
  return createPiece(k);
}

function createPiece(type) {
  // 深拷贝模板矩阵并返回对象
  const source = SHAPES[type] || EXTRA_SHAPES[type];
  const matrix = source[0].map(r => r.slice());
  return {
    type,
    matrix,
    x: Math.floor(COLS / 2) - Math.ceil(matrix[0].length/2),
    y: -1 // 从顶部进入
  };
}

function rotateMatrix(matrix) {
  const N = matrix.length;
  const res = Array.from({length:N},()=>Array(N).fill(0));
  for (let r=0;r<N;r++) for (let c=0;c<N;c++) res[c][N-1-r] = matrix[r][c];
  return res;
}

// TetrisGame 类
export class TetrisGame {
  constructor(ctx, nextCtx, onUpdate = () => {}, options = {}) {
    this.ctx = ctx;           // 主画布上下文
    this.nextCtx = nextCtx;   // 下一个方块画布上下文
    this.onUpdate = onUpdate; // 回调，用于 UI 更新（score/level/lines）
    // options.extraShapes: 布尔值，启用额外异形方块
    // options.dotWeight: DOT 出现的相对权重（默认很小，如 0.05）
    this.options = options;
    // 根据配置选择方块池并建立权重映射
    const combined = options.extraShapes ? { ...SHAPES, ...EXTRA_SHAPES } : { ...SHAPES };
    this.shapeWeights = {};
    const defaultDotWeight = typeof options.dotWeight === 'number' ? options.dotWeight : 0.05;
    for (const k of Object.keys(combined)) {
      this.shapeWeights[k] = (k === 'DOT') ? defaultDotWeight : 1;
    }

    // 新增：bag 随机器和 DOT 注入概率设置
    this.enabledShapes = Object.keys(combined);
    this.dotProb = defaultDotWeight; // 单点方块出现概率控制（单独注入）
    this.bag = [];
    this.refillBag();

    this.reset();
  }

  // 使用洗牌的 bag（每种形状至少一次）来均匀分布方块，避免短期重复
  refillBag() {
    // 构建 bag，排除 DOT（DOT 通过概率独立注入）
    this.bag = this.enabledShapes.filter(k => k !== 'DOT').slice();
    // Fisher-Yates shuffle
    for (let i = this.bag.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [this.bag[i], this.bag[j]] = [this.bag[j], this.bag[i]];
    }
  }
  
  // 从 bag 中取下一个方块；若触发 DOT 概率则返回 DOT
  nextFromBag() {
    if (this.shapeWeights['DOT'] && Math.random() < this.dotProb) {
      return createPiece('DOT');
    }
    if (!this.bag || this.bag.length === 0) this.refillBag();
    const key = this.bag.shift();
    return createPiece(key);
  }

  reset() {
    // 初始化网格（二维数组，0=空）
    this.grid = Array.from({length:ROWS},()=>Array(COLS).fill(0));
    this.score = 0;
    this.level = 1;
    this.lines = 0;
    this.dropInterval = 800; // 毫秒，每级减速
    this.lastDropTime = 0;
    this.gameOver = false;
    this.paused = false;
    // 使用权重地图生成方块
    // 使用 bag/randomizer 生成，DOT 由概率注入
    this.current = this.nextFromBag();
    this.next = this.nextFromBag();
    // 通知 UI：已重置，并明确 paused/gameOver 状态
    this.onUpdate({score: this.score, level: this.level, lines: this.lines, paused: this.paused, gameOver: this.gameOver});
  }

  start() {
    this.reset();
    this.lastTime = performance.now();
    this.loop(this.lastTime);
    // 通知 UI：游戏已开始（非 paused、非 gameOver）
    this.onUpdate({score: this.score, level: this.level, lines: this.lines, paused: false, gameOver: false});
  }

  pause() {
    this.paused = !this.paused;
    // 报告暂停/继续状态，UI 可据此禁用输入
    this.onUpdate({score: this.score, level: this.level, lines: this.lines, paused: this.paused, gameOver: this.gameOver});
  }

  loop(time) {
    if (this.gameOver) return;
    const delta = time - (this.lastTime || time);
    this.lastTime = time;
    if (!this.paused) {
      this.lastDropTime += delta;
      if (this.lastDropTime > this.dropInterval) {
        this.drop();
        this.lastDropTime = 0;
      }
    }
    this.draw();
    requestAnimationFrame(t => this.loop(t));
  }

  // 碰撞检测
  collide(mat, x, y) {
    for (let r = 0; r < mat.length; r++) {
      for (let c = 0; c < mat[r].length; c++) {
        if (mat[r][c]) {
          const newY = y + r;
          const newX = x + c;
          if (newX < 0 || newX >= COLS || newY >= ROWS) return true;
          if (newY >= 0 && this.grid[newY][newX]) return true;
        }
      }
    }
    return false;
  }

  merge(mat, x, y, type) {
    for (let r = 0; r < mat.length; r++) {
      for (let c = 0; c < mat[r].length; c++) {
        if (mat[r][c] && y + r >= 0) {
          this.grid[y + r][x + c] = type; // 存储类型便于染色
        }
      }
    }
  }

  rotateCurrent() {
    const rotated = rotateMatrix(this.current.matrix);
    if (!this.collide(rotated, this.current.x, this.current.y)) {
      this.current.matrix = rotated;
    }
  }

  move(offsetX) {
    const nx = this.current.x + offsetX;
    if (!this.collide(this.current.matrix, nx, this.current.y)) {
      this.current.x = nx;
    }
  }

  drop() {
    // 尝试下移一格
    let cleared = 0;
    if (!this.collide(this.current.matrix, this.current.x, this.current.y + 1)) {
      this.current.y++;
    } else {
      // 锁定方块
      // 如果是单点 DOT，允许穿透其它方块并落到该列最底层的空位（最低的空单元格）
      if (this.current.type === 'DOT') {
        const col = this.current.x;
        let targetY = -1;
        for (let y = ROWS - 1; y >= 0; y--) {
          if (!this.grid[y][col]) { targetY = y; break; }
        }
        if (targetY >= 0) {
          this.grid[targetY][col] = 'DOT';
          // 通知已放置（供 UI 播放音效）
          try { this.onUpdate({ placed: true, score: this.score, level: this.level, lines: this.lines, cleared: 0 }); } catch(e){}
          // 消行并更新分数/等级
          cleared = this.clearLines();
          const points = [0, 100, 300, 500, 800];
          this.score += points[cleared] || 0;
          this.lines += cleared;
          const newLevel = Math.floor(this.lines / 10) + 1;
          if (newLevel !== this.level) {
            this.level = newLevel;
            this.dropInterval = Math.max(100, 800 - (this.level - 1) * 60);
          }
          this.current = this.next;
          this.next = this.nextFromBag();
          if (this.collide(this.current.matrix, this.current.x, this.current.y)) {
            this.gameOver = true;
            this.onUpdate({score:this.score, level:this.level, lines:this.lines, gameOver:true, cleared});
            return;
          }
        } else {
          // 无可放置位置，回退为常规合并
          this.merge(this.current.matrix, this.current.x, this.current.y, this.current.type);
          try { this.onUpdate({ placed: true, score: this.score, level: this.level, lines: this.lines, cleared: 0 }); } catch(e){}
          cleared = this.clearLines();
          const points = [0, 100, 300, 500, 800];
          this.score += points[cleared] || 0;
          this.lines += cleared;
          const newLevel = Math.floor(this.lines / 10) + 1;
          if (newLevel !== this.level) {
            this.level = newLevel;
            this.dropInterval = Math.max(100, 800 - (this.level - 1) * 60);
          }
          this.current = this.next;
          this.next = this.nextFromBag();
          if (this.collide(this.current.matrix, this.current.x, this.current.y)) {
            this.gameOver = true;
            this.onUpdate({score:this.score, level:this.level, lines:this.lines, gameOver:true, cleared});
            return;
          }
        }
      } else {
        // 常规模块合并
        this.merge(this.current.matrix, this.current.x, this.current.y, this.current.type);
        // 通知已放置（供 UI 播放音效）
        try { this.onUpdate({ placed: true, score: this.score, level: this.level, lines: this.lines, cleared: 0 }); } catch(e){}
        // 消行并更新分数/等级
        cleared = this.clearLines();
        const points = [0, 100, 300, 500, 800];
        this.score += points[cleared] || 0;
        this.lines += cleared;
        const newLevel = Math.floor(this.lines / 10) + 1;
        if (newLevel !== this.level) {
          this.level = newLevel;
          this.dropInterval = Math.max(100, 800 - (this.level - 1) * 60);
        }
        this.current = this.next;
        this.next = this.nextFromBag();
        if (this.collide(this.current.matrix, this.current.x, this.current.y)) {
          this.gameOver = true;
          this.onUpdate({score:this.score, level:this.level, lines:this.lines, gameOver:true, cleared});
          return;
        }
      }
    }
    // 最终更新，包含 cleared（若为 0 则表示本次无消行）
    this.onUpdate({score:this.score, level:this.level, lines:this.lines, cleared});
  }

  hardDrop() {
    while (!this.collide(this.current.matrix, this.current.x, this.current.y + 1)) {
      this.current.y++;
      this.score += 2; // 硬降奖励（可调）
    }
    this.drop(); // 锁定
  }

  clearLines() {
    let cleared = 0;
    outer: for (let r = ROWS - 1; r >= 0; r--) {
      for (let c = 0; c < COLS; c++) {
        if (!this.grid[r][c]) {
          continue outer;
        }
      }
      // 该行满了
      this.grid.splice(r, 1);
      this.grid.unshift(Array(COLS).fill(0));
      cleared++;
      r++; // recheck current row index（因为上移了一行）
    }
    return cleared;
  }

  // 绘制网格与方块，DOT 闪烁效果
  draw() {
    // 清空主画布
    const ctx = this.ctx;
    ctx.clearRect(0,0,ctx.canvas.width, ctx.canvas.height);
    // 绘制已固化的格子
    for (let r=0;r<ROWS;r++){
      for (let c=0;c<COLS;c++){
        const t = this.grid[r][c];
        if (t) this.drawCell(c, r, COLORS[t] || COLORS.X);
      }
    }
    // 绘制当前操控方块
    const mat = this.current.matrix;
    const isDot = this.current.type === 'DOT';
    const now = performance.now();
    const dotVisible = isDot ? ((Math.floor(now / 250) % 2) === 0) : true; // DOT 每 250ms 闪烁一次
    for (let r=0;r<mat.length;r++){
      for (let c=0;c<mat[r].length;c++){
        if (mat[r][c]) {
          const x = this.current.x + c;
          const y = this.current.y + r;
          if (y >= 0 && (dotVisible || !isDot)) this.drawCell(x, y, COLORS[this.current.type]);
        }
      }
    }

    // 绘制网格线（可选）
    ctx.strokeStyle = 'rgba(255,255,255,0.03)';
    for (let x=0;x<=COLS;x++){
      ctx.beginPath(); ctx.moveTo(x*BLOCK,0); ctx.lineTo(x*BLOCK,ROWS*BLOCK); ctx.stroke();
    }
    for (let y=0;y<=ROWS;y++){
      ctx.beginPath(); ctx.moveTo(0,y*BLOCK); ctx.lineTo(COLS*BLOCK,y*BLOCK); ctx.stroke();
    }

    // 下一个方块
    this.drawNext();
  }

  drawCell(x, y, color) {
    const ctx = this.ctx;
    ctx.fillStyle = color;
    ctx.fillRect(x * BLOCK + 1, y * BLOCK + 1, BLOCK - 2, BLOCK - 2);
    // 高亮与阴影
    ctx.strokeStyle = 'rgba(0,0,0,0.3)';
    ctx.strokeRect(x * BLOCK + 1, y * BLOCK + 1, BLOCK - 2, BLOCK - 2);
  }

  drawNext() {
    const ctx = this.nextCtx;
    const canvas = ctx.canvas;
    ctx.clearRect(0,0,canvas.width,canvas.height);
    const mat = this.next.matrix;
    ctx.fillStyle = '#ffffff20';
    // 计算居中偏移
    const padX = Math.floor((canvas.width / BLOCK - mat[0].length) / 2);
    const padY = Math.floor((canvas.height / BLOCK - mat.length) / 2);
    for (let r=0;r<mat.length;r++){
      for (let c=0;c<mat[r].length;c++){
        if (mat[r][c]) {
          ctx.fillStyle = COLORS[this.next.type];
          ctx.fillRect((c + padX) * BLOCK + 1, (r + padY) * BLOCK + 1, BLOCK - 2, BLOCK - 2);
          ctx.strokeStyle = 'rgba(0,0,0,0.3)';
          ctx.strokeRect((c + padX) * BLOCK + 1, (r + padY) * BLOCK + 1, BLOCK - 2, BLOCK - 2);
        }
      }
    }
  }
}

// 便捷随机 key
function randomKey() {
  const keys = Object.keys(SHAPES);
  return keys[Math.floor(Math.random() * keys.length)];
}

// weightedRandomKey 和 randomTetromino 已在文件中定义
// 确保 TetrisGame 使用 this.shapeWeights 并在锁定时触发 placed 事件
