export interface Market {
  symbol: string;
  base_currency: string;
  quote_currency: string;
  asset_kind: string;
}

export interface BBO {
  market: string;
  bid: string;
  bid_size: string;
  ask: string;
  ask_size: string;
  last_updated_at: number;
}

export interface MarketSpread {
  symbol: string;
  bid_price: number;
  ask_price: number;
  spread: number;
  spread_percent: number;
  bid_size: string;
  ask_size: string;
  timestamp: number;
}

export interface MarketAnalysis {
  symbol: string;
  totalPoints: number;
  avgSpread: number;
  minSpread: number;
  maxSpread: number;
  spreadStdDev: number; // 新增：点差标准差
  zeroSpreadFreq: number;
  negativeSpreadFreq: number;
  lowSpreadFreq: number;
  mediumSpreadFreq: number; // 新增：中等点差频率
  highSpreadFreq: number;
  veryHighSpreadFreq: number; // 新增：极高点差频率
  stabilityScore: number;
  scoreBreakdown: { // 新增：评分详情
    stabilityBonus: string;
    lowSpreadBonus: string;
    zeroSpreadBonus: string;
    negativeSpreadBonus: string;
    consistencyBonus: string;
    highSpreadPenalty: string;
    veryHighSpreadPenalty: string;
    volatilityPenalty: string;
    avgSpreadPenalty: string;
    stabilityFactor: string;
  };
  lastUpdate: number;
}