const express = require('express');
const cors = require('cors');

// 根据环境变量选择数据收集器
// hybrid: 混合模式（默认，推荐）
// websocket: 纯WebSocket模式
// http: 纯HTTP模式
const collectorMode = process.env.COLLECTOR_MODE || 'hybrid';

let DataCollector;
if (collectorMode === 'websocket') {
  DataCollector = require('./ws-data-collector');
} else if (collectorMode === 'http') {
  DataCollector = require('./data-collector');
} else {
  DataCollector = require('./hybrid-data-collector');
}

const app = express();
const port = process.env.PORT || 3002;

// 中间件
app.use(cors({
  origin: [
    'http://localhost:3000',
    'http://localhost:3001',
    /^https:\/\/.*\.vercel\.app$/,  // 允许所有Vercel域名
    /^https:\/\/paradex-.*\.vercel\.app$/,  // 更具体的Vercel域名匹配
    // 添加你的自定义域名
    // 'https://your-custom-domain.com'
  ],
  credentials: true
}));
app.use(express.json());

// 初始化数据收集器
const collector = new DataCollector();

// API路由
app.get('/api/analysis', (req, res) => {
  try {
    const analysis = collector.getAnalysisData();
    res.json({
      success: true,
      data: analysis,
      timestamp: Date.now(),
      totalMarkets: analysis.length
    });
  } catch (error) {
    console.error('Error getting analysis:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get analysis data'
    });
  }
});

app.get('/api/market/:symbol/history', (req, res) => {
  try {
    const { symbol } = req.params;
    const history = collector.spreadHistory.get(symbol) || [];
    
    res.json({
      success: true,
      symbol,
      history,
      count: history.length
    });
  } catch (error) {
    console.error('Error getting market history:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get market history'
    });
  }
});

app.get('/api/status', (req, res) => {
  try {
    const proxyStats = collector.getProxyStats();
    const monitoringStatus = collector.getMonitoringStatus();
    const trafficStats = collector.getTrafficStats ? collector.getTrafficStats() : null;
    
    res.json({
      success: true,
      status: 'running',
      mode: monitoringStatus.mode || 'http',
      markets: collector.markets.length,
      historySize: collector.spreadHistory.size,
      isCollecting: collector.isCollecting,
      useProxy: collector.useProxy,
      proxyStats,
      monitoring: monitoringStatus,
      trafficStats,
      timestamp: Date.now()
    });
  } catch (error) {
    console.error('Error getting status:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get status'
    });
  }
});

// 监控控制API
app.post('/api/monitoring/start', (req, res) => {
  try {
    const result = collector.startMonitoring();
    res.json(result);
  } catch (error) {
    console.error('Error starting monitoring:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to start monitoring'
    });
  }
});

app.post('/api/monitoring/stop', (req, res) => {
  try {
    const result = collector.stopMonitoring();
    res.json(result);
  } catch (error) {
    console.error('Error stopping monitoring:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to stop monitoring'
    });
  }
});

app.get('/api/monitoring/status', (req, res) => {
  try {
    const status = collector.getMonitoringStatus();
    res.json({
      success: true,
      ...status
    });
  } catch (error) {
    console.error('Error getting monitoring status:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get monitoring status'
    });
  }
});

// 启动服务器
async function startServer() {
  try {
    await collector.initialize();
    console.log(`✅ 数据收集器已初始化 (${collectorMode} 模式)`);
    console.log('🎛️ 按需监控模式：访问前端点击"开始监控"按钮启动');
    
    app.listen(port, () => {
      console.log(`🚀 数据收集服务器运行在端口 ${port}`);
      console.log(`📡 模式: ${collectorMode}`);
      if (collectorMode === 'hybrid') {
        console.log(`   - WebSocket: 持续监控，节流1次/秒`);
        console.log(`   - HTTP: 轮询分析高分币种，3分钟冷却`);
      }
      console.log(`API endpoints:`);
      console.log(`  GET /api/analysis - 获取点差分析`);
      console.log(`  GET /api/market/:symbol/history - 获取市场历史`);
      console.log(`  GET /api/status - 获取服务器状态`);
      console.log(`  POST /api/monitoring/start - 开始监控 (15分钟)`);
      console.log(`  POST /api/monitoring/stop - 停止监控`);
      console.log(`  GET /api/monitoring/status - 获取监控状态`);
    });
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
}

startServer();