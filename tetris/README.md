Tetris (俄罗斯方块) 简易项目

运行：
1. 在项目目录运行一个静态服务器，例如：
   npx http-server -c-1 -p 8080
   然后打开 http://localhost:8080

或使用 VS Code Live Server 插件在 index.html 上右键 -> Open with Live Server。

说明：
- 本项目使用原生 ES Modules，游戏逻辑在 js/game.js，UI 在 js/ui.js，本地高分存储在 js/storage.js。
- 想部署后端排行榜，请参考项目说明添加一个简单的 REST API（POST /scores, GET /scores）。

后续改进建议见代码顶部注释。
