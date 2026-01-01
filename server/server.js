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
    res.json({
      success: true,
      status: 'running',
      markets: collector.markets.length,
      historySize: collector.spreadHistory.size,
      isCollecting: collector.isCollecting,
      useProxy: collector.useProxy,
      proxyStats,
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

// 启动服务器
async function startServer() {
  try {
    await collector.initialize();
    collector.start();
    
    app.listen(port, () => {
      console.log(`Data collection server running on port ${port}`);
      console.log(`API endpoints:`);
      console.log(`  GET /api/analysis - Get spread analysis`);
      console.log(`  GET /api/market/:symbol/history - Get market history`);
      console.log(`  GET /api/status - Get server status`);
    });
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
}

startServer();