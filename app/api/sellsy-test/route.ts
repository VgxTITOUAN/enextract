import { NextResponse } from 'next/server';
import { getSellsyToken } from '@/lib/sellsy';

export async function GET() {
  try {
    const token = await getSellsyToken();

    // Récupérer un prospect avec son adresse en embed
    const res = await fetch(
      'https://api.sellsy.com/v2/companies/search?limit=1',
      {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          filters: { type: 'prospect', is_archived: false },
          // Essayer différents noms d'embed
          embed: ['invoicing_address'],
        }),
      }
    );

    const data = await res.json();

    return NextResponse.json({ status: res.status, data });

  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
