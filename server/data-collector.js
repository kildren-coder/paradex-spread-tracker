const fs = require('fs');
const path = require('path');
const https = require('https');
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
      res.on('data', (chunk) => {
        data += chunk;
      });
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

class DataCollector {
  constructor() {
    this.markets = [];
    this.spreadHistory = new Map(); // symbol -> array of spread data
    this.maxHistoryMinutes = 3;
    this.maxHistoryPoints = this.maxHistoryMinutes * 60; // 3分钟 * 60秒
    this.isCollecting = false;
    this.dataFile = path.join(__dirname, 'spread-data.json');
    this.proxyFile = path.join(__dirname, 'proxies.txt');
    this.proxyManager = new ProxyManager();
    this.useProxy = false;
    
    // 加载历史数据
    this.loadHistoryData();
    
    // 尝试加载代理
    this.loadProxies();
  }

  async initialize() {
    console.log('Initializing data collector...');
    await this.fetchMarkets();
    console.log(`Found ${this.markets.length} PERP markets`);
  }

  loadProxies() {
    try {
      if (fs.existsSync(this.proxyFile)) {
        const proxyData = fs.readFileSync(this.proxyFile, 'utf8');
        this.proxyManager.loadProxies(proxyData);
        this.useProxy = true;
        console.log(`Proxy mode enabled with ${this.proxyManager.proxies.length} proxies`);
      } else {
        console.log('No proxy file found, using direct connection');
        this.useProxy = false;
      }
    } catch (error) {
      console.error('Error loading proxies:', error);
      this.useProxy = false;
    }
  }

  async fetchWithRetry(url, maxRetries = 3) {
    for (let i = 0; i < maxRetries; i++) {
      try {
        if (this.useProxy) {
          return await this.proxyManager.fetchWithProxy(url);
        } else {
          return await fetch(url, { cache: 'no-store' });
        }
      } catch (error) {
        if (i === maxRetries - 1) {
          throw error;
        }
        // 短暂延迟后重试
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    }
  }

  getProxyStats() {
    if (this.useProxy) {
      return this.proxyManager.getStats();
    }
    return { total: 0, active: 0, failed: 0, stats: [] };
  }

  async fetchMarkets() {
    try {
      const response = await this.fetchWithRetry('https://api.prod.paradex.trade/v1/markets');
      const data = await response.json();
      
      this.markets = data.results.filter(market => 
        market.asset_kind === 'PERP'
      ).map(market => market.symbol);
      
    } catch (error) {
      console.error('Error fetching markets:', error);
    }
  }

  async collectSpreadData() {
    if (this.isCollecting) return;
    this.isCollecting = true;

    const timestamp = Date.now();
    
    try {
      // 完全并发：所有市场同时请求，不分批
      if (this.useProxy) {
        const allPromises = this.markets.map(async (symbol) => {
          try {
            const response = await this.fetchWithRetry(
              `https://api.prod.paradex.trade/v1/bbo/${symbol}/interactive`
            );
            
            if (response.ok) {
              const data = await response.json();
              const bid = parseFloat(data.bid);
              const ask = parseFloat(data.ask);
              const spread = ask - bid;
              const spreadPercent = (spread / bid) * 100;
              
              return {
                symbol,
                bid,
                ask,
                spread,
                spreadPercent,
                timestamp: data.last_updated_at || timestamp,
                proxy: response.proxy || 'direct'
              };
            }
          } catch (error) {
            console.error(`Error fetching ${symbol}:`, error.message);
          }
          return null;
        });

        const results = await Promise.all(allPromises);
        
        // 存储有效结果
        results.filter(result => result !== null).forEach(data => {
          if (!this.spreadHistory.has(data.symbol)) {
            this.spreadHistory.set(data.symbol, []);
          }
          
          const history = this.spreadHistory.get(data.symbol);
          history.push(data);
          
          // 保持历史数据在3分钟内
          const cutoffTime = timestamp - (this.maxHistoryMinutes * 60 * 1000);
          while (history.length > 0 && history[0].timestamp < cutoffTime) {
            history.shift();
          }
          
          // 限制最大数据点数
          if (history.length > this.maxHistoryPoints) {
            history.splice(0, history.length - this.maxHistoryPoints);
          }
        });
      } else {
        // 非代理模式保持原有的分批逻辑
        const batchSize = 10;
        const delayBetweenBatches = 500;

        for (let i = 0; i < this.markets.length; i += batchSize) {
          const batch = this.markets.slice(i, i + batchSize);
          
          const batchPromises = batch.map(async (symbol) => {
            try {
              const response = await this.fetchWithRetry(
                `https://api.prod.paradex.trade/v1/bbo/${symbol}/interactive`
              );
              
              if (response.ok) {
                const data = await response.json();
                const bid = parseFloat(data.bid);
                const ask = parseFloat(data.ask);
                const spread = ask - bid;
                const spreadPercent = (spread / bid) * 100;
                
                return {
                  symbol,
                  bid,
                  ask,
                  spread,
                  spreadPercent,
                  timestamp: data.last_updated_at || timestamp,
                  proxy: response.proxy || 'direct'
                };
              }
            } catch (error) {
              console.error(`Error fetching ${symbol}:`, error.message);
            }
            return null;
          });

          const results = await Promise.all(batchPromises);
          
          // 存储有效结果
          results.filter(result => result !== null).forEach(data => {
            if (!this.spreadHistory.has(data.symbol)) {
              this.spreadHistory.set(data.symbol, []);
            }
            
            const history = this.spreadHistory.get(data.symbol);
            history.push(data);
            
            // 保持历史数据在3分钟内
            const cutoffTime = timestamp - (this.maxHistoryMinutes * 60 * 1000);
            while (history.length > 0 && history[0].timestamp < cutoffTime) {
              history.shift();
            }
            
            // 限制最大数据点数
            if (history.length > this.maxHistoryPoints) {
              history.splice(0, history.length - this.maxHistoryPoints);
            }
          });

          // 批次间延迟
          if (i + batchSize < this.markets.length) {
            await new Promise(resolve => setTimeout(resolve, delayBetweenBatches));
          }
        }
      }

      // 保存数据到文件
      this.saveHistoryData();
      
      const proxyInfo = this.useProxy ? ` (using ${this.proxyManager.getStats().active} proxies)` : '';
      console.log(`Collected data for ${this.spreadHistory.size} markets at ${new Date().toLocaleTimeString()}${proxyInfo}`);
      
    } catch (error) {
      console.error('Error in data collection:', error);
    } finally {
      this.isCollecting = false;
    }
  }

  calculateStabilityMetrics(symbol) {
    const history = this.spreadHistory.get(symbol);
    if (!history || history.length < 3) { // 降低到3个数据点
      return null;
    }

    const totalPoints = history.length;
    let zeroSpreadCount = 0;
    let negativeSpreadCount = 0;
    let lowSpreadCount = 0; // 点差 < 0.001%
    let mediumSpreadCount = 0; // 点差 0.001% - 0.01%
    let highSpreadCount = 0; // 点差 > 0.01%
    let veryHighSpreadCount = 0; // 点差 > 0.05%
    
    let totalSpread = 0;
    let minSpread = Infinity;
    let maxSpread = -Infinity;
    let spreadVariance = 0;

    // 第一遍：计算基本统计
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
    
    // 第二遍：计算方差（稳定性指标）
    history.forEach(data => {
      const diff = data.spreadPercent - avgSpread;
      spreadVariance += diff * diff;
    });
    spreadVariance = spreadVariance / totalPoints;
    const spreadStdDev = Math.sqrt(spreadVariance);

    // 计算各种频率
    const zeroSpreadFreq = (zeroSpreadCount / totalPoints) * 100;
    const negativeSpreadFreq = (negativeSpreadCount / totalPoints) * 100;
    const lowSpreadFreq = (lowSpreadCount / totalPoints) * 100;
    const mediumSpreadFreq = (mediumSpreadCount / totalPoints) * 100;
    const highSpreadFreq = (highSpreadCount / totalPoints) * 100;
    const veryHighSpreadFreq = (veryHighSpreadCount / totalPoints) * 100;

    // 新的评分模型：动态权重，考虑稳定性
    let stabilityScore = 0;
    
    // 1. 稳定性奖励（中等点差频率高的获得奖励）
    const stabilityBonus = mediumSpreadFreq * 2; // 0.001%-0.01%的稳定点差
    
    // 2. 低点差奖励（权重适中）
    const lowSpreadBonus = lowSpreadFreq * 1;
    
    // 3. 动态零点差/负点差奖励（根据稳定性调整权重）
    // 稳定性因子：基于中等点差频率和低波动性
    const stabilityFactor = Math.min(1, (mediumSpreadFreq / 50) * (1 / Math.max(1, spreadStdDev * 10)));
    
    // 零点差奖励：稳定市场权重高，不稳定市场权重低
    const zeroSpreadBonus = zeroSpreadFreq * (0.2 + stabilityFactor * 1.8); // 权重范围：0.2-2.0
    const negativeSpreadBonus = negativeSpreadFreq * (0.1 + stabilityFactor * 1.4); // 权重范围：0.1-1.5
    
    // 4. 高点差重度惩罚（这是最重要的风险因素）
    const highSpreadPenalty = highSpreadFreq * 3;
    const veryHighSpreadPenalty = veryHighSpreadFreq * 10; // 极高点差严重惩罚
    
    // 5. 波动性惩罚（点差不稳定的市场风险高）
    const volatilityPenalty = Math.min(spreadStdDev * 100, 50); // 标准差越大惩罚越重
    
    // 6. 平均点差惩罚
    const avgSpreadPenalty = Math.max(0, avgSpread * 10); // 平均点差越高惩罚越重
    
    // 7. 稳定性一致性奖励：如果零点差频率高且稳定性也高，额外奖励
    const consistencyBonus = (zeroSpreadFreq > 20 && mediumSpreadFreq > 30) ? 10 : 0;
    
    // 综合评分
    stabilityScore = stabilityBonus + lowSpreadBonus + zeroSpreadBonus + negativeSpreadBonus + consistencyBonus
                    - highSpreadPenalty - veryHighSpreadPenalty - volatilityPenalty - avgSpreadPenalty;
    
    // 确保评分不为负数，并限制在合理范围内
    stabilityScore = Math.max(0, Math.min(100, stabilityScore));

    return {
      symbol,
      totalPoints,
      avgSpread,
      minSpread,
      maxSpread,
      spreadStdDev, // 新增：点差标准差
      zeroSpreadFreq,
      negativeSpreadFreq,
      lowSpreadFreq,
      mediumSpreadFreq, // 新增：中等点差频率
      highSpreadFreq,
      veryHighSpreadFreq, // 新增：极高点差频率
      stabilityScore,
      // 新增：评分详情
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

    // 按稳定性评分排序（高分在前）
    analysis.sort((a, b) => b.stabilityScore - a.stabilityScore);
    
    return analysis;
  }

  saveHistoryData() {
    try {
      const dataToSave = {};
      for (const [symbol, history] of this.spreadHistory.entries()) {
        // 只保存最近的数据
        dataToSave[symbol] = history.slice(-this.maxHistoryPoints);
      }
      
      fs.writeFileSync(this.dataFile, JSON.stringify(dataToSave, null, 2));
    } catch (error) {
      console.error('Error saving history data:', error);
    }
  }

  loadHistoryData() {
    try {
      if (fs.existsSync(this.dataFile)) {
        const data = JSON.parse(fs.readFileSync(this.dataFile, 'utf8'));
        
        for (const [symbol, history] of Object.entries(data)) {
          this.spreadHistory.set(symbol, history);
        }
        
        console.log(`Loaded history for ${this.spreadHistory.size} markets`);
      }
    } catch (error) {
      console.error('Error loading history data:', error);
    }
  }

  start() {
    console.log('Starting data collection...');
    
    // 立即收集一次
    this.collectSpreadData();
    
    // 根据是否使用代理决定收集频率
    const interval = this.useProxy ? 1000 : 60000; // 代理模式每秒，直连模式每分钟
    console.log(`Collection interval: ${interval/1000}s`);
    
    setInterval(() => {
      // 不管上一轮是否完成，都尝试启动新的收集
      // collectSpreadData内部有isCollecting保护，避免重复执行
      this.collectSpreadData();
    }, interval);
    
    // 添加性能监控
    if (this.useProxy) {
      setInterval(() => {
        const stats = this.proxyManager.getStats();
        console.log(`Proxy stats: ${stats.active}/${stats.total} active, ${stats.failed} failed`);
      }, 30000); // 每30秒输出一次代理统计
    }
  }
}

module.exports = DataCollector;