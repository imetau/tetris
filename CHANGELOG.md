# Changelog

All notable changes to this project will be documented in this file.

## [0.2.2] - 2025-09-14
### Added
- 响应式现代化布局：顶部菜单（左侧菜单、居中站点标题、右侧登录/注册），画布区域顶对齐并能根据视口高度/宽度自适应缩放，移动端自动折叠右侧面板至底部。
- 屏幕中央“欢迎/开始”覆盖层（供开始、重新开始、游戏结束返回），并在游戏结束时自动显示重玩按钮，简化触控操作流程。
- 新增临时开发调试面板（右上）以显示当前方块类型/坐标、分数与运行状态，便于定位渲染与循环问题。

### Changed
- UI 重构与兼容性修复：将异形方块/ DOT 控件、曲目列表等动态插入点切换到新的 `#extra-controls-holder` / 右侧面板，避免因旧布局隐藏导致控件“消失”。
- 画布渲染与缩放：保持 canvas 内部像素逻辑尺寸（10×20 blocks），并使用 CSS 控制显示尺寸；新增 `adaptCanvasDisplaySize()` 以在高度受限时按高度收缩，避免画面超出视口。
- 游戏启动与渲染：在 `TetrisGame.start()` 中确保首帧可见（若 spawn 在视野上方则下移至 y=0）并立即绘制一次，修复点击“开始”后短时间内看不到方块的问题。
- 异形方块开关行为：切换“启用异形方块”或调整 DOT 概率会重建游戏实例以应用新选项，同时尽量保留原先是否在运行的状态（会尝试在原来为运行时重启）。
- 键盘/触控输入健壮性：添加全局键盘处理器并尊重 `inputEnabled` 以及表单输入焦点；触控按钮与画布中心点击用于暂停/继续，移动端控件尺寸调整为触控友好比例。
- 方块视觉：将 T 形方块颜色调亮以提高可见性。

### Fixed
- 修复“保存当前分数”表单行为：`save-score-form` 的 submit 处理现在会调用 `saveLocalScore(name, score)` 并立即刷新本地排行榜显示。
- 修复异形方块复选框在新布局下未插入到可见区域的问题（插入点回退策略以避免崩溃）。
- 修复游戏结束遮罩（overlay）阻塞交互的问题：隐藏/显示 overlay 时正确设置 `pointer-events`，并保证“重新开始”会重建并启动游戏实例。
- 修复多处因布局变动导致的 DOM 插入错误与空引用，增强容错性并在缺失元素时回退到安全容器（`.right-panel` 或 `document.body`）。

### DevOps / Notes
- 在仓库内新增/更新 GitHub Actions workflow（CI + gh-pages 部署配置）。注意：最初部署尝试遇到 Actions token 权限限制（403），已更新 workflow 权限并建议在仓库设置中给予 Actions 写权限或使用 PAT 作为 secret 以完成 gh-pages 自动推送。
- 在多次调试过程中创建并保留了备份分支（例如 `backup-before-rollback`、`backup-before-revert-976c9d2`），以便回滚与比较历史状态。
- 调试日志：在 `game.js` 中临时添加少量日志用于排查首帧渲染问题，后续可移除以减少控制台噪音。

---

## [0.2.0] - 2025-09-14
### Added
- 支持额外异形方块（U, P, W, V, X, Y）。
- 新增单点方块 `DOT`（1x1），作为稀有奖励，带闪烁效果。
- 使用权重生成机制，可通过 `dotWeight` 调整 DOT 出现概率。
- 在 UI 中添加“启用异形方块”复选框和“DOT 概率”滑块（即时生效，重建游戏实例）。
- 使用 WebAudio API 添加合成背景音乐，并提供静音/播放切换。
- CI：添加 GitHub Actions 工作流，自动运行检查并部署到 GitHub Pages（`gh-pages` 分支）。

### Changed
- `js/game.js`：扩展方块池、权重选择、DOT 闪烁、代码结构清理。
- `js/ui.js`：新增音频合成、控制按钮、选项控件、使用 UI 配置创建游戏实例。

### DevOps
- 提交并推送最新代码到 `main` 分支。
- 新增 CI 工作流 `.github/workflows/ci.yml`，部署目录为 `tetris/`。

## [0.1.0] - 初始版本
- 基本的 Tetris 游戏（Canvas, localStorage 高分，基本控制）。
