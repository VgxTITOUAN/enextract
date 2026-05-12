import { NextResponse } from 'next/server';
import { getSellsyToken } from '@/lib/sellsy';

export async function GET() {
  try {
    const token = await getSellsyToken();

    const res = await fetch(
      'https://api.sellsy.com/v2/companies/search?limit=2',
      {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          filters: { type: 'prospect', is_archived: false },
          embed: ['custom_fields', 'invoicing_address'],
        }),
      }
    );

    const data = await res.json();

    return NextResponse.json({
      status: res.status,
      data,
    });

  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
