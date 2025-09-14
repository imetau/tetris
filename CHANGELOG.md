# Changelog

All notable changes to this project will be documented in this file.

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
