#!/bin/bash

# Paradex数据收集器部署脚本

echo "🚀 开始部署Paradex数据收集器..."

# 创建必要的目录
mkdir -p logs

# 安装依赖
echo "📦 安装依赖..."
npm install --production

# 检查代理文件
if [ ! -f "proxies.txt" ]; then
    echo "⚠️  警告: proxies.txt 文件不存在，将使用直连模式"
    echo "请将代理列表保存到 proxies.txt 文件中"
fi

# 停止现有进程
echo "🛑 停止现有进程..."
pm2 stop paradex-collector 2>/dev/null || true

# 启动新进程
echo "▶️  启动数据收集器..."
pm2 start ecosystem.config.js --env production

# 保存PM2配置
pm2 save

# 设置开机自启
pm2 startup

echo "✅ 部署完成！"
echo ""
echo "📊 查看状态: pm2 status"
echo "📝 查看日志: pm2 logs paradex-collector"
echo "🔄 重启服务: pm2 restart paradex-collector"
echo "🛑 停止服务: pm2 stop paradex-collector"
echo ""
echo "🌐 API地址: http://your-server-ip:3002"
echo "   - GET /api/analysis - 获取分析数据"
echo "   - GET /api/status - 获取服务状态"