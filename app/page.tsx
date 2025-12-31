'use client';

import { useState, useEffect, useCallback } from 'react';
import MarketCard from './components/MarketCard';
import { BBO, MarketSpread } from './types';

export default function Home() {
  const [markets, setMarkets] = useState<MarketSpread[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [refreshInterval, setRefreshInterval] = useState(5000); // 默认5秒

  const fetchMarketData = useCallback(async () => {
    try {
      setError(null);
      
      // 获取所有perp市场
      const marketsResponse = await fetch('/api/markets');
      if (!marketsResponse.ok) {
        throw new Error('Failed to fetch markets');
      }
      const marketsData = await marketsResponse.json();
      
      // 为每个市场获取BBO数据 - 分批请求避免过载
      const marketSpreads: MarketSpread[] = [];
      const batchSize = 5; // 每批处理5个市场
      
      for (let i = 0; i < marketsData.results.length; i += batchSize) {
        const batch = marketsData.results.slice(i, i + batchSize);
        
        const batchPromises = batch.map(async (market: any) => {
          try {
            const bboResponse = await fetch(`/api/bbo/${market.symbol}`);
            if (bboResponse.ok) {
              const bboData: BBO = await bboResponse.json();
              
              const bidPrice = parseFloat(bboData.bid);
              const askPrice = parseFloat(bboData.ask);
              const spread = askPrice - bidPrice;
              const spreadPercent = (spread / bidPrice) * 100;
              
              return {
                symbol: market.symbol,
                bid_price: bidPrice,
                ask_price: askPrice,
                spread,
                spread_percent: spreadPercent,
                bid_size: bboData.bid_size,
                ask_size: bboData.ask_size,
                timestamp: bboData.last_updated_at,
              };
            }
          } catch (error) {
            console.error(`Error fetching BBO for ${market.symbol}:`, error);
          }
          return null;
        });
        
        const batchResults = await Promise.all(batchPromises);
        marketSpreads.push(...batchResults.filter(result => result !== null));
        
        // 批次间短暂延迟，避免过载
        if (i + batchSize < marketsData.results.length) {
          await new Promise(resolve => setTimeout(resolve, 100));
        }
      }
      
      // 按点差百分比排序（从小到大）
      marketSpreads.sort((a, b) => a.spread_percent - b.spread_percent);
      
      setMarkets(marketSpreads);
    } catch (error) {
      console.error('Error fetching market data:', error);
      setError('获取市场数据失败，请稍后重试');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  const handleRefresh = () => {
    setRefreshing(true);
    fetchMarketData();
  };

  useEffect(() => {
    fetchMarketData();
    
    // 使用动态刷新间隔
    const interval = setInterval(fetchMarketData, refreshInterval);
    
    return () => clearInterval(interval);
  }, [fetchMarketData, refreshInterval]);

  if (loading) {
    return (
      <div className="container">
        <div className="header">
          <h1>Paradex 点差监控</h1>
          <p>实时监控永续合约市场点差</p>
        </div>
        <div className="loading">正在加载市场数据...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="container">
        <div className="header">
          <h1>Paradex 点差监控</h1>
          <p>实时监控永续合约市场点差</p>
        </div>
        <div className="error">{error}</div>
        <button 
          className="refresh-button" 
          onClick={handleRefresh}
          disabled={refreshing}
        >
          {refreshing ? '刷新中...' : '重新加载'}
        </button>
      </div>
    );
  }

  return (
    <div className="container">
      <div className="header">
        <h1>Paradex 点差监控</h1>
        <p>实时监控永续合约市场点差 • 按点差从小到大排序</p>
        <div className="refresh-controls">
          <label>刷新间隔: </label>
          <select 
            value={refreshInterval} 
            onChange={(e) => setRefreshInterval(Number(e.target.value))}
            className="interval-select"
          >
            <option value={1000}>1秒 (高频)</option>
            <option value={3000}>3秒 (快速)</option>
            <option value={5000}>5秒 (标准)</option>
            <option value={10000}>10秒 (节能)</option>
          </select>
        </div>
      </div>
      
      {markets.length === 0 ? (
        <div className="loading">暂无市场数据</div>
      ) : (
        <div className="market-grid">
          {markets.map((market) => (
            <MarketCard key={market.symbol} market={market} />
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