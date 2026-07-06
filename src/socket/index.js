// FB股份 - Socket.IO 事件处理器（v3.0 原版游戏机制 + 旁观者 + 决策隐藏）

const GAME_VERSION = '20260703-5';

function setupSocketHandlers(io, socket, game) {
  const log = (msg) => console.log(`[${socket.id}] ${msg}`);

  // ==================== 个性化状态广播 ====================
  // 遍历房间内所有 socket，根据每个观看者的身份发送不同状态
  function broadcastState(eventName) {
    const sockets = io.sockets.sockets;
    for (const [, s] of sockets) {
      if (s.rooms && s.rooms.has('game-room')) {
        const viewerName = s.playerName || null;
        const isSpectator = s.isSpectator || false;
        // left 玩家也按旁观者权限看（能看到所有决策）
        const isLeftPlayer = viewerName && game.players[viewerName] && game.players[viewerName].left;
        const state = game.getStateFor(viewerName, isSpectator || isLeftPlayer);
        state._serverVersion = GAME_VERSION;
        s.emit(eventName, state);
      }
    }
  }

  // 注册/注销作弊玩家（根据 socket.isCheat 标记）
  function registerCheatStatus(socket) {
    const name = socket.playerName;
    if (!name) return;
    if (socket.isCheat && !socket.isSpectator) {
      game.addCheatPlayer(name);
    } else {
      game.removeCheatPlayer(name);
    }
  }
  function unregisterCheatPlayer(name) {
    game.removeCheatPlayer(name);
  }

  // ==================== 密码验证 ====================
  socket.on('auth', (data, callback) => {
    if (typeof callback !== 'function') callback = () => {};
    console.log(`[auth] 收到验证请求`);
    try {
      const { password } = data || {};
      if (!password) return callback({ error: '请输入密码' });
      const result = game.verifyPassword(password);
      if (!result.ok) {
        log(`验证失败：${result.error || '密码错误'}`);
        return callback({ error: result.error || '密码错误' });
      }
      socket.authenticated = true;
      socket.isCheat = result.isCheat;
      callback({ ok: true });
      log(`验证通过${result.isCheat ? '（作弊模式）' : ''}`);
    } catch (err) {
      log(`验证错误: ${err.message}`);
      callback({ error: '验证失败' });
    }
  });

  // ==================== 加入游戏 ====================
  socket.on('join', (data, callback) => {
    if (typeof callback !== 'function') callback = () => {};
    console.log(`[join] 收到请求:`, JSON.stringify(data));
    try {
      if (!socket.authenticated) {
        console.log(`[join] 未认证，拒绝`);
        return callback({ error: '请先输入密码' });
      }
      const { name } = data || {};
      if (!name || !name.trim()) {
        return callback({ error: '请输入用户名' });
      }

      const cleanName = name.trim();
      if (cleanName.length > 8 || !/^[\w\u4e00-\u9fff]+$/.test(cleanName)) {
        return callback({ error: '名字只能包含中文、字母、数字、下划线，且不超过8个字符' });
      }
      console.log(`[join] 尝试加入: "${cleanName}", 当前阶段: ${game.phase}, 玩家数: ${Object.keys(game.players || {}).length}`);

      // 重连/重入检测：同名玩家已在 players 中
      const existingPlayer = game.players && game.players[cleanName];
      if (existingPlayer) {
        if (existingPlayer.left) {
          // 已退出玩家重新进入 → 以旁观者身份加入（游戏进行中）或以新玩家加入（大厅）
          if (game.phase !== 'lobby') {
            const result = game.joinAsSpectator(cleanName);
            if (result.error) return callback({ error: result.error });
            socket.playerName = cleanName;
            socket.isSpectator = true;
            socket.join('game-room');
            callback({ ok: true, isSpectator: true });
            broadcastState('state_update');
            log(`${cleanName} 以旁观者身份重新进入（之前已退出）`);
            return;
          }
          // 大厅阶段：直接清除 left 状态，以玩家身份重新加入
          existingPlayer.left = false;
          existingPlayer.online = true;
          existingPlayer.decision = null;
          existingPlayer.confirmed = false;
          existingPlayer.lastSeen = Date.now();
          socket.playerName = cleanName;
          socket.isSpectator = false;
          socket.join('game-room');
          registerCheatStatus(socket);
          if (!game.host) game.host = cleanName;
          callback({ ok: true, reconnected: true, isHost: game.host === cleanName });
          broadcastState('state_update');
          log(`${cleanName} 在大厅重新加入（之前已退出）`);
          return;
        }

        if (!existingPlayer.online) {
          // 掉线重连：online=false, left=false
          const result = game.reconnect(cleanName);
          if (result.ok) {
            socket.playerName = cleanName;
            socket.isSpectator = false;
            socket.join('game-room');
            registerCheatStatus(socket);
            callback({ ok: true, reconnected: true });
            broadcastState('state_update');
            log(`${cleanName} 重连成功`);
            return;
          }
          return callback({ error: result.error });
        }

        // online=true：旧连接可能还"活着"（如僵尸 socket），强制踢掉让它重连
        // 检查旧 socket 是否还真实存在
        const oldSocket = findSocketByName(io, cleanName);
        if (oldSocket && oldSocket.id !== socket.id && oldSocket.connected) {
          // 旧 socket 确实还活着，拒绝同名
          return callback({ error: '该名字正在使用中，请换一个名字' });
        }
        // 旧 socket 已死但 online 标记未清理 → 强制 markOffline 再重连
        game.markOffline(cleanName);
        const result = game.reconnect(cleanName);
        if (result.ok) {
          socket.playerName = cleanName;
          socket.isSpectator = false;
          socket.join('game-room');
          registerCheatStatus(socket);
          callback({ ok: true, reconnected: true });
          broadcastState('state_update');
          log(`${cleanName} 强制重连（旧连接已失效）`);
          return;
        }
        return callback({ error: result.error });
      }

      // 游戏进行中 → 以旁观者身份加入
      if (game.phase !== 'lobby') {
        const result = game.joinAsSpectator(cleanName);
        console.log(`[join] GameEngine.joinAsSpectator 结果:`, JSON.stringify(result));

        if (result.error) return callback({ error: result.error });

        socket.playerName = cleanName;
        socket.isSpectator = true;
        socket.join('game-room');

        callback({ ok: true, isSpectator: true });

        // 广播更新（旁观者看到完整状态）
        broadcastState('state_update');
        log(`${cleanName} 以旁观者身份加入游戏`);
        return;
      }

      // 大厅阶段 → 以玩家身份加入
      const result = game.join(cleanName);
      console.log(`[join] GameEngine.join 结果:`, JSON.stringify(result));

      if (result.error) return callback({ error: result.error });

      socket.playerName = cleanName;
      socket.isSpectator = false;
      socket.join('game-room');
      registerCheatStatus(socket);

      callback({ ok: true, isHost: result.isHost });

      // 广播更新
      broadcastState('state_update');
      io.to('game-room').emit('player_joined', { name: cleanName });
      log(`${cleanName} 加入游戏`);
    } catch (err) {
      console.error(`[join] 异常:`, err);
      log(`加入错误: ${err.message}`);
      try {
        callback({ error: '加入失败: ' + err.message });
      } catch (cbErr) {
        console.error(`[join] callback 也失败了:`, cbErr);
      }
    }
  });

  // ==================== 开始游戏 ====================
  socket.on('start', (data, callback) => {
    if (typeof callback !== 'function') callback = () => {};
    try {
      if (!socket.playerName || socket.isSpectator) return callback({ error: '旁观者无法开始游戏' });
      const { rounds } = data || {};
      const result = game.start(rounds || 8, socket.playerName);
      if (result.error) return callback({ error: result.error });

      callback({ ok: true });

      // 广播：所有人切换到游戏界面
      broadcastState('game_started');
      log(`${socket.playerName} 开始了游戏`);
    } catch (err) {
      log(`开始错误: ${err.message}`);
      callback({ error: '开始失败' });
    }
  });

  // ==================== 提交决策 ====================
  socket.on('decide', (data, callback) => {
    if (typeof callback !== 'function') callback = () => {};
    try {
      if (!socket.playerName || socket.isSpectator) return callback({ error: '旁观者无法操作' });
      const { decision, leverage } = data || {};
      if (!decision) return callback({ error: '请选择决策' });

      const result = game.decide(socket.playerName, decision, leverage || 1);
      if (result.error) return callback({ error: result.error });

      callback({ ok: true });
      broadcastState('state_update');
      log(`${socket.playerName} 选择了 ${decision}`);
    } catch (err) {
      log(`决策错误: ${err.message}`);
      callback({ error: '提交失败' });
    }
  });

  // ==================== 确认决策 ====================
  socket.on('confirm', (data, callback) => {
    if (typeof callback !== 'function') callback = () => {};
    try {
      if (!socket.playerName || socket.isSpectator) return callback({ error: '旁观者无法确认' });
      const result = game.confirm(socket.playerName);
      if (result.error) return callback({ error: result.error });

      callback({ ok: true });

      if (result.allConfirmed) {
        // 结算完成，广播新状态
        broadcastState('round_settled');
      } else {
        broadcastState('state_update');
      }
      log(`${socket.playerName} 确认了决策`);
    } catch (err) {
      log(`确认错误: ${err.message}`);
      callback({ error: '确认失败' });
    }
  });

  // ==================== 下一轮（每人独立点"继续"，只给点击者切界面）====================
  socket.on('next_round', (data, callback) => {
    if (typeof callback !== 'function') callback = () => {};
    try {
      if (!socket.playerName || socket.isSpectator) return callback({ error: '旁观者无法操作' });
      const result = game.nextRound();
      if (result.error) return callback({ error: result.error });

      // 只给点击者返回个性化状态（点击者切到交易界面）
      const viewerName = socket.playerName;
      const isLeftPlayer = game.players[viewerName] && game.players[viewerName].left;
      callback({ ok: true, state: game.getStateFor(viewerName, isLeftPlayer) });

      // 只给旁观者和 left 玩家广播状态更新（他们需要看到最新的交易阶段）
      // 不给活跃玩家广播，避免他们被强制从结算页切到交易界面
      for (const [, s] of io.sockets.sockets) {
        if (s.rooms && s.rooms.has('game-room') && s.id !== socket.id) {
          const sName = s.playerName || null;
          const sIsSpec = s.isSpectator || false;
          const sIsLeft = sName && game.players[sName] && game.players[sName].left;
          if (sIsSpec || sIsLeft) {
            s.emit('state_update', game.getStateFor(sName, true));
          }
        }
      }

      if (result.gameOver) {
        broadcastState('game_over');
      }
      // 注意：不广播 round_started，每人独立点"继续"后自己切界面

      log(`${socket.playerName} 点击了继续，进入第 ${game.currentRound} 轮`);
    } catch (err) {
      log(`继续错误: ${err.message}`);
      callback({ error: '操作失败' });
    }
  });

  // ==================== 重新开始（每人独立点击，点击者才进入大厅）====================
  socket.on('restart', (data, callback) => {
    if (typeof callback !== 'function') callback = () => {};
    try {
      if (!socket.playerName) return callback({ error: '请先加入游戏' });

      // 读取前端传来的名字（可能被用户修改过）
      const newName = (data && data.name && data.name.trim()) || socket.playerName;

      if (game.phase === 'gameover') {
        // 第一个点击者：重置游戏，自己成为房主
        const result = game.restart(newName);
        if (result.error) return callback({ error: result.error });

        socket.playerName = newName;
        socket.isSpectator = false;
        registerCheatStatus(socket);
        callback({ ok: true, state: game.getStateFor(newName, false), isHost: true, phase: 'lobby' });

        // 广播：通知其他人有新局可加入（但不强制切屏）
        broadcastState('state_update');
        io.to('game-room').emit('game_reset', { by: newName, state: game.getState() });
        log(`${newName} 重新开始游戏（成为新房主）`);

      } else if (game.phase === 'lobby') {
        // 别人已经重启了，当前玩家点击「再来一局」→ join 大厅
        if (game.players[socket.playerName] || game.players[newName]) {
          // 已在大厅：如果名字变了就改名，否则直接返回状态
          if (newName !== socket.playerName) {
            if (game.players[newName]) return callback({ error: '名字已被使用' });
            const oldName = socket.playerName;
            const oldData = game.players[oldName];
            if (oldData) {
              delete game.players[oldName];
              game.players[newName] = oldData;
              if (game.host === oldName) game.host = newName;
            }
            socket.playerName = newName;
            broadcastState('state_update');
            log(`${oldName} 改名为 ${newName}`);
          }
          callback({ ok: true, state: game.getStateFor(newName, false), isHost: game.host === newName, phase: 'lobby' });
        } else {
          // 不在大厅（上一局的 left/破产玩家、旁观者），需要 join
          // 旁观者加入时要先从旁观者列表移除
          if (game.spectators.has(newName) || game.spectators.has(socket.playerName)) {
            game.spectators.delete(newName);
            game.spectators.delete(socket.playerName);
          }
          const result = game.join(newName);
          if (result.error) return callback({ error: result.error });

          socket.playerName = newName;
          socket.isSpectator = false;
          registerCheatStatus(socket);
          callback({ ok: true, state: game.getStateFor(newName, false), isHost: result.isHost, phase: 'lobby' });
          broadcastState('state_update');
          log(`${newName} 加入新一局大厅`);
        }

      } else {
        callback({ error: '游戏仍在进行中' });
      }
    } catch (err) {
      log(`重启错误: ${err.message}`);
      callback({ error: '操作失败' });
    }
  });

  // ==================== 改名（在大厅中改名，不创建新玩家）====================
  socket.on('rename', (data, callback) => {
    if (typeof callback !== 'function') callback = () => {};
    try {
      if (!socket.playerName) return callback({ error: '你不在游戏中' });
      const newName = (data && data.newName && data.newName.trim()) || '';
      if (!newName) return callback({ error: '请输入新名字' });
      if (newName === socket.playerName) return callback({ ok: true });

      if (game.phase !== 'lobby') return callback({ error: '只能在游戏大厅改名' });
      if (game.players[newName]) return callback({ error: '名字已被使用' });
      if (game.spectators.has(newName)) return callback({ error: '名字已被使用' });

      const oldName = socket.playerName;
      const playerData = game.players[oldName];
      if (!playerData) return callback({ error: '你不在游戏中' });

      // 改名：保留所有数据，只换 key
      delete game.players[oldName];
      game.players[newName] = playerData;
      if (game.host === oldName) game.host = newName;
      socket.playerName = newName;

      callback({ ok: true });
      broadcastState('state_update');
      log(`${oldName} 改名为 ${newName}`);
    } catch (err) {
      log(`改名错误: ${err.message}`);
      callback({ error: '操作失败' });
    }
  });

  // ==================== 强制结算 ====================
  socket.on('force_settle', (data, callback) => {
    if (typeof callback !== 'function') callback = () => {};
    try {
      if (!socket.playerName || socket.isSpectator) return callback({ error: '旁观者无法操作' });
      const result = game.forceSettle(socket.playerName);
      if (result.error) return callback({ error: result.error });

      callback({ ok: true });

      // 结算完成，广播
      broadcastState('round_settled');
      log(`${socket.playerName} 强制结束游戏`);
    } catch (err) {
      log(`强制结算错误: ${err.message}`);
      callback({ error: '操作失败' });
    }
  });

  // ==================== 游戏中踢人 ====================
  socket.on('kick_in_game', (data, callback) => {
    if (typeof callback !== 'function') callback = () => {};
    try {
      log(`[kick_in_game] 发起者=${socket.playerName}, isSpectator=${socket.isSpectator}, target=${data?.target}`);
      if (!socket.playerName) return callback({ error: '未登录' });
      const { target } = data || {};
      if (!target) return callback({ error: '请指定要踢出的玩家' });

      const result = game.kickInGame(target, socket.playerName);
      if (result.error) return callback({ error: result.error });

      unregisterCheatPlayer(target);
      callback({ ok: true });

      // 通知被踢的玩家
      const targetSocket = findSocketByName(io, target);
      if (targetSocket) {
        if (result.autoReset) {
          // 踢人后所有玩家退出 → 游戏已重置，断开被踢者
          targetSocket.emit('kicked', { by: socket.playerName, inGame: true, autoReset: true });
          targetSocket.leave('game-room');
          delete targetSocket.playerName;
          delete targetSocket.isSpectator;
        } else {
          targetSocket.emit('kicked', { by: socket.playerName, inGame: true });
        }
      }

      if (result.autoReset) {
        // 游戏已自动重置为 lobby，通知房间内所有人
        const resetBy = socket.playerName;
        for (const [, s] of io.sockets.sockets) {
          if (s.rooms && s.rooms.has('game-room')) {
            const viewerName = s.playerName || null;
            const isSpec = s.isSpectator || false;
            const isLeftPlayer = viewerName && game.players[viewerName] && game.players[viewerName].left;
            const state = game.getStateFor(viewerName, isSpec || isLeftPlayer);
            state._serverVersion = GAME_VERSION;
            s.emit('game_reset', { by: resetBy, state });
          }
        }
        log(`${socket.playerName} 踢出 ${target}，所有玩家已退出，游戏自动重置`);
      } else {
        if (result.gameOver) {
          broadcastState('game_over');
        } else if (result.settled) {
          broadcastState('round_settled');
        } else {
          broadcastState('state_update');
        }
        log(`${socket.playerName} 在游戏中踢出了 ${target}`);
      }
    } catch (err) {
      log(`游戏中踢人错误: ${err.message}`);
      callback({ error: '操作失败' });
    }
  });

  // ==================== 踢人（大厅）====================
  socket.on('kick', (data, callback) => {
    if (typeof callback !== 'function') callback = () => {};
    try {
      if (!socket.playerName) return callback({ error: '未登录' });
      const { target } = data || {};
      if (!target) return callback({ error: '请指定要踢出的玩家' });

      const result = game.kick(target, socket.playerName);
      if (result.error) return callback({ error: result.error });

      unregisterCheatPlayer(target);
      callback({ ok: true });

      broadcastState('state_update');
      io.to('game-room').emit('player_kicked', { target, by: socket.playerName });

      // 通知被踢的玩家
      const targetSocket = findSocketByName(io, target);
      if (targetSocket) {
        targetSocket.emit('kicked', { by: socket.playerName });
        targetSocket.disconnect(true);
      }
      log(`${socket.playerName} 踢出了 ${target}`);
    } catch (err) {
      log(`踢人错误: ${err.message}`);
      callback({ error: '操作失败' });
    }
  });

  // ==================== 离开游戏 ====================
  socket.on('leave', (data, callback) => {
    if (typeof callback !== 'function') callback = () => {};
    try {
      if (!socket.playerName) return callback({ error: '你已不在游戏中' });

      // 旁观者离开：删除旁观者身份，返回密码页
      if (socket.isSpectator) {
        const result = game.leaveSpectator(socket.playerName);
        if (result.error) return callback({ error: result.error });

        callback({ ok: true, deleted: true, wasSpectator: true });
        socket.leave('game-room');
        delete socket.playerName;
        delete socket.isSpectator;
        broadcastState('state_update');
        log(`${socket.playerName} 旁观者离开`);
        return;
      }

      const result = game.leave(socket.playerName);
      if (result.error) return callback({ error: result.error });

      callback({ ok: true, ...result });

      if (result.deleted) {
        // 大厅退出：断开连接，返回密码页
        const leftName = socket.playerName;
        unregisterCheatPlayer(leftName);
        socket.leave('game-room');
        delete socket.playerName;
        delete socket.isSpectator;
        broadcastState('state_update');
        io.to('game-room').emit('player_left', { name: leftName });
        log(`玩家 ${leftName} 离开大厅`);
      } else {
        // 游戏中退出
        if (result.autoReset) {
          // 所有玩家退出 → 游戏已自动重置为 lobby，断开离开者
          const leftName = socket.playerName;
          unregisterCheatPlayer(leftName);
          socket.leave('game-room');
          delete socket.playerName;
          delete socket.isSpectator;
          // 通知房间内所有人：游戏已重置
          for (const [, s] of io.sockets.sockets) {
            if (s.rooms && s.rooms.has('game-room')) {
              const sName = s.playerName || null;
              const isSpec = s.isSpectator || false;
              const isLeftPlayer = sName && game.players[sName] && game.players[sName].left;
              const state = game.getStateFor(sName, isSpec || isLeftPlayer);
              state._serverVersion = GAME_VERSION;
              s.emit('game_reset', { by: leftName, state });
            }
          }
          log(`玩家 ${leftName} 退出，所有玩家已离开，游戏自动重置`);
        } else {
          io.to('game-room').emit('player_quit', { name: socket.playerName });

          if (result.gameOver) {
            broadcastState('game_over');
          } else if (result.settled) {
            broadcastState('round_settled');
          } else {
            broadcastState('state_update');
          }
          log(`${socket.playerName} 退出了游戏（保留数据，变为旁观者）`);
        }
      }
    } catch (err) {
      log(`离开错误: ${err.message}`);
      callback({ error: '操作失败' });
    }
  });

  // ==================== 表情弹幕 ====================
  socket.on('emoji_react', (data) => {
    if (!socket.playerName) return;
    const { emoji } = data || {};
    if (!emoji || typeof emoji !== 'string' || emoji.length > 4) return;
    io.to('game-room').emit('emoji_react', { name: socket.playerName, emoji });
  });

  // ==================== 请求当前状态（重连后用） ====================
  socket.on('get_state', (data, callback) => {
    if (typeof callback !== 'function') callback = () => {};
    try {
      if (!socket.playerName) return callback({ error: '未登录' });
      const viewerName = socket.playerName;
      const isLeftPlayer = game.players[viewerName] && game.players[viewerName].left;
      const state = game.getStateFor(viewerName, socket.isSpectator || isLeftPlayer);
      state._serverVersion = GAME_VERSION;
      callback({ ok: true, state });
    } catch (err) {
      callback({ error: '获取状态失败' });
    }
  });

  // ==================== 按需获取游戏日志（结果页等场景）====================
  socket.on('get_game_log', (data, callback) => {
    if (typeof callback !== 'function') callback = () => {};
    try {
      if (!socket.playerName) return callback({ error: '未登录' });
      callback({ ok: true, gameLog: game.gameLog, bustStories: game.BUST_STORIES || [] });
    } catch (err) {
      callback({ error: '获取日志失败' });
    }
  });

  // ==================== 心跳 ====================
  socket.on('heartbeat', () => {
    if (socket.playerName) {
      if (socket.isSpectator) return;  // 旁观者不需要心跳
      game.updateLastSeen(socket.playerName);
    }
  });

  // ==================== 断开连接 ====================
  socket.on('disconnect', () => {
    if (socket.playerName) {
      if (socket.isSpectator) {
        game.spectators.delete(socket.playerName);
        log(`${socket.playerName} 旁观者断开连接`);
        broadcastState('state_update');
        return;
      }
      log(`${socket.playerName} 断开连接`);
      game.markOffline(socket.playerName);
      broadcastState('state_update');
      io.to('game-room').emit('player_offline', { name: socket.playerName });
    }
  });
}

// 根据玩家名查找 socket
function findSocketByName(io, name) {
  for (const [, s] of io.sockets.sockets) {
    if (s.playerName === name) return s;
  }
  return null;
}

module.exports = { setupSocketHandlers };
