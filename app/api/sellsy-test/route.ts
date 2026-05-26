import { NextResponse } from 'next/server';
import { getSellsyToken } from '@/lib/sellsy';

export async function GET() {
  try {
    const token = await getSellsyToken();

    const res1 = await fetch(
      'https://api.sellsy.com/v2/companies/search?limit=5',
      {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          filters: {
            type: 'prospect',
            is_archived: false,
          },
          search: 'test',
        }),
      }
    );
    const data1 = await res1.json();

    return NextResponse.json({
      status: res1.status,
      prospects: data1?.data?.map((p: any) => ({ id: p.id, name: p.name })),
    });

  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
