'use client';

import { MarketSpread } from '../types';

interface MarketCardProps {
  market: MarketSpread;
}

export default function MarketCard({ market }: MarketCardProps) {
  const getSpreadClass = (spreadPercent: number) => {
    if (spreadPercent < 0.1) return 'spread-low';
    if (spreadPercent < 0.5) return 'spread-medium';
    return 'spread-high';
  };

  const formatPrice = (price: number) => {
    return price.toFixed(4);
  };

  const formatPercent = (percent: number) => {
    return `${percent.toFixed(3)}%`;
  };

  return (
    <div className="market-card">
      <div className="market-header">
        <div className="market-symbol">{market.symbol}</div>
        <div className={`spread-badge ${getSpreadClass(market.spread_percent)}`}>
          {formatPercent(market.spread_percent)}
        </div>
      </div>
      
      <div className="market-details">
        <div className="detail-item">
          <div className="detail-label">买价 (Bid)</div>
          <div className="detail-value bid-price">${formatPrice(market.bid_price)}</div>
        </div>
        
        <div className="detail-item">
          <div className="detail-label">卖价 (Ask)</div>
          <div className="detail-value ask-price">${formatPrice(market.ask_price)}</div>
        </div>
        
        <div className="detail-item">
          <div className="detail-label">点差</div>
          <div className="detail-value spread-value">${formatPrice(market.spread)}</div>
        </div>
        
        <div className="detail-item">
          <div className="detail-label">点差百分比</div>
          <div className="detail-value spread-percent">{formatPercent(market.spread_percent)}</div>
        </div>
      </div>
    </div>
  );
}