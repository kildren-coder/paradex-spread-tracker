# 🚀 Paradex点差分析器 - 快速开始

## 📋 项目概述

这是一个实时监控Paradex永续合约市场点差的分析系统，具有以下特性：

- 🔄 **实时数据收集**: 每2秒收集111个PERP市场数据
- 🎯 **智能评分**: 基于稳定性的动态评分模型
- 🛡️ **风险评估**: 识别高风险和流动性陷阱
- 🌐 **代理支持**: 支持代理池突破API限制
- 📊 **可视化界面**: 现代化的响应式Web界面

## 🏗️ 系统架构

```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   Vercel前端    │────│   云服务器后端   │────│  Paradex API   │
│  (Next.js)     │    │  (Node.js)     │    │               │
└─────────────────┘    └─────────────────┘    └─────────────────┘
```

## 🚀 快速部署

### 方法1: 完整部署（推荐）

1. **后端部署到云服务器**
```bash
# 克隆仓库
git clone https://github.com/kildren-coder/paradex-spread-tracker.git
cd paradex-spread-tracker/server

# 配置代理（可选）
cp proxies.txt.example proxies.txt
nano proxies.txt  # 填入你的代理信息

# 一键部署
chmod +x deploy.sh
./deploy.sh
```

2. **前端部署到Vercel**
   - 访问 [vercel.com](https://vercel.com)
   - 导入GitHub仓库: `kildren-coder/paradex-spread-tracker`
   - 设置环境变量: `NEXT_PUBLIC_DATA_SERVER_URL=http://your-server-ip:3002`
   - 点击Deploy

### 方法2: 本地开发

```bash
# 克隆仓库
git clone https://github.com/kildren-coder/paradex-spread-tracker.git
cd paradex-spread-tracker

# 启动后端
cd server
npm install
npm start

# 启动前端（新终端）
cd ..
npm install
npm run dev
```

访问: http://localhost:3000

## 📊 功能特性

### 🎯 智能评分系统
- **稳定性优先**: 重点奖励0.001%-0.01%的稳定点差
- **动态权重**: 零点差权重根据市场稳定性动态调整
- **风险惩罚**: 严厉惩罚高点差和极高点差
- **波动性考量**: 考虑点差标准差的稳定性

### 📈 实时监控
- **高频采集**: 每2秒收集一次数据
- **3分钟窗口**: 基于180个数据点的滑动分析
- **代理轮换**: 支持100+代理池避免API限制

### 🛡️ 风险管理
- **风险等级**: 低风险、中风险、高风险、极高风险
- **流动性警告**: 识别零点差的流动性陷阱
- **稳定性指标**: 显示点差波动性

## 🔧 配置选项

### 环境变量
```bash
# 前端配置
NEXT_PUBLIC_DATA_SERVER_URL=http://your-server-ip:3002

# 后端配置（可选）
NODE_ENV=production
PORT=3002
```

### 代理配置
```
# server/proxies.txt 格式
host:port:username:password
50.114.92.141:5605:username:password
31.57.90.186:5755:username:password
```

## 📚 详细文档

- 📖 [后端部署指南](server/README-DEPLOY.md)
- 🌐 [Vercel部署指南](README-VERCEL-DEPLOY.md)
- ✅ [部署检查清单](DEPLOYMENT-CHECKLIST.md)

## 🎯 使用场景

### 适合的用户
- 💰 **量化交易员**: 寻找套利机会
- 📊 **市场分析师**: 研究市场微观结构
- 🏦 **做市商**: 监控竞争对手点差
- 🔍 **研究人员**: 分析DEX流动性

### 推荐策略
1. **关注稳定币种**: BTC、ETH等评分高的市场
2. **避免高风险**: 远离极高点差频率的市场
3. **考虑流动性**: 零点差不等于好机会
4. **监控波动**: 关注点差标准差指标

## 🚨 风险提示

⚠️ **重要提醒**:
- 本工具仅供分析参考，不构成投资建议
- 零点差可能存在流动性陷阱
- 高频交易需要考虑网络延迟
- 请在充分了解风险后进行交易

## 🤝 贡献

欢迎提交Issue和Pull Request！

## 📄 许可证

MIT License

---

**🎉 现在你可以开始使用Paradex点差分析器了！**

GitHub仓库: https://github.com/kildren-coder/paradex-spread-tracker