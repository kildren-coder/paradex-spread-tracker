import { NextResponse } from 'next/server';
import { Market } from '@/app/types';

export async function GET() {
  try {
    const response = await fetch('https://api.prod.paradex.trade/v1/markets', {
      headers: {
        'Accept': 'application/json',
      },
      cache: 'no-store', // 禁用缓存
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const data = await response.json();
    
    // 只返回perp市场
    const perpMarkets = data.results.filter((market: any) => 
      market.asset_kind === 'PERP'
    );

    return NextResponse.json({ results: perpMarkets }, {
      headers: {
        'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
        'Pragma': 'no-cache',
        'Expires': '0',
      },
    });
  } catch (error) {
    console.error('Error fetching markets:', error);
    return NextResponse.json(
      { error: 'Failed to fetch markets' },
      { status: 500 }
    );
  }
}