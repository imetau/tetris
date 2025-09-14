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

// 使 gameCanvas 可聚焦，以便恢复键盘输入
gameCanvas.tabIndex = 0;
nextCanvas.tabIndex = 0;

// 读取并恢复静音设置
const MUSIC_ENABLED_KEY = 'tetris_music_enabled';
const MUSIC_SELECTED_KEY = 'tetris_music_selected';
try { const stored = localStorage.getItem(MUSIC_ENABLED_KEY); if (stored !== null) musicEnabled = stored === 'true'; } catch(e) {}

// 音效函数（简短）
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

// 将之前的曲目生成函数抽出为全局工厂，供选择与预览使用
function makeAmbientTrack(rootFreq = 220) {
  const events = [];
  const duration = 24.0;
  const chords = [ [0,4,7], [5,9,12], [7,11,14], [4,7,11] ];
  for (let i=0;i<duration;i+=4) {
    const chord = chords[(i/4)%chords.length];
    for (const interval of chord) {
      events.push({t:i, freq: rootFreq * Math.pow(2, interval/12), dur:4.0, type:'sine', gain:0.02});
    }
  }
  for (let i=0;i<duration;i+=0.5) {
    const step = Math.floor((i*2) % 6);
    const freq = rootFreq * Math.pow(2, (step*2)/12);
    events.push({t:i+0.05, freq, dur:0.18, type:'triangle', gain:0.04});
  }
  return {events, duration};
}
function makeRhythmicTrack(rootFreq = 110) {
  const events = [];
  const duration = 22.0;
  for (let i=0;i<duration;i+=0.5) {
    events.push({t:i, freq: rootFreq, dur:0.16, type:'sawtooth', gain:0.06});
    if (Math.floor(i) % 1 === 0) {
      events.push({t:i+0.08, freq: rootFreq * 3.5, dur:0.28, type:'sine', gain:0.03});
    }
  }
  for (let i=0.25;i<duration;i+=1.25) {
    const freq = rootFreq * Math.pow(2, (Math.floor(i*2)%7)/12);
    events.push({t:i+0.02, freq, dur:0.22, type:'triangle', gain:0.035});
  }
  return {events, duration};
}
function makeSequenceTrack(rootFreq = 196) {
  const events = [];
  const duration = 26.0;
  for (let i=0;i<duration;i+=6) {
    const intervals = [0,7,12];
    for (const it of intervals) events.push({t:i, freq: rootFreq * Math.pow(2, it/12), dur:6.0, type:'sine', gain:0.018});
  }
  for (let i=0;i<duration;i+=0.6) {
    const step = Math.floor(i / 0.6) % 8;
    const freq = rootFreq * Math.pow(2, (step*3 % 12)/12);
    events.push({t:i+0.05, freq, dur:0.38, type:'sine', gain:0.04});
  }
  return {events, duration};
}

// 音乐库（可扩展）
const musicLibrary = [
  { id: 0, name: '氛围曲 A', make: () => makeAmbientTrack(220) },
  { id: 1, name: '节奏曲 B', make: () => makeRhythmicTrack(110) },
  { id: 2, name: '序列曲 C', make: () => makeSequenceTrack(196) },
  // 可额外增加更多曲目
];

// 音乐播放状态与计划
const musicState = { scheduled: [], trackIndex:0, tracks:[], nextTimeout:null, playing:false, selectedIndices: [] };
// 预览播放状态
let isPreviewing = false;
let previewActiveScheduled = [];
let previewTimers = {};

// 输入控制（键盘/触控）
let inputEnabled = true;
function setInputEnabled(enabled) {
  inputEnabled = !!enabled;
  // touch controls buttons
  [leftBtn, rightBtn, rotBtn, downBtn, dropBtn].forEach(b => { if (b) b.disabled = !inputEnabled; });
}

function stopPreview() {
  // 清理预览调度
  if (isPreviewing) {
    for (const n of previewActiveScheduled) {
      try { if (n.stop) n.stop(); } catch(e){}
      try { if (n.disconnect) n.disconnect(); } catch(e){}
    }
    previewActiveScheduled = [];
    // 清 timers
    for (const k in previewTimers) { try { clearInterval(previewTimers[k]); } catch(e){} previewTimers[k]=null; }
    // 重新启用所有预览按钮
    const previews = document.querySelectorAll('#music-list button');
    previews.forEach(b => { try { b.disabled = false; } catch(e){} });
    isPreviewing = false;
  }
}

// 播放一个轨道并安排后续（使用选中的轨目池）
function startMusicLoop() {
  if (!musicEnabled) return;
  ensureAudioContext();
  // 停止任何预览，避免混音
  stopPreview();
  // 清理上一次
  stopMusicLoop();
  // 根据选中构建 tracks
  const tracks = musicState.selectedIndices.map(i => (musicLibrary.find(t=>t.id===i)||musicLibrary[0]).make());
  if (!tracks.length) return;
  musicState.tracks = tracks;
  musicState.playing = true;
  musicState.trackIndex = 0;

  function scheduleTrack(idx) {
    const tr = musicState.tracks[idx];
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
    if (musicState.nextTimeout) clearTimeout(musicState.nextTimeout);
    musicState.nextTimeout = setTimeout(() => {
      if (!musicState.playing) return;
      // 从已选曲目中随机选择且避免与当前相同
      let next = Math.floor(Math.random() * musicState.tracks.length);
      if (musicState.tracks.length > 1 && next === idx) next = (next + 1) % musicState.tracks.length;
      scheduleTrack(next);
    }, (tr.duration * 1000) - 200);
  }
  scheduleTrack(musicState.trackIndex);
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

// 预览一首曲目（只播放短片段）
function previewTrackById(id) {
  // 先停止可能存在的预览或主播放
  stopPreview();
  stopMusicLoop();
  ensureAudioContext();
  isPreviewing = true;
  // 禁用所有预览按钮，防止同时点击
  const previews = document.querySelectorAll('#music-list button');
  previews.forEach(b => { try { b.disabled = true; } catch(e){} });
  const tr = (musicLibrary.find(t=>t.id===id)||musicLibrary[0]).make();
  const startAt = audioCtx.currentTime + 0.05;
  const stopAfter = Math.min(8000, tr.duration*1000); // 8s 片段
  const scheduled = [];
  const progEl = document.getElementById('music-prog-'+id);
  if (progEl) { progEl.max = stopAfter; progEl.value = 0; }
  let startTime = performance.now();
  for (const ev of tr.events) {
    if (ev.t*1000 > stopAfter) break;
    const o = audioCtx.createOscillator();
    const g = audioCtx.createGain();
    o.type = ev.type || 'sine';
    o.frequency.value = ev.freq;
    o.connect(g); g.connect(audioCtx.destination);
    const s = startAt + ev.t;
    const e = s + (ev.dur || 0.2);
    g.gain.setValueAtTime(0, s);
    g.gain.linearRampToValueAtTime(ev.gain || 0.03, s + 0.02);
    g.gain.linearRampToValueAtTime(0.0001, e);
    o.start(s);
    o.stop(e + 0.02);
    scheduled.push(o); scheduled.push(g);
    previewActiveScheduled.push(o); previewActiveScheduled.push(g);
  }
  // 更新进度
  if (previewTimers[id]) { clearInterval(previewTimers[id]); previewTimers[id] = null; }
  previewTimers[id] = setInterval(() => {
    const elapsed = performance.now() - startTime;
    if (progEl) progEl.value = Math.min(stopAfter, elapsed);
    if (elapsed > stopAfter) {
      clearInterval(previewTimers[id]); previewTimers[id] = null;
      for (const n of scheduled) { try{ if (n.stop) n.stop(); }catch(e){} try{ if (n.disconnect) n.disconnect(); }catch(e){} }
      if (progEl) progEl.value = 0;
      // 结束预览
      stopPreview();
    }
  }, 100);
  setTimeout(() => {
    if (previewTimers[id]) { clearInterval(previewTimers[id]); previewTimers[id] = null; }
    for (const n of scheduled) { try{ if (n.stop) n.stop(); }catch(e){} try{ if (n.disconnect) n.disconnect(); }catch(e){} }
    if (progEl) progEl.value = 0;
    stopPreview();
  }, stopAfter + 200);
}

// 在 UI 中创建可勾选曲目列表与预览按钮
let musicList = document.getElementById('music-list');
if (!musicList) {
  musicList = document.createElement('div');
  musicList.id = 'music-list';
  musicList.style.marginTop = '8px';
  const panel = document.querySelector('.panel');
  panel.appendChild(musicList);
}
function renderMusicList() {
  musicList.innerHTML = '<strong>曲目列表</strong><br/>';
  for (const track of musicLibrary) {
    const id = track.id;
    const checked = musicState.selectedIndices.includes(id);
    const cb = document.createElement('input'); cb.type='checkbox'; cb.value=id; cb.checked=checked; cb.id = 'music-cb-'+id;
    const label = document.createElement('label'); label.htmlFor = cb.id; label.style.marginRight='8px'; label.textContent = track.name;
    const preview = document.createElement('button'); preview.textContent='预览'; preview.style.marginLeft='6px';
    const durationSpan = document.createElement('span'); durationSpan.style.marginLeft='8px'; durationSpan.style.fontSize='12px'; durationSpan.style.color='#ccc';
    // 进度条（HTML progress）
    const prog = document.createElement('progress'); prog.max = 100; prog.value = 0; prog.style.marginLeft = '8px'; prog.style.verticalAlign='middle'; prog.id = 'music-prog-'+id;
    // 显示总时长（秒）
    durationSpan.textContent = (track.make().duration ? Math.round(track.make().duration) + 's' : '—');

    preview.addEventListener('click', (e)=>{ e.preventDefault(); previewTrackById(id); });
    cb.addEventListener('change', () => {
      if (cb.checked) {
        if (!musicState.selectedIndices.includes(id)) musicState.selectedIndices.push(id);
      } else {
        musicState.selectedIndices = musicState.selectedIndices.filter(x=>x!==id);
      }
      try { localStorage.setItem(MUSIC_SELECTED_KEY, JSON.stringify(musicState.selectedIndices)); } catch(e){}
    });
    const row = document.createElement('div');
    row.appendChild(cb); row.appendChild(label); row.appendChild(preview);
    row.appendChild(durationSpan); row.appendChild(prog);
    musicList.appendChild(row);
  }
}
renderMusicList();

// 确保 canvas 在点击或触摸时获得焦点，修复切换选项后键盘无效问题
gameCanvas.addEventListener('click', ()=> { try{ gameCanvas.focus(); }catch(e){} });
gameCanvas.addEventListener('touchstart', ()=> { try{ gameCanvas.focus(); }catch(e){} }, {passive:true});

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

// 更丰富的消行音效，基于同时消除层数播放更兴奋的效果
function playClearEffect(lines) {
  ensureAudioContext();
  if (!lines || lines <= 0) return;
  if (lines === 1) {
    playTone(440, 0.12, 'triangle');
  } else if (lines === 2) {
    playTone(520, 0.14, 'sine'); setTimeout(()=>playTone(660,0.12,'triangle'),120);
  } else if (lines === 3) {
    playTone(660, 0.18, 'sawtooth'); setTimeout(()=>playTone(880,0.14,'triangle'),120); setTimeout(()=>playTone(1040,0.1,'square'),240);
  } else {
    // 4 行或以上，短促兴奋序列
    playTone(880,0.12,'sawtooth'); setTimeout(()=>playTone(1100,0.12,'sine'),100); setTimeout(()=>playTone(1320,0.16,'triangle'),220);
  }
}

function createGameFromUI() {
  const opts = {
    extraShapes: !!extraCheckbox.checked,
    dotWeight: parseFloat(dotRange.value)
  };
  game = new TetrisGame(ctx, nextCtx, (state) => {
    // 根据 state.paused/gameOver 控制输入
    if (state.paused || state.gameOver) setInputEnabled(false); else setInputEnabled(true);

    // 播放放置音
    if (state.placed) playEffect('place');
    // 播放消行音效（如果有）
    if (state.cleared && state.cleared > 0) playClearEffect(state.cleared);
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
  // 创建后尝试恢复焦点到 canvas，确保键盘可用
  focusCanvasDelayed();
  // 隐藏可能遗留的遮罩，确保按钮可点
  hideOverlay();
  // 默认刚创建游戏时禁用输入，待玩家按开始启用
  setInputEnabled(false);
}

// 将按钮事件改为基于当前 game 实例
startBtn.addEventListener('click', () => {
  // 点击视为用户交互，解锁音频
  ensureAudioContext();
  playEffect('start');
  if (musicEnabled) startMusicLoop();
  game.start();
  renderHighscores();
  // 隐藏遮罩并启用输入
  hideOverlay();
  setInputEnabled(true);
});
pauseBtn.addEventListener('click', () => {
  game.pause();
  pauseBtn.textContent = game.paused ? '继续' : '暂停';
  if (game.paused) { stopMusicLoop(); setInputEnabled(false); } else if (musicEnabled) { startMusicLoop(); setInputEnabled(true); }
});
resetBtn.addEventListener('click', () => { game.reset(); renderHighscores(); stopMusicLoop(); setInputEnabled(false); hideOverlay(); });

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
  // 禁用输入并显示遮罩
  setInputEnabled(false);
  showOverlay('游戏结束');
  document.getElementById('modal-close').addEventListener('click', () => { modal.style.display = 'none'; hideOverlay(); });
  document.getElementById('modal-save').addEventListener('click', () => { document.getElementById('player-name').focus(); modal.style.display = 'none'; hideOverlay(); });
}

// 页面遮罩层用于在暂停或结束时阻止误触
let overlay = document.getElementById('ui-overlay');
function ensureOverlay() {
  if (!overlay) {
    overlay = document.createElement('div');
    overlay.id = 'ui-overlay';
    overlay.style.position = 'fixed';
    overlay.style.left = '0'; overlay.style.top = '0';
    overlay.style.width = '100%'; overlay.style.height = '100%';
    overlay.style.background = 'rgba(0,0,0,0.35)';
    overlay.style.zIndex = '9998';
    overlay.style.display = 'none';
    overlay.style.pointerEvents = 'none'; // 初始不拦截事件
    document.body.appendChild(overlay);
  }
}
function showOverlay(text='') { ensureOverlay(); overlay.style.display = 'block'; overlay.textContent = text; overlay.style.pointerEvents = 'auto'; }
function hideOverlay() { if (overlay) { overlay.style.display = 'none'; overlay.style.pointerEvents = 'none'; } }

// 增加更多曲目到 musicLibrary（若尚未存在）
(function addExtraTracks(){
  const nextId = musicLibrary.length;
  musicLibrary.push({ id: nextId, name: '弦乐环 A', make: () => makeAmbientTrack(164) });
  musicLibrary.push({ id: nextId+1, name: '轻快序列 D', make: () => makeSequenceTrack(246) });
  // 重新渲染列表以显示新增曲目
  renderMusicList();
})();

// 移动端触控按键（底部居中、大按钮，支持 pointerdown/pointerup）
let touchControls = document.getElementById('touch-controls');
if (!touchControls) {
  touchControls = document.createElement('div');
  touchControls.id = 'touch-controls';
  touchControls.style.position = 'fixed';
  touchControls.style.left = '50%';
  touchControls.style.bottom = '12px';
  touchControls.style.transform = 'translateX(-50%)';
  touchControls.style.display = 'flex';
  touchControls.style.gap = '8px';
  touchControls.style.zIndex = '9998';
  document.body.appendChild(touchControls);
}
function makeBtn(label, w=64, h=64) {
  const b = document.createElement('button'); b.textContent = label; b.style.width = w+'px'; b.style.height = h+'px'; b.style.borderRadius = '12px'; b.style.fontSize='18px'; b.style.opacity='0.9'; b.style.touchAction='none'; return b;
}
const leftBtn = makeBtn('←'); const rightBtn = makeBtn('→'); const rotBtn = makeBtn('旋'); const downBtn = makeBtn('↓'); const dropBtn = makeBtn('⬇');
leftBtn.addEventListener('pointerdown', (e)=>{ e.preventDefault(); game.move(-1); });
rightBtn.addEventListener('pointerdown', (e)=>{ e.preventDefault(); game.move(1); });
rotBtn.addEventListener('pointerdown', (e)=>{ e.preventDefault(); game.rotateCurrent(); });
downBtn.addEventListener('pointerdown', (e)=>{ e.preventDefault(); // 连续下落
  let id = setInterval(()=>{ try{ game.drop(); }catch(e){} }, 120); downBtn._holdId = id;
});
downBtn.addEventListener('pointerup', (e)=>{ e.preventDefault(); if (downBtn._holdId) { clearInterval(downBtn._holdId); downBtn._holdId = null; } });
dropBtn.addEventListener('pointerdown', (e)=>{ e.preventDefault(); game.hardDrop(); });
// 在 pointerup 时也清理可能的 hold
['pointerup','pointercancel','pointerleave'].forEach(evt => {
  downBtn.addEventListener(evt, ()=>{ if (downBtn._holdId) { clearInterval(downBtn._holdId); downBtn._holdId = null; } });
});
[ leftBtn, rightBtn, rotBtn, downBtn, dropBtn ].forEach(b=> touchControls.appendChild(b));

// 触控按钮标签替换为符号
rotBtn.textContent = '⟲';

// 创建后尝试恢复焦点到 canvas，确保键盘可用
function focusCanvasDelayed() { try{ setTimeout(()=>{ gameCanvas.focus(); },50); }catch(e){} }

// 在 createGameFromUI 调用后使用延迟聚焦

// 创建游戏实例（页面加载时）
createGameFromUI();

// 键盘输入处理：支持箭头和空格（硬降落），尊重 inputEnabled
window.addEventListener('keydown', (e) => {
  // 如果输入被禁用或在表单控件中输入则忽略
  const target = e.target;
  const tag = target && target.tagName ? target.tagName.toUpperCase() : '';
  if (!inputEnabled || tag === 'INPUT' || tag === 'TEXTAREA' || target.isContentEditable) return;

  switch (e.code) {
    case 'ArrowLeft':
      e.preventDefault(); try { game.move(-1); } catch(_){}
      break;
    case 'ArrowRight':
      e.preventDefault(); try { game.move(1); } catch(_){}
      break;
    case 'ArrowDown':
      e.preventDefault(); try { game.drop(); } catch(_){}
      break;
    case 'ArrowUp':
      e.preventDefault(); try { game.rotateCurrent(); } catch(_){}
      break;
    case 'Space':
      e.preventDefault(); try { game.hardDrop(); } catch(_){}
      break;
    case 'KeyP':
      // P 切换暂停
      e.preventDefault(); try { game.pause(); pauseBtn.textContent = game.paused ? '继续' : '暂停'; } catch(_){}
      break;
  }
});
