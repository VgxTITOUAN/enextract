import { NextResponse } from 'next/server';
import { getSellsyToken } from '@/lib/sellsy';

export async function GET() {
  try {
    const token = await getSellsyToken();

    // Tester plusieurs endpoints possibles
    const endpoints = [
      '/v2/prospects',
      '/v2/companies',
      '/v2/individuals',
      '/v2/contacts',
    ];

    const results: Record<string, any> = {};

    for (const ep of endpoints) {
      const res = await fetch(`https://api.sellsy.com${ep}?limit=1`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      results[ep] = {
        status: res.status,
        ok:     res.ok,
        data:   res.ok ? await res.json() : await res.text(),
      };
    }

    return NextResponse.json({ success: true, token_ok: true, results });

  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}