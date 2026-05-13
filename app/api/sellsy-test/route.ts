import { NextResponse } from 'next/server';
import { getSellsyToken } from '@/lib/sellsy';

export async function GET() {
  try {
    const token = await getSellsyToken();

    // Récupérer un prospect
    const res1 = await fetch(
      'https://api.sellsy.com/v2/companies/search?limit=1',
      {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ filters: { type: 'prospect', is_archived: false } }),
      }
    );
    const data1 = await res1.json();
    const prospect = data1?.data?.[0];

    // Essayer GET /v2/companies/{id} avec field=invoicing_address
    const res2 = await fetch(
      `https://api.sellsy.com/v2/companies/${prospect.id}?field[]=invoicing_address`,
      { headers: { Authorization: `Bearer ${token}` } }
    );

    // Essayer aussi /v2/companies/{id}/addresses
    const res3 = await fetch(
      `https://api.sellsy.com/v2/companies/${prospect.id}/addresses`,
      { headers: { Authorization: `Bearer ${token}` } }
    );

    return NextResponse.json({
      prospect_id: prospect.id,
      address_id: prospect.invoicing_address_id,
      field_test: { status: res2.status, data: await res2.json() },
      addresses_test: { status: res3.status, data: res3.ok ? await res3.json() : await res3.text() },
    });

  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
