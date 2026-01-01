#!/bin/bash

# Paradex后端API测试脚本 (Linux/Mac)
# 使用方法: ./test-backend.sh your-server-ip

if [ -z "$1" ]; then
    echo "❌ 请提供服务器IP地址"
    echo "使用方法: ./test-backend.sh your-server-ip"
    exit 1
fi

SERVER_IP=$1
BASE_URL="http://${SERVER_IP}:3002"

echo "🔍 测试Paradex后端API..."
echo "服务器地址: $BASE_URL"
echo ""

# 测试1: 检查服务器状态
echo "1️⃣ 测试服务器状态..."
STATUS_RESPONSE=$(curl -s -w "%{http_code}" -o /tmp/status.json "$BASE_URL/api/status" --connect-timeout 10)
HTTP_CODE="${STATUS_RESPONSE: -3}"

if [ "$HTTP_CODE" = "200" ]; then
    echo "✅ 服务器状态正常 (HTTP $HTTP_CODE)"
    
    # 解析JSON响应
    if command -v jq &> /dev/null; then
        MARKETS=$(jq -r '.markets' /tmp/status.json)
        HISTORY_SIZE=$(jq -r '.historySize' /tmp/status.json)
        IS_COLLECTING=$(jq -r '.isCollecting' /tmp/status.json)
        USE_PROXY=$(jq -r '.useProxy' /tmp/status.json)
        
        echo "   - 市场数量: $MARKETS"
        echo "   - 历史数据: $HISTORY_SIZE 个市场"
        echo "   - 数据收集中: $IS_COLLECTING"
        echo "   - 使用代理: $USE_PROXY"
    else
        echo "   - 响应数据: $(cat /tmp/status.json)"
        echo "   💡 安装jq可以获得更好的JSON解析: sudo apt install jq"
    fi
else
    echo "❌ 服务器状态检查失败 (HTTP $HTTP_CODE)"
    echo "   请检查:"
    echo "   - 服务器是否启动 (pm2 status)"
    echo "   - 防火墙端口3002是否开放"
    echo "   - 服务器IP地址是否正确"
    exit 1
fi

echo ""

# 测试2: 检查分析数据
echo "2️⃣ 测试分析数据..."
ANALYSIS_RESPONSE=$(curl -s -w "%{http_code}" -o /tmp/analysis.json "$BASE_URL/api/analysis" --connect-timeout 15)
HTTP_CODE="${ANALYSIS_RESPONSE: -3}"

if [ "$HTTP_CODE" = "200" ]; then
    echo "✅ 分析数据获取成功"
    
    if command -v jq &> /dev/null; then
        TOTAL_MARKETS=$(jq -r '.totalMarkets' /tmp/analysis.json)
        echo "   - 分析市场数: $TOTAL_MARKETS"
        
        if [ "$TOTAL_MARKETS" -gt 0 ]; then
            TOP_SYMBOL=$(jq -r '.data[0].symbol' /tmp/analysis.json)
            TOP_SCORE=$(jq -r '.data[0].stabilityScore' /tmp/analysis.json)
            TOP_POINTS=$(jq -r '.data[0].totalPoints' /tmp/analysis.json)
            
            echo "   - 顶级市场: $TOP_SYMBOL"
            echo "   - 稳定性评分: $TOP_SCORE"
            echo "   - 数据点数: $TOP_POINTS"
        else
            echo "   ⚠️ 分析数据为空，可能需要等待数据收集"
        fi
    fi
else
    echo "❌ 分析数据获取失败 (HTTP $HTTP_CODE)"
fi

echo ""

# 测试3: 检查网络连通性
echo "3️⃣ 测试网络连通性..."
if timeout 5 bash -c "</dev/tcp/$SERVER_IP/3002" 2>/dev/null; then
    echo "✅ 端口3002连通正常"
else
    echo "❌ 端口3002连接失败"
    echo "   请检查防火墙设置"
fi

echo ""
echo "🎯 测试完成！"
echo "如果所有测试都通过，你的后端API运行正常。"
echo "可以在Vercel中设置环境变量: NEXT_PUBLIC_DATA_SERVER_URL=$BASE_URL"

# 清理临时文件
rm -f /tmp/status.json /tmp/analysis.json