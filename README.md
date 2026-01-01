# Paradex 点差稳定性分析

一个基于3分钟滑动窗口的 Paradex 永续合约点差稳定性分析系统，专注于零点差和负点差频率分析。

## 🎯 核心功能

- **实时数据收集**: 每秒收集所有PERP市场的点差数据
- **稳定性分析**: 基于3分钟历史数据计算零点差/负点差频率
- **智能排序**: 按稳定性评分排序，优先显示高频零点差市场
- **API限制优化**: 分批请求，避免超出Paradex API限制
- **持久化存储**: 数据本地存储，重启后保持历史数据

## 🏗️ 系统架构

### 后端数据收集器 (Node.js)
- 每秒收集所有PERP市场数据
- 维护3分钟滑动窗口历史
- 计算稳定性指标和评分
- 提供REST API接口

### 前端展示 (Next.js)
- 实时显示分析结果
- 响应式设计
- 自动刷新数据

## 📊 分析指标

- **零点差频率**: 点差 ≤ 0 的时间占比
- **负点差频率**: 点差 < 0 的时间占比  
- **低点差频率**: 点差 < 0.01% 的时间占比
- **稳定性评分**: 综合评分 = 零点差频率×2 + 负点差频率×3 + 低点差频率×1

## 🚀 快速开始

### 1. 启动数据收集服务器

```bash
cd server
npm install
npm start
```

### 2. 启动前端应用

```bash
npm install
npm run dev
```

### 3. 访问应用

打开浏览器访问 [http://localhost:3001](http://localhost:3001)

## 📈 API限制处理

- **Paradex限制**: 1500 req/min (25 req/s)
- **我们的策略**: 
  - 分批请求 (10个市场/批)
  - 批次间延迟 500ms
  - 总请求频率 ≈ 20 req/s

## 🌐 部署方案

### 推荐架构
1. **数据收集器**: 部署到云服务器 (VPS/AWS/阿里云)
2. **前端**: 部署到 Vercel
3. **数据库**: 可选 Redis/MongoDB 替代文件存储

### Vercel 部署步骤

1. 将前端代码推送到 GitHub
2. 在 Vercel 导入项目
3. 设置环境变量 `NEXT_PUBLIC_DATA_SERVER_URL`
4. 部署完成

### 数据服务器部署

```bash
# 在云服务器上
git clone <your-repo>
cd server
npm install
npm install -g pm2
pm2 start server.js --name paradex-collector
pm2 startup
pm2 save
```

## 🔧 配置选项

### 环境变量

```bash
# .env.local
NEXT_PUBLIC_DATA_SERVER_URL=https://your-data-server.com
```

### 数据收集器配置

```javascript
// server/data-collector.js
maxHistoryMinutes: 3,     // 历史数据窗口
batchSize: 10,            // 批次大小
delayBetweenBatches: 500  // 批次延迟
```

## 📋 API 接口

### GET /api/analysis
获取所有市场的稳定性分析

### GET /api/market/:symbol/history  
获取指定市场的历史数据

### GET /api/status
获取数据收集器状态

## 🛠️ 技术栈

- **后端**: Node.js + Express
- **前端**: Next.js 14 + TypeScript
- **样式**: CSS Modules
- **部署**: Vercel + 云服务器

## 📝 许可证

MIT