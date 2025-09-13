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

// 颜色映射
const COLORS = {
  I: '#00e5ff', J:'#3f51b5', L:'#ffb74d', O:'#ffd54f', S:'#00e676', T:'#ba68c8', Z:'#ff5252', X:'#263238'
};

// 随机生成 Tetromino（简单版：7-bag 可后续改进）
function randomTetromino() {
  const keys = Object.keys(SHAPES);
  const k = keys[Math.floor(Math.random() * keys.length)];
  return createPiece(k);
}

function createPiece(type) {
  // 深拷贝模板矩阵并返回对象
  const matrix = SHAPES[type][0].map(r => r.slice());
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
  constructor(ctx, nextCtx, onUpdate = () => {}) {
    this.ctx = ctx;           // 主画布上下文
    this.nextCtx = nextCtx;   // 下一个方块画布上下文
    this.onUpdate = onUpdate; // 回调，用于 UI 更新（score/level/lines）
    this.reset();
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
    this.current = randomTetromino();
    this.next = randomTetromino();
    this.onUpdate({score: this.score, level: this.level, lines: this.lines});
  }

  start() {
    this.reset();
    this.lastTime = performance.now();
    this.loop(this.lastTime);
  }

  pause() {
    this.paused = !this.paused;
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
    if (!this.collide(this.current.matrix, this.current.x, this.current.y + 1)) {
      this.current.y++;
    } else {
      // 锁定方块
      this.merge(this.current.matrix, this.current.x, this.current.y, this.current.type);
      // 消行
      const cleared = this.clearLines();
      // 更新分数（经典机制：单行100、双行300、三行500、四行800）
      const points = [0, 100, 300, 500, 800];
      this.score += points[cleared] || 0;
      this.lines += cleared;
      // 升级规则：每消 10 行升一级（可调）
      const newLevel = Math.floor(this.lines / 10) + 1;
      if (newLevel !== this.level) {
        this.level = newLevel;
        this.dropInterval = Math.max(100, 800 - (this.level - 1) * 60);
      }
      // 获取下一个方块
      this.current = this.next;
      this.next = randomTetromino();
      // 如果新方块一放置就碰撞 => 游戏结束
      if (this.collide(this.current.matrix, this.current.x, this.current.y)) {
        this.gameOver = true;
        this.onUpdate({score:this.score, level:this.level, lines:this.lines, gameOver:true});
        return;
      }
    }
    this.onUpdate({score:this.score, level:this.level, lines:this.lines});
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

  // 绘制网格与方块
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
    for (let r=0;r<mat.length;r++){
      for (let c=0;c<mat[r].length;c++){
        if (mat[r][c]) {
          const x = this.current.x + c;
          const y = this.current.y + r;
          if (y >= 0) this.drawCell(x, y, COLORS[this.current.type]);
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
