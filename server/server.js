const express = require('express');
const cors = require('cors');
const DataCollector = require('./data-collector');

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
    
    res.json({
      success: true,
      status: 'running',
      markets: collector.markets.length,
      historySize: collector.spreadHistory.size,
      isCollecting: collector.isCollecting,
      useProxy: collector.useProxy,
      proxyStats,
      monitoring: monitoringStatus,
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
    // 注意：不再自动启动数据收集，改为按需启动
    console.log('✅ 数据收集器已初始化，等待按需启动');
    
    app.listen(port, () => {
      console.log(`Data collection server running on port ${port}`);
      console.log(`API endpoints:`);
      console.log(`  GET /api/analysis - Get spread analysis`);
      console.log(`  GET /api/market/:symbol/history - Get market history`);
      console.log(`  GET /api/status - Get server status`);
      console.log(`  POST /api/monitoring/start - Start monitoring (15 min)`);
      console.log(`  POST /api/monitoring/stop - Stop monitoring`);
      console.log(`  GET /api/monitoring/status - Get monitoring status`);
      console.log('');
      console.log('🎛️ 按需监控模式：访问前端点击"开始监控"按钮启动');
    });
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
}

startServer();