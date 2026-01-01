'use client';

import { useState, useEffect, useCallback } from 'react';
import AnalysisCard from './components/AnalysisCard';
import { MarketAnalysis } from './types';

// 数据收集服务器地址 - 生产环境需要更改
const DATA_SERVER_URL = process.env.NEXT_PUBLIC_DATA_SERVER_URL || 'http://localhost:3002';

export default function Home() {
  const [analysis, setAnalysis] = useState<MarketAnalysis[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [currentTime, setCurrentTime] = useState(new Date());
  const [serverStatus, setServerStatus] = useState<any>(null);

  const fetchAnalysisData = useCallback(async () => {
    try {
      setError(null);
      
      const response = await fetch(`${DATA_SERVER_URL}/api/analysis`, {
        cache: 'no-store',
      });
      
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      
      const result = await response.json();
      
      if (result.success) {
        setAnalysis(result.data);
        console.log(`Updated analysis for ${result.totalMarkets} markets at ${new Date().toLocaleTimeString()}`);
      } else {
        throw new Error(result.error || 'Failed to fetch analysis');
      }
      
    } catch (error) {
      console.error('Error fetching analysis data:', error);
      setError('无法连接到数据服务器，请确保后端服务正在运行');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  const fetchServerStatus = useCallback(async () => {
    try {
      const response = await fetch(`${DATA_SERVER_URL}/api/status`, {
        cache: 'no-store',
      });
      
      if (response.ok) {
        const status = await response.json();
        setServerStatus(status);
      }
    } catch (error) {
      console.error('Error fetching server status:', error);
    }
  }, []);

  const handleRefresh = () => {
    setRefreshing(true);
    fetchAnalysisData();
    fetchServerStatus();
  };

  useEffect(() => {
    fetchAnalysisData();
    fetchServerStatus();
    
    // 每10秒刷新分析数据
    const interval = setInterval(() => {
      fetchAnalysisData();
      fetchServerStatus();
    }, 10000);
    
    return () => clearInterval(interval);
  }, [fetchAnalysisData, fetchServerStatus]);

  // 实时时钟
  useEffect(() => {
    const clockInterval = setInterval(() => {
      setCurrentTime(new Date());
    }, 1000);
    
    return () => clearInterval(clockInterval);
  }, []);

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
        <p>基于3分钟滑动窗口的零点差/负点差频率分析 • 按稳定性评分排序</p>
        <div className="current-time">
          当前时间: {currentTime.toLocaleTimeString('zh-CN', { hour12: false })}
        </div>
        {serverStatus && (
          <div className="server-status">
            数据收集状态: {serverStatus.isCollecting ? '🟢 收集中' : '🔴 停止'} | 
            市场数: {serverStatus.markets} | 
            历史数据: {serverStatus.historySize} 个市场
            {serverStatus.useProxy && serverStatus.proxyStats && (
              <span> | 代理: {serverStatus.proxyStats.active}/{serverStatus.proxyStats.total} 可用</span>
            )}
          </div>
        )}
        <div className="metrics-explanation">
          <details>
            <summary>📊 指标说明</summary>
            <div className="explanation-content">
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
                <strong>一致性奖励:</strong> 零点差频率>20%且稳定点差频率>30%时获得额外奖励
              </div>
            </div>
          </details>
        </div>
      </div>
      
      {analysis.length === 0 ? (
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
      
      <button 
        className="refresh-button" 
        onClick={handleRefresh}
        disabled={refreshing}
      >
        {refreshing ? '刷新中...' : '刷新数据'}
      </button>
    </div>
  );
}