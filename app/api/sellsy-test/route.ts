import { NextResponse } from 'next/server';
import { getSellsyToken } from '@/lib/sellsy';

export async function GET() {
  const token = await getSellsyToken();

  const res = await fetch(
    'https://api.sellsy.com/v2/companies/search?limit=50',
    {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ filters: { type: 'prospect', is_archived: false } }),
    }
  );

  const data = await res.json();
  const prospects = data?.data ?? [];

  const sectors = [...new Set(
    prospects.map((p: any) => p.business_segment).filter(Boolean)
  )].sort();

  return NextResponse.json({
    total: prospects.length,
    distinct_sectors: sectors,
    null_count: prospects.filter((p: any) => !p.business_segment).length,
  });
}
