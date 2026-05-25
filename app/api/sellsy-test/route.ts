import { NextResponse } from 'next/server';
import { getSellsyToken } from '@/lib/sellsy';

export async function GET() {
  try {
    const token = await getSellsyToken();

    const res = await fetch(
      'https://api.sellsy.com/v2/companies/search?limit=1',
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          filters: { type: 'prospect', is_archived: false },
        }),
      }
    );

    // Récupérer tous les headers de la réponse Sellsy
    const allHeaders: Record<string, string> = {};
    res.headers.forEach((value, key) => {
      allHeaders[key] = value;
    });

    return NextResponse.json({
      status: res.status,
      quota: {
        bySecond: res.headers.get('X-Quota-Remaining-By-Second'),
        byMinute: res.headers.get('X-Quota-Remaining-By-Minute'),
        byDay:    res.headers.get('X-Quota-Remaining-By-Day'),
      },
      allHeaders,
    });

  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}