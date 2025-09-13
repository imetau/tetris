// storage.js - 负责本地和远端（可选）高分的抽象
// 使用 localStorage 保存本地排行，同时支持可选后端 API（fetch）
// 导出函数：getLocalScores, saveLocalScore, fetchRemoteScores, postRemoteScore

const LS_KEY = 'tetris_highscores_v1';

// 得到本地排行（降序）
export function getLocalScores(limit = 10) {
  const raw = localStorage.getItem(LS_KEY);
  if (!raw) return [];
  try {
    const arr = JSON.parse(raw);
    if (!Array.isArray(arr)) return [];
    return arr.slice(0, limit);
  } catch (e) {
    console.error('解析本地成绩错误', e);
    return [];
  }
}

// 保存当前分数（带名字），并返回更新后的排行
export function saveLocalScore(name, score, maxEntries = 10) {
  const list = getLocalScores(maxEntries);
  const entry = { name: name || '匿名', score: Number(score) || 0, date: new Date().toISOString() };
  list.push(entry);
  // 按分数降序排列
  list.sort((a, b) => b.score - a.score);
  // 截断
  const trimmed = list.slice(0, maxEntries);
  localStorage.setItem(LS_KEY, JSON.stringify(trimmed));
  return trimmed;
}

// 可选：从远端获取排行。后端应实现 GET /scores 返回 JSON 数组
export async function fetchRemoteScores(apiBaseUrl, limit = 10) {
  if (!apiBaseUrl) throw new Error('未指定 API 地址');
  const res = await fetch(`${apiBaseUrl}/scores?limit=${limit}`);
  if (!res.ok) throw new Error('远端获取失败: ' + res.status);
  return res.json();
}

// 可选：向远端提交分数 POST /scores {name,score}
export async function postRemoteScore(apiBaseUrl, name, score) {
  if (!apiBaseUrl) throw new Error('未指定 API 地址');
  const res = await fetch(`${apiBaseUrl}/scores`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, score })
  });
  if (!res.ok) throw new Error('远端提交失败: ' + res.status);
  return res.json();
}
