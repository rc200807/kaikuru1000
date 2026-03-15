import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'

const SYMBOLS: Record<string, string> = {
  gold:      'GC=F',
  silver:    'SI=F',
  platinum:  'PL=F',
  palladium: 'PA=F',
}

const RANGE_CONFIG: Record<string, { range: string; interval: string }> = {
  '1W': { range: '5d',  interval: '1d'  },
  '1M': { range: '1mo', interval: '1d'  },
  '3M': { range: '3mo', interval: '1d'  },
  '6M': { range: '6mo', interval: '1d'  },
  '1Y': { range: '1y',  interval: '1d'  },
  '5Y': { range: '5y',  interval: '1wk' },
}

const TROY_OZ_TO_GRAM = 31.1035

export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(request.url)
  const metal = searchParams.get('metal') || 'gold'
  const period = searchParams.get('period') || '1M'

  const symbol = SYMBOLS[metal] || 'GC=F'
  const config = RANGE_CONFIG[period] || RANGE_CONFIG['1M']

  try {
    const [metalRes, fxRes] = await Promise.all([
      fetch(
        `https://query1.finance.yahoo.com/v8/finance/chart/${symbol}?range=${config.range}&interval=${config.interval}`,
        {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
            'Accept': 'application/json',
          },
          next: { revalidate: 3600 },
        }
      ),
      fetch(
        'https://query1.finance.yahoo.com/v8/finance/chart/USDJPY=X?range=1d&interval=1d',
        {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
            'Accept': 'application/json',
          },
          next: { revalidate: 3600 },
        }
      ),
    ])

    if (!metalRes.ok) {
      return NextResponse.json({ error: `Yahoo Finance returned ${metalRes.status}` }, { status: 502 })
    }

    const [metalData, fxData] = await Promise.all([
      metalRes.json(),
      fxRes.ok ? fxRes.json() : Promise.resolve(null),
    ])

    const result = metalData.chart?.result?.[0]
    if (!result) {
      return NextResponse.json({ error: 'データが取得できませんでした' }, { status: 502 })
    }

    const usdJpy: number = fxData?.chart?.result?.[0]?.meta?.regularMarketPrice ?? 150

    const timestamps: number[] = result.timestamp || []
    const closes: (number | null)[] = result.indicators?.quote?.[0]?.close || []

    const history = timestamps
      .map((ts, i) => {
        const priceUsd = closes[i]
        if (priceUsd == null) return null
        return {
          date: new Date(ts * 1000).toISOString().split('T')[0],
          priceJpy: Math.round((priceUsd / TROY_OZ_TO_GRAM) * usdJpy),
          priceUsd: Math.round(priceUsd * 100) / 100,
        }
      })
      .filter(Boolean)

    const currentPrice: number = result.meta?.regularMarketPrice ?? (closes.filter(Boolean).slice(-1)[0] ?? 0)
    const currentPriceJpy = Math.round((currentPrice / TROY_OZ_TO_GRAM) * usdJpy)
    const prevClose: number = result.meta?.chartPreviousClose ?? (closes.filter(Boolean)[0] ?? currentPrice)
    const prevCloseJpy = Math.round((prevClose / TROY_OZ_TO_GRAM) * usdJpy)
    const change = currentPriceJpy - prevCloseJpy
    const changePct = prevCloseJpy > 0 ? (change / prevCloseJpy) * 100 : 0

    return NextResponse.json({
      metal,
      period,
      currentPriceJpy,
      currentPriceUsd: Math.round(currentPrice * 100) / 100,
      usdJpy: Math.round(usdJpy * 100) / 100,
      change,
      changePct: Math.round(changePct * 100) / 100,
      history,
      updatedAt: new Date().toISOString(),
    })
  } catch (err) {
    console.error('market-prices error:', err)
    return NextResponse.json({ error: '相場データの取得に失敗しました' }, { status: 502 })
  }
}
