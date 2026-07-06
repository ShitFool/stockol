// FB股份 - 游戏引擎（v3.0 原版机制 + Socket.IO 实时）
//
// 决策系统：buy_all / buy_half / sell_all / sell_half / hold
// 杠杆：X2 / X5 toggle（不选 = x1）
// 新闻：public(正常率80%) / rumor(正常率60%)
// 情绪：bullish / bearish / neutral

const fs = require('fs');
const path = require('path');
const { NEWS_DB, BUST_STORIES } = require('./newsData');

const MOVE_SMALL = {
  bullish:  { name: '小涨', mult: 1.25 },
  bearish: { name: '小跌', mult: 0.8  },
  neutral:  { name: '持平', mult: 1.0  }
};

const MOVE_BIG = {
  bullish:  { name: '大涨', mult: 2.0 },
  bearish: { name: '大跌', mult: 0.5 }
};

// 操作标签
const DLABEL = {
  buy_all: '全买', buy_half: '半买',
  sell_all: '全卖', sell_half: '半卖',
  hold: '不动'
};

class GameEngine {
  constructor() {
    this.PASSWORD = process.env.FBSTOCK_PASSWORD || '';
    this.resetState();
    this.NEWS_DB = NEWS_DB;
    this.BUST_STORIES = BUST_STORIES;

    // 作弊配置：从 JSON 文件加载，支持热加载
    this.cheatConfigPath = path.join(__dirname, 'cheat-config.json');
    this.cheatPassword = null;
    this.loadCheatConfig();
    fs.watchFile(this.cheatConfigPath, { interval: 1000 }, () => {
      this.loadCheatConfig();
    });
  }

  // 从 JSON 文件加载作弊配置（文件不存在或解析失败时不报错，使用安全默认值）
  loadCheatConfig() {
    try {
      if (fs.existsSync(this.cheatConfigPath)) {
        const raw = fs.readFileSync(this.cheatConfigPath, 'utf-8');
        const config = JSON.parse(raw);
        this.cheatPassword = (config.password && typeof config.password === 'string') ? config.password : null;
        console.log(`[作弊] 配置已加载: password=${this.cheatPassword ? '***' : '(未设置)'}`);
      }
    } catch (err) {
      console.error(`[作弊] 配置文件读取失败: ${err.message}`);
      this.cheatPassword = null;
    }
  }

  // ==================== 状态管理 ====================
  resetState() {
    this.phase = 'lobby';
    this.maxRounds = 8;
    this.currentRound = 0;
    this.currentPrice = 100;
    this.priceHistory = [100];
    this.players = {};
    this.spectators = new Set();
    this.host = null;
    this.newsItem = null;
    this.newsText = '';
    this.newsType = '';
    this.newsSentiment = '';
    this.outcomeText = '';
    this.move = null;
    this.newsNormal = null;
    this.settlementPreNW = {};     // 结算前净资产
    this.settlementOldPrice = 100; // 结算前价格
    this.settlementBust = [];      // 本轮破产名单
    this.gameLog = [];             // 游戏日志（导出用）
    this.lastKickTime = {};
    this.cheatName = null;
    this.cheatPlayers = new Set();  // 以作弊密码登录的玩家名
  }

  // ==================== 密码验证 ====================
  verifyPassword(password) {
    if (password === this.PASSWORD) return { ok: true, isCheat: false };
    if (this.cheatPassword && password === this.cheatPassword) {
      if (this.cheatPlayers.size > 0) return { ok: false, isCheat: false, error: '作弊通道已被占用' };
      return { ok: true, isCheat: true };
    }
    return { ok: false, isCheat: false };
  }

  // ==================== 作弊玩家管理 ====================
  addCheatPlayer(name) {
    this.cheatPlayers.add(name);
  }
  removeCheatPlayer(name) {
    this.cheatPlayers.delete(name);
  }

  // ==================== 玩家操作 ====================
  join(name) {
    if (!name || typeof name !== 'string') return { error: '请输入名字' };
    if (name.length < 1 || name.length > 8) return { error: '名字需1-8个字符' };
    if (!/^[\w\u4e00-\u9fff]+$/.test(name)) return { error: '名字只能包含中文、字母、数字、下划线' };
    if (this.phase !== 'lobby') return { error: '游戏已开始，请以旁观者身份加入' };
    if (this.players[name])    return { error: '名字已被使用' };
    if (this.spectators.has(name)) return { error: '名字已被使用（旁观者）' };
    if (Object.keys(this.players).length >= 5) return { error: '最多5个玩家' };

    this.players[name] = {
      cash: 10000, shares: 0, leverage: 1,
      decision: null, confirmed: false,
      bankrupt: false, left: false, debt: 0,
      lastSeen: Date.now(), online: true
    };
    if (!this.host) this.host = name;
    return { ok: true, isHost: this.host === name };
  }

  joinAsSpectator(name) {
    if (!name || typeof name !== 'string' || name.length < 1 || name.length > 8 || !/^[\w\u4e00-\u9fff]+$/.test(name)) return { error: '名字不合法' };
    if (this.phase === 'lobby') return { error: '游戏尚未开始，请以玩家身份加入' };
    if (this.players[name] && !this.players[name].left) return { error: '名字已被使用（玩家）' };
    if (this.spectators.has(name)) return { error: '名字已被使用（旁观者）' };
    this.spectators.add(name);
    return { ok: true, isSpectator: true };
  }

  leaveSpectator(name) {
    if (!this.spectators.has(name)) return { error: '你不是旁观者' };
    this.spectators.delete(name);
    return { ok: true };
  }

  kick(target, by) {
    if (!this.players[target]) return { error: '玩家不存在' };
    const now = Date.now();
    if (this.lastKickTime[target] && now - this.lastKickTime[target] < 5000)
      return { error: '操作太频繁，请稍后再试' };
    this.lastKickTime[target] = now;
    delete this.players[target];
    delete this.lastKickTime[target];
    // 如果踢出的是房主，自动转移给第一个剩余玩家
    if (this.host === target) this._reassignHost();
    return { ok: true, message: `${target} 已被踢出` };
  }

  leave(name) {
    if (!this.players[name]) return { error: '你已不在游戏中' };
    if (this.phase === 'lobby') {
      delete this.players[name];
      if (this.host === name && Object.keys(this.players).length > 0)
        this.host = Object.keys(this.players)[0];
      if (Object.keys(this.players).length === 0) this.host = null;
      return { ok: true, deleted: true };
    }

    // 游戏中退出 → 标记 left
    this.players[name].left = true;
    this.players[name].online = false;
    if (this.phase === 'trading') {
      this.players[name].decision = 'hold';
      this.players[name].confirmed = true;
    }
    if (this.host === name) this._reassignHost();

    // 触发结算/游戏结束检查
    const postLeave = this._checkPostLeaveState();
    if (Object.keys(postLeave).length > 0) return { ok: true, ...postLeave };
    return { ok: true, deleted: false };
  }

  // 转让房主给第一个活跃玩家（非 left、非 bankrupt）
  _reassignHost() {
    const active = Object.entries(this.players).filter(([,p]) => !p.left && !p.bankrupt);
    this.host = active.length > 0 ? active[0][0] : null;
  }

  // 玩家离开后检查：是否触发结算/游戏结束/重置
  _checkPostLeaveState() {
    const allConfirmed = Object.values(this.players)
      .filter(p => !p.bankrupt && !p.left).every(p => p.confirmed);
    if (allConfirmed && this.phase === 'trading') {
      this.executeSettlement();
      const after = Object.values(this.players).filter(p => !p.left && !p.bankrupt).length;
      if (after === 0) { this.resetState(); return { settled: true, gameOver: true, autoReset: true }; }
      return { settled: true };
    }
    const activeCount = Object.values(this.players).filter(p => !p.left && !p.bankrupt).length;
    if (activeCount === 0) {
      this.resetState();
      return { gameOver: true, autoReset: true };
    }
    return {};
  }

  updateLastSeen(name) {
    if (this.players[name]) { this.players[name].lastSeen = Date.now(); this.players[name].online = true; }
  }
  markOffline(name) {
    if (this.players[name]) this.players[name].online = false;
  }
  reconnect(name) {
    const p = this.players[name];
    if (!p) return { error: '玩家不存在，请先加入游戏' };
    if (p.online) return { error: '该玩家已在游戏中（可能从其他设备连接）' };
    if (p.left) return { error: '你已离开游戏，无法重连' };
    p.online = true;
    p.lastSeen = Date.now();
    return { ok: true, reconnected: true };
  }

  // ==================== 开始游戏 ====================
  start(rounds, byName) {
    if (this.phase !== 'lobby') return { error: '游戏已开始' };
    if (Object.keys(this.players).length < 1) return { error: '至少需要1名玩家才能开始' };
    if (this.host !== byName) return { error: `只有房主(${this.host})才能开始游戏` };
    const r = Number(rounds) || 8;
    if (r < 3 || r > 30) return { error: '轮数需在3-30之间' };
    this.maxRounds = r;
    this.currentRound = 1;
    this.phase = 'trading';
    this.generateDay();
    return { ok: true };
  }

  // ==================== 生成新闻 ====================
  generateDay() {
    const ntype = Math.random() < 0.5 ? 'public' : 'rumor';
    const normalChance = ntype === 'public' ? 0.8 : 0.6;
    this.newsNormal = Math.random() < normalChance;

    let sentiment;
    if (ntype === 'public') {
      const r = Math.random();
      sentiment = r < 0.4 ? 'bullish' : (r < 0.6 ? 'neutral' : 'bearish');
    } else {
      sentiment = Math.random() < 0.5 ? 'bullish' : 'bearish';
    }

    const pool = this.NEWS_DB.filter(n => n.s === sentiment && n.type === ntype);
    const item = pool.length > 0 ? this.randomPick(pool) : this.randomPick(this.NEWS_DB);

    this.newsItem      = item;
    this.newsText      = item.msg;
    this.newsType      = ntype;
    this.newsSentiment = sentiment;
    this.outcomeText   = this.newsNormal ? item.normal : item.twist;

    // 计算涨跌
    if (ntype === 'public') {
      if (sentiment === 'bullish')
        this.move = this.newsNormal ? MOVE_SMALL.bullish : MOVE_SMALL.bearish;
      else if (sentiment === 'bearish')
        this.move = this.newsNormal ? MOVE_SMALL.bearish : MOVE_SMALL.bullish;
      else
        this.move = this.newsNormal ? MOVE_SMALL.neutral : (Math.random() < 0.5 ? MOVE_SMALL.bullish : MOVE_SMALL.bearish);
    } else {
      if (sentiment === 'bullish')
        this.move = this.newsNormal ? MOVE_BIG.bullish : MOVE_BIG.bearish;
      else
        this.move = this.newsNormal ? MOVE_BIG.bearish : MOVE_BIG.bullish;
    }

    // 玩家状态清理（decision/confirmed/leverage 已在 nextRound 中重置，此处只做补充）
    for (const p of Object.values(this.players)) {
      if (!p.bankrupt && !p.left) {
        p.debt = 0;  // 清零负债（结算后应已还清，此为安全兜底）
      } else {
        p.decision = 'hold'; p.confirmed = true;
      }
    }

    // 检测作弊玩家是否在场
    this.cheatName = null;
    for (const name of this.cheatPlayers) {
      const p = this.players[name];
      if (p && !p.bankrupt && !p.left) {
        this.cheatName = name;
        break;
      }
    }
  }

  // ==================== 提交决策 ====================
  decide(name, decision, leverage) {
    if (this.phase !== 'trading') return { error: '当前不是交易阶段' };
    if (!this.players[name])  return { error: '你不在游戏中' };
    if (this.players[name].bankrupt) return { error: '你已破产' };
    if (this.players[name].left) return { error: '你已退出游戏' };
    const validDecisions = ['buy_all', 'buy_half', 'sell_all', 'sell_half', 'hold'];
    if (!validDecisions.includes(decision)) return { error: '无效的决策' };
    this.players[name].decision = decision;
    this.players[name].leverage = [1, 5].includes(leverage) ? leverage : 1;
    return { ok: true };
  }

  confirm(name) {
    if (!this.players[name]) return { error: '你不在游戏中' };
    this.players[name].confirmed = true;
    const allConfirmed = Object.values(this.players)
      .filter(p => !p.bankrupt && !p.left).every(p => p.confirmed);
    if (allConfirmed && Object.values(this.players).some(p => !p.bankrupt && !p.left)) {
      this.executeSettlement();
      return { ok: true, allConfirmed: true };
    }
    return { ok: true, allConfirmed: false };
  }

  // ==================== 结算（详细版：支持 buy_all/half, sell_all/half）====================
  executeSettlement() {
    // 防重入：如果已经在结算中或已结算过本轮，跳过
    if (this._settling) return;
    this._settling = true;
    try {
    const price = this.currentPrice;
    this.settlementPreNW = {};
    this.settlementOldPrice = price;

    // 结算前：按决策和杠杆执行交易
    for (const [name, p] of Object.entries(this.players)) {
      if (p.bankrupt || p.left) continue;
      this.settlementPreNW[name] = p.cash + p.shares * price;
      const dec = p.decision || 'hold';
      const lev = p.leverage || 1;

      if (dec === 'buy_all' || dec === 'buy_half') {
        const budget = dec === 'buy_all' ? p.cash : p.cash / 2;
        if (budget <= 0) continue;

        if (lev === 1) {
          const s = Math.floor(budget / price);
          p.shares += s;
          p.cash -= s * price;
        } else {
          const bp  = budget * lev;
          const com = bp * 0.1;           // 10% 手续费
          const net = bp - com;
          const s   = Math.floor(net / price);
          const cost = s * price;
          const pc  = cost / lev;         // 自有资金部分
          p.shares += s;
          p.cash -= pc;
          p.debt += cost - pc;
        }
      } else if (dec === 'sell_all' || dec === 'sell_half') {
        const toSell = dec === 'sell_all' ? p.shares : Math.ceil(p.shares / 2);
        const sv = toSell * price;
        p.cash += sv;
        p.shares -= toSell;
        // 还债
        if (p.debt > 0) {
          const repay = Math.min(p.debt, sv);
          p.cash -= repay;
          p.debt -= repay;
        }
      }
      // hold: 不动
    }

    // 作弊覆盖：作弊玩家的决策决定消息结局——重新选一条方向一致的新闻
    if (this.cheatName && this.players[this.cheatName] && this.players[this.cheatName].decision) {
      const cp = this.players[this.cheatName];
      const isBuy = cp.decision === 'buy_all' || cp.decision === 'buy_half';
      const targetSentiment = isBuy ? 'bullish' : 'bearish';
      this.newsNormal = true;
      this.newsSentiment = targetSentiment;
      if (this.newsType === 'public') {
        this.move = isBuy ? MOVE_SMALL.bullish : MOVE_SMALL.bearish;
      } else {
        this.move = isBuy ? MOVE_BIG.bullish : MOVE_BIG.bearish;
      }
      // 重新从 NEWS_DB 筛选一条与作弊方向一致的新闻
      const cheatPool = this.NEWS_DB.filter(n => n.s === targetSentiment && n.type === this.newsType);
      if (cheatPool.length > 0) {
        const cheatItem = this.randomPick(cheatPool);
        this.newsItem = cheatItem;
        this.newsText = cheatItem.msg;
        this.outcomeText = cheatItem.normal;
      } else {
        this.outcomeText = this.newsItem.normal;
      }
    }

    // 价格变动
    this.currentPrice = Math.round(price * this.move.mult * 100) / 100;

    // 退市检查：股价低于10元则退市，所有持股归零
    if (this.currentPrice < 10) {
      this.currentPrice = 0;
      for (const p of Object.values(this.players)) {
        if (p.bankrupt || p.left) continue;
        p.shares = 0;
      }
    }
    this.priceHistory.push(this.currentPrice);

    // 负债清算（股价为0时直接用现金抵债）
    for (const p of Object.values(this.players)) {
      if (p.debt > 0) {
        if (this.currentPrice > 0 && p.shares > 0) {
          const sts = Math.ceil(p.debt / this.currentPrice);
          const actual = Math.min(sts, p.shares);
          const recovered = actual * this.currentPrice;
          p.shares -= actual;
          p.debt -= recovered;
        }
        if (p.debt > 0) { p.cash -= p.debt; p.debt = 0; }
      }
    }

    // 破产检查
    this.settlementBust = [];
    for (const [name, p] of Object.entries(this.players)) {
      const nw = p.cash + p.shares * this.currentPrice;
      if (nw <= 0 && !p.bankrupt) {
        p.bankrupt = true;
        this.settlementBust.push(name);
      }
    }

    // 记录日志（保留最近 30 轮）
    this.gameLog.push({
      day: this.currentRound,
      news: this.newsText,
      nType: this.newsType,
      outcome: this.outcomeText,
      verdict: this.newsNormal ? '正常' : '突发',
      oldPrice: price,
      newPrice: this.currentPrice,
      move: this.move.name,
      sentiment: this.newsSentiment,
      players: Object.entries(this.players).map(([name, p]) => ({
        name,
        action: DLABEL[p.decision || 'hold'] || '不动',
        leverage: p.leverage || 1,
        preNW: this.settlementPreNW[name] || 0,
        postNW: p.cash + p.shares * this.currentPrice,
        bankrupt: this.settlementBust.includes(name)
      }))
    });

    this.phase = 'settlement';
    // gameLog 上限 30 条
    if (this.gameLog.length > 30) this.gameLog = this.gameLog.slice(-30);
    } finally {
      this._settling = false;
    }
  }

  // ==================== 下一轮（幂等）====================
  nextRound() {
    if (this.phase === 'trading') return { ok: true, alreadyInTrading: true };
    if (this.phase === 'gameover') return { ok: true, gameOver: true };
    if (this.phase !== 'settlement') return { error: '当前不是结算阶段' };
    // 检查是否还有活跃玩家
    const activeCount = Object.values(this.players).filter(p => !p.bankrupt && !p.left).length;
    if (activeCount === 0) {
      this.phase = 'gameover';
      return { ok: true, gameOver: true };
    }
    // 退市检查：股价为0则游戏结束
    if (this.currentPrice <= 0) {
      this.phase = 'gameover';
      return { ok: true, gameOver: true };
    }
    // 重置所有活跃玩家的决策状态
    for (const p of Object.values(this.players)) {
      if (!p.bankrupt && !p.left) {
        p.decision = null;
        p.confirmed = false;
        p.leverage = 1;
      }
    }
    this.currentRound++;
    if (this.currentRound > this.maxRounds) {
      this.phase = 'gameover';
      return { ok: true, gameOver: true };
    }
    this.phase = 'trading';
    this.generateDay();
    return { ok: true, gameOver: false };
  }

  // ==================== 重新开始（点击者成为房主进入大厅）====================
  restart(byName) {
    if (this.phase !== 'gameover') return { error: '游戏尚未结束，无法重新开始' };
    this.resetState();
    this.players[byName] = {
      cash: 10000, shares: 0, leverage: 1,
      decision: null, confirmed: false,
      bankrupt: false, left: false, debt: 0,
      lastSeen: Date.now(), online: true
    };
    this.host = byName;
    return { ok: true };
  }

  // ==================== 强制结算 ====================
  forceSettle(byName) {
    if (!this.players[byName]) return { error: '你不在游戏中' };
    if (this.phase !== 'trading') return { error: '当前不是交易阶段' };
    for (const [name, p] of Object.entries(this.players)) {
      if (!p.bankrupt && !p.left && !p.confirmed) {
        p.decision = 'hold'; p.confirmed = true;
      }
    }
    this.executeSettlement();
    return { ok: true };
  }

  // ==================== 游戏中踢人 ====================
  kickInGame(target, by) {
    if (!this.players[target]) return { error: '玩家不存在' };
    if (target === by) return { error: '不能踢自己' };
    if (this.players[target].left) return { error: '该玩家已退出游戏' };
    const now = Date.now();
    if (this.lastKickTime[target] && now - this.lastKickTime[target] < 5000)
      return { error: '操作太频繁，请稍后再试' };
    this.lastKickTime[target] = now;

    const p = this.players[target];
    p.left = true;
    p.online = false;
    delete this.lastKickTime[target];  // 玩家已退出，清理防刷记录
    if (this.phase === 'trading') { p.decision = 'hold'; p.confirmed = true; }

    if (this.host === target) this._reassignHost();

    // 触发结算/游戏结束检查
    const postLeave = this._checkPostLeaveState();
    return { ok: true, ...postLeave };
  }

  // ==================== 获取完整状态 ====================
  getState(includeLog = false) {
    const playersList = {};
    for (const [name, p] of Object.entries(this.players)) {
      playersList[name] = {
        cash: p.cash, shares: p.shares, leverage: p.leverage,
        decision: p.decision, confirmed: p.confirmed,
        bankrupt: p.bankrupt, left: p.left,
        debt: p.debt, online: p.online,
        netWorth: Math.round((p.cash + p.shares * this.currentPrice) * 100) / 100
      };
    }
    const result = {
      phase:              this.phase,
      currentRound:       this.currentRound,
      maxRounds:          this.maxRounds,
      currentPrice:       this.currentPrice,
      priceHistory:       this.priceHistory,
      newsText:           this.newsText,
      newsType:           this.newsType,
      newsSentiment:      this.newsSentiment,
      outcomeText:        this.outcomeText,
      newsNormal:         this.newsNormal,
      moveName:           this.move ? this.move.name : '',
      moveMult:           this.move ? this.move.mult : 1,
      players:            playersList,
      host:               this.host,
      settlementPreNW:    this.settlementPreNW,
      settlementOldPrice: this.settlementOldPrice,
      settlementBust:     this.settlementBust,
      spectators:         [...this.spectators],
      bustStories:        this.BUST_STORIES || [],
      dlabel:             DLABEL,
    };
    if (includeLog) result.gameLog = this.gameLog;
    return result;
  }

  // 获取完整状态（含 gameLog，用于结果页等场景）
  getFullState() { return this.getState(true); }

  // ==================== 个性化状态（活跃玩家隐藏其他玩家的决策 + trading 阶段隐藏涨跌信息）====================
  getStateFor(viewerName, isSpectator) {
    const full = this.getState();
    // trading 阶段对活跃玩家隐藏具体涨跌倍率
    if (this.phase === 'trading' && !isSpectator) {
      full.moveName = '';
      full.moveMult = 1;
    }
    if (isSpectator) return full;

    const pl = {};
    for (const [name, p] of Object.entries(full.players)) {
      if (name === viewerName || p.left || p.bankrupt) {
        pl[name] = { ...p };
      } else {
        pl[name] = {
          cash: p.cash, shares: p.shares,
          leverage: p.leverage, decision: p.decision,
          confirmed: p.confirmed, bankrupt: p.bankrupt,
          left: p.left, debt: p.debt,
          online: p.online, netWorth: p.netWorth,
        };
      }
    }
    return { ...full, players: pl };
  }

  randomPick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }
}

module.exports = { GameEngine };
