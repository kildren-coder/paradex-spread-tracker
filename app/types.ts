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