const fs = require('fs');
const path = require('path');
const https = require('https');
const WebSocket = require('ws');
const { HttpsProxyAgent } = require('https-proxy-agent');
const ProxyManager = require('./proxy-manager');

// 简单的fetch polyfill for Node.js
function fetch(url, options = {}) {
  return new Promise((resolve, reject) => {
    const urlObj = new URL(url);
    const requestOptions = {
      hostname: urlObj.hostname,
      port: urlObj.port || 443,
      path: urlObj.pathname + urlObj.search,
      method: options.method || 'GET',
      headers: options.headers || {}
    };

    const req = https.request(requestOptions, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        resolve({
          ok: res.statusCode >= 200 && res.statusCode < 300,
          status: res.statusCode,
          json: () => Promise.resolve(JSON.parse(data))
        });
      });
    });

    req.on('error', reject);
    req.end();
  });
}

class WebSocketDataCollector {
  constructor() {
    this.markets = [];
    this.spreadHistory = new Map();
    this.maxHistoryMinutes = 3;
    this.maxHistoryPoints = this.maxHistoryMinutes * 60;
    this.isCollecting = false;
    this.dataFile = path.join(__dirname, 'spread-data.json');
    this.proxyFile = path.join(__dirname, 'proxies.txt');
    this.proxyManager = new ProxyManager();
    this.useProxy = false;
    
    // WebSocket相关
    this.wsConnections = new Map(); // proxyUrl -> WebSocket
    this.wsUrl = 'wss://ws.api.prod.paradex.trade/v1';
    this.marketSubscriptions = new Map(); // symbol -> proxyUrl
    this.reconnectAttempts = new Map(); // proxyUrl -> attempts
    this.maxReconnectAttempts = 5;
    
    // 按需监控相关
    this.isMonitoringActive = false;
    this.monitoringTimer = null;
    this.monitoringStartTime = null;
    this.monitoringDuration = 15 * 60 * 1000;
    
    // 流量统计
    this.trafficStats = {
      bytesReceived: 0,
      bytesSent: 0,
      messagesReceived: 0,
      messagesSent: 0,
      startTime: null
    };
    
    this.loadHistoryData();
    this.loadProxies();
  }

  async initialize() {
    console.log('🔧 初始化WebSocket数据收集器...');
    await this.fetchMarkets();
    console.log(`📊 发现 ${this.markets.length} 个PERP市场`);
  }

  loadProxies() {
    try {
      if (fs.existsSync(this.proxyFile)) {
        const proxyData = fs.readFileSync(this.proxyFile, 'utf8');
        this.proxyManager.loadProxies(proxyData);
        this.useProxy = true;
        console.log(`🔌 代理模式启用，共 ${this.proxyManager.proxies.length} 个代理`);
      } else {
        console.log('⚠️ 未找到代理文件，使用直连模式');
        this.useProxy = false;
      }
    } catch (error) {
      console.error('❌ 加载代理失败:', error);
      this.useProxy = false;
    }
  }

  async fetchMarkets() {
    try {
      const response = await fetch('https://api.prod.paradex.trade/v1/markets');
      const data = await response.json();
      this.markets = data.results
        .filter(market => market.asset_kind === 'PERP')
        .map(market => market.symbol);
    } catch (error) {
      console.error('❌ 获取市场列表失败:', error);
    }
  }

  getProxyStats() {
    if (this.useProxy) {
      return this.proxyManager.getStats();
    }
    return { total: 0, active: 0, failed: 0, stats: [] };
  }

  getTrafficStats() {
    const duration = this.trafficStats.startTime 
      ? (Date.now() - this.trafficStats.startTime) / 1000 
      : 0;
    
    return {
      ...this.trafficStats,
      duration,
      bytesPerSecond: duration > 0 ? this.trafficStats.bytesReceived / duration : 0,
      activeConnections: this.wsConnections.size
    };
  }


  // 创建WebSocket连接
  createWebSocketConnection(proxyUrl = null) {
    return new Promise((resolve, reject) => {
      let ws;
      const connectionId = proxyUrl || 'direct';
      
      try {
        if (proxyUrl) {
          // 使用代理连接
          const agent = new HttpsProxyAgent(proxyUrl);
          ws = new WebSocket(this.wsUrl, { agent });
        } else {
          // 直连
          ws = new WebSocket(this.wsUrl);
        }

        const timeout = setTimeout(() => {
          ws.terminate();
          reject(new Error('连接超时'));
        }, 10000);

        ws.on('open', () => {
          clearTimeout(timeout);
          console.log(`✅ WebSocket连接成功: ${connectionId}`);
          this.reconnectAttempts.set(connectionId, 0);
          resolve(ws);
        });

        ws.on('error', (error) => {
          clearTimeout(timeout);
          console.error(`❌ WebSocket错误 [${connectionId}]:`, error.message);
          reject(error);
        });

        ws.on('close', (code, reason) => {
          console.log(`🔌 WebSocket关闭 [${connectionId}]: ${code} - ${reason}`);
          this.wsConnections.delete(connectionId);
          
          // 自动重连
          if (this.isMonitoringActive) {
            this.handleReconnect(connectionId, proxyUrl);
          }
        });

        ws.on('message', (data) => {
          this.handleMessage(data, connectionId);
        });

        ws.on('ping', () => {
          ws.pong();
        });

      } catch (error) {
        reject(error);
      }
    });
  }

  // 处理重连
  async handleReconnect(connectionId, proxyUrl) {
    const attempts = this.reconnectAttempts.get(connectionId) || 0;
    
    if (attempts >= this.maxReconnectAttempts) {
      console.error(`❌ 重连失败次数过多 [${connectionId}]，放弃重连`);
      return;
    }

    this.reconnectAttempts.set(connectionId, attempts + 1);
    const delay = Math.min(1000 * Math.pow(2, attempts), 30000);
    
    console.log(`🔄 ${delay/1000}秒后尝试重连 [${connectionId}] (第${attempts + 1}次)`);
    
    setTimeout(async () => {
      if (!this.isMonitoringActive) return;
      
      try {
        const ws = await this.createWebSocketConnection(proxyUrl);
        this.wsConnections.set(connectionId, ws);
        
        // 重新订阅该连接负责的市场
        const markets = this.getMarketsForConnection(connectionId);
        for (const symbol of markets) {
          this.subscribeToMarket(ws, symbol);
        }
      } catch (error) {
        console.error(`❌ 重连失败 [${connectionId}]:`, error.message);
      }
    }, delay);
  }

  // 获取连接负责的市场
  getMarketsForConnection(connectionId) {
    const markets = [];
    for (const [symbol, connId] of this.marketSubscriptions.entries()) {
      if (connId === connectionId) {
        markets.push(symbol);
      }
    }
    return markets;
  }

  // 订阅市场BBO数据
  subscribeToMarket(ws, symbol) {
    if (ws.readyState !== WebSocket.OPEN) {
      console.warn(`⚠️ WebSocket未就绪，无法订阅 ${symbol}`);
      return;
    }

    const subscribeMsg = {
      id: Date.now(),
      jsonrpc: '2.0',
      method: 'subscribe',
      params: {
        channel: `bbo.${symbol}`
      }
    };

    const msgStr = JSON.stringify(subscribeMsg);
    ws.send(msgStr);
    
    this.trafficStats.bytesSent += msgStr.length;
    this.trafficStats.messagesSent++;
    
    console.log(`📡 订阅市场: ${symbol}`);
  }

  // 处理WebSocket消息
  handleMessage(data, connectionId) {
    try {
      const dataStr = data.toString();
      this.trafficStats.bytesReceived += dataStr.length;
      this.trafficStats.messagesReceived++;

      const message = JSON.parse(dataStr);
      
      // 处理BBO更新
      if (message.params && message.params.channel && message.params.channel.startsWith('bbo.')) {
        const symbol = message.params.channel.replace('bbo.', '');
        const bboData = message.params.data;
        
        // 调试：记录原始数据格式（仅前几条）
        if (this.trafficStats.messagesReceived <= 10) {
          console.log(`📦 原始BBO数据 [${symbol}]:`, JSON.stringify(bboData));
        }
        
        if (bboData && bboData.bid && bboData.ask) {
          this.processBBOUpdate(symbol, bboData, connectionId);
        }
      }
      
      // 处理订阅确认
      if (message.result && message.result.channel) {
        console.log(`✅ 订阅确认: ${message.result.channel}`);
      }
      
      // 处理错误
      if (message.error) {
        console.error(`❌ WebSocket错误响应:`, message.error);
      }
      
    } catch (error) {
      // 忽略解析错误（可能是ping/pong）
    }
  }

  // 处理BBO数据更新
  processBBOUpdate(symbol, bboData, connectionId) {
    const timestamp = Date.now();
    const bid = parseFloat(bboData.bid);
    const ask = parseFloat(bboData.ask);
    
    // 调试：记录解析后的数据（仅前几条）
    if (this.trafficStats.messagesReceived <= 20) {
      console.log(`📊 解析后 [${symbol}]: bid=${bid}, ask=${ask}, spread=${ask-bid}, spreadPct=${((ask-bid)/bid*100).toFixed(6)}%`);
    }
    
    if (isNaN(bid) || isNaN(ask) || bid <= 0 || ask <= 0) {
      return;
    }

    const spread = ask - bid;
    const spreadPercent = (spread / bid) * 100;
    
    // 记录零点差/负点差事件
    if (spreadPercent <= 0) {
      console.log(`🎯 发现零/负点差 [${symbol}]: bid=${bid}, ask=${ask}, spread=${spreadPercent.toFixed(6)}%`);
    }

    const dataPoint = {
      symbol,
      bid,
      ask,
      spread,
      spreadPercent,
      timestamp,
      source: 'websocket',
      connection: connectionId
    };

    // 存储数据
    if (!this.spreadHistory.has(symbol)) {
      this.spreadHistory.set(symbol, []);
    }

    const history = this.spreadHistory.get(symbol);
    history.push(dataPoint);

    // 清理旧数据
    const cutoffTime = timestamp - (this.maxHistoryMinutes * 60 * 1000);
    while (history.length > 0 && history[0].timestamp < cutoffTime) {
      history.shift();
    }

    if (history.length > this.maxHistoryPoints) {
      history.splice(0, history.length - this.maxHistoryPoints);
    }
  }


  // 启动WebSocket数据收集
  async startWebSocketCollection() {
    console.log('🚀 启动WebSocket数据收集...');
    this.trafficStats.startTime = Date.now();
    this.trafficStats.bytesReceived = 0;
    this.trafficStats.bytesSent = 0;
    this.trafficStats.messagesReceived = 0;
    this.trafficStats.messagesSent = 0;

    if (this.useProxy && this.proxyManager.proxies.length > 0) {
      await this.startWithProxies();
    } else {
      await this.startDirect();
    }

    this.isCollecting = true;
    
    // 定期保存数据
    this.saveInterval = setInterval(() => {
      this.saveHistoryData();
    }, 30000);

    // 定期输出统计
    this.statsInterval = setInterval(() => {
      const stats = this.getTrafficStats();
      const proxyStats = this.getProxyStats();
      console.log(`📊 流量统计: 接收 ${(stats.bytesReceived / 1024).toFixed(2)}KB, ` +
        `发送 ${(stats.bytesSent / 1024).toFixed(2)}KB, ` +
        `消息 ${stats.messagesReceived}条, ` +
        `连接 ${stats.activeConnections}个`);
    }, 30000);
  }

  // 使用代理启动
  async startWithProxies() {
    const proxies = this.proxyManager.proxies;
    const marketsPerProxy = Math.ceil(this.markets.length / proxies.length);
    
    console.log(`📡 分配 ${this.markets.length} 个市场到 ${proxies.length} 个代理`);
    console.log(`📊 每个代理负责约 ${marketsPerProxy} 个市场`);

    let marketIndex = 0;
    const connectionPromises = [];

    for (let i = 0; i < proxies.length && marketIndex < this.markets.length; i++) {
      const proxy = proxies[i];
      const proxyUrl = this.formatProxyUrl(proxy);
      
      // 分配市场给这个代理
      const assignedMarkets = this.markets.slice(marketIndex, marketIndex + marketsPerProxy);
      marketIndex += marketsPerProxy;

      connectionPromises.push(
        this.setupProxyConnection(proxyUrl, assignedMarkets, i)
      );

      // 限制并发连接速度，避免触发限流
      if ((i + 1) % 10 === 0) {
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }

    await Promise.allSettled(connectionPromises);
    console.log(`✅ WebSocket连接建立完成，活跃连接: ${this.wsConnections.size}`);
  }

  // 设置代理连接
  async setupProxyConnection(proxyUrl, markets, index) {
    try {
      const ws = await this.createWebSocketConnection(proxyUrl);
      this.wsConnections.set(proxyUrl, ws);

      // 等待连接稳定
      await new Promise(resolve => setTimeout(resolve, 500));

      // 订阅分配的市场
      for (const symbol of markets) {
        this.marketSubscriptions.set(symbol, proxyUrl);
        this.subscribeToMarket(ws, symbol);
        
        // 限制订阅速度
        await new Promise(resolve => setTimeout(resolve, 50));
      }

      console.log(`✅ 代理 #${index + 1} 订阅了 ${markets.length} 个市场`);
    } catch (error) {
      console.error(`❌ 代理 #${index + 1} 连接失败:`, error.message);
    }
  }

  // 格式化代理URL
  formatProxyUrl(proxy) {
    if (proxy.username && proxy.password) {
      return `http://${proxy.username}:${proxy.password}@${proxy.host}:${proxy.port}`;
    }
    return `http://${proxy.host}:${proxy.port}`;
  }

  // 直连模式启动
  async startDirect() {
    console.log('📡 使用直连模式...');
    
    try {
      const ws = await this.createWebSocketConnection(null);
      this.wsConnections.set('direct', ws);

      // 订阅所有市场
      for (const symbol of this.markets) {
        this.marketSubscriptions.set(symbol, 'direct');
        this.subscribeToMarket(ws, symbol);
        await new Promise(resolve => setTimeout(resolve, 100));
      }

      console.log(`✅ 直连模式订阅了 ${this.markets.length} 个市场`);
    } catch (error) {
      console.error('❌ 直连模式启动失败:', error);
    }
  }

  // 停止WebSocket数据收集
  stopWebSocketCollection() {
    console.log('⏹️ 停止WebSocket数据收集...');

    // 关闭所有WebSocket连接
    for (const [id, ws] of this.wsConnections.entries()) {
      try {
        ws.close(1000, 'Monitoring stopped');
      } catch (error) {
        // 忽略关闭错误
      }
    }

    this.wsConnections.clear();
    this.marketSubscriptions.clear();
    this.reconnectAttempts.clear();

    if (this.saveInterval) {
      clearInterval(this.saveInterval);
      this.saveInterval = null;
    }

    if (this.statsInterval) {
      clearInterval(this.statsInterval);
      this.statsInterval = null;
    }

    this.isCollecting = false;
    this.saveHistoryData();

    const stats = this.getTrafficStats();
    console.log(`📊 本次收集统计: 接收 ${(stats.bytesReceived / 1024).toFixed(2)}KB, ` +
      `发送 ${(stats.bytesSent / 1024).toFixed(2)}KB, ` +
      `消息 ${stats.messagesReceived}条`);
  }


  // 按需监控控制方法
  startMonitoring() {
    if (this.isMonitoringActive) {
      this.resetMonitoringTimer();
      console.log('🔄 监控计时器已重置，延长15分钟');
      return {
        success: true,
        message: '监控时间已延长',
        remainingTime: this.getRemainingTime()
      };
    }

    console.log('🚀 开始按需监控 (WebSocket模式)...');
    this.isMonitoringActive = true;
    this.monitoringStartTime = Date.now();
    
    this.startWebSocketCollection();
    this.resetMonitoringTimer();
    
    return {
      success: true,
      message: '监控已启动 (WebSocket模式)',
      remainingTime: this.monitoringDuration
    };
  }

  stopMonitoring() {
    if (!this.isMonitoringActive) {
      return {
        success: false,
        message: '监控未在运行'
      };
    }

    console.log('⏹️ 停止按需监控...');
    this.isMonitoringActive = false;
    this.monitoringStartTime = null;
    
    if (this.monitoringTimer) {
      clearTimeout(this.monitoringTimer);
      this.monitoringTimer = null;
    }
    
    this.stopWebSocketCollection();
    
    return {
      success: true,
      message: '监控已停止'
    };
  }

  resetMonitoringTimer() {
    if (this.monitoringTimer) {
      clearTimeout(this.monitoringTimer);
    }
    
    this.monitoringStartTime = Date.now();
    this.monitoringTimer = setTimeout(() => {
      console.log('⏰ 15分钟监控时间到，自动停止监控');
      this.stopMonitoring();
    }, this.monitoringDuration);
  }

  getRemainingTime() {
    if (!this.isMonitoringActive || !this.monitoringStartTime) {
      return 0;
    }
    const elapsed = Date.now() - this.monitoringStartTime;
    return Math.max(0, this.monitoringDuration - elapsed);
  }

  getMonitoringStatus() {
    return {
      isActive: this.isMonitoringActive,
      startTime: this.monitoringStartTime,
      remainingTime: this.getRemainingTime(),
      isCollecting: this.isCollecting,
      mode: 'websocket',
      trafficStats: this.getTrafficStats()
    };
  }

  // 计算稳定性指标（与原版相同）
  calculateStabilityMetrics(symbol) {
    const history = this.spreadHistory.get(symbol);
    if (!history || history.length < 3) {
      return null;
    }

    const totalPoints = history.length;
    let zeroSpreadCount = 0;
    let negativeSpreadCount = 0;
    let lowSpreadCount = 0;
    let mediumSpreadCount = 0;
    let highSpreadCount = 0;
    let veryHighSpreadCount = 0;
    
    let totalSpread = 0;
    let minSpread = Infinity;
    let maxSpread = -Infinity;

    history.forEach(data => {
      const spreadPercent = data.spreadPercent;
      totalSpread += spreadPercent;
      
      if (spreadPercent <= 0) zeroSpreadCount++;
      if (spreadPercent < 0) negativeSpreadCount++;
      if (spreadPercent < 0.001) lowSpreadCount++;
      if (spreadPercent >= 0.001 && spreadPercent <= 0.01) mediumSpreadCount++;
      if (spreadPercent > 0.01) highSpreadCount++;
      if (spreadPercent > 0.05) veryHighSpreadCount++;
      
      minSpread = Math.min(minSpread, spreadPercent);
      maxSpread = Math.max(maxSpread, spreadPercent);
    });

    const avgSpread = totalSpread / totalPoints;
    
    let spreadVariance = 0;
    history.forEach(data => {
      const diff = data.spreadPercent - avgSpread;
      spreadVariance += diff * diff;
    });
    spreadVariance = spreadVariance / totalPoints;
    const spreadStdDev = Math.sqrt(spreadVariance);

    const zeroSpreadFreq = (zeroSpreadCount / totalPoints) * 100;
    const negativeSpreadFreq = (negativeSpreadCount / totalPoints) * 100;
    const lowSpreadFreq = (lowSpreadCount / totalPoints) * 100;
    const mediumSpreadFreq = (mediumSpreadCount / totalPoints) * 100;
    const highSpreadFreq = (highSpreadCount / totalPoints) * 100;
    const veryHighSpreadFreq = (veryHighSpreadCount / totalPoints) * 100;

    // 评分计算
    const stabilityBonus = mediumSpreadFreq * 2;
    const lowSpreadBonus = lowSpreadFreq * 1;
    const stabilityFactor = Math.min(1, (mediumSpreadFreq / 50) * (1 / Math.max(1, spreadStdDev * 10)));
    const zeroSpreadBonus = zeroSpreadFreq * (0.2 + stabilityFactor * 1.8);
    const negativeSpreadBonus = negativeSpreadFreq * (0.1 + stabilityFactor * 1.4);
    const highSpreadPenalty = highSpreadFreq * 3;
    const veryHighSpreadPenalty = veryHighSpreadFreq * 10;
    const volatilityPenalty = Math.min(spreadStdDev * 100, 50);
    const avgSpreadPenalty = Math.max(0, avgSpread * 10);
    const consistencyBonus = (zeroSpreadFreq > 20 && mediumSpreadFreq > 30) ? 10 : 0;
    
    let stabilityScore = stabilityBonus + lowSpreadBonus + zeroSpreadBonus + negativeSpreadBonus + consistencyBonus
                        - highSpreadPenalty - veryHighSpreadPenalty - volatilityPenalty - avgSpreadPenalty;
    stabilityScore = Math.max(0, Math.min(100, stabilityScore));

    return {
      symbol,
      totalPoints,
      avgSpread,
      minSpread,
      maxSpread,
      spreadStdDev,
      zeroSpreadFreq,
      negativeSpreadFreq,
      lowSpreadFreq,
      mediumSpreadFreq,
      highSpreadFreq,
      veryHighSpreadFreq,
      stabilityScore,
      scoreBreakdown: {
        stabilityBonus: stabilityBonus.toFixed(1),
        lowSpreadBonus: lowSpreadBonus.toFixed(1),
        zeroSpreadBonus: zeroSpreadBonus.toFixed(1),
        negativeSpreadBonus: negativeSpreadBonus.toFixed(1),
        consistencyBonus: consistencyBonus.toFixed(1),
        highSpreadPenalty: highSpreadPenalty.toFixed(1),
        veryHighSpreadPenalty: veryHighSpreadPenalty.toFixed(1),
        volatilityPenalty: volatilityPenalty.toFixed(1),
        avgSpreadPenalty: avgSpreadPenalty.toFixed(1),
        stabilityFactor: stabilityFactor.toFixed(3)
      },
      lastUpdate: history[history.length - 1]?.timestamp || Date.now()
    };
  }

  getAnalysisData() {
    const analysis = [];
    
    for (const symbol of this.spreadHistory.keys()) {
      const metrics = this.calculateStabilityMetrics(symbol);
      if (metrics) {
        analysis.push(metrics);
      }
    }

    analysis.sort((a, b) => b.stabilityScore - a.stabilityScore);
    return analysis;
  }

  saveHistoryData() {
    try {
      const dataToSave = {};
      for (const [symbol, history] of this.spreadHistory.entries()) {
        dataToSave[symbol] = history.slice(-this.maxHistoryPoints);
      }
      fs.writeFileSync(this.dataFile, JSON.stringify(dataToSave, null, 2));
    } catch (error) {
      console.error('❌ 保存历史数据失败:', error);
    }
  }

  loadHistoryData() {
    try {
      if (fs.existsSync(this.dataFile)) {
        const data = JSON.parse(fs.readFileSync(this.dataFile, 'utf8'));
        for (const [symbol, history] of Object.entries(data)) {
          this.spreadHistory.set(symbol, history);
        }
        console.log(`📂 加载了 ${this.spreadHistory.size} 个市场的历史数据`);
      }
    } catch (error) {
      console.error('❌ 加载历史数据失败:', error);
    }
  }
}

module.exports = WebSocketDataCollector;
