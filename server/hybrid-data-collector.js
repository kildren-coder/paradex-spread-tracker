const fs = require('fs');
const path = require('path');
const https = require('https');
const WebSocket = require('ws');
const { HttpsProxyAgent } = require('https-proxy-agent');
const ProxyManager = require('./proxy-manager');

/**
 * 混合数据收集器
 * - WebSocket: 持续监控所有市场，节流1次/秒，计算候选分数
 * - HTTP: 轮询分析高候选分数的币种，捕获零点差/负点差
 */
class HybridDataCollector {
  constructor() {
    this.markets = [];
    this.spreadHistory = new Map(); // symbol -> { ws: [], http: [] }
    this.maxHistoryMinutes = 3;
    this.maxHistoryPoints = this.maxHistoryMinutes * 60;
    this.isCollecting = false;
    this.dataFile = path.join(__dirname, 'spread-data.json');
    this.proxyFile = path.join(__dirname, 'proxies.txt');
    this.proxyManager = new ProxyManager();
    this.useProxy = false;
    
    // WebSocket相关
    this.wsConnections = new Map();
    this.wsUrl = 'wss://ws.api.prod.paradex.trade/v1';
    this.marketSubscriptions = new Map();
    this.reconnectAttempts = new Map();
    this.maxReconnectAttempts = 5;
    
    // WebSocket节流：每市场每秒最多1条
    this.lastWsUpdate = new Map(); // symbol -> timestamp
    this.wsThrottleMs = 1000;
    
    // HTTP深度分析相关
    this.httpAnalyzing = new Set(); // 正在分析的币种
    this.httpCooldown = new Map(); // symbol -> cooldown end time
    this.httpCooldownMs = 3 * 60 * 1000; // 3分钟冷却
    this.httpAnalysisDuration = 60 * 1000; // 每币种分析1分钟
    this.httpCandidateThreshold = 30; // 候选分数阈值
    this.httpAnalysisInterval = null;
    
    // 候选分数
    this.candidateScores = new Map(); // symbol -> score
    
    // 按需监控
    this.isMonitoringActive = false;
    this.monitoringTimer = null;
    this.monitoringStartTime = null;
    this.monitoringDuration = 15 * 60 * 1000;
    
    // 流量统计
    this.trafficStats = {
      wsBytesReceived: 0,
      wsBytesSent: 0,
      wsMessages: 0,
      httpBytesReceived: 0,
      httpRequests: 0,
      startTime: null
    };
    
    this.loadHistoryData();
    this.loadProxies();
  }

  async initialize() {
    console.log('🔧 初始化混合数据收集器...');
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
      const response = await this.httpFetch('https://api.prod.paradex.trade/v1/markets');
      const data = await response.json();
      this.markets = data.results
        .filter(market => market.asset_kind === 'PERP')
        .map(market => market.symbol);
    } catch (error) {
      console.error('❌ 获取市场列表失败:', error);
    }
  }

  // 简单HTTP fetch
  httpFetch(url, proxyUrl = null) {
    return new Promise((resolve, reject) => {
      const urlObj = new URL(url);
      const options = {
        hostname: urlObj.hostname,
        port: 443,
        path: urlObj.pathname + urlObj.search,
        method: 'GET',
        headers: { 'User-Agent': 'Mozilla/5.0' }
      };

      if (proxyUrl) {
        options.agent = new HttpsProxyAgent(proxyUrl);
      }

      const req = https.request(options, (res) => {
        let data = '';
        res.on('data', chunk => { 
          data += chunk;
          this.trafficStats.httpBytesReceived += chunk.length;
        });
        res.on('end', () => {
          this.trafficStats.httpRequests++;
          resolve({
            ok: res.statusCode >= 200 && res.statusCode < 300,
            status: res.statusCode,
            json: () => Promise.resolve(JSON.parse(data))
          });
        });
      });

      req.on('error', reject);
      req.setTimeout(10000, () => {
        req.destroy();
        reject(new Error('Request timeout'));
      });
      req.end();
    });
  }

  getProxyStats() {
    return this.useProxy ? this.proxyManager.getStats() : { total: 0, active: 0, failed: 0 };
  }

  getTrafficStats() {
    const duration = this.trafficStats.startTime 
      ? (Date.now() - this.trafficStats.startTime) / 1000 : 0;
    
    const totalBytes = this.trafficStats.wsBytesReceived + this.trafficStats.httpBytesReceived;
    
    return {
      ...this.trafficStats,
      totalBytesReceived: totalBytes,
      duration,
      bytesPerSecond: duration > 0 ? totalBytes / duration : 0,
      wsConnections: this.wsConnections.size,
      httpAnalyzing: this.httpAnalyzing.size,
      httpCooldownCount: this.httpCooldown.size
    };
  }


  // ==================== WebSocket部分 ====================
  
  createWebSocketConnection(proxyUrl = null) {
    return new Promise((resolve, reject) => {
      let ws;
      const connectionId = proxyUrl || 'direct';
      
      try {
        if (proxyUrl) {
          const agent = new HttpsProxyAgent(proxyUrl);
          ws = new WebSocket(this.wsUrl, { agent });
        } else {
          ws = new WebSocket(this.wsUrl);
        }

        const timeout = setTimeout(() => {
          ws.terminate();
          reject(new Error('连接超时'));
        }, 10000);

        ws.on('open', () => {
          clearTimeout(timeout);
          console.log(`✅ WebSocket连接成功: ${connectionId.substring(0, 30)}...`);
          this.reconnectAttempts.set(connectionId, 0);
          resolve(ws);
        });

        ws.on('error', (error) => {
          clearTimeout(timeout);
          reject(error);
        });

        ws.on('close', () => {
          this.wsConnections.delete(connectionId);
          if (this.isMonitoringActive) {
            this.handleReconnect(connectionId, proxyUrl);
          }
        });

        ws.on('message', (data) => {
          this.handleWsMessage(data, connectionId);
        });

      } catch (error) {
        reject(error);
      }
    });
  }

  async handleReconnect(connectionId, proxyUrl) {
    const attempts = this.reconnectAttempts.get(connectionId) || 0;
    if (attempts >= this.maxReconnectAttempts) return;

    this.reconnectAttempts.set(connectionId, attempts + 1);
    const delay = Math.min(1000 * Math.pow(2, attempts), 30000);
    
    setTimeout(async () => {
      if (!this.isMonitoringActive) return;
      try {
        const ws = await this.createWebSocketConnection(proxyUrl);
        this.wsConnections.set(connectionId, ws);
        const markets = this.getMarketsForConnection(connectionId);
        for (const symbol of markets) {
          this.subscribeToMarket(ws, symbol);
        }
      } catch (error) {
        console.error(`❌ 重连失败 [${connectionId.substring(0, 20)}...]`);
      }
    }, delay);
  }

  getMarketsForConnection(connectionId) {
    const markets = [];
    for (const [symbol, connId] of this.marketSubscriptions.entries()) {
      if (connId === connectionId) markets.push(symbol);
    }
    return markets;
  }

  subscribeToMarket(ws, symbol) {
    if (ws.readyState !== WebSocket.OPEN) return;

    const msg = JSON.stringify({
      id: Date.now(),
      jsonrpc: '2.0',
      method: 'subscribe',
      params: { channel: `bbo.${symbol}` }
    });

    ws.send(msg);
    this.trafficStats.wsBytesSent += msg.length;
  }

  handleWsMessage(data, connectionId) {
    try {
      const dataStr = data.toString();
      this.trafficStats.wsBytesReceived += dataStr.length;
      this.trafficStats.wsMessages++;

      const message = JSON.parse(dataStr);
      
      if (message.params?.channel?.startsWith('bbo.')) {
        const symbol = message.params.channel.replace('bbo.', '');
        const bboData = message.params.data;
        
        if (bboData?.bid && bboData?.ask) {
          this.processWsBBO(symbol, bboData);
        }
      }
    } catch (error) {
      // 忽略解析错误
    }
  }

  // 处理WebSocket BBO数据（带节流）
  processWsBBO(symbol, bboData) {
    const now = Date.now();
    const lastUpdate = this.lastWsUpdate.get(symbol) || 0;
    
    // 节流：每秒最多1条
    if (now - lastUpdate < this.wsThrottleMs) {
      return;
    }
    this.lastWsUpdate.set(symbol, now);

    const bid = parseFloat(bboData.bid);
    const ask = parseFloat(bboData.ask);
    
    if (isNaN(bid) || isNaN(ask) || bid <= 0 || ask <= 0) return;

    const spread = ask - bid;
    const spreadPercent = (spread / bid) * 100;

    // 初始化历史数据结构
    if (!this.spreadHistory.has(symbol)) {
      this.spreadHistory.set(symbol, { ws: [], http: [] });
    }

    const history = this.spreadHistory.get(symbol);
    history.ws.push({
      bid, ask, spread, spreadPercent,
      timestamp: now,
      source: 'websocket'
    });

    // 清理旧数据
    const cutoff = now - (this.maxHistoryMinutes * 60 * 1000);
    while (history.ws.length > 0 && history.ws[0].timestamp < cutoff) {
      history.ws.shift();
    }

    // 更新候选分数
    this.updateCandidateScore(symbol);
  }

  // 计算候选分数（基于WebSocket数据）
  updateCandidateScore(symbol) {
    const history = this.spreadHistory.get(symbol);
    if (!history || history.ws.length < 10) {
      this.candidateScores.set(symbol, 0);
      return;
    }

    const wsData = history.ws;
    const totalPoints = wsData.length;
    
    // 计算低点差频率 (< 0.01%)
    let lowSpreadCount = 0;
    let totalSpread = 0;
    
    wsData.forEach(d => {
      if (d.spreadPercent < 0.01) lowSpreadCount++;
      totalSpread += d.spreadPercent;
    });

    const lowSpreadFreq = (lowSpreadCount / totalPoints) * 100;
    const avgSpread = totalSpread / totalPoints;

    // 计算稳定性（标准差）
    let variance = 0;
    wsData.forEach(d => {
      variance += Math.pow(d.spreadPercent - avgSpread, 2);
    });
    const stdDev = Math.sqrt(variance / totalPoints);
    const stability = Math.max(0, 100 - stdDev * 1000);

    // 数据量分数
    const dataScore = Math.min(totalPoints / 180, 1) * 100;

    // 候选分数 = 低点差频率40% + 稳定性40% + 数据量20%
    const score = lowSpreadFreq * 0.4 + stability * 0.4 + dataScore * 0.2;
    
    this.candidateScores.set(symbol, Math.round(score));
  }


  // ==================== HTTP深度分析部分 ====================

  // 获取随机代理URL
  getRandomProxyUrl() {
    if (!this.useProxy || this.proxyManager.proxies.length === 0) {
      return null;
    }
    
    const proxies = this.proxyManager.proxies;
    const proxy = proxies[Math.floor(Math.random() * proxies.length)];
    
    if (proxy.username && proxy.password) {
      return `http://${proxy.username}:${proxy.password}@${proxy.host}:${proxy.port}`;
    }
    return `http://${proxy.host}:${proxy.port}`;
  }

  // 启动HTTP深度分析循环
  startHttpAnalysis() {
    if (this.httpAnalysisInterval) return;

    console.log('🔍 启动HTTP深度分析（同时分析所有高分币种）...');
    
    // 每秒对所有高分币种发起HTTP请求
    this.httpAnalysisInterval = setInterval(() => {
      this.runHttpAnalysisCycle();
    }, 1000);
  }

  stopHttpAnalysis() {
    if (this.httpAnalysisInterval) {
      clearInterval(this.httpAnalysisInterval);
      this.httpAnalysisInterval = null;
    }
    this.httpAnalyzing.clear();
  }

  // HTTP分析循环 - 同时分析所有高分币种
  async runHttpAnalysisCycle() {
    const now = Date.now();
    
    // 清理过期的冷却
    for (const [symbol, endTime] of this.httpCooldown.entries()) {
      if (now >= endTime) {
        this.httpCooldown.delete(symbol);
      }
    }

    // 获取所有符合条件的币种（高分且不在冷却中）
    const eligibleSymbols = Array.from(this.candidateScores.entries())
      .filter(([symbol, score]) => {
        // 排除冷却中的
        if (this.httpCooldown.has(symbol) && this.httpCooldown.get(symbol) > now) return false;
        // 排除分数太低的
        if (score < this.httpCandidateThreshold) return false;
        return true;
      })
      .map(([symbol]) => symbol);

    // 更新正在分析的集合
    const newAnalyzing = new Set(eligibleSymbols);
    
    // 检查哪些币种刚开始分析
    for (const symbol of eligibleSymbols) {
      if (!this.httpAnalyzing.has(symbol)) {
        console.log(`📡 开始HTTP分析: ${symbol} (候选分数: ${this.candidateScores.get(symbol)})`);
        // 设置1分钟后进入冷却
        setTimeout(() => {
          this.finishHttpAnalysis(symbol);
        }, this.httpAnalysisDuration);
      }
    }
    
    this.httpAnalyzing = newAnalyzing;

    // 对所有正在分析的币种并发发起HTTP请求
    const fetchPromises = eligibleSymbols.map(symbol => this.fetchHttpBBO(symbol));
    await Promise.allSettled(fetchPromises);
  }

  // 完成HTTP分析
  finishHttpAnalysis(symbol) {
    if (!this.httpAnalyzing.has(symbol)) return;
    
    console.log(`✅ HTTP分析完成: ${symbol}，进入3分钟冷却`);
    this.httpAnalyzing.delete(symbol);
    
    // 进入冷却期
    this.httpCooldown.set(symbol, Date.now() + this.httpCooldownMs);
    
    // 计算最终评分
    this.calculateFinalScore(symbol);
  }

  // 获取HTTP BBO数据
  async fetchHttpBBO(symbol) {
    try {
      const proxyUrl = this.getRandomProxyUrl();
      const url = `https://api.prod.paradex.trade/v1/bbo/${symbol}/interactive`;
      
      const response = await this.httpFetch(url, proxyUrl);
      
      if (response.ok) {
        const data = await response.json();
        this.processHttpBBO(symbol, data);
      }
    } catch (error) {
      // 静默处理错误，避免日志刷屏
    }
  }

  // 处理HTTP BBO数据
  processHttpBBO(symbol, data) {
    const now = Date.now();
    
    // interactive端点返回的是 best_bid_interactive 和 best_ask_interactive
    let bid, ask;
    
    if (data.best_bid_interactive && data.best_ask_interactive) {
      // interactive格式: [price, size]
      bid = parseFloat(data.best_bid_interactive[0]);
      ask = parseFloat(data.best_ask_interactive[0]);
    } else if (data.bid && data.ask) {
      bid = parseFloat(data.bid);
      ask = parseFloat(data.ask);
    } else {
      return;
    }

    if (isNaN(bid) || isNaN(ask) || bid <= 0 || ask <= 0) return;

    const spread = ask - bid;
    const spreadPercent = (spread / bid) * 100;

    // 记录零点差/负点差
    if (spreadPercent <= 0) {
      console.log(`🎯 HTTP捕获零/负点差 [${symbol}]: ${spreadPercent.toFixed(6)}%`);
    }

    if (!this.spreadHistory.has(symbol)) {
      this.spreadHistory.set(symbol, { ws: [], http: [] });
    }

    const history = this.spreadHistory.get(symbol);
    history.http.push({
      bid, ask, spread, spreadPercent,
      timestamp: now,
      source: 'http'
    });

    // 清理旧数据
    const cutoff = now - (this.maxHistoryMinutes * 60 * 1000);
    while (history.http.length > 0 && history.http[0].timestamp < cutoff) {
      history.http.shift();
    }
  }


  // ==================== 评分计算 ====================

  // 计算最终评分（结合WS和HTTP数据）
  calculateFinalScore(symbol) {
    const history = this.spreadHistory.get(symbol);
    if (!history) return null;

    const wsData = history.ws || [];
    const httpData = history.http || [];
    
    // 如果没有HTTP数据，只用WS数据
    const allData = httpData.length > 0 ? httpData : wsData;
    
    if (allData.length < 3) return null;

    return this.calculateStabilityMetrics(symbol, allData, httpData.length > 0);
  }

  // 计算稳定性指标
  calculateStabilityMetrics(symbol, data, hasHttpData) {
    const totalPoints = data.length;
    let zeroSpreadCount = 0;
    let negativeSpreadCount = 0;
    let lowSpreadCount = 0;
    let mediumSpreadCount = 0;
    let highSpreadCount = 0;
    let veryHighSpreadCount = 0;
    let totalSpread = 0;
    let minSpread = Infinity;
    let maxSpread = -Infinity;

    data.forEach(d => {
      const sp = d.spreadPercent;
      totalSpread += sp;
      
      if (sp <= 0) zeroSpreadCount++;
      if (sp < 0) negativeSpreadCount++;
      if (sp < 0.001) lowSpreadCount++;
      if (sp >= 0.001 && sp <= 0.01) mediumSpreadCount++;
      if (sp > 0.01) highSpreadCount++;
      if (sp > 0.05) veryHighSpreadCount++;
      
      minSpread = Math.min(minSpread, sp);
      maxSpread = Math.max(maxSpread, sp);
    });

    const avgSpread = totalSpread / totalPoints;
    
    let variance = 0;
    data.forEach(d => {
      variance += Math.pow(d.spreadPercent - avgSpread, 2);
    });
    const spreadStdDev = Math.sqrt(variance / totalPoints);

    // 频率计算
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
      dataSource: hasHttpData ? 'http' : 'websocket',
      candidateScore: this.candidateScores.get(symbol) || 0,
      isAnalyzing: this.httpAnalyzing.has(symbol),
      inCooldown: this.httpCooldown.has(symbol),
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
      lastUpdate: data[data.length - 1]?.timestamp || Date.now()
    };
  }

  getAnalysisData() {
    const analysis = [];
    
    for (const symbol of this.spreadHistory.keys()) {
      const history = this.spreadHistory.get(symbol);
      const httpData = history.http || [];
      const wsData = history.ws || [];
      
      // 优先使用HTTP数据（如果有足够的数据点）
      const useHttp = httpData.length >= 30;
      const data = useHttp ? httpData : wsData;
      
      if (data.length >= 3) {
        const metrics = this.calculateStabilityMetrics(symbol, data, useHttp);
        if (metrics) {
          analysis.push(metrics);
        }
      }
    }

    analysis.sort((a, b) => b.stabilityScore - a.stabilityScore);
    return analysis;
  }


  // ==================== 监控控制 ====================

  async startWebSocketCollection() {
    console.log('🚀 启动WebSocket数据收集...');
    this.trafficStats.startTime = Date.now();
    this.trafficStats.wsBytesReceived = 0;
    this.trafficStats.wsBytesSent = 0;
    this.trafficStats.wsMessages = 0;
    this.trafficStats.httpBytesReceived = 0;
    this.trafficStats.httpRequests = 0;

    if (this.useProxy && this.proxyManager.proxies.length > 0) {
      await this.startWithProxies();
    } else {
      await this.startDirect();
    }

    this.isCollecting = true;
    
    // 启动HTTP深度分析
    this.startHttpAnalysis();
    
    // 定期保存和统计
    this.saveInterval = setInterval(() => this.saveHistoryData(), 30000);
    this.statsInterval = setInterval(() => {
      const stats = this.getTrafficStats();
      console.log(`📊 流量: WS ${(stats.wsBytesReceived/1024).toFixed(1)}KB + HTTP ${(stats.httpBytesReceived/1024).toFixed(1)}KB = ${(stats.totalBytesReceived/1024).toFixed(1)}KB | ` +
        `HTTP分析: ${this.httpAnalyzing.size}个进行中, ${this.httpCooldown.size}个冷却中`);
    }, 30000);
  }

  async startWithProxies() {
    const proxies = this.proxyManager.proxies;
    const marketsPerProxy = Math.ceil(this.markets.length / proxies.length);
    
    console.log(`📡 分配 ${this.markets.length} 个市场到 ${proxies.length} 个代理`);

    let marketIndex = 0;
    for (let i = 0; i < proxies.length && marketIndex < this.markets.length; i++) {
      const proxy = proxies[i];
      const proxyUrl = this.formatProxyUrl(proxy);
      const assignedMarkets = this.markets.slice(marketIndex, marketIndex + marketsPerProxy);
      marketIndex += marketsPerProxy;

      try {
        const ws = await this.createWebSocketConnection(proxyUrl);
        this.wsConnections.set(proxyUrl, ws);
        
        await new Promise(r => setTimeout(r, 300));
        
        for (const symbol of assignedMarkets) {
          this.marketSubscriptions.set(symbol, proxyUrl);
          this.subscribeToMarket(ws, symbol);
          await new Promise(r => setTimeout(r, 30));
        }
      } catch (error) {
        console.error(`❌ 代理 #${i + 1} 连接失败`);
      }

      if ((i + 1) % 10 === 0) {
        await new Promise(r => setTimeout(r, 500));
      }
    }

    console.log(`✅ WebSocket连接完成，活跃: ${this.wsConnections.size}`);
  }

  formatProxyUrl(proxy) {
    if (proxy.username && proxy.password) {
      return `http://${proxy.username}:${proxy.password}@${proxy.host}:${proxy.port}`;
    }
    return `http://${proxy.host}:${proxy.port}`;
  }

  async startDirect() {
    console.log('📡 使用直连模式...');
    try {
      const ws = await this.createWebSocketConnection(null);
      this.wsConnections.set('direct', ws);

      for (const symbol of this.markets) {
        this.marketSubscriptions.set(symbol, 'direct');
        this.subscribeToMarket(ws, symbol);
        await new Promise(r => setTimeout(r, 100));
      }
    } catch (error) {
      console.error('❌ 直连模式启动失败:', error);
    }
  }

  stopWebSocketCollection() {
    console.log('⏹️ 停止数据收集...');

    for (const [id, ws] of this.wsConnections.entries()) {
      try { ws.close(1000); } catch (e) {}
    }

    this.wsConnections.clear();
    this.marketSubscriptions.clear();
    this.reconnectAttempts.clear();
    this.stopHttpAnalysis();

    if (this.saveInterval) clearInterval(this.saveInterval);
    if (this.statsInterval) clearInterval(this.statsInterval);

    this.isCollecting = false;
    this.saveHistoryData();

    const stats = this.getTrafficStats();
    console.log(`📊 本次统计: WS ${(stats.wsBytesReceived/1024).toFixed(1)}KB, HTTP ${(stats.httpBytesReceived/1024).toFixed(1)}KB, 总计 ${(stats.totalBytesReceived/1024).toFixed(1)}KB`);
  }

  startMonitoring() {
    if (this.isMonitoringActive) {
      this.resetMonitoringTimer();
      return { success: true, message: '监控时间已延长', remainingTime: this.getRemainingTime() };
    }

    console.log('🚀 开始混合模式监控...');
    this.isMonitoringActive = true;
    this.monitoringStartTime = Date.now();
    
    this.startWebSocketCollection();
    this.resetMonitoringTimer();
    
    return { success: true, message: '混合模式监控已启动', remainingTime: this.monitoringDuration };
  }

  stopMonitoring() {
    if (!this.isMonitoringActive) {
      return { success: false, message: '监控未在运行' };
    }

    console.log('⏹️ 停止监控...');
    this.isMonitoringActive = false;
    this.monitoringStartTime = null;
    
    if (this.monitoringTimer) {
      clearTimeout(this.monitoringTimer);
      this.monitoringTimer = null;
    }
    
    this.stopWebSocketCollection();
    return { success: true, message: '监控已停止' };
  }

  resetMonitoringTimer() {
    if (this.monitoringTimer) clearTimeout(this.monitoringTimer);
    this.monitoringStartTime = Date.now();
    this.monitoringTimer = setTimeout(() => {
      console.log('⏰ 15分钟到，自动停止');
      this.stopMonitoring();
    }, this.monitoringDuration);
  }

  getRemainingTime() {
    if (!this.isMonitoringActive || !this.monitoringStartTime) return 0;
    return Math.max(0, this.monitoringDuration - (Date.now() - this.monitoringStartTime));
  }

  getMonitoringStatus() {
    return {
      isActive: this.isMonitoringActive,
      startTime: this.monitoringStartTime,
      remainingTime: this.getRemainingTime(),
      isCollecting: this.isCollecting,
      mode: 'hybrid',
      httpAnalyzing: Array.from(this.httpAnalyzing),
      httpCooldownCount: this.httpCooldown.size,
      trafficStats: this.getTrafficStats()
    };
  }

  saveHistoryData() {
    try {
      const dataToSave = {};
      for (const [symbol, history] of this.spreadHistory.entries()) {
        dataToSave[symbol] = {
          ws: (history.ws || []).slice(-this.maxHistoryPoints),
          http: (history.http || []).slice(-this.maxHistoryPoints)
        };
      }
      fs.writeFileSync(this.dataFile, JSON.stringify(dataToSave, null, 2));
    } catch (error) {
      console.error('❌ 保存失败:', error);
    }
  }

  loadHistoryData() {
    try {
      if (fs.existsSync(this.dataFile)) {
        const data = JSON.parse(fs.readFileSync(this.dataFile, 'utf8'));
        for (const [symbol, history] of Object.entries(data)) {
          if (history.ws || history.http) {
            this.spreadHistory.set(symbol, history);
          } else {
            // 兼容旧格式
            this.spreadHistory.set(symbol, { ws: history, http: [] });
          }
        }
        console.log(`📂 加载了 ${this.spreadHistory.size} 个市场的历史数据`);
      }
    } catch (error) {
      console.error('❌ 加载失败:', error);
    }
  }
}

module.exports = HybridDataCollector;
