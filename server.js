const express = require('express');
const { createServer } = require('http');
const { Server } = require('socket.io');
const path = require('path');

const { GameEngine } = require('./src/game/GameEngine');
const { setupSocketHandlers } = require('./src/socket');

const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer, {
  pingTimeout: 60000,
  pingInterval: 25000,
  cors: { origin: process.env.CORS_ORIGINS ? process.env.CORS_ORIGINS.split(',') : ['http://localhost:5000'], methods: ['GET', 'POST'] }
});

// 游戏引擎实例（全局单例）
const game = new GameEngine();

// 静态文件服务（禁止缓存 HTML，微信 WebView 缓存策略激进）
app.use(express.static(path.join(__dirname, 'public'), {
  setHeaders: (res, filePath) => {
    // HTML 文件强制不缓存
    if (filePath.endsWith('.html')) {
      res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
      res.setHeader('Pragma', 'no-cache');
      res.setHeader('Expires', '0');
    }
  }
}));

// 健康检查
app.get('/health', (req, res) => res.json({ ok: true, phase: game.phase }));

// Socket.IO 连接处理
io.on('connection', (socket) => {
  console.log(`[连接] ${socket.id}`);
  try {
    setupSocketHandlers(io, socket, game);
  } catch (err) {
    console.error(`[错误] 设置 Socket 处理器失败:`, err.message);
    socket.disconnect(true);
  }
});

// 启动服务器
const PORT = process.env.PORT || 5000;
httpServer.listen(PORT, () => {
  console.log(`✅ FB股份服务器已启动: http://localhost:${PORT}`);
  console.log(`✅ 房间密码: ${process.env.FBSTOCK_PASSWORD || '(未设置)'}`);
});

// 全局错误处理
process.on('uncaughtException', (err) => {
  console.error('[致命错误] 未捕获的异常:', err.message);
});
process.on('unhandledRejection', (err) => {
  console.error('[致命错误] 未处理的 Promise 拒绝:', err.message);
});
