// FB股份 - 前端游戏逻辑（v3.0 原版UI + Socket.IO）
const GAME_VERSION = '20260703-5';
const COLORS = ['var(--blue)','#b39ddb','var(--amber)','#80cbc4','#f48fb1'];
const ICONS = {大涨:'🔥',小涨:'📈',持平:'➖',小跌:'📉',大跌:'💥'};
const DLABEL = {buy_all:'全买',buy_half:'半买',sell_all:'全卖',sell_half:'半卖',hold:'不动'};
const SENT_LABEL = {bullish:'利多信号',bearish:'利空信号',neutral:'中性消息'};

// HTML 转义，防止 XSS
function esc(s) { const d = document.createElement('div'); d.textContent = s; return d.innerHTML; }

let socket = null;
let myName = null;
let myLeverage = 1;
let myDecision = null;
let currentState = null;
let amSpectator = false;
let lastPhase = '';
let _heartbeatInterval = null;

// ==================== 杠杆火焰粒子系统 ====================
let _levParticleTimer = null;
const LEV_EMOJIS = ['🔥', '🔥', '🔥', '🔥', '🔥', '🔥', '✨', '💥', '☄️'];

function spawnLevParticles() {
  const card = document.querySelector('.pl-card.card-lev-buy.you') || document.querySelector('.pl-card.card-lev-buy');
  if (!card) return;
  const rect = card.getBoundingClientRect();
  for (let i = 0; i < 3; i++) {
    const el = document.createElement('span');
    el.className = 'lev-fire-particle';
    el.textContent = LEV_EMOJIS[Math.floor(Math.random() * LEV_EMOJIS.length)];
    // 从卡片内部随机位置迸发
    const startX = rect.left + 10 + Math.random() * (rect.width - 20);
    const startY = rect.top + 10 + Math.random() * (rect.height - 20);
    // 向四周迸发
    const px = (Math.random() - 0.5) * 80;
    const py = -(10 + Math.random() * 60);
    el.style.cssText = `left:${startX}px;top:${startY}px;position:fixed;--px:${px}px;--py:${py}px;animation-delay:${Math.random()*0.15}s`;
    document.body.appendChild(el);
    el.addEventListener('animationend', () => el.remove());
  }
}

function updateLevParticles() {
  // 清除旧定时器
  if (_levParticleTimer) { clearInterval(_levParticleTimer); _levParticleTimer = null; }
  const hasLev = document.querySelector('.pl-card.card-lev-buy');
  if (hasLev) {
    _levParticleTimer = setInterval(spawnLevParticles, 600);
  }
}

// ==================== 自定义模态框（替代alert，移动端即时显示） ====================
function showModal(message, icon = '') {
  const overlay = document.getElementById('modalOverlay');
  if (!overlay) { alert(message); return; }
  document.getElementById('modalMsg').textContent = message;
  document.getElementById('modalIcon').textContent = icon;
  overlay.style.display = 'flex';
  document.getElementById('modalOkBtn').onclick = () => { overlay.style.display = 'none'; };
}

// ==================== 版本不匹配强制刷新 ====================
let _versionChecked = false;
function checkVersion(state) {
  if (_versionChecked) return;
  if (!state) return;
  // 同步服务端 dlabel
  if (state.dlabel) Object.assign(DLABEL, state.dlabel);
  if (!state._serverVersion) return;
  if (state._serverVersion === GAME_VERSION) { _versionChecked = true; return; }
  // 版本不匹配：显示全屏遮罩，强制刷新
  const overlay = document.getElementById('versionMismatchOverlay');
  if (overlay) overlay.style.display = 'flex';
  _versionChecked = true; // 只弹一次
}

// 强制刷新（兼容微信 WebView 缓存）
// 微信内置浏览器对 location.reload() 不敏感，需要用 URL 破缓存参数
function forceRefresh() {
  const url = location.pathname + '?_t=' + Date.now();
  // 用 replace 避免浏览器历史堆叠
  location.replace(url);
}

// ==================== 初始化 ====================
document.addEventListener('DOMContentLoaded', () => {
  bindEvents();
});

function bindEvents() {
  // 密码
  const pwSubmit = () => onPasswordSubmit();
  document.getElementById('password-submit').addEventListener('click', pwSubmit);
  document.getElementById('password-input').addEventListener('keydown', e => { if (e.key === 'Enter') pwSubmit(); });

  // 加入游戏
  const joinClick = () => onUsernameSubmit();
  document.getElementById('username-submit').addEventListener('click', joinClick);
  document.getElementById('username-input').addEventListener('keydown', e => { if (e.key === 'Enter') joinClick(); });

  // leave-btn 已在 HTML 中通过 onclick 绑定，此处不再重复 addEventListener
}

// ==================== 界面切换 ====================
function showScreen(id) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  document.getElementById(id).classList.add('active');
  // emoji FAB 只在游戏/结算/结果/旁观者页面显示
  const showFab = ['game-screen','result-screen','spectator-screen'].includes(id);
  const fab = document.getElementById('emojiFabWrap');
  if (fab) fab.style.display = showFab ? 'block' : 'none';
  if (!showFab) closeEmojiPanel();
}

// ==================== 密码验证 ====================
function onPasswordSubmit() {
  const pw = document.getElementById('password-input').value;
  if (!pw) { setError('password-error', '请输入密码'); return; }
  clearError('password-error');

  if (socket) { socket.disconnect(); socket = null; }

  const btn = document.getElementById('password-submit');
  btn.textContent = '验证中...'; btn.disabled = true;

  socket = io({
    reconnection: true, reconnectionAttempts: 10,
    reconnectionDelay: 1000, timeout: 10000
  });

  socket.on('connect_error', (err) => {
    setError('password-error', '无法连接服务器：' + err.message);
    btn.textContent = '进入'; btn.disabled = false;
  });

  socket.emit('auth', { password: pw }, (res) => {
    if (res.error) {
      setError('password-error', res.error);
      socket.disconnect(); socket = null;
      btn.textContent = '进入'; btn.disabled = false;
      return;
    }
    initGameSocket();
    showScreen('lobby-screen');
    // 显示离开按钮
    document.getElementById('leave-btn').style.display = 'block';
    // 重置大厅输入表单
    resetLobbyForm();
    // 更新大厅列表
    updateLobbyList(currentState || { players: {}, host: null, phase: 'lobby' });
  });
}

// ==================== 加入游戏 ====================
let joining = false;
function onUsernameSubmit() {
  if (joining) return;
  const name = document.getElementById('username-input').value.trim();
  if (!name) { setError('username-error', '请输入昵称'); return; }
  clearError('username-error');

  if (!socket || !socket.connected) { setError('username-error', '连接已断开，请刷新页面'); return; }

  // 如果已经在游戏中且名字不同 → 发送改名请求
  if (myName && myName !== name) {
    joining = true;
    const btn = document.getElementById('username-submit');
    btn.textContent = '改名中...'; btn.disabled = true;
    socket.emit('rename', { newName: name }, (res) => {
      joining = false; btn.textContent = '改名'; btn.disabled = false;
      if (res && res.error) { setError('username-error', res.error); return; }
      myName = name;
      clearError('username-error');
    });
    return;
  }

  // 如果已经在游戏中且名字相同 → 不需要操作
  if (myName && myName === name) return;

  joining = true;
  const btn = document.getElementById('username-submit');
  btn.textContent = '加入中...'; btn.disabled = true;

  let responded = false;
  const timer = setTimeout(() => {
    if (!responded) {
      joining = false; btn.textContent = '加入游戏'; btn.disabled = false;
      setError('username-error', '服务器无响应，请稍后重试');
    }
  }, 5000);

  socket.emit('join', { name }, (res) => {
    if (responded) return;
    responded = true; clearTimeout(timer);
    joining = false; btn.textContent = '加入游戏'; btn.disabled = false;

    if (res.error) { setError('username-error', res.error); return; }

    myName = name;

    if (res.reconnected) {
      amSpectator = false;
      // 重连后主动拉取当前状态并切到对应界面
      socket.emit('get_state', {}, (stateRes) => {
        if (stateRes.error || !stateRes.state) {
          // fallback：留在当前界面等 state_update 推送
          btn.textContent = '改名';
          return;
        }
        currentState = stateRes.state;
        const phase = stateRes.state.phase;
        if (phase === 'trading') {
          lastPhase = 'trading';
          myDecision = null; myLeverage = 1;
          showScreen('game-screen');
          showGame(stateRes.state);
        } else if (phase === 'settlement') {
          lastPhase = 'settlement';
          showScreen('game-screen');
          showGame(stateRes.state);
        } else if (phase === 'gameover') {
          lastPhase = 'results';
          showScreen('result-screen');
          showResults(stateRes.state);
        } else {
          // lobby
          lastPhase = 'lobby';
          showScreen('lobby-screen');
          updateLobbyList(stateRes.state);
        }
      });
      btn.textContent = '改名';
      return;
    }

    if (res.isSpectator) {
      amSpectator = true;
      showScreen('spectator-screen');
      updateSpectatorUI(currentState);
      return;
    }

    amSpectator = false;
    // 加入成功后按钮变为"改名"，输入框保持可用
    btn.textContent = '改名';
  });
}

// ==================== 开始游戏 ====================
function onStartClick() {
  const rounds = parseInt(document.getElementById('roundSlider').value) || 10;
  socket.emit('start', { rounds }, (res) => {
    if (res.error) alert(res.error);
  });
}

// ==================== 决策系统 ====================
function setDecision(dec) {
  myDecision = dec;
  // 离开全买时重置杠杆
  if (dec !== 'buy_all') myLeverage = 1;
  socket.emit('decide', { decision: dec, leverage: myLeverage }, (res) => {
    if (res.error) { alert(res.error); return; }
  });
  // 即时重渲染卡片，更新按钮高亮
  if (currentState) renderTradingCards(currentState);
}

function toggleLeverage(lev) {
  if (myDecision !== 'buy_all') {
    showModal('请先选择全买操作', '🔒');
    return;
  }
  myLeverage = (myLeverage === lev) ? 1 : lev;
  socket.emit('decide', { decision: myDecision, leverage: myLeverage });
  // 即时重渲染卡片，更新杠杆按钮高亮
  if (currentState) renderTradingCards(currentState);
}

function confirmDecision() {
  if (!myDecision) { alert('请先选择操作'); return; }
  socket.emit('confirm', {}, (res) => {
    if (res.error) alert(res.error);
  });
}

// ==================== 下一轮 ====================
function onNextRoundClick() {
  socket.emit('next_round', {}, (res) => {
    if (res.error) { alert(res.error); return; }
    currentState = res.state;
    if (res.state.phase === 'gameover') {
      lastPhase = 'results';
      showScreen('result-screen');
      showResults(res.state);
    } else {
      lastPhase = 'trading';
      myDecision = null; myLeverage = 1;
      showScreen('game-screen');
      showGame(res.state);
    }
  });
}

// ==================== 重新开始 ====================
function onRestartClick() {
  // 读取输入框中的名字（可能被用户修改过），旁观者界面没有输入框则用 myName
  const nameInput = document.getElementById('username-input');
  const newName = nameInput ? ((nameInput.value || '').trim() || myName) : myName;

  socket.emit('restart', { name: newName }, (res) => {
    if (res.error) { alert(res.error); return; }
    currentState = res.state;
    amSpectator = false;
    myName = newName;
    myDecision = null; myLeverage = 1;
    lastPhase = 'lobby';
    if (nameInput) {
      // 玩家已在大厅，输入框保持可用（可改名），按钮变为"改名"
      nameInput.value = newName;
      nameInput.disabled = false;
      const btn = document.getElementById('username-submit');
      btn.style.display = 'block';
      btn.textContent = '改名';
    }
    showScreen('lobby-screen');
    updateLobbyList(res.state);
    setupHostUI(res.isHost);
  });
}

// ==================== 离开 / 踢人 / 强制结算 ====================
function onLeaveClick() {
  // 尚未加入（大厅未输入名字）→ 直接回到密码页
  if (!myName) {
    showScreen('password-screen');
    const btn = document.getElementById('password-submit');
    btn.textContent = '进入'; btn.disabled = false;
    clearError('password-error');
    resetLobbyForm();
    return;
  }

  if (!confirm('确定要离开吗？')) return;
  socket.emit('leave', {}, (res) => {
    if (!res || !res.ok) return;
    // 无论何种退出，都断开连接并回到密码页
    socket.io.opts.reconnection = false;
    socket.disconnect(); socket = null;
    myName = null; amSpectator = false;
    currentState = null; // 清除旧状态，避免重进时显示幽灵玩家
    showScreen('password-screen');
    const btn = document.getElementById('password-submit');
    btn.textContent = '进入'; btn.disabled = false;
    clearError('password-error');
    resetLobbyForm();
  });
}

function kickPlayer(target) {
  if (!confirm(`确定要踢出 ${target} 吗？`)) return;
  socket.emit('kick', { target }, (res) => {
    if (res.error) alert(res.error);
  });
}

function kickPlayerInGame(target) {
  if (!confirm(`确定要在游戏中踢出 ${target} 吗？\n被踢出的玩家将变为旁观者。`)) return;
  socket.emit('kick_in_game', { target }, (res) => {
    if (res.error) alert(res.error);
  });
}

function onForceSettle() {
  if (!confirm('确定要结束当前回合吗？\n所有未确认的玩家将自动选择"不动"。')) return;
  socket.emit('force_settle', {}, (res) => {
    if (res.error) alert(res.error);
  });
}

function onExportLog() {
  // 按需获取 gameLog（实时推送不含日志）
  socket.emit('get_game_log', {}, (res) => {
    if (res.error || !res.gameLog || !res.gameLog.length) { showModal('暂无游戏日志', '📄'); return; }
    const lines = ['FB股份 · 多人联机 · 游戏日志', '='.repeat(50)];
    res.gameLog.forEach((e) => {
      lines.push(`\n第 ${e.day} 天`);
      lines.push(`  消息: [${e.nType === 'public' ? '公开' : '小道'}] ${e.news}`);
      lines.push(`  结局: [${e.verdict}] ${e.outcome}`);
      lines.push(`  股价: ¥${e.oldPrice.toFixed(2)} → ¥${e.newPrice.toFixed(2)} (${e.move})`);
      e.players.forEach(p => {
        const d = p.postNW - p.preNW;
        lines.push(`    ${esc(p.name)}: ${p.action}${p.leverage > 1 ? ` X${p.leverage}` : ''} | ¥${p.preNW.toFixed(2)} → ¥${p.postNW.toFixed(2)} (${d >= 0 ? '+' : ''}${d.toFixed(2)})${p.bankrupt ? ' [破产]' : ''}`);
      });
    });
    lines.push(`\n${'='.repeat(50)}`);
    const blob = new Blob([lines.join('\n')], { type: 'text/plain;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'FB股份_多人_游戏日志.txt';
    a.click();
  });
}

// ==================== Socket 事件监听 ====================
function initGameSocket() {
  if (!socket) return;

  socket.on('disconnect', (reason) => {
    if (reason === 'io server disconnect' || reason === 'transport close') {
      alert('与服务器的连接已断开，请刷新页面');
    }
  });

  socket.on('reconnect', () => {
    const pw = document.getElementById('password-input').value;
    if (pw && socket) {
      socket.emit('auth', { password: pw }, (res) => {
        if (res.error) { alert('重连验证失败，请刷新页面'); return; }
        // 如果之前在游戏中，用原名字重连恢复身份
        if (myName) {
          socket.emit('join', { name: myName }, (r) => {
            if (r && r.ok) {
              if (r.reconnected || r.isSpectator) {
                // 恢复身份成功，等待 state_update 推送界面
              }
            }
          });
        }
      });
    }
  });

  // 状态更新
  socket.on('state_update', (state) => {
    checkVersion(state);
    currentState = state;
    updateLobbyList(state);
    if (document.getElementById('game-screen').classList.contains('active')) {
      // 如果我在结算页且服务器已进入交易阶段，不要自动切换
      // （每人独立点"继续"才进入交易界面）
      if (lastPhase === 'settlement' && state.phase === 'trading') {
        return;
      }
      showGame(state);
    }
    if (document.getElementById('spectator-screen').classList.contains('active')) {
      updateSpectatorUI(state);
    }
  });

  // 游戏开始
  socket.on('game_started', (state) => {
    checkVersion(state);
    currentState = state;
    if (!amSpectator) {
      lastPhase = 'trading';
      myDecision = null; myLeverage = 1;
      showScreen('game-screen');
      showGame(state);
    } else {
      updateSpectatorUI(state);
    }
  });

  // 结算完成
  socket.on('round_settled', (state) => {
    checkVersion(state);
    currentState = state;
    lastPhase = 'settlement';
    if (!amSpectator) {
      showScreen('game-screen');
      showGame(state);
    } else {
      updateSpectatorUI(state);
    }
  });

  // 游戏结束 — 所有人（包括旁观者、被踢出者）都显示结果页，可点"再来一局"
  socket.on('game_over', (state) => {
    checkVersion(state);
    currentState = state;
    lastPhase = 'results';
    showScreen('result-screen');
    showResults(state);
  });

  // 新局通知
  socket.on('game_reset', (data) => {
    checkVersion(data.state);
    currentState = data.state;
    // 游戏重置后，所有旁观者/left玩家回到大厅
    if (amSpectator) {
      amSpectator = false;
      lastPhase = 'lobby';
      showScreen('lobby-screen');
      updateLobbyList(data.state);
    } else if (myName && data.state.players && data.state.players[myName]) {
      lastPhase = 'lobby';
      if (document.getElementById('lobby-screen').classList.contains('active')) {
        updateLobbyList(data.state);
      } else {
        showScreen('lobby-screen');
        updateLobbyList(data.state);
      }
    }
    if (data.by !== myName) {
      const el = document.getElementById('final-results');
      if (el) {
        el.innerHTML = `<div style="background:var(--blue-bg);color:var(--blue);padding:10px 16px;border-radius:var(--radius-sm);margin-bottom:20px;font-size:14px;border:1px solid var(--blue)">🔔 ${data.by} 开始了新一局，点击「再来一局」加入</div>` + el.innerHTML;
      }
    }
  });

  // 被踢 — 先切换界面再弹模态框（避免state_update在alert阻塞期间引发渲染冲突）
  socket.on('kicked', (data) => {
    if (data.autoReset || !data.inGame) {
      // 游戏已重置或大厅踢人 → 断开连接，回到密码页
      socket.disconnect(); socket = null;
      myName = null; amSpectator = false;
      currentState = null;
      showScreen('password-screen');
      document.getElementById('password-submit').textContent = '进入';
      document.getElementById('password-submit').disabled = false;
      clearError('password-error');
      resetLobbyForm();
      showModal(data.autoReset ? '所有玩家已退出，游戏已重置' : `你被 ${data.by} 踢出了房间`, '⚠️');
    } else {
      amSpectator = true;
      showScreen('spectator-screen');
      updateSpectatorUI(currentState);
      showModal(`你被 ${data.by} 踢出了游戏！\n你已成为旁观者。`, '⚠️');
    }
  });

  // 表情弹幕
  socket.on('emoji_react', (data) => {
    createDanmaku(data.name, data.emoji);
  });

  // 心跳（存储 ID 以便清理）
  if (_heartbeatInterval) clearInterval(_heartbeatInterval);
  _heartbeatInterval = setInterval(() => {
    if (socket && socket.connected && !amSpectator) socket.emit('heartbeat');
  }, 30000);
}

// ==================== 大厅 UI ====================
function updateLobbyList(state) {
  if (!state) return;
  const players = state.players || {};
  const list = document.getElementById('players-list');
  if (!list) return;

  const entries = Object.entries(players);
  list.innerHTML = entries.length
    ? entries.map(([name, p], i) =>
        `<div class="pl-row${name === myName ? ' you' : ''}">
          <span class="pl-dot" style="background:${COLORS[i % 5]}"></span>
          <span class="pl-name">${esc(name)}${name === state.host ? ' 👑' : ''}</span>
          <span class="pl-status">${p.online ? '在线' : '离线'}</span>
          ${name !== myName ? `<button class="kick-btn" onclick="kickPlayer('${esc(name)}')">踢出</button>` : ''}
        </div>`
      ).join('')
    : '<div style="color:var(--text-dim);font-size:12px;padding:8px">等待玩家加入...</div>';

  // 更新房主UI（开始按钮和回合数滑块）— 每次state_update都检查，确保房主转移后新房主能看到开始按钮
  const isHost = myName && state.host === myName && state.phase === 'lobby';
  setupHostUI(isHost);

  const canStart = entries.length >= 1 && isHost;
  const startBtn = document.getElementById('start-btn');
  if (startBtn) {
    startBtn.disabled = !canStart;
    if (canStart) startBtn.textContent = `开始游戏 (${entries.length}位玩家)`;
  }
}

function setupHostUI(isHost) {
  document.getElementById('start-btn').style.display = isHost ? 'block' : 'none';
  document.getElementById('roundSlider').parentElement.parentElement.style.display = isHost ? 'block' : 'none';
}

// ==================== 游戏界面 ====================
function showGame(state) {
  if (!state) return;
  if (state.phase !== 'trading' && state.phase !== 'settlement') return;

  // 顶栏
  document.getElementById('dayInfo').textContent = `第 ${state.currentRound} 天 / 共 ${state.maxRounds} 天`;
  const pe = document.getElementById('stockPrice'), ce = document.getElementById('stockChange');
  const cp = state.currentPrice || 100;
  pe.textContent = `¥${cp.toFixed(2)}`; pe.className = 'price';
  const ph = state.priceHistory || [];
  if (ph.length >= 2) {
    const pv = ph[ph.length - 2], pct = ((cp - pv) / pv * 100);
    pe.classList.add(pct > 0 ? 'price-up' : pct < 0 ? 'price-down' : 'price-flat');
    ce.innerHTML = pct ? `${pct > 0 ? '+' : ''}${pct.toFixed(2)}%` : '';
    ce.style.color = pct > 0 ? 'var(--up)' : pct < 0 ? 'var(--down)' : 'var(--text-muted)';
  } else { pe.classList.add('price-flat'); ce.innerHTML = ''; }

  const phaseNames = { trading: '交易中', settlement: '结算', gameover: '已结束' };
  const pb = document.getElementById('phaseBadge');
  pb.textContent = phaseNames[state.phase] || '';
  pb.className = 'phase-badge ' + state.phase;

  const content = document.getElementById('gameContent');

  if (state.phase === 'trading') {
    renderTradingScreen(state, content);
  } else if (state.phase === 'settlement') {
    renderSettlementScreen(state, content);
  }
}

// ==================== 移动端 Dock 适配 ====================
function adjustDockSpacer() {
  const isMobile = window.innerWidth <= 600;
  document.querySelectorAll('.trading-dock-spacer').forEach(spacer => {
    const dock = spacer.nextElementSibling;
    if (dock && dock.classList.contains('trading-action-dock')) {
      spacer.style.height = isMobile ? dock.offsetHeight + 'px' : '0px';
    }
  });
}

let _lastIsMobile = window.innerWidth <= 600;
window.addEventListener('resize', () => {
  const isMobile = window.innerWidth <= 600;
  if (isMobile !== _lastIsMobile) {
    _lastIsMobile = isMobile;
    if (currentState) {
      if (currentState.phase === 'trading' &&
          document.getElementById('game-screen').classList.contains('active')) {
        renderTradingScreen(currentState, document.getElementById('gameContent'));
      } else if (currentState.phase === 'settlement' &&
                 document.getElementById('game-screen').classList.contains('active')) {
        renderSettlementScreen(currentState, document.getElementById('gameContent'));
      } else if (document.getElementById('result-screen').classList.contains('active')) {
        showResults(currentState);
      }
    }
  }
  adjustDockSpacer();
});

// ==================== 交易界面渲染 ====================
function renderTradingScreen(state, content) {
  const newsType = state.newsType || 'public';
  const newsHTML = `
    <div class="news-card">
      <div class="n-type ${newsType}">${newsType === 'public' ? '公开消息 (正常率80%)' : '小道消息 (正常率60%)'}</div>
      <div class="n-text">${state.newsText || ''}</div>
      <div class="n-sent">${SENT_LABEL[state.newsSentiment] || ''}</div>
    </div>`;
  const controlsHTML = `
    <div class="game-controls">
      <button class="danger-btn" onclick="onForceSettle()">⚠️ 结束本回合</button>
      <button class="quit-btn" onclick="onLeaveClick()">🚪 退出游戏</button>
    </div>`;
  const revealHTML = `
    <div class="reveal-bar">
      <span class="hint2" id="confirmHint">待确认: <span id="readyCount">0</span> / <span id="totalCount">0</span></span>
      <button class="btn primary" id="confirmGameBtn" onclick="confirmDecision()">确定</button>
    </div>`;

  if (window.innerWidth <= 600) {
    // 移动端：滚动区 + 固定底部 Dock
    content.innerHTML = `
      ${newsHTML}
      <div class="players-grid" id="playersGridTrading"></div>
      ${controlsHTML}
      <div class="trading-dock-spacer" id="tradingDockSpacer"></div>
      <div class="trading-action-dock" id="tradingActionDock">
        <div id="myCardContainer"></div>
        ${revealHTML}
      </div>
    `;
  } else {
    // 桌面端：原样布局
    content.innerHTML = `
      ${newsHTML}
      <div class="players-grid" id="playersGridTrading"></div>
      ${revealHTML}
      ${controlsHTML}
    `;
  }
  renderTradingCards(state);
  adjustDockSpacer();
}

function renderTradingCards(state) {
  const grid = document.getElementById('playersGridTrading');
  if (!grid) return;

  const myCardContainer = document.getElementById('myCardContainer');
  const isMobileDock = !!myCardContainer;

  const players = Object.entries(state.players);
  const activePlayers = players.filter(([,p]) => !p.bankrupt && !p.left);
  const confirmedCount = activePlayers.filter(([,p]) => p.confirmed).length;

  const readyEl = document.getElementById('readyCount');
  const totalEl = document.getElementById('totalCount');
  if (readyEl) readyEl.textContent = confirmedCount;
  if (totalEl) totalEl.textContent = activePlayers.length;

  const me = players.find(([n]) => n === myName);
  const iAmConfirmed = me && (me[1].confirmed || me[1].bankrupt || me[1].left);
  const confirmBtn = document.getElementById('confirmGameBtn');
  if (confirmBtn) {
    confirmBtn.disabled = iAmConfirmed || !myDecision;
    confirmBtn.textContent = !myDecision ? '请先选择操作' : (iAmConfirmed ? '已确定，等待其他玩家...' : '确定');
  }

  // 生成其他玩家卡片的 HTML（不含自己）
  function otherPlayerHTML([name, p], i) {
    const total = p.cash + p.shares * state.currentPrice;
    const dec = p.decision;
    const decLabel = DLABEL[dec] || '';
    const lev = p.leverage || 1;
    const prefix = lev > 1 ? `X${lev} ` : '';
    const tag = dec
      ? `<span class="pl-tag ${dec.includes('buy') ? 'buy' : dec.includes('sell') ? 'sell' : 'hold'}">${prefix}${decLabel}</span>`
      : (p.confirmed ? '<span class="pl-tag confirmed">已确定</span>' : '<span class="pl-tag waiting">决策中</span>');
    // 卡片颜色类名
    let cardCls = '';
    if (dec) {
      if (dec.includes('buy')) {
        cardCls = lev > 1 ? 'card-buy card-lev-buy' : 'card-buy';
      } else if (dec.includes('sell')) {
        cardCls = 'card-sell';
      }
    }

    if (p.bankrupt) {
      return `<div class="pl-card bankrupt"><div class="pl-head"><span class="pl-dot2" style="background:${COLORS[i%5]}"></span><span class="pl-name2">${esc(name)}</span><span style="color:var(--up);font-size:10px;font-weight:700">破产</span></div><div class="pl-stats">现金: ¥${p.cash.toFixed(2)}<br>持仓: ${p.shares} 股</div><div class="pl-nw">总资产: ¥${total.toFixed(2)}</div></div>`;
    }
    if (p.left) {
      return `<div class="pl-card left"><div class="pl-head"><span class="pl-dot2" style="background:${COLORS[i%5]}"></span><span class="pl-name2">${esc(name)}</span><span style="color:var(--text-muted);font-size:10px;font-weight:700">已退出</span></div><div class="pl-stats">现金: ¥${p.cash.toFixed(2)}<br>持仓: ${p.shares} 股</div><div class="pl-nw">总资产: ¥${total.toFixed(2)}</div></div>`;
    }
    return `<div class="pl-card ${cardCls}"><div class="pl-head"><span class="pl-dot2" style="background:${COLORS[i%5]}"></span><span class="pl-name2">${esc(name)}${name===state.host?' 👑':''}</span>${tag}<button class="kick-game-btn" onclick="kickPlayerInGame('${esc(name)}')">踢出</button></div><div class="pl-stats">现金: <span class="v">¥${p.cash.toFixed(2)}</span><br>持仓: <span class="v">${p.shares} 股</span></div><div class="pl-nw">总资产: ¥${total.toFixed(2)}</div></div>`;
  }

  // 生成我的可交互卡片 HTML
  function myCardHTML(name, p, i, compact) {
    const total = p.cash + p.shares * state.currentPrice;
    const canBuy = p.cash / state.currentPrice >= 1;
    const canSell = p.shares > 0;
    const isBuyAll = myDecision === 'buy_all', isBuyHalf = myDecision === 'buy_half';
    const isSellAll = myDecision === 'sell_all', isSellHalf = myDecision === 'sell_half';
    const isHold = myDecision === 'hold';
    const decLabel = DLABEL[myDecision] || '';
    const prefix = myLeverage > 1 ? `X${myLeverage} ` : '';
    const tag = myDecision
      ? `<span class="pl-tag ${myDecision.includes('buy') ? 'buy' : myDecision.includes('sell') ? 'sell' : 'hold'}">${prefix}${decLabel}</span>`
      : (p.confirmed ? '<span class="pl-tag confirmed">已确定</span>' : '<span class="pl-tag waiting">决策中</span>');
    // 卡片颜色/特效类名
    let myCardCls = 'you';
    if (myDecision) {
      if (myDecision.includes('buy')) {
        myCardCls += myLeverage > 1 ? ' card-buy card-lev-buy' : ' card-buy';
      } else if (myDecision.includes('sell')) {
        myCardCls += ' card-sell';
      }
    }
    const canLev = myDecision === 'buy_all';
    const btnsHTML = `
      <div class="btn-row buy-row">
        <button class="g-btn buy-h${isBuyHalf?' active':''}" ${!canBuy?'disabled':''} onclick="setDecision('buy_half')">买入50%</button>
        <div class="buy-all-group">
          <button class="g-btn buy${isBuyAll?' active':''}" ${!canBuy?'disabled':''} onclick="setDecision('buy_all')">全买</button>
          <button class="g-btn lv${myLeverage===5?' active':''}" ${!canLev?'disabled':''} onclick="toggleLeverage(5)">×5</button>
        </div>
      </div>
      <div class="btn-row sell-row">
        <button class="g-btn sell-h${isSellHalf?' active':''}" ${!canSell?'disabled':''} onclick="setDecision('sell_half')">卖出50%</button>
        <button class="g-btn sell${isSellAll?' active':''}" ${!canSell?'disabled':''} onclick="setDecision('sell_all')">卖出100%</button>
      </div>
      <div class="btn-row">
        <button class="g-btn hd${isHold?' active':''}" onclick="setDecision('hold')">不动</button>
      </div>`;

    if (compact) {
      // 移动端 Dock 内紧凑卡片
      return `<div class="pl-card ${myCardCls} dock-card">
        <div class="pl-head"><span class="pl-dot2" style="background:${COLORS[i%5]}"></span><span class="pl-name2">${esc(name)} (我)</span>${tag}</div>
        <div class="pl-stats">现金: <span class="v">¥${p.cash.toFixed(0)}</span> | 持股: <span class="v">${p.shares}</span> | 总资产: <span class="v">¥${total.toFixed(0)}</span></div>
        ${btnsHTML}
      </div>`;
    }

    // 桌面端完整卡片
    return `<div class="pl-card ${myCardCls}">
      <div class="pl-head"><span class="pl-dot2" style="background:${COLORS[i%5]}"></span><span class="pl-name2">${esc(name)} (我)${name===state.host?' 👑':''}</span>${tag}</div>
      <div class="pl-stats">现金: <span class="v">¥${p.cash.toFixed(2)}</span><br>持仓: <span class="v">${p.shares} 股</span> (¥${(p.shares*state.currentPrice).toFixed(2)})</div>
      <div class="pl-nw${total < 0 ? ' neg' : ''}">总资产: ¥${total.toFixed(2)}</div>
      <div class="sec-label">操作</div>
      ${btnsHTML}
    </div>`;
  }

  if (isMobileDock) {
    // 移动端：其他玩家 → 网格（保留原始索引以保持颜色一致），我的卡片 → Dock
    grid.innerHTML = players.map(([name, p], i) =>
      name === myName ? '' : otherPlayerHTML([name, p], i)
    ).join('');
    if (me && !me[1].bankrupt && !me[1].left) {
      myCardContainer.innerHTML = myCardHTML(me[0], me[1], players.findIndex(([n]) => n === myName), true);
    } else if (me && me[1].bankrupt) {
      myCardContainer.innerHTML = `<div class="pl-card bankrupt dock-card"><div class="pl-head"><span class="pl-name2">${esc(myName)} (已破产)</span></div></div>`;
    } else if (me && me[1].left) {
      myCardContainer.innerHTML = `<div class="pl-card left dock-card"><div class="pl-head"><span class="pl-name2">${esc(myName)} (已退出)</span></div></div>`;
    } else {
      myCardContainer.innerHTML = '';
    }
  } else {
    // 桌面端：所有玩家渲染到网格
    grid.innerHTML = players.map(([name, p], i) => {
      if (name === myName && !p.bankrupt && !p.left) {
        return myCardHTML(name, p, i, false);
      }
      return otherPlayerHTML([name, p], i);
    }).join('');
  }

  adjustDockSpacer();
  updateLevParticles();
}

// ==================== 结算界面渲染 ====================
function genPriceChart(priceHistory) {
  const ph = priceHistory || [100];
  const W = 760, H = 180, padL = 50, padR = 20, padT = 20, padB = 30;
  const cw = W - padL - padR, ch = H - padT - padB;
  const minP = Math.min(...ph), maxP = Math.max(...ph);
  const range = maxP - minP || 1;
  const stepX = ph.length > 1 ? cw / (ph.length - 1) : 0;

  const pts = ph.map((p, i) => {
    const x = padL + i * stepX;
    const y = padT + ch - ((p - minP) / range) * ch;
    return [x, y];
  });

  const linePath = pts.map((pt, i) => `${i === 0 ? 'M' : 'L'} ${pt[0].toFixed(1)} ${pt[1].toFixed(1)}`).join(' ');
  const areaPath = pts.length > 1
    ? `${linePath} L ${pts[pts.length - 1][0].toFixed(1)} ${padT + ch} L ${pts[0][0].toFixed(1)} ${padT + ch} Z`
    : '';

  const upColor = '#e85555', downColor = '#3cb870';
  const trend = ph[ph.length - 1] >= ph[0] ? upColor : downColor;

  // 涨跌色渐变
  const gradId = 'chartGrad';
  const gradStop = trend === upColor ? 'rgba(232,85,85,0.15)' : 'rgba(60,184,112,0.15)';

  // Y轴标签（3条线）
  const yLines = [minP, minP + range / 2, maxP];
  const yLabels = yLines.map((v, i) => {
    const y = padT + ch - (i / 2) * ch;
    return `<line x1="${padL}" y1="${y.toFixed(1)}" x2="${W - padR}" y2="${y.toFixed(1)}" stroke="#1c1c1c" stroke-width="1" stroke-dasharray="3,3"/>
            <text x="${padL - 8}" y="${(y + 4).toFixed(1)}" fill="#686878" font-size="10" text-anchor="end" font-family="monospace">¥${v.toFixed(1)}</text>`;
  }).join('');

  // X轴标签（天数）
  const xLabels = ph.length <= 1 ? '' : ph.map((p, i) => {
    if (ph.length > 10 && i % Math.ceil(ph.length / 8) !== 0 && i !== ph.length - 1) return '';
    const x = padL + i * stepX;
    return `<text x="${x.toFixed(1)}" y="${H - 8}" fill="#686878" font-size="10" text-anchor="middle">D${i + 1}</text>`;
  }).join('');

  // 数据点
  const dots = pts.map((pt, i) => {
    const isLast = i === pts.length - 1;
    return `<circle cx="${pt[0].toFixed(1)}" cy="${pt[1].toFixed(1)}" r="${isLast ? 4 : 2.5}" fill="${isLast ? trend : '#6ea8dc'}" ${isLast ? `stroke="#fff" stroke-width="1.5"` : ''}/>`;
  }).join('');

  // 最后一个点的价格标签
  const lastPt = pts[pts.length - 1];
  const lastLabel = `<text x="${(lastPt[0] + 8).toFixed(1)}" y="${lastPt[1].toFixed(1)}" fill="${trend}" font-size="12" font-weight="700" font-family="monospace">¥${ph[ph.length - 1].toFixed(2)}</text>`;

  return `<svg viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg">
    <defs><linearGradient id="${gradId}" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="${gradStop}"/>
      <stop offset="100%" stop-color="transparent"/>
    </linearGradient></defs>
    ${yLabels}
    ${areaPath ? `<path d="${areaPath}" fill="url(#${gradId})"/>` : ''}
    <path d="${linePath}" fill="none" stroke="${trend}" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>
    ${dots}
    ${lastLabel}
    ${xLabels}
  </svg>`;
}

function renderSettlementScreen(state, content) {
  const move = state.moveName || '';
  const mult = state.moveMult || 1;
  const oldPrice = state.settlementOldPrice || 100;
  const cp = state.currentPrice;
  const icons = {大涨:'🔥',小涨:'📈',持平:'➖',小跌:'📉',大跌:'💥'};
  const nw = state.settlementPreNW || {};
  const ob = (state.settlementBust || []).join(', ');

  let pnlRows = '';
  Object.entries(state.players).forEach(([name, p], i) => {
    const pre = nw[name] || 0;
    const post = p.netWorth;
    const delta = post - pre;
    const cls = delta > 0 ? 'pnl-up' : delta < 0 ? 'pnl-down' : 'pnl-flat';
    const dt = delta === 0 ? '--' : `${delta > 0 ? '+' : ''}¥${delta.toFixed(2)}`;
    const bustTag = (state.settlementBust || []).includes(name)
      ? ' <span style="color:var(--up);font-weight:700;font-size:11px">破产!</span>' : '';
    const leftTag = p.left ? ' <span style="color:var(--text-muted);font-size:11px">已退出</span>' : '';
    // 决策标签（仅自己/已退出/破产玩家可见，其他玩家隐藏）
    const decLabel = DLABEL[p.decision] || '';
    const levStr = p.leverage && p.leverage > 1 ? ` X${p.leverage}` : '';
    const decTag = decLabel ? `<span class="pnl-dec">${decLabel}${levStr}</span>` : '';
    // 持股和现金
    const shareVal = (p.shares * cp).toFixed(2);
    const metaStr = `持股 <b>${p.shares}</b> 股 (¥${shareVal}) · 现金 ¥${p.cash.toFixed(2)}`;

    pnlRows += `<div class="pnl-row">
      <div class="pnl-left">
        <span class="pn"><span class="pd" style="background:${COLORS[i%5]}"></span>${esc(name)}${bustTag}${leftTag}${decTag}</span>
        <span class="pnl-meta">${metaStr}</span>
      </div>
      <span class="pc ${cls}">${dt}</span>
    </div>`;
  });

  const verdict = state.newsNormal ? '正常结局' : '突发状况！';
  const vcls = state.newsNormal ? 'normal' : 'twist';

  const nextBtnText = state.currentRound >= state.maxRounds ? '查看最终排名' : '下一日';
  const mainContent = `
    <div class="settle-header">
      <div class="si">${icons[move] || ''}</div>
      <div class="sm" style="color:${mult > 1 ? 'var(--up)' : mult < 1 ? 'var(--down)' : 'var(--text-muted)'}">${move || ''}</div>
      <div class="sp">股价 ¥${oldPrice.toFixed(2)} → ¥${cp.toFixed(2)} (×${mult})</div>
      <div class="sv ${vcls}">${verdict}</div>
      <div class="ss">${state.outcomeText || ''}</div>
    </div>
    <div class="price-chart">
      <h3>股价走势</h3>
      ${genPriceChart(state.priceHistory)}
    </div>
    <div class="pnl-box"><h3>本轮结算</h3>${pnlRows}</div>
    ${ob ? `<div class="wait-others">${ob} 破产了！将在后续回合旁观。</div>` : ''}`;
  const revealHTML = `
    <div class="reveal-bar">
      <span class="hint2">结算完成</span>
      <button class="btn primary" onclick="onNextRoundClick()">${nextBtnText}</button>
    </div>`;
  const quitHTML = `<button class="quit-btn block" onclick="onLeaveClick()">🚪 退出游戏</button>`;

  if (window.innerWidth <= 600) {
    content.innerHTML = `
      ${mainContent}
      <div class="trading-dock-spacer" id="settleDockSpacer"></div>
      <div class="trading-action-dock" id="settleActionDock">
        ${revealHTML}
        ${quitHTML}
      </div>`;
  } else {
    content.innerHTML = `
      ${mainContent}
      ${revealHTML}
      <div class="game-controls" style="margin-top:8px">${quitHTML}</div>`;
  }
  adjustDockSpacer();
}

// ==================== 结果界面渲染 ====================
function showResults(state) {
  const el = document.getElementById('final-results');
  if (!el) return;

  const players = Object.entries(state.players)
    .filter(([,p]) => !p.left)
    .map(([name, p]) => ({
      name,
      cash: p.cash,
      shares: p.shares,
      netWorth: p.netWorth,
      bankrupt: p.bankrupt || p.netWorth <= 0,
      left: p.left
    }))
    .sort((a, b) => b.netWorth - a.netWorth);

  const fp = state.currentPrice || 100;

  // 摘要
  let html = `<h2>游戏结束</h2>`;
  html += `<div class="r-summary">FB股份发行价 ¥100 → 最终价 ¥${fp.toFixed(2)}<br>共 ${state.maxRounds} 个交易日，${players.length} 位玩家参与角逐</div>`;

  // 领奖台
  const rt = ['gold', 'silver', 'bronze'];
  const or = [1, 0, 2];
  const md = ['🥇', '🥈', '🥉'];
  const nm = ['冠军', '亚军', '季军'];
  const top3 = players.slice(0, 3);
  if (top3.length > 0) {
    html += '<div class="podium-row">';
    or.forEach(idx => {
      if (idx >= top3.length) return;
      const r = top3[idx];
      html += `<div class="ps ${rt[idx]}"><div class="pr">${nm[idx]}</div><div class="troy">${md[idx]}</div><div class="pn2">${esc(r.name)}</div><div class="pv">¥${r.netWorth.toFixed(2)}</div><div class="pb"></div></div>`;
    });
    html += '</div>';
  }

  // 破产名单
  const busted = players.filter(r => r.bankrupt);
  if (busted.length) {
    const sts = state.bustStories || [
      '在天桥底下摆摊，专给人算股票涨跌。',
      '债主堵门，连夜收拾行李去了泰国。',
      '资产归零，只剩「杠杆有风险」的纸条。',
      '正在火灾现场乐队的演出现场卖荧光棒还债。',
      '住在朋友家沙发上，每天靠泡面度日。'
    ];
    html += '<div class="bankrupt-v show"><strong>💥 破产名单</strong><br>';
    html += busted.map(p => `<strong>${esc(p.name)}</strong>：${sts[Math.floor(Math.random() * sts.length)]} (净资产 ¥${p.netWorth.toFixed(2)})`).join('<br>');
    html += '</div>';
  }

  // 排名表
  html += '<table class="rank-table"><thead><tr><th>#</th><th>玩家</th><th>现金</th><th>持股</th><th>总资产</th><th>收益率</th></tr></thead><tbody>';
  const rc = ['gold', 'silver', 'bronze', '', ''];
  players.forEach((r, i) => {
    const pnl = r.netWorth - 10000;
    const pp = (pnl / 10000 * 100);
    html += `<tr><td class="rn ${rc[i] || ''}">${i + 1}</td><td>${esc(r.name)}${r.bankrupt ? ' <span class="bust">破产</span>' : ''}</td><td>¥${r.cash.toFixed(2)}</td><td>${r.shares} 股</td><td style="font-weight:700;color:${r.netWorth >= 0 ? 'var(--text)' : 'var(--up)'}">¥${r.netWorth.toFixed(2)}</td><td class="${pnl >= 0 ? 'pnl-up' : 'pnl-down'}">${r.bankrupt ? '破产' : (pp >= 0 ? '+' : '') + pp.toFixed(1) + '%'}</td></tr>`;
  });
  html += '</tbody></table>';

  // 退出玩家（不在排名中，仅展示）
  const leftPlayers = Object.entries(state.players).filter(([,p]) => p.left);
  if (leftPlayers.length) {
    html += '<div class="r-summary" style="text-align:left">🚪 已退出玩家（不参与排名）<br>';
    html += leftPlayers.map(([name,p]) => `${esc(name)}: 净资产 ¥${p.netWorth.toFixed(2)}`).join('<br>');
    html += '</div>';
  }

  // 旁观者
  if (state.spectators && state.spectators.length) {
    html += `<div class="r-summary" style="text-align:left">👀 旁观者: ${state.spectators.join(', ')}</div>`;
  }

  // 按钮 — 移动端放入固定Dock
  if (window.innerWidth <= 600) {
    el.innerHTML = html + `
      <div class="trading-dock-spacer" id="resultDockSpacer"></div>
      <div class="trading-action-dock" id="resultActionDock">
        <button class="btn primary" onclick="onRestartClick()">再来一局</button>
        <button class="btn" onclick="onExportLog()">导出日志</button>
        <button class="btn quit-btn block" onclick="onLeaveClick()">返回大厅</button>
      </div>`;
  } else {
    el.innerHTML = html + `
      <button class="btn" onclick="onRestartClick()" style="margin-bottom:8px">再来一局</button>
      <button class="btn" onclick="onExportLog()">导出日志</button>
      <button class="btn quit-btn block" onclick="onLeaveClick()">返回大厅</button>`;
  }
  adjustDockSpacer();
}

// ==================== 旁观者界面 ====================
function updateSpectatorUI(state) {
  if (!state) return;
  const el = document.getElementById('spec-content');
  if (!el) return;

  const isMidGame = amSpectator;
  const isLeft = !amSpectator && myName && state.players[myName] && state.players[myName].left;
  const label = isMidGame ? '旁观模式（游戏中加入）' : '旁观模式（已退出游戏）';
  const msg = isMidGame
    ? '你没有游戏账户，无法操作，可查看所有玩家状态与决策'
    : '你已退出游戏，保留账户数据但不再参与操作';

  let html = `<h2>👀 ${label}</h2><p class="spec-info">${msg}</p>`;

  // 当前阶段
  if (state.phase === 'trading') {
    html += `<div class="news-card"><div class="n-type ${state.newsType || 'public'}">${state.newsType === 'rumor' ? '小道消息' : '公开消息'}</div><div class="n-text">${state.newsText || ''}</div></div>`;
    html += `<div style="margin:8px 0;color:var(--text-muted)">当前股价: ¥${state.currentPrice.toFixed(2)} | 第 ${state.currentRound}/${state.maxRounds} 轮</div>`;
  } else if (state.phase === 'settlement') {
    html += `<div class="news-card"><div class="n-type">结算</div><div class="n-text">${state.outcomeText || ''}</div></div>`;
    html += `<div style="margin:8px 0">第 ${state.currentRound} 轮结算完成  | 股价: ¥${state.currentPrice.toFixed(2)}</div>`;
  } else if (state.phase === 'gameover') {
    html += '<div style="text-align:center;padding:20px;color:var(--text-muted)">游戏已结束</div>';
  } else if (state.phase === 'lobby') {
    html += '<div style="text-align:center;padding:20px;color:var(--text-muted)">新一局已准备就绪</div>';
    html += `<button class="btn" onclick="onRestartClick()" style="margin:8px auto;display:block">加入新一局</button>`;
  }

  // 所有玩家状态（旁观者看到完整信息）
  html += '<h3 style="margin:16px 0 8px">玩家状态</h3>';
  const canKick = state.phase === 'lobby' || state.phase === 'trading' || state.phase === 'settlement';
  const kickFn = state.phase === 'lobby' ? 'kickPlayer' : 'kickPlayerInGame';
  for (const [name, p] of Object.entries(state.players)) {
    const kickBtn = canKick && !p.left ? `<button class="kick-game-btn" onclick="${kickFn}('${esc(name)}')">踢出</button>` : '';
    if (p.left) {
      html += `<div class="spec-player-card left-card">
        <div class="sp-head"><span class="sp-name">${esc(name)}</span><span style="color:var(--text-muted);font-size:11px">🚪 已退出</span></div>
        <div class="sp-stats">现金: ¥${p.cash.toFixed(2)} | 持仓: ${p.shares} | 净资产: ¥${p.netWorth.toFixed(2)}</div>
      </div>`;
    } else if (p.bankrupt) {
      html += `<div class="spec-player-card bust-card">
        <div class="sp-head"><span class="sp-name">${esc(name)}</span><span style="color:var(--up);font-size:11px">💀 破产</span>${kickBtn}</div>
        <div class="sp-stats">—</div>
      </div>`;
    } else {
      const conf = p.confirmed ? '✅ 已确认' : '⏳ 待确认';
      const decStr = p.decision ? `决策: ${DLABEL[p.decision] || p.decision}` : '决策: —';
      html += `<div class="spec-player-card">
        <div class="sp-head">
          <span class="sp-name">${esc(name)}</span>
          <span style="font-size:11px;color:var(--text-muted)">${conf}</span>
          ${kickBtn}
        </div>
        <div class="sp-stats">
          <span class="sp-decision">${decStr}</span>
          ${p.leverage && p.leverage > 1 ? `<span class="sp-leverage">杠杆 X${p.leverage}</span>` : ''}
          | 现金: ¥${p.cash.toFixed(2)} | 持仓: ${p.shares} | 净资产: ¥${p.netWorth.toFixed(2)}
        </div>
      </div>`;
    }
  }

  // 旁观者列表
  if (state.spectators && state.spectators.length) {
    html += '<h3 style="margin:12px 0 8px;color:var(--text-muted)">其他旁观者</h3>';
    state.spectators.forEach(sName => {
      if (sName !== myName) {
        html += `<div class="spec-player-card spectator-card"><span>${sName} 👀 旁观</span></div>`;
      }
    });
  }

  html += '<button class="btn quit-btn block" onclick="onLeaveClick()" style="margin-top:16px">返回密码界面</button>';
  el.innerHTML = html;
}

// ==================== 工具函数 ====================
function setError(id, msg) { document.getElementById(id).textContent = msg; }
function clearError(id) { document.getElementById(id).textContent = ''; }
function resetLobbyForm() {
  const input = document.getElementById('username-input');
  const btn = document.getElementById('username-submit');
  if (input) { input.value = ''; input.disabled = false; }
  if (btn) { btn.textContent = '加入游戏'; btn.disabled = false; btn.style.display = 'block'; }
}

// ==================== 弹幕表情系统 ====================
let _emojiPanelOpen = false;
let _lastEmojiTime = 0;
const _dmTracks = [false, false, false, false, false]; // 5条弹幕轨道占用状态
const _dmDuration = 5200; // 弹幕飞行时长 ms

function toggleEmojiPanel() {
  const panel = document.getElementById('emojiPanel');
  const fab = document.getElementById('emojiFab');
  if (!panel) return;
  _emojiPanelOpen = !_emojiPanelOpen;
  panel.style.display = _emojiPanelOpen ? 'grid' : 'none';
  if (fab) fab.classList.toggle('active', _emojiPanelOpen);
}

function closeEmojiPanel() {
  _emojiPanelOpen = false;
  const panel = document.getElementById('emojiPanel');
  const fab = document.getElementById('emojiFab');
  if (panel) panel.style.display = 'none';
  if (fab) fab.classList.remove('active');
}

function sendEmoji(emoji) {
  // 冷却 1.2 秒防刷屏
  const now = Date.now();
  if (now - _lastEmojiTime < 1200) return;
  _lastEmojiTime = now;

  closeEmojiPanel();
  if (socket && socket.connected && myName) {
    socket.emit('emoji_react', { emoji });
  }
}

function createDanmaku(name, emoji) {
  const layer = document.getElementById('danmakuLayer');
  if (!layer) return;

  // 找一条空闲轨道
  let trackIdx = _dmTracks.indexOf(false);
  if (trackIdx === -1) trackIdx = Math.floor(Math.random() * 5); // 全忙则随机覆盖
  _dmTracks[trackIdx] = true;

  const el = document.createElement('div');
  el.className = 'danmaku-item';
  el.innerHTML = `<span class="dm-name">${esc(name)}</span><span class="dm-emoji">${esc(emoji)}</span>`;

  // 轨道高度：层高的 1/5，加少量随机偏移
  const layerH = layer.clientHeight || 200;
  const trackH = layerH / 5;
  const top = trackIdx * trackH + Math.random() * (trackH - 32);
  el.style.top = Math.max(0, top) + 'px';
  el.style.animationDuration = _dmDuration + 'ms';

  layer.appendChild(el);

  // 飞行结束后清理
  setTimeout(() => {
    el.remove();
    _dmTracks[trackIdx] = false;
  }, _dmDuration);
}

// 点击面板外部关闭
document.addEventListener('click', (e) => {
  if (!_emojiPanelOpen) return;
  const wrap = document.getElementById('emojiFabWrap');
  if (wrap && !wrap.contains(e.target)) closeEmojiPanel();
});
