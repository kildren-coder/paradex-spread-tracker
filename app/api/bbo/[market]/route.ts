import { NextResponse } from 'next/server';

export async function GET(
  request: Request,
  { params }: { params: { market: string } }
) {
  try {
    const market = params.market;
    const response = await fetch(
      `https://api.prod.paradex.trade/v1/bbo/${market}/interactive`,
      {
        headers: {
          'Accept': 'application/json',
        },
      }
    );

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const data = await response.json();
    return NextResponse.json(data);
  } catch (error) {
    console.error(`Error fetching BBO for ${params.market}:`, error);
    return NextResponse.json(
      { error: 'Failed to fetch BBO data' },
      { status: 500 }
    );
  }
}