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

// 背景音乐（使用 WebAudio 合成，避免依赖外部文件）
let audioCtx = null;
let musicInterval = null;
let musicEnabled = true;

function ensureAudioContext() {
  if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
}

function playTone(freq, duration = 0.2, type = 'sine', when = 0) {
  ensureAudioContext();
  const o = audioCtx.createOscillator();
  const g = audioCtx.createGain();
  o.type = type;
  o.frequency.value = freq;
  g.gain.value = 0.06;
  o.connect(g); g.connect(audioCtx.destination);
  const start = audioCtx.currentTime + when;
  o.start(start);
  o.stop(start + duration);
}

function startMusicLoop() {
  if (!musicEnabled) return;
  ensureAudioContext();
  if (musicInterval) return; // already running (旧名保留)
  // 新的实现：多首长曲目调度播放，自动切换且不重复
  const tracks = [];

  // 生成一个环境音轨（和弦 pad + 分解琶音），长度约 24s
  function makeAmbientTrack(rootFreq = 220) {
    const events = [];
    const duration = 24.0; // seconds
    // 和弦 pad: 每 4s 一个和弦
    const chords = [ [0,4,7], [5,9,12], [7,11,14], [4,7,11] ];
    for (let i=0;i<duration;i+=4) {
      const chord = chords[(i/4)%chords.length];
      for (const interval of chord) {
        events.push({t:i, freq: rootFreq * Math.pow(2, interval/12), dur:4.0, type:'sine', gain:0.02});
      }
    }
    // 分解琶音：短音每 0.5s
    for (let i=0;i<duration;i+=0.5) {
      const step = Math.floor((i*2) % 6);
      const freq = rootFreq * Math.pow(2, (step*2)/12);
      events.push({t:i+0.05, freq, dur:0.18, type:'triangle', gain:0.04});
    }
    return {events, duration};
  }

  // 生成一首带低音脉动与钟（约 22s）
  function makeRhythmicTrack(rootFreq = 110) {
    const events = [];
    const duration = 22.0;
    // 低音脉冲，每 0.5s 一个短音
    for (let i=0;i<duration;i+=0.5) {
      events.push({t:i, freq: rootFreq, dur:0.16, type:'sawtooth', gain:0.06});
      // 伴随高音钟声每 1s
      if (Math.floor(i) % 1 === 0) {
        events.push({t:i+0.08, freq: rootFreq * 3.5, dur:0.28, type:'sine', gain:0.03});
      }
    }
    // 点缀旋律
    for (let i=0.25;i<duration;i+=1.25) {
      const freq = rootFreq * Math.pow(2, (Math.floor(i*2)%7)/12);
      events.push({t:i+0.02, freq, dur:0.22, type:'triangle', gain:0.035});
    }
    return {events, duration};
  }

  // 生成温柔的序列乐曲（约 26s）
  function makeSequenceTrack(rootFreq = 196) {
    const events = [];
    const duration = 26.0;
    // 软垫和弦
    for (let i=0;i<duration;i+=6) {
      const intervals = [0,7,12];
      for (const it of intervals) events.push({t:i, freq: rootFreq * Math.pow(2, it/12), dur:6.0, type:'sine', gain:0.018});
    }
    // 旋律走向，较长的音符和延音
    for (let i=0;i<duration;i+=0.6) {
      const step = Math.floor(i / 0.6) % 8;
      const freq = rootFreq * Math.pow(2, (step*3 % 12)/12);
      events.push({t:i+0.05, freq, dur:0.38, type:'sine', gain:0.04});
    }
    return {events, duration};
  }

  tracks.push(makeAmbientTrack(220));
  tracks.push(makeRhythmicTrack(110));
  tracks.push(makeSequenceTrack(196));

  // 全局调度容器，便于停止
  musicState.scheduled = [];
  musicState.trackIndex = 0;
  musicState.tracks = tracks;
  musicState.playing = true;

  function scheduleTrack(idx) {
    const tr = tracks[idx];
    const startAt = audioCtx.currentTime + 0.05;
    for (const ev of tr.events) {
      const o = audioCtx.createOscillator();
      const g = audioCtx.createGain();
      o.type = ev.type || 'sine';
      o.frequency.value = ev.freq;
      g.gain.value = 0.0;
      o.connect(g); g.connect(audioCtx.destination);
      const s = startAt + ev.t;
      const e = s + (ev.dur || 0.2);
      g.gain.setValueAtTime(0, s);
      g.gain.linearRampToValueAtTime(ev.gain || 0.03, s + 0.02);
      g.gain.linearRampToValueAtTime(0.0001, e);
      o.start(s);
      o.stop(e + 0.02);
      musicState.scheduled.push(o);
      musicState.scheduled.push(g);
    }
    // 安排下一首在当前结束后播放（选择不重复）
    if (musicState.nextTimeout) clearTimeout(musicState.nextTimeout);
    musicState.nextTimeout = setTimeout(() => {
      if (!musicState.playing) return;
      // 选择不同曲目
      let next = Math.floor(Math.random() * tracks.length);
      if (tracks.length > 1 && next === musicState.trackIndex) next = (next + 1) % tracks.length;
      musicState.trackIndex = next;
      scheduleTrack(next);
    }, (tr.duration * 1000) - 200);
  }

  // 启动第一首
  scheduleTrack(0);
}

function stopMusicLoop() {
  if (musicState.nextTimeout) { clearTimeout(musicState.nextTimeout); musicState.nextTimeout = null; }
  if (musicState.scheduled && musicState.scheduled.length) {
    for (const n of musicState.scheduled) {
      try { if (n.stop) n.stop(); } catch(e){}
      try { if (n.disconnect) n.disconnect(); } catch(e){}
    }
    musicState.scheduled = [];
  }
  musicState.playing = false;
}

// 音乐状态记录（用于停止时清理）
const musicState = { scheduled: [], trackIndex:0, tracks:[], nextTimeout:null, playing:false };

// 在 UI 中添加曲目选择器
let musicSelect = document.getElementById('music-select');
if (!musicSelect) {
  musicSelect = document.createElement('select');
  musicSelect.id = 'music-select';
  musicSelect.style.marginTop = '8px';
  const panel = document.querySelector('.panel');
  const optA = document.createElement('option'); optA.value='0'; optA.textContent='氛围曲 A';
  const optB = document.createElement('option'); optB.value='1'; optB.textContent='节奏曲 B';
  const optC = document.createElement('option'); optC.value='2'; optC.textContent='序列曲 C';
  musicSelect.appendChild(optA); musicSelect.appendChild(optB); musicSelect.appendChild(optC);
  panel.appendChild(musicSelect);
}

musicSelect.addEventListener('change', () => {
  // 切换曲目：停止并播放所选曲目
  const idx = Number(musicSelect.value || 0);
  if (musicState.playing) {
    stopMusicLoop();
    musicState.trackIndex = idx;
    musicState.tracks = musicState.tracks; // 保持
    musicState.playing = false;
    // 启动并直接调度所选曲目
    // 我们复用 startMusicLoop 的内部 schedule 调度
    // 通过设置 musicState.trackIndex 并调用 schedule
    // 简单方式：直接调用 startMusicLoop 再设为所选索引
    musicState.trackIndex = idx;
    startMusicLoop();
  } else {
    // 仅记录索引，下一次播放时使用
    musicState.trackIndex = idx;
  }
});

// 新增：异形方块开关和 DOT 权重控件
let extraControls = document.getElementById('extra-controls');
if (!extraControls) {
  extraControls = document.createElement('div');
  extraControls.id = 'extra-controls';
  extraControls.style.marginTop = '8px';
  extraControls.innerHTML = `
    <label><input type="checkbox" id="extra-shapes-checkbox"> 启用异形方块</label><br/>
    <label>DOT 概率: <input type="range" id="dot-weight-range" min="0" max="0.5" step="0.01" value="0.05"> <span id="dot-weight-value">0.05</span></label>
  `;
  const panel = document.querySelector('.panel');
  panel.appendChild(extraControls);
}

const extraCheckbox = document.getElementById('extra-shapes-checkbox');
const dotRange = document.getElementById('dot-weight-range');
const dotValue = document.getElementById('dot-weight-value');
dotValue.textContent = dotRange.value;
dotRange.addEventListener('input', () => { dotValue.textContent = dotRange.value; });

// 游戏实例化逻辑：根据 UI 创建或重建游戏
let game = null;
// 简单音效：放置、开始、结束
function playEffect(type) {
  ensureAudioContext();
  switch(type) {
    case 'place': playTone(220, 0.06, 'square'); break;
    case 'start': playTone(880, 0.2, 'sine'); setTimeout(()=>playTone(660,0.15,'sine'),200); break;
    case 'gameover': playTone(130, 0.4, 'sawtooth'); break;
  }
}

function createGameFromUI() {
  const opts = {
    extraShapes: !!extraCheckbox.checked,
    dotWeight: parseFloat(dotRange.value)
  };
  game = new TetrisGame(ctx, nextCtx, (state) => {
    // 播放放置音
    if (state.placed) playEffect('place');
    scoreEl.textContent = state.score ?? 0;
    levelEl.textContent = state.level ?? 1;
    linesEl.textContent = state.lines ?? 0;
    if (state.gameOver) {
      stopMusicLoop();
      playEffect('gameover');
      // 在页面中显示 modal 而不是 alert
      showGameOverModal(state.score);
      renderHighscores();
    }
  }, opts);
}

// 初始化游戏
createGameFromUI();

// 将按钮事件改为基于当前 game 实例
startBtn.addEventListener('click', () => {
  // 点击视为用户交互，解锁音频
  ensureAudioContext();
  playEffect('start');
  if (musicEnabled) startMusicLoop();
  game.start();
  renderHighscores();
});
pauseBtn.addEventListener('click', () => {
  game.pause();
  pauseBtn.textContent = game.paused ? '继续' : '暂停';
  if (game.paused) stopMusicLoop(); else if (musicEnabled) startMusicLoop();
});
resetBtn.addEventListener('click', () => { game.reset(); renderHighscores(); stopMusicLoop(); });

// 当用户更改额外方块开关或 DOT 权重时，重建游戏以生效（保留分数会重置）
extraCheckbox.addEventListener('change', () => { createGameFromUI(); renderHighscores(); });
dotRange.addEventListener('change', () => { createGameFromUI(); renderHighscores(); });

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

// 保存分数表单（保持不变）
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

// 页面内 modal 实现
let modal = document.getElementById('gameover-modal');
if (!modal) {
  modal = document.createElement('div');
  modal.id = 'gameover-modal';
  modal.style.position = 'fixed';
  modal.style.left = '50%'; modal.style.top = '50%';
  modal.style.transform = 'translate(-50%,-50%)';
  modal.style.background = 'rgba(10,20,30,0.95)';
  modal.style.border = '1px solid rgba(255,255,255,0.06)';
  modal.style.padding = '16px';
  modal.style.borderRadius = '8px';
  modal.style.display = 'none';
  modal.style.zIndex = '9999';
  document.body.appendChild(modal);
}

function showGameOverModal(score) {
  modal.innerHTML = `<h3 style="margin:0 0 8px">游戏结束</h3><p>你的分数: ${score}</p><div style="display:flex;gap:8px;margin-top:8px"><button id="modal-save">保存分数</button><button id="modal-close">关闭</button></div>`;
  modal.style.display = 'block';
  document.getElementById('modal-close').addEventListener('click', () => { modal.style.display = 'none'; });
  document.getElementById('modal-save').addEventListener('click', () => { document.getElementById('player-name').focus(); modal.style.display = 'none'; });
}
