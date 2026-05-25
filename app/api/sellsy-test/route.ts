import { NextResponse } from 'next/server';
import { getSellsyToken } from '@/lib/sellsy';

export async function GET() {
  try {
    const token = await getSellsyToken();

    const res = await fetch(
      'https://api.sellsy.com/v2/companies/search?limit=1&embed[]=cf.32239&embed[]=cf.264244&embed[]=cf.264245&embed[]=invoicing_address',
      {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ filters: { type: 'prospect', is_archived: false } }),
      }
    );
    const data = await res.json();
    return NextResponse.json({ status: res.status, prospect: data?.data?.[0] });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}