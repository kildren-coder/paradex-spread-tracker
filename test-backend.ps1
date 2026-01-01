# Paradex后端API测试脚本
# 使用方法: .\test-backend.ps1 your-server-ip

param(
    [Parameter(Mandatory=$true)]
    [string]$ServerIP
)

$baseUrl = "http://${ServerIP}:3002"

Write-Host "🔍 测试Paradex后端API..." -ForegroundColor Green
Write-Host "服务器地址: $baseUrl" -ForegroundColor Yellow
Write-Host ""

# 测试1: 检查服务器状态
Write-Host "1️⃣ 测试服务器状态..." -ForegroundColor Cyan
try {
    $status = Invoke-RestMethod -Uri "$baseUrl/api/status" -TimeoutSec 10
    Write-Host "✅ 服务器状态: $($status.status)" -ForegroundColor Green
    Write-Host "   - 市场数量: $($status.markets)" -ForegroundColor White
    Write-Host "   - 历史数据: $($status.historySize) 个市场" -ForegroundColor White
    Write-Host "   - 数据收集中: $($status.isCollecting)" -ForegroundColor White
    Write-Host "   - 使用代理: $($status.useProxy)" -ForegroundColor White
    if ($status.proxyStats) {
        Write-Host "   - 代理状态: $($status.proxyStats.active)/$($status.proxyStats.total) 可用" -ForegroundColor White
    }
} catch {
    Write-Host "❌ 服务器状态检查失败: $($_.Exception.Message)" -ForegroundColor Red
    Write-Host "   请检查:" -ForegroundColor Yellow
    Write-Host "   - 服务器是否启动 (pm2 status)" -ForegroundColor Yellow
    Write-Host "   - 防火墙端口3002是否开放" -ForegroundColor Yellow
    Write-Host "   - 服务器IP地址是否正确" -ForegroundColor Yellow
    return
}

Write-Host ""

# 测试2: 检查分析数据
Write-Host "2️⃣ 测试分析数据..." -ForegroundColor Cyan
try {
    $analysis = Invoke-RestMethod -Uri "$baseUrl/api/analysis" -TimeoutSec 15
    if ($analysis.success -and $analysis.totalMarkets -gt 0) {
        Write-Host "✅ 分析数据正常" -ForegroundColor Green
        Write-Host "   - 分析市场数: $($analysis.totalMarkets)" -ForegroundColor White
        
        $topMarket = $analysis.data[0]
        Write-Host "   - 顶级市场: $($topMarket.symbol)" -ForegroundColor White
        Write-Host "   - 稳定性评分: $($topMarket.stabilityScore.ToString('F1'))" -ForegroundColor White
        Write-Host "   - 数据点数: $($topMarket.totalPoints)" -ForegroundColor White
    } else {
        Write-Host "⚠️ 分析数据为空，可能需要等待数据收集" -ForegroundColor Yellow
        Write-Host "   建议等待1-2分钟后重试" -ForegroundColor Yellow
    }
} catch {
    Write-Host "❌ 分析数据获取失败: $($_.Exception.Message)" -ForegroundColor Red
}

Write-Host ""

# 测试3: 检查特定市场历史数据
Write-Host "3️⃣ 测试市场历史数据..." -ForegroundColor Cyan
try {
    $history = Invoke-RestMethod -Uri "$baseUrl/api/market/BTC-USD-PERP/history" -TimeoutSec 10
    if ($history.success -and $history.count -gt 0) {
        Write-Host "✅ 历史数据正常" -ForegroundColor Green
        Write-Host "   - BTC-USD-PERP 数据点: $($history.count)" -ForegroundColor White
        
        $latest = $history.history[-1]
        Write-Host "   - 最新买价: $($latest.bid)" -ForegroundColor White
        Write-Host "   - 最新卖价: $($latest.ask)" -ForegroundColor White
        Write-Host "   - 点差: $($latest.spreadPercent.ToString('F4'))%" -ForegroundColor White
    } else {
        Write-Host "⚠️ 历史数据为空" -ForegroundColor Yellow
    }
} catch {
    Write-Host "❌ 历史数据获取失败: $($_.Exception.Message)" -ForegroundColor Red
}

Write-Host ""

# 测试4: 网络连通性
Write-Host "4️⃣ 测试网络连通性..." -ForegroundColor Cyan
try {
    $ping = Test-NetConnection -ComputerName $ServerIP -Port 3002 -WarningAction SilentlyContinue
    if ($ping.TcpTestSucceeded) {
        Write-Host "✅ 端口3002连通正常" -ForegroundColor Green
    } else {
        Write-Host "❌ 端口3002连接失败" -ForegroundColor Red
        Write-Host "   请检查防火墙设置" -ForegroundColor Yellow
    }
} catch {
    Write-Host "⚠️ 网络测试失败: $($_.Exception.Message)" -ForegroundColor Yellow
}

Write-Host ""
Write-Host "🎯 测试完成！" -ForegroundColor Green
Write-Host "如果所有测试都通过，你的后端API运行正常。" -ForegroundColor White
Write-Host "可以在Vercel中设置环境变量: NEXT_PUBLIC_DATA_SERVER_URL=$baseUrl" -ForegroundColor Cyan