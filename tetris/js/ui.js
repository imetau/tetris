// ui.js - 负责 DOM 交互、键盘事件、与 storage.js 联合
import { TetrisGame } from './game.js';
import { getLocalScores, saveLocalScore } from './storage.js';

// 初始化画布与缩放（按 BLOCK 大小一致）
const gameCanvas = document.getElementById('game-canvas');
const nextCanvas = document.getElementById('next-canvas');
const ctx = gameCanvas.getContext('2d');
const nextCtx = nextCanvas.getContext('2d');

// 与 game.js 中 BLOCK 相同（约定）
const BLOCK = 24;
ctx.canvas.width = 10 * BLOCK;
ctx.canvas.height = 20 * BLOCK;
nextCtx.canvas.width = 4 * BLOCK;
nextCtx.canvas.height = 4 * BLOCK;

// UI 元素
const scoreEl = document.getElementById('score');
const levelEl = document.getElementById('level');
const linesEl = document.getElementById('lines');
const startBtn = document.getElementById('start-btn');
const pauseBtn = document.getElementById('pause-btn');
const resetBtn = document.getElementById('reset-btn');
const highscoreList = document.getElementById('highscore-list');
const saveForm = document.getElementById('save-score-form');
const playerName = document.getElementById('player-name');

// 背景音乐（可替换为项目中的实际 mp3 文件）
const bgAudio = new Audio('../assets/audio/bg-music.mp3');
bgAudio.loop = true;
let musicEnabled = true;

// 在 UI 中添加音乐控制按钮
const musicBtn = document.createElement('button');
musicBtn.textContent = '静音';
musicBtn.style.marginTop = '8px';
const panel = document.querySelector('.panel');
panel.appendChild(musicBtn);

musicBtn.addEventListener('click', () => {
  musicEnabled = !musicEnabled;
  musicBtn.textContent = musicEnabled ? '静音' : '播放音乐';
  if (musicEnabled && !game.paused) bgAudio.play().catch(()=>{});
  else bgAudio.pause();
});

let game = new TetrisGame(ctx, nextCtx, (state) => {
  // 回调在游戏状态变化时更新 UI
  scoreEl.textContent = state.score ?? 0;
  levelEl.textContent = state.level ?? 1;
  linesEl.textContent = state.lines ?? 0;
  if (state.gameOver) {
    alert('游戏结束！你可以保存分数到本地排行榜。');
    bgAudio.pause();
    renderHighscores();
  }
});

// 按钮事件
startBtn.addEventListener('click', () => { game.start(); renderHighscores(); if (musicEnabled) bgAudio.play().catch(()=>{}); });
pauseBtn.addEventListener('click', () => { game.pause(); pauseBtn.textContent = game.paused ? '继续' : '暂停'; if (game.paused) bgAudio.pause(); else if (musicEnabled) bgAudio.play().catch(()=>{}); });
resetBtn.addEventListener('click', () => { game.reset(); renderHighscores(); bgAudio.pause(); });

// 键盘事件（避免与页面默认滚动冲突）
window.addEventListener('keydown', (e) => {
  if (/INPUT|TEXTAREA/.test(e.target.tagName)) return;
  switch (e.code) {
    case 'ArrowLeft': e.preventDefault(); game.move(-1); break;
    case 'ArrowRight': e.preventDefault(); game.move(1); break;
    case 'ArrowUp': e.preventDefault(); game.rotateCurrent(); break;
    case 'ArrowDown': e.preventDefault(); game.drop(); break;
    case 'Space': e.preventDefault(); game.hardDrop(); break;
  }
});

// 保存分数表单
saveForm.addEventListener('submit', (ev) => {
  ev.preventDefault();
  const name = playerName.value.trim() || '匿名';
  const score = Number(scoreEl.textContent) || 0;
  saveLocalScore(name, score);
  playerName.value = '';
  renderHighscores();
});

// 渲染本地排行榜
function renderHighscores() {
  const list = getLocalScores(10);
  highscoreList.innerHTML = '';
  for (const item of list) {
    const li = document.createElement('li');
    li.textContent = `${item.name} — ${item.score}`;
    highscoreList.appendChild(li);
  }
}

// 初始渲染
renderHighscores();
