'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import AnalysisCard from './components/AnalysisCard';
import MonitoringControl from './components/MonitoringControl';
import { MarketAnalysis } from './types';

// 数据收集服务器地址 - 生产环境需要更改
const DATA_SERVER_URL = process.env.NEXT_PUBLIC_DATA_SERVER_URL || 'http://localhost:3002';

export default function Home() {
  const [analysis, setAnalysis] = useState<MarketAnalysis[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [currentTime, setCurrentTime] = useState<string>('');
  const [serverStatus, setServerStatus] = useState<any>(null);
  const [monitoringActive, setMonitoringActive] = useState(false);
  const [mounted, setMounted] = useState(false);
  
  // 使用ref来跟踪监控状态，避免闭包问题
  const monitoringActiveRef = useRef(false);

  // 客户端挂载后才显示时间，避免hydration错误
  useEffect(() => {
    setMounted(true);
    setCurrentTime(new Date().toLocaleTimeString('zh-CN', { hour12: false }));
  }, []);

  // 在组件加载时显示数据源配置
  useEffect(() => {
    console.log('🔧 Paradex 前端配置信息:');
    console.log(`📡 数据服务器地址: ${DATA_SERVER_URL}`);
    console.log(`🌍 环境变量 NEXT_PUBLIC_DATA_SERVER_URL: ${process.env.NEXT_PUBLIC_DATA_SERVER_URL || '未设置'}`);
    console.log(`🏠 当前域名: ${typeof window !== 'undefined' ? window.location.origin : 'SSR'}`);
    console.log(`⏰ 初始化时间: ${new Date().toLocaleString()}`);
    console.log('---');
  }, []);

  const fetchAnalysisData = useCallback(async () => {
    // 使用ref来检查监控状态
    if (!monitoringActiveRef.current) {
      return;
    }

    try {
      setError(null);
      
      console.log(`📊 正在从 ${DATA_SERVER_URL}/api/analysis 获取分析数据...`);
      const response = await fetch(`${DATA_SERVER_URL}/api/analysis`, {
        cache: 'no-store',
      });
      
      if (!response.ok) {
        console.error(`❌ 分析数据请求失败: HTTP ${response.status} ${response.statusText}`);
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      
      const result = await response.json();
      
      if (result.success) {
        setAnalysis(result.data);
        console.log(`✅ 分析数据更新成功: ${result.totalMarkets} 个市场, ${result.data.length} 个有效分析 (${new Date().toLocaleTimeString()})`);
      } else {
        console.error('❌ 分析数据响应错误:', result.error);
        throw new Error(result.error || 'Failed to fetch analysis');
      }
      
    } catch (error) {
      console.error('❌ 获取分析数据时发生错误:', error);
      console.error(`🔗 尝试连接的地址: ${DATA_SERVER_URL}/api/analysis`);
      if (monitoringActiveRef.current) {
        setError('无法连接到数据服务器，请确保后端服务正在运行');
      }
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  const fetchServerStatus = useCallback(async () => {
    try {
      console.log(`🔍 正在从 ${DATA_SERVER_URL}/api/status 获取服务器状态...`);
      const response = await fetch(`${DATA_SERVER_URL}/api/status`, {
        cache: 'no-store',
      });
      
      if (response.ok) {
        const status = await response.json();
        setServerStatus(status);
        
        // 不再在这里更新monitoringActive，让MonitoringControl组件负责
        console.log(`✅ 服务器状态获取成功:`, {
          status: status.status,
          markets: status.markets,
          historySize: status.historySize,
          useProxy: status.useProxy,
          monitoringActive: status.monitoring?.isActive,
          proxyStats: status.useProxy ? `${status.proxyStats?.active}/${status.proxyStats?.total}` : 'N/A'
        });
      } else {
        console.error(`❌ 服务器状态请求失败: HTTP ${response.status} ${response.statusText}`);
      }
    } catch (error) {
      console.error('❌ 获取服务器状态时发生错误:', error);
      console.error(`🔗 尝试连接的地址: ${DATA_SERVER_URL}/api/status`);
    }
  }, []);

  // 监控状态变化处理 - 简化逻辑
  const handleMonitoringStatusChange = useCallback((status: any) => {
    console.log(`🎛️ 监控状态变化: ${monitoringActiveRef.current} → ${status.isActive}`);
    
    const wasActive = monitoringActiveRef.current;
    monitoringActiveRef.current = status.isActive;
    setMonitoringActive(status.isActive);
    
    // 如果监控刚启动，立即获取分析数据
    if (status.isActive && !wasActive) {
      console.log('🚀 监控刚启动，3秒后获取分析数据...');
      setTimeout(() => {
        fetchAnalysisData();
      }, 3000);
    }
    
    // 如果监控停止，清空分析数据
    if (!status.isActive && wasActive) {
      console.log('⏹️ 监控已停止，清空分析数据');
      setAnalysis([]);
    }
  }, [fetchAnalysisData]);

  const handleRefresh = () => {
    console.log('🔄 用户手动刷新数据...');
    setRefreshing(true);
    fetchAnalysisData();
    fetchServerStatus();
  };

  useEffect(() => {
    fetchServerStatus(); // 初始获取服务器状态
  }, []);

  // 单独的定时器effect
  useEffect(() => {
    const interval = setInterval(() => {
      fetchServerStatus();
      // 使用ref来检查监控状态
      if (monitoringActiveRef.current) {
        console.log('⏰ 定时获取分析数据...');
        fetchAnalysisData();
      }
    }, 10000);
    
    return () => clearInterval(interval);
  }, [fetchAnalysisData, fetchServerStatus]);

  // 实时时钟
  useEffect(() => {
    if (!mounted) return;
    
    const clockInterval = setInterval(() => {
      setCurrentTime(new Date().toLocaleTimeString('zh-CN', { hour12: false }));
    }, 1000);
    
    return () => clearInterval(clockInterval);
  }, [mounted]);

  if (loading) {
    return (
      <div className="container">
        <div className="header">
          <h1>Paradex 点差稳定性分析</h1>
          <p>基于3分钟滑动窗口的零点差/负点差频率分析</p>
        </div>
        <div className="loading">正在加载分析数据...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="container">
        <div className="header">
          <h1>Paradex 点差稳定性分析</h1>
          <p>基于3分钟滑动窗口的零点差/负点差频率分析</p>
        </div>
        <div className="error">{error}</div>
        <div className="setup-instructions">
          <h3>设置说明：</h3>
          <ol>
            <li>打开新终端，进入 server 目录</li>
            <li>运行: npm install</li>
            <li>运行: npm start</li>
            <li>等待数据收集器启动并开始收集数据</li>
          </ol>
        </div>
        <button 
          className="refresh-button" 
          onClick={handleRefresh}
          disabled={refreshing}
        >
          {refreshing ? '重试中...' : '重试连接'}
        </button>
      </div>
    );
  }

  return (
    <div className="container">
      <div className="header">
        <h1>Paradex 点差稳定性分析</h1>
        <p>基于3分钟滑动窗口的零点差/负点差频率分析 • 按需监控模式</p>
        <div className="current-time">
          当前时间: {mounted ? currentTime : '--:--:--'}
        </div>
        <div className="data-source-info">
          📡 数据源: <code>{DATA_SERVER_URL}</code>
        </div>
      </div>

      {/* 监控控制面板 */}
      <MonitoringControl 
        serverUrl={DATA_SERVER_URL}
        onStatusChange={handleMonitoringStatusChange}
      />

      {/* 服务器状态显示 */}
      {serverStatus && (
        <div className="server-status">
          服务器状态: {serverStatus.status === 'running' ? '🟢 运行中' : '🔴 离线'} | 
          模式: {serverStatus.mode === 'websocket' ? '🔌 WebSocket' : '📡 HTTP'} |
          市场数: {serverStatus.markets} | 
          历史数据: {serverStatus.historySize} 个市场
          {serverStatus.useProxy && serverStatus.proxyStats && (
            <span> | 代理: {serverStatus.proxyStats.active}/{serverStatus.proxyStats.total} 可用</span>
          )}
          {serverStatus.monitoring && (
            <span> | 监控: {serverStatus.monitoring.isActive ? '🟢 激活' : '🔴 停止'}</span>
          )}
        </div>
      )}

      {/* 流量统计显示 */}
      {serverStatus?.trafficStats && serverStatus.trafficStats.startTime && (
        <div className="traffic-stats">
          📊 流量统计: 
          {serverStatus.trafficStats.wsBytesReceived !== undefined ? (
            <>
              WS {(serverStatus.trafficStats.wsBytesReceived / 1024).toFixed(1)} KB + 
              HTTP {(serverStatus.trafficStats.httpBytesReceived / 1024).toFixed(1)} KB = 
              总计 {(serverStatus.trafficStats.totalBytesReceived / 1024).toFixed(1)} KB |
              HTTP请求 {serverStatus.trafficStats.httpRequests} 次
            </>
          ) : (
            <>
              接收 {(serverStatus.trafficStats.bytesReceived / 1024).toFixed(2)} KB | 
              发送 {(serverStatus.trafficStats.bytesSent / 1024).toFixed(2)} KB | 
              消息 {serverStatus.trafficStats.messagesReceived} 条
            </>
          )}
          {serverStatus.monitoring?.httpAnalyzing && serverStatus.monitoring.httpAnalyzing.length > 0 && (
            <span> | 🔍 HTTP分析中: {serverStatus.monitoring.httpAnalyzing.join(', ')}</span>
          )}
        </div>
      )}

      {/* 指标说明 */}
      <div className="metrics-explanation">
        <details>
          <summary>📊 指标说明</summary>
          <div className="explanation-content">
            <div className="metric-item">
              <strong>按需监控:</strong> 点击"开始监控"启动15分钟数据收集，节省代理流量
            </div>
            <div className="metric-item">
              <strong>数据点数:</strong> 3分钟内收集到的价格快照数量，每2秒收集一次
            </div>
            <div className="metric-item">
              <strong>稳定点差 (0.001%-0.01%):</strong> 最佳交易区间，流动性充足且成本可控
            </div>
            <div className="metric-item">
              <strong>低点差 (&lt;0.001%):</strong> 极低成本，但可能流动性不足
            </div>
            <div className="metric-item">
              <strong>零点差/负点差:</strong> 理论套利机会，但需警惕流动性陷阱
            </div>
            <div className="metric-item">
              <strong>高点差 (&gt;0.01%):</strong> 交易成本较高，频繁出现表示风险较大
            </div>
            <div className="metric-item">
              <strong>极高点差 (&gt;0.05%):</strong> 极高风险，可能导致重大损失
            </div>
            <div className="metric-item">
              <strong>动态零点差权重:</strong> 稳定市场的零点差权重高(最高2.0)，不稳定市场权重低(最低0.2)
            </div>
            <div className="metric-item">
              <strong>稳定性因子:</strong> 基于中等点差频率和低波动性计算，影响零点差的权重
            </div>
            <div className="metric-item">
              <strong>一致性奖励:</strong> 零点差频率&gt;20%且稳定点差频率&gt;30%时获得额外奖励
            </div>
          </div>
        </details>
      </div>
      
      {/* 数据显示区域 */}
      {!monitoringActive ? (
        <div className="monitoring-prompt">
          <div className="prompt-content">
            <h3>🎛️ 按需监控模式</h3>
            <p>为了节省代理流量，系统采用按需监控模式。</p>
            <p>点击上方"开始监控"按钮启动15分钟的数据收集。</p>
            <div className="prompt-benefits">
              <h4>💡 优势：</h4>
              <ul>
                <li>🔋 大幅节省代理IP流量消耗</li>
                <li>⚡ 按需使用，完全可控</li>
                <li>💰 降低运营成本</li>
                <li>🎯 专注于需要分析的时段</li>
              </ul>
            </div>
          </div>
        </div>
      ) : loading ? (
        <div className="loading">
          正在收集数据，请稍候...
          <div className="collection-info">
            <p>系统正在每秒收集所有PERP市场的点差数据</p>
            <p>需要积累足够的历史数据才能进行稳定性分析</p>
          </div>
        </div>
      ) : error ? (
        <div className="error">
          {error}
          <button 
            className="refresh-button" 
            onClick={handleRefresh}
            disabled={refreshing}
            style={{ position: 'static', margin: '15px auto', display: 'block' }}
          >
            {refreshing ? '重试中...' : '重试连接'}
          </button>
        </div>
      ) : analysis.length === 0 ? (
        <div className="loading">
          数据收集中，请等待至少1分钟以获得有效分析...
          <div className="collection-info">
            <p>系统正在每秒收集所有PERP市场的点差数据</p>
            <p>需要积累足够的历史数据才能进行稳定性分析</p>
          </div>
        </div>
      ) : (
        <div className="analysis-grid">
          {analysis.map((item) => (
            <AnalysisCard key={item.symbol} analysis={item} />
          ))}
        </div>
      )}
      
      {monitoringActive && (
        <button 
          className="refresh-button" 
          onClick={handleRefresh}
          disabled={refreshing}
        >
          {refreshing ? '刷新中...' : '刷新数据'}
        </button>
      )}
    </div>
  );
}